// Order creation, listing, detail, and status updates. Both PICKUP and
// DELIVERY orders (Phase 7 — see PHASE7_PLAN.md). A DELIVERY order needs
// an address_id (the orders CHECK constraint requires it for DELIVERY and
// forbids it for PICKUP) and a customer account (Decision 7 — walk-ins
// have nowhere on file to deliver to), and gets a deliveries row created
// alongside it (Decision 3). deliveries.status is the source of truth for
// where a delivery order stands; see routes/deliveries.js and Decision 2
// for the one-directional sync into orders.status.
//
// Admin is deliberately NOT able to create orders through this router —
// orders.processed_by references cashiers(cashier_id) only, not admins,
// so the schema itself treats order-taking as a cashier concern.
// Mounted at /api/orders in app.js.
import express from 'express'
import { pool } from '../db.js'
import { billingListSql, getBillingSummary, mapBillingColumns } from '../lib/billing.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { syncStockAlert } from '../lib/inventory.js'
import { config } from '../config.js'
import { checkOrderTime } from '../lib/orderHours.js'
import { applyCancellationEffects, readyIfPaid } from '../lib/orderStatus.js'
import { sendInBackground, sendOrderReadyEmailFor } from '../lib/notices.js'
import crypto from 'node:crypto'
import { normalize, normalizeEmail, parseId, validateEmailField } from '../lib/validation.js'
import { consumeVerifiedPhone } from '../lib/phoneVerification.js'
import { normalizePhone } from '../lib/sms.js'
import { sendReservationNotices } from '../lib/reservationNotices.js'

const router = express.Router()

const validStatuses = new Set(['AWAITING_PAYMENT', 'PLACED', 'CONFIRMED', 'IN_PRODUCTION', 'READY_FOR_PICKUP', 'READY_FOR_DELIVERY', 'OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED'])
// Terminal: nothing moves OUT of these, for any role. See PHASE5_PLAN.md,
// Pattern C — this is what makes the stock restore on cancellation safe to
// run without checking whether a restore already happened.
const terminalStatuses = new Set(['COMPLETED', 'CANCELLED'])
const cancelReasonMinLength = 5
const deliveryMunicipality = 'Lucban'
// The states a transition may be claimed FROM. Staff may move an order out
// of any non-terminal state; a customer may only cancel one the kitchen
// hasn't started on. Derived from validStatuses rather than written out
// again, so a new status can never be added to one list but not the other.
const nonTerminalStatuses = [...validStatuses].filter((status) => !terminalStatuses.has(status))
// Payment first: a customer cancels only their own unpaid checkout hold
// (or an unpaid order from before payment first). A paid order cannot be
// cancelled by anyone (R2, no refunds).
const customerClaimableStatuses = ['AWAITING_PAYMENT', 'PLACED']
// A cash pickup is placed unpaid and ready (SENIOR_CONSULT_PLAN.md, S3), so
// its customer may also cancel it from READY_FOR_PICKUP while nothing is
// paid. The no-refunds check in PATCH /:id still refuses it once paid.
const customerCashClaimableStatuses = [...customerClaimableStatuses, 'READY_FOR_PICKUP']
const customerClaimableFor = (order) => (order.payment_mode === 'CASH' ? customerCashClaimableStatuses : customerClaimableStatuses)
// One unpaid cash pickup open per customer at a time: unpaid orders are
// what invited trolls before payment first (the user, 2026-10-24).
const openCashOrderSql = `
  SELECT o.order_id FROM orders o
   WHERE o.customer_id = $1 AND o.payment_mode = 'CASH' AND o.status = 'READY_FOR_PICKUP'
     AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.order_id = o.order_id AND p.status = 'PAID')
   LIMIT 1`
// Where each status sits on the order's forward path. A transition must
// move to a HIGHER rank (CANCELLED is the one exception: reachable from
// any non-terminal state). Skipping ahead is allowed — a walk-in that is
// paid and handed over at the counter goes PLACED -> COMPLETED in one step
// — but moving back (READY_FOR_PICKUP -> PLACED) or to the same status is
// not: neither describes anything that happened, and both used to write
// a history row claiming it did. READY_FOR_PICKUP and OUT_FOR_DELIVERY
// share a rank because they are the same stage for the two order types.
// READY_FOR_DELIVERY waits for a driver, so it sits just below
// OUT_FOR_DELIVERY (payment first, migration 029).
const statusRank = { AWAITING_PAYMENT: -1, PLACED: 0, CONFIRMED: 1, IN_PRODUCTION: 2, READY_FOR_PICKUP: 3, READY_FOR_DELIVERY: 3, OUT_FOR_DELIVERY: 3.5, COMPLETED: 4 }
const instructionsMaxLength = 500
// Largest value order_details.quantity (INTEGER) can hold.
const maxItemQuantity = 2147483647
// How far ahead an order may ask to be ready. orders.requested_fulfillment_time
// existed in the schema from the start and was never written: a bakery
// takes cake orders for a date, so the column is the point of the
// screen, not an extra. Bounded so a typo (year 2062) is refused rather
// than stored. Optional — "as soon as it's ready" is the common case.
const maxFulfillmentLeadDays = 30

// Parses an optional requestedFulfillmentTime. Returns { value } (a Date,
// or null when the field was absent/blank) or { error }. Today or later,
// 5:00 AM to 10:00 PM Manila time, and an order for "now" only within
// those hours (lib/orderHours.js, the adviser 2026-10-16). Pickup,
// delivery and walk-in orders all come through here.
function parseFulfillmentTime(raw) {
  const now = new Date()
  const blank = raw == null || String(raw).trim() === ''
  const value = blank ? null : new Date(raw)
  if (value && Number.isNaN(value.getTime())) return { error: 'Enter a valid date and time.' }
  const error = checkOrderTime(value, { now, enforceNowHours: config.orders.enforceNowHours })
  if (error) return { error }
  if (value && value.getTime() > now.getTime() + maxFulfillmentLeadDays * 24 * 60 * 60 * 1000) return { error: `Orders can be placed up to ${maxFulfillmentLeadDays} days ahead.` }
  return { value }
}

const mapOrderSummary = (row) => ({
  id: row.order_id,
  // What people see (CLIENT_REVISIONS_PLAN.md, R4): #orderNumber, which
  // starts again at 1 each Manila day. `id` stays the key for every request.
  orderNumber: row.order_id,
  orderDay: row.order_day,
  customerId: row.customer_id,
  customerName: row.customer_name,
  orderType: row.order_type,
  isReservation: row.is_reservation,
  // How it is paid for: CASH (at pickup) or GCASH; null on older rows
  // (SENIOR_CONSULT_PLAN.md, S3, migration 037).
  paymentMode: row.payment_mode,
  // Flat fee on a delivery order, inside totalAmount (migration 038).
  deliveryFee: row.delivery_fee,
  status: row.status,
  totalAmount: row.total_amount,
  orderDate: row.order_date,
  requestedFulfillmentTime: row.requested_fulfillment_time,
  // Phase 6: what this order still owes, carried on the LIST as well as
  // the detail. Without it, the only way to answer "which orders still owe
  // money" — the question the Payment & Billing screen exists to answer —
  // was to open every order in turn.
  //
  // The columns come from lib/billing.js rather than a SUM written out
  // again here: one definition, two consumers. Restating it would be the
  // duplication that module exists to prevent, and would have quietly
  // reintroduced its amount_paid formatting fix in a place no test covers.
  ...mapBillingColumns(row),
})

const orderSummarySelectQuery = `SELECT o.order_id, o.daily_number, o.order_day, o.customer_id, COALESCE(c.name, o.guest_name) AS customer_name, o.order_type, o.status, o.total_amount, o.order_date, o.requested_fulfillment_time, o.is_reservation, o.payment_mode, o.delivery_fee,
            ${billingListSql.columns}
     FROM orders o
     LEFT JOIN customers c ON c.customer_id = o.customer_id
     ${billingListSql.join}`

// Delivery personnel are excluded entirely for now — their real access
// should be scoped to "orders assigned to my current deliveries," which
// doesn't exist until Delivery Management (a later phase) does. Without
// that, the alternative would be either blanket access to every order
// (wrong) or silently giving them nothing useful, so the router just
// doesn't admit that role yet rather than pretending to support it.
router.use(requireAuth, requireRole('CUSTOMER', 'CASHIER', 'ADMIN'))

// Payment first (RULES-PLANS/PAYMENT_FIRST_PLAN.md): only real, paid
// orders are listed. An online checkout still being paid (AWAITING_PAYMENT)
// is hidden, and so is a cancelled one nothing was paid for — an unpaid
// hold that ran out, or an unpaid order from before. A cancelled order
// that money still arrived for stays visible, for staff to settle.
// Assumed (synthetic) history — the forecast's demo sales, migration 018 —
// is not an order anyone works on, so it is not listed either; it stays
// in the database for the Forecast (the adviser, 2026-10-16).
const visibleOrderSql = `o.data_source = 'RECORDED' AND o.status <> 'AWAITING_PAYMENT' AND (o.status <> 'CANCELLED' OR COALESCE(paid.amount, 0) > 0)`
// The customer also sees their own orders whose QR Ph payment the bakery
// is still checking, or rejected (QRPH_PLAN.md, Q9 and Q12): they paid, or
// say they did, so the order must not vanish from My Orders.
const customerVisibleOrderSql = `o.data_source = 'RECORDED' AND (
  (o.status <> 'AWAITING_PAYMENT' AND (o.status <> 'CANCELLED' OR COALESCE(paid.amount, 0) > 0))
  OR EXISTS (SELECT 1 FROM payments qp WHERE qp.order_id = o.order_id AND qp.payment_method = 'QRPH' AND qp.status IN ('PENDING', 'FAILED')))`

router.get('/', async (request, response) => {
  if (request.user.role === 'CUSTOMER') {
    const customerResult = await pool.query('SELECT customer_id FROM customers WHERE user_id = $1', [request.user.id])
    const customerId = customerResult.rows[0]?.customer_id
    const result = await pool.query(`${orderSummarySelectQuery} WHERE o.customer_id = $1 AND ${customerVisibleOrderSql} ORDER BY o.order_date DESC`, [customerId])
    return response.json({ orders: result.rows.map(mapOrderSummary) })
  }
  // Cashier and admin see every order.
  const result = await pool.query(`${orderSummarySelectQuery} WHERE ${visibleOrderSql} ORDER BY o.order_date DESC`)
  return response.json({ orders: result.rows.map(mapOrderSummary) })
})

// GET /api/orders/recent — staff only (CLIENT_REVISIONS_PLAN.md, R4).
// Without ?since: the newest orders, for the Dashboard's Recent orders
// panel. With ?since=<time>: the orders placed after it, for the new-order
// bell, which asks every 20 seconds. The caller passes a time a little
// before the newest order it already has and drops the ones it knows: an
// order's time is when its transaction began, so a slow one can commit
// after a later order that was already seen.
const recentOrdersLimit = 8
const newOrdersLimit = 20
router.get('/recent', requireRole('ADMIN', 'CASHIER'), async (request, response) => {
  const since = request.query.since
  if (since == null || since === '') {
    const result = await pool.query(`${orderSummarySelectQuery} WHERE ${visibleOrderSql} ORDER BY o.order_date DESC, o.order_id DESC LIMIT $1`, [recentOrdersLimit])
    return response.json({ orders: result.rows.map(mapOrderSummary) })
  }
  const sinceDate = new Date(String(since))
  if (Number.isNaN(sinceDate.getTime())) return response.status(422).json({ message: 'Enter a valid time.', errors: { since: 'Enter a valid time.' } })
  const result = await pool.query(
    // Compared at millisecond precision: the time the caller sends back
    // came from JSON, which drops Postgres's microseconds, so the order it
    // came from would otherwise count as newer than itself.
    `${orderSummarySelectQuery} WHERE ${visibleOrderSql} AND date_trunc('milliseconds', o.order_date) > $1 ORDER BY o.order_date DESC, o.order_id DESC LIMIT $2`,
    [sinceDate, newOrdersLimit],
  )
  return response.json({ orders: result.rows.map(mapOrderSummary) })
})

router.get('/:id', async (request, response) => {
  const orderId = parseId(request.params.id)
  if (!orderId) return response.status(404).json({ message: 'Order not found.' })

  const orderResult = await pool.query(
    `SELECT o.order_id, o.daily_number, o.order_day, o.customer_id, COALESCE(c.name, o.guest_name) AS customer_name, o.processed_by, ca.name AS cashier_name,
            o.order_type, o.status, o.instructions, o.requested_fulfillment_time,
            o.total_amount, o.order_date, o.is_reservation, o.guest_contact, o.guest_email, o.guest_contact_verified_at, o.payment_mode, o.delivery_fee,
            -- Where a delivery goes, for the receipt (MINOR_REVISIONS_PLAN.md M8).
            CONCAT_WS(', ', NULLIF(ad.address_line_1, ''), NULLIF(ad.address_line_2, ''), NULLIF(ad.barangay, ''), ad.municipality, ad.province) AS delivery_address
     FROM orders o
     LEFT JOIN customers c ON c.customer_id = o.customer_id
     LEFT JOIN cashiers ca ON ca.cashier_id = o.processed_by
     LEFT JOIN customer_addresses ad ON ad.address_id = o.address_id
     WHERE o.order_id = $1`,
    [orderId],
  )
  const order = orderResult.rows[0]
  if (!order) return response.status(404).json({ message: 'Order not found.' })

  if (request.user.role === 'CUSTOMER') {
    const customerResult = await pool.query('SELECT customer_id FROM customers WHERE user_id = $1', [request.user.id])
    // Same "don't confirm it exists" 404 used in routes/products.js for a
    // customer requesting an unavailable product — a customer asking for
    // someone ELSE's order shouldn't learn that order id is even real.
    if (order.customer_id !== customerResult.rows[0]?.customer_id) return response.status(404).json({ message: 'Order not found.' })
  }

  const itemsResult = await pool.query(
    `SELECT od.product_id, p.product_name, od.quantity, od.unit_price
     FROM order_details od
     JOIN products p ON p.product_id = od.product_id
     WHERE od.order_id = $1
     ORDER BY od.order_detail_id`,
    [order.order_id],
  )
  const historyResult = await pool.query(
    `SELECT h.status, h.note, h.updated_at, COALESCE(a.name, ca.name, c.name, d.name, 'System') AS updated_by_name
     FROM order_status_history h
     LEFT JOIN users u ON u.user_id = h.updated_by
     LEFT JOIN admins a ON a.user_id = u.user_id
     LEFT JOIN cashiers ca ON ca.user_id = u.user_id
     LEFT JOIN customers c ON c.user_id = u.user_id
     LEFT JOIN delivery_personnel d ON d.user_id = u.user_id
     WHERE h.order_id = $1
     ORDER BY h.updated_at, h.history_id`,
    [order.order_id],
  )

  // Phase 6: what this order has been paid, and what it still owes — see
  // lib/billing.js. Fetched for every role: a customer's receipt needs it
  // exactly as much as a cashier's does, and the same "customer sees only
  // their own order" guard above already covers who may reach this far.
  const payment = await getBillingSummary(pool, order.order_id)

  // PHASE 7, DECISION 2 — deliveries.status is where a delivery order's
  // progress actually lives. DELIVERED completes a paid order
  // (NOTIFICATIONS_PLAN.md, N2), but an unpaid one from old data stays
  // OUT_FOR_DELIVERY, and a FAILED delivery never moves the order. The
  // /api/deliveries router does not admit customers at all, so this is
  // how they see it. Read-only,
  // and only the fields a customer or cashier needs to answer "where is
  // it": no address (they know it), no note (the driver's own log).
  const deliveryResult = order.order_type === 'DELIVERY'
    ? await pool.query(
      `SELECT d.delivery_id, d.status, d.assigned_at, d.delivered_at, dp.name AS delivery_personnel_name
         FROM deliveries d LEFT JOIN delivery_personnel dp ON dp.delivery_personnel_id = d.delivery_personnel_id
        WHERE d.order_id = $1`,
      [order.order_id],
    )
    : null
  const deliveryRow = deliveryResult?.rows[0]
  const delivery = deliveryRow
    ? {
        status: deliveryRow.status,
        deliveryPersonnelName: deliveryRow.delivery_personnel_name,
        assignedAt: deliveryRow.assigned_at,
        deliveredAt: deliveryRow.delivered_at,
        // Staff only: the id Order Management's "Assign rider" sends to
        // PATCH /api/deliveries/:id/assign. A customer gets where it stands.
        ...(request.user.role !== 'CUSTOMER' && { id: deliveryRow.delivery_id }),
      }
    : null

  return response.json({
    order: {
      id: order.order_id,
      orderNumber: order.order_id,
      orderDay: order.order_day,
      customerId: order.customer_id,
      customerName: order.customer_name,
      cashierName: order.cashier_name,
      // A counter reservation's own details (RESERVE_SMS_PLAN.md).
      isReservation: order.is_reservation,
      ...(order.is_reservation && { guestContact: order.guest_contact, guestEmail: order.guest_email, guestContactVerified: Boolean(order.guest_contact_verified_at) }),
      orderType: order.order_type,
      status: order.status,
      paymentMode: order.payment_mode,
      deliveryFee: order.delivery_fee,
      deliveryAddress: order.order_type === 'DELIVERY' ? order.delivery_address || null : null,
      instructions: order.instructions,
      requestedFulfillmentTime: order.requested_fulfillment_time,
      totalAmount: order.total_amount,
      orderDate: order.order_date,
      items: itemsResult.rows.map((row) => ({ productId: row.product_id, productName: row.product_name, quantity: row.quantity, unitPrice: row.unit_price })),
      statusHistory: historyResult.rows.map((row) => ({ status: row.status, note: row.note, updatedAt: row.updated_at, updatedByName: row.updated_by_name })),
      payment,
      delivery,
    },
  })
})

router.post('/', requireRole('CUSTOMER', 'CASHIER'), async (request, response) => {
  // Migration 016 — a customer places an order only from a confirmed
  // email. A bakery taking a delivery order needs a customer it can reach,
  // and an account whose address was never proven cannot even recover its
  // own password. Checked first, before any validation work, and ONLY for
  // a customer ordering for themselves: a cashier's counter order is the
  // cashier's act, and a walk-in has no account to verify at all.
  //
  // request.user comes from requireAuth, which re-reads the account on
  // every request — so verifying in another tab takes effect on the very
  // next order, with no sign-out needed.
  if (request.user.role === 'CUSTOMER' && !request.user.emailVerified) {
    return response.status(403).json({
      message: 'Confirm your email before placing an order. Check your inbox for the link, or request a new one from your account.',
      code: 'EMAIL_NOT_VERIFIED',
    })
  }

  const orderType = request.body.orderType ?? 'PICKUP'
  if (orderType !== 'PICKUP' && orderType !== 'DELIVERY') return response.status(422).json({ message: 'Enter a valid order type.', errors: { orderType: 'Enter a valid order type.' } })

  const instructions = request.body.instructions == null ? null : String(request.body.instructions).trim().slice(0, instructionsMaxLength)
  const fulfillment = parseFulfillmentTime(request.body.requestedFulfillmentTime)
  if (fulfillment.error) return response.status(422).json({ message: fulfillment.error, errors: { requestedFulfillmentTime: fulfillment.error } })
  const items = Array.isArray(request.body.items) ? request.body.items : []
  if (items.length === 0) return response.status(422).json({ message: 'Add at least one item to the order.', errors: { items: 'Add at least one item to the order.' } })

  // Accumulate into a Map keyed by productId rather than pushing one entry
  // per submitted item. order_details has UNIQUE (order_id, product_id), so
  // sending the same product twice would violate that constraint partway
  // through the INSERT loop below and surface as a generic 500. Summing the
  // quantities is also what a customer means when they add the same item to
  // their cart twice, so this is the correct behaviour, not just a guard.
  //
  // parseId keeps productId a STRING (see lib/validation.js): product_id is
  // a BIGINT, and a value past Number's safe range would otherwise reach
  // Postgres as an out-of-range literal — another 500. Keeping it a string
  // also means it already matches the string keys pg returns for bigint
  // columns, so no conversion is needed at the lookup sites further down.
  const quantityByProductId = new Map()
  for (const item of items) {
    const productId = parseId(item?.productId)
    const quantity = Number(item?.quantity)
    // The upper bound is order_details.quantity's own INTEGER range —
    // Number.isInteger alone admits 1e12, which fails inside the INSERT
    // as an out-of-range 22003 and surfaces as a 500 instead of this 422.
    if (!productId || !Number.isInteger(quantity) || quantity <= 0 || quantity > maxItemQuantity) {
      return response.status(422).json({ message: 'Each item needs a valid productId and a positive whole-number quantity.', errors: { items: 'Each item needs a valid productId and a positive whole-number quantity.' } })
    }
    quantityByProductId.set(productId, (quantityByProductId.get(productId) ?? 0) + quantity)
  }
  // Sorted by productId so every transaction deducts stock in the same
  // order across every order — see the deduction loop further down for
  // why: two orders for the same items in opposite order ([bread,cake] vs
  // [cake,bread]) could otherwise each hold a lock the other needs, and
  // Postgres kills one as a deadlock. BigInt comparison because productId
  // is a string that can exceed Number's safe integer range.
  const parsedItems = [...quantityByProductId]
    .map(([productId, quantity]) => ({ productId, quantity }))
    .sort((a, b) => (BigInt(a.productId) < BigInt(b.productId) ? -1 : 1))

  // Resolve who this order belongs to and who's processing it, based on
  // the caller's own role — never trust a customerId claiming to be
  // someone else.
  let customerId = null
  let processedBy = null
  if (request.user.role === 'CUSTOMER') {
    const customerResult = await pool.query('SELECT customer_id FROM customers WHERE user_id = $1', [request.user.id])
    customerId = customerResult.rows[0]?.customer_id
  } else {
    const cashierResult = await pool.query('SELECT cashier_id FROM cashiers WHERE user_id = $1', [request.user.id])
    processedBy = cashierResult.rows[0]?.cashier_id
    if ('customerId' in request.body && request.body.customerId != null) {
      // parseId, not Number(): a non-numeric id would reach Postgres as
      // NaN and fail inside the query as a 500 rather than this 422.
      const requestedCustomerId = parseId(request.body.customerId)
      if (!requestedCustomerId) return response.status(422).json({ message: 'Selected customer does not exist.', errors: { customerId: 'Selected customer does not exist.' } })
      const customerCheck = await pool.query('SELECT customer_id FROM customers WHERE customer_id = $1', [requestedCustomerId])
      if (!customerCheck.rows[0]) return response.status(422).json({ message: 'Selected customer does not exist.', errors: { customerId: 'Selected customer does not exist.' } })
      customerId = requestedCustomerId
    }
    // Otherwise customerId stays null — a walk-in order with no account.
  }

  // Walk-in or Reserve at the counter (RULES-PLANS/RESERVE_SMS_PLAN.md).
  // A walk-in carries the customer's name. A reservation carries name,
  // contact number and email, a pickup date and time, and — when codes are
  // on — a number proven by a texted code; its receipt goes to that email
  // and its order number to that phone.
  let guest = null
  if (request.user.role !== 'CUSTOMER' && !customerId) {
    const name = normalize(request.body.customerName)
    if (name.length > 100) return response.status(422).json({ message: 'Keep the name to 100 characters or fewer.', errors: { customerName: 'Keep the name to 100 characters or fewer.' } })
    guest = { name: name || null, isReservation: false }
    if (request.body.reservation) {
      const reservation = request.body.reservation
      const errors = {}
      if (!name) errors.customerName = 'Enter the customer\'s name.'
      const phone = normalizePhone(reservation.contactNumber)
      if (!phone) errors.contactNumber = 'Enter a Philippine mobile number, like 0917 123 4567.'
      const email = normalizeEmail(reservation.email)
      // Email is optional (the adviser, 2026-10-23): without one, the
      // order number still goes by SMS.
      const emailError = email ? validateEmailField(email) : null
      if (emailError) errors.email = emailError
      if (!fulfillment.value) errors.requestedFulfillmentTime = 'Choose the pickup date and time.'
      if (orderType !== 'PICKUP') errors.orderType = 'An advanced order is picked up at the bakery.'
      if (Object.keys(errors).length) return response.status(422).json({ message: Object.values(errors)[0], errors })
      guest = { ...guest, isReservation: true, phone, email: email || null, verificationToken: reservation.phoneVerificationToken }
    }
  }

  // Payment first (RULES-PLANS/PAYMENT_FIRST_PLAN.md): an order placed by
  // staff — a walk-in at the counter — is paid as it is placed, cash or
  // QR Ph by its reference number, for the order's full total. Without a
  // payment it is refused; there is no unpaid order any more. GCASH is
  // still accepted from an older screen (QRPH_PLAN.md, Q6 and Q14).
  let staffPayment = null
  if (request.user.role !== 'CUSTOMER') {
    const method = normalize(request.body.payment?.method).toUpperCase()
    if (method !== 'CASH' && method !== 'QRPH' && method !== 'GCASH') return response.status(422).json({ message: 'Take the payment first: choose cash or QR Ph.', errors: { payment: 'Choose cash or QR Ph.' } })
    let gatewayReference = null
    if (method !== 'CASH') {
      gatewayReference = normalize(request.body.payment?.gatewayReference)
      if (!gatewayReference) return response.status(422).json({ message: 'Enter the reference number from the payment.', errors: { gatewayReference: 'Enter the reference number from the payment.' } })
      if (gatewayReference.length > 255) return response.status(422).json({ message: 'A reference number cannot be longer than 255 characters.', errors: { gatewayReference: 'A reference number cannot be longer than 255 characters.' } })
    }
    // The bill the customer handed over, for the receipt's "Cash received
    // / Change" (migration 034). Optional; never less than the total,
    // which is checked once the total is known below.
    let amountTendered = null
    if (method === 'CASH' && request.body.payment?.cashReceived != null && request.body.payment.cashReceived !== '') {
      amountTendered = Number(request.body.payment.cashReceived)
      if (!Number.isFinite(amountTendered) || amountTendered < 0 || amountTendered > 1_000_000) return response.status(422).json({ message: 'Enter the cash received as an amount.', errors: { cashReceived: 'Enter the cash received as an amount.' } })
      amountTendered = Math.round(amountTendered * 100) / 100
    }
    staffPayment = { method, gatewayReference, amountTendered }
  }

  // How an online order is paid for (SENIOR_CONSULT_PLAN.md, S3): a pickup
  // in cash when it is collected, or QR Ph now; a delivery with QR Ph only
  // (no cash on delivery). A staff order's mode is the payment just taken.
  // orders.payment_mode keeps one value for "paid before release", GCASH
  // (its CHECK allows CASH and GCASH), which the screens show as QR Ph
  // (QRPH_PLAN.md, Q14).
  let paymentMode = staffPayment ? (staffPayment.method === 'CASH' ? 'CASH' : 'GCASH') : 'GCASH'
  if (request.user.role === 'CUSTOMER' && request.body.paymentMode != null) {
    paymentMode = normalize(request.body.paymentMode).toUpperCase()
    if (paymentMode === 'QRPH') paymentMode = 'GCASH'
    if (paymentMode !== 'CASH' && paymentMode !== 'GCASH') return response.status(422).json({ message: 'Choose cash or QR Ph.', errors: { paymentMode: 'Choose cash or QR Ph.' } })
    if (paymentMode === 'CASH' && orderType !== 'PICKUP') return response.status(422).json({ message: 'Delivery orders are paid with QR Ph.', errors: { paymentMode: 'Delivery orders are paid with QR Ph.' } })
  }
  const payAtPickup = request.user.role === 'CUSTOMER' && paymentMode === 'CASH'

  // PHASE 7, DECISION 7 — a DELIVERY order needs somewhere to send it, and
  // addresses hang off customers: a walk-in order has customerId null (the
  // guest-order design), so it has no addresses to choose from and cannot
  // be a delivery. The address must also belong to THIS order's customer —
  // verified server-side, never trusted from the body, so a customer can't
  // send an order to someone else's saved address by passing its id, and a
  // cashier can't do it by accident.
  let addressId = null
  if (orderType === 'DELIVERY') {
    if (!customerId) return response.status(422).json({ message: 'A delivery order needs a customer account — walk-in orders can only be picked up.', errors: { orderType: 'Delivery requires a customer account.' } })
    addressId = parseId(request.body.addressId)
    if (!addressId) return response.status(422).json({ message: 'Select a delivery address.', errors: { addressId: 'Select a delivery address.' } })
    const addressCheck = await pool.query('SELECT address_id, municipality FROM customer_addresses WHERE address_id = $1 AND customer_id = $2 AND is_active = TRUE', [addressId, customerId])
    if (!addressCheck.rows[0]) return response.status(422).json({ message: 'Selected address is not available.', errors: { addressId: 'Selected address is not available.' } })
    // PHASE10 B7 — the thesis limits delivery to Lucban (p.44). Pickup is
    // open to anyone; only the delivery run is local.
    if (addressCheck.rows[0].municipality.trim().toLowerCase() !== deliveryMunicipality.toLowerCase()) {
      const message = `Delivery is available within ${deliveryMunicipality} only. Choose a ${deliveryMunicipality} address, or pick the order up at the bakery.`
      return response.status(422).json({ message, errors: { addressId: message } })
    }
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // One open cash pickup per customer. The customer row is locked first
    // so two cash checkouts at once cannot both see "none open"; "unpaid"
    // lives in payments, which no partial unique index on orders can see.
    if (payAtPickup) {
      await client.query('SELECT customer_id FROM customers WHERE customer_id = $1 FOR UPDATE', [customerId])
      const open = await client.query(openCashOrderSql, [customerId])
      if (open.rows[0]) {
        await client.query('ROLLBACK')
        const message = `You already have a cash order waiting for pickup (#${open.rows[0].order_id}). Pay for or collect it first, or pay this one with QR Ph.`
        return response.status(409).json({ message, errors: { paymentMode: message }, openOrderId: open.rows[0].order_id })
      }
    }

    // Look up every product in one query, confirm each is available, and
    // snapshot its CURRENT price — later price changes must never affect
    // an already-placed order.
    const productIds = parsedItems.map((item) => item.productId)
    // ::bigint[] casts the array explicitly rather than leaving Postgres to
    // infer a type for the string values parseId produced.
    const productsResult = await client.query(
      `SELECT p.product_id, p.price, p.availability_status, p.stock_type
         FROM products p
        WHERE p.product_id = ANY($1::bigint[])`,
      [productIds],
    )
    // pg returns bigint columns (product_id) as STRINGS, not numbers, to
    // avoid precision loss for values beyond Number.MAX_SAFE_INTEGER — and
    // parseId above kept item.productId a string for the same reason, so
    // the map keys and the lookup keys already match with no conversion.
    const productsById = new Map(productsResult.rows.map((row) => [row.product_id, row]))
    for (const item of parsedItems) {
      const product = productsById.get(item.productId)
      if (!product || !product.availability_status) {
        await client.query('ROLLBACK')
        return response.status(422).json({ message: `Product ${item.productId} is not available.`, errors: { items: `Product ${item.productId} is not available.` } })
      }
    }

    // total_amount is left to its DEFAULT 0 here and filled in below, once
    // the line items exist to add up. No order waits for an admin's
    // approval because of its size any more (the adviser, 2026-10-16;
    // migration 027 removed the bulk-order threshold).
    //
    // Every order starts as AWAITING_PAYMENT and becomes Ready for pickup /
    // Ready for delivery the moment it is paid (lib/orderStatus.js). A
    // walk-in is paid below, in this same transaction. An online checkout
    // is a hold: hidden from staff and reports, its stock set aside, and
    // cancelled by the system if not paid with GCash within 15 minutes
    // (lib/staleOrders.js).
    //
    // A cash pickup (SENIOR_CONSULT_PLAN.md, S3) is the exception: it is
    // paid at the counter when collected, so it is ready at once, unpaid.
    // An unpaid cash order whose day has passed is cancelled by
    // closeStaleOrders; cancelUnpaidOrders leaves it alone.
    const initialStatus = payAtPickup ? 'READY_FOR_PICKUP' : 'AWAITING_PAYMENT'
    // A reservation's receipt link: the token goes in the email, only its
    // hash is kept (GET /api/receipts/:token).
    const receiptToken = guest?.isReservation ? crypto.randomBytes(24).toString('base64url') : null
    const orderResult = await client.query(
      `INSERT INTO orders (customer_id, processed_by, order_type, address_id, instructions, requested_fulfillment_time, status,
                           guest_name, guest_contact, guest_email, is_reservation, receipt_token_hash, payment_mode, delivery_fee)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING order_id, daily_number, order_day`,
      [customerId, processedBy, orderType, addressId, instructions, fulfillment.value, initialStatus,
        guest?.name ?? null, guest?.phone ?? null, guest?.email ?? null, guest?.isReservation ?? false,
        receiptToken ? crypto.createHash('sha256').update(receiptToken).digest('hex') : null, paymentMode,
        // The delivery fee (DELIVERY_FEE_PLAN.md, D1): flat, delivery only.
        orderType === 'DELIVERY' ? config.orders.deliveryFee : 0],
    )
    const orderId = orderResult.rows[0].order_id

    // The reservation's number must have been proven by a texted code, in
    // this transaction, so a refused order leaves the code usable.
    if (guest?.isReservation && config.sms.verifyPhones) {
      const proven = await consumeVerifiedPhone(client, { verificationToken: guest.verificationToken, phone: guest.phone, purpose: 'RESERVE' })
      if (!proven) {
        await client.query('ROLLBACK')
        const message = 'Verify the customer\'s contact number with the texted code first.'
        return response.status(422).json({ message, errors: { contactNumber: message } })
      }
      await client.query('UPDATE orders SET guest_contact_verified_at = CURRENT_TIMESTAMP WHERE order_id = $1', [orderId])
    }
    // The order number people see is the order's own permanent id (the
    // adviser, 2026-10-16). orders.daily_number (migration 024) is still
    // filled in by its trigger but no longer shown.
    const { order_id: orderNumber, order_day: orderDay } = orderResult.rows[0]

    // PHASE 7, DECISION 3, revised for payment first: the deliveries row is
    // created when the order is paid (lib/orderStatus.js readyIfPaid), in
    // that transaction, so the assignment queue only ever holds paid
    // orders and a hold that is never paid leaves nothing behind there.

    for (const item of parsedItems) {
      const product = productsById.get(item.productId)

      // Deduct with a CONDITIONAL update, never a plain decrement.
      // inventory has CHECK (stock_quantity >= 0); a plain decrement
      // relies on that CHECK to catch overselling, which fails INSIDE the
      // query (error 23514) and would surface as a generic 500. The
      // `AND stock_quantity >= $2` guard makes it fail the WHERE clause
      // instead — rowCount === 0 becomes the "not enough stock" signal,
      // race-free with no explicit locking, because the UPDATE itself
      // takes the row lock. See PHASE5_PLAN.md, Pattern A, for the
      // measured before/after (two 500s vs two clean 409s racing three
      // buyers for the last 10 units).
      // A soft bread in an advanced order is baked on its pickup day, on
      // top of that day's standard (RULES-PLANS/DAILY_STOCK_PLAN.md): it
      // never takes today's shelf stock, so walk-in customers keep it.
      if (guest?.isReservation && product.stock_type === 'SOFT') {
        await client.query('INSERT INTO order_details (order_id, product_id, quantity, unit_price) VALUES ($1, $2, $3, $4)', [orderId, item.productId, item.quantity, product.price])
        continue
      }
      const deducted = await client.query(
        `UPDATE inventory
            SET stock_quantity = stock_quantity - $2,
                last_updated = CURRENT_TIMESTAMP
          WHERE product_id = $1
            AND stock_quantity >= $2
        RETURNING inventory_id, stock_quantity, min_stock_level`,
        [item.productId, item.quantity],
      )
      if (deducted.rowCount === 0) {
        await client.query('ROLLBACK')
        return response.status(409).json({ message: `Not enough stock for product ${item.productId}.`, errors: { items: `Not enough stock for product ${item.productId}.` } })
      }

      await client.query('INSERT INTO order_details (order_id, product_id, quantity, unit_price) VALUES ($1, $2, $3, $4)', [orderId, item.productId, item.quantity, product.price])
      // Records WHY stock moved, alongside the fact that it did — see
      // PHASE5_PLAN.md, Decision 1. Negative because stock is leaving.
      await client.query(
        'INSERT INTO inventory_movements (inventory_id, order_id, changed_by, quantity_change, reason) VALUES ($1, $2, $3, $4, $5)',
        [deducted.rows[0].inventory_id, orderId, request.user.id, -item.quantity, 'ORDER_PLACED'],
      )
      // Opens (or leaves open) a low-stock alert if this deduction pushed
      // the product to or below its minimum. See lib/inventory.js — it
      // won't duplicate an alert that's already open for this product.
      await syncStockAlert(client, { inventoryId: deducted.rows[0].inventory_id, stockQuantity: deducted.rows[0].stock_quantity, minStockLevel: deducted.rows[0].min_stock_level })
    }

    // The total is summed by Postgres in NUMERIC, from the rows that were
    // just written, rather than in JavaScript.
    //
    // Two reasons. First, JS numbers are binary floating point, where 0.1 +
    // 0.2 is famously 0.30000000000000004 — fine for a few bakery items
    // rounded to 2dp, but it's money, and NUMERIC is exact by design.
    //
    // Second and more importantly, this makes the total a function of the
    // stored line items instead of a parallel calculation that merely
    // happens to agree with them. orders.total_amount is denormalized, so
    // the risk was always that the two could drift apart. Summing the
    // actual order_details rows means they cannot: whatever was really
    // written is what gets charged. When order editing arrives, re-running
    // exactly this statement is all that's needed to keep it true.
    //
    // A delivery order's flat fee is added on top (DELIVERY_FEE_PLAN.md,
    // D1), so the GCash payment for the balance covers it too.
    const totalResult = await client.query(
      `UPDATE orders
       SET total_amount = (SELECT COALESCE(SUM(quantity * unit_price), 0) FROM order_details WHERE order_id = $1) + delivery_fee
       WHERE order_id = $1
       RETURNING total_amount`,
      [orderId],
    )
    // pg returns NUMERIC as a string (same precision reasoning as bigint),
    // already formatted to the column's 2 decimal places — so this is the
    // same '136.50' shape the old toFixed(2) produced.
    const totalAmount = totalResult.rows[0].total_amount

    // The walk-in's payment, for the total just summed, and the order is
    // ready at once. gateway_reference is UNIQUE: the same GCash receipt
    // recorded twice would credit money that arrived once.
    let status = initialStatus
    if (payAtPickup) {
      await client.query(
        'INSERT INTO order_status_history (order_id, updated_by, status, note) VALUES ($1, $2, $3, $4)',
        [orderId, request.user.id, status, 'Placed — pay in cash at pickup.'],
      )
    }
    if (staffPayment) {
      if (staffPayment.amountTendered != null && staffPayment.amountTendered < Number(totalAmount)) {
        await client.query('ROLLBACK')
        const message = `The cash received is less than the total of ${totalAmount}.`
        return response.status(422).json({ message, errors: { cashReceived: message } })
      }
      try {
        await client.query(
          `INSERT INTO payments (order_id, recorded_by, payment_method, amount, status, gateway_reference, payment_date, amount_tendered)
           VALUES ($1, $2, $3, $4, 'PAID', $5, CURRENT_TIMESTAMP, $6)`,
          [orderId, request.user.id, staffPayment.method, totalAmount, staffPayment.gatewayReference, staffPayment.amountTendered],
        )
      } catch (error) {
        if (error.code === '23505' && error.constraint === 'payments_gateway_reference_key') {
          await client.query('ROLLBACK')
          return response.status(409).json({ message: 'That reference number has already been recorded.', errors: { gatewayReference: 'That reference number has already been recorded.' } })
        }
        throw error
      }
      status = await readyIfPaid(client, orderId, request.user.id)
    }

    await client.query('COMMIT')
    const receiptUrl = receiptToken ? `${config.clientOrigin}/r/${receiptToken}` : null
    if (receiptUrl) sendReservationNotices({ orderId, receiptUrl })
    return response.status(201).json({
      message: guest?.isReservation ? `Advanced order placed and paid. The order number is on its way by SMS${guest.email ? ', and the receipt by email' : ''}.` : staffPayment ? 'Order placed and paid.' : payAtPickup ? 'Order placed. Pay in cash when you pick it up.' : 'Order saved. Pay with QR Ph within 15 minutes to place it.',
      order: { id: orderId, orderNumber, orderDay, status, totalAmount, orderType, paymentMode, isReservation: guest?.isReservation ?? false, receiptUrl },
    })
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
})

router.patch('/:id', async (request, response) => {
  const orderId = parseId(request.params.id)
  if (!orderId) return response.status(404).json({ message: 'Order not found.' })

  const status = request.body.status
  if (!validStatuses.has(status)) return response.status(422).json({ message: 'Enter a valid order status.', errors: { status: 'Enter a valid order status.' } })

  const current = await pool.query('SELECT order_id, customer_id, status, payment_mode FROM orders WHERE order_id = $1', [orderId])
  const order = current.rows[0]
  if (!order) return response.status(404).json({ message: 'Order not found.' })

  if (request.user.role === 'CUSTOMER') {
    const customerResult = await pool.query('SELECT customer_id FROM customers WHERE user_id = $1', [request.user.id])
    if (order.customer_id !== customerResult.rows[0]?.customer_id) return response.status(404).json({ message: 'Order not found.' })
    // A customer can only cancel their own order, and only before the
    // kitchen has started on it — once it's CONFIRMED or later, self-
    // cancellation is blocked (staff can still cancel it via their own
    // broader status permissions below).
    if (status !== 'CANCELLED') return response.status(403).json({ message: 'You can only cancel your own order.' })
    if (!customerClaimableFor(order).includes(order.status)) return response.status(409).json({ message: 'This order has been paid, so it can no longer be cancelled. For any problem with it, please contact the bakery.' })
  }

  // A friendly pre-check for the terminal case. It is NOT what enforces
  // the rule — the read above ran on a pooled connection outside any
  // transaction, so its answer can be stale by the time the write happens.
  // The authoritative claim is inside the transaction below; this exists
  // only to produce a better message in the common, uncontended case.
  if (terminalStatuses.has(order.status)) {
    return response.status(409).json({ message: `This order is already ${order.status.toLowerCase()} and cannot be changed further.` })
  }

  const note = request.body.note == null ? null : String(request.body.note).trim().slice(0, instructionsMaxLength) || null
  // PHASE10 B7 — the thesis (p.30): a cancellation carries a logged
  // reason. It lands in order_status_history.note with who and when.
  if (status === 'CANCELLED' && (note ?? '').length < cancelReasonMinLength) {
    const message = `Give a reason for cancelling (at least ${cancelReasonMinLength} characters).`
    return response.status(422).json({ message, errors: { note: message } })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Lock the order row and read the state the rules below are judged
    // against. FOR UPDATE, so nothing else can change status or
    // order_type between this read and the claim that follows — the same
    // lock-the-parent-first convention routes/deliveries.js and
    // routes/payments.js use, taken on the same row, in the same order.
    const locked = await client.query('SELECT status, order_type FROM orders WHERE order_id = $1 FOR UPDATE', [orderId])
    const lockedOrder = locked.rows[0]
    if (!lockedOrder) {
      await client.query('ROLLBACK')
      return response.status(404).json({ message: 'Order not found.' })
    }
    if (terminalStatuses.has(lockedOrder.status)) {
      await client.query('ROLLBACK')
      return response.status(409).json({ message: `This order is already ${lockedOrder.status.toLowerCase()} and cannot be changed further.` })
    }
    if (status === lockedOrder.status) {
      await client.query('ROLLBACK')
      return response.status(409).json({ message: `This order is already ${status.toLowerCase().replaceAll('_', ' ')}.` })
    }
    // The two "ready" stages belong to one order type each. A DELIVERY
    // order is never ready for pickup, and a PICKUP order is never out for
    // delivery — the status is not merely unusual there, it is untrue.
    if (status === 'READY_FOR_PICKUP' && lockedOrder.order_type !== 'PICKUP') {
      await client.query('ROLLBACK')
      return response.status(409).json({ message: 'A delivery order cannot be marked ready for pickup.' })
    }
    if (status === 'READY_FOR_DELIVERY' && lockedOrder.order_type !== 'DELIVERY') {
      await client.query('ROLLBACK')
      return response.status(409).json({ message: 'A pickup order cannot be marked ready for delivery.' })
    }
    // OUT_FOR_DELIVERY is never written by this route at all. For a
    // PICKUP order it is untrue; for a DELIVERY order it belongs to the
    // driver's own workflow — PATCH /api/deliveries/:id/status — because
    // deliveries.status is the source of truth and orders.status is synced
    // FROM it, one direction only (PHASE7_PLAN.md, Decision 2 / Pattern
    // F). A manual write here could disagree with deliveries.status with
    // nothing able to say which is true.
    if (status === 'OUT_FOR_DELIVERY') {
      await client.query('ROLLBACK')
      return response.status(409).json({
        message: lockedOrder.order_type === 'PICKUP'
          ? 'A pickup order cannot be marked out for delivery.'
          : "This order's delivery status is managed through Delivery Management, not here.",
      })
    }

    // The order's direction, checked after what the order type allows, so a
    // status that is wrong for the type says so rather than "cannot move
    // back" (READY_FOR_PICKUP and READY_FOR_DELIVERY share a rank).
    if (status !== 'CANCELLED' && statusRank[status] <= statusRank[lockedOrder.status]) {
      await client.query('ROLLBACK')
      return response.status(409).json({ message: `An order cannot move back from ${lockedOrder.status.toLowerCase().replaceAll('_', ' ')} to ${status.toLowerCase().replaceAll('_', ' ')}.` })
    }

    // CLAIM THE TRANSITION FIRST, atomically, before restoring anything.
    //
    // This conditional UPDATE — not the pre-check above — is what makes
    // the transition happen at most once. The pre-check reads on a pooled
    // connection outside any transaction, so several concurrent requests
    // can all see the same non-terminal status and all conclude they may
    // proceed. Measured, six simultaneous cancels of one order for 4
    // units: every one of them ran the restore loop, stock went 46 -> 70,
    // and the ledger grew six ORDER_CANCELLED rows for a single order —
    // twenty units invented from nothing, with a ledger that reconciles
    // to the wrong number and so corroborates it.
    //
    // Putting the status write here, at the TOP of the transaction with
    // the source state in its WHERE clause, makes the row lock decide the
    // winner: the first transaction to claim it commits, and every other
    // one finds rowCount === 0 and rolls back having touched no stock.
    // That is the same conditional-write pattern POST / uses to deduct
    // stock and PATCH /api/inventory/requests/:id uses to review a
    // request; the cancellation path is where it was missing.
    //
    // The allowed source states are role-scoped, so this also re-enforces
    // the customer's narrower "only from PLACED" rule under concurrency
    // rather than trusting the stale read for it.
    const claimable = request.user.role === 'CUSTOMER' ? customerClaimableFor(order) : nonTerminalStatuses
    const claimed = await client.query(
      `UPDATE orders
          SET status = $1
        WHERE order_id = $2
          AND status = ANY($3::order_status[])
      RETURNING status`,
      [status, orderId, claimable],
    )
    if (claimed.rowCount === 0) {
      await client.query('ROLLBACK')
      return response.status(409).json({ message: 'This order was updated by someone else — reload it and try again.' })
    }

    // NO_COD_PLAN D1 — no cash on delivery. The client will not bake and
    // send out food that can be refused at the door unpaid, so a DELIVERY
    // order moves forward only once it is fully paid. Checked after the
    // claim, under the order's row lock, for the same reason as the
    // COMPLETED check below: a payment and a confirm racing on one order
    // queue on that lock, so neither can slip past the other.
    if (lockedOrder.order_type === 'DELIVERY' && status !== 'CANCELLED') {
      const billing = await getBillingSummary(client, orderId)
      if (!billing.isFullyPaid) {
        await client.query('ROLLBACK')
        return response.status(409).json({ message: `Delivery orders must be paid in full before they move on. Balance: ₱${billing.balanceDue}.` })
      }
    }

    // PHASE 6, DECISION 7 — an order cannot be marked COMPLETED while
    // money is still owed. This has to live INSIDE the transaction, AFTER
    // the claim above, using the same client — reading the balance before
    // the transaction (or before the claim) would be exactly the mistake
    // the Phase 5 review corrected three times: a condition read outside
    // the write it gates can only produce a friendlier message, never a
    // guarantee. Because the claim already holds this order's row lock, no
    // concurrent payment can be recorded against it while this check runs
    // — POST /api/payments opens by locking the very same row, so it
    // queues behind this transaction rather than racing it.
    //
    // isFullyPaid is a boolean computed IN Postgres (lib/billing.js) —
    // never a NUMERIC string compared here in JavaScript.
    if (status === 'COMPLETED') {
      const billing = await getBillingSummary(client, orderId)
      if (!billing.isFullyPaid) {
        await client.query('ROLLBACK')
        return response.status(409).json({ message: `This order still owes ₱${billing.balanceDue} — it can only be marked COMPLETED once it is fully paid.` })
      }
      // A delivery order is "done" only once the goods arrived. Completing
      // it earlier left its deliveries row live — still in the queue, or
      // on a driver's list — with every forward move then refused by the
      // terminal-order guard in routes/deliveries.js, so the only way out
      // was an admin failing it by hand. deliveries.status is the source
      // of truth for that (PHASE7_PLAN.md, Decision 2), so it is what
      // gets asked here.
      if (lockedOrder.order_type === 'DELIVERY') {
        const delivery = await client.query('SELECT status FROM deliveries WHERE order_id = $1', [orderId])
        if (delivery.rows[0]?.status !== 'DELIVERED') {
          await client.query('ROLLBACK')
          return response.status(409).json({ message: 'A delivery order can only be marked COMPLETED once its delivery is marked delivered.' })
        }
      }
    }

    // No refunds (CLIENT_REVISIONS_PLAN.md, R2): the bakery does not give
    // money back, so an order with any PAID payment cannot be cancelled by
    // anyone — the admin included. Problems with a paid order are settled
    // with the customer at the counter. Checked here, after the claim and
    // under the order's row lock, like the COMPLETED check above, so a
    // payment and a cancel racing on one order cannot both go through.
    if (status === 'CANCELLED') {
      const billing = await getBillingSummary(client, orderId)
      if (billing.hasPayments) {
        await client.query('ROLLBACK')
        return response.status(409).json({ message: "This order has been paid, so it can't be cancelled. Settle any problem with the customer at the counter." })
      }
    }

    // Restoring stock is triggered by the TRANSITION into CANCELLED, not
    // by the resulting state. The claim above guarantees this runs at most
    // once per order. What a cancellation undoes — stock back on the shelf,
    // an open GCash link closed, the delivery resolved — lives in
    // lib/orderStatus.js, shared with the automatic closing of old orders.
    if (status === 'CANCELLED') await applyCancellationEffects(client, orderId, request.user.id)

    // orders.status was already written by the claim at the top of this
    // transaction; only the history row is left to record.
    await client.query('INSERT INTO order_status_history (order_id, updated_by, status, note) VALUES ($1, $2, $3, $4)', [orderId, request.user.id, status, note ?? null])
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }

  // A pickup order that is ready: tell the customer by email
  // (NOTIFICATIONS_PLAN.md, N5). After the commit, in the background, and
  // only to a confirmed email — a walk-in order has no customer at all.
  if (status === 'READY_FOR_PICKUP') sendInBackground('order ready', () => sendOrderReadyEmailFor(orderId))

  return response.json({ message: 'Order updated.', order: { id: Number(orderId), status } })
})

export default router
