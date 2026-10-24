// Demo data for Reporting & Analytics (the user, 2026-10-25).
//
// Writes about 60 days of practice orders, with payments, deliveries and
// stock movements, so the Sales, Products, Inventory and Peak screens can
// be shown working. Every row is marked data_source = 'ASSUMED': the reports
// show them only with the "Demo data" switch on, they never count as real
// money, and the forecast never trains on them as real sales
// (RULES-PLANS/ANALYTICS_PLAN.md A1–A2).
//
// - Orders: about 12 a weekday and 18 a weekend day, busiest 6–9 AM and
//   4–6 PM. About 55% walk-in at the counter, 30% online pickup, 15%
//   delivery (₱50 fee, GCash). Each is paid in full and COMPLETED.
// - Stock: each sale's ORDER_PLACED rows, plus that day's bake (5:00 AM
//   top-up for soft breads, restock for hard breads) and a few rejects. A
//   day's movements net to zero per product, so the shelf figures and the
//   real stock-out history are left exactly as they are.
//
// Deterministic (fixed seed). Every row carries the marker below, so a
// re-run replaces only what this script wrote.
//
// Usage (the database reachable; the API server need not run):
//   node scripts/generate-demo-reports.mjs            generate (replaces)
//   node scripts/generate-demo-reports.mjs --clear    remove it
//   add --railway to either for the live database (RAILWAY_DATABASE_URL in
//   .env, never printed)
import 'dotenv/config'
import pg from 'pg'

const onRailway = process.argv.includes('--railway')
if (onRailway && !process.env.RAILWAY_DATABASE_URL) throw new Error('RAILWAY_DATABASE_URL is not set in .env.')
const pool = onRailway
  ? new pg.Pool({ connectionString: process.env.RAILWAY_DATABASE_URL, ssl: { rejectUnauthorized: false } })
  : (await import('../server/db.js')).pool
if (onRailway) console.log('Writing to the Railway database.')

const MARKER = '[demo-reports]'
const DAYS = 60
const DELIVERY_FEE = 50

// A small seeded random generator (mulberry32), so every run is the same.
let seed = 20261025
const random = () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const pick = (items) => items[Math.floor(random() * items.length)]
const between = (low, high) => low + Math.floor(random() * (high - low + 1))
// The hour an order is placed: mornings and late afternoons are busiest.
const hourWeights = { 5: 3, 6: 8, 7: 9, 8: 7, 9: 4, 10: 3, 11: 4, 12: 4, 13: 3, 14: 3, 15: 4, 16: 7, 17: 7, 18: 5, 19: 3, 20: 2, 21: 1 }
const pickHour = () => {
  const total = Object.values(hourWeights).reduce((sum, weight) => sum + weight, 0)
  let roll = random() * total
  for (const [hour, weight] of Object.entries(hourWeights)) {
    roll -= weight
    if (roll < 0) return Number(hour)
  }
  return 8
}

async function clear(client) {
  const orders = (await client.query('SELECT order_id FROM orders WHERE instructions = $1', [MARKER])).rows.map((row) => row.order_id)
  await client.query(`DELETE FROM inventory_movements WHERE data_source = 'ASSUMED' AND (order_id = ANY($1::bigint[]) OR note = $2)`, [orders, MARKER])
  await client.query('DELETE FROM deliveries WHERE order_id = ANY($1::bigint[])', [orders])
  await client.query('DELETE FROM payments WHERE order_id = ANY($1::bigint[])', [orders])
  await client.query('DELETE FROM order_status_history WHERE order_id = ANY($1::bigint[])', [orders])
  await client.query('DELETE FROM order_details WHERE order_id = ANY($1::bigint[])', [orders])
  await client.query('DELETE FROM orders WHERE order_id = ANY($1::bigint[])', [orders])
  return orders.length
}

async function main() {
  const client = await pool.connect()
  try {
    if (process.argv.includes('--clear')) {
      await client.query('BEGIN')
      const removed = await clear(client)
      await client.query('COMMIT')
      console.log(`Removed ${removed} demo orders and their payments, deliveries and stock movements.`)
      return
    }

    const products = (await client.query(
      `SELECT p.product_id, p.price::float AS price, p.stock_type, i.inventory_id
         FROM products p JOIN inventory i ON i.product_id = p.product_id
        WHERE p.availability_status ORDER BY p.product_id`,
    )).rows
    if (products.length === 0) throw new Error('No products on sale — nothing to sell.')
    // Cheap bread sells in numbers; a ₱400 tin sells one at a time.
    const weighted = products.flatMap((product) => Array(Math.max(1, Math.round(60 / Math.sqrt(product.price)))).fill(product))

    const cashier = (await client.query(
      `SELECT c.cashier_id, u.user_id FROM cashiers c JOIN users u ON u.user_id = c.user_id WHERE u.is_active ORDER BY c.cashier_id LIMIT 1`,
    )).rows[0] ?? null
    const customers = (await client.query(
      `SELECT c.customer_id,
              (SELECT a.address_id FROM customer_addresses a WHERE a.customer_id = c.customer_id AND a.is_active AND lower(trim(a.municipality)) = 'lucban' ORDER BY a.is_default DESC, a.address_id LIMIT 1) AS address_id
         FROM customers c JOIN users u ON u.user_id = c.user_id WHERE u.is_active ORDER BY c.customer_id`,
    )).rows
    const deliverable = customers.filter((customer) => customer.address_id)
    const yesterday = (await client.query(`SELECT ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date - 1)::text AS d`)).rows[0].d

    await client.query('BEGIN')
    const removed = await clear(client)
    let orderCount = 0
    let salesTotal = 0

    for (let back = DAYS - 1; back >= 0; back -= 1) {
      const day = new Date(`${yesterday}T00:00:00Z`)
      day.setUTCDate(day.getUTCDate() - back)
      const iso = day.toISOString().slice(0, 10)
      const weekday = day.getUTCDay()
      const orders = (weekday === 0 || weekday === 6 ? 18 : 12) + between(-3, 3)
      const soldToday = new Map()

      for (let index = 0; index < orders; index += 1) {
        const roll = random()
        let kind = roll < 0.55 ? 'WALK_IN' : roll < 0.85 ? 'PICKUP' : 'DELIVERY'
        if (kind === 'WALK_IN' && !cashier) kind = 'PICKUP'
        if (kind !== 'WALK_IN' && customers.length === 0) kind = 'WALK_IN'
        if (kind === 'DELIVERY' && deliverable.length === 0) kind = 'PICKUP'
        const customer = kind === 'DELIVERY' ? pick(deliverable) : kind === 'PICKUP' ? pick(customers) : null
        const method = kind === 'DELIVERY' ? 'GCASH' : random() < (kind === 'WALK_IN' ? 0.7 : 0.5) ? 'CASH' : 'GCASH'
        const fee = kind === 'DELIVERY' ? DELIVERY_FEE : 0
        const placedAt = `${iso} ${String(pickHour()).padStart(2, '0')}:${String(between(0, 59)).padStart(2, '0')}:00+08`

        const lines = new Map()
        for (let item = between(1, 3); item > 0; item -= 1) {
          const product = pick(weighted)
          lines.set(product.product_id, { product, quantity: (lines.get(product.product_id)?.quantity ?? 0) + between(1, product.price <= 20 ? 6 : 2) })
        }
        const goods = [...lines.values()].reduce((sum, line) => sum + line.quantity * line.product.price, 0)
        const total = Math.round((goods + fee) * 100) / 100

        const order = await client.query(
          `INSERT INTO orders (customer_id, processed_by, address_id, order_date, status, order_type, total_amount, data_source, payment_mode, delivery_fee, instructions)
           VALUES ($1, $2, $3, $4, 'COMPLETED', $5, $6, 'ASSUMED', $7, $8, $9) RETURNING order_id`,
          [customer?.customer_id ?? null, kind === 'WALK_IN' ? cashier.cashier_id : null, kind === 'DELIVERY' ? customer.address_id : null,
            placedAt, kind === 'DELIVERY' ? 'DELIVERY' : 'PICKUP', total, method, fee, MARKER],
        )
        const orderId = order.rows[0].order_id
        const list = [...lines.values()]
        await client.query(
          `INSERT INTO order_details (order_id, product_id, quantity, unit_price)
           SELECT $1, * FROM unnest($2::bigint[], $3::int[], $4::numeric[])`,
          [orderId, list.map((line) => line.product.product_id), list.map((line) => line.quantity), list.map((line) => line.product.price)],
        )
        await client.query(
          `INSERT INTO inventory_movements (inventory_id, order_id, changed_by, quantity_change, reason, data_source, created_at)
           SELECT inv, $1, $2, -qty, 'ORDER_PLACED', 'ASSUMED', $3 FROM unnest($4::bigint[], $5::int[]) AS t(inv, qty)`,
          [orderId, cashier?.user_id ?? null, placedAt, list.map((line) => line.product.inventory_id), list.map((line) => line.quantity)],
        )
        const online = method === 'GCASH' && kind !== 'WALK_IN'
        await client.query(
          `INSERT INTO payments (order_id, recorded_by, payment_method, amount, status, gateway_reference, payment_date)
           VALUES ($1, $2, $3, $4, 'PAID', $5, $6::timestamptz + INTERVAL '3 minutes')`,
          [orderId, online ? null : cashier?.user_id ?? null, method, total, method === 'GCASH' ? `DEMO-${orderId}` : null, placedAt],
        )
        if (kind === 'DELIVERY') {
          await client.query(
            `INSERT INTO deliveries (order_id, status, assigned_at, delivered_at) VALUES ($1, 'DELIVERED', $2::timestamptz + INTERVAL '20 minutes', $2::timestamptz + INTERVAL '50 minutes')`,
            [orderId, placedAt],
          )
        }
        for (const line of list) soldToday.set(line.product.inventory_id, { product: line.product, quantity: (soldToday.get(line.product.inventory_id)?.quantity ?? 0) + line.quantity })
        orderCount += 1
        salesTotal += goods
      }

      // The day's bake covers what sold plus a few rejects, so each
      // product's movements for the day net to zero.
      for (const { product, quantity } of soldToday.values()) {
        const rejects = random() < 0.15 ? between(1, 3) : 0
        await client.query(
          `INSERT INTO inventory_movements (inventory_id, changed_by, quantity_change, reason, data_source, created_at, note)
           VALUES ($1, $2, $3, $4, 'ASSUMED', $5, $6)`,
          [product.inventory_id, product.stock_type === 'SOFT' ? null : cashier?.user_id ?? null, quantity + rejects, product.stock_type === 'SOFT' ? 'DAILY_STOCK' : 'RESTOCK', `${iso} 05:00:00+08`, MARKER],
        )
        if (rejects) {
          await client.query(
            `INSERT INTO inventory_movements (inventory_id, changed_by, quantity_change, reason, data_source, created_at, note)
             VALUES ($1, $2, $3, 'REJECT', 'ASSUMED', $4, $5)`,
            [product.inventory_id, cashier?.user_id ?? null, -rejects, `${iso} 21:30:00+08`, MARKER],
          )
        }
      }
    }
    await client.query('COMMIT')
    console.log(`Replaced ${removed} demo orders with ${orderCount}, over ${DAYS} days to ${yesterday} (about ₱${Math.round(salesTotal).toLocaleString()} in demo sales).`)
    console.log('Marked ASSUMED: shown in Reporting & Analytics only with the "Demo data" switch on.')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

await main()
