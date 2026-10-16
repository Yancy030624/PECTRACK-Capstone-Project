// Production — the Due today schedule. Mounted at /api/production.
//
// Production batches, recipes and ingredients were removed in Phase 10
// (migration 022): the adviser ruled raw-material tracking out of the
// paper's scope, so the system inventories finished products only. What
// stays is the schedule below — open orders by the hour they are due —
// which works from orders alone.
import express from 'express'
import { pool } from '../db.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { billingListSql } from '../lib/billing.js'
import { dateRangeSql, localDateSql, parseDateRange, reportingTimeZone } from '../lib/reporting.js'
import { normalize } from '../lib/validation.js'

const router = express.Router()

router.use(requireAuth, requireRole('ADMIN', 'CASHIER'))

// GET /api/production/schedule?date=YYYY-MM-DD — PHASE10 B5, the "Due
// today" tab. The interview problem it answers (thesis p.9): an order for
// 6:00 whose bread is finished at 7:00. Every open order due on the date
// (Asia/Manila, default today), grouped by the hour it is due, with the
// items summed per product — what has to be ready, by when.
//
// Two more groups exist only for today, because only today can act on
// them: orders with no requested time ("as soon as possible") and orders
// due on an earlier day that are still not ready. An order is "not ready"
// until READY_FOR_PICKUP / OUT_FOR_DELIVERY; ready ones stay listed so the
// hour reads complete, but never count as overdue.
//
// An unpaid DELIVERY order (NO_COD_PLAN) is listed, flagged
// awaitingPayment, but left out of what to make: the bakery does not bake
// a delivery order until it is paid, and confirming it is refused until
// then (routes/orders.js).
const openOrderStatuses = ['PLACED', 'CONFIRMED', 'IN_PRODUCTION', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY']
const notReadyStatuses = ['PLACED', 'CONFIRMED', 'IN_PRODUCTION']
const scheduleOrderLimit = 500

router.get('/schedule', async (request, response) => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: reportingTimeZone }).format(new Date())
  const date = request.query.date == null || request.query.date === '' ? today : normalize(request.query.date)
  const { errors } = parseDateRange({ from: date, to: date })
  if (Object.keys(errors).length) return response.status(422).json({ message: 'Enter a valid date.', errors: { date: 'Enter a valid date (YYYY-MM-DD).' } })
  const isToday = date === today

  const orders = await pool.query(
    `SELECT o.order_id, o.daily_number, o.order_day, o.status, o.order_type, o.requested_fulfillment_time, o.order_date, o.instructions,
            COALESCE(c.name, 'Walk-in') AS customer_name,
            (o.order_type = 'DELIVERY' AND o.total_amount - COALESCE(paid.amount, 0) > 0) AS awaiting_payment,
            CASE
              WHEN o.requested_fulfillment_time IS NULL THEN 'ASAP'
              WHEN o.requested_fulfillment_time < ($1::date)::timestamp AT TIME ZONE '${reportingTimeZone}' THEN 'EARLIER'
              ELSE EXTRACT(HOUR FROM ${localDateSql('o.requested_fulfillment_time')})::int::text
            END AS slot,
            (o.status = ANY($3::order_status[]) AND o.requested_fulfillment_time < CURRENT_TIMESTAMP) AS overdue,
            (o.status = ANY($3::order_status[]) AND o.requested_fulfillment_time >= CURRENT_TIMESTAMP
              AND o.requested_fulfillment_time < CURRENT_TIMESTAMP + INTERVAL '1 hour') AS due_soon
       FROM orders o
       ${billingListSql.join}
       LEFT JOIN customers c ON c.customer_id = o.customer_id
      WHERE o.status = ANY($2::order_status[])
        AND (${dateRangeSql('o.requested_fulfillment_time', { fromParam: '$1', toParam: '$1' })}
             OR ($4 AND o.status = ANY($3::order_status[])
                 AND (o.requested_fulfillment_time IS NULL
                      OR o.requested_fulfillment_time < ($1::date)::timestamp AT TIME ZONE '${reportingTimeZone}')))
      ORDER BY o.requested_fulfillment_time NULLS FIRST, o.order_date, o.order_id
      LIMIT ${scheduleOrderLimit}`,
    [date, openOrderStatuses, notReadyStatuses, isToday],
  )
  const orderIds = orders.rows.map((row) => row.order_id)
  const lines = orderIds.length
    ? await pool.query(
        `SELECT od.order_id, od.product_id, p.product_name, p.variant, od.quantity
           FROM order_details od JOIN products p ON p.product_id = od.product_id
          WHERE od.order_id = ANY($1::bigint[])
          ORDER BY p.product_name, p.variant NULLS FIRST`,
        [orderIds],
      )
    : { rows: [] }
  const linesByOrder = new Map()
  for (const line of lines.rows) {
    if (!linesByOrder.has(line.order_id)) linesByOrder.set(line.order_id, [])
    linesByOrder.get(line.order_id).push({ productId: line.product_id, name: line.product_name, variant: line.variant, quantity: line.quantity })
  }

  // Summed per product, not-ready orders only: what still has to be made.
  const sumItems = (slotOrders) => {
    const totals = new Map()
    for (const order of slotOrders) {
      if (!notReadyStatuses.includes(order.status) || order.awaitingPayment) continue
      for (const item of order.items) {
        const entry = totals.get(item.productId) ?? { ...item, quantity: 0 }
        entry.quantity += item.quantity
        totals.set(item.productId, entry)
      }
    }
    return [...totals.values()].sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name))
  }

  const slots = new Map()
  for (const row of orders.rows) {
    if (!slots.has(row.slot)) slots.set(row.slot, [])
    slots.get(row.slot).push({
      id: row.order_id,
      orderNumber: row.order_id,
      orderDay: row.order_day,
      status: row.status,
      orderType: row.order_type,
      customerName: row.customer_name,
      requestedFulfillmentTime: row.requested_fulfillment_time,
      orderDate: row.order_date,
      instructions: row.instructions,
      overdue: row.overdue === true,
      dueSoon: row.due_soon === true,
      awaitingPayment: row.awaiting_payment === true,
      items: linesByOrder.get(row.order_id) ?? [],
    })
  }
  // Earlier-and-late first, then as-soon-as-possible, then the day by hour.
  const slotRank = (key) => (key === 'EARLIER' ? -2 : key === 'ASAP' ? -1 : Number(key))
  const slotList = [...slots.entries()]
    .sort(([a], [b]) => slotRank(a) - slotRank(b))
    .map(([key, slotOrders]) => ({
      key,
      hour: key === 'EARLIER' || key === 'ASAP' ? null : Number(key),
      orders: slotOrders,
      items: sumItems(slotOrders),
      overdue: key === 'EARLIER' || slotOrders.some((order) => order.overdue),
      dueSoon: slotOrders.some((order) => order.dueSoon),
      notReady: slotOrders.filter((order) => notReadyStatuses.includes(order.status)).length,
    }))

  return response.json({
    date,
    isToday,
    slots: slotList,
    items: sumItems(slotList.flatMap((slot) => slot.orders)),
    counts: {
      orders: orders.rows.length,
      notReady: slotList.reduce((sum, slot) => sum + slot.notReady, 0),
      overdue: orders.rows.filter((row) => row.overdue === true || row.slot === 'EARLIER').length,
    },
    truncated: orders.rows.length === scheduleOrderLimit,
  })
})

export default router
