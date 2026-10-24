// Running a forecast — Phase 9B, RULES-PLANS/PHASE9B_PREDICTIVE_ANALYSIS_PLAN.md,
// moved out of routes/forecasts.js so the system can run it on its own
// every night (RULES-PLANS/ANALYTICS_PLAN.md, A4).
//
// A run trains on ONE kind of history, never a blend:
//   ASSUMED  the generated year in assumed_daily_demand
//   REAL     sales the system actually recorded (or imported)
// Mixing them on the same day would let an invented number and a real one
// average into something that is neither — the one thing the adviser's
// approval of assumed data was conditional on avoiding.
//
// The nightly run (runNightlyForecast) trains on ASSUMED history until the
// bakery has MIN_BACKTEST_HISTORY (56) days of real sales — the shortest
// history whose accuracy can be measured — and on REAL sales from then on.
import { pool } from '../db.js'
import { addDays, daysBetween, forecastProduct, MIN_BACKTEST_HISTORY, setEventCalendar } from './forecasting.js'

// Decision 1 of the plan: a bakery plans a day to a week ahead, and
// accuracy falls off quickly beyond that.
export const HORIZON_DAYS = 7
export const SOURCE_SETS = {
  ASSUMED: ['ASSUMED'],
  REAL: ['RECORDED', 'IMPORTED'],
}

const round = (value, places = 2) => (value == null ? null : Number(Number(value).toFixed(places)))

// Today and yesterday on the Manila calendar, from the database clock so
// every part of the system agrees on what "today" is.
export async function manilaDays() {
  const result = await pool.query(`SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date::text AS today`)
  const today = result.rows[0].today
  return { today, yesterday: addDays(today, -1) }
}

// Trains on `kind` ('ASSUMED' or 'REAL') and stores the run. `runBy` is the
// user who asked, or null for the system's nightly run.
export async function runForecast({ kind, runBy }) {
  const sources = SOURCE_SETS[kind]
  if (!sources) throw new Error(`Unknown forecast source ${kind}`)

  const { today, yesterday } = await manilaDays()

  // Today is excluded from training: it is not over, and a half-day of
  // sales would read as a slump.
  const history = await pool.query(
    `SELECT local_date::text AS date, product_id, SUM(units)::int AS units, BOOL_OR(stocked_out) AS censored
       FROM forecast_training_data
      WHERE data_source = ANY($1::data_source[]) AND local_date <= $2::date
      GROUP BY local_date, product_id
      ORDER BY product_id, local_date`,
    [sources, yesterday],
  )
  const products = (await pool.query(
    'SELECT product_id, product_name, variant FROM products WHERE availability_status = TRUE ORDER BY product_name, variant',
  )).rows

  const byProduct = new Map()
  for (const row of history.rows) {
    const list = byProduct.get(row.product_id) ?? []
    list.push(row)
    byProduct.set(row.product_id, list)
  }

  // Distinct days of each source actually used — the answer to "what was
  // this trained on?" that the run carries forever.
  const coverage = await pool.query(
    `SELECT data_source, COUNT(DISTINCT local_date)::int AS days, MIN(local_date)::text AS first, MAX(local_date)::text AS last
       FROM forecast_training_data
      WHERE data_source = ANY($1::data_source[]) AND local_date <= $2::date
      GROUP BY data_source`,
    [sources, yesterday],
  )
  const daysBySource = Object.fromEntries(coverage.rows.map((row) => [row.data_source, row.days]))
  const historyFrom = coverage.rows.map((row) => row.first).sort()[0] ?? null
  const historyTo = coverage.rows.map((row) => row.last).sort().at(-1) ?? null

  // Where each product's series ends.
  //
  // REAL sales run to yesterday: the system records every sale, so a day
  // with no row genuinely sold nothing and counts as zero.
  //
  // ASSUMED history is a generated year that stops on the day it was
  // generated. The days after that are not "sold nothing" — they are not
  // in the data at all. Filling them with zeros taught every method that
  // sales had collapsed (forecasts near zero, accuracy around 20%), so the
  // series ends where the generated history ends, and the forecast is
  // projected forward from there to today and the week after. The
  // generator writes a row for every product-day, zeros included, so a
  // product's own last row is where its generated history ends.
  const seriesEndFor = (rows) => (kind === 'ASSUMED' && rows.at(-1).date < yesterday ? rows.at(-1).date : yesterday)

  // Each product's series runs from its first recorded day to seriesEnd,
  // with the missing days in between filled as zero. Starting from the
  // product's OWN first day stops a product added last month looking like
  // it sold nothing all year.
  // Every event day (migration 036) becomes the regression's "event"
  // variable, past ones for learning and coming ones for the forecast.
  const eventRows = await pool.query(`SELECT to_char(day, 'YYYY-MM-DD') AS day FROM events, generate_series(starts_on, ends_on, INTERVAL '1 day') AS day`)
  setEventCalendar(eventRows.rows.map((row) => row.day))

  let results = []
  for (const product of products) {
    const rows = byProduct.get(product.product_id) ?? []
    if (rows.length === 0) {
      results.push({ product, outcome: { skipped: 'No history for this product in the chosen data.' } })
      continue
    }
    const known = new Map(rows.map((row) => [row.date, row]))
    const first = rows[0].date
    const seriesEnd = seriesEndFor(rows)
    const length = daysBetween(first, seriesEnd) + 1
    const series = Array.from({ length }, (_, index) => {
      const date = addDays(first, index)
      const row = known.get(date)
      return { date, units: row?.units ?? 0, censored: row?.censored ?? false }
    })
    const outcome = forecastProduct(series, { horizon: daysBetween(seriesEnd, today) + HORIZON_DAYS - 1 })
    // Keep only today and the six days after it — the days the bakery can
    // still act on.
    if (!outcome.skipped) outcome.forecast = outcome.forecast.filter((day) => day.date >= today).slice(0, HORIZON_DAYS)
    results.push({ product, outcome })
  }

  let forecast = results.filter((result) => !result.outcome.skipped)
  const client = await pool.connect()
  let runId
  try {
    await client.query('BEGIN')
    // Training takes seconds, and a product can be deleted meanwhile.
    // Lock the ones still here against deletion until this commits (KEY
    // SHARE blocks a DELETE, not ordinary edits), and leave out any that
    // are gone — otherwise one missing product fails the whole run on its
    // foreign key.
    const stillThere = new Set((await client.query(
      'SELECT product_id FROM products WHERE product_id = ANY($1::bigint[]) FOR KEY SHARE',
      [results.map((result) => result.product.product_id)],
    )).rows.map((row) => row.product_id))
    results = results.filter((result) => stillThere.has(result.product.product_id))
    forecast = results.filter((result) => !result.outcome.skipped)
    const run = await client.query(
      `INSERT INTO forecast_runs (run_by, horizon_days, sources, history_from, history_to, days_by_source, products_forecast, products_skipped)
       VALUES ($1, $2, $3::data_source[], $4, $5, $6, $7, $8) RETURNING run_id`,
      [runBy, HORIZON_DAYS, sources, historyFrom, historyTo, JSON.stringify(daysBySource), forecast.length, results.length - forecast.length],
    )
    runId = run.rows[0].run_id

    for (const { product, outcome } of results) {
      if (outcome.skipped) {
        await client.query(
          `INSERT INTO forecast_models (run_id, product_id, method, history_days, note) VALUES ($1, $2, 'none', 0, $3)`,
          [runId, product.product_id, outcome.skipped],
        )
        continue
      }
      await client.query(
        `INSERT INTO forecast_models (run_id, product_id, method, mae, wape, baseline_mae, history_days, candidates, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [runId, product.product_id, outcome.method, round(outcome.mae, 3), round(outcome.wape, 4), round(outcome.baselineMae, 3), outcome.historyDays,
          JSON.stringify(outcome.candidates.map((candidate) => ({ method: candidate.method, mae: round(candidate.mae, 3), wape: round(candidate.wape, 4) }))), outcome.note],
      )
      await client.query(
        `INSERT INTO forecasts (run_id, product_id, forecast_date, predicted, low, high)
         SELECT $1, $2, d, p, l, h FROM unnest($3::date[], $4::numeric[], $5::numeric[], $6::numeric[]) AS t(d, p, l, h)`,
        [runId, product.product_id, outcome.forecast.map((day) => day.date), outcome.forecast.map((day) => round(day.predicted)),
          outcome.forecast.map((day) => round(day.low)), outcome.forecast.map((day) => round(day.high))],
      )
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }

  return { id: runId, source: kind, productsForecast: forecast.length, productsSkipped: results.length - forecast.length, daysBySource }
}

// How many days of real sales the bakery has, up to yesterday.
export async function realSalesDays() {
  const { yesterday } = await manilaDays()
  const result = await pool.query(
    `SELECT COUNT(DISTINCT local_date)::int AS days FROM forecast_training_data
      WHERE data_source = ANY($1::data_source[]) AND local_date <= $2::date`,
    [SOURCE_SETS.REAL, yesterday],
  )
  return result.rows[0].days
}

export const nightlySourceFor = (realDays) => (realDays >= MIN_BACKTEST_HISTORY ? 'REAL' : 'ASSUMED')

// From 12:05 AM Manila, once per Manila day: yesterday is complete, and the
// forecast is ready before the morning bake (the user, 2026-10-25). The day
// is claimed in forecast_nightly_runs first, so a restart or a second
// server never runs it twice; a run that fails gives its claim back and is
// tried again on the next minute. Returns the run, or null when nothing ran.
export const nightlyTime = '00:05'
export async function runNightlyForecast(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(now).map((part) => [part.type, part.value]))
  const day = `${parts.year}-${parts.month}-${parts.day}`
  if (`${parts.hour}:${parts.minute}` < nightlyTime) return null
  const claimed = await pool.query('INSERT INTO forecast_nightly_runs (day) VALUES ($1) ON CONFLICT (day) DO NOTHING RETURNING day', [day])
  if (claimed.rowCount === 0) return null
  try {
    const run = await runForecast({ kind: nightlySourceFor(await realSalesDays()), runBy: null })
    await pool.query('UPDATE forecast_nightly_runs SET run_id = $2 WHERE day = $1', [day, run.id])
    return run
  } catch (error) {
    await pool.query('DELETE FROM forecast_nightly_runs WHERE day = $1', [day])
    throw error
  }
}
