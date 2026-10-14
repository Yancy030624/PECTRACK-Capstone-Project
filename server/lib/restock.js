// Restocking recommendations — PHASE10_PAPER_ALIGNMENT_PLAN.md, B1.
//
// The paper's "Automated Inventory" promise: say which products will run
// out and how many to bake. It is arithmetic on the latest forecast
// against what is on the shelf now — nothing is predicted here that the
// forecast did not already predict.
//
// Used by the Forecast tab (the full list) and the Dashboard ("likely to
// sell out" count), from this one function, so the two can never
// disagree about which products are at risk.
import { pool } from '../db.js'

// Bread is baked every day. Recommending a week's worth would recommend
// bread that goes stale before it sells; two days covers today plus the
// next morning's bake.
export const COVER_DAYS = 2

// Pure: one product's recommendation from its forecast days and stock.
//
//   sellsOutOn   the first forecast day whose running total passes the
//                stock on hand — null when the whole horizon is covered
//   recommended  enough for COVER_DAYS plus a safety margin, minus stock,
//                never below zero. The margin is how far the top of
//                today's range sits above today's forecast: the forecast's
//                own measure of how wrong it tends to be.
export function recommendRestock({ days, stock }) {
  const onHand = Math.max(0, Number(stock) || 0)
  let running = 0
  let sellsOutOn = null
  for (const day of days) {
    running += Number(day.predicted)
    if (sellsOutOn == null && running > onHand) sellsOutOn = day.date
  }
  const covered = days.slice(0, COVER_DAYS).reduce((sum, day) => sum + Number(day.predicted), 0)
  const margin = days.length ? Math.max(0, Number(days[0].high) - Number(days[0].predicted)) : 0
  const recommended = Math.max(0, Math.ceil(covered + margin) - onHand)
  return { sellsOutOn, recommended, coverDemand: Math.round(covered * 100) / 100 }
}

// Every forecast product in a run, with its recommendation, most urgent
// first.
export async function restockForRun(runId) {
  const [days, stock] = await Promise.all([
    pool.query(
      `SELECT product_id, forecast_date::text AS date, predicted, high FROM forecasts WHERE run_id = $1 ORDER BY product_id, forecast_date`,
      [runId],
    ),
    pool.query(
      `SELECT p.product_id, p.product_name, p.variant,
              i.stock_quantity AS sellable
         FROM products p
         JOIN inventory i ON i.product_id = p.product_id
        WHERE p.product_id IN (SELECT DISTINCT product_id FROM forecasts WHERE run_id = $1)`,
      [runId],
    ),
  ])

  const byProduct = new Map()
  for (const row of days.rows) {
    const list = byProduct.get(row.product_id) ?? []
    list.push(row)
    byProduct.set(row.product_id, list)
  }

  const recommendations = stock.rows.map((row) => {
    const result = recommendRestock({
      days: byProduct.get(row.product_id) ?? [],
      stock: row.sellable,
    })
    return {
      productId: row.product_id,
      name: row.product_name,
      variant: row.variant,
      stock: Number(row.sellable),
      ...result,
    }
  })

  // Soonest sell-out first; products that are covered go last, the ones
  // needing the most among them first.
  recommendations.sort((a, b) => {
    if (a.sellsOutOn && b.sellsOutOn) return a.sellsOutOn.localeCompare(b.sellsOutOn) || b.recommended - a.recommended
    if (a.sellsOutOn) return -1
    if (b.sellsOutOn) return 1
    return b.recommended - a.recommended
  })
  return recommendations
}

// The Dashboard's count: products forecast to run out by the end of
// TOMORROW in the latest run — what can still be fixed by tonight's bake.
export async function likelySellOutSummary() {
  const latest = await pool.query(`SELECT run_id, sources FROM forecast_runs ORDER BY created_at DESC, run_id DESC LIMIT 1`)
  const run = latest.rows[0]
  if (!run) return null
  const today = (await pool.query(`SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date::text AS d`)).rows[0].d
  const tomorrow = (await pool.query(`SELECT ($1::date + 1)::text AS d`, [today])).rows[0].d
  const recommendations = await restockForRun(run.run_id)
  const atRisk = recommendations.filter((item) => item.sellsOutOn && item.sellsOutOn <= tomorrow)
  return {
    runId: run.run_id,
    assumed: String(run.sources).includes('ASSUMED'),
    count: atRisk.length,
    products: atRisk.slice(0, 5).map((item) => ({ productId: item.productId, name: item.name, variant: item.variant, sellsOutOn: item.sellsOutOn, recommended: item.recommended })),
  }
}
