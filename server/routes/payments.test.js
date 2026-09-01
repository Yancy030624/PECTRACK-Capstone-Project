// Integration tests for Payment & Billing (Phase 6). Same approach as the
// rest of the suite: real Express app on an ephemeral port, real database.
// Run with: npm test
//
// See PHASE6_PLAN.md for the design this file verifies — Decisions 1-4 and
// Patterns A-C in particular. The plan is explicit that a race test which
// has never been observed to fail is not yet a test; the concurrency test
// below was run against the unfixed route (FOR UPDATE removed) and
// confirmed to fail before being trusted here.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { after, before, describe, test } from 'node:test'
import bcrypt from 'bcrypt'
import app from '../app.js'
import { config } from '../config.js'
import { pool } from '../db.js'

const runId = crypto.randomUUID().slice(0, 8)
const randomContactNumber = () => `09${Math.floor(100000000 + Math.random() * 899999999)}`

describe('payment & billing', () => {
  let server
  let baseUrl
  let adminCookie
  let cashierCookie
  let customerCookie
  let secondCustomerCookie
  let categoryId
  let productId
  const createdUserIds = []
  const createdProductIds = []
  const createdOrderIds = []

  const admin = { username: `paytest_admin_${runId}`, password: 'Admin-Only-Password-9!' }
  const cashier = { role: 'CASHIER', name: 'Payment Test Cashier', username: `paytest_cash_${runId}`, email: `paytest_cash_${runId}@example.com`, contactNumber: randomContactNumber(), password: 'Cashier-Password-9!' }
  const customer = { name: 'Payment Test Customer', username: `paytest_cust_${runId}`, email: `paytest_cust_${runId}@example.com`, contactNumber: randomContactNumber(), password: 'Correct-Horse-Battery-9!' }
  const secondCustomer = { name: 'Second Payment Customer', username: `paytest_cust2_${runId}`, email: `paytest_cust2_${runId}@example.com`, contactNumber: randomContactNumber(), password: 'Correct-Horse-Battery-9!' }

  before(async () => {
    server = app.listen(0)
    await new Promise((resolve) => server.once('listening', resolve))
    baseUrl = `http://localhost:${server.address().port}`

    const adminPasswordHash = await bcrypt.hash(admin.password, 4)
    const adminResult = await pool.query(`INSERT INTO users (username, password_hash, user_type) VALUES ($1, $2, 'ADMIN') RETURNING user_id`, [admin.username, adminPasswordHash])
    createdUserIds.push(adminResult.rows[0].user_id)
    await pool.query('INSERT INTO admins (user_id, name, contact_num, email) VALUES ($1, $2, $3, $4)', [adminResult.rows[0].user_id, 'Payment Test Admin', randomContactNumber(), `paytest_admin_${runId}@example.com`])
    await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: admin.username, password: admin.password }) })
    const rawCode = '112233'
    const challengeToken = `test-challenge-${crypto.randomUUID()}`
    await pool.query(`INSERT INTO otp_codes (user_id, code_hash, challenge_token, expires_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP + INTERVAL '5 minutes')`, [adminResult.rows[0].user_id, crypto.createHash('sha256').update(rawCode).digest('hex'), challengeToken])
    const otpResponse = await fetch(`${baseUrl}/api/auth/verify-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ challengeToken, code: rawCode }) })
    adminCookie = otpResponse.headers.get('set-cookie').split(';')[0]

    const cashierCreate = await fetch(`${baseUrl}/api/staff`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ ...cashier, confirmPassword: cashier.password }) })
    assert.equal(cashierCreate.status, 201)
    const cashierRow = await pool.query('SELECT user_id FROM users WHERE username = $1', [cashier.username])
    createdUserIds.push(cashierRow.rows[0].user_id)
    const cashierLogin = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: cashier.username, password: cashier.password }) })
    cashierCookie = cashierLogin.headers.get('set-cookie').split(';')[0]

    await fetch(`${baseUrl}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...customer, confirmPassword: customer.password }) })
    const customerRow = await pool.query('SELECT user_id FROM users WHERE username = $1', [customer.username])
    createdUserIds.push(customerRow.rows[0].user_id)
    const customerLogin = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: customer.username, password: customer.password }) })
    customerCookie = customerLogin.headers.get('set-cookie').split(';')[0]

    await fetch(`${baseUrl}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...secondCustomer, confirmPassword: secondCustomer.password }) })
    const secondCustomerRow = await pool.query('SELECT user_id FROM users WHERE username = $1', [secondCustomer.username])
    createdUserIds.push(secondCustomerRow.rows[0].user_id)
    const secondCustomerLogin = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: secondCustomer.username, password: secondCustomer.password }) })
    secondCustomerCookie = secondCustomerLogin.headers.get('set-cookie').split(';')[0]

    const categoryResult = await pool.query('INSERT INTO categories (category_name) VALUES ($1) RETURNING category_id', [`Payment Test Category ${runId}`])
    categoryId = categoryResult.rows[0].category_id

    // Priced at an even 100 so every test total is a round number and the
    // arithmetic in each assertion is easy to check by eye.
    const productResponse = await fetch(`${baseUrl}/api/products`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ categoryId, name: `Payment Test Loaf ${runId}`, price: 100 }) })
    productId = (await productResponse.json()).product.id
    createdProductIds.push(productId)
    await pool.query('UPDATE inventory SET stock_quantity = 100000 WHERE product_id = $1', [productId])
  })

  after(async () => {
    globalThis.fetch = originalFetch
    await pool.query('DELETE FROM payments WHERE order_id = ANY($1)', [createdOrderIds]).catch(() => {})
    await pool.query('DELETE FROM inventory_movements WHERE order_id = ANY($1)', [createdOrderIds]).catch(() => {})
    for (const orderId of createdOrderIds) {
      await pool.query('DELETE FROM order_status_history WHERE order_id = $1', [orderId]).catch(() => {})
      await pool.query('DELETE FROM order_details WHERE order_id = $1', [orderId]).catch(() => {})
      await pool.query('DELETE FROM orders WHERE order_id = $1', [orderId]).catch(() => {})
    }
    for (const id of createdProductIds) {
      await pool.query('DELETE FROM inventory WHERE product_id = $1', [id]).catch(() => {})
      await pool.query('DELETE FROM products WHERE product_id = $1', [id]).catch(() => {})
    }
    await pool.query('DELETE FROM categories WHERE category_id = $1', [categoryId]).catch(() => {})
    await pool.query('DELETE FROM otp_codes WHERE user_id = ANY($1)', [createdUserIds]).catch(() => {})
    await pool.query('DELETE FROM sessions WHERE user_id = ANY($1)', [createdUserIds]).catch(() => {})
    for (const table of ['admins', 'cashiers', 'customers']) {
      await pool.query(`DELETE FROM ${table} WHERE user_id = ANY($1)`, [createdUserIds]).catch(() => {})
    }
    await pool.query('DELETE FROM users WHERE user_id = ANY($1)', [createdUserIds]).catch(() => {})
    await new Promise((resolve) => server.close(resolve))
  })

  // Places a fresh order for `quantity` units of the ₱100 test product, as
  // the given customer, and returns its id and total. Every payment test
  // needs a clean order with a known total to record against — sharing one
  // product but giving each test its OWN order keeps balances from one
  // test bleeding into another the way sharing one order would.
  const createOrder = async (quantity, cookie = customerCookie) => {
    const response = await fetch(`${baseUrl}/api/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ items: [{ productId, quantity }] }) })
    const body = await response.json()
    createdOrderIds.push(body.order.id)
    return { orderId: body.order.id, totalAmount: body.order.totalAmount }
  }

  const recordPayment = (body, cookie = cashierCookie) =>
    fetch(`${baseUrl}/api/payments`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(body) })

  const getOrder = async (orderId, cookie = cashierCookie) => {
    const response = await fetch(`${baseUrl}/api/orders/${orderId}`, { headers: { Cookie: cookie } })
    return (await response.json()).order
  }

  // ==========================================================================
  // Phase 6.5 — live PayMongo integration (see PHASE6.5_PLAN.md). No real
  // PayMongo test-mode credentials exist in this environment — confirmed
  // during planning, before any of this was written, that .env has none.
  //
  // POST /api/payments/webhook needs no network at all to test: every
  // webhook test below hand-signs a synthetic payload with the SAME HMAC
  // recipe verifyPaymongoWebhook expects (read from PayMongo's own SDK
  // source — see lib/paymongoExplanation.js), against a fake shared secret
  // this file controls completely.
  //
  // POST /api/payments/intent DOES make one real network call
  // (createCheckoutSession, inside lib/paymongo.js) — stubbed here via
  // globalThis.fetch, Node's own built-in, NOT a mocking library, so no
  // new dependency is added for it. This is exactly what
  // PHASE6.5_PLAN.md's Step 3 promised: "tested without ever calling
  // PayMongo, by having the test double the network call." The stub only
  // intercepts requests to PayMongo's real host — every other fetch call
  // in this file (all of them hitting `baseUrl`, this test's own local
  // server) passes straight through to the real fetch, unaffected.
  // ==========================================================================
  const paymongoWebhookSecret = 'whsk_test_fixture_secret_for_this_file_only'
  config.paymongo.secretKey = 'sk_test_fixture_key_for_this_file_only'
  config.paymongo.webhookSecret = paymongoWebhookSecret
  config.paymongo.successUrl = 'http://localhost:5173/'
  config.paymongo.cancelUrl = 'http://localhost:5173/'

  const originalFetch = globalThis.fetch
  // Lets one test make PayMongo artificially slow, to prove no database
  // lock or pooled connection is held while waiting on it. Zero for every
  // other test.
  let paymongoStubDelayMs = 0
  globalThis.fetch = async (url, options) => {
    if (!String(url).startsWith('https://api.paymongo.com/')) return originalFetch(url, options)
    // Only the checkout-session-creation call is ever made by this file's
    // code path — asserted rather than silently branching, so this stub
    // fails loudly the day lib/paymongo.js starts calling a second
    // PayMongo endpoint this fixture doesn't know how to fake.
    assert.match(String(url), /\/checkout_sessions$/, 'the fetch stub only knows how to fake checkout session creation')
    if (paymongoStubDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, paymongoStubDelayMs))
    const id = `cs_test_${crypto.randomUUID().slice(0, 12)}`
    return { ok: true, json: async () => ({ data: { id, attributes: { checkout_url: `https://checkout.paymongo.com/${id}` } } }) }
  }

  // Signs a webhook body EXACTLY the way verifyPaymongoWebhook expects to
  // unpack one (PHASE6.5_PLAN.md, Decision 4) — an independently
  // constructed signature, not a call into the module under test, so this
  // genuinely proves the route accepts a signature built the way PayMongo
  // itself builds one.
  const signWebhook = (bodyString, timestamp = Math.floor(Date.now() / 1000)) => {
    const hmac = crypto.createHmac('sha256', paymongoWebhookSecret).update(`${timestamp}.${bodyString}`).digest('hex')
    return `t=${timestamp},te=${hmac},li=`
  }
  // The envelope shape read from PayMongo's own SDK source
  // (Event.js/ApiResource.js) — see lib/paymongoExplanation.js for the
  // full citation.
  const buildPaymentEvent = (type, checkoutSessionId) => JSON.stringify({
    data: { id: `evt_${crypto.randomUUID().slice(0, 8)}`, attributes: { type, data: { id: `pay_${crypto.randomUUID().slice(0, 8)}`, attributes: { checkout_session_id: checkoutSessionId } } } },
  })
  const sendWebhook = (bodyString, signatureHeader) =>
    fetch(`${baseUrl}/api/payments/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Paymongo-Signature': signatureHeader }, body: bodyString })
  const createIntent = (orderId, cookie = cashierCookie) =>
    fetch(`${baseUrl}/api/payments/intent`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ orderId }) })
  const gatewayReferenceFor = async (paymentId) => (await pool.query('SELECT gateway_reference FROM payments WHERE payment_id = $1', [paymentId])).rows[0].gateway_reference

  test('POST /api/payments/intent creates a PENDING row and returns a checkout URL', async () => {
    const { orderId } = await createOrder(3) // total 300
    const response = await createIntent(orderId)
    assert.equal(response.status, 201)
    const body = await response.json()
    assert.match(body.checkoutUrl, /^https:\/\/checkout\.paymongo\.com\//)

    const row = await pool.query('SELECT status, amount, gateway_reference FROM payments WHERE payment_id = $1', [body.paymentId])
    assert.equal(row.rows[0].status, 'PENDING')
    assert.equal(row.rows[0].amount, '300.00')
    assert.ok(row.rows[0].gateway_reference, 'the checkout session id must be stored as gateway_reference')

    // A PENDING intent must not count as paid — it is only an attempt that
    // was STARTED, not money that has arrived.
    const order = await getOrder(orderId)
    assert.equal(order.payment.amountPaid, '0.00')
    assert.equal(order.payment.balanceDue, '300.00')
  })

  test('POST /api/payments/intent is unavailable when no PayMongo secret key is configured', async () => {
    const previousKey = config.paymongo.secretKey
    config.paymongo.secretKey = undefined
    try {
      const { orderId } = await createOrder(1)
      const response = await createIntent(orderId)
      assert.equal(response.status, 503)
    } finally {
      config.paymongo.secretKey = previousKey
    }
  })

  test('POST /api/payments/intent refuses a CANCELLED order', async () => {
    const { orderId } = await createOrder(1, customerCookie)
    const cancelResponse = await fetch(`${baseUrl}/api/orders/${orderId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: customerCookie }, body: JSON.stringify({ status: 'CANCELLED' }) })
    assert.equal(cancelResponse.status, 200)

    const response = await createIntent(orderId)
    assert.equal(response.status, 409)
  })

  test('POST /api/payments/intent refuses an order that is already fully paid', async () => {
    const { orderId } = await createOrder(1) // total 100
    const paid = await recordPayment({ orderId, method: 'CASH', amount: 100 })
    assert.equal(paid.status, 201)

    const response = await createIntent(orderId)
    assert.equal(response.status, 409)
  })

  // PayMongo's own stated minimum for any amount field is PHP 100.00 —
  // exercised here via a PARTIAL cash payment shrinking the remaining
  // balance below it, the realistic way this condition actually arises
  // (an order almost fully settled at the counter, with a small remainder
  // too small to send through the gateway).
  test('POST /api/payments/intent refuses a balance under the PayMongo minimum', async () => {
    const { orderId } = await createOrder(2) // total 200
    const partial = await recordPayment({ orderId, method: 'CASH', amount: 150 }) // balance 50
    assert.equal(partial.status, 201)

    const response = await createIntent(orderId)
    assert.equal(response.status, 422)
  })

  test('POST /api/payments/intent refuses a second attempt while one is already in progress', async () => {
    const { orderId } = await createOrder(2)
    const first = await createIntent(orderId)
    assert.equal(first.status, 201)

    const second = await createIntent(orderId)
    assert.equal(second.status, 409)

    const pendingCount = (await pool.query(`SELECT COUNT(*)::int AS n FROM payments WHERE order_id = $1 AND status = 'PENDING'`, [orderId])).rows[0].n
    assert.equal(pendingCount, 1)
  })

  // The route's own pre-check above only proves the FRIENDLY case — it is
  // a SELECT followed by a separate INSERT, so it cannot be what actually
  // enforces the rule (PHASE6.5_PLAN.md, Decision 3 explicitly says so).
  // This drives migration 006's partial unique index directly, through
  // two concurrent transactions, the same technique already proven for
  // the analogous Phase 5 guard (inventory.test.js, "the database itself
  // refuses a second pending row").
  test('the database itself refuses a second PENDING payment row, even when the route\'s pre-check is bypassed', async () => {
    const { orderId } = await createOrder(2)
    const cashierUserId = (await pool.query('SELECT user_id FROM users WHERE username = $1', [cashier.username])).rows[0].user_id
    const insertPending = (client, reference) => client.query(
      `INSERT INTO payments (order_id, recorded_by, payment_method, amount, status, gateway_reference) VALUES ($1, $2, 'GCASH', 100, 'PENDING', $3)`,
      [orderId, cashierUserId, reference],
    )

    const first = await pool.connect()
    const second = await pool.connect()
    try {
      await first.query('BEGIN')
      await second.query('BEGIN')

      await insertPending(first, `cs_test_first_${crypto.randomUUID()}`)
      // Blocks on the index until `first` resolves, rather than failing
      // immediately — started, not awaited, until after the commit.
      const contended = insertPending(second, `cs_test_second_${crypto.randomUUID()}`)
      await first.query('COMMIT')

      await assert.rejects(contended, (error) => error.code === '23505' && error.constraint === 'payments_one_pending_per_order_idx', 'the second pending row must be refused by the unique index')
      await second.query('ROLLBACK')
    } finally {
      first.release()
      second.release()
    }

    const remaining = (await pool.query(`SELECT COUNT(*)::int AS n FROM payments WHERE order_id = $1 AND status = 'PENDING'`, [orderId])).rows[0].n
    assert.equal(remaining, 1, 'exactly one pending row may survive two concurrent inserts')
  })

  test('a customer may create an intent for their own order, but not for someone else\'s', async () => {
    const { orderId: ownOrderId } = await createOrder(1, customerCookie)
    const ownAttempt = await createIntent(ownOrderId, customerCookie)
    assert.equal(ownAttempt.status, 201)

    const { orderId: otherOrderId } = await createOrder(1, secondCustomerCookie)
    const otherAttempt = await createIntent(otherOrderId, customerCookie)
    assert.equal(otherAttempt.status, 404)
  })

  test('a payment.paid webhook flips a matching PENDING row to PAID', async () => {
    const { orderId } = await createOrder(3) // total 300
    const intentResponse = await createIntent(orderId)
    const { paymentId } = await intentResponse.json()
    const checkoutSessionId = await gatewayReferenceFor(paymentId)

    const eventBody = buildPaymentEvent('payment.paid', checkoutSessionId)
    const webhookResponse = await sendWebhook(eventBody, signWebhook(eventBody))
    assert.equal(webhookResponse.status, 200)

    const order = await getOrder(orderId)
    assert.equal(order.payment.amountPaid, '300.00')
    assert.equal(order.payment.isFullyPaid, true)
  })

  // The MEANINGFUL idempotency test — not the exact same event redelivered
  // (an UPDATE that re-sets status='PAID' to 'PAID' again is trivially a
  // no-op either way, since there is no ROW being duplicated the way an
  // unguarded INSERT would; a first attempt at this test asserted exactly
  // that and PASSED even with the `AND status = 'PENDING'` guard removed
  // entirely — a test that cannot fail is not a test). What actually
  // proves the guard matters is a STALE, out-of-order event: PayMongo's
  // retry/redelivery behaviour does not guarantee ordering, so a
  // payment.failed for a reference that payment.paid ALREADY resolved is a
  // real scenario, not a hypothetical one. Without the guard, this would
  // silently flip an already-PAID row back to FAILED, erasing a payment
  // that genuinely happened — verified by removing the guard and watching
  // this test fail before trusting it.
  test('a stale payment.failed event cannot undo a payment.paid that already confirmed the same reference', async () => {
    const { orderId } = await createOrder(3) // total 300
    const intentResponse = await createIntent(orderId)
    const { paymentId } = await intentResponse.json()
    const checkoutSessionId = await gatewayReferenceFor(paymentId)

    const paidEventBody = buildPaymentEvent('payment.paid', checkoutSessionId)
    const paidResponse = await sendWebhook(paidEventBody, signWebhook(paidEventBody))
    assert.equal(paidResponse.status, 200)
    assert.equal((await getOrder(orderId)).payment.amountPaid, '300.00')

    const staleFailedEventBody = buildPaymentEvent('payment.failed', checkoutSessionId)
    const staleResponse = await sendWebhook(staleFailedEventBody, signWebhook(staleFailedEventBody))
    assert.equal(staleResponse.status, 200, 'a stale event is still acknowledged with 200 -- there is nothing for PayMongo to usefully retry')

    const afterStaleEvent = await getOrder(orderId)
    assert.equal(afterStaleEvent.payment.amountPaid, '300.00', 'a stale FAILED event must not undo an already-confirmed payment')
    const row = await pool.query('SELECT status FROM payments WHERE payment_id = $1', [paymentId])
    assert.equal(row.rows[0].status, 'PAID', 'the row must stay PAID, not be overwritten by a late-arriving FAILED event')
  })

  test('a payment.failed webhook flips PENDING to FAILED, and it does not count toward amountPaid', async () => {
    const { orderId } = await createOrder(1) // total 100
    const intentResponse = await createIntent(orderId)
    const { paymentId } = await intentResponse.json()
    const checkoutSessionId = await gatewayReferenceFor(paymentId)

    const eventBody = buildPaymentEvent('payment.failed', checkoutSessionId)
    const webhookResponse = await sendWebhook(eventBody, signWebhook(eventBody))
    assert.equal(webhookResponse.status, 200)

    const row = await pool.query('SELECT status FROM payments WHERE payment_id = $1', [paymentId])
    assert.equal(row.rows[0].status, 'FAILED')

    const order = await getOrder(orderId)
    assert.equal(order.payment.amountPaid, '0.00', 'a FAILED payment must not count toward amountPaid')

    // A FAILED row must not block a fresh attempt — confirms migration
    // 006's index is scoped to PENDING only, not any row that ever
    // existed for this order.
    const secondIntent = await createIntent(orderId)
    assert.equal(secondIntent.status, 201)
  })

  test('a webhook for an unknown checkout_session_id is acknowledged, not treated as an error', async () => {
    const eventBody = buildPaymentEvent('payment.paid', 'cs_test_never_created_by_this_server')
    const response = await sendWebhook(eventBody, signWebhook(eventBody))
    assert.equal(response.status, 200)
  })

  test('a webhook for an event type this app does not act on is acknowledged and leaves the row untouched', async () => {
    const { orderId } = await createOrder(1)
    const intentResponse = await createIntent(orderId)
    const { paymentId } = await intentResponse.json()
    const checkoutSessionId = await gatewayReferenceFor(paymentId)

    const eventBody = buildPaymentEvent('refund.succeeded', checkoutSessionId)
    const response = await sendWebhook(eventBody, signWebhook(eventBody))
    assert.equal(response.status, 200)

    const row = await pool.query('SELECT status FROM payments WHERE payment_id = $1', [paymentId])
    assert.equal(row.rows[0].status, 'PENDING', 'an event type this app does not handle must not change the row')
  })

  // Found in review: /intent originally called PayMongo from INSIDE its
  // transaction, holding a FOR UPDATE lock on the order and a pooled
  // connection for the whole internet round trip. Measured with PayMongo
  // stubbed at 3s: an unrelated cash payment on the same order blocked for
  // 2542ms, and with 12 such calls in flight a plain GET /api/products took
  // 2330ms because the pool (default max 10) was exhausted — a slow payment
  // provider stalling the ENTIRE API, not just the order being paid for.
  //
  // The assertion is deliberately an ORDERING one, not a stopwatch: if the
  // lock were held across the network call, the cash payment could not
  // possibly finish first, no matter how fast the machine. That makes this
  // robust where an absolute-milliseconds threshold would be flaky.
  test('/intent does not hold a database lock while waiting on PayMongo', async () => {
    const { orderId } = await createOrder(5) // total 500
    paymongoStubDelayMs = 2000
    try {
      const finishOrder = []
      const intentPromise = createIntent(orderId).then((response) => { finishOrder.push('intent'); return response })
      // Give /intent time to get past its own validation and into the
      // (stubbed, slow) PayMongo call before the cash payment starts.
      await new Promise((resolve) => setTimeout(resolve, 300))
      const cashPromise = recordPayment({ orderId, method: 'CASH', amount: 100 }).then((response) => { finishOrder.push('cash'); return response })

      const [intentResponse, cashResponse] = await Promise.all([intentPromise, cashPromise])
      assert.equal(cashResponse.status, 201)
      assert.equal(intentResponse.status, 201)
      assert.deepEqual(finishOrder, ['cash', 'intent'], 'the cash payment must complete BEFORE the slow intent — if it waits, /intent is holding the order lock across the network call again')
    } finally {
      paymongoStubDelayMs = 0
    }
  })

  // Found in review: with no webhook secret configured — the app's default
  // state until real credentials are wired in — a well-formed signature
  // header reached crypto.createHmac('sha256', undefined), which throws a
  // TypeError rather than a PaymongoWebhookVerificationError. That escaped
  // the handler's catch and became a 500, meaning any anonymous caller on
  // the internet could reliably crash this unauthenticated endpoint into an
  // error response and a logged stack trace.
  test('the webhook refuses cleanly when no webhook secret is configured, rather than crashing', async () => {
    const previousSecret = config.paymongo.webhookSecret
    config.paymongo.webhookSecret = undefined
    try {
      const eventBody = buildPaymentEvent('payment.paid', 'cs_test_whatever')
      // A well-formed, correctly-shaped header — the point is that it gets
      // past the header parsing and reaches the HMAC step, which is where
      // the missing secret used to blow up.
      const response = await sendWebhook(eventBody, `t=${Math.floor(Date.now() / 1000)},te=${'a'.repeat(64)},li=`)
      assert.equal(response.status, 503, 'an unconfigured webhook secret must never surface as a 500')
    } finally {
      config.paymongo.webhookSecret = previousSecret
    }
  })

  test('a webhook with an invalid signature is refused with 400', async () => {
    const eventBody = buildPaymentEvent('payment.paid', 'cs_test_whatever')
    const response = await sendWebhook(eventBody, 't=1700000000,te=deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef,li=')
    assert.equal(response.status, 400)
  })

  test('a webhook with no signature header at all is refused with 400, not a crash', async () => {
    const eventBody = buildPaymentEvent('payment.paid', 'cs_test_whatever')
    const response = await fetch(`${baseUrl}/api/payments/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: eventBody })
    assert.equal(response.status, 400)
  })

  // The single most important behavioural test in this phase, and the one
  // most likely to look "wrong" without PHASE6.5_PLAN.md open next to it:
  // a confirmed gateway payment is recorded in FULL even if it now
  // overpays the order, because by the time the webhook fires the
  // customer's money has ALREADY moved (Decision 9). Refusing to record it
  // would not undo the transfer — it would just make a real payment
  // invisible to this system, which is worse than a visible, correctable
  // overpaid balance.
  test('a confirmed gateway payment is recorded in full even if the balance shrank in between, per Decision 9', async () => {
    const { orderId } = await createOrder(5) // total 500
    const intentResponse = await createIntent(orderId)
    const { paymentId } = await intentResponse.json()
    const checkoutSessionId = await gatewayReferenceFor(paymentId)

    // A SEPARATE, unrelated cash payment lands on the SAME order while the
    // gateway intent — sized against the ORIGINAL full 500 balance — is
    // still pending.
    const cashPayment = await recordPayment({ orderId, method: 'CASH', amount: 100 })
    assert.equal(cashPayment.status, 201)

    const eventBody = buildPaymentEvent('payment.paid', checkoutSessionId)
    const webhookResponse = await sendWebhook(eventBody, signWebhook(eventBody))
    assert.equal(webhookResponse.status, 200)

    const order = await getOrder(orderId)
    // 500 (the gateway payment, honoured in full) + 100 (the unrelated
    // cash payment) = 600 recorded against a 500 order.
    assert.equal(order.payment.amountPaid, '600.00', 'the confirmed gateway payment must be recorded in FULL, not capped or refused')
    assert.equal(order.payment.balanceDue, '-100.00', 'an overpaid order is a visible, correctable state — silently dropping the confirmed payment would be worse')
    assert.equal(order.payment.isFullyPaid, true)
  })

  // Guards a real bug found while writing this file: amountPaid's SQL
  // COALESCE fallback (lib/billing.js) is a bare, untyped 0 whenever an
  // order has no PAID rows at all — Postgres formats that as the string
  // '0', while every other money figure here (totalAmount, balanceDue,
  // and amountPaid once a real payment exists) formats as '0.00'. A
  // caller comparing strings, or a receipt simply displaying the value,
  // would show inconsistent decimal places depending on whether anything
  // had been paid yet.
  test('an unpaid order reports amountPaid as "0.00", not "0"', async () => {
    const { orderId } = await createOrder(1)
    const order = await getOrder(orderId)
    assert.equal(order.payment.amountPaid, '0.00')
    assert.equal(order.payment.balanceDue, '100.00')
  })

  test('POST /api/payments requires authentication', async () => {
    const { orderId } = await createOrder(1)
    const response = await fetch(`${baseUrl}/api/payments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId, method: 'CASH', amount: 100 }) })
    assert.equal(response.status, 401)
  })

  test('POST /api/payments rejects a customer — cashier/admin only', async () => {
    const { orderId } = await createOrder(1)
    const response = await recordPayment({ orderId, method: 'CASH', amount: 100 }, customerCookie)
    assert.equal(response.status, 403)
  })

  test('recording a payment updates the balance, and the row is PAID', async () => {
    const { orderId } = await createOrder(2) // total 200

    const response = await recordPayment({ orderId, method: 'CASH', amount: 200 })
    assert.equal(response.status, 201)
    const body = await response.json()
    assert.equal(body.payment.status, 'PAID')
    assert.equal(body.payment.method, 'CASH')
    assert.equal(body.balanceDue, '0.00')
    assert.equal(body.isFullyPaid, true)

    const order = await getOrder(orderId)
    assert.equal(order.payment.amountPaid, '200.00')
    assert.equal(order.payment.balanceDue, '0.00')
    assert.equal(order.payment.isFullyPaid, true)
    assert.equal(order.payment.payments.length, 1)
  })

  test('a partial payment leaves a balance; a second payment clears it', async () => {
    const { orderId } = await createOrder(5) // total 500

    const first = await recordPayment({ orderId, method: 'CASH', amount: 300 })
    assert.equal(first.status, 201)
    const firstBody = await first.json()
    assert.equal(firstBody.balanceDue, '200.00')
    assert.equal(firstBody.isFullyPaid, false)

    const afterFirst = await getOrder(orderId)
    assert.equal(afterFirst.payment.amountPaid, '300.00')
    assert.equal(afterFirst.payment.isFullyPaid, false)

    const second = await recordPayment({ orderId, method: 'CASH', amount: 200 })
    assert.equal(second.status, 201)
    const secondBody = await second.json()
    assert.equal(secondBody.balanceDue, '0.00')
    assert.equal(secondBody.isFullyPaid, true)

    const afterSecond = await getOrder(orderId)
    assert.equal(afterSecond.payment.amountPaid, '500.00')
    assert.equal(afterSecond.payment.payments.length, 2)
  })

  test('overpaying in one payment is refused with 409, and no row is written', async () => {
    const { orderId } = await createOrder(1) // total 100

    const response = await recordPayment({ orderId, method: 'CASH', amount: 150 })
    assert.equal(response.status, 409)
    assert.ok((await response.json()).errors?.amount)

    const order = await getOrder(orderId)
    assert.equal(order.payment.amountPaid, '0.00', 'a refused overpayment must leave the order untouched')
    assert.equal(order.payment.payments.length, 0)
  })

  // Decision 3's actual point: underpayment across several rows is fine
  // (a deposit-then-balance is the whole reason payments.order_id has no
  // UNIQUE constraint), but the SAME arithmetic must still catch an
  // overpayment that only shows up once you look at BOTH rows together —
  // ₱300 alone fits under ₱500, and so does the second ₱300, but not both.
  test('overpaying across two separate payments is refused on the second one', async () => {
    const { orderId } = await createOrder(5) // total 500

    const first = await recordPayment({ orderId, method: 'CASH', amount: 300 })
    assert.equal(first.status, 201)

    const second = await recordPayment({ orderId, method: 'CASH', amount: 300 })
    assert.equal(second.status, 409)

    const order = await getOrder(orderId)
    assert.equal(order.payment.amountPaid, '300.00', 'only the first payment should have been recorded')
  })

  test('the same GCash reference cannot be recorded twice', async () => {
    const { orderId: firstOrderId } = await createOrder(1)
    const { orderId: secondOrderId } = await createOrder(1)
    const reference = `GCASH-DUP-${runId}`

    const first = await recordPayment({ orderId: firstOrderId, method: 'GCASH', amount: 100, gatewayReference: reference })
    assert.equal(first.status, 201)

    // Same reference, a DIFFERENT order — the constraint is on the
    // reference itself (one real transfer, claimed once), not scoped per
    // order, so this must still be refused.
    const second = await recordPayment({ orderId: secondOrderId, method: 'GCASH', amount: 100, gatewayReference: reference })
    assert.equal(second.status, 409)
    assert.ok((await second.json()).errors?.gatewayReference)

    const order = await getOrder(secondOrderId)
    assert.equal(order.payment.amountPaid, '0.00')
  })

  test('two cash payments with no reference are both fine — NULL never collides', async () => {
    const { orderId } = await createOrder(5) // total 500

    const first = await recordPayment({ orderId, method: 'CASH', amount: 200 })
    assert.equal(first.status, 201)
    const second = await recordPayment({ orderId, method: 'CASH', amount: 200 })
    assert.equal(second.status, 201)

    const order = await getOrder(orderId)
    assert.equal(order.payment.amountPaid, '400.00')
  })

  // Decision 3 says a zero payment must be refused. The first version of
  // this route checked the RAW amount and then rounded to 2dp for the
  // NUMERIC(12,2) column — so anything under half a centavo passed the
  // check (0.001 really is greater than zero) and then rounded down to 0
  // on the way in, writing exactly the ₱0.00 row the rule forbids.
  // Measured before the fix: 0.001 and 0.004 both returned 201 with an
  // amount of '0.00'.
  test('a sub-centavo amount is refused rather than rounded down to a zero payment', async () => {
    const { orderId } = await createOrder(1)

    for (const amount of [0.001, 0.004]) {
      const response = await recordPayment({ orderId, method: 'CASH', amount })
      assert.equal(response.status, 422, `amount ${amount}`)
      assert.ok((await response.json()).errors.amount)
    }

    const order = await getOrder(orderId)
    assert.equal(order.payment.payments.length, 0, 'no zero-amount row may be written')
    assert.equal(order.payment.amountPaid, '0.00')

    // The smallest amount that survives rounding is still accepted — this
    // guards against "fixing" the above by rejecting small amounts wholesale.
    const oneCentavo = await recordPayment({ orderId, method: 'CASH', amount: 0.01 })
    assert.equal(oneCentavo.status, 201)
  })

  // gateway_reference is VARCHAR(255). Nothing capped the input, so an
  // over-long reference reached Postgres and came back as an unhandled
  // 22001 — a 500 telling the cashier the service was broken, when the
  // real problem was their input. Measured before the fix: 255 chars
  // returned 201, 256 returned 500.
  test('an over-long GCash reference is a clean 422, never a 500', async () => {
    const { orderId } = await createOrder(1)

    const tooLong = await recordPayment({ orderId, method: 'GCASH', amount: 10, gatewayReference: 'X'.repeat(256) })
    assert.equal(tooLong.status, 422)
    assert.ok((await tooLong.json()).errors.gatewayReference)

    // Exactly at the column's width still works — the guard must not be
    // off by one in the other direction.
    const atTheLimit = await recordPayment({ orderId, method: 'GCASH', amount: 10, gatewayReference: `${'Y'.repeat(248)}${runId.slice(0, 7)}` })
    assert.equal(atTheLimit.status, 201)

    const order = await getOrder(orderId)
    assert.equal(order.payment.payments.length, 1, 'only the accepted reference should have been written')
  })

  test('a payment of 0, a negative amount, and an unknown method are all 422', async () => {
    const { orderId } = await createOrder(1)

    const zero = await recordPayment({ orderId, method: 'CASH', amount: 0 })
    assert.equal(zero.status, 422)
    assert.ok((await zero.json()).errors.amount)

    const negative = await recordPayment({ orderId, method: 'CASH', amount: -50 })
    assert.equal(negative.status, 422)
    assert.ok((await negative.json()).errors.amount)

    const badMethod = await recordPayment({ orderId, method: 'CHEQUE', amount: 100 })
    assert.equal(badMethod.status, 422)
    assert.ok((await badMethod.json()).errors.method)

    const order = await getOrder(orderId)
    assert.equal(order.payment.payments.length, 0, 'none of the rejected attempts should have written a row')
  })

  test('GCASH without a reference is refused', async () => {
    const { orderId } = await createOrder(1)
    const response = await recordPayment({ orderId, method: 'GCASH', amount: 100 })
    assert.equal(response.status, 422)
    assert.ok((await response.json()).errors.gatewayReference)
  })

  test('recording a payment against a CANCELLED order is refused', async () => {
    const { orderId } = await createOrder(1, customerCookie)
    const cancelResponse = await fetch(`${baseUrl}/api/orders/${orderId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: customerCookie }, body: JSON.stringify({ status: 'CANCELLED' }) })
    assert.equal(cancelResponse.status, 200)

    const response = await recordPayment({ orderId, method: 'CASH', amount: 100 })
    assert.equal(response.status, 409)

    const order = await getOrder(orderId)
    assert.equal(order.payment.amountPaid, '0.00')
  })

  test('a malformed or nonexistent order id is treated as "not found"', async () => {
    for (const badId of ['abc', 'undefined', '1.5', '999999999999999999999']) {
      const response = await recordPayment({ orderId: badId, method: 'CASH', amount: 100 })
      assert.equal(response.status, 422, `id "${badId}"`)
    }
    const wellFormedButMissing = await recordPayment({ orderId: '999999999', method: 'CASH', amount: 100 })
    assert.equal(wellFormedButMissing.status, 404)
  })

  // The plan's warning, taken seriously — and confirmed the hard way. The
  // first version of this test fired two concurrent fetches with
  // Promise.all, on the theory that Pattern A/B's FOR UPDATE plus a
  // conditional INSERT would serialize them the same way the already-
  // reliable "two simultaneous orders racing for the last unit" test in
  // orders.test.js is serialized by a single UPDATE taking its own row
  // lock. That theory was WRONG for this shape: with FOR UPDATE removed
  // from routes/payments.js, the Promise.all version was run 5 times and
  // PASSED every time — both requests landed far enough apart in practice
  // that the race window was never actually exercised. A test that cannot
  // fail is not a test, so it was replaced with this one, which forces
  // the overlap deliberately by holding a transaction open — the same
  // technique inventory.test.js uses for "approving re-reads stock under
  // a lock". THIS version was confirmed to fail every time (both
  // payments landed, ₱600 against a ₱500 order) with FOR UPDATE removed,
  // and to pass every time with it restored, before being trusted here.
  const waitForLockWait = async () => {
    for (let attempt = 0; attempt < 100; attempt++) {
      const waiting = await pool.query(`SELECT COUNT(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`)
      if (waiting.rows[0].n > 0) return true
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    return false
  }

  test('a payment mid-flight when another commits is re-checked against the post-commit balance, not a stale one', async () => {
    const { orderId } = await createOrder(5) // total 500
    const cashierUserRow = await pool.query('SELECT user_id FROM users WHERE username = $1', [cashier.username])
    const cashierUserId = cashierUserRow.rows[0].user_id

    const holder = await pool.connect()
    let blockedPayment
    try {
      await holder.query('BEGIN')
      await holder.query('SELECT 1 FROM orders WHERE order_id = $1 FOR UPDATE', [orderId])
      // A ₱300 payment is about to be committed by someone else — held
      // open so it is real, but not yet visible to any other transaction.
      await holder.query(
        `INSERT INTO payments (order_id, recorded_by, payment_method, amount, status, payment_date) VALUES ($1, $2, 'CASH', 300, 'PAID', CURRENT_TIMESTAMP)`,
        [orderId, cashierUserId],
      )

      // Started, not awaited: a real request for ₱300 more. Only ₱200 will
      // genuinely remain once the held payment above commits — so if this
      // route read the balance BEFORE blocking on the lock (or never
      // locked at all), it could see "₱0 paid, ₱500 total" and wrongly
      // accept it.
      blockedPayment = recordPayment({ orderId, method: 'CASH', amount: 300 })

      const blocked = await waitForLockWait()
      assert.ok(blocked, 'the payment route should be waiting on the held order lock')

      await holder.query('COMMIT')
    } finally {
      holder.release()
    }

    const response = await blockedPayment
    assert.equal(response.status, 409, 'must be re-evaluated against the post-commit balance (₱200 remaining), not accepted against a stale ₱500')

    const order = await getOrder(orderId)
    assert.equal(order.payment.amountPaid, '300.00', 'only the held payment should be reflected — the total must never exceed 500')
  })

  test('GET /api/payments scopes a customer to their own orders, but shows staff everything', async () => {
    const { orderId: ownOrderId } = await createOrder(1, customerCookie)
    const ownPayment = await recordPayment({ orderId: ownOrderId, method: 'CASH', amount: 100 })
    assert.equal(ownPayment.status, 201)

    const { orderId: otherOrderId } = await createOrder(1, secondCustomerCookie)
    const otherPayment = await recordPayment({ orderId: otherOrderId, method: 'CASH', amount: 100 })
    assert.equal(otherPayment.status, 201)

    const asOwner = await fetch(`${baseUrl}/api/payments`, { headers: { Cookie: customerCookie } })
    const ownerOrderIds = (await asOwner.json()).payments.map((payment) => payment.orderId)
    assert.ok(ownerOrderIds.includes(ownOrderId))
    assert.ok(!ownerOrderIds.includes(otherOrderId), 'a customer must not see another customer\'s payment')

    const asStaff = await fetch(`${baseUrl}/api/payments`, { headers: { Cookie: cashierCookie } })
    const staffOrderIds = (await asStaff.json()).payments.map((payment) => payment.orderId)
    assert.ok(staffOrderIds.includes(ownOrderId) && staffOrderIds.includes(otherOrderId), 'staff must see every customer\'s payments')
  })

  // GET /api/orders is the Payment & Billing screen's list. It has to
  // carry each order's balance, or answering "who still owes money" means
  // opening every order one at a time — the workflow the screen exists
  // for. The list and the detail derive these figures from the SAME
  // fragments in lib/billing.js, so this also pins that they cannot drift
  // apart: a hand-rolled SUM in the list query would be free to disagree,
  // and specifically free to omit the ::numeric(12,2) cast and report
  // '0' where the detail reports '0.00'.
  test('the order LIST carries the same balance figures as the order detail', async () => {
    const { orderId } = await createOrder(4) // total 400
    await recordPayment({ orderId, method: 'CASH', amount: 150 })

    const list = await (await fetch(`${baseUrl}/api/orders`, { headers: { Cookie: cashierCookie } })).json()
    const listed = list.orders.find((order) => order.id === orderId)
    assert.ok(listed, 'the order should appear in the list')
    assert.equal(listed.amountPaid, '150.00')
    assert.equal(listed.balanceDue, '250.00')
    assert.equal(listed.isFullyPaid, false)

    const detail = await getOrder(orderId)
    assert.equal(listed.amountPaid, detail.payment.amountPaid, 'list and detail must agree on amountPaid')
    assert.equal(listed.balanceDue, detail.payment.balanceDue, 'list and detail must agree on balanceDue')
    assert.equal(listed.isFullyPaid, detail.payment.isFullyPaid, 'list and detail must agree on isFullyPaid')
  })

  test('an unpaid order in the LIST reports amountPaid as "0.00", not "0"', async () => {
    const { orderId } = await createOrder(1)
    const list = await (await fetch(`${baseUrl}/api/orders`, { headers: { Cookie: cashierCookie } })).json()
    const listed = list.orders.find((order) => order.id === orderId)
    assert.equal(listed.amountPaid, '0.00', 'the list must carry the same NUMERIC(12,2) formatting the detail does')
    assert.equal(listed.balanceDue, '100.00')
  })

  test('a recorded payment names who recorded it', async () => {
    const { orderId } = await createOrder(1)
    await recordPayment({ orderId, method: 'CASH', amount: 100 })

    const order = await getOrder(orderId)
    assert.equal(order.payment.payments[0].recordedByName, cashier.name)
  })
})
