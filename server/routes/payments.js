// Payment & Billing (Phase 6). Recording money against an order, and
// listing what has been recorded. Mounted at /api/payments in app.js.
//
// See PHASE6_PLAN.md for the full design (why paid amount is derived
// rather than stored, the order-row-lock pattern, the conditional-INSERT
// overpayment guard, the gateway_reference idempotency key) — this file
// covers Steps 1 and 2 from that plan: read-only billing and recording a
// payment. Steps 3–4 (COMPLETED requires full payment; cancelling a paid
// order refunds it) live in routes/orders.js, since they modify order
// status transitions Phase 5 already owns.
//
// Phase 6.5 (see PHASE6.5_PLAN.md) adds the live PayMongo side: POST
// /intent creates a Checkout Session and a matching PENDING row; POST
// /webhook is PayMongo's server calling back to confirm it. Both are
// registered BELOW, before the router-wide auth gate — /webhook because it
// is unauthenticated by definition (Decision 6), /intent because it lives
// naturally alongside it and still passes through the SAME gate one
// section down (it is registered again, after `router.use(requireAuth,
// ...)`, not exempted from it — only /webhook is).
import express from 'express'
import { getBillingSummary } from '../lib/billing.js'
import { config } from '../config.js'
import { pool } from '../db.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { createCheckoutSession, PaymongoApiError, paymongoMinimumAmountCentavos, PaymongoWebhookVerificationError, verifyPaymongoWebhook } from '../lib/paymongo.js'
import { dateRangeSql, parseDateRange } from '../lib/reporting.js'
import { normalize, parseId } from '../lib/validation.js'

const router = express.Router()

// Decision 4 — validated in code, not a new enum. payments.payment_method
// is VARCHAR(50) in the approved thesis schema; a Set here guarantees the
// same thing an enum would at the API boundary, without a migration to add
// a third method later.
const paymentMethods = new Set(['CASH', 'GCASH'])
// Mirrors payments.gateway_reference's own VARCHAR(255) in the approved
// thesis schema. Kept as a named constant so the validation below and the
// column can be seen to agree, rather than a bare 255 sitting in a
// condition with no stated connection to the schema.
const gatewayReferenceMaxLength = 255
// PHASE 8, DECISION 5 — payment_status mirrored here the same way
// paymentMethods mirrors payment_method above, so GET / can validate a
// ?status= filter without a round trip to the database just to ask "is
// this a real status".
const paymentStatuses = new Set(['PENDING', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED'])
const defaultPaymentsLimit = 50
const maxPaymentsLimit = 200

const mapPaymentListRow = (row) => ({
  id: row.payment_id,
  orderId: row.order_id,
  orderStatus: row.order_status,
  customerName: row.customer_name,
  method: row.payment_method,
  amount: row.amount,
  status: row.status,
  gatewayReference: row.gateway_reference,
  paymentDate: row.payment_date,
  recordedByName: row.recorded_by_name,
  refundedAt: row.refunded_at,
  refundReason: row.refund_reason,
  refundedByName: row.refunded_by_name,
  createdAt: row.created_at,
})

// Same narrower join reasoning as lib/billing.js's per-order query:
// recorded_by is only ever a cashier or admin, refunded_by only ever an
// admin, because those are the only roles the routes below ever let write
// to those columns.
//
// COUNT(*) OVER() — no PARTITION BY — is evaluated over every row the
// WHERE clause matched, BEFORE LIMIT/OFFSET trims the page down (that is
// SQL's own logical order of operations, not a coincidence this query
// relies on). Reading it off row 0 gives GET / (below) the true total
// match count in the SAME round trip as the page of rows itself, rather
// than a second COUNT(*) query against the same filters.
const paymentListSelectQuery = `SELECT p.payment_id, p.order_id, o.status AS order_status, c.name AS customer_name,
            p.payment_method, p.amount, p.status, p.gateway_reference, p.payment_date, p.created_at,
            COALESCE(ra.name, rc.name) AS recorded_by_name,
            p.refunded_at, p.refund_reason, fa.name AS refunded_by_name,
            COUNT(*) OVER()::int AS full_count
       FROM payments p
       JOIN orders o ON o.order_id = p.order_id
       LEFT JOIN customers c ON c.customer_id = o.customer_id
       LEFT JOIN admins ra ON ra.user_id = p.recorded_by
       LEFT JOIN cashiers rc ON rc.user_id = p.recorded_by
       LEFT JOIN admins fa ON fa.user_id = p.refunded_by`

// ============================================================================
// POST /api/payments/webhook — PayMongo's server, not a signed-in user.
//
// REGISTERED HERE, ABOVE THE router.use(requireAuth, ...) BELOW, AND THAT
// ORDER IS LOAD-BEARING. Express matches routes within one router in
// REGISTRATION order — a router-level `.use()` with no path applies to
// every route matched AFTER it. Move this route below that `.use()` line
// and every real webhook call starts failing with 401, because PayMongo's
// request carries no session cookie at all — it is server-to-server,
// unauthenticated by definition (PHASE6_PLAN.md, Decision 5, point 2).
//
// A verified signature IS this route's authentication — a different KIND
// of proof than a session cookie, not the absence of one. See
// PHASE6.5_PLAN.md, Decision 6, for why this lives in the SAME file as
// every other payments route (rather than a separate router mounted
// elsewhere) despite needing to dodge the auth gate below.
// ============================================================================
router.post('/webhook', async (request, response) => {
  // Checked FIRST, before anything touches the request. Without a
  // configured secret there is nothing to verify a signature against, so
  // this endpoint cannot do its job — and left unchecked, the missing
  // secret reached crypto.createHmac('sha256', undefined), which throws a
  // TypeError, not a PaymongoWebhookVerificationError. That escaped the
  // catch below and surfaced as a 500: an UNAUTHENTICATED endpoint any
  // anonymous caller on the internet could reliably crash into an error
  // response and a logged stack trace, simply because the secret was not
  // set yet (which is the app's default state today).
  //
  // 503 rather than 400: the request may well be a perfectly valid
  // webhook, and PayMongo's retry logic treating this as "try again
  // later" is exactly right — once the secret IS configured, a retry
  // genuinely would succeed.
  if (!config.paymongo.webhookSecret) {
    return response.status(503).json({ message: 'Webhook handling is not configured.' })
  }

  let event
  try {
    // request.rawBody is populated by express.json()'s own `verify`
    // callback in app.js — see PHASE6.5_PLAN.md, Decision 5, for why that,
    // and not a second body parser, is what supplies the exact bytes
    // PayMongo signed.
    event = verifyPaymongoWebhook({
      rawBody: request.rawBody,
      signatureHeader: request.headers['paymongo-signature'],
      webhookSecret: config.paymongo.webhookSecret,
    })
  } catch (error) {
    if (error instanceof PaymongoWebhookVerificationError) {
      return response.status(400).json({ message: 'Invalid webhook signature.' })
    }
    throw error
  }

  const eventType = event?.data?.attributes?.type
  // Only these two are handled — everything else (refund.succeeded,
  // payout.*, and the rest of PayMongo's event catalogue) is acknowledged
  // and ignored. PayMongo does not let a webhook endpoint subscribe to a
  // subset of event types at the URL level; filtering happens here
  // instead. A 200 for an event this route doesn't act on is correct, not
  // a shortcut — anything but 2xx tells PayMongo to retry, and there is
  // nothing here that would ever succeed on retry for an event type this
  // handler was never going to act on.
  if (eventType !== 'payment.paid' && eventType !== 'payment.failed') {
    return response.status(200).json({ received: true })
  }

  // The correlation key back to OUR OWN payments row — PHASE6.5_PLAN.md,
  // Decision 7. checkout_session_id lives on the nested Payment resource's
  // own attributes (confirmed from PayMongo's PaymentDTO schema during
  // planning), which is itself nested under data.attributes.data per the
  // envelope shape read from PayMongo's own SDK source (Event.js,
  // ApiResource.js).
  const checkoutSessionId = event?.data?.attributes?.data?.attributes?.checkout_session_id
  if (!checkoutSessionId) {
    // A shape this handler didn't expect from an otherwise VALIDLY signed
    // request. Still 200 -- there is nothing to retry into, and refusing
    // it would just make PayMongo hammer this endpoint with the same
    // unusable payload forever.
    return response.status(200).json({ received: true })
  }

  // ------------------------------------------------------------------
  // PATTERN E (PHASE6.5_PLAN.md) — the conditional UPDATE IS the
  // idempotency guard, not a separate check-then-write. PayMongo
  // redelivers webhooks on failure or timeout, so the SAME event can
  // arrive more than once. The first delivery finds the row PENDING and
  // flips it; every redelivery after that finds the row already
  // PAID/FAILED, matches zero rows, and is correctly treated as a no-op
  // — not an error, not a second credit. This is the fifth use of this
  // exact shape in the codebase (stock deduction, the order status claim,
  // change-request review, the Phase 6 overpayment guard in POST / below)
  // — not a new idea for this file.
  //
  // NO order-row lock here, unlike every other money-writing route in
  // this app. Nothing about this UPDATE needs one: it targets exactly one
  // payments row by its own unique gateway_reference, and the UPDATE
  // statement itself takes the row lock it needs for that. There is no
  // aggregate being computed and no overpayment guard being re-run here —
  // see Decision 9 for exactly why not.
  // ------------------------------------------------------------------
  if (eventType === 'payment.paid') {
    await pool.query(
      `UPDATE payments SET status = 'PAID', payment_date = CURRENT_TIMESTAMP
        WHERE gateway_reference = $1 AND status = 'PENDING'`,
      [checkoutSessionId],
    )
  } else {
    await pool.query(
      `UPDATE payments SET status = 'FAILED'
        WHERE gateway_reference = $1 AND status = 'PENDING'`,
      [checkoutSessionId],
    )
  }

  return response.status(200).json({ received: true })
})

// Admin and cashier see every payment; a customer sees only the ones tied
// to their own orders — same role-scoping shape as GET /api/orders.
// Delivery personnel are excluded for the same reason routes/orders.js
// excludes them: no real access model exists for that role yet, and
// billing has even less to do with delivery than order status does.
//
// Everything from here down DOES require a signed-in session — only
// POST /webhook above, registered before this line, is exempt.
router.use(requireAuth, requireRole('ADMIN', 'CASHIER', 'CUSTOMER'))

// PHASE 8, DECISION 5 — transaction history EXTENDS this existing
// endpoint rather than becoming a second one under /api/reports. A new
// GET /api/reports/transactions would have to restate this SELECT and its
// role scoping, which is exactly the duplication PHASES-RULES-PLANNING.md
// forbids ("avoid duplicated business logic across routes") — and worse,
// two payment lists that could quietly drift on who is allowed to see
// what. The role scoping below is UNCHANGED from before this phase: a
// customer filtering their own history is a new feature; a customer
// seeing anyone else's is the bug that scoping already prevented.
router.get('/', async (request, response) => {
  const filters = []
  const params = []

  if (request.user.role === 'CUSTOMER') {
    const customerResult = await pool.query('SELECT customer_id FROM customers WHERE user_id = $1', [request.user.id])
    params.push(customerResult.rows[0]?.customer_id)
    filters.push(`o.customer_id = $${params.length}`)
  }

  // from/to are OPTIONAL here, unlike every route in routes/reports.js —
  // this endpoint already existed and defaulted to "everything", and that
  // default has to survive for any caller that doesn't ask for a range.
  // Supplying either requires both, validated the exact same way every
  // other report's range is (lib/reporting.js), so this can never
  // silently disagree with /api/reports/sales at the boundaries.
  if ('from' in request.query || 'to' in request.query) {
    const { from, to, errors } = parseDateRange(request.query)
    if (Object.keys(errors).length) return response.status(422).json({ message: 'Please correct the highlighted fields.', errors })
    params.push(from, to)
    filters.push(dateRangeSql('p.payment_date', { fromParam: `$${params.length - 1}`, toParam: `$${params.length}` }))
  }

  if (request.query.method != null) {
    const method = normalize(request.query.method).toUpperCase()
    if (!paymentMethods.has(method)) return response.status(422).json({ message: 'Select cash or GCash.', errors: { method: 'Select cash or GCash.' } })
    params.push(method)
    filters.push(`p.payment_method = $${params.length}`)
  }

  if (request.query.status != null) {
    const status = normalize(request.query.status).toUpperCase()
    if (!paymentStatuses.has(status)) return response.status(422).json({ message: 'Enter a valid payment status.', errors: { status: 'Enter a valid payment status.' } })
    params.push(status)
    filters.push(`p.status = $${params.length}`)
  }

  // Capped, never rejected — an out-of-range limit is not worth a 422
  // over, the same "forgiving" rule routes/reports.js's own parseLimit
  // uses. This IS a behavior change from before Phase 8: this endpoint
  // used to return every matching row with no limit at all.
  const limit = Math.min(Math.max(Math.trunc(Number(request.query.limit)) || defaultPaymentsLimit, 1), maxPaymentsLimit)
  const offset = Math.max(Math.trunc(Number(request.query.offset)) || 0, 0)
  params.push(limit, offset)
  const limitParam = params.length - 1
  const offsetParam = params.length

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : ''
  const result = await pool.query(
    `${paymentListSelectQuery}
      ${whereClause}
     ORDER BY p.created_at DESC
     LIMIT $${limitParam} OFFSET $${offsetParam}`,
    params,
  )

  // full_count is the SAME on every row (the window function has no
  // PARTITION BY), so row 0 carries it whenever there is a row 0 at all.
  //
  // An EMPTY page has no row 0 to read it from, and that case is not one
  // case but two: "nothing matches these filters" (total genuinely is 0)
  // and "the filters still match plenty, this page just isn't one of
  // them" (total is unchanged, the caller simply asked for an offset past
  // the end). Reading 0 for the second one reports an empty payment
  // history to someone whose history is not empty.
  //
  // Only that second case needs a second query, and it is reached only by
  // an offset past the end — so the common path still gets its total in
  // the same round trip as the rows, and nothing pays for this except the
  // request that actually needs it.
  let total = result.rows[0]?.full_count ?? 0
  if (result.rows.length === 0 && offset > 0) {
    // Every filter built above targets p.* or o.*, so the joins that only
    // supply display names (customers, admins, cashiers) are not needed to
    // count. A filter added later on any OTHER table must be joined here
    // too, or this count and the page above will disagree.
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS n
         FROM payments p
         JOIN orders o ON o.order_id = p.order_id
        ${whereClause}`,
      params.slice(0, -2),
    )
    total = countResult.rows[0].n
  }
  return response.json({
    payments: result.rows.map(mapPaymentListRow),
    total,
    hasMore: offset + result.rows.length < total,
  })
})

// POST /api/payments — cashier/admin only. A customer can VIEW their own
// bills (GET above) but never records money changing hands themselves;
// that always happens at the counter, through staff.
router.post('/', requireRole('CASHIER', 'ADMIN'), async (request, response) => {
  const orderId = parseId(request.body.orderId)
  if (!orderId) return response.status(422).json({ message: 'Select a valid order.', errors: { orderId: 'Select a valid order.' } })

  const errors = {}

  const method = normalize(request.body.method).toUpperCase()
  if (!paymentMethods.has(method)) errors.method = 'Select cash or GCash.'

  // Decision 3: 0 and negative amounts are refused here — the column's
  // CHECK (amount >= 0) alone would let a zero-amount row through, and a
  // payment of nothing records nothing that happened.
  //
  // The check runs on the ROUNDED figure, not the raw one, and that
  // ordering is the whole point. Rounding to 2dp is what the NUMERIC(12,2)
  // column stores (same pattern products.js uses for price — it collapses
  // floating-point noise like a client sending 19.999999999998). But any
  // amount under half a centavo rounds DOWN TO ZERO: 0.001 is genuinely
  // greater than zero, so validating the raw value passed it, and the
  // ₱0.00 row it then wrote is exactly the meaningless row this rule
  // exists to prevent. Validating what will actually be STORED, rather
  // than what was sent, closes that gap.
  const rawAmount = Number(request.body.amount)
  const amount = Number.isFinite(rawAmount) ? Math.round(rawAmount * 100) / 100 : Number.NaN
  if (!Number.isFinite(amount) || amount <= 0) errors.amount = 'Enter an amount of at least ₱0.01.'

  // gateway_reference: NULL for cash (there is nothing to reference), and
  // NEVER an empty string — '' would collide with the very next cash-less
  // GCASH payment under the UNIQUE constraint the moment two rows both
  // tried to store '', where NULL never collides with anything, even
  // itself. Required and validated only for GCASH.
  let gatewayReference = null
  if (method === 'GCASH') {
    gatewayReference = normalize(request.body.gatewayReference)
    if (!gatewayReference) errors.gatewayReference = 'Enter the GCash reference number from the receipt.'
    // REFUSED when too long, not silently truncated — unlike the free-text
    // `reason`/`note` fields elsewhere in this app, which are .slice()d
    // because losing their tail costs nothing. A gateway reference is an
    // IDENTIFIER: it has to match a real GCash transaction exactly, so a
    // truncated one is not a shorter version of the truth, it is a
    // different (and wrong) reference — and one that would then occupy
    // the UNIQUE slot the real reference needs. Without this the column's
    // own VARCHAR(255) limit rejected it at the database instead, as an
    // unhandled 22001 that surfaced to the cashier as a generic 500.
    else if (gatewayReference.length > gatewayReferenceMaxLength) errors.gatewayReference = `A GCash reference cannot be longer than ${gatewayReferenceMaxLength} characters.`
  }

  if (Object.keys(errors).length) return response.status(422).json({ message: 'Please correct the highlighted fields.', errors })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // PATTERN A — lock the order row before deciding anything. Recording
    // a payment is a read-modify-write over an AGGREGATE (SUM of this
    // order's PAID rows), and there is no single payments row to lock for
    // that the way inventory locks one product's row — locking the
    // PARENT order is what serializes every write against its children.
    // Without this, two cashiers recording payment for the same order at
    // the same moment could both read "nothing paid yet" and both insert,
    // together exceeding the total with no record of why.
    const orderResult = await client.query('SELECT order_id, status FROM orders WHERE order_id = $1 FOR UPDATE', [orderId])
    const order = orderResult.rows[0]
    if (!order) {
      await client.query('ROLLBACK')
      return response.status(404).json({ message: 'Order not found.' })
    }
    // A cancelled order's balance_due is not necessarily zero — an order
    // cancelled while still unpaid keeps its full total_amount as
    // "owed", which the overpayment guard below would happily accept a
    // payment against. That would record money against an order nobody
    // is fulfilling, so it is refused explicitly rather than relying on
    // the guard to catch it by coincidence.
    if (order.status === 'CANCELLED') {
      await client.query('ROLLBACK')
      return response.status(409).json({ message: 'This order was cancelled — a payment cannot be recorded against it.' })
    }

    let recorded
    try {
      // PATTERN B — the overpayment guard as a CONDITIONAL INSERT, done
      // entirely in Postgres NUMERIC arithmetic rather than compared in
      // JavaScript (pg returns NUMERIC as a string specifically because
      // JS numbers are binary floating point). rowCount === 0 IS the
      // "this is more than the order still owes" signal — the same
      // conditional-write idiom Phase 5 uses for stock deduction, the
      // order status claim, and change-request review.
      recorded = await client.query(
        `INSERT INTO payments (order_id, recorded_by, payment_method, amount, status, gateway_reference, payment_date)
         SELECT $1, $2, $3, $4::numeric, 'PAID', $5, CURRENT_TIMESTAMP
          WHERE $4::numeric <= (
            SELECT o.total_amount - COALESCE((
              SELECT SUM(p.amount) FROM payments p WHERE p.order_id = $1 AND p.status = 'PAID'
            ), 0)
            FROM orders o WHERE o.order_id = $1
          )
         RETURNING payment_id`,
        [orderId, request.user.id, method, amount, gatewayReference],
      )
    } catch (error) {
      // PATTERN C — gateway_reference's UNIQUE constraint is the
      // double-payment guard: the same GCash receipt recorded twice
      // (a mis-click, or presented at two counters) would otherwise
      // credit the order for money that arrived once.
      if (error.code === '23505' && error.constraint === 'payments_gateway_reference_key') {
        await client.query('ROLLBACK')
        return response.status(409).json({ message: 'That GCash reference has already been recorded.', errors: { gatewayReference: 'That GCash reference has already been recorded.' } })
      }
      throw error
    }

    if (recorded.rowCount === 0) {
      await client.query('ROLLBACK')
      return response.status(409).json({ message: 'That is more than this order still owes.', errors: { amount: 'That is more than this order still owes.' } })
    }

    await client.query('COMMIT')

    const summary = await getBillingSummary(pool, orderId)
    const paymentRow = summary.payments.find((row) => row.id === recorded.rows[0].payment_id)
    return response.status(201).json({ payment: paymentRow, balanceDue: summary.balanceDue, isFullyPaid: summary.isFullyPaid })
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
})
// POST /api/payments/intent — the live-gateway counterpart to the manual
// POST / above. Open to CUSTOMER as well as CASHIER/ADMIN (the router-wide
// guard already covers this — no requireRole override here, unlike
// POST / just above), because paying via GCash online is meant to be
// something a customer can do themselves, unlike recording what already
// happened at a counter.
//
// ============================================================================
// WHY THIS IS THREE PHASES AND NOT ONE TRANSACTION.
//
// The obvious shape — open a transaction, lock the order, validate, call
// PayMongo, insert, commit — is what this route did first, and it is
// wrong in a way that does not show up until PayMongo is slow. That
// version held a `FOR UPDATE` lock on the order AND a pooled database
// connection for the entire duration of an internet round trip to a third
// party. Measured, with PayMongo stubbed to take 3 seconds:
//
//   - an unrelated CASH payment on the same order blocked for 2542ms,
//     waiting on the row lock; and
//   - with 12 such calls in flight (pg's pool defaults to 10 connections),
//     a plain GET /api/products — a route with nothing to do with
//     payments — took 2330ms, because the pool was exhausted.
//
// That second one is the serious half: a slow payment provider stalls the
// ENTIRE API, not just the order being paid for. Never hold a database
// lock or a pooled connection across a network call to something you do
// not control.
//
// So: validate first (phase 1), call PayMongo holding nothing (phase 2),
// then take the lock only to re-check and insert (phase 3). Phase 3
// re-validates rather than trusting phase 1, because the gap between them
// is exactly the window where another payment could land.
//
// The cost of this shape is that a checkout session can be created at
// PayMongo and then not used, if phase 3 refuses it. That is an acceptable
// trade: an unused checkout link simply expires unused, whereas holding
// the lock stalls the whole system.
// ============================================================================
router.post('/intent', async (request, response) => {
  const orderId = parseId(request.body.orderId)
  if (!orderId) return response.status(422).json({ message: 'Select a valid order.', errors: { orderId: 'Select a valid order.' } })

  // Ownership check, the same shape GET /api/orders/:id already uses — a
  // customer's relationship to which order is theirs doesn't change over
  // the order's life, so unlike the money figures below this isn't a
  // read-modify-write that needs a lock to stay correct.
  if (request.user.role === 'CUSTOMER') {
    const customerResult = await pool.query('SELECT customer_id FROM customers WHERE user_id = $1', [request.user.id])
    const orderResult = await pool.query('SELECT customer_id FROM orders WHERE order_id = $1', [orderId])
    if (orderResult.rows[0]?.customer_id == null || orderResult.rows[0].customer_id !== customerResult.rows[0]?.customer_id) {
      return response.status(404).json({ message: 'Order not found.' })
    }
  }

  // Checked before any other work: without real credentials this fails
  // clearly and immediately, rather than reaching createCheckoutSession and
  // producing a confusing 401 from PayMongo's own side (an `Authorization:
  // Basic` header built from `undefined` is still a syntactically valid
  // header, just a wrong one).
  if (!config.paymongo.secretKey) {
    return response.status(503).json({ message: 'Online payment is not set up yet — ask an admin to configure it, or pay by cash or a GCash reference at the counter.' })
  }

  // ---- PHASE 1: validate, holding nothing. -------------------------------
  // No transaction and no lock here, deliberately. Every check below is
  // re-run in phase 3 under a real lock before anything is written, so this
  // pass exists to give a fast, specific error for the ordinary cases
  // WITHOUT paying for a checkout session first — not to be the authority
  // on any of them.
  const preflight = await pool.query('SELECT status FROM orders WHERE order_id = $1', [orderId])
  if (!preflight.rows[0]) return response.status(404).json({ message: 'Order not found.' })
  if (preflight.rows[0].status === 'CANCELLED') {
    return response.status(409).json({ message: 'This order was cancelled — a payment cannot be recorded against it.' })
  }

  const billing = await getBillingSummary(pool, orderId)
  if (billing.isFullyPaid) return response.status(409).json({ message: 'This order is already fully paid.' })

  const existingPending = await pool.query(`SELECT 1 FROM payments WHERE order_id = $1 AND status = 'PENDING'`, [orderId])
  if (existingPending.rowCount > 0) {
    return response.status(409).json({ message: 'A payment attempt for this order is already in progress. Wait for it to complete or ask an admin to check its status.' })
  }

  // The full remaining balance, always — not a customer-chosen partial
  // figure. Phase 6's manual path lets a cashier record a partial payment
  // because a human is present to judge that; an unattended online checkout
  // defaults to "pay what's owed" (PHASE6.5_PLAN.md, Data flow).
  const amountCentavos = Math.round(Number(billing.balanceDue) * 100)
  if (amountCentavos < paymongoMinimumAmountCentavos) {
    return response.status(422).json({ message: `The remaining balance is below PayMongo's ₱${(paymongoMinimumAmountCentavos / 100).toFixed(2)} minimum for an online payment — settle it by cash or a GCash reference at the counter instead.` })
  }

  // ---- PHASE 2: the network call, holding no database resources. ---------
  let session
  try {
    session = await createCheckoutSession({
      secretKey: config.paymongo.secretKey,
      amountCentavos,
      referenceNumber: `order-${orderId}`,
      description: `PECTRACK order #${orderId}`,
      successUrl: config.paymongo.successUrl,
      cancelUrl: config.paymongo.cancelUrl,
    })
  } catch (error) {
    if (error instanceof PaymongoApiError) {
      return response.status(502).json({ message: 'The payment provider could not be reached. Please try again in a moment.' })
    }
    throw error
  }

  // ---- PHASE 3: take the lock, re-check, write. --------------------------
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // PATTERN A, same as POST / above and every money-writing route since
    // Phase 5. The re-checks below are NOT redundant with phase 1: between
    // the two, a cashier could have recorded a cash payment, an admin could
    // have cancelled the order, or another intent could have been created.
    // Phase 1 answers "is this worth trying"; this answers "is it still
    // true", and only this one holds the lock that makes the answer stick.
    const orderResult = await client.query('SELECT order_id, status FROM orders WHERE order_id = $1 FOR UPDATE', [orderId])
    const order = orderResult.rows[0]
    if (!order) {
      await client.query('ROLLBACK')
      return response.status(404).json({ message: 'Order not found.' })
    }
    if (order.status === 'CANCELLED') {
      await client.query('ROLLBACK')
      return response.status(409).json({ message: 'This order was cancelled — a payment cannot be recorded against it.' })
    }

    const confirmedBilling = await getBillingSummary(client, orderId)
    if (confirmedBilling.isFullyPaid) {
      await client.query('ROLLBACK')
      return response.status(409).json({ message: 'This order was fully paid while the payment page was being prepared.' })
    }

    let inserted
    try {
      // status PENDING, not PAID — this row records only that an attempt
      // was STARTED. POST /webhook above is the only thing that ever moves
      // it to PAID or FAILED (PHASE6_PLAN.md, Decision 6: PENDING and
      // FAILED are reserved exactly for this).
      //
      // amountCentavos / 100 done IN Postgres, not JS — the same "money
      // arithmetic belongs in NUMERIC" rule the rest of this codebase
      // follows (routes/orders.js sums totals in Postgres for the identical
      // reason).
      inserted = await client.query(
        `INSERT INTO payments (order_id, recorded_by, payment_method, amount, status, gateway_reference)
         VALUES ($1, $2, 'GCASH', $3::numeric / 100, 'PENDING', $4)
         RETURNING payment_id`,
        [orderId, request.user.id, amountCentavos, session.id],
      )
    } catch (error) {
      // Migration 006's index — the real enforcement behind phase 1's
      // friendly pre-check, caught the same way Pattern C catches
      // gateway_reference's own UNIQUE violation in POST / above. Reaching
      // here means another intent was created while this one was away
      // talking to PayMongo.
      if (error.code === '23505' && error.constraint === 'payments_one_pending_per_order_idx') {
        await client.query('ROLLBACK')
        return response.status(409).json({ message: 'A payment attempt for this order is already in progress. Wait for it to complete or ask an admin to check its status.' })
      }
      throw error
    }

    await client.query('COMMIT')
    return response.status(201).json({ paymentId: inserted.rows[0].payment_id, checkoutUrl: session.checkoutUrl })
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
})

export default router
