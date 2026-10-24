// Soft breads and hard breads (RULES-PLANS/DAILY_STOCK_PLAN.md, the client
// 2026-10-23).
//
// - The 5:00 AM top-up: every soft bread with a standard stock is brought
//   back up to it — what is left from yesterday is sold first and only the
//   difference is baked (decision A, "top up"). Once per Manila day:
//   daily_stock_resets holds the day, so a restart or a second server
//   never tops up twice.
// - The production list for a day: what to bake, per product.
import { pool } from '../db.js'
import { syncStockAlert } from './inventory.js'

export const openingTime = '05:00'
// A hard bread first set to Hard gets these levels until the admin
// changes them (decision B).
export const hardDefaults = { minStockLevel: 200, targetStock: 600 }

const manilaClock = (now) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(now).map((part) => [part.type, part.value]))
  return { day: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` }
}

// Runs the top-up if it is past opening time and today's has not run.
// Returns how many products were topped up, or null when nothing ran.
// `onlyProductIds` limits it to those products — for the tests, which run
// against the developer's database and must not top up real products.
export async function runDailyStockReset(now = new Date(), { onlyProductIds = null } = {}) {
  const { day, time } = manilaClock(now)
  if (time < openingTime) return null
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const claimed = await client.query('INSERT INTO daily_stock_resets (day) VALUES ($1) ON CONFLICT (day) DO NOTHING RETURNING day', [day])
    if (claimed.rowCount === 0) {
      await client.query('ROLLBACK')
      return null
    }
    // Locked in product_id order, the order every stock change uses.
    // A soft-bread event (set by the admin to soft or both) raises today's
    // standard by its multiplier; by default there is none.
    const softFactor = (await boostsFor(day)).soft.factor
    const soft = await client.query(
      `SELECT i.inventory_id, i.product_id, i.stock_quantity, ROUND(i.standard_stock * $2::numeric)::int AS standard_stock, i.min_stock_level
         FROM inventory i JOIN products p ON p.product_id = i.product_id
        WHERE p.stock_type = 'SOFT' AND ROUND(i.standard_stock * $2::numeric) > i.stock_quantity
          AND ($1::bigint[] IS NULL OR i.product_id = ANY($1::bigint[]))
        ORDER BY i.product_id
        FOR UPDATE OF i`,
      [onlyProductIds, softFactor],
    )
    for (const row of soft.rows) {
      const bake = row.standard_stock - row.stock_quantity
      await client.query('UPDATE inventory SET stock_quantity = $2, last_updated = CURRENT_TIMESTAMP WHERE inventory_id = $1', [row.inventory_id, row.standard_stock])
      await client.query(
        `INSERT INTO inventory_movements (inventory_id, changed_by, quantity_change, reason, note) VALUES ($1, NULL, $2, 'DAILY_STOCK', $3)`,
        [row.inventory_id, bake, `5:00 AM top-up to the standard ${row.standard_stock} (${row.stock_quantity} left from before)`],
      )
      await syncStockAlert(client, { inventoryId: row.inventory_id, stockQuantity: row.standard_stock, minStockLevel: row.min_stock_level })
    }
    await client.query('UPDATE daily_stock_resets SET products_topped_up = $2 WHERE day = $1', [day, soft.rowCount])
    await client.query('COMMIT')
    return soft.rowCount
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

// Events and weekends (migration 036, the client 2026-10-24): how much more
// to make on `day`, for each bread type, and why.
//   HARD  the biggest of: an event's multiplier from its lead days (default
//         a week) through its last day, and x2 for the weekend from
//         Thursday to Sunday — hard breads keep, so they are built up ahead.
//   SOFT  an event's multiplier on the event days themselves, only for an
//         event the admin set to soft or both — soft breads keep ~3 days and
//         barely sell more on these days, so by default nothing changes.
export const weekendBoost = { factor: 2, from: 4 } // Thursday (0 = Sunday)
const weekendDays = new Set([4, 5, 6, 0])

export async function boostsFor(day) {
  const events = (await pool.query(
    `SELECT name, multiplier::float AS multiplier, applies_to, starts_on, ends_on,
            ($1::date BETWEEN starts_on AND ends_on) AS during,
            ($1::date BETWEEN starts_on - lead_days AND ends_on) AS ahead
       FROM events
      WHERE $1::date BETWEEN starts_on - lead_days AND ends_on
      ORDER BY multiplier DESC, starts_on`,
    [day],
  )).rows
  let hard = { factor: 1, reason: null }
  let soft = { factor: 1, reason: null }
  const dow = new Date(`${day}T12:00:00Z`).getUTCDay()
  if (weekendDays.has(dow)) hard = { factor: weekendBoost.factor, reason: `Weekend x${weekendBoost.factor}` }
  for (const event of events) {
    const label = `${event.name} x${Number(event.multiplier)}`
    if (event.applies_to !== 'SOFT' && event.ahead && event.multiplier > hard.factor) hard = { factor: event.multiplier, reason: label }
    if (event.applies_to !== 'HARD' && event.during && event.multiplier > soft.factor) soft = { factor: event.multiplier, reason: label }
  }
  return { hard, soft, events: events.map((event) => ({ name: event.name, multiplier: Number(event.multiplier), appliesTo: event.applies_to, startsOn: event.starts_on, endsOn: event.ends_on })) }
}

// What to bake on `day` ('YYYY-MM-DD', a Manila day), per product.
//   SOFT  standard − what is on the shelf now (the top-up, if nothing more
//         sells today) + pieces in advanced orders picked up that day,
//         which are baked outside the shelf stock.
//   HARD  at or under the minimum: target − stock. Otherwise not needed.
//         (Hard-bread advanced orders already came off the shelf.)
export async function productionFor(day) {
  const boosts = await boostsFor(day)
  const rows = await pool.query(
    `SELECT p.product_id, p.product_name, p.variant, p.stock_type, c.category_name,
            i.stock_quantity, i.standard_stock, i.min_stock_level, i.target_stock,
            COALESCE((
              SELECT SUM(od.quantity) FROM order_details od JOIN orders o ON o.order_id = od.order_id
               WHERE od.product_id = p.product_id AND o.is_reservation AND o.status NOT IN ('CANCELLED', 'AWAITING_PAYMENT')
                 AND (o.requested_fulfillment_time AT TIME ZONE 'Asia/Manila')::date = $1::date
            ), 0)::int AS advanced,
            (SELECT f.predicted FROM forecasts f WHERE f.product_id = p.product_id AND f.forecast_date = $1::date ORDER BY f.run_id DESC LIMIT 1) AS forecast
       FROM products p
       JOIN inventory i ON i.product_id = p.product_id
       JOIN categories c ON c.category_id = p.category_id
      WHERE p.availability_status
      ORDER BY p.stock_type DESC, c.category_name, p.product_name`,
    [day],
  )
  return rows.rows.map((row) => {
    const base = {
      productId: row.product_id,
      name: row.product_name,
      variant: row.variant,
      categoryName: row.category_name,
      stockType: row.stock_type,
      onHand: row.stock_quantity,
      forecast: row.forecast == null ? null : Math.round(Number(row.forecast)),
    }
    if (row.stock_type === 'SOFT') {
      const standard = Math.round(row.standard_stock * boosts.soft.factor)
      const topUp = Math.max(standard - row.stock_quantity, 0)
      return { ...base, standardStock: standard, boost: boosts.soft.reason, advanced: row.advanced, topUp, toBake: topUp + row.advanced, needed: topUp + row.advanced > 0 }
    }
    // Boosted (an event ahead, or the weekend): build up to stop level x
    // factor, whatever the minimum. Otherwise: make it at the minimum.
    const boosted = boosts.hard.factor > 1 && row.target_stock > 0
    const target = boosted ? Math.round(row.target_stock * boosts.hard.factor) : row.target_stock
    const needed = row.target_stock > 0 && (boosted ? row.stock_quantity < target : row.stock_quantity <= row.min_stock_level)
    return { ...base, minStockLevel: row.min_stock_level, targetStock: target, boost: boosted ? boosts.hard.reason : null, toBake: needed ? Math.max(target - row.stock_quantity, 0) : 0, needed }
  })
}

// The production list with the reasons the day is boosted.
export async function productionPlan(day) {
  const [items, boosts] = await Promise.all([productionFor(day), boostsFor(day)])
  return { items, boosts }
}
