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
  let categoryId
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
    await pool.query(`INSERT INTO otp_codes (user_id, code_hash, expires_at) VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '5 minutes')`, [adminResult.rows[0].user_id, crypto.createHash('sha256').update(rawCode).digest('hex')])
    const otpResponse = await fetch(`${baseUrl}/api/auth/verify-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: admin.username, code: rawCode }) })
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
    const secondCustomerRow = await pool.query('SELECT user_id, (SELECT customer_id FROM customers WHERE user_id = users.user_id) AS customer_id FROM users WHERE username = $1', [secondCustomer.username])
    createdUserIds.push(secondCustomerRow.rows[0].user_id)
    secondCustomerId = secondCustomerRow.rows[0].customer_id
    const secondCustomerLogin = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: secondCustomer.username, password: secondCustomer.password }) })
    secondCustomerCookie = secondCustomerLogin.headers.get('set-cookie').split(';')[0]

    await fetch(`${baseUrl}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...walkInCustomer, confirmPassword: walkInCustomer.password }) })
    const walkInRow = await pool.query('SELECT user_id FROM users WHERE username = $1', [walkInCustomer.username])
    createdUserIds.push(walkInRow.rows[0].user_id)

    const categoryResult = await pool.query('INSERT INTO categories (category_name) VALUES ($1) RETURNING category_id', [`Order Test Category ${runId}`])
    categoryId = categoryResult.rows[0].category_id

    const availableProduct = await fetch(`${baseUrl}/api/products`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ categoryId, name: `Order Test Bread ${runId}`, price: 45.5 }) })
    availableProductId = (await availableProduct.json()).product.id
    createdProductIds.push(availableProductId)

    const unavailableProduct = await fetch(`${baseUrl}/api/products`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ categoryId, name: `Order Test Discontinued ${runId}`, price: 30, availabilityStatus: false }) })
    unavailableProductId = (await unavailableProduct.json()).product.id
    createdProductIds.push(unavailableProductId)
  })

  after(async () => {
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

  test('POST /api/orders rejects delivery orders — not supported yet', async () => {
    const response = await fetch(`${baseUrl}/api/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: customerCookie }, body: JSON.stringify({ orderType: 'DELIVERY', items: [{ productId: availableProductId, quantity: 1 }] }) })
    assert.equal(response.status, 422)
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
