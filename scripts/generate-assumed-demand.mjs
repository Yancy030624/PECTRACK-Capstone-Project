// Generates a year of ASSUMED daily demand for the forecaster — Phase 9B,
// RULES-PLANS/PHASE9B_PREDICTIVE_ANALYSIS_PLAN.md, Decision 2.
//
// Why this exists: the client has not supplied production or sales logs,
// and the system holds two days of real sales. The adviser approved
// demonstrating the forecasting on assumed history, stated as a
// limitation. This script is that assumption, made explicit.
//
// What it writes: assumed_daily_demand, and nothing else. Not orders, not
// payments, not stock — so no report, ledger or revenue figure ever sees
// a generated number. Only the forecaster reads this table.
//
// Deterministic: a fixed seed, so the same products produce the same
// history every run, and the figures quoted in the thesis are
// reproducible.
//
// EVERY ASSUMPTION IS A NAMED CONSTANT BELOW, and each one has a matching
// row in the plan's assumptions table. If a number changes here, change
// GENERATOR_VERSION too, so a forecast can be traced to the history that
// made it.
//
// Usage (database reachable; the API server need not run):
//   node scripts/generate-assumed-demand.mjs           generate (replaces)
//   node scripts/generate-assumed-demand.mjs --clear   remove it all
import { pool } from '../server/db.js'
import { addDays, dayOfWeek, holidayKind, isPayday } from '../server/lib/forecasting.js'

const GENERATOR_VERSION = 'v1-2026-09-25'
const SEED = 20260925
const HISTORY_DAYS = 365

// ---- The assumptions ------------------------------------------------------

// Base demand falls with price: a ₱5 pandesal sells in dozens, an ₱850
// tin of broas a couple a day. BASE_SCALE / sqrt(price) gives ~27/day at
// ₱5, ~11 at ₱30, ~4 at ₱270 and ~2 at ₱850.
const BASE_SCALE = 60

// Relative popularity nudges that base up or down by at most 30%, ranked
// from the demo seed's orders. Those orders are ASSUMED too; they are used
// only to keep one cheap product from looking exactly like another.
const POPULARITY_SPREAD = 0.3

// Day of week: weekends busier, Monday quieter. 0 = Sunday. Soft breads.
const WEEKDAY_MULTIPLIER = [1.25, 0.9, 1.0, 1.0, 1.0, 1.0, 1.25]
// Hard breads (the client, 2026-10-24): about twice as much sells on
// Saturday and Sunday — tourists buying pasalubong — and on an event day
// (Holy Week, Pahiyas, Christmas, New Year, long weekends, from the events
// calendar, migration 036) about four times. Soft breads keep ~3 days and
// barely move on those days.
const HARD_WEEKDAY_MULTIPLIER = [2, 0.9, 1.0, 1.0, 1.0, 1.0, 2]
const HARD_EVENT_MULTIPLIER_DEFAULT = 4

// Semi-monthly payday (the 15th and the last day, and the day after each).
const PAYDAY_MULTIPLIER = 1.15

// Christmas Eve and New Year's Eve shopping; the holidays themselves quieter.
const HOLIDAY_EVE_MULTIPLIER = 1.4
const HOLIDAY_MULTIPLIER = 0.7

// Modest growth across the year.
const ANNUAL_GROWTH = 0.03

// Occasional sell-outs, so the forecaster's handling of censored days is
// exercised. On such a day only part of the demand could be served.
const STOCKOUT_RATE = 0.02
const STOCKOUT_SERVED_MIN = 0.4
const STOCKOUT_SERVED_MAX = 0.8

// ---- Deterministic randomness ---------------------------------------------
// mulberry32: a small, well-known seeded generator. Math.random would make
// every run's history — and every figure in the thesis — different.
function mulberry32(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Daily counts of a product are whole numbers that vary around an
// expected value — the textbook case for a Poisson draw. Knuth's method
// for small means; a rounded normal approximation for large ones, where
// Knuth gets slow and the two agree.
function poisson(lambda, random) {
  if (lambda <= 0) return 0
  if (lambda < 30) {
    const limit = Math.exp(-lambda)
    let count = 0
    let product = random()
    while (product > limit) {
      count += 1
      product *= random()
    }
    return count
  }
  const u1 = Math.max(random(), 1e-12)
  const u2 = random()
  const normal = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
  return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * normal))
}

// ---- Generation -----------------------------------------------------------
async function main() {
  if (process.argv.includes('--clear')) {
    const removed = await pool.query('DELETE FROM assumed_daily_demand')
    console.log(`Removed ${removed.rowCount} assumed demand rows.`)
    await pool.end()
    return
  }

  // The generated year ends YESTERDAY in Manila. Today is not over, and
  // the forecast starts from today.
  const yesterday = (await pool.query(`SELECT ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date - 1)::text AS d`)).rows[0].d
  const firstDay = addDays(yesterday, -(HISTORY_DAYS - 1))

  // Event days from the calendar, with each one's multiplier.
  const eventMultiplier = new Map((await pool.query(
    `SELECT to_char(day, 'YYYY-MM-DD') AS day, MAX(multiplier)::float AS multiplier
       FROM events, generate_series(starts_on, ends_on, INTERVAL '1 day') AS day
      WHERE applies_to <> 'SOFT'
      GROUP BY day`,
  ).catch(() => ({ rows: [] }))).rows.map((row) => [row.day, row.multiplier]))

  const products = (await pool.query(
    `SELECT p.product_id, p.product_name, p.variant, p.price, p.stock_type,
            COALESCE((SELECT SUM(s.units_sold) FROM analytics_daily_sales s
                       WHERE s.product_id = p.product_id AND s.data_source = 'ASSUMED'), 0)::int AS seed_units
       FROM products p
      WHERE p.availability_status = TRUE
      ORDER BY p.product_id`,
  )).rows
  if (products.length === 0) {
    console.log('No available products — nothing to generate for.')
    await pool.end()
    return
  }

  // Popularity rank from the demo seed, mapped to [1 − spread, 1 + spread].
  const ranked = [...products].sort((a, b) => a.seed_units - b.seed_units)
  const popularity = new Map(ranked.map((product, index) => [
    product.product_id,
    1 - POPULARITY_SPREAD + (2 * POPULARITY_SPREAD * index) / Math.max(1, ranked.length - 1),
  ]))

  const random = mulberry32(SEED)
  const rows = { dates: [], productIds: [], units: [], stockouts: [] }

  for (const product of products) {
    const base = (BASE_SCALE / Math.sqrt(Math.max(Number(product.price), 1))) * popularity.get(product.product_id)
    for (let dayIndex = 0; dayIndex < HISTORY_DAYS; dayIndex += 1) {
      const date = addDays(firstDay, dayIndex)
      const holiday = holidayKind(date)
      const hard = product.stock_type === 'HARD'
      let expected = base
        * (hard ? HARD_WEEKDAY_MULTIPLIER : WEEKDAY_MULTIPLIER)[dayOfWeek(date)]
        * (hard && eventMultiplier.has(date) ? (eventMultiplier.get(date) || HARD_EVENT_MULTIPLIER_DEFAULT) : 1)
        * (isPayday(date) ? PAYDAY_MULTIPLIER : 1)
        * (holiday === 'eve' ? HOLIDAY_EVE_MULTIPLIER : holiday === 'holiday' ? HOLIDAY_MULTIPLIER : 1)
        * (1 + ANNUAL_GROWTH * (dayIndex / 365))
      let units = poisson(expected, random)
      let stockedOut = false
      if (random() < STOCKOUT_RATE && units > 0) {
        stockedOut = true
        const served = STOCKOUT_SERVED_MIN + (STOCKOUT_SERVED_MAX - STOCKOUT_SERVED_MIN) * random()
        units = Math.floor(units * served)
      }
      rows.dates.push(date)
      rows.productIds.push(product.product_id)
      rows.units.push(units)
      rows.stockouts.push(stockedOut)
    }
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // Replaces the whole table: one assumption set at a time, never a
    // blend of two versions' history.
    await client.query('DELETE FROM assumed_daily_demand')
    const chunk = 5000
    for (let start = 0; start < rows.dates.length; start += chunk) {
      await client.query(
        `INSERT INTO assumed_daily_demand (local_date, product_id, units, stocked_out, generator_version)
         SELECT d, p, u, s, $5 FROM unnest($1::date[], $2::bigint[], $3::int[], $4::boolean[]) AS t(d, p, u, s)`,
        [rows.dates.slice(start, start + chunk), rows.productIds.slice(start, start + chunk), rows.units.slice(start, start + chunk), rows.stockouts.slice(start, start + chunk), GENERATOR_VERSION],
      )
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }

  const totalUnits = rows.units.reduce((sum, value) => sum + value, 0)
  console.log(`Generated ${rows.dates.length} assumed product-days (${products.length} products × ${HISTORY_DAYS} days, ${firstDay} to ${yesterday}).`)
  console.log(`Total assumed units: ${totalUnits}. Stock-out days: ${rows.stockouts.filter(Boolean).length}. Version ${GENERATOR_VERSION}, seed ${SEED}.`)
  console.log('This table is read only by the forecaster. No order, payment or report includes it.')
  await pool.end()
}

main().catch((error) => {
  console.error('Generating assumed demand failed:', error)
  pool.end()
  process.exit(1)
})
