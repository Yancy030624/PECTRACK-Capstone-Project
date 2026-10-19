// GET /api/notifications — what the header bell shows (NOTIFICATIONS_PLAN.md,
// N3). Mounted at /api/notifications.
//
// The feed is DERIVED, not stored: every event below already has its own
// timestamp in the database (an order's order_date, a delivery's
// delivered_at, a status history row's updated_at...), so there is no
// notifications table and no write path that could forget to add a row.
// "Seen" is kept per device by the bell, as CLIENT_REVISIONS_PLAN R4 chose.
//
// The admin and cashier hear about orders, online payments, and deliveries.
// A driver hears about the deliveries assigned to them. Customers are told
// by email instead (lib/notices.js) and are refused here.
//
// Each event carries the facts, not a sentence: the screen words it, with
// the same order label (#7, or #7 · Oct 15 on another day) and peso format
// as every other screen.
import express from 'express'
import { pool } from '../db.js'
import { requireAuth, requireRole } from '../lib/auth.js'

const router = express.Router()

const feedLimit = 20

router.use(requireAuth, requireRole('ADMIN', 'CASHIER', 'DELIVERY_PERSONNEL'))

// Compared at millisecond precision, like GET /api/orders/recent: the time
// the bell sends back came from JSON, which drops Postgres's microseconds,
// so the event it came from would otherwise count as newer than itself.
// Nothing older than a week is news, whatever `since` says; that also keeps
// a poll every 20 seconds from reading the whole history.
const after = (column) => `${column} > CURRENT_TIMESTAMP - INTERVAL '7 days' AND ($1::timestamptz IS NULL OR date_trunc('milliseconds', ${column}) > $1)`

// The person behind a user id, whatever their role. A status history row
// or a payment names a users(user_id), not a role-specific id.
const actorJoin = (userColumn) => `
  LEFT JOIN users au ON au.user_id = ${userColumn}
  LEFT JOIN admins aa ON aa.user_id = au.user_id
  LEFT JOIN cashiers ac ON ac.user_id = au.user_id
  LEFT JOIN customers acu ON acu.user_id = au.user_id
  LEFT JOIN delivery_personnel adp ON adp.user_id = au.user_id`
const actorColumns = `COALESCE(aa.name, ac.name, acu.name, adp.name) AS actor_name, au.user_type AS actor_type`

const orderColumns = `o.order_id, o.daily_number, o.order_day, o.order_type, o.total_amount, o.status AS order_status, COALESCE(c.name, o.guest_name) AS customer_name`

// $1 since (or null), $2 the viewer's user id, $3 the limit. Every query
// leaves out what the viewer did themselves, which also gives Postgres a
// type for $2.
const staffQueries = {
  // Orders placed by anyone but the viewer (a cashier knows about the
  // walk-in order they just rang up). Synthetic history (data_source
  // ASSUMED) never counts as news. Payment first: an order counts once it
  // is paid — an online checkout's placed time becomes the time it was
  // paid — so a checkout still being paid, or one let go unpaid, is not.
  order_placed: `
    SELECT ${orderColumns}, o.order_id AS source_id, o.order_date AS at
      FROM orders o
      LEFT JOIN customers c ON c.customer_id = o.customer_id
      LEFT JOIN cashiers pc ON pc.cashier_id = o.processed_by
     WHERE ${after('o.order_date')} AND o.data_source = 'RECORDED' AND pc.user_id IS DISTINCT FROM $2::bigint
       AND o.status NOT IN ('AWAITING_PAYMENT', 'CANCELLED')
     ORDER BY at DESC LIMIT $3`,
  // A GCash payment that arrived for an order already cancelled (a
  // checkout let go before its payment landed): staff must settle it. A
  // normal online payment is the new order itself, announced above.
  payment_received: `
    SELECT ${orderColumns}, p.payment_id AS source_id, p.payment_date AS at, p.amount, p.payment_method
      FROM payments p
      JOIN orders o ON o.order_id = p.order_id
      LEFT JOIN customers c ON c.customer_id = o.customer_id
     WHERE p.status = 'PAID' AND p.gateway_reference IS NOT NULL AND p.payment_date IS NOT NULL
       AND o.status = 'CANCELLED'
       AND ${after('p.payment_date')} AND p.recorded_by IS DISTINCT FROM $2::bigint
     ORDER BY at DESC LIMIT $3`,
  // Leaving the bakery, from the order's own history. Not the viewer's own
  // changes. (Paid orders cannot be cancelled, so there is no cancel news.)
  order_history: `
    SELECT ${orderColumns}, h.history_id AS source_id, h.updated_at AS at, h.status AS history_status, h.note, ${actorColumns}
      FROM order_status_history h
      JOIN orders o ON o.order_id = h.order_id
      LEFT JOIN customers c ON c.customer_id = o.customer_id
      ${actorJoin('h.updated_by')}
     WHERE h.status = 'OUT_FOR_DELIVERY' AND ${after('h.updated_at')} AND h.updated_by <> $2::bigint
     ORDER BY at DESC LIMIT $3`,
  delivered: `
    SELECT ${orderColumns}, d.delivery_id AS source_id, d.delivered_at AS at,
           dp.name AS actor_name, a.recipient_name, a.barangay
      FROM deliveries d
      JOIN orders o ON o.order_id = d.order_id
      LEFT JOIN customers c ON c.customer_id = o.customer_id
      LEFT JOIN delivery_personnel dp ON dp.delivery_personnel_id = d.delivery_personnel_id
      LEFT JOIN customer_addresses a ON a.address_id = o.address_id
     WHERE d.status = 'DELIVERED' AND d.delivered_at IS NOT NULL AND ${after('d.delivered_at')} AND dp.user_id IS DISTINCT FROM $2::bigint
     ORDER BY at DESC LIMIT $3`,
  // A delivery failed because its order was cancelled is already told as
  // the cancellation; it is not a second piece of news.
  delivery_failed: `
    SELECT ${orderColumns}, d.delivery_id AS source_id, d.failed_at AS at,
           dp.name AS actor_name, d.note
      FROM deliveries d
      JOIN orders o ON o.order_id = d.order_id
      LEFT JOIN customers c ON c.customer_id = o.customer_id
      LEFT JOIN delivery_personnel dp ON dp.delivery_personnel_id = d.delivery_personnel_id
     WHERE d.failed_at IS NOT NULL AND o.status <> 'CANCELLED' AND ${after('d.failed_at')}
       AND dp.user_id IS DISTINCT FROM $2::bigint
     ORDER BY at DESC LIMIT $3`,
  // Due within the hour (the user, 2026-10-16): a paid order still to be
  // picked up or delivered whose requested time is an hour away or less.
  // The event's time is one hour before it is needed, so it is announced
  // once, when that moment comes. $2 is not used here; it is cast so the
  // query keeps the same three parameters as the others.
  due_soon: `
    SELECT ${orderColumns}, o.order_id AS source_id, o.requested_fulfillment_time - INTERVAL '1 hour' AS at,
           o.requested_fulfillment_time AS needed_at
      FROM orders o
      LEFT JOIN customers c ON c.customer_id = o.customer_id
     WHERE o.status IN ('READY_FOR_PICKUP', 'READY_FOR_DELIVERY') AND o.requested_fulfillment_time IS NOT NULL
       AND o.requested_fulfillment_time - INTERVAL '1 hour' <= CURRENT_TIMESTAMP
       AND ${after("o.requested_fulfillment_time - INTERVAL '1 hour'")} AND $2::bigint IS NOT NULL
     ORDER BY at DESC LIMIT $3`,
}

// $1 since (or null), $2 the driver's delivery_personnel_id, $3 the limit.
// A delivery the admin sends back to the queue loses its driver, so it
// leaves this feed too — the driver sees it gone from My Deliveries.
const driverQuery = `
  SELECT ${orderColumns}, d.delivery_id AS source_id, d.assigned_at AS at, a.recipient_name, a.barangay
    FROM deliveries d
    JOIN orders o ON o.order_id = d.order_id
    LEFT JOIN customers c ON c.customer_id = o.customer_id
    LEFT JOIN customer_addresses a ON a.address_id = o.address_id
   WHERE d.delivery_personnel_id = $2 AND d.assigned_at IS NOT NULL AND ${after('d.assigned_at')}
   ORDER BY at DESC LIMIT $3`

// The driver's latest note only: deliveries.note keeps every note, one per
// line, and the newest is the reason for this failure.
const lastLine = (text) => (text ? text.split('\n').at(-1).slice(0, 120) : null)

function mapEvent(type, row) {
  const at = new Date(row.at)
  return {
    // Unique per event. An assignment includes its time, so a delivery
    // assigned to the same driver again after a retry is news again.
    key: type === 'assigned' ? `${type}:${row.source_id}:${at.getTime()}` : `${type}:${row.source_id}`,
    type,
    at: at.toISOString(),
    orderId: row.order_id,
    orderNumber: row.order_id,
    orderDay: row.order_day,
    orderType: row.order_type,
    orderStatus: row.order_status,
    customerName: row.customer_name,
    totalAmount: row.total_amount,
    ...(row.amount != null && { amount: row.amount, paymentMethod: row.payment_method }),
    ...(row.actor_name !== undefined && { actorName: row.actor_name, actorIsCustomer: row.actor_type === 'CUSTOMER' }),
    ...(row.recipient_name !== undefined && { recipientName: row.recipient_name, barangay: row.barangay }),
    ...(row.note !== undefined && { note: type === 'delivery_failed' ? lastLine(row.note) : row.note }),
    ...(row.needed_at !== undefined && { neededAt: new Date(row.needed_at).toISOString() }),
  }
}

router.get('/', async (request, response) => {
  const since = request.query.since
  let sinceDate = null
  if (since != null && since !== '') {
    sinceDate = new Date(String(since))
    if (Number.isNaN(sinceDate.getTime())) return response.status(422).json({ message: 'Enter a valid time.', errors: { since: 'Enter a valid time.' } })
  }

  let events
  if (request.user.role === 'DELIVERY PERSONNEL') {
    const personnel = await pool.query('SELECT delivery_personnel_id FROM delivery_personnel WHERE user_id = $1', [request.user.id])
    const personnelId = personnel.rows[0]?.delivery_personnel_id
    if (!personnelId) return response.json({ notifications: [] })
    const result = await pool.query(driverQuery, [sinceDate, personnelId, feedLimit])
    events = result.rows.map((row) => mapEvent('assigned', row))
  } else {
    const results = await Promise.all(
      Object.entries(staffQueries).map(async ([name, sql]) => [name, (await pool.query(sql, [sinceDate, request.user.id, feedLimit])).rows]),
    )
    events = results.flatMap(([name, rows]) => rows.map((row) => {
      if (name !== 'order_history') return mapEvent(name, row)
      return mapEvent(row.history_status === 'CANCELLED' ? 'order_cancelled' : 'out_for_delivery', row)
    }))
  }

  events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
  return response.json({ notifications: events.slice(0, feedLimit) })
})

export default router
