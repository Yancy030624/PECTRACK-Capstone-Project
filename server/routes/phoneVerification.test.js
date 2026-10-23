// Texted phone codes, counter reservations and their receipt link
// (RULES-PLANS/RESERVE_SMS_PLAN.md). Real app on an ephemeral port, real
// database; texts land in lib/sms.js's test outbox. Run with: npm test
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { after, afterEach, before, beforeEach, describe, test } from 'node:test'
import bcrypt from 'bcrypt'
import app from '../app.js'
import { config } from '../config.js'
import { pool } from '../db.js'
import { resetRateLimits } from '../lib/security.js'
import { normalizePhone, smsOutbox } from '../lib/sms.js'

const runId = crypto.randomUUID().slice(0, 8)
const phonesUsed = []
const randomMobile = () => {
  const phone = `09${Math.floor(100000000 + Math.random() * 899999999)}`
  phonesUsed.push(phone)
  return phone
}
const codeIn = (message) => message.match(/\b(\d{6})\b/)[1]
const lastTextTo = (phone) => [...smsOutbox].reverse().find((text) => text.to === phone)

// Tomorrow at 10:00 AM, Manila: inside the ordering hours.
const tomorrowMorning = () => {
  const manilaToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date())
  const date = new Date(`${manilaToday}T10:00:00+08:00`)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString()
}

describe('phone codes and reservations', () => {
  beforeEach(resetRateLimits)
  // Codes are off under the test runner (config.js); these tests turn them on.
  beforeEach(() => { config.sms.verifyPhones = true })
  afterEach(() => { config.sms.verifyPhones = false })

  let server
  let baseUrl
  let cashierCookie
  let productId
  let categoryId
  const userIds = []
  const orderIds = []

  const post = (path, body, cookie) => fetch(`${baseUrl}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie && { Cookie: cookie }) }, body: JSON.stringify(body) })

  before(async () => {
    server = app.listen(0)
    await new Promise((resolve) => server.once('listening', resolve))
    baseUrl = `http://localhost:${server.address().port}`

    const cashier = { username: `smscash_${runId}`, password: 'Cashier-Password-9!' }
    const user = await pool.query(`INSERT INTO users (username, password_hash, user_type) VALUES ($1, $2, 'CASHIER') RETURNING user_id`, [cashier.username, await bcrypt.hash(cashier.password, 4)])
    userIds.push(user.rows[0].user_id)
    await pool.query('INSERT INTO cashiers (user_id, name, contact_num, email) VALUES ($1, $2, $3, $4)', [user.rows[0].user_id, 'SMS Cashier', randomMobile(), `smscash_${runId}@example.com`])
    const login = await post('/api/auth/login', { identifier: cashier.username, password: cashier.password })
    cashierCookie = login.headers.get('set-cookie').split(';')[0]

    categoryId = (await pool.query('INSERT INTO categories (category_name) VALUES ($1) RETURNING category_id', [`SMS Test ${runId}`])).rows[0].category_id
    productId = (await pool.query('INSERT INTO products (category_id, product_name, price) VALUES ($1, $2, 25) RETURNING product_id', [categoryId, `SMS Bread ${runId}`])).rows[0].product_id
    await pool.query('INSERT INTO inventory (product_id, stock_quantity) VALUES ($1, 500)', [productId])
  })

  after(async () => {
    await pool.query('DELETE FROM payments WHERE order_id = ANY($1)', [orderIds])
    await pool.query('DELETE FROM inventory_movements WHERE order_id = ANY($1)', [orderIds])
    await pool.query('DELETE FROM deliveries WHERE order_id = ANY($1)', [orderIds])
    await pool.query('DELETE FROM order_status_history WHERE order_id = ANY($1)', [orderIds])
    await pool.query('DELETE FROM order_details WHERE order_id = ANY($1)', [orderIds])
    await pool.query('DELETE FROM orders WHERE order_id = ANY($1)', [orderIds])
    await pool.query('DELETE FROM inventory_movements WHERE inventory_id IN (SELECT inventory_id FROM inventory WHERE product_id = $1)', [productId])
    await pool.query('DELETE FROM stock_alerts WHERE inventory_id IN (SELECT inventory_id FROM inventory WHERE product_id = $1)', [productId]).catch(() => {})
    await pool.query('DELETE FROM inventory WHERE product_id = $1', [productId])
    await pool.query('DELETE FROM products WHERE product_id = $1', [productId])
    await pool.query('DELETE FROM categories WHERE category_id = $1', [categoryId])
    await pool.query('DELETE FROM cashiers WHERE user_id = ANY($1)', [userIds])
    await pool.query('DELETE FROM customers WHERE user_id = ANY($1)', [userIds])
    await pool.query('DELETE FROM users WHERE user_id = ANY($1)', [userIds])
    await pool.query('DELETE FROM phone_verifications WHERE phone = ANY($1)', [phonesUsed])
    await new Promise((resolve) => server.close(resolve))
    await pool.end()
  })

  // Sends a code to `phone` and returns the token with the texted code.
  const sendCode = async (phone, purpose, cookie) => {
    const sent = await post('/api/phone-verification/send', { phone, purpose }, cookie)
    assert.equal(sent.status, 200, await sent.clone().text())
    const { verificationToken } = await sent.json()
    return { verificationToken, code: codeIn(lastTextTo(normalizePhone(phone)).message) }
  }

  test('a Philippine mobile number is normalised; anything else is refused', () => {
    assert.equal(normalizePhone('0917 123 4567'), '09171234567')
    assert.equal(normalizePhone('+63 917-123-4567'), '09171234567')
    assert.equal(normalizePhone('639171234567'), '09171234567')
    assert.equal(normalizePhone('042 540 1234'), null)
    assert.equal(normalizePhone('12345'), null)
  })

  test('status says whether codes are required', async () => {
    assert.deepEqual(await (await fetch(`${baseUrl}/api/phone-verification/status`)).json(), { required: true })
  })

  test('test mode shows the code on screen only while no SMS service is set up', async () => {
    const saved = config.sms.testMode
    try {
      config.sms.testMode = true
      const shown = await (await post('/api/phone-verification/send', { phone: randomMobile(), purpose: 'REGISTER' })).json()
      assert.match(shown.testCode, /^\d{6}$/)
      assert.match(shown.message, /Test mode/)
      config.sms.testMode = false
      const hidden = await (await post('/api/phone-verification/send', { phone: randomMobile(), purpose: 'REGISTER' })).json()
      assert.equal(hidden.testCode, undefined)
    } finally {
      config.sms.testMode = saved
    }
  })

  test('a code is texted, a wrong one is refused, the right one verifies', async () => {
    const phone = randomMobile()
    const { verificationToken, code } = await sendCode(phone, 'REGISTER')
    assert.equal(lastTextTo(phone).priority, true, 'codes go by the priority route')
    assert.ok(!lastTextTo(phone).message.startsWith('TEST'))

    const wrong = await post('/api/phone-verification/check', { verificationToken, code: code === '000000' ? '111111' : '000000' })
    assert.equal(wrong.status, 400)
    const right = await post('/api/phone-verification/check', { verificationToken, code })
    assert.equal(right.status, 200)
    assert.deepEqual(await right.json(), { verified: true, phone })
  })

  test('asking again within a minute is refused; five wrong codes lock the code', async () => {
    const phone = randomMobile()
    const { verificationToken, code } = await sendCode(phone, 'REGISTER')
    const again = await post('/api/phone-verification/send', { phone, purpose: 'REGISTER' })
    assert.equal(again.status, 429)
    const wrongCode = code === '000000' ? '111111' : '000000'
    for (let attempt = 0; attempt < 5; attempt += 1) await post('/api/phone-verification/check', { verificationToken, code: wrongCode })
    const locked = await post('/api/phone-verification/check', { verificationToken, code })
    assert.equal(locked.status, 429, 'even the right code is refused after five misses')
  })

  test('a landline or a number another account has gets no code', async () => {
    assert.equal((await post('/api/phone-verification/send', { phone: '042 540 1234', purpose: 'REGISTER' })).status, 422)
    const taken = randomMobile()
    const user = await pool.query(`INSERT INTO users (username, password_hash, user_type) VALUES ($1, 'x', 'CUSTOMER') RETURNING user_id`, [`smstaken_${runId}`])
    userIds.push(user.rows[0].user_id)
    await pool.query('INSERT INTO customers (user_id, first_name, last_name, contact_num, email) VALUES ($1, $2, $3, $4, $5)', [user.rows[0].user_id, 'Taken', 'Number', taken, `smstaken_${runId}@example.com`])
    assert.equal((await post('/api/phone-verification/send', { phone: taken, purpose: 'REGISTER' })).status, 409)
  })

  test('sign-up needs the number verified, and marks it verified', async () => {
    const phone = randomMobile()
    const account = { firstName: 'Phone', lastName: 'Tester', agree: true, username: `smsreg_${runId}`, email: `smsreg_${runId}@example.com`, contactNumber: phone, password: 'Correct-Horse-Battery-9!', confirmPassword: 'Correct-Horse-Battery-9!' }

    const unverified = await post('/api/auth/register', account)
    assert.equal(unverified.status, 422)
    assert.ok((await unverified.json()).errors.contactNumber)

    const { verificationToken, code } = await sendCode(phone, 'REGISTER')
    // Sent but not yet checked: still refused.
    assert.equal((await post('/api/auth/register', { ...account, phoneVerificationToken: verificationToken })).status, 422)
    await post('/api/phone-verification/check', { verificationToken, code })
    const created = await post('/api/auth/register', { ...account, phoneVerificationToken: verificationToken })
    assert.equal(created.status, 201)
    const row = await pool.query('SELECT c.user_id, c.contact_verified_at FROM customers c JOIN users u ON u.user_id = c.user_id WHERE u.username = $1', [account.username])
    userIds.push(row.rows[0].user_id)
    assert.ok(row.rows[0].contact_verified_at)

    // The token is spent: it cannot prove the number a second time.
    const reuse = await post('/api/auth/register', { ...account, username: `smsreg2_${runId}`, email: `smsreg2_${runId}@example.com`, phoneVerificationToken: verificationToken })
    assert.notEqual(reuse.status, 201)
  })

  test('only staff can send a reservation code', async () => {
    assert.equal((await post('/api/phone-verification/send', { phone: randomMobile(), purpose: 'RESERVE' })).status, 401)
  })

  test('a walk-in keeps the customer name, and the lists show it', async () => {
    const placed = await post('/api/orders', { customerName: 'Maria Walkin', items: [{ productId, quantity: 2 }], payment: { method: 'CASH' } }, cashierCookie)
    assert.equal(placed.status, 201)
    const { order } = await placed.json()
    orderIds.push(order.id)
    assert.equal(order.isReservation, false)
    const detail = await (await fetch(`${baseUrl}/api/orders/${order.id}`, { headers: { Cookie: cashierCookie } })).json()
    assert.equal(detail.order.customerName, 'Maria Walkin')
  })

  test('the cash handed over is kept, and the order shows the change', async () => {
    const placed = await post('/api/orders', { items: [{ productId, quantity: 1 }], payment: { method: 'CASH', cashReceived: 100 } }, cashierCookie)
    assert.equal(placed.status, 201)
    const { order } = await placed.json()
    orderIds.push(order.id)
    const detail = await (await fetch(`${baseUrl}/api/orders/${order.id}`, { headers: { Cookie: cashierCookie } })).json()
    const [payment] = detail.order.payment.payments
    assert.equal(Number(payment.amount), 25, 'the payment is the total')
    assert.equal(Number(payment.amountTendered), 100, 'the bill handed over')
    assert.equal(Number(payment.change), 75)

    const short = await post('/api/orders', { items: [{ productId, quantity: 1 }], payment: { method: 'CASH', cashReceived: 10 } }, cashierCookie)
    assert.equal(short.status, 422)
  })

  test('a reservation needs name, mobile, email, a pickup time and a verified number', async () => {
    const phone = randomMobile()
    const base = { customerName: 'Rosa Reserve', items: [{ productId, quantity: 3 }], payment: { method: 'CASH' }, requestedFulfillmentTime: tomorrowMorning() }

    const missing = await post('/api/orders', { ...base, customerName: '', requestedFulfillmentTime: undefined, reservation: { contactNumber: '123', email: 'nope' } }, cashierCookie)
    assert.equal(missing.status, 422)
    const { errors } = await missing.json()
    for (const field of ['customerName', 'contactNumber', 'email', 'requestedFulfillmentTime']) assert.ok(errors[field], field)

    const unverified = await post('/api/orders', { ...base, reservation: { contactNumber: phone, email: `rosa_${runId}@example.com` } }, cashierCookie)
    assert.equal(unverified.status, 422, 'no texted code, no reservation')

    const { verificationToken, code } = await sendCode(phone, 'RESERVE', cashierCookie)
    await post('/api/phone-verification/check', { verificationToken, code })
    const placed = await post('/api/orders', { ...base, reservation: { contactNumber: phone, email: `rosa_${runId}@example.com`, phoneVerificationToken: verificationToken } }, cashierCookie)
    assert.equal(placed.status, 201, await placed.clone().text())
    const { order } = await placed.json()
    orderIds.push(order.id)
    assert.equal(order.isReservation, true)
    assert.equal(order.status, 'READY_FOR_PICKUP')
    assert.match(order.receiptUrl, /\/r\/[A-Za-z0-9_-]{20,}$/)

    // The order number goes by SMS, in one short text with no link.
    let text
    for (let wait = 0; wait < 50 && !text; wait += 1) {
      text = smsOutbox.find((sms) => sms.to === phone && sms.message.includes(`#${order.id}`))
      if (!text) await new Promise((resolve) => setTimeout(resolve, 20))
    }
    assert.ok(text, 'the order number was texted')
    assert.ok(text.message.length <= 160, `one SMS: ${text.message.length} characters`)
    assert.ok(!/https?:/.test(text.message))

    const detail = await (await fetch(`${baseUrl}/api/orders/${order.id}`, { headers: { Cookie: cashierCookie } })).json()
    assert.equal(detail.order.isReservation, true)
    assert.equal(detail.order.guestContact, phone)
    assert.equal(detail.order.guestContactVerified, true)

    // The receipt link opens without signing in and shows no contact details.
    const token = order.receiptUrl.split('/r/')[1]
    const receipt = await fetch(`${baseUrl}/api/receipts/${token}`)
    assert.equal(receipt.status, 200)
    const body = (await receipt.json()).receipt
    assert.equal(body.orderNumber, order.id)
    assert.equal(body.firstName, 'Rosa')
    assert.equal(Number(body.amountPaid), 75)
    assert.equal(body.items.length, 1)
    assert.ok(!JSON.stringify(body).includes(phone))
    assert.equal((await fetch(`${baseUrl}/api/receipts/${'x'.repeat(32)}`)).status, 404)
  })

  test('an advanced order needs no email', async () => {
    config.sms.verifyPhones = false
    const placed = await post('/api/orders', { customerName: 'Nora Noemail', items: [{ productId, quantity: 1 }], payment: { method: 'CASH' }, requestedFulfillmentTime: tomorrowMorning(), reservation: { contactNumber: randomMobile() } }, cashierCookie)
    assert.equal(placed.status, 201, await placed.clone().text())
    const { order, message } = await placed.json()
    orderIds.push(order.id)
    assert.match(message, /SMS/)
    assert.doesNotMatch(message, /email/)
  })

  test('with codes off, a reservation is taken without one', async () => {
    config.sms.verifyPhones = false
    const placed = await post('/api/orders', { customerName: 'Nena Nocode', items: [{ productId, quantity: 1 }], payment: { method: 'CASH' }, requestedFulfillmentTime: tomorrowMorning(), reservation: { contactNumber: randomMobile(), email: `nena_${runId}@example.com` } }, cashierCookie)
    assert.equal(placed.status, 201)
    orderIds.push((await placed.json()).order.id)
  })
})
