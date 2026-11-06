// Moving a delivery order along. Mounted at /api/deliveries. Staff mark it
// out for delivery, then delivered, from Order Management (the panel,
// 2026-10-26; MINOR_REVISIONS_PLAN.md M13). There are no rider accounts.
//
// deliveries.status is the SOURCE OF TRUTH for a delivery order's progress
// (Decision 2); orders.status is synced FROM it, one direction only
// (Pattern F): OUT_FOR_DELIVERY, and DELIVERED on a fully paid order, which
// completes it (NOTIFICATIONS_PLAN.md, N2). FAILED, an admin calling a
// delivery back, returns the delivery to waiting and its order to
// READY_FOR_DELIVERY, so it can go out again.
import express from 'express'
import { pool } from '../db.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { billingListSql, getBillingSummary, mapBillingColumns } from '../lib/billing.js'
import { sendDeliveredEmail, sendDeliveryFailedEmail, sendInBackground, sendOutForDeliveryEmail } from '../lib/notices.js'
import { normalize, parseId } from '../lib/validation.js'

const router = express.Router()

const deliveryStatuses = new Set(['PENDING_ASSIGNMENT', 'ASSIGNED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED'])
// An order in one of these is finished; its delivery must not move
// forward any more (see the order-status guard in PATCH /:id/status).
const terminalOrderStatuses = new Set(['COMPLETED', 'CANCELLED'])
const noteMaxLength = 500
// deliveries.note accumulates rather than being overwritten (a failure
// reason plus the reason it was retried are BOTH worth keeping — there is
// no delivery_status_history table to recover either from), so the stored
// column needs its own ceiling on top of the per-message one.
const storedNoteMaxLength = 2000

// Who may make which move, and the states each may move FROM. The admin and
// a cashier send a delivery out and mark it delivered. An ADMIN also has two
// recovery moves: call a delivery back, and retry a failed one.
const adminTransitions = {
  PENDING_ASSIGNMENT: ['FAILED'],
  FAILED: ['ASSIGNED', 'OUT_FOR_DELIVERY'],
}
// PENDING_ASSIGNMENT and ASSIGNED are older status names that now both mean
// "waiting to go out"; an old row may hold either.
const staffTransitions = {
  OUT_FOR_DELIVERY: ['PENDING_ASSIGNMENT', 'ASSIGNED'],
  DELIVERED: ['OUT_FOR_DELIVERY'],
}

const mapDeliveryRow = (row) => ({
  id: row.delivery_id,
  orderId: row.order_id,
  // The daily order number people see (CLIENT_REVISIONS_PLAN.md, R4).
  orderNumber: row.order_id,
  orderDay: row.order_day,
  orderStatus: row.order_status,
  totalAmount: row.total_amount,
  customerName: row.customer_name,
  // The account holder's own number, for when the recipient named on the
  // address does not answer (NOTIFICATIONS_PLAN.md, N6). The emails stay
  // server-side: the notices below read them from the row, never the API.
  customerContactNumber: row.customer_contact_num,
  status: row.status,
  deliveredAt: row.delivered_at,
  failedAt: row.failed_at,
  note: row.note,
  // What the customer asked for, and whether it is paid. Same lib/billing.js
  // columns the order list uses, never a second SUM written out here.
  instructions: row.instructions,
  requestedFulfillmentTime: row.requested_fulfillment_time,
  ...mapBillingColumns(row),
  address: {
    label: row.label,
    recipientName: row.recipient_name,
    contactNumber: row.contact_num,
    addressLine1: row.address_line_1,
    addressLine2: row.address_line_2,
    barangay: row.barangay,
    municipality: row.municipality,
    province: row.province,
    postalCode: row.postal_code,
    deliveryNotes: row.delivery_notes,
  },
})

// The items on each order, for the customer's email. One query for all the
// deliveries, not one per delivery.
async function withItems(rows) {
  const deliveries = rows.map(mapDeliveryRow)
  const orderIds = [...new Set(deliveries.map((delivery) => delivery.orderId))]
  if (orderIds.length === 0) return deliveries
  const lines = await pool.query(
    `SELECT od.order_id, p.product_name, p.variant, od.quantity
       FROM order_details od JOIN products p ON p.product_id = od.product_id
      WHERE od.order_id = ANY($1::bigint[])
      ORDER BY p.product_name, p.variant NULLS FIRST`,
    [orderIds],
  )
  const byOrder = new Map()
  for (const line of lines.rows) {
    if (!byOrder.has(line.order_id)) byOrder.set(line.order_id, [])
    byOrder.get(line.order_id).push({ name: line.product_name, variant: line.variant, quantity: line.quantity })
  }
  return deliveries.map((delivery) => ({ ...delivery, items: byOrder.get(delivery.orderId) ?? [] }))
}

const deliverySelectQuery = `SELECT d.delivery_id, d.order_id,
            d.status, d.delivered_at, d.failed_at, d.note,
            o.status AS order_status, o.daily_number, o.order_day, o.total_amount, o.instructions, o.requested_fulfillment_time, COALESCE(c.name, o.guest_name) AS customer_name,
            c.contact_num AS customer_contact_num, c.email AS customer_email, c.email_verified_at AS customer_email_verified_at,
            a.label, a.recipient_name, a.contact_num, a.address_line_1, a.address_line_2,
            a.barangay, a.municipality, a.province, a.postal_code, a.delivery_notes,
            ${billingListSql.columns}
       FROM deliveries d
       JOIN orders o ON o.order_id = d.order_id
       ${billingListSql.join}
       LEFT JOIN customers c ON c.customer_id = o.customer_id
       LEFT JOIN customer_addresses a ON a.address_id = o.address_id`

router.use(requireAuth, requireRole('ADMIN', 'CASHIER'))

// The customer's email for a delivery that moved (NOTIFICATIONS_PLAN.md,
// N5): on the way, delivered, or failed. Back to the queue says nothing;
// the customer hears again when it leaves. Only to a confirmed email, and
// never about a cancelled order (an admin tidying up its delivery).
const customerNoticeFor = {
  OUT_FOR_DELIVERY: ['on-the-way', (row, delivery) => sendOutForDeliveryEmail({ to: row.customer_email, name: delivery.customerName, order: delivery, address: delivery.address, items: delivery.items })],
  DELIVERED: ['delivered', (row, delivery) => sendDeliveredEmail({ to: row.customer_email, name: delivery.customerName, order: delivery, deliveredAt: delivery.deliveredAt, address: delivery.address })],
  FAILED: ['delivery failed', (row, delivery) => sendDeliveryFailedEmail({ to: row.customer_email, name: delivery.customerName, order: delivery })],
}

// PATCH /api/deliveries/:id/status: staff send a delivery out and mark it
// delivered. An ADMIN may also call one back or retry a failed one, and must
// say why.
router.patch('/:id/status', async (request, response) => {
  const deliveryId = parseId(request.params.id)
  if (!deliveryId) return response.status(404).json({ message: 'Delivery not found.' })

  const status = request.body.status
  if (!deliveryStatuses.has(status)) return response.status(422).json({ message: 'Enter a valid delivery status.', errors: { status: 'Enter a valid delivery status.' } })

  const note = request.body.note == null ? null : normalize(request.body.note).slice(0, noteMaxLength) || null

  const isAdmin = request.user.role === 'ADMIN'
  const staffMove = staffTransitions[status]
  const allowedFrom = staffMove ?? (isAdmin ? adminTransitions[status] : undefined)
  if (!allowedFrom) {
    // A move that exists for the admin is a permission problem (403); one
    // that exists for nobody is a bad request (422).
    if (adminTransitions[status] && !isAdmin) return response.status(403).json({ message: 'Only an admin can call back or retry a delivery.' })
    return response.status(422).json({ message: 'Enter a valid delivery status.', errors: { status: 'Enter a valid delivery status.' } })
  }
  // Both admin transitions are recoveries from something going wrong, and
  // deliveries.note is the only place that reason can be recorded.
  if (isAdmin && !staffMove && !note) return response.status(422).json({ message: 'Explain why this delivery is being changed.', errors: { note: 'Explain why this delivery is being changed.' } })

  // deliveries.order_id is immutable — nothing in this app ever updates
  // it — so reading it outside the transaction is safe, and it is what
  // lets the transaction below take the ORDER row's lock FIRST.
  const existing = await pool.query('SELECT order_id FROM deliveries WHERE delivery_id = $1', [deliveryId])
  if (!existing.rows[0]) return response.status(404).json({ message: 'Delivery not found.' })
  const orderId = existing.rows[0].order_id

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // ------------------------------------------------------------------
    // LOCK THE ORDER ROW FIRST — BEFORE TOUCHING THE DELIVERY.
    //
    // This ordering is not incidental, it is the whole point. Two write
    // paths touch both `orders` and `deliveries` for the same pair of
    // rows: PATCH /api/orders/:id -> CANCELLED (which claims the order,
    // then fails its delivery — Decision 6) and this route (which moves
    // the delivery, then syncs the order — Pattern F). If they take those
    // two locks in OPPOSITE orders, a cancel racing a "send out" is a textbook ABBA deadlock: each holds the row the other
    // is waiting for, Postgres picks a victim and kills it with 40P01, and
    // that reaches the user as a generic 500. Reproduced deterministically
    // before this line existed.
    //
    // Taking the ORDER lock first here makes both paths agree: orders,
    // then deliveries. It is also the convention the rest of this codebase
    // already follows — POST /api/payments opens by locking the same order
    // row, and addresses.js locks the parent customer row for the same
    // "protect a fact about the collection" reason.
    // ------------------------------------------------------------------
    const orderLock = await client.query('SELECT status FROM orders WHERE order_id = $1 FOR UPDATE', [orderId])
    const orderStatus = orderLock.rows[0].status

    // A finished order's delivery must not move forward. Decision 6
    // normally makes this unreachable (cancelling an order fails its
    // delivery), but the admin retry could otherwise send that failed
    // delivery straight back into the assignment queue — resurrecting
    // work for an order nobody should be delivering, which is the exact
    // thing Decision 6 exists to prevent. FAILED stays allowed so an
    // admin can still tidy up a stuck delivery on a cancelled order.
    if (status !== 'FAILED' && terminalOrderStatuses.has(orderStatus)) {
      await client.query('ROLLBACK')
      return response.status(409).json({ message: `This order is already ${orderStatus.toLowerCase()} — its delivery cannot be moved any further.` })
    }
    // Staff send out only a paid order that is ready (M13).
    if (staffMove && status === 'OUT_FOR_DELIVERY' && orderStatus !== 'READY_FOR_DELIVERY') {
      await client.query('ROLLBACK')
      return response.status(409).json({ message: 'Only a paid order that is ready for delivery can be sent out.' })
    }

    const claimed = await client.query(
      `UPDATE deliveries
          SET status = $1::delivery_status,
              note = left(CASE WHEN $2::text IS NULL THEN note
                               WHEN note IS NULL OR note = '' THEN $2::text
                               ELSE note || chr(10) || $2::text END, $3),
              delivery_personnel_id = CASE WHEN $1::delivery_status = 'PENDING_ASSIGNMENT' THEN NULL ELSE delivery_personnel_id END,
              assigned_at = CASE WHEN $1::delivery_status = 'PENDING_ASSIGNMENT' THEN NULL ELSE assigned_at END,
              delivered_at = CASE WHEN $1::delivery_status = 'DELIVERED' THEN CURRENT_TIMESTAMP ELSE delivered_at END,
              failed_at = CASE WHEN $1::delivery_status = 'FAILED' THEN CURRENT_TIMESTAMP
                               WHEN $1::delivery_status = 'PENDING_ASSIGNMENT' THEN NULL ELSE failed_at END
        WHERE delivery_id = $4
          AND status = ANY($5::delivery_status[])
      RETURNING delivery_id`,
      [status, note, storedNoteMaxLength, deliveryId, allowedFrom],
    )
    if (claimed.rowCount === 0) {
      await client.query('ROLLBACK')
      return response.status(409).json({ message: 'This delivery is no longer in a state that allows that change — reload it and try again.' })
    }

    // PATTERN F — the order follows its delivery, one direction only, in
    // the SAME transaction as the delivery transition so the two can never
    // disagree.
    if (status === 'OUT_FOR_DELIVERY') {
      await client.query(
        `UPDATE orders SET status = 'OUT_FOR_DELIVERY' WHERE order_id = $1 AND status NOT IN ('COMPLETED', 'CANCELLED')`,
        [orderId],
      )
      await client.query(
        'INSERT INTO order_status_history (order_id, updated_by, status, note) VALUES ($1, $2, $3, $4)',
        [orderId, request.user.id, 'OUT_FOR_DELIVERY', note],
      )
    }

    // FAILED (an admin called it back): the order is paid and still to be delivered, so it goes back
    // to READY_FOR_DELIVERY — off the road, into Ready for delivery again.
    // Without this it stayed "Out for delivery" for good (the user,
    // 2026-10-16). A cancelled or completed order is left alone.
    if (status === 'FAILED') {
      // Waiting to go out again at once. failed_at and the note
      // stay: they are the record that this attempt failed, and why (the
      // staff bell announces it from failed_at). A cancelled or completed
      // order's delivery stays FAILED — there is nothing to deliver.
      if (!terminalOrderStatuses.has(orderStatus)) {
        await client.query(
          `UPDATE deliveries SET status = 'PENDING_ASSIGNMENT', delivery_personnel_id = NULL, assigned_at = NULL WHERE delivery_id = $1`,
          [deliveryId],
        )
      }
      const back = await client.query(
        `UPDATE orders SET status = 'READY_FOR_DELIVERY' WHERE order_id = $1 AND status = 'OUT_FOR_DELIVERY' RETURNING order_id`,
        [orderId],
      )
      if (back.rowCount) {
        await client.query(
          'INSERT INTO order_status_history (order_id, updated_by, status, note) VALUES ($1, $2, $3, $4)',
          [orderId, request.user.id, 'READY_FOR_DELIVERY', note ? `Delivery failed: ${note}` : 'Delivery failed — back to ready for delivery.'],
        )
      }
    }

    // DELIVERED completes the order (NOTIFICATIONS_PLAN.md, N2). PHASE7
    // Decision 4 kept them apart because a cash-on-delivery order was still
    // unpaid at the door. There is no cash on delivery any more: an order
    // goes out only once fully paid, and a paid order can't be
    // cancelled. Billing is still asked, under the order lock taken above,
    // so an unpaid order from old data stays OUT_FOR_DELIVERY for staff to
    // settle and complete by hand (PATCH /api/orders/:id, which checks the
    // same two things).
    if (status === 'DELIVERED') {
      const billing = await getBillingSummary(client, orderId)
      if (billing.isFullyPaid) {
        const completed = await client.query(
          `UPDATE orders SET status = 'COMPLETED' WHERE order_id = $1 AND status NOT IN ('COMPLETED', 'CANCELLED')`,
          [orderId],
        )
        if (completed.rowCount) {
          await client.query(
            'INSERT INTO order_status_history (order_id, updated_by, status, note) VALUES ($1, $2, $3, $4)',
            [orderId, request.user.id, 'COMPLETED', 'Completed on delivery.'],
          )
        }
      }
    }

    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }

  const updated = await pool.query(`${deliverySelectQuery} WHERE d.delivery_id = $1`, [deliveryId])
  const delivery = (await withItems(updated.rows))[0]

  const row = updated.rows[0]
  const notice = customerNoticeFor[status]
  if (notice && row.customer_email && row.customer_email_verified_at && row.order_status !== 'CANCELLED') {
    const [what, send] = notice
    sendInBackground(what, () => send(row, delivery))
  }
  return response.json({ delivery })
})

export default router
