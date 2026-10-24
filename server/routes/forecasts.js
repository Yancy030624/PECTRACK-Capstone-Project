// Demand forecasting API — Phase 9B, RULES-PLANS/PHASE9B_PREDICTIVE_ANALYSIS_PLAN.md.
// Mounted at /api/forecasts.
//
// A forecast is a deliberate RUN, stored like a report, not recomputed on
// every page view: an admin starts one, it reads the history, fits the
// methods in lib/forecasting.js per product, and writes the result with a
// record of exactly what it was trained on.
//
// A run trains on ONE kind of history, never a blend:
//   ASSUMED  the generated year in assumed_daily_demand
//   REAL     sales the system actually recorded (or imported)
// Mixing them on the same day would let an invented number and a real one
// average into something that is neither — the one thing the adviser's
// approval of assumed data was conditional on avoiding. Switching a run to
// REAL is also how the system shows, honestly, that the bakery's own
// history is not long enough yet.
import express from 'express'
import { pool } from '../db.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { addDays } from '../lib/forecasting.js'
import { runForecast, SOURCE_SETS } from '../lib/forecastRun.js'
import { normalize, parseId } from '../lib/validation.js'
import { logExport } from '../lib/exportLog.js'

const router = express.Router()

const sourceKindOf = (sources) => (sources.includes('ASSUMED') ? 'ASSUMED' : 'REAL')

const round = (value, places = 2) => (value == null ? null : Number(Number(value).toFixed(places)))

// Viewing is ADMIN and CASHIER — a cashier planning the morning bake needs
// the numbers. Starting a run is ADMIN only (below).
router.use(requireAuth, requireRole('ADMIN', 'CASHIER'))

// POST /api/forecasts/run  { source: 'ASSUMED' | 'REAL' } — the admin's
// own run. The system also runs one every night (lib/forecastRun.js).
router.post('/run', requireRole('ADMIN'), async (request, response) => {
  const kind = normalize(request.body.source).toUpperCase() || 'ASSUMED'
  if (!SOURCE_SETS[kind]) return response.status(422).json({ message: 'Choose which history to train on: ASSUMED or REAL.', errors: { source: 'Choose ASSUMED or REAL.' } })
  const run = await runForecast({ kind, runBy: request.user.id })
  return response.status(201).json({ run })
})

// The latest run, whole: products with their seven days, the skipped ones
// and why.
async function loadRun(runId) {
  const runResult = await pool.query(
    `SELECT r.*, COALESCE(a.name, c.name) AS run_by_name
       FROM forecast_runs r
       LEFT JOIN admins a ON a.user_id = r.run_by
       LEFT JOIN cashiers c ON c.user_id = r.run_by
      WHERE r.run_id = $1`,
    [runId],
  )
  const run = runResult.rows[0]
  if (!run) return null

  const [models, days] = await Promise.all([
    pool.query(
      `SELECT m.*, p.product_name, p.variant, p.stock_type
         FROM forecast_models m JOIN products p ON p.product_id = m.product_id
        WHERE m.run_id = $1
        ORDER BY p.product_name, p.variant`,
      [runId],
    ),
    pool.query(
      `SELECT product_id, forecast_date::text AS date, predicted, low, high
         FROM forecasts WHERE run_id = $1 ORDER BY product_id, forecast_date`,
      [runId],
    ),
  ])

  const daysByProduct = new Map()
  for (const row of days.rows) {
    const list = daysByProduct.get(row.product_id) ?? []
    list.push({ date: row.date, predicted: Number(row.predicted), low: Number(row.low), high: Number(row.high) })
    daysByProduct.set(row.product_id, list)
  }
  const dates = [...new Set(days.rows.map((row) => row.date))].sort()

  const products = []
  const skipped = []
  for (const model of models.rows) {
    const base = { productId: model.product_id, name: model.product_name, variant: model.variant, stockType: model.stock_type }
    if (model.method === 'none') {
      skipped.push({ ...base, note: model.note })
      continue
    }
    const productDays = daysByProduct.get(model.product_id) ?? []
    products.push({
      ...base,
      method: model.method,
      mae: model.mae == null ? null : Number(model.mae),
      wape: model.wape == null ? null : Number(model.wape),
      baselineMae: model.baseline_mae == null ? null : Number(model.baseline_mae),
      historyDays: model.history_days,
      candidates: model.candidates,
      note: model.note,
      days: productDays,
      total: round(productDays.reduce((sum, day) => sum + day.predicted, 0)),
    })
  }

  const sources = run.sources.replace(/[{}]/g, '').split(',').filter(Boolean)
  // What to bake is the Production list's (lib/dailyStock.js), which
  // compares this forecast with the plan (ANALYTICS_PLAN.md, A3).
  return {
    run: {
      id: run.run_id,
      createdAt: run.created_at,
      runByName: run.run_by_name,
      source: sourceKindOf(sources),
      sources,
      historyFrom: run.history_from,
      historyTo: run.history_to,
      daysBySource: run.days_by_source,
      productsForecast: run.products_forecast,
      productsSkipped: run.products_skipped,
      horizonDays: run.horizon_days,
    },
    dates,
    products,
    skipped,
  }
}

const csvCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`

// GET /api/forecasts/latest[?format=csv]
router.get('/latest', async (request, response) => {
  const latest = await pool.query('SELECT run_id FROM forecast_runs ORDER BY created_at DESC, run_id DESC LIMIT 1')
  if (!latest.rows[0]) return response.json({ run: null })
  const data = await loadRun(latest.rows[0].run_id)

  if (normalize(request.query.format).toLowerCase() === 'csv') {
    await logExport(request.user.id, 'FORECAST_CSV')
    const header = ['Product', 'Variant', 'Trained on', 'Method', 'Backtest MAE', 'Backtest WAPE', 'Date', 'Predicted', 'Low', 'High']
    const lines = [header.map(csvCell).join(',')]
    for (const product of data.products) {
      for (const day of product.days) {
        lines.push([product.name, product.variant, data.run.source, product.method, product.mae, product.wape, day.date, day.predicted, day.low, day.high].map(csvCell).join(','))
      }
    }
    response.type('text/csv')
    response.set('Content-Disposition', `attachment; filename="forecast-run-${data.run.id}.csv"`)
    return response.send(lines.join('\r\n'))
  }
  return response.json(data)
})

// GET /api/forecasts/history/:productId?days=56 — the chart: that
// product's recent history from the SAME source the latest run used, and
// the run's forecast for it.
router.get('/history/:productId', async (request, response) => {
  const productId = parseId(request.params.productId)
  if (!productId) return response.status(404).json({ message: 'Product not found.' })
  const days = Math.min(Math.max(Math.trunc(Number(request.query.days)) || 56, 7), 365)

  const latest = await pool.query('SELECT run_id, sources, history_to::text AS history_to FROM forecast_runs ORDER BY created_at DESC, run_id DESC LIMIT 1')
  const run = latest.rows[0]
  if (!run) return response.json({ history: [], forecast: [] })
  const sources = run.sources.replace(/[{}]/g, '').split(',').filter(Boolean)
  // The chart ends where THIS product's history ends, never later: a run's
  // history_to is its latest day across every product, and a product whose
  // generated history stops a day earlier would otherwise show a false drop
  // to zero just before its forecast.
  const ownLast = await pool.query(
    `SELECT MAX(local_date)::text AS last FROM forecast_training_data
      WHERE product_id = $1 AND data_source = ANY($2::data_source[]) AND local_date <= $3::date`,
    [productId, sources, run.history_to],
  )
  const to = sources.includes('ASSUMED') ? (ownLast.rows[0].last ?? run.history_to) : run.history_to
  if (!to) return response.json({ history: [], forecast: [] })
  const from = addDays(to, -(days - 1))

  const [history, forecast] = await Promise.all([
    pool.query(
      `SELECT local_date::text AS date, SUM(units)::int AS units, BOOL_OR(stocked_out) AS censored
         FROM forecast_training_data
        WHERE product_id = $1 AND data_source = ANY($2::data_source[]) AND local_date BETWEEN $3::date AND $4::date
        GROUP BY local_date ORDER BY local_date`,
      [productId, sources, from, to],
    ),
    pool.query(
      'SELECT forecast_date::text AS date, predicted, low, high FROM forecasts WHERE run_id = $1 AND product_id = $2 ORDER BY forecast_date',
      [run.run_id, productId],
    ),
  ])

  // Fill quiet days as zero so the chart's x-axis is continuous.
  const known = new Map(history.rows.map((row) => [row.date, row]))
  const filled = Array.from({ length: days }, (_, index) => {
    const date = addDays(from, index)
    const row = known.get(date)
    return { date, units: row?.units ?? 0, censored: row?.censored ?? false }
  })
  return response.json({
    history: filled,
    forecast: forecast.rows.map((row) => ({ date: row.date, predicted: Number(row.predicted), low: Number(row.low), high: Number(row.high) })),
  })
})

export default router
