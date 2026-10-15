// Integration tests for the notification feed (NOTIFICATIONS_PLAN.md, N3).
// Same approach as the other route tests: real Express app on an ephemeral
// port, real database. Run with: npm test
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { after, before, beforeEach, describe, test } from 'node:test'
import bcrypt from 'bcrypt'
import app from '../app.js'
import { resetRateLimits } from '../lib/security.js'
import { pool } from '../db.js'

const runId = crypto.randomUUID().slice(0, 8)
const randomContactNumber = () => `09${Math.floor(100000000 + Math.random() * 899999999)}`

describe('notification feed', () => {
  beforeEach(resetRateLimits)

  let server
  let baseUrl
  let adminCookie
  let cashierCookie
  let customerCookie
  let firstDriverCookie
  let secondDriverCookie
  let firstDriverId
  let addressId
  let productId
  let categoryId
  const createdUserIds = []
  const createdOrderIds = []

  const admin = { username: `notifadmin_${runId}`, password: 'Admin-Only-Password-9!' }
  const cashier = { role: 'CASHIER', name: 'Notif Cashier', username: `notifcash_${runId}`, email: `notifcash_${runId}@example.com`, contactNumber: randomContactNumber(), password: 'Cashier-Password-9!' }
  const customer = { name: 'Notif Customer', username: `notifcust_${runId}`, email: `notifcust_${runId}@example.com`, contactNumber: randomContactNumber(), password: 'Correct-Horse-Battery-9!' }
  const firstDriver = { role: 'DELIVERY_PERSONNEL', name: 'Notif Driver One', username: `notifdp1_${runId}`, email: `notifdp1_${runId}@example.com`, contactNumber: randomContactNumber(), password: 'Driver-Password-9!' }
  const secondDriver = { role: 'DELIVERY_PERSONNEL', name: 'Notif Driver Two', username: `notifdp2_${runId}`, email: `notifdp2_${runId}@example.com`, contactNumber: randomContactNumber(), password: 'Driver-Password-9!' }

  const json = (method, path, cookie, body) => fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const feed = async (cookie, since) => {
    const response = await fetch(`${baseUrl}/api/notifications${since ? `?${new URLSearchParams({ since })}` : ''}`, { headers: { Cookie: cookie } })
    return { status: response.status, body: await response.json() }
  }
  const login = async (username, password) => (await json('POST', '/api/auth/login', '', { identifier: username, password })).headers.get('set-cookie').split(';')[0]

  const placeOrder = async ({ orderType = 'PICKUP', cookie = customerCookie } = {}) => {
    const response = await json('POST', '/api/orders', cookie, {
      orderType,
      ...(orderType === 'DELIVERY' && { addressId }),
      items: [{ productId, quantity: 1 }],
    })
    assert.equal(response.status, 201)
    const order = (await response.json()).order
    createdOrderIds.push(order.id)
    return order
  }
  // A paid, confirmed delivery order assigned to the first driver.
  const assignedDelivery = async () => {
    const order = await placeOrder({ orderType: 'DELIVERY' })
    assert.equal((await json('POST', '/api/payments', cashierCookie, { orderId: order.id, method: 'CASH', amount: order.totalAmount })).status, 201)
    assert.equal((await json('PATCH', `/api/orders/${order.id}`, cashierCookie, { status: 'CONFIRMED' })).status, 200)
    const delivery = (await pool.query('SELECT delivery_id FROM deliveries WHERE order_id = $1', [order.id])).rows[0].delivery_id
    assert.equal((await json('PATCH', `/api/deliveries/${delivery}/assign`, cashierCookie, { deliveryPersonnelId: firstDriverId })).status, 200)
    return { order, delivery }
  }
  const setStatus = (deliveryId, status, cookie, note) => json('PATCH', `/api/deliveries/${deliveryId}/status`, cookie, { status, note })
  const eventsFor = (body, orderId) => body.notifications.filter((event) => event.orderId === orderId)

  before(async () => {
    server = app.listen(0)
    await new Promise((resolve) => server.once('listening', resolve))
    baseUrl = `http://localhost:${server.address().port}`

    const adminResult = await pool.query(`INSERT INTO users (username, password_hash, user_type) VALUES ($1, $2, 'ADMIN') RETURNING user_id`, [admin.username, await bcrypt.hash(admin.password, 4)])
    createdUserIds.push(adminResult.rows[0].user_id)
    await pool.query('INSERT INTO admins (user_id, name, contact_num, email) VALUES ($1, $2, $3, $4)', [adminResult.rows[0].user_id, 'Notif Test Admin', randomContactNumber(), `notifadmin_${runId}@example.com`])
    await json('POST', '/api/auth/login', '', { identifier: admin.username, password: admin.password })
    const rawCode = '445566'
    const challengeToken = `test-challenge-${crypto.randomUUID()}`
    await pool.query(`INSERT INTO otp_codes (user_id, code_hash, challenge_token, expires_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP + INTERVAL '5 minutes')`, [adminResult.rows[0].user_id, crypto.createHash('sha256').update(rawCode).digest('hex'), challengeToken])
    adminCookie = (await json('POST', '/api/auth/verify-otp', '', { challengeToken, code: rawCode })).headers.get('set-cookie').split(';')[0]

    for (const person of [cashier, firstDriver, secondDriver]) {
      assert.equal((await json('POST', '/api/staff', adminCookie, { ...person, confirmPassword: person.password })).status, 201)
      createdUserIds.push((await pool.query('SELECT user_id FROM users WHERE username = $1', [person.username])).rows[0].user_id)
    }
    cashierCookie = await login(cashier.username, cashier.password)
    firstDriverCookie = await login(firstDriver.username, firstDriver.password)
    secondDriverCookie = await login(secondDriver.username, secondDriver.password)
    firstDriverId = (await pool.query('SELECT delivery_personnel_id FROM delivery_personnel dp JOIN users u ON u.user_id = dp.user_id WHERE u.username = $1', [firstDriver.username])).rows[0].delivery_personnel_id

    await json('POST', '/api/auth/register', '', { ...customer, confirmPassword: customer.password })
    await pool.query('UPDATE customers SET email_verified_at = CURRENT_TIMESTAMP WHERE user_id = (SELECT user_id FROM users WHERE username = $1)', [customer.username])
    const customerRow = await pool.query('SELECT user_id, (SELECT customer_id FROM customers WHERE user_id = users.user_id) AS customer_id FROM users WHERE username = $1', [customer.username])
    createdUserIds.push(customerRow.rows[0].user_id)
    customerCookie = await login(customer.username, customer.password)
    addressId = (await pool.query(
      `INSERT INTO customer_addresses (customer_id, recipient_name, contact_num, address_line_1, barangay, municipality, is_default)
       VALUES ($1, 'Notif Recipient', $2, '1 Bell St', 'Ayuti', 'Lucban', TRUE) RETURNING address_id`,
      [customerRow.rows[0].customer_id, randomContactNumber()],
    )).rows[0].address_id

    categoryId = (await pool.query('INSERT INTO categories (category_name) VALUES ($1) RETURNING category_id', [`Notif Test Category ${runId}`])).rows[0].category_id
    productId = (await (await json('POST', '/api/products', adminCookie, { categoryId, name: `Notif Test Bread ${runId}`, price: 40 })).json()).product.id
    await pool.query('UPDATE inventory SET stock_quantity = 1000 WHERE product_id = $1', [productId])
  })

  after(async () => {
    await pool.query('DELETE FROM deliveries WHERE order_id = ANY($1)', [createdOrderIds]).catch(() => {})
    await pool.query('DELETE FROM inventory_movements WHERE order_id = ANY($1)', [createdOrderIds]).catch(() => {})
    await pool.query('DELETE FROM payments WHERE order_id = ANY($1)', [createdOrderIds]).catch(() => {})
    await pool.query('DELETE FROM order_status_history WHERE order_id = ANY($1)', [createdOrderIds]).catch(() => {})
    await pool.query('DELETE FROM order_details WHERE order_id = ANY($1)', [createdOrderIds]).catch(() => {})
    await pool.query('DELETE FROM orders WHERE order_id = ANY($1)', [createdOrderIds]).catch(() => {})
    await pool.query('DELETE FROM inventory WHERE product_id = $1', [productId]).catch(() => {})
    await pool.query('DELETE FROM products WHERE product_id = $1', [productId]).catch(() => {})
    await pool.query('DELETE FROM categories WHERE category_id = $1', [categoryId]).catch(() => {})
    await pool.query('DELETE FROM customer_addresses WHERE address_id = $1', [addressId]).catch(() => {})
    for (const table of ['cashiers', 'customers', 'admins', 'delivery_personnel']) {
      await pool.query(`DELETE FROM ${table} WHERE user_id = ANY($1)`, [createdUserIds])
    }
    await pool.query('DELETE FROM users WHERE user_id = ANY($1)', [createdUserIds])
    await new Promise((resolve) => server.close(resolve))
  })

  test('requires sign-in, and refuses customers', async () => {
    assert.equal((await fetch(`${baseUrl}/api/notifications`)).status, 401)
    assert.equal((await feed(customerCookie)).status, 403)
  })

  test('an invalid since is 422', async () => {
    const { status, body } = await feed(adminCookie, 'not-a-time')
    assert.equal(status, 422)
    assert.ok(body.errors.since)
  })

  test('staff hear about a new order, with its daily number', async () => {
    const order = await placeOrder()
    const { status, body } = await feed(adminCookie)
    assert.equal(status, 200)
    const placed = eventsFor(body, order.id).find((event) => event.type === 'order_placed')
    assert.ok(placed, 'the new order is in the feed')
    assert.equal(placed.orderNumber, order.orderNumber)
    assert.equal(placed.customerName, customer.name)
    assert.equal(placed.key, `order_placed:${order.id}`)
  })

  test('since returns only newer events', async () => {
    const first = await placeOrder()
    const firstAt = eventsFor((await feed(adminCookie)).body, first.id)[0].at
    const second = await placeOrder()
    const { body } = await feed(adminCookie, firstAt)
    assert.equal(eventsFor(body, first.id).length, 0, 'not the one the caller already has')
    assert.ok(eventsFor(body, second.id).some((event) => event.type === 'order_placed'))
  })

  test('a delivery going out, arriving, or failing each reaches the staff once', async () => {
    const delivered = await assignedDelivery()
    assert.equal((await setStatus(delivered.delivery, 'OUT_FOR_DELIVERY', firstDriverCookie)).status, 200)
    assert.equal((await setStatus(delivered.delivery, 'DELIVERED', firstDriverCookie)).status, 200)

    const failed = await assignedDelivery()
    assert.equal((await setStatus(failed.delivery, 'OUT_FOR_DELIVERY', firstDriverCookie)).status, 200)
    assert.equal((await setStatus(failed.delivery, 'FAILED', firstDriverCookie, 'Gate locked\nNobody home')).status, 200)

    for (const cookie of [adminCookie, cashierCookie]) {
      const { body } = await feed(cookie)
      const forDelivered = eventsFor(body, delivered.order.id).map((event) => event.type)
      assert.equal(forDelivered.filter((type) => type === 'out_for_delivery').length, 1)
      assert.equal(forDelivered.filter((type) => type === 'delivered').length, 1)
      const arrival = eventsFor(body, delivered.order.id).find((event) => event.type === 'delivered')
      assert.equal(arrival.actorName, firstDriver.name)
      assert.equal(arrival.recipientName, 'Notif Recipient')
      assert.equal(arrival.barangay, 'Ayuti')

      const failure = eventsFor(body, failed.order.id).find((event) => event.type === 'delivery_failed')
      assert.ok(failure, 'the failure is in the feed')
      assert.equal(failure.note, 'Nobody home', "the driver's latest note only")
    }
  })

  test('a cashier is not told about the cancel they made; the admin is', async () => {
    const order = await placeOrder()
    assert.equal((await json('PATCH', `/api/orders/${order.id}`, cashierCookie, { status: 'CANCELLED', note: 'Customer changed their mind' })).status, 200)
    assert.equal(eventsFor((await feed(cashierCookie)).body, order.id).filter((event) => event.type === 'order_cancelled').length, 0)
    const cancel = eventsFor((await feed(adminCookie)).body, order.id).find((event) => event.type === 'order_cancelled')
    assert.ok(cancel)
    assert.equal(cancel.actorName, cashier.name)
    assert.equal(cancel.actorIsCustomer, false)
  })

  test('a walk-in order the cashier rang up is not news to that cashier', async () => {
    const order = await placeOrder({ cookie: cashierCookie })
    assert.equal(eventsFor((await feed(cashierCookie)).body, order.id).length, 0)
    assert.ok(eventsFor((await feed(adminCookie)).body, order.id).some((event) => event.type === 'order_placed'))
  })

  test('an online payment is news; a cash payment at the counter is not', async () => {
    const online = await placeOrder({ orderType: 'DELIVERY' })
    await pool.query(
      `INSERT INTO payments (order_id, payment_method, amount, status, gateway_reference, payment_date) VALUES ($1, 'GCASH', $2, 'PAID', $3, CURRENT_TIMESTAMP)`,
      [online.id, online.totalAmount, `notif_test_${runId}`],
    )
    const paid = eventsFor((await feed(cashierCookie)).body, online.id).find((event) => event.type === 'payment_received')
    assert.ok(paid)
    assert.equal(Number(paid.amount), Number(online.totalAmount))

    const cash = await placeOrder()
    assert.equal((await json('POST', '/api/payments', cashierCookie, { orderId: cash.id, method: 'CASH', amount: cash.totalAmount })).status, 201)
    assert.equal(eventsFor((await feed(adminCookie)).body, cash.id).filter((event) => event.type === 'payment_received').length, 0)
  })

  test('a driver hears only about deliveries assigned to them', async () => {
    const { order } = await assignedDelivery()
    const mine = await feed(firstDriverCookie)
    assert.equal(mine.status, 200)
    const assigned = eventsFor(mine.body, order.id)
    assert.equal(assigned.length, 1)
    assert.equal(assigned[0].type, 'assigned')
    assert.ok(mine.body.notifications.every((event) => event.type === 'assigned'), 'none of the staff events')

    const other = await feed(secondDriverCookie)
    assert.equal(eventsFor(other.body, order.id).length, 0, "never another driver's delivery")
  })
})

after(async () => {
  await pool.end()
})
