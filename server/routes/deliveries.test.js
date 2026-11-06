// Integration tests for moving a delivery order along. Staff send it out and
// mark it delivered; there are no rider accounts. Same approach as the other
// route tests: real Express app on an ephemeral port, real database.
// Run with: npm test
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { after, before, beforeEach, describe, test } from 'node:test'
import bcrypt from 'bcrypt'
import app from '../app.js'
import { resetRateLimits } from '../lib/security.js'
import { pool } from '../db.js'
import { config } from '../config.js'

const runId = crypto.randomUUID().slice(0, 8)
const randomContactNumber = () => `09${Math.floor(100000000 + Math.random() * 899999999)}`

describe('delivery management', () => {
  // The rate limiter (lib/security.js) counts by client IP, and every
  // request in this suite comes from the same one — so without a reset
  // the tests would throttle each other rather than the abuse the limiter
  // exists to stop. Resetting per test is ordinary test isolation: the
  // limiter itself is untouched and fully active in production.
  beforeEach(resetRateLimits)

  let server
  let baseUrl
  let adminCookie
  let cashierCookie
  let customerCookie
  let customerId
  let addressId
  let availableProductId
  let categoryId
  const createdUserIds = []
  const createdOrderIds = []

  const admin = { username: `delivadmin_${runId}`, password: 'Admin-Only-Password-9!' }
  const cashier = { role: 'CASHIER', name: 'Deliv Cashier', username: `delivcash_${runId}`, email: `delivcash_${runId}@example.com`, contactNumber: randomContactNumber(), password: 'Cashier-Password-9!' }
  const customer = { name: 'Deliv Customer', firstName: 'Deliv', lastName: 'Customer', agree: true, username: `delivcust_${runId}`, email: `delivcust_${runId}@example.com`, contactNumber: randomContactNumber(), password: 'Correct-Horse-Battery-9!' }

  // Places a fresh DELIVERY order as the test customer and returns its id
  // — every workflow test below needs its own order at PENDING_ASSIGNMENT
  // to start from.
  const recordPayment = (orderId, amount, cookie = cashierCookie) =>
    fetch(`${baseUrl}/api/payments`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ orderId, method: 'CASH', amount }) })
  // Staff trying to mark an order ready for delivery by hand.
  const startProduction = (orderId) =>
    fetch(`${baseUrl}/api/orders/${orderId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: cashierCookie }, body: JSON.stringify({ status: 'READY_FOR_DELIVERY' }) })
  const orderStatus = async (orderId) => (await pool.query('SELECT status FROM orders WHERE order_id = $1', [orderId])).rows[0].status

  // Payment first: a customer's delivery order is a hold (AWAITING_PAYMENT)
  // with no delivery row until it is paid in full; the payment makes it
  // Ready for delivery and creates the row (lib/orderStatus.js). Every
  // delivery this helper hands back is paid and assignable unless
  // { pay: false }; { legacyRow: true } then adds a delivery row in SQL,
  // the state an unpaid order from before payment first can still be in.
  const placeDeliveryOrder = async ({ pay = true, legacyRow = false } = {}) => {
    const response = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: customerCookie },
      body: JSON.stringify({ orderType: 'DELIVERY', addressId, items: [{ productId: availableProductId, quantity: 1 }] }),
    })
    const body = await response.json()
    createdOrderIds.push(body.order.id)
    if (pay) {
      assert.equal((await recordPayment(body.order.id, body.order.totalAmount)).status, 201)
      assert.equal(await orderStatus(body.order.id), 'READY_FOR_DELIVERY')
    } else if (legacyRow) {
      await pool.query('INSERT INTO deliveries (order_id) VALUES ($1)', [body.order.id])
    }
    const delivery = await pool.query('SELECT delivery_id FROM deliveries WHERE order_id = $1', [body.order.id])
    return { orderId: body.order.id, deliveryId: delivery.rows[0]?.delivery_id ?? null }
  }

  const setStatus = (deliveryId, status, cookie, note) =>
    fetch(`${baseUrl}/api/deliveries/${deliveryId}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ status, note }) })

  // The money amounts below are the goods alone; the delivery fee
  // (DELIVERY_FEE_PLAN.md) is proven in orders.test.js, so it is off here.
  const savedDeliveryFee = config.orders.deliveryFee
  before(() => { config.orders.deliveryFee = 0 })
  after(() => { config.orders.deliveryFee = savedDeliveryFee })

  before(async () => {
    server = app.listen(0)
    await new Promise((resolve) => server.once('listening', resolve))
    baseUrl = `http://localhost:${server.address().port}`

    const adminPasswordHash = await bcrypt.hash(admin.password, 4)
    const adminResult = await pool.query(`INSERT INTO users (username, password_hash, user_type) VALUES ($1, $2, 'ADMIN') RETURNING user_id`, [admin.username, adminPasswordHash])
    createdUserIds.push(adminResult.rows[0].user_id)
    await pool.query('INSERT INTO admins (user_id, name, contact_num, email) VALUES ($1, $2, $3, $4)', [adminResult.rows[0].user_id, 'Deliv Test Admin', randomContactNumber(), `delivadmin_${runId}@example.com`])
    await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: admin.username, password: admin.password }) })
    const rawCode = '112233'
    const challengeToken = `test-challenge-${crypto.randomUUID()}`
    await pool.query(`INSERT INTO otp_codes (user_id, code_hash, challenge_token, expires_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP + INTERVAL '5 minutes')`, [adminResult.rows[0].user_id, crypto.createHash('sha256').update(rawCode).digest('hex'), challengeToken])
    const otpResponse = await fetch(`${baseUrl}/api/auth/verify-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ challengeToken, code: rawCode }) })
    adminCookie = otpResponse.headers.get('set-cookie').split(';')[0]

    const cashierCreate = await fetch(`${baseUrl}/api/staff`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ ...cashier, confirmPassword: cashier.password }) })
    assert.equal(cashierCreate.status, 201)
    // Fixture: this account skips the first sign-in setup, tested in auth.test.js.
    await pool.query('UPDATE users SET must_set_credentials = FALSE WHERE username = $1', [cashier.username])
    const cashierRow = await pool.query('SELECT user_id FROM users WHERE username = $1', [cashier.username])
    createdUserIds.push(cashierRow.rows[0].user_id)
    const cashierLogin = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: cashier.username, password: cashier.password }) })
    cashierCookie = cashierLogin.headers.get('set-cookie').split(';')[0]

    await fetch(`${baseUrl}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...customer, confirmPassword: customer.password }) })
    // Fixture: confirm the email the way clicking the emailed link would
    // (migration 016). This suite is not testing verification — auth.test.js
    // is — so its customers start verified and can place orders.
    await pool.query('UPDATE customers SET email_verified_at = CURRENT_TIMESTAMP WHERE user_id = (SELECT user_id FROM users WHERE username = $1)', [customer.username])
    const customerRow = await pool.query('SELECT user_id, (SELECT customer_id FROM customers WHERE user_id = users.user_id) AS customer_id FROM users WHERE username = $1', [customer.username])
    createdUserIds.push(customerRow.rows[0].user_id)
    customerId = customerRow.rows[0].customer_id
    const customerLogin = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: customer.username, password: customer.password }) })
    customerCookie = customerLogin.headers.get('set-cookie').split(';')[0]

    const address = await pool.query(
      `INSERT INTO customer_addresses (customer_id, recipient_name, contact_num, address_line_1, is_default)
       VALUES ($1, 'Deliv Test Customer', $2, '1 Bell Ave', TRUE) RETURNING address_id`,
      [customerId, randomContactNumber()],
    )
    addressId = address.rows[0].address_id

    const categoryResult = await pool.query('INSERT INTO categories (category_name) VALUES ($1) RETURNING category_id', [`Deliv Test Category ${runId}`])
    categoryId = categoryResult.rows[0].category_id
    const productResponse = await fetch(`${baseUrl}/api/products`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ categoryId, name: `Deliv Test Bread ${runId}`, price: 45.5 }) })
    availableProductId = (await productResponse.json()).product.id
    await pool.query('UPDATE inventory SET stock_quantity = 1000 WHERE product_id = $1', [availableProductId])
  })

  after(async () => {
    await pool.query('DELETE FROM delivery_proofs WHERE delivery_id IN (SELECT delivery_id FROM deliveries WHERE order_id = ANY($1))', [createdOrderIds]).catch(() => {})
    await pool.query('DELETE FROM deliveries WHERE order_id = ANY($1)', [createdOrderIds]).catch(() => {})
    await pool.query('DELETE FROM inventory_movements WHERE order_id = ANY($1)', [createdOrderIds]).catch(() => {})
    // The cash-on-delivery test records a payment against its order.
    await pool.query('DELETE FROM payments WHERE order_id = ANY($1)', [createdOrderIds]).catch(() => {})
    for (const orderId of createdOrderIds) {
      await pool.query('DELETE FROM order_status_history WHERE order_id = $1', [orderId]).catch(() => {})
      await pool.query('DELETE FROM order_details WHERE order_id = $1', [orderId]).catch(() => {})
      await pool.query('DELETE FROM orders WHERE order_id = $1', [orderId]).catch(() => {})
    }
    await pool.query('DELETE FROM inventory WHERE product_id = $1', [availableProductId]).catch(() => {})
    await pool.query('DELETE FROM products WHERE product_id = $1', [availableProductId]).catch(() => {})
    await pool.query('DELETE FROM categories WHERE category_id = $1', [categoryId]).catch(() => {})
    await pool.query('DELETE FROM cashiers WHERE user_id = ANY($1)', [createdUserIds])
    await pool.query('DELETE FROM customers WHERE user_id = ANY($1)', [createdUserIds])
    await pool.query('DELETE FROM admins WHERE user_id = ANY($1)', [createdUserIds])
    await pool.query('DELETE FROM delivery_personnel WHERE user_id = ANY($1)', [createdUserIds])
    await pool.query('DELETE FROM users WHERE user_id = ANY($1)', [createdUserIds])
    await new Promise((resolve) => server.close(resolve))
  })

  // Payment first: an unpaid delivery checkout waits (hidden) with no
  // delivery row; part paid it still waits; the payment that settles it
  // makes it Ready for delivery and puts it in the assignment queue.
  test('an unpaid delivery checkout waits; part-paid it still waits; paid in full it is ready for delivery by itself', async () => {
    const { orderId, deliveryId } = await placeDeliveryOrder({ pay: false })
    assert.equal(deliveryId, null, 'no delivery row while unpaid')
    const unpaid = await startProduction(orderId)
    assert.equal(unpaid.status, 409, 'staff cannot move it on unpaid either')
    assert.match((await unpaid.json()).message, /paid in full/)
    assert.equal(await orderStatus(orderId), 'AWAITING_PAYMENT')

    assert.equal((await recordPayment(orderId, 20)).status, 201)
    assert.equal(await orderStatus(orderId), 'AWAITING_PAYMENT', 'a part payment does not place it')
    const partPaid = await startProduction(orderId)
    assert.equal(partPaid.status, 409)
    assert.match((await partPaid.json()).message, /Balance: ₱25\.50/)

    assert.equal((await recordPayment(orderId, 25.5)).status, 201)
    assert.equal(await orderStatus(orderId), 'READY_FOR_DELIVERY', 'the payment that settles it makes it ready')
    const history = await pool.query(`SELECT note FROM order_status_history WHERE order_id = $1 AND status = 'READY_FOR_DELIVERY'`, [orderId])
    assert.equal(history.rows.length, 1)
    assert.match(history.rows[0].note, /ready for delivery/)
    const row = await pool.query(`SELECT status FROM deliveries WHERE order_id = $1`, [orderId])
    assert.equal(row.rows[0].status, 'PENDING_ASSIGNMENT')

    const cancelled = await placeDeliveryOrder({ pay: false })
    const cancel = await fetch(`${baseUrl}/api/orders/${cancelled.orderId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: customerCookie }, body: JSON.stringify({ status: 'CANCELLED', note: 'Changed my mind' }) })
    assert.equal(cancel.status, 200, 'an unpaid checkout can still be cancelled')
  })

  test('an online PICKUP order also waits for its payment — payment first', async () => {
    const response = await fetch(`${baseUrl}/api/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: customerCookie }, body: JSON.stringify({ orderType: 'PICKUP', items: [{ productId: availableProductId, quantity: 1 }] }) })
    const { order } = await response.json()
    createdOrderIds.push(order.id)
    assert.equal(order.status, 'AWAITING_PAYMENT')
    assert.equal((await recordPayment(order.id, order.totalAmount)).status, 201)
    assert.equal(await orderStatus(order.id), 'READY_FOR_PICKUP')
  })

  test('a payment and a hand move to ready racing on one delivery order: ready once, and only when paid', async () => {
    for (let round = 0; round < 5; round++) {
      const { orderId } = await placeDeliveryOrder({ pay: false })
      const [paid, moved] = await Promise.all([recordPayment(orderId, 45.5), startProduction(orderId)])
      assert.equal(paid.status, 201)
      assert.equal(moved.status, 409, 'either unpaid, or already ready by the payment')
      const state = await pool.query(
        `SELECT o.status, o.total_amount - COALESCE((SELECT SUM(amount) FROM payments WHERE order_id = o.order_id AND status = 'PAID'), 0) AS balance
           FROM orders o WHERE o.order_id = $1`,
        [orderId],
      )
      assert.equal(state.rows[0].status, 'READY_FOR_DELIVERY')
      assert.equal(Number(state.rows[0].balance), 0)
      const history = await pool.query(`SELECT COUNT(*)::int AS n FROM order_status_history WHERE order_id = $1 AND status = 'READY_FOR_DELIVERY'`, [orderId])
      assert.equal(history.rows[0].n, 1)
    }
  })

  // Pattern F — the order follows its delivery. OUT_FOR_DELIVERY always
  // syncs; DELIVERED completes the order when it is fully paid
  // (NOTIFICATIONS_PLAN.md, N2, replacing PHASE7 Decision 4 for DELIVERED).
  test('OUT_FOR_DELIVERY syncs orders.status; DELIVERED completes a paid order', async () => {
    const { orderId, deliveryId } = await placeDeliveryOrder()

    const outForDelivery = await setStatus(deliveryId, 'OUT_FOR_DELIVERY', cashierCookie)
    assert.equal(outForDelivery.status, 200)
    const afterOutForDelivery = await pool.query('SELECT status FROM orders WHERE order_id = $1', [orderId])
    assert.equal(afterOutForDelivery.rows[0].status, 'OUT_FOR_DELIVERY', 'Pattern F must sync the order')
    const history = await pool.query(`SELECT COUNT(*)::int AS n FROM order_status_history WHERE order_id = $1 AND status = 'OUT_FOR_DELIVERY'`, [orderId])
    assert.equal(history.rows[0].n, 1)

    const delivered = await setStatus(deliveryId, 'DELIVERED', cashierCookie)
    assert.equal(delivered.status, 200)
    const deliveredBody = await delivered.json()
    assert.equal(deliveredBody.delivery.status, 'DELIVERED')
    assert.ok(deliveredBody.delivery.deliveredAt)
    assert.equal(deliveredBody.delivery.orderStatus, 'COMPLETED')

    const afterDelivered = await pool.query('SELECT status FROM orders WHERE order_id = $1', [orderId])
    assert.equal(afterDelivered.rows[0].status, 'COMPLETED', 'a paid order is done once it is delivered')
    const completedHistory = await pool.query(
      `SELECT note FROM order_status_history WHERE order_id = $1 AND status = 'COMPLETED'`,
      [orderId],
    )
    assert.equal(completedHistory.rows.length, 1, 'one COMPLETED history row')
  })

  test('DELIVERED leaves an unpaid order (old data) OUT_FOR_DELIVERY for staff to settle', async () => {
    const { orderId, deliveryId } = await placeDeliveryOrder({ pay: false, legacyRow: true })
    // Staff cannot send out an unpaid order, so put it on the road directly:
    // the state only data from before NO_COD_PLAN can be in.
    await pool.query(`UPDATE orders SET status = 'OUT_FOR_DELIVERY' WHERE order_id = $1`, [orderId])
    await pool.query(`UPDATE deliveries SET status = 'OUT_FOR_DELIVERY' WHERE delivery_id = $1`, [deliveryId])

    assert.equal((await setStatus(deliveryId, 'DELIVERED', cashierCookie)).status, 200)
    const after = await pool.query('SELECT status FROM orders WHERE order_id = $1', [orderId])
    assert.equal(after.rows[0].status, 'OUT_FOR_DELIVERY')
  })

  // The user, 2026-10-16: a failed delivery puts its paid order back to
  // Ready for delivery, so it can go out again — it used to stay
  // "Out for delivery" for good.
  test('an admin can call back a delivery: it waits to go out again and the order is READY_FOR_DELIVERY', async () => {
    const { orderId, deliveryId } = await placeDeliveryOrder()
    await setStatus(deliveryId, 'OUT_FOR_DELIVERY', cashierCookie)
    assert.equal((await pool.query('SELECT status FROM orders WHERE order_id = $1', [orderId])).rows[0].status, 'OUT_FOR_DELIVERY')

    const failed = await setStatus(deliveryId, 'FAILED', adminCookie, 'Customer not home')
    assert.equal(failed.status, 200)
    const back = (await failed.json()).delivery
    assert.equal(back.status, 'PENDING_ASSIGNMENT', 'waiting to go out again')
    assert.ok(back.failedAt, 'the failed attempt is still on record')
    assert.match(back.note, /Customer not home/)

    const afterFail = await pool.query('SELECT status FROM orders WHERE order_id = $1', [orderId])
    assert.equal(afterFail.rows[0].status, 'READY_FOR_DELIVERY')
    const history = await pool.query(`SELECT note FROM order_status_history WHERE order_id = $1 AND status = 'READY_FOR_DELIVERY' ORDER BY history_id DESC LIMIT 1`, [orderId])
    assert.equal(history.rows[0].note, 'Delivery failed: Customer not home')

    // Nothing for staff to clear first: it can go out again at once.
    assert.equal((await setStatus(deliveryId, 'OUT_FOR_DELIVERY', cashierCookie)).status, 200)
  })

  // Decision 5's one deliberate exception — only an ADMIN may retry a
  // FAILED delivery back to PENDING_ASSIGNMENT, and must say why. A failed
  // delivery goes back to the queue by itself now; a FAILED row is left only
  // by older data, put here in SQL.
  test('an admin can retry a FAILED delivery back to PENDING_ASSIGNMENT; a cashier cannot', async () => {
    const { deliveryId } = await placeDeliveryOrder()
    await pool.query(`UPDATE deliveries SET status = 'FAILED', failed_at = CURRENT_TIMESTAMP, note = 'Nobody answered' WHERE delivery_id = $1`, [deliveryId])

    const cashierAttempt = await setStatus(deliveryId, 'PENDING_ASSIGNMENT', cashierCookie, 'retry')
    assert.equal(cashierAttempt.status, 403)

    const noNoteAttempt = await setStatus(deliveryId, 'PENDING_ASSIGNMENT', adminCookie)
    assert.equal(noNoteAttempt.status, 422, 'the retry must explain why')

    const adminRetry = await setStatus(deliveryId, 'PENDING_ASSIGNMENT', adminCookie, 'Re-attempting after failed first delivery')
    assert.equal(adminRetry.status, 200)
    const body = await adminRetry.json()
    assert.equal(body.delivery.status, 'PENDING_ASSIGNMENT')

    // And it can really go out again, not just LOOK like it.
    assert.equal((await setStatus(deliveryId, 'OUT_FOR_DELIVERY', cashierCookie)).status, 200)
  })

  // LOCK ORDERING. Two write paths touch both `orders` and `deliveries`
  // for the same pair of rows: PATCH /api/orders/:id -> CANCELLED (claims
  // the order, then fails its delivery — Decision 6) and PATCH
  // /api/deliveries/:id/status (moves the delivery, then syncs the order —
  // Pattern F). Taking those locks in opposite orders is a textbook ABBA
  // deadlock; before the fix this was reproducible on demand and reached
  // the user as a 500 (Postgres 40P01, deadlock detected).
  //
  // Driven as a PROPERTY rather than a race, so it can't pass by luck:
  // hold the ORDER row from outside, fire the real route, and check what
  // it is blocked on. Correct ordering means it is waiting for the order
  // row and has NOT yet taken the delivery row — which a third connection
  // can prove with FOR UPDATE NOWAIT. Under the old ordering the route
  // would already be holding that delivery lock, and NOWAIT would fail.
  test('the delivery transition takes the ORDER lock before the delivery lock (no ABBA deadlock with order cancellation)', async () => {
    const { orderId, deliveryId } = await placeDeliveryOrder()

    const holder = await pool.connect()
    const prober = await pool.connect()
    try {
      await holder.query('BEGIN')
      // Exactly what PATCH /api/orders/:id's claim does to this row.
      await holder.query('SELECT status FROM orders WHERE order_id = $1 FOR UPDATE', [orderId])

      // Started, not awaited — it must block on the order row above.
      const inFlight = setStatus(deliveryId, 'OUT_FOR_DELIVERY', cashierCookie)
      await new Promise((resolve) => setTimeout(resolve, 400))

      await prober.query('BEGIN')
      await prober.query('SELECT delivery_id FROM deliveries WHERE delivery_id = $1 FOR UPDATE NOWAIT', [deliveryId])
      await prober.query('ROLLBACK')

      // Release the order row; the route then completes normally.
      await holder.query('ROLLBACK')
      const response = await inFlight
      assert.equal(response.status, 200, 'the transition still succeeds once the order row is free')
      assert.notEqual(response.status, 500, 'and never surfaces as a deadlock 500')
    } finally {
      await holder.query('ROLLBACK').catch(() => {})
      await prober.query('ROLLBACK').catch(() => {})
      holder.release()
      prober.release()
    }
  })

  // Decision 6 fails a delivery when its order is cancelled precisely so
  // the queue doesn't fill with work nobody should do. The admin retry is
  // a door straight back through that: without an order-status check it
  // puts a CANCELLED order's delivery back in the queue, where a cashier
  // can assign it and a driver is dispatched to deliver a cancelled order.
  // Pattern F's own guard hides the damage by refusing to move
  // orders.status, so nothing downstream ever looks wrong.
  test('a retry cannot resurrect the delivery of a CANCELLED order', async () => {
    const { orderId, deliveryId } = await placeDeliveryOrder()

    // A delivery order is paid before it is confirmed, and a paid order can
    // no longer be cancelled (no refunds, CLIENT_REVISIONS_PLAN.md R2) — so
    // this state now only exists in older data. It is set up directly; the
    // guard below still has to hold for it.
    const cancel = await fetch(`${baseUrl}/api/orders/${orderId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ status: 'CANCELLED', note: 'Test cancellation' }) })
    assert.equal(cancel.status, 409, 'a paid delivery order cannot be cancelled')
    await pool.query(`UPDATE orders SET status = 'CANCELLED' WHERE order_id = $1`, [orderId])
    await pool.query(`UPDATE deliveries SET status = 'FAILED', failed_at = CURRENT_TIMESTAMP WHERE delivery_id = $1`, [deliveryId])

    const retry = await setStatus(deliveryId, 'PENDING_ASSIGNMENT', adminCookie, 'try again')
    assert.equal(retry.status, 409, 'a cancelled order\'s delivery must not go back in the queue')

    const after = await pool.query('SELECT status FROM deliveries WHERE delivery_id = $1', [deliveryId])
    assert.equal(after.rows[0].status, 'FAILED', 'the delivery must stay resolved')

    const sendOut = await setStatus(deliveryId, 'OUT_FOR_DELIVERY', cashierCookie)
    assert.equal(sendOut.status, 409, 'and must not go out')
  })

  // deliveries.note is the ONLY place a failure reason is recorded —
  // there is deliberately no delivery_status_history table. Overwriting
  // it on retry destroys the single most useful thing to know when
  // deciding whether the retry was even a good idea.
  test('a failed delivery keeps its reason when it goes out again', async () => {
    const { deliveryId } = await placeDeliveryOrder()
    await setStatus(deliveryId, 'OUT_FOR_DELIVERY', cashierCookie)
    await setStatus(deliveryId, 'FAILED', adminCookie, 'Customer refused — wrong flavour')
    await setStatus(deliveryId, 'OUT_FOR_DELIVERY', cashierCookie)
    await setStatus(deliveryId, 'FAILED', adminCookie, 'Gate locked')

    const note = (await pool.query('SELECT note FROM deliveries WHERE delivery_id = $1', [deliveryId])).rows[0].note
    assert.match(note, /wrong flavour/, 'the first failure reason must survive')
    assert.match(note, /Gate locked/, 'alongside the second')
  })

  test('an admin retrying a delivery that is not FAILED is refused with 409', async () => {
    const { deliveryId } = await placeDeliveryOrder()
    const response = await setStatus(deliveryId, 'PENDING_ASSIGNMENT', adminCookie, 'not actually failed')
    assert.equal(response.status, 409)
  })

  // MINOR_REVISIONS_PLAN.md M13 — no riders: staff send a paid delivery
  // out and mark it delivered, and the order follows.
  test('a cashier sends a paid delivery out with no rider, then marks it delivered, which completes the order', async () => {
    const { orderId, deliveryId } = await placeDeliveryOrder()

    const out = await setStatus(deliveryId, 'OUT_FOR_DELIVERY', cashierCookie)
    assert.equal(out.status, 200)
    assert.equal(await orderStatus(orderId), 'OUT_FOR_DELIVERY')

    const delivered = await setStatus(deliveryId, 'DELIVERED', cashierCookie)
    assert.equal(delivered.status, 200)
    assert.equal(await orderStatus(orderId), 'COMPLETED')
  })

  test('staff cannot send out a delivery whose order is not paid and ready', async () => {
    const { deliveryId } = await placeDeliveryOrder({ pay: false, legacyRow: true })
    const out = await setStatus(deliveryId, 'OUT_FOR_DELIVERY', adminCookie)
    assert.equal(out.status, 409)
  })

  test('the rider routes are gone', async () => {
    const { deliveryId } = await placeDeliveryOrder()
    const routes = [
      ['GET', '/api/deliveries'],
      ['GET', '/api/deliveries/personnel'],
      ['GET', '/api/deliveries/mine'],
      ['GET', '/api/deliveries/mine/history'],
      ['PATCH', `/api/deliveries/${deliveryId}/assign`],
      ['POST', `/api/deliveries/${deliveryId}/proof`],
      ['GET', `/api/deliveries/${deliveryId}/proof`],
    ]
    for (const [method, path] of routes) {
      const response = await fetch(`${baseUrl}${path}`, { method, headers: { Cookie: adminCookie } })
      assert.equal(response.status, 404, `${method} ${path}`)
    }
  })

  test('moving a delivery needs a signed-in admin or cashier', async () => {
    const { deliveryId } = await placeDeliveryOrder()
    assert.equal((await fetch(`${baseUrl}/api/deliveries/${deliveryId}/status`, { method: 'PATCH' })).status, 401)
    assert.equal((await setStatus(deliveryId, 'OUT_FOR_DELIVERY', customerCookie)).status, 403)

    // An old rider account, if one were still active, is refused too.
    const username = `oldrider_${runId}`
    const password = 'Old-Rider-Password-9!'
    const rider = await pool.query(`INSERT INTO users (username, password_hash, user_type) VALUES ($1, $2, 'DELIVERY_PERSONNEL') RETURNING user_id`, [username, await bcrypt.hash(password, 4)])
    createdUserIds.push(rider.rows[0].user_id)
    await pool.query('INSERT INTO delivery_personnel (user_id, name, contact_num, email) VALUES ($1, $2, $3, $4)', [rider.rows[0].user_id, 'Old Rider', randomContactNumber(), `${username}@example.com`])
    const login = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: username, password }) })
    const riderCookie = login.headers.get('set-cookie').split(';')[0]
    assert.equal((await setStatus(deliveryId, 'OUT_FOR_DELIVERY', riderCookie)).status, 403)
  })
})

after(async () => {
  await pool.end()
})
