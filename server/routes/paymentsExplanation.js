// ============================================================================
// PECTRACK API — routes/payments.js (annotated for learning)
// Payment & Billing (Phase 6). Recording money against an order, and
// listing what has been recorded. Mounted at /api/payments in app.js.
//
// See PHASE6_PLAN.md for the full design — this file covers Steps 1 and 2
// from that plan: read-only billing (GET /) and recording a payment
// (POST /). Steps 3-4 (COMPLETED requires full payment; cancelling a paid
// order refunds it) live in routes/orders.js instead, because they modify
// order STATUS transitions, which Phase 5 already owns — putting them
// here would mean two files independently deciding what happens to an
// order's status, which is exactly the kind of duplicated business logic
// PHASES-RULES-PLANNING.md's rules warn against.
//
// PHASE 6.5 (see PHASE6.5_PLAN.md) adds the live PayMongo side, further
// down: POST /webhook (PayMongo's server confirming a payment) and POST
// /intent (creating a PayMongo Checkout Session). Both were sequenced
// AFTER the record layer above rather than built alongside it —
// PHASE6_PLAN.md, Decision 5, explains why (a webhook needs the order
// lock, the overpayment guard, and the idempotency key above to already
// be correct and tested, not built at the same time as them). Everything
// GET / and POST / above still records is money that has ALREADY changed
// hands — cash counted at the counter, or a GCash transfer the cashier
// can see on their own phone — so those two routes still insert every row
// straight to PAID; PENDING and FAILED, reserved since Phase 6 (Decision
// 6), are now finally written, but ONLY by the two Phase 6.5 routes below.
// ============================================================================
import express from 'express'
import { getBillingSummary } from '../lib/billing.js'
import { config } from '../config.js'
import { pool } from '../db.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { createCheckoutSession, PaymongoApiError, paymongoMinimumAmountCentavos, PaymongoWebhookVerificationError, verifyPaymongoWebhook } from '../lib/paymongo.js'
import { dateRangeSql, parseDateRange } from '../lib/reporting.js'
import { normalize, parseId } from '../lib/validation.js'

const router = express.Router()

// PHASE6_PLAN.md, Decision 4 — validated here in code, not enforced by a
// new Postgres enum. payments.payment_method is VARCHAR(50) in the
// approved thesis schema (not an enum, unlike order_status or
// payment_status), so a Set at the API boundary gives the SAME guarantee
// an enum would — nothing outside this list can ever be written — without
// a schema migration the day a third method (say, a bank transfer) needs
// adding. Same pattern as manualMovementReasons in routes/inventory.js.
const paymentMethods = new Set(['CASH', 'GCASH'])
// Mirrors payments.gateway_reference's own VARCHAR(255) in the approved
// thesis schema. A named constant rather than a bare 255 buried in a
// condition, so the validation and the column can be seen to agree — the
// same reasoning behind requestReasonMaxLength in routes/inventory.js.
const gatewayReferenceMaxLength = 255
// PHASE 8, DECISION 5 (PHASE8_PLAN.md) — payment_status mirrored here the
// same way paymentMethods mirrors payment_method above, so GET / can
// validate a ?status= filter without a round trip to the database just to
// ask "is this a real status".
const paymentStatuses = new Set(['PENDING', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED'])
const defaultPaymentsLimit = 50
const maxPaymentsLimit = 200

// Reshapes one row from the FLAT, cross-order listing (GET /) into the
// camelCase shape the frontend consumes. Deliberately a DIFFERENT mapper
// from lib/billing.js's mapPaymentRow, even though both describe a
// payments row: that one is scoped to ONE order (used inside a receipt)
// and never needs to say WHICH order or customer it belongs to, since the
// caller already knows. This one is a payment LEDGER across every order,
// so it has to carry orderId/orderStatus/customerName that the per-order
// version has no reason to repeat.
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

// Same narrower-join reasoning as lib/billing.js's per-order query:
// recorded_by is only ever written by a cashier or admin (POST / below
// requires one of those two roles before a row can even be inserted),
// and refunded_by is only ever written by an admin (routes/orders.js's
// cancellation branch only refunds when request.user.role === 'ADMIN').
// Joining just admins+cashiers for the first and admins alone for the
// second is enough to name whoever did it — the same reasoning
// routes/inventory.js already uses for requested_by (cashiers only) and
// reviewed_by (admins only).
//
// COUNT(*) OVER() — no PARTITION BY — is evaluated over every row the
// WHERE clause matched, BEFORE LIMIT/OFFSET trims the page down (that is
// SQL's own logical order of operations, not a coincidence this query
// relies on). Reading it off row 0 gives GET / below the true total match
// count in the SAME round trip as the page of rows itself, rather than a
// second COUNT(*) query against the same filters.
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
  // ------------------------------------------------------------------
  // CHECKED FIRST, BEFORE ANYTHING TOUCHES THE REQUEST — and found in
  // review, not by design.
  //
  // With no secret configured, `config.paymongo.webhookSecret` is
  // undefined, and verifyPaymongoWebhook happily carried that all the way
  // to crypto.createHmac('sha256', undefined) — which throws a TypeError,
  // NOT a PaymongoWebhookVerificationError. The catch below only converts
  // the latter, so the TypeError escaped to app.js's generic handler and
  // came back as a 500 with a stack trace in the logs.
  //
  // That made this endpoint — the one route in this entire application
  // that any anonymous caller on the internet can reach — reliably
  // crashable by anyone, while the secret was unset. Which is the app's
  // DEFAULT state: no PayMongo credentials exist in this repo yet.
  //
  // 503 rather than 400 is the honest status: the request may well be a
  // perfectly good webhook, and PayMongo's retry logic treating this as
  // "try again later" is exactly right — once the secret IS configured, a
  // retry genuinely would succeed, where a 400 would tell PayMongo the
  // request itself was malformed and not worth repeating.
  // ------------------------------------------------------------------
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
// ADMIN and CASHIER see every payment — they are staff doing the actual
// billing work, not a customer checking their own bill. CUSTOMER is ALSO
// admitted here (unlike routes/inventory.js, which is admin/cashier
// only), because PHASES-RULES-PLANNING.md's housekeeping note is explicit
// that a customer should be able to see their OWN bills — scoped by GET /
// below, the identical shape GET /api/orders already uses for a
// customer's own orders.
//
// DELIVERY_PERSONNEL is excluded for the same reason routes/orders.js
// excludes that role entirely: no real access model exists for it yet
// (see that file's own comment on the point), and billing has even LESS
// to do with delivery than order status does — there is no "orders
// assigned to my current deliveries" scoping question to even ask here.
router.use(requireAuth, requireRole('ADMIN', 'CASHIER', 'CUSTOMER'))

// PHASE 8, DECISION 5 (PHASE8_PLAN.md) — transaction history EXTENDS this
// existing endpoint rather than becoming a second one under /api/reports.
// A new GET /api/reports/transactions would have to restate this SELECT
// and its role scoping, which is exactly the duplication
// PHASES-RULES-PLANNING.md forbids ("avoid duplicated business logic
// across routes") — and worse, two payment lists that could quietly drift
// on who is allowed to see what. The role scoping below is UNCHANGED from
// before this phase: a customer filtering their own history is a new
// feature; a customer seeing anyone else's is the bug that scoping
// already prevented.
router.get('/', async (request, response) => {
  // filters/params are built up incrementally rather than as one big
  // conditional string, because how many WHERE clauses apply (customer
  // scoping? a date range? method? status?) varies per caller, and each
  // one needs its OWN correctly-numbered $N placeholder — get that
  // numbering wrong and a filter silently binds to the wrong value.
  const filters = []
  const params = []

  if (request.user.role === 'CUSTOMER') {
    // Resolved from the SESSION's user_id, never trusted from anything
    // the client sends — same pattern as every other customer-scoped
    // query in this app (GET /api/orders, GET /api/inventory/requests for
    // a cashier's own rows).
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
  // An EMPTY page has no row 0 to read it from, and that is where the
  // first version of this got it wrong: it treated "no rows came back" as
  // "the total is 0". Those are two different situations wearing the same
  // costume — "nothing matches these filters" (0 is right) and "the
  // filters match plenty, this page just isn't one of them" (0 is a lie
  // that tells a customer their payment history is empty). Caught in the
  // Phase 8 review by asking for offset=99 against three real payments
  // and watching total come back 0.
  //
  // Only the past-the-end case needs a second query, so the common path
  // still gets its total in the same round trip as the rows.
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

// POST /api/payments — CASHIER or ADMIN only, re-asserted here despite
// the router-wide guard above already admitting CUSTOMER too. Same shape
// as routes/inventory.js's PATCH /:productId re-asserting ADMIN even
// though the router-wide guard lets a cashier that far: a customer needs
// GET access to this router to see their own bills, but must never be
// able to record money changing hands themselves — that always happens
// at the counter, through staff, never self-service.
router.post('/', requireRole('CASHIER', 'ADMIN'), async (request, response) => {
  const orderId = parseId(request.body.orderId)
  if (!orderId) return response.status(422).json({ message: 'Select a valid order.', errors: { orderId: 'Select a valid order.' } })

  const errors = {}

  const method = normalize(request.body.method).toUpperCase()
  if (!paymentMethods.has(method)) errors.method = 'Select cash or GCash.'

  // PHASE6_PLAN.md, Decision 3 — 0 and negative amounts are refused HERE,
  // in validation, before any database work. The column's own
  // CHECK (amount >= 0) would let a ZERO amount through (it satisfies
  // >= 0), but a payment of nothing records nothing that actually
  // happened — it would just be a meaningless row someone could use to
  // pad the payments table.
  // WHY THE CHECK RUNS ON THE ROUNDED FIGURE, NOT THE RAW ONE.
  //
  // Rounding to 2dp is the same "round in JavaScript before it ever
  // reaches Postgres" pattern routes/products.js uses for price — it
  // collapses floating-point noise (a browser can produce something like
  // 19.999999999998 from ordinary arithmetic) into the clean figure the
  // NUMERIC(12,2) column will actually store.
  //
  // The ORDER of the two operations is what matters, and the first
  // version of this route got it backwards: it validated the RAW amount
  // and then rounded. Any value under half a centavo — 0.001, 0.004 —
  // is genuinely greater than zero, so it sailed through a `raw <= 0`
  // check, and then rounded down to 0 on its way into the database. The
  // result was a ₱0.00 PAID row: precisely the meaningless row Decision 3
  // exists to forbid, written by the very check meant to forbid it.
  // Validating what will actually be STORED closes that gap, and is the
  // general lesson too — validate the value you are about to persist, not
  // the one you happened to receive.
  const rawAmount = Number(request.body.amount)
  const amount = Number.isFinite(rawAmount) ? Math.round(rawAmount * 100) / 100 : Number.NaN
  if (!Number.isFinite(amount) || amount <= 0) errors.amount = 'Enter an amount of at least ₱0.01.'

  // gateway_reference is NULL for cash — there is nothing to reference —
  // and it must be NULL, never an empty string. This is not a style
  // preference: gateway_reference is UNIQUE (Pattern C below), and SQL's
  // UNIQUE constraint treats every NULL as distinct from every other
  // value, including another NULL — but treats '' as an ordinary value
  // like any other, so TWO cash payments both storing '' would collide
  // with each other on the very next cash payment recorded after the
  // first. Required and validated ONLY for GCASH, where a reference is
  // the whole point.
  let gatewayReference = null
  if (method === 'GCASH') {
    gatewayReference = normalize(request.body.gatewayReference)
    if (!gatewayReference) errors.gatewayReference = 'Enter the GCash reference number from the receipt.'
    // REFUSED when too long, deliberately NOT silently truncated — and
    // that is a real distinction from how this app treats every other
    // over-long input. `reason` and `note` elsewhere are .slice()d,
    // because they are free text: a clipped sentence still means roughly
    // what it meant. A gateway reference is an IDENTIFIER. It has to
    // match one real GCash transaction exactly, so a truncated reference
    // is not a shorter version of the truth — it is a DIFFERENT, wrong
    // reference, which would then occupy the UNIQUE slot the real one
    // needs and quietly break Pattern C's double-payment guard for it.
    //
    // Without this check the column's own VARCHAR(255) limit still
    // stopped the write, but as an unhandled SQLSTATE 22001 that reached
    // the generic error handler — so a cashier who fat-fingered a paste
    // saw "the service could not process your request" (a 500, implying
    // the server broke) instead of being told their reference was too
    // long. Measured before the fix: 255 characters returned 201, 256
    // returned 500.
    else if (gatewayReference.length > gatewayReferenceMaxLength) errors.gatewayReference = `A GCash reference cannot be longer than ${gatewayReferenceMaxLength} characters.`
  }

  if (Object.keys(errors).length) return response.status(422).json({ message: 'Please correct the highlighted fields.', errors })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // ------------------------------------------------------------------
    // PATTERN A — LOCK THE ORDER ROW BEFORE DECIDING ANYTHING.
    //
    // Recording a payment is a READ-MODIFY-WRITE over an AGGREGATE: to
    // decide whether ₱200 is allowed, the route must know what is
    // ALREADY paid, which means summing every PAID row for this order.
    // That "read, then decide, then write" shape is exactly what
    // produced three separate defects during the Phase 5 review — see
    // PHASE5_PLAN.md's corrected Pattern C for the general lesson: a
    // condition checked outside the write it gates can only produce a
    // FRIENDLIER MESSAGE, never a GUARANTEE.
    //
    // Note WHICH row gets locked: orders, not payments. There is no
    // single payments row to lock the way inventory locks one product's
    // row for a stock edit — the thing actually being protected is the
    // AGGREGATE over a whole collection of payments rows, and locking
    // the PARENT (the order those rows all reference) is what serializes
    // every write against its children. Without this lock, two cashiers
    // recording payment for the same order at the same moment could BOTH
    // read "nothing paid yet", BOTH conclude ₱500 is acceptable, and BOTH
    // insert — leaving the order paid ₱1000 with no record anywhere that
    // ₱500 of that needs to be refunded.
    // ------------------------------------------------------------------
    const orderResult = await client.query('SELECT order_id, status FROM orders WHERE order_id = $1 FOR UPDATE', [orderId])
    const order = orderResult.rows[0]
    if (!order) {
      await client.query('ROLLBACK')
      return response.status(404).json({ message: 'Order not found.' })
    }
    // A cancelled order's balance_due is NOT necessarily zero — an order
    // that was cancelled while still fully unpaid keeps its whole
    // total_amount sitting as "owed" (lib/billing.js has no special case
    // for CANCELLED). Left unchecked, the overpayment guard below would
    // happily ACCEPT a payment against a cancelled order, since nothing
    // about that guard's arithmetic knows the order is dead. That would
    // record real money against an order nobody is fulfilling, so this
    // is refused explicitly rather than relying on the guard to catch it
    // by coincidence — which it wouldn't, for an order that was
    // cancelled before ever being paid.
    if (order.status === 'CANCELLED') {
      await client.query('ROLLBACK')
      return response.status(409).json({ message: 'This order was cancelled — a payment cannot be recorded against it.' })
    }

    let recorded
    try {
      // ------------------------------------------------------------------
      // PATTERN B — THE OVERPAYMENT GUARD AS A CONDITIONAL INSERT.
      //
      // The lock above makes the arithmetic SAFE (nothing else can move
      // the numbers underneath this transaction); this is what makes the
      // arithmetic CORRECT, and it does that arithmetic entirely inside
      // Postgres, in NUMERIC, rather than in JavaScript. pg returns
      // NUMERIC columns as STRINGS specifically because JS numbers are
      // binary floating point and would silently lose precision on
      // money — comparing '500.00' > '1000.00' as plain strings is even
      // WORSE, since that comparison is TRUE (lexicographic, not
      // numeric). None of that ambiguity can happen here, because the
      // comparison never leaves SQL.
      //
      // rowCount === 0 (checked below) IS the "this is more than the
      // order still owes" signal — the exact same conditional-write
      // idiom Phase 5 uses for stock deduction (`UPDATE ... WHERE
      // stock_quantity >= $2`), the order status claim in
      // routes/orders.js, and change-request review in
      // routes/inventory.js. Three routes already share this idiom; this
      // INSERT...SELECT...WHERE is the fourth, not a new one invented
      // for this file.
      // ------------------------------------------------------------------
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
      // ------------------------------------------------------------------
      // PATTERN C — gateway_reference's UNIQUE CONSTRAINT IS THE
      // DOUBLE-PAYMENT GUARD.
      //
      // A GCash reference number identifies ONE real transfer. If the
      // same receipt gets recorded twice — a cashier's mis-click, or a
      // customer presenting the same receipt at two different counters —
      // the order would be credited for money that only actually arrived
      // once. The column is already UNIQUE (approved thesis schema), so
      // Postgres refuses the second INSERT on its own; this just turns
      // that refusal into the SAME clean 409 shape every other guard in
      // this route produces, rather than letting a raw constraint
      // violation surface as a generic 500.
      //
      // The `error.constraint` check keeps this NARROW on purpose. A
      // bare `error.code === '23505'` would ALSO swallow a unique
      // violation from some entirely unrelated future constraint on this
      // table and mislabel it as a duplicate-reference conflict; naming
      // the specific index means anything else still rethrows and
      // surfaces honestly. Same pattern routes/inventory.js uses for
      // inventory_change_requests_one_pending_per_product_idx.
      // ------------------------------------------------------------------
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

    // Re-read AFTER commit, on the shared pool rather than the
    // now-released client — same "write inside a transaction, then
    // re-SELECT via pool for the response" convention routes/inventory.js
    // already follows for its own POST/PATCH handlers. getBillingSummary
    // is what actually computes balanceDue/isFullyPaid; find() below just
    // picks THIS payment's own row back out of its full payments list to
    // answer with, rather than re-deriving a second, narrower mapping
    // just for this one response.
    const summary = await getBillingSummary(pool, orderId)
    const paymentRow = summary.payments.find((row) => row.id === recorded.rows[0].payment_id)
    return response.status(201).json({ payment: paymentRow, balanceDue: summary.balanceDue, isFullyPaid: summary.isFullyPaid })
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    // ALWAYS runs, on every path above — including every early `return`
    // inside the try block, since JS guarantees a `finally` block runs
    // before a `try` block's `return` actually completes. This is what
    // guarantees the connection this handler checked out from the pool
    // is always handed back, exactly once, no matter which branch above
    // was taken.
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
