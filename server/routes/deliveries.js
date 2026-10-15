// Delivery assignment, the driver's own status workflow, and proof of
// delivery — Phase 7 (see PHASE7_PLAN.md). Mounted at /api/deliveries.
//
// deliveries.status is the SOURCE OF TRUTH for a delivery order's progress
// (Decision 2); orders.status is synced FROM it, one direction only
// (Pattern F): OUT_FOR_DELIVERY, and DELIVERED on a fully paid order, which
// completes it (NOTIFICATIONS_PLAN.md, N2 — this replaces Decision 4 for
// DELIVERED). FAILED never touches orders.status.
import express from 'express'
import { pool } from '../db.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { billingListSql, getBillingSummary, mapBillingColumns } from '../lib/billing.js'
import { deleteFile, filePath, saveFile } from '../lib/storage.js'
import { sendDeliveredEmail, sendDeliveryAssignedEmail, sendDeliveryFailedEmail, sendInBackground, sendOutForDeliveryEmail } from '../lib/notices.js'
import { dateRangeSql, parseDateRange } from '../lib/reporting.js'
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

// Who may drive which transition, and the source states each may claim
// FROM. A driver drives the ordinary forward workflow on their own
// deliveries; an ADMIN gets two recovery-only transitions.
const driverTransitions = {
  OUT_FOR_DELIVERY: ['ASSIGNED'],
  DELIVERED: ['OUT_FOR_DELIVERY'],
  FAILED: ['OUT_FOR_DELIVERY'],
}
const adminTransitions = {
  // Decision 5's one deliberate exception — retry a failed attempt.
  PENDING_ASSIGNMENT: ['FAILED'],
  // The override that makes that retry reachable at all. Every forward
  // transition is scoped to the ONE driver holding the delivery, and
  // FAILED was reachable only from that driver's own hands — so a driver
  // who can no longer act (deactivated account, lost phone, left the job)
  // left the delivery stuck in ASSIGNED/OUT_FOR_DELIVERY with no way for
  // anyone to move or reassign it. Cancelling the whole order was the only
  // escape, and that refunds and restocks it. An admin can now call the
  // delivery back, then retry it into the queue for someone else.
  FAILED: ['ASSIGNED', 'OUT_FOR_DELIVERY'],
}
const proofTypes = new Set(['PHOTO', 'SIGNATURE', 'CONFIRMATION'])
// Content types accepted for a proof upload, mapped to the extension
// Pattern G derives the storage key from — this list IS the validation:
// express.raw({ type: [...allowedProofMimeTypes.keys()] }) below refuses
// anything else before the route handler even runs.
const allowedProofMimeTypes = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
])
const proofUploadLimit = '5mb'
const fileNameMaxLength = 255
// A ceiling on how many proof files one delivery can hold. Without it an
// authenticated driver can push 5mb at a time at their own delivery
// forever — the size limit alone caps each request, never the total.
const maxProofsPerDelivery = 5

const mapDeliveryRow = (row) => ({
  id: row.delivery_id,
  orderId: row.order_id,
  // The daily order number people see (CLIENT_REVISIONS_PLAN.md, R4).
  orderNumber: row.daily_number,
  orderDay: row.order_day,
  orderStatus: row.order_status,
  totalAmount: row.total_amount,
  customerName: row.customer_name,
  // The account holder's own number, for when the recipient named on the
  // address does not answer (NOTIFICATIONS_PLAN.md, N6). The emails stay
  // server-side: the notices below read them from the row, never the API.
  customerContactNumber: row.customer_contact_num,
  deliveryPersonnelId: row.delivery_personnel_id,
  deliveryPersonnelName: row.delivery_personnel_name,
  status: row.status,
  assignedAt: row.assigned_at,
  deliveredAt: row.delivered_at,
  failedAt: row.failed_at,
  note: row.note,
  proofCount: Number(row.proof_count),
  // What the customer asked for, and whether it is paid. Delivery orders
  // are paid before they are confirmed (NO_COD_PLAN D1), so the driver
  // only needs to see that it is settled; staff screens use the balance
  // to explain why an order cannot be assigned yet. Same lib/billing.js
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

// The items on each order, so the driver can check what they are handing
// over (CLIENT_REVISIONS_PLAN.md, R1). One query for all the listed
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

const mapProofRow = (row) => ({
  id: row.proof_id,
  proofType: row.proof_type,
  fileName: row.file_name,
  mimeType: row.mime_type,
  uploadedAt: row.uploaded_at,
})

const deliverySelectQuery = `SELECT d.delivery_id, d.order_id, d.delivery_personnel_id, dp.name AS delivery_personnel_name,
            d.status, d.assigned_at, d.delivered_at, d.failed_at, d.note,
            o.status AS order_status, o.daily_number, o.order_day, o.total_amount, o.instructions, o.requested_fulfillment_time, c.name AS customer_name,
            c.contact_num AS customer_contact_num, c.email AS customer_email, c.email_verified_at AS customer_email_verified_at, dp.email AS delivery_personnel_email,
            a.label, a.recipient_name, a.contact_num, a.address_line_1, a.address_line_2,
            a.barangay, a.municipality, a.province, a.postal_code, a.delivery_notes,
            (SELECT COUNT(*) FROM delivery_proofs dpf WHERE dpf.delivery_id = d.delivery_id) AS proof_count,
            ${billingListSql.columns}
       FROM deliveries d
       JOIN orders o ON o.order_id = d.order_id
       ${billingListSql.join}
       LEFT JOIN customers c ON c.customer_id = o.customer_id
       LEFT JOIN customer_addresses a ON a.address_id = o.address_id
       LEFT JOIN delivery_personnel dp ON dp.delivery_personnel_id = d.delivery_personnel_id`

router.use(requireAuth, requireRole('ADMIN', 'CASHIER', 'DELIVERY_PERSONNEL'))

// GET /api/deliveries/personnel — staff only. The assignment dropdown
// needs a list of drivers to offer, but GET /api/staff (which has the
// full account list) is ADMIN-only, and a CASHIER can also assign
// (PATCH /:id/assign below) — so this is a narrow, name-only view of
// just the active delivery personnel, scoped to what the assignment
// screen actually needs rather than widening staff.js's own access.
router.get('/personnel', requireRole('ADMIN', 'CASHIER'), async (_request, response) => {
  const result = await pool.query(
    `SELECT dp.delivery_personnel_id, dp.name
       FROM delivery_personnel dp
       JOIN users u ON u.user_id = dp.user_id
      WHERE u.is_active = TRUE
      ORDER BY dp.name`,
  )
  return response.json({ personnel: result.rows.map((row) => ({ id: row.delivery_personnel_id, name: row.name })) })
})

// GET /api/deliveries — staff only: every delivery's state, for the
// assignment queue and Delivery Management screen. ?status= narrows it
// (e.g. the PENDING_ASSIGNMENT queue specifically); omitted shows all.
router.get('/', requireRole('ADMIN', 'CASHIER'), async (request, response) => {
  const status = request.query.status
  if (status && !deliveryStatuses.has(status)) return response.status(422).json({ message: 'Enter a valid delivery status.', errors: { status: 'Enter a valid delivery status.' } })

  const orderClause = `ORDER BY CASE d.status
      WHEN 'PENDING_ASSIGNMENT' THEN 0 WHEN 'ASSIGNED' THEN 1 WHEN 'OUT_FOR_DELIVERY' THEN 2
      WHEN 'DELIVERED' THEN 3 WHEN 'FAILED' THEN 4 END, d.delivery_id`
  const result = status
    ? await pool.query(`${deliverySelectQuery} WHERE d.status = $1 ${orderClause}`, [status])
    : await pool.query(`${deliverySelectQuery} ${orderClause}`)
  return response.json({ deliveries: await withItems(result.rows) })
})

// GET /api/deliveries/mine — PATTERN H: the driver's own id, resolved
// server-side from the session, never trusted from a query param.
router.get('/mine', requireRole('DELIVERY_PERSONNEL'), async (request, response) => {
  const personnel = await pool.query('SELECT delivery_personnel_id FROM delivery_personnel WHERE user_id = $1', [request.user.id])
  const personnelId = personnel.rows[0]?.delivery_personnel_id
  const result = await pool.query(
    `${deliverySelectQuery} WHERE d.delivery_personnel_id = $1 AND d.status != 'DELIVERED' AND d.status != 'FAILED'
     ORDER BY d.assigned_at`,
    [personnelId],
  )
  return response.json({ deliveries: await withItems(result.rows) })
})

// GET /api/deliveries/mine/history?from&to — PHASE10 B4, the paper's
// "review their delivery history and completed transactions" (p.15). The
// driver's own DELIVERED and FAILED deliveries finished in the range,
// newest first, plus the counts a delivery report needs. Scoped by the
// same session-resolved id as /mine — never a query param.
//
// A delivery an admin retried (FAILED -> PENDING_ASSIGNMENT) loses its
// driver, so the failed attempt leaves that driver's history; there is no
// delivery status history table to keep it in.
const historyLimit = 200
router.get('/mine/history', requireRole('DELIVERY_PERSONNEL'), async (request, response) => {
  const { from, to, errors } = parseDateRange(request.query)
  if (Object.keys(errors).length) return response.status(422).json({ message: 'Enter a valid date range.', errors })

  const personnel = await pool.query('SELECT delivery_personnel_id FROM delivery_personnel WHERE user_id = $1', [request.user.id])
  const personnelId = personnel.rows[0]?.delivery_personnel_id
  const finishedAt = 'COALESCE(d.delivered_at, d.failed_at)'

  const [rows, counts, open] = await Promise.all([
    pool.query(
      `${deliverySelectQuery}
        WHERE d.delivery_personnel_id = $3 AND d.status IN ('DELIVERED', 'FAILED')
          AND ${dateRangeSql(finishedAt)}
        ORDER BY ${finishedAt} DESC, d.delivery_id DESC
        LIMIT ${historyLimit}`,
      [from, to, personnelId],
    ),
    pool.query(
      `SELECT COUNT(*) FILTER (WHERE d.status = 'DELIVERED') AS delivered,
              COUNT(*) FILTER (WHERE d.status = 'FAILED') AS failed
         FROM deliveries d
        WHERE d.delivery_personnel_id = $3 AND d.status IN ('DELIVERED', 'FAILED')
          AND ${dateRangeSql(finishedAt)}`,
      [from, to, personnelId],
    ),
    // Assigned right now — not range-bound: work still in hand.
    pool.query(`SELECT COUNT(*) AS open FROM deliveries WHERE delivery_personnel_id = $1 AND status IN ('ASSIGNED', 'OUT_FOR_DELIVERY')`, [personnelId]),
  ])

  const delivered = Number(counts.rows[0].delivered)
  const failed = Number(counts.rows[0].failed)
  return response.json({
    from,
    to,
    counts: {
      delivered,
      failed,
      assignedNow: Number(open.rows[0].open),
    },
    deliveries: await withItems(rows.rows),
    truncated: delivered + failed > historyLimit,
  })
})

// PATCH /api/deliveries/:id/assign — staff only. Claims a delivery still
// PENDING_ASSIGNMENT and hands it to a driver — the same conditional-UPDATE
// claim idiom used everywhere else in this codebase (Decision 5).
router.patch('/:id/assign', requireRole('ADMIN', 'CASHIER'), async (request, response) => {
  const deliveryId = parseId(request.params.id)
  if (!deliveryId) return response.status(404).json({ message: 'Delivery not found.' })

  const deliveryPersonnelId = parseId(request.body.deliveryPersonnelId)
  if (!deliveryPersonnelId) return response.status(422).json({ message: 'Select a delivery person.', errors: { deliveryPersonnelId: 'Select a delivery person.' } })

  // is_active is checked here, not only in GET /personnel's dropdown: a
  // deactivated driver can no longer sign in, so handing them a delivery
  // parks it in ASSIGNED with nobody able to move it — the exact stuck
  // state the admin recovery transitions exist to dig out of.
  const personnelCheck = await pool.query(
    `SELECT u.is_active FROM delivery_personnel dp JOIN users u ON u.user_id = dp.user_id WHERE dp.delivery_personnel_id = $1`,
    [deliveryPersonnelId],
  )
  if (!personnelCheck.rows[0]) return response.status(422).json({ message: 'Selected delivery person does not exist.', errors: { deliveryPersonnelId: 'Selected delivery person does not exist.' } })
  if (!personnelCheck.rows[0].is_active) return response.status(422).json({ message: "That delivery person's account is deactivated.", errors: { deliveryPersonnelId: 'Select an active delivery person.' } })

  // The order's own state is part of the claim. A delivery may only be
  // handed out once the order is in production or later: a delivery order
  // stays PLACED until it is paid in full (lib/orderStatus.js), the
  // customer can still cancel it, and a driver holding it was on the road
  // for an order that might never be made. And one already COMPLETED
  // or CANCELLED must not be handed to anyone: cancel fails the delivery
  // itself (Decision 6), but COMPLETED used to leave the row in the queue.
  //
  // NO_COD_PLAN D2 — and it must be fully paid. Confirming already
  // requires that (routes/orders.js), so this catches what slipped in
  // before the rule existed, or a refund that reopened a balance. The
  // balance is read under the ORDER row's lock, taken before the delivery
  // row is touched — the orders-then-deliveries order every cross-table
  // path here follows — so a refund cannot land between check and claim.
  const existing = await pool.query('SELECT order_id FROM deliveries WHERE delivery_id = $1', [deliveryId])
  if (!existing.rows[0]) return response.status(404).json({ message: 'Delivery not found.' })
  const orderId = existing.rows[0].order_id

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const orderLock = await client.query('SELECT status FROM orders WHERE order_id = $1 FOR UPDATE', [orderId])
    const orderStatus = orderLock.rows[0].status
    if (terminalOrderStatuses.has(orderStatus)) {
      await client.query('ROLLBACK')
      return response.status(409).json({ message: `This order is already ${orderStatus.toLowerCase()} — its delivery cannot be assigned.` })
    }
    if (orderStatus === 'PLACED') {
      await client.query('ROLLBACK')
      return response.status(409).json({ message: 'This order is not paid yet — a delivery order goes into production, and can be assigned, once it is paid in full.' })
    }
    const billing = await getBillingSummary(client, orderId)
    if (!billing.isFullyPaid) {
      await client.query('ROLLBACK')
      return response.status(409).json({ message: `This order is not fully paid (balance ₱${billing.balanceDue}) — delivery orders go out only once paid.` })
    }

    const claimed = await client.query(
      `UPDATE deliveries SET delivery_personnel_id = $1, status = 'ASSIGNED', assigned_at = CURRENT_TIMESTAMP
        WHERE delivery_id = $2 AND status = 'PENDING_ASSIGNMENT'
      RETURNING delivery_id`,
      [deliveryPersonnelId, deliveryId],
    )
    if (claimed.rowCount === 0) {
      await client.query('ROLLBACK')
      return response.status(409).json({ message: 'This delivery is no longer pending assignment — reload it and try again.' })
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

  // Tell the driver by email too (NOTIFICATIONS_PLAN.md, N4): the bell
  // only reaches a phone with PECTRACK open in front.
  const row = updated.rows[0]
  if (row.delivery_personnel_email) {
    sendInBackground('delivery assignment', () => sendDeliveryAssignedEmail({
      to: row.delivery_personnel_email,
      driverName: delivery.deliveryPersonnelName,
      order: delivery,
      customerName: delivery.customerName,
      address: delivery.address,
      items: delivery.items,
      requestedFulfillmentTime: delivery.requestedFulfillmentTime,
      instructions: delivery.instructions,
    }))
  }
  return response.json({ delivery })
})

// The customer's email for a delivery that moved (NOTIFICATIONS_PLAN.md,
// N5): on the way, delivered, or failed. Back to the queue says nothing;
// the customer hears again when it leaves. Only to a confirmed email, and
// never about a cancelled order (an admin tidying up its delivery).
const customerNoticeFor = {
  OUT_FOR_DELIVERY: ['on-the-way', (row, delivery) => sendOutForDeliveryEmail({ to: row.customer_email, name: delivery.customerName, order: delivery, driverName: delivery.deliveryPersonnelName, address: delivery.address, items: delivery.items })],
  DELIVERED: ['delivered', (row, delivery) => sendDeliveredEmail({ to: row.customer_email, name: delivery.customerName, order: delivery, deliveredAt: delivery.deliveredAt, address: delivery.address })],
  FAILED: ['delivery failed', (row, delivery) => sendDeliveryFailedEmail({ to: row.customer_email, name: delivery.customerName, order: delivery })],
}

// PATCH /api/deliveries/:id/status — two very different callers share this
// one route. An ADMIN may retry a FAILED delivery back to
// PENDING_ASSIGNMENT (Decision 5's one deliberate exception, admin-only,
// and it must say why). Otherwise this is the driver's own forward
// workflow, scoped to their own deliveries (Pattern H).
router.patch('/:id/status', async (request, response) => {
  const deliveryId = parseId(request.params.id)
  if (!deliveryId) return response.status(404).json({ message: 'Delivery not found.' })

  const status = request.body.status
  if (!deliveryStatuses.has(status)) return response.status(422).json({ message: 'Enter a valid delivery status.', errors: { status: 'Enter a valid delivery status.' } })

  const note = request.body.note == null ? null : normalize(request.body.note).slice(0, noteMaxLength) || null

  const isAdmin = request.user.role === 'ADMIN'
  // 'DELIVERY PERSONNEL' — SPACE, not underscore. request.user.role always
  // arrives in the display form lib/auth.js produces; requireRole()
  // normalizes either spelling, but a raw === has to match what's there.
  const isDriver = request.user.role === 'DELIVERY PERSONNEL'
  const allowedFrom = isAdmin ? adminTransitions[status] : isDriver ? driverTransitions[status] : undefined
  if (!allowedFrom) {
    // A transition that exists for ANOTHER role is a permission problem
    // (403); one that exists for nobody is a bad request (422). Keeping
    // those apart matters: "you may not do that" and "that is not a
    // thing" send the caller looking in completely different places.
    if (adminTransitions[status] && !isAdmin) return response.status(403).json({ message: 'Only an admin can fail a delivery its driver can no longer finish, or send a failed one back to the queue.' })
    if (isDriver) return response.status(422).json({ message: 'Enter a valid delivery status.', errors: { status: 'Enter a valid delivery status.' } })
    return response.status(403).json({ message: "Only the assigned delivery person can update this delivery's status." })
  }
  // Both admin transitions are recoveries from something going wrong, and
  // deliveries.note is the only place that reason can be recorded.
  if (isAdmin && !note) return response.status(422).json({ message: 'Explain why this delivery is being changed.', errors: { note: 'Explain why this delivery is being changed.' } })

  // deliveries.order_id is immutable — nothing in this app ever updates
  // it — so reading it outside the transaction is safe, and it is what
  // lets the transaction below take the ORDER row's lock FIRST.
  const existing = await pool.query('SELECT order_id FROM deliveries WHERE delivery_id = $1', [deliveryId])
  if (!existing.rows[0]) return response.status(404).json({ message: 'Delivery not found.' })
  const orderId = existing.rows[0].order_id

  // PATTERN H — the driver's own id, resolved server-side from the
  // session, never trusted from the request. Scoped into the WHERE clause
  // of the write itself below, so authorisation and the write cannot
  // disagree. Null for an admin, whose recovery transitions are
  // deliberately not scoped to any one driver.
  const personnel = isDriver ? await pool.query('SELECT delivery_personnel_id FROM delivery_personnel WHERE user_id = $1', [request.user.id]) : null
  const personnelId = personnel?.rows[0]?.delivery_personnel_id ?? null

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
    // two locks in OPPOSITE orders, a cancel racing a driver's "start
    // delivery" is a textbook ABBA deadlock: each holds the row the other
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
          AND ($6::bigint IS NULL OR delivery_personnel_id = $6)
      RETURNING delivery_id`,
      [status, note, storedNoteMaxLength, deliveryId, allowedFrom, personnelId],
    )
    if (claimed.rowCount === 0) {
      await client.query('ROLLBACK')
      // A delivery that isn't THEIRS 404s — Decision 9, the same "don't
      // confirm it exists" reasoning GET /api/orders/:id uses for another
      // customer's order. One that IS theirs but in the wrong state is a
      // 409. (An admin is not scoped to a driver, so for them it is
      // always the state that was wrong.)
      if (isDriver) {
        const ownership = await pool.query('SELECT delivery_id FROM deliveries WHERE delivery_id = $1 AND delivery_personnel_id = $2', [deliveryId, personnelId])
        if (!ownership.rows[0]) return response.status(404).json({ message: 'Delivery not found.' })
      }
      return response.status(409).json({ message: 'This delivery is no longer in a state that allows that change — reload it and try again.' })
    }

    // PATTERN F — the order follows its delivery, one direction only, in
    // the SAME transaction as the delivery transition so the two can never
    // disagree. FAILED does not touch orders.status.
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

    // DELIVERED completes the order (NOTIFICATIONS_PLAN.md, N2). PHASE7
    // Decision 4 kept them apart because a cash-on-delivery order was still
    // unpaid at the door. There is no cash on delivery any more: an order
    // is assigned only once fully paid, and a paid order can't be
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

// POST /api/deliveries/:id/proof — PHASE 7, DECISION 8. Raw image bytes,
// not multipart/form-data — express.raw() below reads them with no extra
// dependency, at the cost that no other form fields can ride along, so
// proof_type travels as a query parameter instead.
router.post(
  '/:id/proof',
  requireRole('DELIVERY_PERSONNEL'),
  express.raw({ type: [...allowedProofMimeTypes.keys()], limit: proofUploadLimit }),
  async (request, response) => {
    const deliveryId = parseId(request.params.id)
    if (!deliveryId) return response.status(404).json({ message: 'Delivery not found.' })

    const proofType = request.query.proofType ?? 'PHOTO'
    if (!proofTypes.has(proofType)) return response.status(422).json({ message: 'Enter a valid proof type.', errors: { proofType: 'Enter a valid proof type.' } })

    // PATTERN G — the extension comes from the VALIDATED content type,
    // never from anything the client named the file. express.raw() above
    // already refused any request whose Content-Type isn't one of
    // allowedProofMimeTypes, so if a mapped extension is missing here the
    // body simply wasn't read as a Buffer at all (e.g. no body sent).
    //
    // The header is normalized before that lookup because express.raw()
    // and this Map do not agree on their own: raw() matches via `type-is`,
    // which PARSES the media type (so 'image/jpeg; charset=binary' and
    // 'IMAGE/JPEG' both match and get read as a Buffer), while a bare
    // Map.get() is an exact, case-sensitive string match — so a perfectly
    // legal Content-Type variant was being read in full and then rejected
    // with "Upload a JPEG or PNG image." Browsers send the bare lowercase
    // form, which is why the app's own UI never hit it; other clients do.
    const contentType = String(request.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase()
    const extension = allowedProofMimeTypes.get(contentType)
    if (!extension || !Buffer.isBuffer(request.body) || request.body.length === 0) {
      return response.status(422).json({ message: 'Upload a JPEG or PNG image.', errors: { file: 'Upload a JPEG or PNG image.' } })
    }

    // PATTERN H — scoped to the driver's own delivery. Resolved and
    // checked BEFORE anything touches disk, so a delivery that isn't
    // theirs never gets as far as writing a file at all.
    //
    // The status is checked here too: proof belongs to a delivery that is
    // actually in progress. A DELIVERED or FAILED delivery is finished,
    // and leaving it open to uploads meant an authenticated driver could
    // keep pushing 5mb files at a closed record indefinitely.
    const personnel = await pool.query('SELECT delivery_personnel_id FROM delivery_personnel WHERE user_id = $1', [request.user.id])
    const personnelId = personnel.rows[0]?.delivery_personnel_id
    const owns = await pool.query('SELECT delivery_id, status FROM deliveries WHERE delivery_id = $1 AND delivery_personnel_id = $2', [deliveryId, personnelId])
    if (!owns.rows[0]) return response.status(404).json({ message: 'Delivery not found.' })
    if (owns.rows[0].status === 'DELIVERED' || owns.rows[0].status === 'FAILED') {
      return response.status(409).json({ message: 'This delivery is already finished — proof can only be added while it is still in progress.' })
    }

    // file_name is kept ONLY as a display label — this is deliberately
    // never used to build a filesystem path (that is storageKey below,
    // generated server-side). A value like '../../server/db.js' is stored
    // here as inert text, exactly as safe as any other string column.
    const fileName = normalize(request.query.fileName).slice(0, fileNameMaxLength) || `proof${extension}`
    const storageKey = await saveFile(request.body, extension)

    // The cap lives in the WHERE clause of the INSERT itself rather than a
    // separate COUNT read — the same reasoning every other conditional
    // write in this codebase uses, so two uploads racing can't both see
    // "one under the limit" and both land. rowCount === 0 is the refusal,
    // and the bytes already on disk are cleaned up before returning.
    const inserted = await pool.query(
      `INSERT INTO delivery_proofs (delivery_id, uploaded_by, proof_type, storage_key, file_name, mime_type)
       SELECT $1, $2, $3, $4, $5, $6
        WHERE (SELECT COUNT(*) FROM delivery_proofs WHERE delivery_id = $1) < $7
       RETURNING proof_id, proof_type, file_name, mime_type, uploaded_at`,
      [deliveryId, personnelId, proofType, storageKey, fileName, contentType, maxProofsPerDelivery],
    )
    if (inserted.rowCount === 0) {
      await deleteFile(storageKey)
      return response.status(409).json({ message: `A delivery can hold at most ${maxProofsPerDelivery} proof files.` })
    }
    return response.status(201).json({ proof: mapProofRow(inserted.rows[0]) })
  },
)

// GET /api/deliveries/:id/proof — proof metadata for a delivery. Staff may
// view any; a driver only their own (Decision 9 — "Staff can see proofs").
router.get('/:id/proof', async (request, response) => {
  const deliveryId = parseId(request.params.id)
  if (!deliveryId) return response.status(404).json({ message: 'Delivery not found.' })

  if (request.user.role === 'DELIVERY PERSONNEL') {
    const personnel = await pool.query('SELECT delivery_personnel_id FROM delivery_personnel WHERE user_id = $1', [request.user.id])
    const owns = await pool.query('SELECT delivery_id FROM deliveries WHERE delivery_id = $1 AND delivery_personnel_id = $2', [deliveryId, personnel.rows[0]?.delivery_personnel_id])
    if (!owns.rows[0]) return response.status(404).json({ message: 'Delivery not found.' })
  } else {
    const exists = await pool.query('SELECT delivery_id FROM deliveries WHERE delivery_id = $1', [deliveryId])
    if (!exists.rows[0]) return response.status(404).json({ message: 'Delivery not found.' })
  }

  const result = await pool.query('SELECT proof_id, proof_type, file_name, mime_type, uploaded_at FROM delivery_proofs WHERE delivery_id = $1 ORDER BY uploaded_at', [deliveryId])
  return response.json({ proofs: result.rows.map(mapProofRow) })
})

// GET /api/deliveries/:id/proof/:proofId — the raw file bytes. Same
// staff-see-any / driver-sees-own-only scoping as the listing above.
router.get('/:id/proof/:proofId', async (request, response) => {
  const deliveryId = parseId(request.params.id)
  const proofId = parseId(request.params.proofId)
  if (!deliveryId || !proofId) return response.status(404).json({ message: 'Proof not found.' })

  if (request.user.role === 'DELIVERY PERSONNEL') {
    const personnel = await pool.query('SELECT delivery_personnel_id FROM delivery_personnel WHERE user_id = $1', [request.user.id])
    const owns = await pool.query('SELECT delivery_id FROM deliveries WHERE delivery_id = $1 AND delivery_personnel_id = $2', [deliveryId, personnel.rows[0]?.delivery_personnel_id])
    if (!owns.rows[0]) return response.status(404).json({ message: 'Proof not found.' })
  }

  const result = await pool.query('SELECT storage_key, mime_type FROM delivery_proofs WHERE proof_id = $1 AND delivery_id = $2', [proofId, deliveryId])
  const proof = result.rows[0]
  if (!proof) return response.status(404).json({ message: 'Proof not found.' })

  // The row and the file can disagree — the database says a proof exists,
  // the bytes are gone (a restored backup, a hand-cleaned uploads/, a
  // future move to object storage that missed one). Without the callback
  // sendFile's ENOENT reaches app.js as a generic 500, which reads as
  // "the service is broken" when the honest answer is "that file isn't
  // there any more". headersSent is checked because sendFile may already
  // have started streaming before failing, and a second response then
  // would throw on top of the first.
  response.type(proof.mime_type)
  return response.sendFile(filePath(proof.storage_key), (error) => {
    if (error && !response.headersSent) response.status(404).json({ message: 'This proof file is no longer available.' })
  })
})

export default router
