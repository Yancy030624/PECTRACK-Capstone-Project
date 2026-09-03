// Sales, product performance, and inventory reporting, plus the live
// dashboard summary — Phase 8 (see PHASE8_PLAN.md). Mounted at
// /api/reports in app.js. ADMIN and CASHIER only, matching
// src/pages/dashboard/modules.js's own 'Reporting & Analytics' entry.
//
// This router only reads. The one exception — a report_logs row recorded
// when an admin deliberately generates a report (Decision 4) — is a plain
// audit INSERT outside any transaction, never a write to money or stock.
import express from 'express'
import { pool } from '../db.js'
import { billingListSql } from '../lib/billing.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { bucketSql, csvRow, dateRangeSql, parseDateRange, parseGroupBy } from '../lib/reporting.js'
import { normalize } from '../lib/validation.js'

const router = express.Router()

// How many open alerts a single response will carry. Decision 9 declines
// optimisation without a measured problem, and this is not one — it is a
// bound on a list whose length is set by how badly stock is going, not by
// how long the system has been running. Every other unbounded read in
// Phase 8 grows with TIME and is filtered by a date range; this one grows
// with a BAD WEEK — a missed supplier delivery or a failed freezer can put
// most of the catalogue under its minimum at once — and it is fetched on
// every dashboard load by every admin and cashier, with no range to
// narrow it. 50 is far more than anyone acts on in one sitting.
const maxLowStockAlerts = 50

// Shared by GET /summary and GET /inventory — same query, same mapping,
// two callers. Not date-filtered: these are CURRENT open alerts, not
// historical activity, so "as of when" does not apply to them.
//
// Returns { alerts, total }: the capped list to render, and the true
// count. They are separate because the UI needs both and they answer
// different questions — capping the list without reporting the real total
// would make the dashboard quietly under-report how much is wrong, which
// is the same class of mistake as a truncated report reading as complete.
async function getLowStockAlerts() {
  const [listResult, countResult] = await Promise.all([
    pool.query(
      `SELECT sa.alert_id, p.product_id, p.product_name, p.variant,
              inv.stock_quantity, inv.min_stock_level, sa.alert_message, sa.created_at
         FROM stock_alerts sa
         JOIN inventory inv ON inv.inventory_id = sa.inventory_id
         JOIN products p ON p.product_id = inv.product_id
        WHERE sa.is_resolved = FALSE
        ORDER BY sa.created_at
        LIMIT $1`,
      [maxLowStockAlerts],
    ),
    pool.query('SELECT COUNT(*)::int AS n FROM stock_alerts WHERE is_resolved = FALSE'),
  ])
  return {
    alerts: listResult.rows.map((row) => ({
      id: row.alert_id,
      productId: row.product_id,
      productName: row.product_name,
      variant: row.variant,
      stockQuantity: row.stock_quantity,
      minStockLevel: row.min_stock_level,
      alertMessage: row.alert_message,
      createdAt: row.created_at,
    })),
    total: countResult.rows[0].n,
  }
}

// Forgiving on purpose, matching Decision 5's own "capped, not rejected"
// rule for payments pagination: an out-of-range or non-numeric limit is
// not worth a 422 over, it just falls back to something reasonable.
function parseLimit(rawLimit, { defaultLimit, maxLimit }) {
  const limit = Number(rawLimit)
  if (!Number.isInteger(limit) || limit < 1) return defaultLimit
  return Math.min(limit, maxLimit)
}

// GET /api/reports/logs's own limits — smaller than /products's top-N
// ranking and routes/payments.js's transaction history, because this
// table only grows one row per DELIBERATE report generation (Decision 4),
// not one per order or payment. 20/100 is generous for that pace.
const defaultLogsLimit = 20
const maxLogsLimit = 100

router.use(requireAuth, requireRole('ADMIN', 'CASHIER'))

// GET /api/reports/sales?from=&to=&groupBy=day|week|month
//
// PHASE 8, DECISION 2 — "sales" is reported as two different, both
// defensible numbers, never conflated into one: ORDERED (what customers
// asked for, SUM(orders.total_amount), dated by order_date) and COLLECTED
// (what actually arrived, SUM(payments.amount) WHERE status = 'PAID',
// dated by payment_date). They diverge by design — Phase 7 allows a
// DELIVERED order to still be unpaid (cash on delivery), and an order
// placed in one month can be paid in the next.
//
// Computed as three INDEPENDENT aggregates (orders, PAID payments,
// REFUNDED payments), each bucketed by its OWN date column, then combined
// with FULL OUTER JOIN on the bucket key. This is deliberate, not
// incidental complexity: joining orders directly to payments would
// multiply order rows by however many payments each one has, corrupting
// SUM(total_amount) the moment an order holds more than one payment row —
// exactly the fan-out this shape avoids by never joining the two tables
// against each other at all.
router.get('/sales', async (request, response) => {
  const { from, to, errors: dateErrors } = parseDateRange(request.query)
  const { groupBy, error: groupByError } = parseGroupBy(request.query.groupBy)
  const errors = { ...dateErrors }
  if (groupByError) errors.groupBy = groupByError
  const format = normalize(request.query.format).toLowerCase() || 'json'
  if (format !== 'json' && format !== 'csv') errors.format = 'format must be json or csv.'
  if (Object.keys(errors).length) return response.status(422).json({ message: 'Please correct the highlighted fields.', errors })

  // Each date column gets its own range filter, but all three are bound to
  // the SAME requested [from, to] — dateRangeSql defaults to $1/$2, and
  // every query below passes exactly [from, to] as its parameters, so an
  // order dated inside the range and a payment dated inside the range are
  // both asking "does THIS row's own date fall in what was requested",
  // never comparing one row's order_date against another's payment_date.
  const orderedRange = dateRangeSql('o.order_date')
  const collectedRange = dateRangeSql('p.payment_date')
  const refundedRange = dateRangeSql('p.refunded_at')

  // PHASE 8, DECISION 6 — an order counts once it is PLACED and NOT
  // CANCELLED. A cancelled order had its stock restored (Phase 5) and any
  // payment refunded (Phase 6); counting it as ordered volume would
  // contradict both of those.
  const bucketsResult = await pool.query(
    `WITH ordered_buckets AS (
       SELECT ${bucketSql('o.order_date', groupBy)} AS period,
              COUNT(*)::int AS orders_placed,
              COALESCE(SUM(o.total_amount), 0)::numeric(12,2) AS ordered
         FROM orders o
        WHERE o.status <> 'CANCELLED' AND ${orderedRange}
        GROUP BY 1
     ),
     collected_buckets AS (
       SELECT ${bucketSql('p.payment_date', groupBy)} AS period,
              COALESCE(SUM(p.amount), 0)::numeric(12,2) AS collected
         FROM payments p
        WHERE p.status = 'PAID' AND ${collectedRange}
        GROUP BY 1
     ),
     -- PHASE 8, DECISION 3 — a refund is dated by WHEN IT WAS ISSUED
     -- (refunded_at), not the period the original payment fell in. Reports
     -- are "as things stand now" snapshots: refunding an August payment in
     -- September changes August's COLLECTED figure (status = 'PAID'
     -- excludes it) but the refund itself shows up here, in September.
     refunded_buckets AS (
       SELECT ${bucketSql('p.refunded_at', groupBy)} AS period,
              COALESCE(SUM(p.amount), 0)::numeric(12,2) AS refunded
         FROM payments p
        WHERE p.status = 'REFUNDED' AND ${refundedRange}
        GROUP BY 1
     )
     SELECT COALESCE(ob.period, cb.period, rb.period) AS period,
            COALESCE(ob.orders_placed, 0) AS orders_placed,
            COALESCE(ob.ordered, 0)::numeric(12,2) AS ordered,
            COALESCE(cb.collected, 0)::numeric(12,2) AS collected,
            COALESCE(rb.refunded, 0)::numeric(12,2) AS refunded
       FROM ordered_buckets ob
       FULL OUTER JOIN collected_buckets cb ON cb.period = ob.period
       FULL OUTER JOIN refunded_buckets rb ON rb.period = COALESCE(ob.period, cb.period)
      ORDER BY 1`,
    [from, to],
  )

  // The SAME three aggregates, unbucketed, for the headline totals row —
  // computed in Postgres (Decision 9), never by summing the bucket rows
  // above in JavaScript, which would just be the same NUMERIC-as-string
  // reduction lib/billing.js already explains is the wrong habit to form.
  //
  // averagePayment is the average PAID payment amount (collected / how
  // many payments made it up) — PATTERN J's own worked example, computed
  // here exactly as documented: COALESCE(x / NULLIF(count, 0), 0) so a
  // quiet period returns '0.00', never a division-by-zero 500.
  //
  // Named for what it measures. It was called averageSale until the Phase
  // 8 review, which is wrong whenever an order is settled in instalments:
  // a single ₱100 order paid in two ₱50 parts reported an "average sale"
  // of ₱50, half the value of the only sale in the period. Decision 2's
  // own rule — never let a money field stand there without saying which
  // money it is — applies to this field as much as to `sales`.
  //
  // Renaming rather than recomputing is the fix, deliberately: dividing
  // collected by ordersPlaced would look more like an "average sale", but
  // those two are dated by DIFFERENT columns (payment_date vs order_date),
  // so their quotient describes no period at all.
  const totalsResult = await pool.query(
    `WITH ordered_totals AS (
       SELECT COUNT(*)::int AS orders_placed, COALESCE(SUM(o.total_amount), 0)::numeric(12,2) AS ordered
         FROM orders o
        WHERE o.status <> 'CANCELLED' AND ${orderedRange}
     ),
     collected_totals AS (
       SELECT COUNT(*)::int AS paid_count, COALESCE(SUM(p.amount), 0)::numeric(12,2) AS collected
         FROM payments p
        WHERE p.status = 'PAID' AND ${collectedRange}
     ),
     refunded_totals AS (
       SELECT COALESCE(SUM(p.amount), 0)::numeric(12,2) AS refunded
         FROM payments p
        WHERE p.status = 'REFUNDED' AND ${refundedRange}
     )
     SELECT ot.orders_placed, ot.ordered, ct.collected,
            COALESCE(ct.collected / NULLIF(ct.paid_count, 0), 0)::numeric(12,2) AS average_payment,
            rt.refunded
       FROM ordered_totals ot, collected_totals ct, refunded_totals rt`,
    [from, to],
  )
  const totalsRow = totalsResult.rows[0]

  const buckets = bucketsResult.rows.map((row) => ({
    period: row.period,
    ordersPlaced: row.orders_placed,
    ordered: row.ordered,
    collected: row.collected,
    refunded: row.refunded,
  }))
  const totals = {
    ordersPlaced: totalsRow.orders_placed,
    ordered: totalsRow.ordered,
    collected: totalsRow.collected,
    refunded: totalsRow.refunded,
    averagePayment: totalsRow.average_payment,
  }

  // PHASE 8, DECISION 4 — report_logs records DELIBERATE generation, not
  // page views. Every successful call here already supplied an explicit
  // from/to (parseDateRange requires both), so reaching this line IS
  // "asked for something specific" — the schema itself draws the rest of
  // the line: generated_by REFERENCES admins(admin_id), so a CASHIER's
  // request structurally cannot be logged. Not an error, not a silent
  // failure — simply outside what this table can record. The export gets
  // its own report_type (SALES_CSV) so the audit trail can tell a screen
  // view apart from a file someone walked away with.
  //
  // A plain INSERT, outside any transaction, AFTER the report is already
  // fully computed. This is an audit record of a read; if it fails, the
  // report itself is still correct, so the try/catch below makes sure a
  // logging problem can never take the response down with it.
  if (request.user.role === 'ADMIN') {
    try {
      await pool.query(
        `INSERT INTO report_logs (generated_by, report_type) SELECT admin_id, $1 FROM admins WHERE user_id = $2`,
        [format === 'csv' ? 'SALES_CSV' : 'SALES', request.user.id],
      )
    } catch (error) {
      console.error('Failed to record a report_logs row for a SALES report:', error)
    }
  }

  if (format === 'csv') {
    // PATTERN K (lib/reporting.js) — every cell escaped, including
    // against formula injection, because this file is opened on the
    // owner's own machine, not the server's.
    //
    // The Period column names its own grouping rather than the file
    // carrying a title block above the table. A bare '2026-08-31' in a
    // first column is ambiguous between one day and the Monday that opens
    // a week bucket, and once the file is on someone's laptop the request
    // that produced it is gone. Naming the unit in the header keeps the
    // table importable as-is — a preamble would push the real header off
    // row 1 and break a plain spreadsheet import. The date range travels
    // in the filename below.
    //
    // The refunds column carries its own warning, in the header, because
    // the header is the only thing that stays attached to the file once it
    // is on someone's laptop. `Collected` already excludes refunded money
    // (it counts status = 'PAID' only), so `Collected - Refunds` subtracts
    // the same money twice — and that subtraction is the first thing any
    // reader does with two adjacent money columns. Naming the column
    // 'Refunded' invited exactly that; naming it this way forecloses it.
    const lines = [
      csvRow([`Period (${groupBy})`, 'Orders placed', 'Ordered', 'Collected', 'Refunds issued (already excluded from Collected)']),
      ...buckets.map((bucket) => csvRow([bucket.period, bucket.ordersPlaced, bucket.ordered, bucket.collected, bucket.refunded])),
      '',
      csvRow(['Totals', totals.ordersPlaced, totals.ordered, totals.collected, totals.refunded]),
      csvRow(['Average payment', totals.averagePayment]),
    ]
    response.type('text/csv')
    response.set('Content-Disposition', `attachment; filename="sales-${from}-to-${to}.csv"`)
    return response.send(lines.join('\r\n'))
  }

  return response.json({ from, to, groupBy, buckets, totals })
})

// GET /api/reports/summary — the live dashboard's ambient view. No date
// parameters, no report_logs row (Decision 4 — this answers "how are
// things right now", not a deliberately generated report), and every
// figure is cheap: today's own numbers plus two small "needs attention"
// lists, not an aggregation over an arbitrary range.
//
// "Today" is computed ENTIRELY IN POSTGRES, in one round trip, and never
// touched by JavaScript's own Date — not even to read a date string back
// out and re-send it. Node's process has its own OS timezone, which could
// disagree with BOTH the database session's TimeZone AND Asia/Manila; the
// only way to ask "what day is it in Manila, right now" without importing
// a third, uncontrolled timezone into the answer is to let the one
// database that already has to know the right answer (Decision 1) compute
// it start to finish.
router.get('/summary', async (_request, response) => {
  const [todayResult, outstandingResult, lowStockAlerts, deliveriesResult] = await Promise.all([
    pool.query(`
      WITH today_range AS (
        SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date AS local_date,
               (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date::timestamp AT TIME ZONE 'Asia/Manila' AS starts_at,
               ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date + 1)::timestamp AT TIME ZONE 'Asia/Manila' AS ends_at
      ),
      today_orders AS (
        SELECT COUNT(*)::int AS orders_placed, COALESCE(SUM(o.total_amount), 0)::numeric(12,2) AS ordered
          FROM orders o, today_range tr
         WHERE o.status <> 'CANCELLED' AND o.order_date >= tr.starts_at AND o.order_date < tr.ends_at
      ),
      today_payments AS (
        SELECT COALESCE(SUM(p.amount), 0)::numeric(12,2) AS collected
          FROM payments p, today_range tr
         WHERE p.status = 'PAID' AND p.payment_date >= tr.starts_at AND p.payment_date < tr.ends_at
      )
      SELECT tr.local_date, tord.orders_placed, tord.ordered, tpay.collected
        FROM today_range tr, today_orders tord, today_payments tpay
    `),
    // Total outstanding — lib/billing.js's own definition of what an order
    // owes, spliced in rather than restated (Decision 2's "one definition"
    // rule): every non-cancelled order whose total still exceeds what has
    // been PAID against it, summed.
    pool.query(`
      SELECT COALESCE(SUM(o.total_amount - COALESCE(paid.amount, 0)), 0)::numeric(12,2) AS outstanding
        FROM orders o
        ${billingListSql.join}
       WHERE o.status <> 'CANCELLED' AND (o.total_amount - COALESCE(paid.amount, 0)) > 0
    `),
    // PHASE 8, DECISION 7 — the first thing anything in this app has ever
    // READ from stock_alerts. Phase 5 has been writing it since Step 5;
    // nothing until now looked.
    getLowStockAlerts(),
    pool.query(`SELECT COUNT(*)::int AS n FROM deliveries WHERE status IN ('PENDING_ASSIGNMENT', 'ASSIGNED')`),
  ])
  const todayRow = todayResult.rows[0]

  return response.json({
    today: {
      date: todayRow.local_date,
      ordersPlaced: todayRow.orders_placed,
      ordered: todayRow.ordered,
      collected: todayRow.collected,
    },
    outstanding: outstandingResult.rows[0].outstanding,
    lowStockAlerts: lowStockAlerts.alerts,
    // The true count, separate from the capped list above — the dashboard
    // renders this number, not lowStockAlerts.length, so a truncated list
    // can never under-report how much actually needs attention.
    lowStockAlertsTotal: lowStockAlerts.total,
    deliveriesNeedingAttention: deliveriesResult.rows[0].n,
  })
})

const defaultProductsLimit = 10
const maxProductsLimit = 50

// GET /api/reports/products?from=&to=&limit=
//
// PHASE 8, DECISION 6 — ranked by REVENUE computed from
// order_details.unit_price, the price SNAPSHOTTED at order time (Phase 4)
// — never a join to products.price, which is today's price and would
// silently restate every past period's revenue the moment someone edits a
// price. Cancelled orders are excluded, same reasoning as /sales: their
// stock was restored and any payment refunded, so counting their items as
// sold would contradict both.
router.get('/products', async (request, response) => {
  const { from, to, errors } = parseDateRange(request.query)
  if (Object.keys(errors).length) return response.status(422).json({ message: 'Please correct the highlighted fields.', errors })
  const limit = parseLimit(request.query.limit, { defaultLimit: defaultProductsLimit, maxLimit: maxProductsLimit })

  const result = await pool.query(
    `SELECT p.product_id, p.product_name, p.variant,
            SUM(od.quantity)::int AS quantity_sold,
            SUM(od.quantity * od.unit_price)::numeric(12,2) AS revenue
       FROM order_details od
       JOIN orders o ON o.order_id = od.order_id
       JOIN products p ON p.product_id = od.product_id
      WHERE o.status <> 'CANCELLED' AND ${dateRangeSql('o.order_date')}
      GROUP BY p.product_id, p.product_name, p.variant
      ORDER BY revenue DESC, quantity_sold DESC
      LIMIT $3`,
    [from, to, limit],
  )

  return response.json({
    from,
    to,
    products: result.rows.map((row) => ({
      productId: row.product_id,
      productName: row.product_name,
      variant: row.variant,
      quantitySold: row.quantity_sold,
      revenue: row.revenue,
    })),
  })
})

// GET /api/reports/inventory?from=&to=
//
// PHASE 8, DECISION 7 — reports the inventory_movements LEDGER; never
// recalculates stock_quantity from it and never "corrects" a discrepancy.
// A reporting phase that writes to inventory is a reporting phase that can
// corrupt inventory.
//
// Movement totals are reported SIGNED, exactly as the ledger stores them —
// negative for stock leaving (ORDER_PLACED, SPOILAGE), positive for stock
// arriving (RESTOCK, ORDER_CANCELLED), either sign for CORRECTION. That is
// deliberate: it is what makes SUM(every reason's total) reconcile to
// SUM(quantity_change) ungrouped, which is the same invariant Phase 5's
// own ledger is built to uphold (Decision 1 there: SUM() must equal the
// net change to stock_quantity). A friendlier "units sold: 450" is a
// display-layer sign flip, not a data-correctness one, so it stays out of
// this response.
router.get('/inventory', async (request, response) => {
  const { from, to, errors } = parseDateRange(request.query)
  if (Object.keys(errors).length) return response.status(422).json({ message: 'Please correct the highlighted fields.', errors })

  const [movementsResult, spoilageResult, lowStockAlerts] = await Promise.all([
    pool.query(
      `SELECT im.reason, COALESCE(SUM(im.quantity_change), 0)::int AS net_change
         FROM inventory_movements im
        WHERE ${dateRangeSql('im.created_at')}
        GROUP BY im.reason
        ORDER BY im.reason`,
      [from, to],
    ),
    // SPOILAGE gets its own headline figure — for a bakery this is the
    // single most operationally meaningful number in the whole section,
    // and it has been recorded since Phase 5 and never once looked at.
    pool.query(
      `SELECT COALESCE(SUM(-im.quantity_change), 0)::int AS spoiled_units
         FROM inventory_movements im
        WHERE im.reason = 'SPOILAGE' AND ${dateRangeSql('im.created_at')}`,
      [from, to],
    ),
    getLowStockAlerts(),
  ])

  return response.json({
    from,
    to,
    movements: movementsResult.rows.map((row) => ({ reason: row.reason, netChange: row.net_change })),
    spoilageUnits: spoilageResult.rows[0].spoiled_units,
    lowStockAlerts: lowStockAlerts.alerts,
    lowStockAlertsTotal: lowStockAlerts.total,
  })
})

// GET /api/reports/logs?limit=&offset= — ADMIN only, so it needs its own
// requireRole override: the router-wide guard above admits CASHIER too,
// but report_logs.generated_by REFERENCES admins(admin_id), so a cashier
// could never appear in it and has nothing to read here.
//
// This closes the gap the Phase 8 review named and PHASE8_PLAN.md
// recorded: every successful /sales call already writes a row here
// (Decision 4), and until now nothing ever read one back — an audit
// trail nobody could audit, the same shape inventory_movements and
// stock_alerts sat in for three phases before Phase 8 gave them a
// reader. The fix is exactly that: read the ledger, do not recompute or
// "correct" it — the same rule GET /inventory already follows for
// inventory_movements.
//
// Paginated the same way routes/payments.js's GET / is — limit/offset,
// a `full_count` window function, and the same past-the-end fallback —
// because this table only ever grows, never gets pruned, and a bakery
// running for years is exactly the "the offset the caller asked for is
// past the end" case that shape exists for.
router.get('/logs', requireRole('ADMIN'), async (request, response) => {
  const limit = parseLimit(request.query.limit, { defaultLimit: defaultLogsLimit, maxLimit: maxLogsLimit })
  const offset = Math.max(Math.trunc(Number(request.query.offset)) || 0, 0)

  const result = await pool.query(
    `SELECT rl.report_id, rl.report_type, rl.generated_at, a.name AS generated_by_name,
            COUNT(*) OVER()::int AS full_count
       FROM report_logs rl
       JOIN admins a ON a.admin_id = rl.generated_by
      ORDER BY rl.generated_at DESC, rl.report_id DESC
      LIMIT $1 OFFSET $2`,
    [limit, offset],
  )

  // Same two-case reasoning payments.js's own GET / spells out: an EMPTY
  // page means either "there are genuinely no logs" (full_count has no
  // row 0 to come from, but total really is 0) or "these logs exist, this
  // page just isn't one of them" (an offset past the end) — and only the
  // second one needs a second query to answer correctly.
  let total = result.rows[0]?.full_count ?? 0
  if (result.rows.length === 0 && offset > 0) {
    const countResult = await pool.query('SELECT COUNT(*)::int AS n FROM report_logs')
    total = countResult.rows[0].n
  }

  return response.json({
    logs: result.rows.map((row) => ({ id: row.report_id, reportType: row.report_type, generatedAt: row.generated_at, generatedByName: row.generated_by_name })),
    total,
    hasMore: offset + result.rows.length < total,
  })
})

export default router
