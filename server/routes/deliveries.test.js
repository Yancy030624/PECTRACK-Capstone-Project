// Lightweight integration tests for delivery assignment, the driver's own
// status workflow, and proof of delivery (Phase 7 — see PHASE7_PLAN.md).
// Same approach as the other route tests: real Express app on an
// ephemeral port, real database. Run with: npm test
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { after, before, describe, test } from 'node:test'
import bcrypt from 'bcrypt'
import app from '../app.js'
import { pool } from '../db.js'
import { filePath } from '../lib/storage.js'

const runId = crypto.randomUUID().slice(0, 8)
const randomContactNumber = () => `09${Math.floor(100000000 + Math.random() * 899999999)}`

describe('delivery management', () => {
  let server
  let baseUrl
  let adminCookie
  let cashierCookie
  let customerCookie
  let firstDriverCookie
  let secondDriverCookie
  let firstDriverId
  let secondDriverId
  let customerId
  let addressId
  let availableProductId
  let categoryId
  const createdUserIds = []
  const createdOrderIds = []

  const admin = { username: `delivadmin_${runId}`, password: 'Admin-Only-Password-9!' }
  const cashier = { role: 'CASHIER', name: 'Deliv Cashier', username: `delivcash_${runId}`, email: `delivcash_${runId}@example.com`, contactNumber: randomContactNumber(), password: 'Cashier-Password-9!' }
  const customer = { name: 'Deliv Customer', username: `delivcust_${runId}`, email: `delivcust_${runId}@example.com`, contactNumber: randomContactNumber(), password: 'Correct-Horse-Battery-9!' }
  const firstDriver = { role: 'DELIVERY_PERSONNEL', name: 'First Driver', username: `delivdp1_${runId}`, email: `delivdp1_${runId}@example.com`, contactNumber: randomContactNumber(), password: 'Driver-Password-9!' }
  const secondDriver = { role: 'DELIVERY_PERSONNEL', name: 'Second Driver', username: `delivdp2_${runId}`, email: `delivdp2_${runId}@example.com`, contactNumber: randomContactNumber(), password: 'Driver-Password-9!' }

  // Places a fresh DELIVERY order as the test customer and returns its id
  // — every workflow test below needs its own order at PENDING_ASSIGNMENT
  // to start from.
  const placeDeliveryOrder = async () => {
    const response = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: customerCookie },
      body: JSON.stringify({ orderType: 'DELIVERY', addressId, items: [{ productId: availableProductId, quantity: 1 }] }),
    })
    const body = await response.json()
    createdOrderIds.push(body.order.id)
    const delivery = await pool.query('SELECT delivery_id FROM deliveries WHERE order_id = $1', [body.order.id])
    return { orderId: body.order.id, deliveryId: delivery.rows[0].delivery_id }
  }

  const assign = (deliveryId, deliveryPersonnelId, cookie = cashierCookie) =>
    fetch(`${baseUrl}/api/deliveries/${deliveryId}/assign`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ deliveryPersonnelId }) })

  const setStatus = (deliveryId, status, cookie, note) =>
    fetch(`${baseUrl}/api/deliveries/${deliveryId}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ status, note }) })

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
    const cashierRow = await pool.query('SELECT user_id FROM users WHERE username = $1', [cashier.username])
    createdUserIds.push(cashierRow.rows[0].user_id)
    const cashierLogin = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: cashier.username, password: cashier.password }) })
    cashierCookie = cashierLogin.headers.get('set-cookie').split(';')[0]

    await fetch(`${baseUrl}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...customer, confirmPassword: customer.password }) })
    const customerRow = await pool.query('SELECT user_id, (SELECT customer_id FROM customers WHERE user_id = users.user_id) AS customer_id FROM users WHERE username = $1', [customer.username])
    createdUserIds.push(customerRow.rows[0].user_id)
    customerId = customerRow.rows[0].customer_id
    const customerLogin = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: customer.username, password: customer.password }) })
    customerCookie = customerLogin.headers.get('set-cookie').split(';')[0]

    const address = await pool.query(
      `INSERT INTO customer_addresses (customer_id, recipient_name, contact_num, address_line_1, is_default)
       VALUES ($1, 'Deliv Test Customer', $2, '1 Driver Ave', TRUE) RETURNING address_id`,
      [customerId, randomContactNumber()],
    )
    addressId = address.rows[0].address_id

    const firstDriverCreate = await fetch(`${baseUrl}/api/staff`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ ...firstDriver, confirmPassword: firstDriver.password }) })
    assert.equal(firstDriverCreate.status, 201)
    const firstDriverRow = await pool.query('SELECT user_id, (SELECT delivery_personnel_id FROM delivery_personnel WHERE user_id = users.user_id) AS delivery_personnel_id FROM users WHERE username = $1', [firstDriver.username])
    createdUserIds.push(firstDriverRow.rows[0].user_id)
    firstDriverId = firstDriverRow.rows[0].delivery_personnel_id
    const firstDriverLogin = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: firstDriver.username, password: firstDriver.password }) })
    firstDriverCookie = firstDriverLogin.headers.get('set-cookie').split(';')[0]

    const secondDriverCreate = await fetch(`${baseUrl}/api/staff`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ ...secondDriver, confirmPassword: secondDriver.password }) })
    assert.equal(secondDriverCreate.status, 201)
    const secondDriverRow = await pool.query('SELECT user_id, (SELECT delivery_personnel_id FROM delivery_personnel WHERE user_id = users.user_id) AS delivery_personnel_id FROM users WHERE username = $1', [secondDriver.username])
    createdUserIds.push(secondDriverRow.rows[0].user_id)
    secondDriverId = secondDriverRow.rows[0].delivery_personnel_id
    const secondDriverLogin = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: secondDriver.username, password: secondDriver.password }) })
    secondDriverCookie = secondDriverLogin.headers.get('set-cookie').split(';')[0]

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

  test('GET /api/deliveries requires authentication', async () => {
    const response = await fetch(`${baseUrl}/api/deliveries`)
    assert.equal(response.status, 401)
  })

  test('GET /api/deliveries is staff-only — a driver is refused', async () => {
    const response = await fetch(`${baseUrl}/api/deliveries`, { headers: { Cookie: firstDriverCookie } })
    assert.equal(response.status, 403)
  })

  // The assignment dropdown's data source. GET /api/staff is ADMIN-only,
  // but a CASHIER can also assign a driver, so this narrower endpoint
  // must work for both.
  test('GET /api/deliveries/personnel lists active drivers for admin and cashier, but not a driver', async () => {
    const asAdmin = await fetch(`${baseUrl}/api/deliveries/personnel`, { headers: { Cookie: adminCookie } })
    assert.equal(asAdmin.status, 200)
    const adminBody = await asAdmin.json()
    assert.ok(adminBody.personnel.some((person) => person.id === firstDriverId))
    assert.ok(adminBody.personnel.some((person) => person.id === secondDriverId))

    const asCashier = await fetch(`${baseUrl}/api/deliveries/personnel`, { headers: { Cookie: cashierCookie } })
    assert.equal(asCashier.status, 200)

    const asDriver = await fetch(`${baseUrl}/api/deliveries/personnel`, { headers: { Cookie: firstDriverCookie } })
    assert.equal(asDriver.status, 403)
  })

  // Addresses are deactivated, never deleted (PHASE7_PLAN.md, Decision 1) —
  // exactly so an existing order can always still say where it went. This
  // is the delivery side of that guarantee: deliverySelectQuery's JOIN to
  // customer_addresses carries no is_active filter, so a delivery already
  // pointing at an address must keep showing its full details even after
  // the customer deactivates it — the picker hides it for NEW orders, not
  // the historical record of where this one is headed.
  test('a deactivated address still resolves in full on an existing delivery', async () => {
    const { deliveryId } = await placeDeliveryOrder()
    const deactivate = await fetch(`${baseUrl}/api/addresses/${addressId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: customerCookie }, body: JSON.stringify({ isActive: false }) })
    assert.equal(deactivate.status, 200)

    const response = await fetch(`${baseUrl}/api/deliveries?status=PENDING_ASSIGNMENT`, { headers: { Cookie: adminCookie } })
    const found = (await response.json()).deliveries.find((delivery) => delivery.id === deliveryId)
    assert.ok(found, 'the delivery must still be listed')
    assert.equal(found.address.addressLine1, '1 Driver Ave')
    assert.equal(found.address.recipientName, 'Deliv Test Customer')

    // Reactivate so later tests in this file get a normal, active address
    // to work with again — this test's side effect must not leak forward.
    await fetch(`${baseUrl}/api/addresses/${addressId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: customerCookie }, body: JSON.stringify({ isActive: true }) })
  })

  test('GET /api/deliveries shows admin and cashier the PENDING_ASSIGNMENT queue', async () => {
    const { deliveryId } = await placeDeliveryOrder()
    const asAdmin = await fetch(`${baseUrl}/api/deliveries?status=PENDING_ASSIGNMENT`, { headers: { Cookie: adminCookie } })
    assert.equal(asAdmin.status, 200)
    const adminBody = await asAdmin.json()
    assert.ok(adminBody.deliveries.some((delivery) => delivery.id === deliveryId))

    const asCashier = await fetch(`${baseUrl}/api/deliveries?status=PENDING_ASSIGNMENT`, { headers: { Cookie: cashierCookie } })
    assert.equal(asCashier.status, 200)
    assert.ok((await asCashier.json()).deliveries.some((delivery) => delivery.id === deliveryId))
  })

  test('PATCH /api/deliveries/:id/assign claims a PENDING_ASSIGNMENT delivery for a driver', async () => {
    const { deliveryId } = await placeDeliveryOrder()
    const response = await assign(deliveryId, firstDriverId)
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.delivery.status, 'ASSIGNED')
    assert.equal(body.delivery.deliveryPersonnelId, firstDriverId)
    assert.ok(body.delivery.assignedAt)
  })

  test('PATCH /api/deliveries/:id/assign is refused a second time — 409, not silently reassigned', async () => {
    const { deliveryId } = await placeDeliveryOrder()
    const first = await assign(deliveryId, firstDriverId)
    assert.equal(first.status, 200)
    const second = await assign(deliveryId, secondDriverId)
    assert.equal(second.status, 409)

    const { rows } = await pool.query('SELECT delivery_personnel_id FROM deliveries WHERE delivery_id = $1', [deliveryId])
    assert.equal(rows[0].delivery_personnel_id, firstDriverId, 'the first assignment must stick')
  })

  test('PATCH /api/deliveries/:id/assign rejects a nonexistent delivery person', async () => {
    const { deliveryId } = await placeDeliveryOrder()
    const response = await assign(deliveryId, '999999999999999999')
    assert.equal(response.status, 422)
  })

  test('PATCH /api/deliveries/:id/assign is staff-only — a driver cannot self-assign', async () => {
    const { deliveryId } = await placeDeliveryOrder()
    const response = await assign(deliveryId, firstDriverId, firstDriverCookie)
    assert.equal(response.status, 403)
  })

  // Decision 9 / Pattern H — a driver's own id, resolved from the session,
  // scopes GET /mine. Another driver's assignment must not show up.
  test('GET /api/deliveries/mine is scoped to the driver\'s own assignments (Pattern H)', async () => {
    const { deliveryId } = await placeDeliveryOrder()
    await assign(deliveryId, firstDriverId)

    const asFirstDriver = await fetch(`${baseUrl}/api/deliveries/mine`, { headers: { Cookie: firstDriverCookie } })
    assert.equal(asFirstDriver.status, 200)
    assert.ok((await asFirstDriver.json()).deliveries.some((delivery) => delivery.id === deliveryId))

    const asSecondDriver = await fetch(`${baseUrl}/api/deliveries/mine`, { headers: { Cookie: secondDriverCookie } })
    assert.ok(!(await asSecondDriver.json()).deliveries.some((delivery) => delivery.id === deliveryId))
  })

  // --- The workflow: ASSIGNED -> OUT_FOR_DELIVERY -> DELIVERED | FAILED --

  test('a driver cannot skip ahead — OUT_FOR_DELIVERY from PENDING_ASSIGNMENT (unassigned) is refused', async () => {
    const { deliveryId } = await placeDeliveryOrder()
    const response = await setStatus(deliveryId, 'OUT_FOR_DELIVERY', firstDriverCookie)
    // Not assigned to anyone, so ownership itself fails first -- 404, the
    // same "don't confirm it exists" shape as any other unowned resource.
    assert.equal(response.status, 404)
  })

  test('a driver cannot jump straight to DELIVERED from ASSIGNED — wrong source state is 409', async () => {
    const { deliveryId } = await placeDeliveryOrder()
    await assign(deliveryId, firstDriverId)
    const response = await setStatus(deliveryId, 'DELIVERED', firstDriverCookie)
    assert.equal(response.status, 409)
  })

  // Decision 9 — a driver must never be able to transition a delivery
  // assigned to somebody else, and the failure must be a 404 (don't even
  // confirm the delivery exists), not a 403.
  test('a driver cannot transition a delivery assigned to someone else — 404, not 403', async () => {
    const { deliveryId } = await placeDeliveryOrder()
    await assign(deliveryId, firstDriverId)
    const response = await setStatus(deliveryId, 'OUT_FOR_DELIVERY', secondDriverCookie)
    assert.equal(response.status, 404)

    const { rows } = await pool.query('SELECT status FROM deliveries WHERE delivery_id = $1', [deliveryId])
    assert.equal(rows[0].status, 'ASSIGNED', 'the wrong driver\'s attempt must not have moved it')
  })

  // Pattern F — the only sync Phase 7 performs. Decision 4 — DELIVERED
  // deliberately does NOT touch orders.status; this is the test that would
  // look wrong without the plan open, so both directions are asserted
  // explicitly in one place.
  test('OUT_FOR_DELIVERY syncs orders.status; DELIVERED deliberately does not (Decision 4)', async () => {
    const { orderId, deliveryId } = await placeDeliveryOrder()
    await assign(deliveryId, firstDriverId)

    const outForDelivery = await setStatus(deliveryId, 'OUT_FOR_DELIVERY', firstDriverCookie)
    assert.equal(outForDelivery.status, 200)
    const afterOutForDelivery = await pool.query('SELECT status FROM orders WHERE order_id = $1', [orderId])
    assert.equal(afterOutForDelivery.rows[0].status, 'OUT_FOR_DELIVERY', 'Pattern F must sync the order')
    const history = await pool.query(`SELECT COUNT(*)::int AS n FROM order_status_history WHERE order_id = $1 AND status = 'OUT_FOR_DELIVERY'`, [orderId])
    assert.equal(history.rows[0].n, 1)

    const delivered = await setStatus(deliveryId, 'DELIVERED', firstDriverCookie)
    assert.equal(delivered.status, 200)
    const deliveredBody = await delivered.json()
    assert.equal(deliveredBody.delivery.status, 'DELIVERED')
    assert.ok(deliveredBody.delivery.deliveredAt)

    const afterDelivered = await pool.query('SELECT status FROM orders WHERE order_id = $1', [orderId])
    assert.equal(afterDelivered.rows[0].status, 'OUT_FOR_DELIVERY', 'DELIVERED must NOT touch orders.status — Decision 4')
  })

  test('OUT_FOR_DELIVERY can also end in FAILED, and orders.status stays untouched by that transition too', async () => {
    const { orderId, deliveryId } = await placeDeliveryOrder()
    await assign(deliveryId, firstDriverId)
    await setStatus(deliveryId, 'OUT_FOR_DELIVERY', firstDriverCookie)
    const beforeFail = await pool.query('SELECT status FROM orders WHERE order_id = $1', [orderId])

    const failed = await setStatus(deliveryId, 'FAILED', firstDriverCookie, 'Customer not home')
    assert.equal(failed.status, 200)
    assert.equal((await failed.json()).delivery.status, 'FAILED')

    const afterFail = await pool.query('SELECT status FROM orders WHERE order_id = $1', [orderId])
    assert.equal(afterFail.rows[0].status, beforeFail.rows[0].status, 'FAILED must not change orders.status either')
  })

  // Decision 5's one deliberate exception — only an ADMIN may retry a
  // FAILED delivery back to PENDING_ASSIGNMENT, and must say why.
  test('an admin can retry a FAILED delivery back to PENDING_ASSIGNMENT; a cashier and a driver cannot', async () => {
    const { deliveryId } = await placeDeliveryOrder()
    await assign(deliveryId, firstDriverId)
    await setStatus(deliveryId, 'OUT_FOR_DELIVERY', firstDriverCookie)
    await setStatus(deliveryId, 'FAILED', firstDriverCookie, 'Nobody answered')

    const cashierAttempt = await setStatus(deliveryId, 'PENDING_ASSIGNMENT', cashierCookie, 'retry')
    assert.equal(cashierAttempt.status, 403)
    const driverAttempt = await setStatus(deliveryId, 'PENDING_ASSIGNMENT', firstDriverCookie, 'retry')
    assert.equal(driverAttempt.status, 403)

    const noNoteAttempt = await setStatus(deliveryId, 'PENDING_ASSIGNMENT', adminCookie)
    assert.equal(noNoteAttempt.status, 422, 'the retry must explain why')

    const adminRetry = await setStatus(deliveryId, 'PENDING_ASSIGNMENT', adminCookie, 'Re-attempting after failed first delivery')
    assert.equal(adminRetry.status, 200)
    const body = await adminRetry.json()
    assert.equal(body.delivery.status, 'PENDING_ASSIGNMENT')
    assert.equal(body.delivery.deliveryPersonnelId, null, 'a retried delivery is genuinely unassigned again')
    assert.equal(body.delivery.assignedAt, null)

    // And it's really back in the assignable queue, not just LOOKING like it.
    const reassign = await assign(deliveryId, secondDriverId)
    assert.equal(reassign.status, 200)
  })

  // --- Phase 7 review fixes ------------------------------------------------

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
    await assign(deliveryId, firstDriverId)

    const holder = await pool.connect()
    const prober = await pool.connect()
    try {
      await holder.query('BEGIN')
      // Exactly what PATCH /api/orders/:id's claim does to this row.
      await holder.query('SELECT status FROM orders WHERE order_id = $1 FOR UPDATE', [orderId])

      // Started, not awaited — it must block on the order row above.
      const inFlight = setStatus(deliveryId, 'OUT_FOR_DELIVERY', firstDriverCookie)
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
    await assign(deliveryId, firstDriverId)

    const cancel = await fetch(`${baseUrl}/api/orders/${orderId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ status: 'CANCELLED' }) })
    assert.equal(cancel.status, 200)
    assert.equal((await pool.query('SELECT status FROM deliveries WHERE delivery_id = $1', [deliveryId])).rows[0].status, 'FAILED')

    const retry = await setStatus(deliveryId, 'PENDING_ASSIGNMENT', adminCookie, 'try again')
    assert.equal(retry.status, 409, 'a cancelled order\'s delivery must not go back in the queue')

    const after = await pool.query('SELECT status FROM deliveries WHERE delivery_id = $1', [deliveryId])
    assert.equal(after.rows[0].status, 'FAILED', 'the delivery must stay resolved')

    const reassign = await assign(deliveryId, firstDriverId)
    assert.equal(reassign.status, 409, 'and must not be assignable to anyone')
  })

  // Every forward transition is scoped to the ONE driver holding the
  // delivery, and FAILED was reachable only from that driver's own hands.
  // Deactivate a driver mid-run — ordinary staff admin — and that
  // in-flight delivery was unreachable by everyone: the driver 401s, and
  // admin/cashier were both refused. The only escape was cancelling the
  // whole order, which refunds and restocks it.
  test('an admin can recover an in-flight delivery whose driver can no longer act', async () => {
    const { deliveryId } = await placeDeliveryOrder()
    await assign(deliveryId, firstDriverId)
    await setStatus(deliveryId, 'OUT_FOR_DELIVERY', firstDriverCookie)

    await pool.query('UPDATE users SET is_active = FALSE WHERE user_id = (SELECT user_id FROM delivery_personnel WHERE delivery_personnel_id = $1)', [firstDriverId])
    try {
      const stranded = await setStatus(deliveryId, 'DELIVERED', firstDriverCookie)
      assert.equal(stranded.status, 401, 'the deactivated driver genuinely cannot act any more')

      const cashierAttempt = await setStatus(deliveryId, 'FAILED', cashierCookie, 'driver unreachable')
      assert.equal(cashierAttempt.status, 403, 'this is an admin-only override, not a cashier one')

      const recalled = await setStatus(deliveryId, 'FAILED', adminCookie, 'Driver account disabled mid-run')
      assert.equal(recalled.status, 200)
      assert.equal((await recalled.json()).delivery.status, 'FAILED')

      const noNote = await setStatus(deliveryId, 'PENDING_ASSIGNMENT', adminCookie)
      assert.equal(noNote.status, 422, 'the override must say why')

      const requeued = await setStatus(deliveryId, 'PENDING_ASSIGNMENT', adminCookie, 'Reassigning to another driver')
      assert.equal(requeued.status, 200)

      const reassign = await assign(deliveryId, secondDriverId)
      assert.equal(reassign.status, 200, 'and it can now genuinely go to someone else')
    } finally {
      await pool.query('UPDATE users SET is_active = TRUE WHERE user_id = (SELECT user_id FROM delivery_personnel WHERE delivery_personnel_id = $1)', [firstDriverId])
    }
  })

  // deliveries.note is the ONLY place a failure reason is recorded —
  // there is deliberately no delivery_status_history table. Overwriting
  // it on retry destroys the single most useful thing to know when
  // deciding whether the retry was even a good idea.
  test('retrying keeps the driver\'s failure reason instead of overwriting it', async () => {
    const { deliveryId } = await placeDeliveryOrder()
    await assign(deliveryId, firstDriverId)
    await setStatus(deliveryId, 'OUT_FOR_DELIVERY', firstDriverCookie)
    await setStatus(deliveryId, 'FAILED', firstDriverCookie, 'Customer refused — wrong flavour')
    await setStatus(deliveryId, 'PENDING_ASSIGNMENT', adminCookie, 'Re-baking, retry tomorrow')

    const note = (await pool.query('SELECT note FROM deliveries WHERE delivery_id = $1', [deliveryId])).rows[0].note
    assert.match(note, /wrong flavour/, 'the original failure reason must survive')
    assert.match(note, /Re-baking/, 'alongside the reason it was retried')
  })

  // express.raw() matches via type-is, which PARSES the media type, while
  // the extension lookup was an exact case-sensitive string match — so a
  // legal Content-Type variant was read in full and then rejected as "not
  // an image". Browsers send the bare lowercase form, which is why the
  // app's own UI never hit this and only another client would.
  test('a proof upload is accepted with a parameterised or differently-cased Content-Type', async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9])
    for (const contentType of ['image/jpeg; charset=binary', 'IMAGE/JPEG', 'image/jpeg']) {
      const { deliveryId } = await placeDeliveryOrder()
      await assign(deliveryId, firstDriverId)
      await setStatus(deliveryId, 'OUT_FOR_DELIVERY', firstDriverCookie)
      const response = await fetch(`${baseUrl}/api/deliveries/${deliveryId}/proof`, { method: 'POST', headers: { 'Content-Type': contentType, Cookie: firstDriverCookie }, body: jpeg })
      assert.equal(response.status, 201, `Content-Type "${contentType}" must be accepted`)

      const key = (await pool.query('SELECT storage_key FROM delivery_proofs WHERE delivery_id = $1', [deliveryId])).rows[0].storage_key
      assert.match(key, /^[0-9a-f-]{36}\.jpg$/, 'and still get a server-generated key with the right extension')
      const fs = await import('node:fs/promises')
      await fs.unlink(filePath(key)).catch(() => {})
    }
  })

  test('proof uploads are capped per delivery, and a refused one leaves no orphan file', async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9])
    const upload = (deliveryId) => fetch(`${baseUrl}/api/deliveries/${deliveryId}/proof`, { method: 'POST', headers: { 'Content-Type': 'image/jpeg', Cookie: firstDriverCookie }, body: jpeg })
    const { deliveryId } = await placeDeliveryOrder()
    await assign(deliveryId, firstDriverId)
    await setStatus(deliveryId, 'OUT_FOR_DELIVERY', firstDriverCookie)

    // The cap is 5; the 6th must be refused rather than accepted forever.
    for (let i = 0; i < 5; i += 1) assert.equal((await upload(deliveryId)).status, 201, `upload ${i + 1} of 5`)

    // The bytes reach disk BEFORE the row can be refused, so the route has
    // to clean up after itself or every rejected upload leaks a file that
    // nothing references and nothing will ever collect. Measured as a
    // before/after DELTA around the one refused request rather than
    // against the whole directory: uploads/ is shared with every other
    // test in this file (and with whatever earlier runs left behind), so
    // "no unexpected files exist" is not a thing any single test can
    // honestly assert — "this request added none" is.
    const fs = await import('node:fs/promises')
    const before = new Set(await fs.readdir(filePath('')).catch(() => []))
    assert.equal((await upload(deliveryId)).status, 409, 'the 6th upload must be refused')
    const after = await fs.readdir(filePath('')).catch(() => [])
    const leaked = after.filter((file) => !before.has(file))
    assert.deepEqual(leaked, [], 'a rejected upload must clean up the bytes it already wrote')

    const keys = (await pool.query('SELECT storage_key FROM delivery_proofs WHERE delivery_id = $1', [deliveryId])).rows.map((r) => r.storage_key)
    assert.equal(keys.length, 5, 'and must not have been written to the database either')

    for (const key of keys) await fs.unlink(filePath(key)).catch(() => {})
  })

  // Deliberately a delivery with ZERO proofs on it, so a 409 here can only
  // have come from the finished-delivery check. Folded in with the cap
  // test above, this assertion passed against broken code — the delivery
  // had already hit the cap by then, so the right status arrived for
  // entirely the wrong reason.
  test('proof uploads are refused once a delivery is finished', async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9])
    const { deliveryId } = await placeDeliveryOrder()
    await assign(deliveryId, firstDriverId)
    await setStatus(deliveryId, 'OUT_FOR_DELIVERY', firstDriverCookie)
    await setStatus(deliveryId, 'DELIVERED', firstDriverCookie)

    const response = await fetch(`${baseUrl}/api/deliveries/${deliveryId}/proof`, { method: 'POST', headers: { 'Content-Type': 'image/jpeg', Cookie: firstDriverCookie }, body: jpeg })
    assert.equal(response.status, 409, 'a finished delivery accepts no more proof')

    const stored = await pool.query('SELECT COUNT(*)::int AS n FROM delivery_proofs WHERE delivery_id = $1', [deliveryId])
    assert.equal(stored.rows[0].n, 0, 'and nothing is written for it')
  })

  // The row and the file can disagree — a restored backup, a hand-cleaned
  // uploads/, a future move to object storage that missed one. That is a
  // knowable condition with an honest answer ("it's gone"), not a server
  // fault, and this codebase treats a generic 500 for a knowable condition
  // as a defect in its own right.
  test('a proof whose file has vanished from disk is a 404, not a 500', async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9])
    const { deliveryId } = await placeDeliveryOrder()
    await assign(deliveryId, firstDriverId)
    await setStatus(deliveryId, 'OUT_FOR_DELIVERY', firstDriverCookie)
    const upload = await fetch(`${baseUrl}/api/deliveries/${deliveryId}/proof`, { method: 'POST', headers: { 'Content-Type': 'image/jpeg', Cookie: firstDriverCookie }, body: jpeg })
    const proofId = (await upload.json()).proof.id

    // Delete the bytes out from under the row, leaving the row behind.
    const key = (await pool.query('SELECT storage_key FROM delivery_proofs WHERE proof_id = $1', [proofId])).rows[0].storage_key
    const fs = await import('node:fs/promises')
    await fs.unlink(filePath(key))

    const response = await fetch(`${baseUrl}/api/deliveries/${deliveryId}/proof/${proofId}`, { headers: { Cookie: adminCookie } })
    assert.equal(response.status, 404, 'a missing file must be a clean 404')
    assert.ok(response.status < 500, 'and never a server error')
  })

  test('an admin retrying a delivery that is not FAILED is refused with 409', async () => {
    const { deliveryId } = await placeDeliveryOrder()
    const response = await setStatus(deliveryId, 'PENDING_ASSIGNMENT', adminCookie, 'not actually failed')
    assert.equal(response.status, 409)
  })

  // --- Proof of delivery ---------------------------------------------------

  const tinyJpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9])

  const setUpOutForDeliveryOrder = async () => {
    const { orderId, deliveryId } = await placeDeliveryOrder()
    await assign(deliveryId, firstDriverId)
    await setStatus(deliveryId, 'OUT_FOR_DELIVERY', firstDriverCookie)
    return { orderId, deliveryId }
  }

  test('POST /api/deliveries/:id/proof is refused for a non-image content type — 422, not 500', async () => {
    const { deliveryId } = await setUpOutForDeliveryOrder()
    const response = await fetch(`${baseUrl}/api/deliveries/${deliveryId}/proof?proofType=PHOTO`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain', Cookie: firstDriverCookie },
      body: 'not an image',
    })
    assert.equal(response.status, 422)
    const proofs = await pool.query('SELECT COUNT(*)::int AS n FROM delivery_proofs WHERE delivery_id = $1', [deliveryId])
    assert.equal(proofs.rows[0].n, 0)
  })

  test('POST /api/deliveries/:id/proof over the size limit is refused cleanly, not with a 500', async () => {
    const { deliveryId } = await setUpOutForDeliveryOrder()
    const oversized = Buffer.alloc(6 * 1024 * 1024, 0xff) // over the 5mb limit
    const response = await fetch(`${baseUrl}/api/deliveries/${deliveryId}/proof?proofType=PHOTO`, {
      method: 'POST',
      headers: { 'Content-Type': 'image/jpeg', Cookie: firstDriverCookie },
      body: oversized,
    })
    assert.equal(response.status, 413)
    assert.ok(response.status < 500)
  })

  test('POST /api/deliveries/:id/proof is scoped to the driver\'s own delivery — 404 for someone else\'s', async () => {
    const { deliveryId } = await setUpOutForDeliveryOrder()
    const response = await fetch(`${baseUrl}/api/deliveries/${deliveryId}/proof?proofType=PHOTO`, {
      method: 'POST',
      headers: { 'Content-Type': 'image/jpeg', Cookie: secondDriverCookie },
      body: tinyJpegBytes,
    })
    assert.equal(response.status, 404)
    const proofs = await pool.query('SELECT COUNT(*)::int AS n FROM delivery_proofs WHERE delivery_id = $1', [deliveryId])
    assert.equal(proofs.rows[0].n, 0, 'nothing should have been written for an unowned delivery')
  })

  // PATTERN G — the security test of the phase. A file_name that looks
  // like a path-traversal attempt must never reach the filesystem: the
  // ACTUAL file on disk is always named from a server-generated UUID, and
  // the traversal string is stored back only as an inert text label.
  test('a path-traversal file_name writes a UUID-named file inside uploads/, never outside it (Pattern G)', async () => {
    const { deliveryId } = await setUpOutForDeliveryOrder()
    const maliciousName = encodeURIComponent('../../server/db.js')

    const beforeContent = await import('node:fs/promises').then((fs) => fs.readFile(new URL('../db.js', import.meta.url), 'utf8'))

    const response = await fetch(`${baseUrl}/api/deliveries/${deliveryId}/proof?proofType=PHOTO&fileName=${maliciousName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'image/jpeg', Cookie: firstDriverCookie },
      body: tinyJpegBytes,
    })
    assert.equal(response.status, 201)
    const body = await response.json()
    assert.equal(body.proof.fileName, '../../server/db.js', 'the traversal string is kept only as an inert label')

    const stored = await pool.query('SELECT storage_key FROM delivery_proofs WHERE proof_id = $1', [body.proof.id])
    const storageKey = stored.rows[0].storage_key
    assert.match(storageKey, /^[0-9a-f-]{36}\.jpg$/, 'the actual on-disk name must be a server-generated UUID, not the client-supplied name')
    assert.ok(!storageKey.includes('..'), 'the storage key must never contain a path-traversal sequence')

    const fs = await import('node:fs/promises')
    const written = await fs.readFile(filePath(storageKey))
    assert.deepEqual(written, tinyJpegBytes, 'the uploaded bytes must land at the UUID path inside uploads/')

    // The real target of the attack — server/db.js — must be untouched.
    const afterContent = await fs.readFile(new URL('../db.js', import.meta.url), 'utf8')
    assert.equal(afterContent, beforeContent, 'a path-traversal file_name must never write outside uploads/')

    await fs.unlink(filePath(storageKey)).catch(() => {})
  })

  test('a successful proof upload is listed for staff and the uploading driver, and its bytes are fetchable', async () => {
    const { deliveryId } = await setUpOutForDeliveryOrder()
    const upload = await fetch(`${baseUrl}/api/deliveries/${deliveryId}/proof?proofType=PHOTO`, {
      method: 'POST',
      headers: { 'Content-Type': 'image/jpeg', Cookie: firstDriverCookie },
      body: tinyJpegBytes,
    })
    assert.equal(upload.status, 201)
    const proofId = (await upload.json()).proof.id

    const staffList = await fetch(`${baseUrl}/api/deliveries/${deliveryId}/proof`, { headers: { Cookie: adminCookie } })
    assert.equal(staffList.status, 200)
    assert.ok((await staffList.json()).proofs.some((proof) => proof.id === proofId))

    const otherDriverList = await fetch(`${baseUrl}/api/deliveries/${deliveryId}/proof`, { headers: { Cookie: secondDriverCookie } })
    assert.equal(otherDriverList.status, 404, 'a driver who does not own this delivery must not see its proofs either')

    const file = await fetch(`${baseUrl}/api/deliveries/${deliveryId}/proof/${proofId}`, { headers: { Cookie: adminCookie } })
    assert.equal(file.status, 200)
    const bytes = Buffer.from(await file.arrayBuffer())
    assert.deepEqual(bytes, tinyJpegBytes)

    const storageKey = (await pool.query('SELECT storage_key FROM delivery_proofs WHERE proof_id = $1', [proofId])).rows[0].storage_key
    const fs = await import('node:fs/promises')
    await fs.unlink(filePath(storageKey)).catch(() => {})
  })
})

after(async () => {
  await pool.end()
})
