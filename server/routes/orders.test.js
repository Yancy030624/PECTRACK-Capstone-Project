// Lightweight integration tests for order creation, listing, detail, and
// status updates (PICKUP only — see routes/orders.js for why). Same
// approach as the other route tests: real Express app on an ephemeral
// port, real database. Run with: npm test
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { after, before, describe, test } from 'node:test'
import bcrypt from 'bcrypt'
import app from '../app.js'
import { pool } from '../db.js'

const runId = crypto.randomUUID().slice(0, 8)
const randomContactNumber = () => `09${Math.floor(100000000 + Math.random() * 899999999)}`

describe('order management', () => {
  let server
  let baseUrl
  let adminCookie
  let cashierCookie
  let customerCookie
  let secondCustomerCookie
  let secondCustomerId
  let availableProductId
  let unavailableProductId
  let stockTestProductId
  let categoryId
  let customerId
  let customerAddressId
  let secondCustomerAddressId
  const createdUserIds = []
  const createdProductIds = []
  const createdOrderIds = []

  const admin = { username: `orderadmin_${runId}`, password: 'Admin-Only-Password-9!' }
  const cashier = { role: 'CASHIER', name: 'Order Cashier', username: `ordercash_${runId}`, email: `ordercash_${runId}@example.com`, contactNumber: randomContactNumber(), password: 'Cashier-Password-9!' }
  const customer = { name: 'Order Customer', username: `ordercust_${runId}`, email: `ordercust_${runId}@example.com`, contactNumber: randomContactNumber(), password: 'Correct-Horse-Battery-9!' }
  const secondCustomer = { name: 'Second Customer', username: `ordercust2_${runId}`, email: `ordercust2_${runId}@example.com`, contactNumber: randomContactNumber(), password: 'Correct-Horse-Battery-9!' }
  const walkInCustomer = { name: 'Walkin Target', username: `orderwalkin_${runId}`, email: `orderwalkin_${runId}@example.com`, contactNumber: randomContactNumber(), password: 'Correct-Horse-Battery-9!' }

  before(async () => {
    server = app.listen(0)
    await new Promise((resolve) => server.once('listening', resolve))
    baseUrl = `http://localhost:${server.address().port}`

    const adminPasswordHash = await bcrypt.hash(admin.password, 4)
    const adminResult = await pool.query(`INSERT INTO users (username, password_hash, user_type) VALUES ($1, $2, 'ADMIN') RETURNING user_id`, [admin.username, adminPasswordHash])
    createdUserIds.push(adminResult.rows[0].user_id)
    await pool.query('INSERT INTO admins (user_id, name, contact_num, email) VALUES ($1, $2, $3, $4)', [adminResult.rows[0].user_id, 'Order Test Admin', randomContactNumber(), `orderadmin_${runId}@example.com`])
    await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: admin.username, password: admin.password }) })
    const rawCode = '112233'
    // /verify-otp now requires the challenge token that /login issues
    // after the password check, so a seeded OTP row needs one too.
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

    await fetch(`${baseUrl}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...secondCustomer, confirmPassword: secondCustomer.password }) })
    const secondCustomerRow = await pool.query('SELECT user_id, (SELECT customer_id FROM customers WHERE user_id = users.user_id) AS customer_id FROM users WHERE username = $1', [secondCustomer.username])
    createdUserIds.push(secondCustomerRow.rows[0].user_id)
    secondCustomerId = secondCustomerRow.rows[0].customer_id
    const secondCustomerLogin = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: secondCustomer.username, password: secondCustomer.password }) })
    secondCustomerCookie = secondCustomerLogin.headers.get('set-cookie').split(';')[0]

    // Phase 7 — a saved address for each of the two customers, one each is
    // all these DELIVERY-order tests need. Inserted directly rather than
    // through POST /api/addresses: that router has its own full test
    // suite (addresses.test.js) already covering creation; here it's only
    // a fixture.
    const customerAddress = await pool.query(
      `INSERT INTO customer_addresses (customer_id, recipient_name, contact_num, address_line_1, is_default)
       VALUES ($1, 'Order Test Customer', $2, '1 Delivery St', TRUE) RETURNING address_id`,
      [customerId, randomContactNumber()],
    )
    customerAddressId = customerAddress.rows[0].address_id
    const secondCustomerAddress = await pool.query(
      `INSERT INTO customer_addresses (customer_id, recipient_name, contact_num, address_line_1, is_default)
       VALUES ($1, 'Second Order Test Customer', $2, '2 Delivery St', TRUE) RETURNING address_id`,
      [secondCustomerId, randomContactNumber()],
    )
    secondCustomerAddressId = secondCustomerAddress.rows[0].address_id

    await fetch(`${baseUrl}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...walkInCustomer, confirmPassword: walkInCustomer.password }) })
    const walkInRow = await pool.query('SELECT user_id FROM users WHERE username = $1', [walkInCustomer.username])
    createdUserIds.push(walkInRow.rows[0].user_id)

    const categoryResult = await pool.query('INSERT INTO categories (category_name) VALUES ($1) RETURNING category_id', [`Order Test Category ${runId}`])
    categoryId = categoryResult.rows[0].category_id

    const availableProduct = await fetch(`${baseUrl}/api/products`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ categoryId, name: `Order Test Bread ${runId}`, price: 45.5 }) })
    availableProductId = (await availableProduct.json()).product.id
    createdProductIds.push(availableProductId)
    // A product's inventory row is created with stock_quantity 0 by
    // default (see routes/products.js). Now that placing an order
    // actually deducts stock (Phase 5, Step 3), every test in this file
    // that places an order against this product needs it to have enough
    // — seeded generously high so the whole file's worth of test orders
    // can never run it out.
    await pool.query('UPDATE inventory SET stock_quantity = 1000 WHERE product_id = $1', [availableProductId])

    const unavailableProduct = await fetch(`${baseUrl}/api/products`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ categoryId, name: `Order Test Discontinued ${runId}`, price: 30, availabilityStatus: false }) })
    unavailableProductId = (await unavailableProduct.json()).product.id
    createdProductIds.push(unavailableProductId)

    // A SEPARATE product with a small, precisely controlled stock level —
    // used by the stock-deduction/restoration tests below, which need to
    // assert exact before/after quantities without accounting for what
    // every other test in this file also did to availableProductId's
    // stock.
    const stockTestProduct = await fetch(`${baseUrl}/api/products`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ categoryId, name: `Order Test Stock Item ${runId}`, price: 20 }) })
    stockTestProductId = (await stockTestProduct.json()).product.id
    createdProductIds.push(stockTestProductId)
  })

  after(async () => {
    // inventory_movements.order_id AND payments.order_id both reference
    // orders(order_id) with no ON DELETE CASCADE (see database/migrations/
    // 003 and PHASE6_PLAN.md's migration 005), so both must be cleared
    // before the orders themselves are deleted below. Without this,
    // DELETE FROM orders below silently fails (its own .catch swallows
    // it), the order row survives, and the customer DELETE further down —
    // which has no .catch — throws on the same foreign key. That throw
    // happens before this hook's final `server.close()`, so the test
    // server is never closed and the whole process hangs afterward rather
    // than exiting, which is what actually surfaced this: not a stuck
    // request, but a listening socket nothing ever closed.
    await pool.query('DELETE FROM payments WHERE order_id = ANY($1)', [createdOrderIds]).catch(() => {})
    await pool.query('DELETE FROM inventory_movements WHERE order_id = ANY($1)', [createdOrderIds]).catch(() => {})
    // deliveries.order_id references orders(order_id) with no ON DELETE
    // CASCADE (Phase 7) — same reasoning as payments/inventory_movements
    // just above: it must be cleared before the orders themselves, or the
    // DELETE FROM orders below fails on this foreign key instead.
    await pool.query('DELETE FROM deliveries WHERE order_id = ANY($1)', [createdOrderIds]).catch(() => {})
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
    await pool.query('DELETE FROM cashiers WHERE user_id = ANY($1)', [createdUserIds])
    await pool.query('DELETE FROM customers WHERE user_id = ANY($1)', [createdUserIds])
    await pool.query('DELETE FROM admins WHERE user_id = ANY($1)', [createdUserIds])
    await pool.query('DELETE FROM delivery_personnel WHERE user_id = ANY($1)', [createdUserIds])
    await pool.query('DELETE FROM users WHERE user_id = ANY($1)', [createdUserIds])
    await new Promise((resolve) => server.close(resolve))
  })

  test('POST /api/orders requires authentication', async () => {
    const response = await fetch(`${baseUrl}/api/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: [{ productId: availableProductId, quantity: 1 }] }) })
    assert.equal(response.status, 401)
  })

  test('POST /api/orders rejects admin — order-taking is a cashier/customer concern', async () => {
    const response = await fetch(`${baseUrl}/api/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ items: [{ productId: availableProductId, quantity: 1 }] }) })
    assert.equal(response.status, 403)
  })

  test('POST /api/orders rejects an empty item list', async () => {
    const response = await fetch(`${baseUrl}/api/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: customerCookie }, body: JSON.stringify({ items: [] }) })
    assert.equal(response.status, 422)
  })

  test('POST /api/orders rejects an unavailable product', async () => {
    const response = await fetch(`${baseUrl}/api/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: customerCookie }, body: JSON.stringify({ items: [{ productId: unavailableProductId, quantity: 1 }] }) })
    assert.equal(response.status, 422)
    const { rows } = await pool.query('SELECT 1 FROM orders WHERE customer_id IS NOT NULL AND total_amount = 30.00')
    assert.equal(rows.length, 0, 'no order should have been created')
  })

  test('POST /api/orders rejects an invalid orderType', async () => {
    const response = await fetch(`${baseUrl}/api/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: customerCookie }, body: JSON.stringify({ orderType: 'TELEPORT', items: [{ productId: availableProductId, quantity: 1 }] }) })
    assert.equal(response.status, 422)
  })

  // --- Phase 7: DELIVERY orders -------------------------------------------

  // Decision 7 — a walk-in has customerId null and so has no saved
  // addresses to choose from; a cashier placing a DELIVERY order MUST name
  // a real customer.
  test('POST /api/orders rejects a DELIVERY order with no customerId (walk-ins are pickup-only)', async () => {
    const response = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cashierCookie },
      body: JSON.stringify({ orderType: 'DELIVERY', addressId: customerAddressId, items: [{ productId: availableProductId, quantity: 1 }] }),
    })
    assert.equal(response.status, 422)
    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM deliveries d JOIN orders o ON o.order_id = d.order_id WHERE o.customer_id IS NULL')
    assert.equal(rows[0].n, 0, 'a refused walk-in delivery must not leave a deliveries row behind')
  })

  // Decision 7 (continued) — the address must belong to THIS order's
  // customer. A customer must not be able to send an order to someone
  // else's saved address by passing its id, and neither should a cashier
  // acting on a customer's behalf.
  test('POST /api/orders rejects a DELIVERY order using another customer\'s address', async () => {
    const response = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: customerCookie },
      body: JSON.stringify({ orderType: 'DELIVERY', addressId: secondCustomerAddressId, items: [{ productId: availableProductId, quantity: 1 }] }),
    })
    assert.equal(response.status, 422)
  })

  test('POST /api/orders rejects a DELIVERY order with no addressId', async () => {
    const response = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: customerCookie },
      body: JSON.stringify({ orderType: 'DELIVERY', items: [{ productId: availableProductId, quantity: 1 }] }),
    })
    assert.equal(response.status, 422)
  })

  let deliveryOrderId

  // Decision 3 — the deliveries row is created WITH the order, in the same
  // transaction, at PENDING_ASSIGNMENT. Not lazily on first assignment.
  test('POST /api/orders creates exactly one deliveries row at PENDING_ASSIGNMENT for a DELIVERY order', async () => {
    const response = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: customerCookie },
      body: JSON.stringify({ orderType: 'DELIVERY', addressId: customerAddressId, items: [{ productId: availableProductId, quantity: 2 }] }),
    })
    assert.equal(response.status, 201)
    const body = await response.json()
    deliveryOrderId = body.order.id
    createdOrderIds.push(deliveryOrderId)

    const detail = await fetch(`${baseUrl}/api/orders/${deliveryOrderId}`, { headers: { Cookie: customerCookie } }).then((r) => r.json())
    assert.equal(detail.order.orderType, 'DELIVERY')

    const { rows } = await pool.query('SELECT status, delivery_personnel_id, assigned_at FROM deliveries WHERE order_id = $1', [deliveryOrderId])
    assert.equal(rows.length, 1, 'exactly one deliveries row')
    assert.equal(rows[0].status, 'PENDING_ASSIGNMENT')
    assert.equal(rows[0].delivery_personnel_id, null)
    assert.equal(rows[0].assigned_at, null)
  })

  // Decision 3 (continued) — if stock deduction fails partway through the
  // SAME transaction the deliveries row was inserted in, the whole thing
  // rolls back together. No orphan deliveries row for an order that was
  // itself refused.
  test('POST /api/orders leaves no deliveries row behind when a DELIVERY order is refused for insufficient stock', async () => {
    await pool.query('UPDATE inventory SET stock_quantity = 1 WHERE product_id = $1', [stockTestProductId])
    const before = await pool.query('SELECT COUNT(*)::int AS n FROM deliveries d JOIN orders o ON o.order_id = d.order_id WHERE o.customer_id = $1', [customerId])

    const response = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: customerCookie },
      body: JSON.stringify({ orderType: 'DELIVERY', addressId: customerAddressId, items: [{ productId: stockTestProductId, quantity: 5 }] }),
    })
    assert.equal(response.status, 409)

    const after = await pool.query('SELECT COUNT(*)::int AS n FROM deliveries d JOIN orders o ON o.order_id = d.order_id WHERE o.customer_id = $1', [customerId])
    assert.equal(after.rows[0].n, before.rows[0].n, 'a refused delivery order must not leave a deliveries row behind')
  })

  // Decision 2 — deliveries.status is the source of truth; orders.status
  // is synced FROM it (routes/deliveries.js, Pattern F), never written to
  // OUT_FOR_DELIVERY directly through this route. Without this refusal,
  // the two could disagree with nothing able to say which is true.
  test('PATCH /api/orders/:id refuses a manual OUT_FOR_DELIVERY on an order that has a delivery row', async () => {
    const before = await pool.query('SELECT status FROM orders WHERE order_id = $1', [deliveryOrderId])
    assert.equal(before.rows[0].status, 'PLACED')

    const response = await fetch(`${baseUrl}/api/orders/${deliveryOrderId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: cashierCookie }, body: JSON.stringify({ status: 'OUT_FOR_DELIVERY' }) })
    assert.equal(response.status, 409)

    const after = await pool.query('SELECT status FROM orders WHERE order_id = $1', [deliveryOrderId])
    assert.equal(after.rows[0].status, 'PLACED', 'a refused transition must leave the order status untouched')

    const history = await pool.query(`SELECT COUNT(*)::int AS n FROM order_status_history WHERE order_id = $1 AND status = 'OUT_FOR_DELIVERY'`, [deliveryOrderId])
    assert.equal(history.rows[0].n, 0, 'a refused transition must not leave a history row claiming it happened')
  })

  // Decision 6 — cancelling an order must resolve its delivery row, in the
  // SAME transaction, so an ASSIGNED/OUT_FOR_DELIVERY delivery never keeps
  // pointing at a cancelled order.
  test('PATCH /api/orders/:id CANCELLED marks a non-terminal delivery row FAILED, and leaves an already-DELIVERED one alone', async () => {
    // This order's delivery is still PENDING_ASSIGNMENT; move it to
    // ASSIGNED directly, the same state a real assignment would leave it
    // in — routes/deliveries.js's own assignment flow is covered by
    // deliveries.test.js, this only needs the resulting state.
    await pool.query(`UPDATE deliveries SET status = 'ASSIGNED', assigned_at = CURRENT_TIMESTAMP WHERE order_id = $1`, [deliveryOrderId])

    const response = await fetch(`${baseUrl}/api/orders/${deliveryOrderId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: cashierCookie }, body: JSON.stringify({ status: 'CANCELLED' }) })
    assert.equal(response.status, 200)

    const { rows } = await pool.query('SELECT status FROM deliveries WHERE order_id = $1', [deliveryOrderId])
    assert.equal(rows[0].status, 'FAILED', 'an ASSIGNED delivery must be marked FAILED when its order is cancelled')

    // A second delivery order, already DELIVERED before its order is
    // cancelled (an odd but possible sequence — DELIVERED doesn't
    // complete the order, Decision 4), must NOT have its terminal state
    // overwritten by the cancellation.
    const secondDelivery = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: customerCookie },
      body: JSON.stringify({ orderType: 'DELIVERY', addressId: customerAddressId, items: [{ productId: availableProductId, quantity: 1 }] }),
    }).then((r) => r.json())
    createdOrderIds.push(secondDelivery.order.id)
    await pool.query(`UPDATE deliveries SET status = 'DELIVERED', delivered_at = CURRENT_TIMESTAMP WHERE order_id = $1`, [secondDelivery.order.id])

    const cancelDelivered = await fetch(`${baseUrl}/api/orders/${secondDelivery.order.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ status: 'CANCELLED' }) })
    assert.equal(cancelDelivered.status, 200)
    const stillDelivered = await pool.query('SELECT status FROM deliveries WHERE order_id = $1', [secondDelivery.order.id])
    assert.equal(stillDelivered.rows[0].status, 'DELIVERED', 'an already-DELIVERED delivery must not be overwritten to FAILED by a later cancellation')
  })

  // Regression: order_details has UNIQUE (order_id, product_id), so the
  // same product listed twice used to violate it partway through the
  // INSERT loop and surface as a 500. Quantities are merged instead —
  // which is also what a cart sending "add this again" actually means.
  test('POST /api/orders merges repeated products instead of failing on the unique constraint', async () => {
    const response = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: customerCookie },
      body: JSON.stringify({ items: [{ productId: availableProductId, quantity: 1 }, { productId: availableProductId, quantity: 2 }] }),
    })
    assert.equal(response.status, 201)
    const body = await response.json()
    assert.equal(body.order.totalAmount, '136.50') // 45.50 * (1 + 2), not two separate rows
    createdOrderIds.push(body.order.id)

    const { rows } = await pool.query('SELECT quantity FROM order_details WHERE order_id = $1', [body.order.id])
    assert.equal(rows.length, 1, 'the two entries should have become one row')
    assert.equal(rows[0].quantity, 3)
  })

  // The stored total must equal the sum of the line items exactly.
  // orders.total_amount is denormalized, so the risk is that it drifts from
  // the rows it's supposed to represent — it's now summed by Postgres in
  // NUMERIC from those very rows rather than calculated separately in
  // JavaScript floating point.
  test('the stored total is the exact sum of the order_details rows', async () => {
    const response = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: customerCookie },
      body: JSON.stringify({ items: [{ productId: availableProductId, quantity: 7 }] }),
    })
    assert.equal(response.status, 201)
    const body = await response.json()
    createdOrderIds.push(body.order.id)

    assert.equal(body.order.totalAmount, '318.50') // 45.50 * 7, exactly

    const { rows } = await pool.query(
      `SELECT o.total_amount, (SELECT SUM(quantity * unit_price) FROM order_details WHERE order_id = o.order_id) AS items_total
       FROM orders o WHERE o.order_id = $1`,
      [body.order.id],
    )
    assert.equal(rows[0].total_amount, rows[0].items_total, 'stored total must match the line items it came from')
  })

  // Regression: a productId past the BIGINT range is all digits, so it got
  // through the old Number()-based check and only failed once Postgres
  // rejected the literal — as a 500 rather than a validation error.
  test('POST /api/orders rejects a productId too large to be a bigint', async () => {
    const response = await fetch(`${baseUrl}/api/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: customerCookie }, body: JSON.stringify({ items: [{ productId: '99999999999999999999', quantity: 1 }] }) })
    assert.equal(response.status, 422)
  })

  test('POST /api/orders rejects a non-numeric productId', async () => {
    const response = await fetch(`${baseUrl}/api/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: customerCookie }, body: JSON.stringify({ items: [{ productId: 'abc', quantity: 1 }] }) })
    assert.equal(response.status, 422)
  })

  let customerOrderId

  test('POST /api/orders lets a customer place their own order with a correctly snapshotted total', async () => {
    const response = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: customerCookie },
      body: JSON.stringify({ items: [{ productId: availableProductId, quantity: 3 }], instructions: 'No onions' }),
    })
    assert.equal(response.status, 201)
    const body = await response.json()
    assert.equal(body.order.totalAmount, '136.50') // 45.50 * 3
    assert.equal(body.order.status, 'PLACED')
    customerOrderId = body.order.id
    createdOrderIds.push(customerOrderId)
  })

  test('GET /api/orders/:id returns the full detail with items and status history', async () => {
    const response = await fetch(`${baseUrl}/api/orders/${customerOrderId}`, { headers: { Cookie: customerCookie } })
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.order.items.length, 1)
    assert.equal(body.order.items[0].quantity, 3)
    assert.equal(body.order.items[0].unitPrice, '45.50')
    assert.equal(body.order.statusHistory.length, 1)
    assert.equal(body.order.statusHistory[0].status, 'PLACED')
  })

  test('GET /api/orders/:id hides another customer\'s order (404, not 403)', async () => {
    const response = await fetch(`${baseUrl}/api/orders/${customerOrderId}`, { headers: { Cookie: secondCustomerCookie } })
    assert.equal(response.status, 404)
  })

  test('GET /api/orders only shows a customer their own orders, but shows cashier/admin everything', async () => {
    const asOwner = await fetch(`${baseUrl}/api/orders`, { headers: { Cookie: customerCookie } })
    const ownerOrders = (await asOwner.json()).orders
    assert.ok(ownerOrders.some((order) => order.id === customerOrderId))

    const asOther = await fetch(`${baseUrl}/api/orders`, { headers: { Cookie: secondCustomerCookie } })
    const otherOrders = (await asOther.json()).orders
    assert.ok(!otherOrders.some((order) => order.id === customerOrderId))

    const asCashier = await fetch(`${baseUrl}/api/orders`, { headers: { Cookie: cashierCookie } })
    const cashierOrders = (await asCashier.json()).orders
    assert.ok(cashierOrders.some((order) => order.id === customerOrderId))
  })

  test('POST /api/orders lets a cashier create a walk-in order with no customer attached', async () => {
    const response = await fetch(`${baseUrl}/api/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cashierCookie }, body: JSON.stringify({ items: [{ productId: availableProductId, quantity: 1 }] }) })
    assert.equal(response.status, 201)
    const orderId = (await response.json()).order.id
    createdOrderIds.push(orderId)

    const detail = await fetch(`${baseUrl}/api/orders/${orderId}`, { headers: { Cookie: cashierCookie } })
    const body = await detail.json()
    assert.equal(body.order.customerId, null)
    assert.equal(body.order.cashierName, cashier.name)
  })

  test('POST /api/orders lets a cashier create an order on behalf of a known customer', async () => {
    const response = await fetch(`${baseUrl}/api/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cashierCookie }, body: JSON.stringify({ items: [{ productId: availableProductId, quantity: 1 }], customerId: secondCustomerId }) })
    assert.equal(response.status, 201)
    const orderId = (await response.json()).order.id
    createdOrderIds.push(orderId)

    const detail = await fetch(`${baseUrl}/api/orders/${orderId}`, { headers: { Cookie: cashierCookie } })
    const body = await detail.json()
    assert.equal(body.order.customerId, secondCustomerId)
  })

  test('PATCH /api/orders/:id lets a customer cancel their own PLACED order', async () => {
    const response = await fetch(`${baseUrl}/api/orders/${customerOrderId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: customerCookie }, body: JSON.stringify({ status: 'CANCELLED' }) })
    assert.equal(response.status, 200)
    assert.equal((await response.json()).order.status, 'CANCELLED')
  })

  test('PATCH /api/orders/:id blocks a customer from cancelling once it is no longer PLACED', async () => {
    const createResponse = await fetch(`${baseUrl}/api/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: customerCookie }, body: JSON.stringify({ items: [{ productId: availableProductId, quantity: 1 }] }) })
    const orderId = (await createResponse.json()).order.id
    createdOrderIds.push(orderId)

    const confirmResponse = await fetch(`${baseUrl}/api/orders/${orderId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: cashierCookie }, body: JSON.stringify({ status: 'CONFIRMED' }) })
    assert.equal(confirmResponse.status, 200)

    const cancelAttempt = await fetch(`${baseUrl}/api/orders/${orderId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: customerCookie }, body: JSON.stringify({ status: 'CANCELLED' }) })
    assert.equal(cancelAttempt.status, 409)
  })

  test('PATCH /api/orders/:id blocks a customer from cancelling someone else\'s order', async () => {
    const createResponse = await fetch(`${baseUrl}/api/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: customerCookie }, body: JSON.stringify({ items: [{ productId: availableProductId, quantity: 1 }] }) })
    const orderId = (await createResponse.json()).order.id
    createdOrderIds.push(orderId)

    const response = await fetch(`${baseUrl}/api/orders/${orderId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: secondCustomerCookie }, body: JSON.stringify({ status: 'CANCELLED' }) })
    assert.equal(response.status, 404)
  })

  test('PATCH /api/orders/:id rejects an invalid status value', async () => {
    const response = await fetch(`${baseUrl}/api/orders/${customerOrderId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ status: 'NOT_A_REAL_STATUS' }) })
    assert.equal(response.status, 422)
  })

  // Regression: a malformed :id used to reach Postgres as an invalid
  // bigint literal and come back as a 500. It should be indistinguishable
  // from an order that simply doesn't exist.
  test('a malformed :id is treated as "not found", never a server error', async () => {
    for (const badId of ['abc', 'undefined', '1.5', '99999999999999999999']) {
      const read = await fetch(`${baseUrl}/api/orders/${badId}`, { headers: { Cookie: adminCookie } })
      assert.equal(read.status, 404, `GET with id "${badId}"`)
      const write = await fetch(`${baseUrl}/api/orders/${badId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ status: 'CONFIRMED' }) })
      assert.equal(write.status, 404, `PATCH with id "${badId}"`)
    }
  })

  // --- Phase 5, Steps 3-4: stock deduction and restoration ---------------
  // These use stockTestProductId (a dedicated product with its stock set
  // explicitly at the start of each test) rather than availableProductId,
  // so each assertion can check an EXACT before/after quantity without
  // accounting for what every other test in this file also did to shared
  // stock.

  test('POST /api/orders rejects an order that exceeds available stock, and nothing is created', async () => {
    await pool.query('UPDATE inventory SET stock_quantity = 5 WHERE product_id = $1', [stockTestProductId])

    const response = await fetch(`${baseUrl}/api/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: customerCookie }, body: JSON.stringify({ items: [{ productId: stockTestProductId, quantity: 6 }] }) })
    assert.equal(response.status, 409)

    const { rows } = await pool.query('SELECT stock_quantity FROM inventory WHERE product_id = $1', [stockTestProductId])
    assert.equal(rows[0].stock_quantity, 5, 'stock must be unchanged after a rejected order')

    const orders = await pool.query(`SELECT 1 FROM order_details WHERE product_id = $1 AND quantity = 6`, [stockTestProductId])
    assert.equal(orders.rows.length, 0, 'no order_details row should exist for the rejected order')
  })

  let stockTestOrderId

  test('POST /api/orders deducts stock and writes a matching ORDER_PLACED movement', async () => {
    await pool.query('UPDATE inventory SET stock_quantity = 20 WHERE product_id = $1', [stockTestProductId])

    const response = await fetch(`${baseUrl}/api/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: customerCookie }, body: JSON.stringify({ items: [{ productId: stockTestProductId, quantity: 8 }] }) })
    assert.equal(response.status, 201)
    stockTestOrderId = (await response.json()).order.id
    createdOrderIds.push(stockTestOrderId)

    const { rows: stockRows } = await pool.query('SELECT inventory_id, stock_quantity FROM inventory WHERE product_id = $1', [stockTestProductId])
    assert.equal(stockRows[0].stock_quantity, 12) // 20 - 8

    const movements = await pool.query('SELECT quantity_change, reason, order_id FROM inventory_movements WHERE inventory_id = $1', [stockRows[0].inventory_id])
    assert.equal(movements.rows.length, 1)
    assert.equal(movements.rows[0].quantity_change, -8)
    assert.equal(movements.rows[0].reason, 'ORDER_PLACED')
    assert.equal(movements.rows[0].order_id, stockTestOrderId)
  })

  test('PATCH /api/orders/:id cancelling a PLACED order restores exactly what was deducted', async () => {
    // Stock is 12 after the previous test (20 - 8).
    const response = await fetch(`${baseUrl}/api/orders/${stockTestOrderId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: cashierCookie }, body: JSON.stringify({ status: 'CANCELLED' }) })
    assert.equal(response.status, 200)

    const { rows: stockRows } = await pool.query('SELECT inventory_id, stock_quantity FROM inventory WHERE product_id = $1', [stockTestProductId])
    assert.equal(stockRows[0].stock_quantity, 20, 'the full 8 units should be back')

    const latestMovement = await pool.query('SELECT quantity_change, reason, order_id FROM inventory_movements WHERE inventory_id = $1 ORDER BY movement_id DESC LIMIT 1', [stockRows[0].inventory_id])
    assert.equal(latestMovement.rows[0].quantity_change, 8)
    assert.equal(latestMovement.rows[0].reason, 'ORDER_CANCELLED')
    assert.equal(latestMovement.rows[0].order_id, stockTestOrderId)
  })

  test('an already-CANCELLED order rejects any further status change, and does not restore stock again', async () => {
    const before = await pool.query('SELECT stock_quantity FROM inventory WHERE product_id = $1', [stockTestProductId])

    const response = await fetch(`${baseUrl}/api/orders/${stockTestOrderId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: cashierCookie }, body: JSON.stringify({ status: 'CONFIRMED' }) })
    assert.equal(response.status, 409)

    const after = await pool.query('SELECT stock_quantity FROM inventory WHERE product_id = $1', [stockTestProductId])
    assert.equal(after.rows[0].stock_quantity, before.rows[0].stock_quantity, 'a rejected transition must not move stock')

    // Attempting to cancel it a SECOND time is the scenario the terminal
    // check exists for — without it, this would credit the same 8 units
    // back again, inventing stock that was never actually returned.
    const secondCancel = await fetch(`${baseUrl}/api/orders/${stockTestOrderId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: cashierCookie }, body: JSON.stringify({ status: 'CANCELLED' }) })
    assert.equal(secondCancel.status, 409)
    const stillAfter = await pool.query('SELECT stock_quantity FROM inventory WHERE product_id = $1', [stockTestProductId])
    assert.equal(stillAfter.rows[0].stock_quantity, before.rows[0].stock_quantity, 'stock must not be credited twice')
  })

  test('a COMPLETED order also rejects any further status change', async () => {
    await pool.query('UPDATE inventory SET stock_quantity = 10 WHERE product_id = $1', [stockTestProductId])

    const createResponse = await fetch(`${baseUrl}/api/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: customerCookie }, body: JSON.stringify({ items: [{ productId: stockTestProductId, quantity: 2 }] }) })
    const orderId = (await createResponse.json()).order.id
    createdOrderIds.push(orderId)

    // Phase 6, Decision 7: COMPLETED now requires the order to be fully
    // paid — 2 units at ₱20 each, so ₱40 clears it. Recording that is
    // covered in depth by payments.test.js; here it's only a prerequisite
    // for reaching COMPLETED at all.
    const payResponse = await fetch(`${baseUrl}/api/payments`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cashierCookie }, body: JSON.stringify({ orderId, method: 'CASH', amount: 40 }) })
    assert.equal(payResponse.status, 201)

    const completeResponse = await fetch(`${baseUrl}/api/orders/${orderId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: cashierCookie }, body: JSON.stringify({ status: 'COMPLETED' }) })
    assert.equal(completeResponse.status, 200)

    const afterCompletion = await pool.query('SELECT stock_quantity FROM inventory WHERE product_id = $1', [stockTestProductId])
    assert.equal(afterCompletion.rows[0].stock_quantity, 8, 'COMPLETED must not restore stock — the order was fulfilled, not cancelled')

    const blockedResponse = await fetch(`${baseUrl}/api/orders/${orderId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: cashierCookie }, body: JSON.stringify({ status: 'CANCELLED' }) })
    assert.equal(blockedResponse.status, 409)

    const stillAfter = await pool.query('SELECT stock_quantity FROM inventory WHERE product_id = $1', [stockTestProductId])
    assert.equal(stillAfter.rows[0].stock_quantity, 8, 'a rejected cancel-after-COMPLETED must not restore stock')
  })

  // Phase 6, Decision 7. The companion "a COMPLETED order also rejects any
  // further status change" test above already proves the ALLOWED
  // direction implicitly (it would fail with something other than 200 if
  // this rule blocked it). This proves the REFUSED direction explicitly,
  // and — just as importantly — that a refused attempt leaves the order's
  // status completely unchanged: the balance check runs AFTER the claim
  // inside the same transaction, so a 409 here must roll the claim's own
  // status write back too, not just skip the stock/history side effects.
  test('COMPLETED is refused while a balance is still owed, and the order status is left untouched', async () => {
    await pool.query('UPDATE inventory SET stock_quantity = 10 WHERE product_id = $1', [stockTestProductId])

    const createResponse = await fetch(`${baseUrl}/api/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: customerCookie }, body: JSON.stringify({ items: [{ productId: stockTestProductId, quantity: 2 }] }) })
    const orderId = (await createResponse.json()).order.id
    createdOrderIds.push(orderId)

    // Total is ₱40; only ₱15 is paid, leaving a real balance.
    const payResponse = await fetch(`${baseUrl}/api/payments`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cashierCookie }, body: JSON.stringify({ orderId, method: 'CASH', amount: 15 }) })
    assert.equal(payResponse.status, 201)

    const completeResponse = await fetch(`${baseUrl}/api/orders/${orderId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: cashierCookie }, body: JSON.stringify({ status: 'COMPLETED' }) })
    assert.equal(completeResponse.status, 409)
    assert.match((await completeResponse.json()).message, /still owes/)

    const orderDetail = await fetch(`${baseUrl}/api/orders/${orderId}`, { headers: { Cookie: cashierCookie } }).then((response) => response.json())
    assert.equal(orderDetail.order.status, 'PLACED', 'a refused COMPLETED must not leave the order half-transitioned')
    assert.equal(orderDetail.order.payment.balanceDue, '25.00')

    const history = await pool.query(`SELECT COUNT(*)::int AS n FROM order_status_history WHERE order_id = $1 AND status = 'COMPLETED'`, [orderId])
    assert.equal(history.rows[0].n, 0, 'a refused transition must not leave a history row claiming it happened')
  })

  // Phase 6, Decision 8. Cancelling a PAID order is admin-only, because
  // cancelling it means the bakery owes that money back. This covers all
  // three roles against the SAME paid order: cashier and the customer
  // themselves are both refused, and only an admin's cancel is both
  // allowed AND actually refunds the payment (status, who, and when).
  test('cancelling a paid order is refused for cashier and customer, but an admin may cancel it and the payment is refunded', async () => {
    await pool.query('UPDATE inventory SET stock_quantity = 10 WHERE product_id = $1', [stockTestProductId])

    const createResponse = await fetch(`${baseUrl}/api/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: customerCookie }, body: JSON.stringify({ items: [{ productId: stockTestProductId, quantity: 2 }] }) })
    const orderId = (await createResponse.json()).order.id
    createdOrderIds.push(orderId)

    const payResponse = await fetch(`${baseUrl}/api/payments`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cashierCookie }, body: JSON.stringify({ orderId, method: 'CASH', amount: 40 }) })
    assert.equal(payResponse.status, 201)

    const cashierAttempt = await fetch(`${baseUrl}/api/orders/${orderId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: cashierCookie }, body: JSON.stringify({ status: 'CANCELLED' }) })
    assert.equal(cashierAttempt.status, 409)
    assert.match((await cashierAttempt.json()).message, /admin/)

    // The order is still PLACED (both attempts above must have been fully
    // rolled back), so the customer's OWN pre-transaction gate ("only from
    // PLACED") does not block this attempt before it even reaches the new
    // Decision 8 rule — this genuinely exercises the paid-order check, not
    // just the pre-existing status restriction.
    const customerAttempt = await fetch(`${baseUrl}/api/orders/${orderId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: customerCookie }, body: JSON.stringify({ status: 'CANCELLED' }) })
    assert.equal(customerAttempt.status, 409)
    assert.match((await customerAttempt.json()).message, /admin/)

    const beforeAdminCancel = await pool.query('SELECT stock_quantity FROM inventory WHERE product_id = $1', [stockTestProductId])

    const adminCancel = await fetch(`${baseUrl}/api/orders/${orderId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ status: 'CANCELLED', note: 'Customer changed their mind' }) })
    assert.equal(adminCancel.status, 200, 'an admin must be able to cancel a paid order')

    // Phase 5's stock restore must still work unmodified alongside the
    // new refund logic — Decision 8 adds a rule AROUND cancellation, not
    // a replacement for what it already does.
    const afterAdminCancel = await pool.query('SELECT stock_quantity FROM inventory WHERE product_id = $1', [stockTestProductId])
    assert.equal(afterAdminCancel.rows[0].stock_quantity, beforeAdminCancel.rows[0].stock_quantity + 2, 'cancelling must still restore the 2 units, exactly as in Phase 5')

    const orderDetail = await fetch(`${baseUrl}/api/orders/${orderId}`, { headers: { Cookie: adminCookie } }).then((response) => response.json())
    assert.equal(orderDetail.order.status, 'CANCELLED')
    assert.equal(orderDetail.order.payment.payments.length, 1)
    const [payment] = orderDetail.order.payment.payments
    assert.equal(payment.status, 'REFUNDED')
    assert.equal(payment.refundedByName, 'Order Test Admin')
    assert.ok(payment.refundedAt)
    assert.equal(payment.refundReason, 'Customer changed their mind')
  })

  test('two simultaneous orders racing for the last unit: exactly one succeeds, stock never goes negative', async () => {
    await pool.query('UPDATE inventory SET stock_quantity = 1 WHERE product_id = $1', [stockTestProductId])

    const placeOne = () => fetch(`${baseUrl}/api/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: customerCookie }, body: JSON.stringify({ items: [{ productId: stockTestProductId, quantity: 1 }] }) })
    const [first, second] = await Promise.all([placeOne(), placeOne()])
    const statuses = [first.status, second.status].sort()
    assert.deepEqual(statuses, [201, 409], 'exactly one of the two simultaneous orders should succeed')

    // Whichever one succeeded, record its id for cleanup.
    for (const response of [first, second]) {
      if (response.status === 201) createdOrderIds.push((await response.json()).order.id)
    }

    const { rows } = await pool.query('SELECT stock_quantity FROM inventory WHERE product_id = $1', [stockTestProductId])
    assert.equal(rows[0].stock_quantity, 0, 'stock must land at exactly 0, never negative')
  })

  // The mirror image of the race above, on the RESTORE side. Cancelling
  // serially is already covered ("cancelling an already-cancelled order"),
  // but that path is guarded by a status read taken outside the
  // transaction — so it only proves the uncontended case. Six cancels at
  // once previously all passed that read and all ran the restore loop,
  // crediting the same order's stock back six times and writing six
  // ORDER_CANCELLED rows for one order. The ledger still summed to
  // stock_quantity, so the invented units looked corroborated rather than
  // wrong. Fan-out is deliberately wider than 2 — the window is narrow
  // enough that two requests usually serialize by themselves.
  test('six simultaneous cancels of one order restore its stock exactly once', async () => {
    await pool.query('UPDATE inventory SET stock_quantity = 50 WHERE product_id = $1', [stockTestProductId])

    const createResponse = await fetch(`${baseUrl}/api/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: customerCookie }, body: JSON.stringify({ items: [{ productId: stockTestProductId, quantity: 4 }] }) })
    const orderId = (await createResponse.json()).order.id
    createdOrderIds.push(orderId)

    const deducted = await pool.query('SELECT stock_quantity FROM inventory WHERE product_id = $1', [stockTestProductId])
    assert.equal(deducted.rows[0].stock_quantity, 46)

    const statuses = await Promise.all(Array.from({ length: 6 }, () =>
      fetch(`${baseUrl}/api/orders/${orderId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: cashierCookie }, body: JSON.stringify({ status: 'CANCELLED' }) }).then((response) => response.status),
    ))
    assert.equal(statuses.filter((code) => code === 200).length, 1, 'exactly one cancel should win')
    assert.equal(statuses.filter((code) => code === 409).length, 5, 'the other five should be refused, not silently applied')

    const restored = await pool.query('SELECT stock_quantity FROM inventory WHERE product_id = $1', [stockTestProductId])
    assert.equal(restored.rows[0].stock_quantity, 50, 'stock must return to exactly what it was, with no units invented')

    const movements = await pool.query(`SELECT COUNT(*)::int AS n FROM inventory_movements WHERE order_id = $1 AND reason = 'ORDER_CANCELLED'`, [orderId])
    assert.equal(movements.rows[0].n, 1, 'one cancellation means exactly one ORDER_CANCELLED movement row')

    const history = await pool.query(`SELECT COUNT(*)::int AS n FROM order_status_history WHERE order_id = $1 AND status = 'CANCELLED'`, [orderId])
    assert.equal(history.rows[0].n, 1, 'a refused cancel must not leave a history row claiming it happened')

    // Every test in this suite shares one product. Restoring to 50 takes
    // stock back above its minimum, which RESOLVES whatever alert an
    // earlier test left open — and the alert test below asserts on the
    // exact row count. Clearing them here leaves that test the clean slate
    // it expects instead of a resolved row it has to account for.
    await pool.query('DELETE FROM stock_alerts WHERE inventory_id = (SELECT inventory_id FROM inventory WHERE product_id = $1)', [stockTestProductId])
  })

  // syncStockAlert itself is unit-tested thoroughly in lib/inventory.test.js
  // — this just confirms placing/cancelling an order actually WIRES INTO
  // it, the same way inventory.test.js confirms it for the direct-edit route.
  test('placing an order that drops stock to the minimum opens an alert; cancelling it resolves the alert', async () => {
    await pool.query('UPDATE inventory SET stock_quantity = 5, min_stock_level = 3 WHERE product_id = $1', [stockTestProductId])
    const inventoryId = (await pool.query('SELECT inventory_id FROM inventory WHERE product_id = $1', [stockTestProductId])).rows[0].inventory_id

    const orderResponse = await fetch(`${baseUrl}/api/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: customerCookie }, body: JSON.stringify({ items: [{ productId: stockTestProductId, quantity: 2 }] }) }) // 5 - 2 = 3, at the minimum
    assert.equal(orderResponse.status, 201)
    const orderId = (await orderResponse.json()).order.id
    createdOrderIds.push(orderId)

    const opened = await pool.query('SELECT is_resolved FROM stock_alerts WHERE inventory_id = $1', [inventoryId])
    assert.equal(opened.rows.length, 1)
    assert.equal(opened.rows[0].is_resolved, false)

    const cancelResponse = await fetch(`${baseUrl}/api/orders/${orderId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: cashierCookie }, body: JSON.stringify({ status: 'CANCELLED' }) })
    assert.equal(cancelResponse.status, 200)

    const resolved = await pool.query('SELECT is_resolved FROM stock_alerts WHERE inventory_id = $1', [inventoryId])
    assert.equal(resolved.rows[0].is_resolved, true)
  })

  test('routes reject delivery personnel entirely for now', async () => {
    const dpPasswordHash = await bcrypt.hash('Delivery-Password-9!', 4)
    const dpResult = await pool.query(`INSERT INTO users (username, password_hash, user_type) VALUES ($1, $2, 'DELIVERY_PERSONNEL') RETURNING user_id`, [`orderdp_${runId}`, dpPasswordHash])
    createdUserIds.push(dpResult.rows[0].user_id)
    await pool.query('INSERT INTO delivery_personnel (user_id, name, contact_num, email) VALUES ($1, $2, $3, $4)', [dpResult.rows[0].user_id, 'Order Test DP', randomContactNumber(), `orderdp_${runId}@example.com`])
    const login = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: `orderdp_${runId}`, password: 'Delivery-Password-9!' }) })
    const dpCookie = login.headers.get('set-cookie').split(';')[0]

    const response = await fetch(`${baseUrl}/api/orders`, { headers: { Cookie: dpCookie } })
    assert.equal(response.status, 403)
  })
})

after(async () => {
  await pool.end()
})
