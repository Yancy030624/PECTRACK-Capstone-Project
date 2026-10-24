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
import { logExport, PRINT_TYPES } from '../lib/exportLog.js'

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

// The Inventory report's "Low stock now" list — PAPER_VS_SYSTEM.md H5.
//
// Low stock is read LIVE from inventory (stock at or under its minimum),
// the same rule the Dashboard and the Inventory screen use
// (src/lib/stockHealth.js; routes/inventory.js's lowStock). It used to
// count open rows in stock_alerts instead — a second source for the same
// fact. stock_alerts is still written (lib/inventory.js) and stays as the
// history of when each product went low and recovered.
//
// Returns { alerts, total }: the capped list to render, worst first, and
// the true count, so a long list never quietly under-reports.
async function getLowStockAlerts() {
  const lowSql = 'inv.stock_quantity <= inv.min_stock_level'
  const [listResult, countResult] = await Promise.all([
    pool.query(
      `SELECT p.product_id, p.product_name, p.variant, inv.stock_quantity, inv.min_stock_level, inv.last_updated
         FROM inventory inv
         JOIN products p ON p.product_id = inv.product_id
        WHERE ${lowSql}
        ORDER BY inv.stock_quantity - inv.min_stock_level, p.product_name
        LIMIT $1`,
      [maxLowStockAlerts],
    ),
    pool.query(`SELECT COUNT(*)::int AS n FROM inventory inv WHERE ${lowSql}`),
  ])
  return {
    alerts: listResult.rows.map((row) => ({
      id: row.product_id,
      productId: row.product_id,
      productName: row.product_name,
      variant: row.variant,
      stockQuantity: row.stock_quantity,
      minStockLevel: row.min_stock_level,
      alertMessage: row.stock_quantity === 0 ? 'Out of stock' : `${row.stock_quantity} left, minimum ${row.min_stock_level}`,
      createdAt: row.last_updated,
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

// GET /api/reports/sales?from=&to=&groupBy=day|week|month[&format=csv]
//
// The money the bakery received (RULES-PLANS/REPORTS_UI_PLAN.md, U3, the
// user 2026-10-25). Since payment first, an order is paid in full when it is
// placed or collected, so "ordered" and "collected" were the same figure
// drawn twice; and there are no refunds (CLIENT_REVISIONS_PLAN.md R2). The
// report is now one thing: PAID payments, dated by payment_date.
//
//   sales         money received, delivery fees taken out
//   orders        orders that received money in the range
//   averageOrder  sales ÷ orders
//   deliveryFees  the fees inside that money (DELIVERY_FEE_PLAN.md)
//   unpaidCash    cash pickups placed in the range and still not paid
//   byMethod      sales and orders by payment method (CASH, GCASH)
//   byType        by kind of order: WALK_IN (rung up at the counter, an
//                 advanced order included), PICKUP (online), DELIVERY
//
// A payment's share of the fee is delivery_fee × amount ÷ total_amount:
// exact for an order paid in one payment, which payment first makes every
// order, and still fair for an older one paid in parts. Every figure is
// computed in Postgres NUMERIC. Practice orders (ASSUMED) never count
// (ANALYTICS_PLAN.md A1).
const paidInRangeSql = (range) => `
  SELECT p.payment_id, p.payment_date, p.payment_method, o.order_id, o.order_type, o.processed_by,
         p.amount * o.delivery_fee / NULLIF(o.total_amount, 0) AS fee_share,
         p.amount - COALESCE(p.amount * o.delivery_fee / NULLIF(o.total_amount, 0), 0) AS goods
    FROM payments p JOIN orders o ON o.order_id = p.order_id
   WHERE o.data_source = 'RECORDED' AND p.status = 'PAID' AND ${range}`
const orderKindSql = `CASE WHEN order_type = 'DELIVERY' THEN 'DELIVERY' WHEN processed_by IS NOT NULL THEN 'WALK_IN' ELSE 'PICKUP' END`

router.get('/sales', async (request, response) => {
  const { from, to, errors: dateErrors } = parseDateRange(request.query)
  const { groupBy, error: groupByError } = parseGroupBy(request.query.groupBy)
  const errors = { ...dateErrors }
  if (groupByError) errors.groupBy = groupByError
  const format = normalize(request.query.format).toLowerCase() || 'json'
  if (format !== 'json' && format !== 'csv') errors.format = 'format must be json or csv.'
  if (Object.keys(errors).length) return response.status(422).json({ message: 'Please correct the highlighted fields.', errors })

  const paid = paidInRangeSql(dateRangeSql('p.payment_date'))
  const [bucketsResult, totalsResult, methodResult, typeResult, unpaidResult] = await Promise.all([
    pool.query(
      `SELECT ${bucketSql('payment_date', groupBy)} AS period,
              COUNT(DISTINCT order_id)::int AS orders,
              COALESCE(SUM(goods), 0)::numeric(12,2) AS sales,
              COALESCE(SUM(fee_share), 0)::numeric(12,2) AS delivery_fees
         FROM (${paid}) paid
        GROUP BY 1 ORDER BY 1`,
      [from, to],
    ),
    pool.query(
      `SELECT COUNT(DISTINCT order_id)::int AS orders,
              COALESCE(SUM(goods), 0)::numeric(12,2) AS sales,
              COALESCE(SUM(fee_share), 0)::numeric(12,2) AS delivery_fees,
              COALESCE(SUM(goods) / NULLIF(COUNT(DISTINCT order_id), 0), 0)::numeric(12,2) AS average_order
         FROM (${paid}) paid`,
      [from, to],
    ),
    pool.query(
      `SELECT payment_method AS key, COUNT(DISTINCT order_id)::int AS orders, COALESCE(SUM(goods), 0)::numeric(12,2) AS sales
         FROM (${paid}) paid GROUP BY 1 ORDER BY 1`,
      [from, to],
    ),
    pool.query(
      `SELECT ${orderKindSql} AS key, COUNT(DISTINCT order_id)::int AS orders, COALESCE(SUM(goods), 0)::numeric(12,2) AS sales
         FROM (${paid}) paid GROUP BY 1 ORDER BY 1`,
      [from, to],
    ),
    // Cash at pickup (SENIOR_CONSULT_PLAN.md S3): placed, ready, not paid.
    pool.query(
      `SELECT COUNT(*)::int AS orders, COALESCE(SUM(o.total_amount), 0)::numeric(12,2) AS amount
         FROM orders o
        WHERE o.data_source = 'RECORDED' AND o.payment_mode = 'CASH' AND o.status NOT IN ('CANCELLED', 'COMPLETED', 'AWAITING_PAYMENT')
          AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.order_id = o.order_id AND p.status = 'PAID')
          AND ${dateRangeSql('o.order_date')}`,
      [from, to],
    ),
  ])

  const buckets = bucketsResult.rows.map((row) => ({ period: row.period, orders: row.orders, sales: row.sales, deliveryFees: row.delivery_fees }))
  const totalsRow = totalsResult.rows[0]
  const totals = {
    sales: totalsRow.sales,
    orders: totalsRow.orders,
    averageOrder: totalsRow.average_order,
    deliveryFees: totalsRow.delivery_fees,
    unpaidCash: { orders: unpaidResult.rows[0].orders, amount: unpaidResult.rows[0].amount },
  }
  const breakdown = (rows, keys) => keys.map((key) => {
    const row = rows.find((entry) => entry.key === key)
    return { key, orders: row?.orders ?? 0, sales: row?.sales ?? '0.00' }
  })
  const byMethod = breakdown(methodResult.rows, ['CASH', 'GCASH'])
  const byType = breakdown(typeResult.rows, ['WALK_IN', 'PICKUP', 'DELIVERY'])

  // The export history (REPORTS_UI_PLAN.md U2): viewing the report is not
  // logged; downloading its CSV is, for any role (lib/exportLog.js).
  if (format === 'csv') {
    await logExport(request.user.id, 'SALES_CSV')
    // PATTERN K (lib/reporting.js) — every cell escaped, including
    // against formula injection, because this file is opened on the
    // owner's own machine, not the server's.
    //
    // The Period column names its own grouping rather than the file
    // carrying a title block above the table: a bare '2026-08-31' is
    // ambiguous between one day and the Monday that opens a week bucket,
    // and a preamble would push the real header off row 1 and break a
    // plain spreadsheet import. The date range travels in the filename.
    const typeNames = { WALK_IN: 'Walk-in / counter', PICKUP: 'Online pickup', DELIVERY: 'Delivery' }
    const lines = [
      csvRow([`Period (${groupBy})`, 'Orders', 'Sales (excl. delivery fees)', 'Delivery fees']),
      ...buckets.map((bucket) => csvRow([bucket.period, bucket.orders, bucket.sales, bucket.deliveryFees])),
      '',
      csvRow(['Totals', totals.orders, totals.sales, totals.deliveryFees]),
      csvRow(['Average order', totals.averageOrder]),
      '',
      csvRow(['By payment method', 'Orders', 'Sales']),
      ...byMethod.map((row) => csvRow([row.key === 'GCASH' ? 'GCash' : 'Cash', row.orders, row.sales])),
      '',
      csvRow(['By order type', 'Orders', 'Sales']),
      ...byType.map((row) => csvRow([typeNames[row.key], row.orders, row.sales])),
    ]
    response.type('text/csv')
    response.set('Content-Disposition', `attachment; filename="sales-${from}-to-${to}.csv"`)
    return response.send(lines.join('\r\n'))
  }

  return response.json({ from, to, groupBy, buckets, totals, byMethod, byType })
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
  const [todayResult, outstandingResult, deliveriesResult, kitchen] = await Promise.all([
    pool.query(`
      WITH today_range AS (
        SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date AS local_date,
               (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date::timestamp AT TIME ZONE 'Asia/Manila' AS starts_at,
               ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date + 1)::timestamp AT TIME ZONE 'Asia/Manila' AS ends_at
      ),
      today_orders AS (
        SELECT COUNT(*)::int AS orders_placed, COALESCE(SUM(o.total_amount - o.delivery_fee), 0)::numeric(12,2) AS ordered,
              COALESCE(SUM(o.delivery_fee), 0)::numeric(12,2) AS delivery_fees
          FROM orders o, today_range tr
         WHERE o.data_source = 'RECORDED' AND o.status NOT IN ('CANCELLED', 'AWAITING_PAYMENT') AND o.order_date >= tr.starts_at AND o.order_date < tr.ends_at
      ),
      today_payments AS (
        SELECT COALESCE(SUM(p.amount), 0)::numeric(12,2) AS collected
          FROM payments p JOIN orders o ON o.order_id = p.order_id, today_range tr
         WHERE o.data_source = 'RECORDED' AND p.status = 'PAID' AND p.payment_date >= tr.starts_at AND p.payment_date < tr.ends_at
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
       WHERE o.data_source = 'RECORDED' AND o.status NOT IN ('CANCELLED', 'AWAITING_PAYMENT') AND (o.total_amount - COALESCE(paid.amount, 0)) > 0
    `),
    // Only deliveries someone can still act on: a row whose order is
    // already COMPLETED or CANCELLED cannot be assigned (routes/deliveries.js
    // refuses it), so counting it here sent staff to a queue of dead work.
    // Waiting for a driver only — the Dashboard tile is "Deliveries to
    // assign" and opens exactly this list. An ASSIGNED delivery already
    // has one; it is the driver's to move, not the counter's.
    pool.query(`SELECT COUNT(*)::int AS n FROM deliveries d JOIN orders o ON o.order_id = d.order_id WHERE d.status = 'PENDING_ASSIGNMENT' AND o.status NOT IN ('COMPLETED', 'CANCELLED') AND o.data_source <> 'ASSUMED'`),
    // Orders to prepare (payment first, the adviser 2026-10-16): paid
    // orders still to hand over or send out whose day is today (or came
    // earlier), and those already past the time the customer asked for.
    // The tile opens Order Management on Today; there is no production
    // step any more, the bread is baked before opening.
    //
    // Exactly the orders the tile opens: real ones (not the assumed sales
    // history behind the forecast, which Order Management never lists)
    // whose day is today. An earlier day's open order is closed by the
    // system (lib/staleOrders.js), so counting "today or earlier" only
    // ever added assumed rows the list then hid (the user, 2026-10-22).
    pool.query(`SELECT COUNT(*)::int AS to_prepare,
                       COUNT(*) FILTER (WHERE requested_fulfillment_time < CURRENT_TIMESTAMP)::int AS overdue
                  FROM orders
                 WHERE status IN ('READY_FOR_PICKUP', 'READY_FOR_DELIVERY')
                   AND data_source = 'RECORDED'
                   AND (COALESCE(requested_fulfillment_time, order_date) AT TIME ZONE 'Asia/Manila')::date
                       = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date`),
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
    // Low stock is not here: the Dashboard reads it from
    // /api/inventory through the same rule the Inventory screen filters
    // by (PAPER_VS_SYSTEM.md H4).
    deliveriesNeedingAttention: deliveriesResult.rows[0].n,
    ordersToPrepare: kitchen.rows[0].to_prepare,
    ordersOverdue: kitchen.rows[0].overdue,
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
  // REPORTS_UI_PLAN.md U4: soft and hard breads are stocked differently, so
  // the report can show one kind; and the bakery plans in pieces, so the
  // default ranking is pieces sold, revenue on request.
  const type = normalize(request.query.type).toUpperCase()
  if (type && type !== 'SOFT' && type !== 'HARD') errors.type = 'type must be SOFT or HARD.'
  const sort = normalize(request.query.sort).toLowerCase() || 'quantity'
  if (sort !== 'quantity' && sort !== 'revenue') errors.sort = 'sort must be quantity or revenue.'
  if (Object.keys(errors).length) return response.status(422).json({ message: 'Please correct the highlighted fields.', errors })
  const limit = parseLimit(request.query.limit, { defaultLimit: defaultProductsLimit, maxLimit: maxProductsLimit })
  const orderBy = sort === 'revenue' ? 'revenue DESC, quantity_sold DESC' : 'quantity_sold DESC, revenue DESC'

  const result = await pool.query(
    `SELECT p.product_id, p.product_name, p.variant, p.stock_type,
            SUM(od.quantity)::int AS quantity_sold,
            SUM(od.quantity * od.unit_price)::numeric(12,2) AS revenue
       FROM order_details od
       JOIN orders o ON o.order_id = od.order_id
       JOIN products p ON p.product_id = od.product_id
      WHERE o.data_source = 'RECORDED' AND o.status NOT IN ('CANCELLED', 'AWAITING_PAYMENT') AND ${dateRangeSql('o.order_date')}
        AND ($4::text IS NULL OR p.stock_type::text = $4)
      GROUP BY p.product_id, p.product_name, p.variant, p.stock_type
      ORDER BY ${orderBy}
      LIMIT $3`,
    [from, to, limit, type || null],
  )

  return response.json({
    from,
    to,
    type: type || null,
    sort,
    products: result.rows.map((row) => ({
      productId: row.product_id,
      productName: row.product_name,
      variant: row.variant,
      stockType: row.stock_type,
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

  const [movementsResult, lossResult, lowStockAlerts, ingredientResult] = await Promise.all([
    pool.query(
      `SELECT im.reason, COALESCE(SUM(im.quantity_change), 0)::int AS net_change
         FROM inventory_movements im
        WHERE ${dateRangeSql('im.created_at')}
        GROUP BY im.reason
        ORDER BY im.reason`,
      [from, to],
    ),
    // Stock LOST gets its own headline figure. The bakery keeps no rejects
    // list any more (the client, 2026-10-23): bread thrown away shows as an
    // admin's count corrected DOWN, so those are counted, with the older
    // reject and loss rows for a range that reaches back to them.
    pool.query(
      `SELECT COALESCE(SUM(-im.quantity_change), 0)::int AS lost_units
         FROM inventory_movements im
        WHERE (im.reason IN ('REJECT', 'SPOILAGE', 'PRODUCTION_LOSS', 'EXPIRED', 'DAMAGED')
               OR (im.reason = 'CORRECTION' AND im.quantity_change < 0))
          AND ${dateRangeSql('im.created_at')}`,
      [from, to],
    ),
    // The stock-alert rows (lib/inventory.js), kept in the reply for the
    // older readers. What is low NOW is not part of this report any more
    // (REPORTS_UI_PLAN.md U5): a report covers the range asked for, and the
    // live state is the Inventory screen's and the Dashboard's.
    getLowStockAlerts(),
    // Ingredients (CLIENT_REVISIONS_PLAN.md, R5): what came in, was used,
    // was thrown out, or was corrected by a recount in the range, per
    // ingredient. Amounts are NUMERIC strings, positive except the
    // correction, which keeps its sign.
    pool.query(
      `SELECT i.ingredient_id, i.name, i.unit,
              COALESCE(SUM(m.quantity_change) FILTER (WHERE m.reason = 'RESTOCK'), 0)::text AS restocked,
              COALESCE(-SUM(m.quantity_change) FILTER (WHERE m.reason = 'USAGE'), 0)::text AS used,
              COALESCE(-SUM(m.quantity_change) FILTER (WHERE m.reason = 'REJECT'), 0)::text AS rejected,
              COALESCE(SUM(m.quantity_change) FILTER (WHERE m.reason = 'CORRECTION'), 0)::text AS corrected
         FROM ingredient_movements m
         JOIN ingredients i ON i.ingredient_id = m.ingredient_id
        WHERE ${dateRangeSql('m.created_at')}
        GROUP BY i.ingredient_id, i.name, i.unit
        ORDER BY i.name`,
      [from, to],
    ),
  ])

  return response.json({
    from,
    to,
    movements: movementsResult.rows.map((row) => ({ reason: row.reason, netChange: row.net_change })),
    lossUnits: lossResult.rows[0].lost_units,
    lowStockAlerts: lowStockAlerts.alerts,
    lowStockAlertsTotal: lowStockAlerts.total,
    ingredients: {
      movements: ingredientResult.rows.map((row) => ({ ingredientId: row.ingredient_id, name: row.name, unit: row.unit, restocked: row.restocked, used: row.used, rejected: row.rejected, corrected: row.corrected })),
    },
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
// ===========================================================================
// Peak periods and the analytics export. Both read the ledgers and the
// views migration 014 defines; neither writes.
// ===========================================================================

// GET /api/reports/peak?from=&to=&includeAssumed=true|false —
// PHASE10 B2, the paper's "peak ordering periods" (p.16). Orders counted
// by hour of day and by day of week on the Manila clock, cancelled ones
// excluded.
//
// includeAssumed (default false, REPORTS_UI_PLAN.md U1): the demo seed's
// orders are ASSUMED, and like every other report this one shows real
// orders unless asked. Asked, they are counted and the response says how
// many, so the screen can label the chart the way the forecast is labelled.
// (Until 2026-10-25 they were counted by default, when the system held two
// days of real orders.)
router.get('/peak', async (request, response) => {
  const { from, to, errors } = parseDateRange(request.query)
  if (Object.keys(errors).length) return response.status(422).json({ message: 'Please correct the highlighted fields.', errors })
  const includeAssumed = String(request.query.includeAssumed ?? 'false') === 'true'

  const result = await pool.query(
    `SELECT EXTRACT(HOUR FROM o.order_date AT TIME ZONE 'Asia/Manila')::int AS hour,
            EXTRACT(DOW FROM o.order_date AT TIME ZONE 'Asia/Manila')::int AS weekday,
            o.data_source,
            COUNT(*)::int AS orders
       FROM orders o
      WHERE o.status NOT IN ('CANCELLED', 'AWAITING_PAYMENT') AND ${dateRangeSql('o.order_date')}
        ${includeAssumed ? '' : "AND o.data_source <> 'ASSUMED'"}
      GROUP BY 1, 2, 3`,
    [from, to],
  )

  const byHour = Array.from({ length: 24 }, (_, hour) => ({ hour, orders: 0 }))
  const byWeekday = Array.from({ length: 7 }, (_, weekday) => ({ weekday, orders: 0 }))
  const grid = Array.from({ length: 7 }, () => new Array(24).fill(0))
  let assumedOrders = 0
  let total = 0
  for (const row of result.rows) {
    byHour[row.hour].orders += row.orders
    byWeekday[row.weekday].orders += row.orders
    grid[row.weekday][row.hour] += row.orders
    total += row.orders
    if (row.data_source === 'ASSUMED') assumedOrders += row.orders
  }
  const busiest = (rows, key) => (total === 0 ? null : rows.reduce((best, row) => (row.orders > best.orders ? row : best))[key])

  return response.json({
    from,
    to,
    includeAssumed,
    totalOrders: total,
    assumedOrders,
    byHour,
    byWeekday,
    // [weekday 0 = Sunday][hour]: for a day-by-hour view.
    grid,
    busiestHour: busiest(byHour, 'hour'),
    busiestWeekday: busiest(byWeekday, 'weekday'),
  })
})

// GET /api/reports/analytics?from=&to=&format=json|csv — the analytics
// views joined by (date, product): sales (with the stockout flag) and
// waste, one row per product per day, data_source carried through.
// This is the file a notebook reads; nothing here predicts anything.
router.get('/analytics', async (request, response) => {
  const { from, to, errors } = parseDateRange(request.query)
  const format = normalize(request.query.format).toLowerCase() || 'json'
  if (format !== 'json' && format !== 'csv') errors.format = 'format must be json or csv.'
  if (Object.keys(errors).length) return response.status(422).json({ message: 'Please correct the highlighted fields.', errors })

  const result = await pool.query(
    `WITH days AS (
       SELECT local_date, product_id, data_source FROM analytics_daily_sales
       UNION SELECT local_date, product_id, data_source FROM analytics_daily_waste
     )
     SELECT d.local_date, d.product_id, p.product_name, p.variant, d.data_source,
            COALESCE(s.units_sold, 0) AS units_sold, COALESCE(s.revenue, 0)::numeric(12, 2) AS revenue, COALESCE(s.orders, 0) AS orders,
            COALESCE(s.stocked_out, FALSE) AS stocked_out,
            COALESCE(w.expired, 0) AS expired, COALESCE(w.spoiled, 0) AS spoiled, COALESCE(w.damaged, 0) AS damaged,
            COALESCE(w.production_loss, 0) AS production_loss, COALESCE(w.correction, 0) AS correction,
            COALESCE(w.rejected, 0) AS rejected
       FROM days d
       JOIN products p ON p.product_id = d.product_id
       LEFT JOIN analytics_daily_sales s ON s.local_date = d.local_date AND s.product_id = d.product_id AND s.data_source = d.data_source
       LEFT JOIN analytics_daily_waste w ON w.local_date = d.local_date AND w.product_id = d.product_id AND w.data_source = d.data_source
      WHERE d.local_date >= $1::date AND d.local_date <= $2::date
      ORDER BY d.local_date, p.product_name, p.variant, d.data_source`,
    [from, to],
  )
  const rows = result.rows.map((row) => ({
    date: row.local_date,
    productId: row.product_id,
    productName: row.product_name,
    variant: row.variant,
    dataSource: row.data_source,
    unitsSold: row.units_sold,
    revenue: row.revenue,
    orders: row.orders,
    stockedOut: row.stocked_out,
    expired: row.expired,
    spoiled: row.spoiled,
    damaged: row.damaged,
    productionLoss: row.production_loss,
    correction: row.correction,
    rejected: row.rejected,
  }))

  if (request.user.role === 'ADMIN') {
    try {
      await pool.query(`INSERT INTO report_logs (generated_by, report_type) SELECT admin_id, $1 FROM admins WHERE user_id = $2`, [format === 'csv' ? 'ANALYTICS_CSV' : 'ANALYTICS', request.user.id])
    } catch (error) {
      console.error('Failed to record a report_logs row for an ANALYTICS report:', error)
    }
  }

  if (format === 'csv') {
    const header = ['Date', 'Product ID', 'Product', 'Variant', 'Data source', 'Units sold', 'Revenue', 'Orders', 'Stocked out', 'Expired', 'Spoiled', 'Damaged', 'Production loss', 'Correction', 'Rejected']
    const lines = [csvRow(header), ...rows.map((row) => csvRow([row.date, row.productId, row.productName, row.variant, row.dataSource, row.unitsSold, row.revenue, row.orders, row.stockedOut, row.expired, row.spoiled, row.damaged, row.productionLoss, row.correction, row.rejected]))]
    response.type('text/csv')
    response.set('Content-Disposition', `attachment; filename="analytics-${from}-to-${to}.csv"`)
    return response.send(lines.join('\r\n'))
  }
  return response.json({ from, to, rows })
})

// POST /api/reports/exports { type } — a PDF printed on the screen, which
// the server never sees otherwise (REPORTS_UI_PLAN.md U2). Admin or cashier.
router.post('/exports', async (request, response) => {
  const type = normalize(request.body.type).toUpperCase()
  if (!PRINT_TYPES.includes(type)) return response.status(422).json({ message: 'Unknown export type.', errors: { type: 'Unknown export type.' } })
  await logExport(request.user.id, type)
  return response.status(204).end()
})

router.get('/logs', requireRole('ADMIN'), async (request, response) => {
  const limit = parseLimit(request.query.limit, { defaultLimit: defaultLogsLimit, maxLimit: maxLogsLimit })
  const offset = Math.max(Math.trunc(Number(request.query.offset)) || 0, 0)

  const result = await pool.query(
    `SELECT rl.report_id, rl.report_type, rl.generated_at, u.user_type,
            COALESCE(a.name, c.name, u.username) AS generated_by_name,
            COUNT(*) OVER()::int AS full_count
       FROM report_logs rl
       LEFT JOIN users u ON u.user_id = rl.user_id
       LEFT JOIN admins a ON a.user_id = rl.user_id
       LEFT JOIN cashiers c ON c.user_id = rl.user_id
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
    logs: result.rows.map((row) => ({ id: row.report_id, reportType: row.report_type, generatedAt: row.generated_at, generatedByName: row.generated_by_name, role: row.user_type })),
    total,
    hasMore: offset + result.rows.length < total,
  })
})

export default router
