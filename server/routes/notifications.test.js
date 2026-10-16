// Integration tests for the notification feed (NOTIFICATIONS_PLAN.md, N3)
// and the emails sent when an order moves (N4, N5). Same approach as the
// other route tests: real Express app on an ephemeral port, real database.
// Google is never called: the email tests turn the Gmail API path on and
// replace globalThis.fetch for its two endpoints only, as lib/mail.test.js
// does, and read each message back. Run with: npm test
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { after, before, beforeEach, describe, test } from 'node:test'
import bcrypt from 'bcrypt'
import app from '../app.js'
import { resetRateLimits } from '../lib/security.js'
import { pool } from '../db.js'
import { config } from '../config.js'

const runId = crypto.randomUUID().slice(0, 8)

// The Gmail stand-in. `gmailFails` makes every send answer 500.
const sentMail = []
let gmailFails = false
const originalFetch = globalThis.fetch
globalThis.fetch = async (url, options) => {
  const href = String(url)
  if (href === 'https://oauth2.googleapis.com/token') return { ok: true, json: async () => ({ access_token: 'ya29.test', expires_in: 3600 }) }
  if (href === 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send') {
    if (gmailFails) return { ok: false, status: 500, json: async () => ({ error: { message: 'test failure' } }) }
    const raw = Buffer.from(JSON.parse(options.body).raw, 'base64url').toString('utf8')
    const [head, body] = raw.split('\r\n\r\n')
    const header = (name) => head.split('\r\n').find((line) => line.startsWith(`${name}: `))?.slice(name.length + 2) ?? ''
    const subject = header('Subject').replace(/^=\?UTF-8\?B\?(.*)\?=$/, (_, encoded) => Buffer.from(encoded, 'base64').toString('utf8'))
    sentMail.push({ to: header('To'), subject, text: Buffer.from(body.replace(/\r\n/g, ''), 'base64').toString('utf8') })
    return { ok: true, json: async () => ({ id: 'msg' }) }
  }
  return originalFetch(url, options)
}
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
  const customer = { name: 'Notif Customer', firstName: 'Notif', lastName: 'Customer', agree: true, username: `notifcust_${runId}`, email: `notifcust_${runId}@example.com`, contactNumber: randomContactNumber(), password: 'Correct-Horse-Battery-9!' }
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

  // Payment first: a customer's order is a hidden hold until it is paid; by
  // default it is paid at once (here at the counter), so it is a real,
  // announced order. { paid: false } leaves the hold. A cashier's walk-in is
  // paid as it is placed.
  const placeOrder = async ({ orderType = 'PICKUP', cookie = customerCookie, paid = true } = {}) => {
    const response = await json('POST', '/api/orders', cookie, {
      orderType,
      ...(orderType === 'DELIVERY' && { addressId }),
      ...(cookie === cashierCookie && { payment: { method: 'CASH' } }),
      items: [{ productId, quantity: 1 }],
    })
    assert.equal(response.status, 201)
    const order = (await response.json()).order
    createdOrderIds.push(order.id)
    if (paid && cookie !== cashierCookie) {
      assert.equal((await json('POST', '/api/payments', cashierCookie, { orderId: order.id, method: 'CASH', amount: order.totalAmount })).status, 201)
    }
    return order
  }
  // A paid delivery order (so ready for delivery) assigned to the first driver.
  const assignedDelivery = async () => {
    const order = await placeOrder({ orderType: 'DELIVERY' })
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

  // Payment first: a checkout still being paid is not an order yet, and one
  // let go unpaid never was — neither is news to anyone.
  test('an unpaid checkout, and one cancelled unpaid, are never news', async () => {
    const held = await placeOrder({ paid: false })
    assert.equal(eventsFor((await feed(adminCookie)).body, held.id).length, 0)
    assert.equal((await json('PATCH', `/api/orders/${held.id}`, customerCookie, { status: 'CANCELLED', note: 'Checkout cancelled by the customer.' })).status, 200)
    assert.equal(eventsFor((await feed(adminCookie)).body, held.id).length, 0)
  })

  test('a walk-in order the cashier rang up is not news to that cashier', async () => {
    const order = await placeOrder({ cookie: cashierCookie })
    assert.equal(eventsFor((await feed(cashierCookie)).body, order.id).length, 0)
    assert.ok(eventsFor((await feed(adminCookie)).body, order.id).some((event) => event.type === 'order_placed'))
  })

  // A normal online payment IS the new order (above). The one payment that
  // is news on its own: GCash money that arrived for a checkout already let
  // go — staff must settle it.
  test('a payment for an order already let go is news; an ordinary payment is not', async () => {
    const online = await placeOrder({ orderType: 'DELIVERY', paid: false })
    assert.equal((await json('PATCH', `/api/orders/${online.id}`, customerCookie, { status: 'CANCELLED', note: 'Checkout cancelled by the customer.' })).status, 200)
    await pool.query(
      `INSERT INTO payments (order_id, payment_method, amount, status, gateway_reference, payment_date) VALUES ($1, 'GCASH', $2, 'PAID', $3, CURRENT_TIMESTAMP)`,
      [online.id, online.totalAmount, `notif_test_${runId}`],
    )
    const paid = eventsFor((await feed(cashierCookie)).body, online.id).find((event) => event.type === 'payment_received')
    assert.ok(paid)
    assert.equal(Number(paid.amount), Number(online.totalAmount))

    const cash = await placeOrder()
    assert.equal(eventsFor((await feed(adminCookie)).body, cash.id).filter((event) => event.type === 'payment_received').length, 0)
  })

  // --- Emails (N4, N5) -------------------------------------------------
  // The routes send in the background, after answering, so the tests wait
  // a little for the message rather than expecting it on the response.
  const mailTo = (to, subjectPart) => sentMail.filter((mail) => mail.to === to && mail.subject.includes(subjectPart))
  const waitForMail = async (to, subjectPart) => {
    for (let tries = 0; tries < 100; tries += 1) {
      const found = mailTo(to, subjectPart)
      if (found.length) return found
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    return []
  }
  const settle = () => new Promise((resolve) => setTimeout(resolve, 300))
  const withGmail = async (run) => {
    const original = config.mail.gmail
    config.mail.gmail = { clientId: 'id', clientSecret: 'secret', refreshToken: 'refresh' }
    try { await run() } finally { config.mail.gmail = original; gmailFails = false }
  }

  test('assigning a delivery emails the driver, with the address and items', () => withGmail(async () => {
    const { order } = await assignedDelivery()
    const [mail] = await waitForMail(firstDriver.email, `New delivery #${order.orderNumber}`)
    assert.ok(mail, 'the driver got the email')
    assert.match(mail.text, /1 Bell St/)
    assert.match(mail.text, /Notif Recipient/)
    assert.match(mail.text, new RegExp(`Notif Test Bread ${runId} × 1`))
  }))

  test('the customer is emailed when the delivery leaves, arrives, or fails', () => withGmail(async () => {
    const delivered = await assignedDelivery()
    await setStatus(delivered.delivery, 'OUT_FOR_DELIVERY', firstDriverCookie)
    const [onTheWay] = await waitForMail(customer.email, `Your order #${delivered.order.orderNumber} is on the way`)
    assert.ok(onTheWay)
    assert.match(onTheWay.text, /Notif/, "names the rider")
    await setStatus(delivered.delivery, 'DELIVERED', firstDriverCookie)
    const [arrived] = await waitForMail(customer.email, `Your order #${delivered.order.orderNumber} was delivered`)
    assert.ok(arrived)
    assert.match(arrived.text, /If you did not receive this order, call us today/)
    assert.match(arrived.text, /1 Bell St/, 'says where it went')

    const failed = await assignedDelivery()
    await setStatus(failed.delivery, 'OUT_FOR_DELIVERY', firstDriverCookie)
    await setStatus(failed.delivery, 'FAILED', firstDriverCookie, 'Dog at the gate')
    const [failure] = await waitForMail(customer.email, `We could not deliver order #${failed.order.orderNumber}`)
    assert.ok(failure)
    assert.doesNotMatch(failure.text, /Dog at the gate/, "the driver's note stays internal")
  }))

  test('a ready pickup order emails its customer; a walk-in order emails no one', () => withGmail(async () => {
    // Payment first: the payment that places the order makes it ready, and
    // that is when the customer is told.
    const online = await placeOrder({ paid: false })
    assert.equal((await json('POST', '/api/payments', cashierCookie, { orderId: online.id, method: 'CASH', amount: online.totalAmount })).status, 201)
    const [ready] = await waitForMail(customer.email, `Your order #${online.orderNumber} is ready for pickup`)
    assert.ok(ready)
    assert.match(ready.text, /93 Quezon Avenue/)

    const before = sentMail.length
    await placeOrder({ cookie: cashierCookie })
    await settle()
    assert.equal(sentMail.length, before, 'no customer, no email')
  }))

  test('no email to an unconfirmed address, and none for a refused change', () => withGmail(async () => {
    const { order, delivery } = await assignedDelivery()
    await pool.query('UPDATE customers SET email_verified_at = NULL WHERE email = $1', [customer.email])
    try {
      assert.equal((await setStatus(delivery, 'OUT_FOR_DELIVERY', firstDriverCookie)).status, 200)
      await settle()
      assert.equal(mailTo(customer.email, `#${order.orderNumber} is on the way`).length, 0)
    } finally {
      await pool.query('UPDATE customers SET email_verified_at = CURRENT_TIMESTAMP WHERE email = $1', [customer.email])
    }

    // OUT_FOR_DELIVERY again: the wrong source state, refused with 409.
    const before = mailTo(customer.email, `#${order.orderNumber}`).length
    assert.equal((await setStatus(delivery, 'OUT_FOR_DELIVERY', firstDriverCookie)).status, 409)
    await settle()
    assert.equal(mailTo(customer.email, `#${order.orderNumber}`).length, before)
  }))

  test('an email that fails to send does not fail the change', () => withGmail(async () => {
    gmailFails = true
    const { order, delivery } = await assignedDelivery()
    const response = await setStatus(delivery, 'OUT_FOR_DELIVERY', firstDriverCookie)
    assert.equal(response.status, 200)
    const state = await pool.query('SELECT status FROM orders WHERE order_id = $1', [order.id])
    assert.equal(state.rows[0].status, 'OUT_FOR_DELIVERY')
    await settle()
  }))

  // The user, 2026-10-16: staff are told when a ready order is due within
  // the hour — once, from one hour before its time.
  test('a ready order due within the hour is announced; one due later is not yet', async () => {
    const soon = await placeOrder()
    const later = await placeOrder()
    await pool.query(`UPDATE orders SET requested_fulfillment_time = CURRENT_TIMESTAMP + INTERVAL '1 hour' WHERE order_id = $1`, [soon.id])
    await pool.query(`UPDATE orders SET requested_fulfillment_time = CURRENT_TIMESTAMP + INTERVAL '3 hours' WHERE order_id = $1`, [later.id])
    const { body } = await feed(cashierCookie)
    const due = eventsFor(body, soon.id).find((event) => event.type === 'due_soon')
    assert.ok(due, 'due within the hour')
    assert.ok(due.neededAt)
    assert.equal(eventsFor(body, later.id).filter((event) => event.type === 'due_soon').length, 0, 'not yet')
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
  globalThis.fetch = originalFetch
  await pool.end()
})
