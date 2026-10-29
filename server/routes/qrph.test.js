// QR Ph payments (RULES-PLANS/QRPH_PLAN.md). Real Express app on an
// ephemeral port, real database, like the rest of the suite.
// Run with: npm test
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { after, before, beforeEach, describe, test } from 'node:test'
import bcrypt from 'bcrypt'
import app from '../app.js'
import { resetRateLimits } from '../lib/security.js'
import { cancelUnpaidOrders } from '../lib/staleOrders.js'
import { pool } from '../db.js'

const runId = crypto.randomUUID().slice(0, 8)
const randomContactNumber = () => `09${Math.floor(100000000 + Math.random() * 899999999)}`
const reference = (label) => `QR${runId}${label}`.toUpperCase()
// The smallest valid PNG header is enough: the server checks the declared
// type and that bytes arrived, not the picture.
const pngBytes = (seed) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from(seed)])

describe('QR Ph payments', () => {
  beforeEach(resetRateLimits)

  let server
  let baseUrl
  let adminCookie
  let cashierCookie
  let customerCookie
  let otherCustomerCookie
  let categoryId
  let productId
  let savedSettings = []
  const createdUserIds = []
  const createdOrderIds = []

  const admin = { username: `qrtest_admin_${runId}`, password: 'Admin-Only-Password-9!' }
  const cashier = { role: 'CASHIER', name: 'QR Test Cashier', username: `qrtest_cash_${runId}`, email: `qrtest_cash_${runId}@example.com`, contactNumber: randomContactNumber(), password: 'Cashier-Password-9!' }
  const makeCustomer = (tag) => ({ name: `QR Test ${tag}`, firstName: 'QR Test', lastName: tag, agree: true, username: `qrtest_${tag}_${runId}`, email: `qrtest_${tag}_${runId}@example.com`, contactNumber: randomContactNumber(), password: 'Correct-Horse-Battery-9!' })

  const json = (method, path, cookie, body) => fetch(`${baseUrl}${path}`, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) })
  const upload = (path, cookie, bytes, type = 'image/png', method = 'POST') => fetch(`${baseUrl}${path}`, { method, headers: { 'Content-Type': type, Cookie: cookie }, body: bytes })

  const signUpCustomer = async (person) => {
    await json('POST', '/api/auth/register', undefined, { ...person, confirmPassword: person.password })
    await pool.query('UPDATE customers SET email_verified_at = CURRENT_TIMESTAMP WHERE user_id = (SELECT user_id FROM users WHERE username = $1)', [person.username])
    createdUserIds.push((await pool.query('SELECT user_id FROM users WHERE username = $1', [person.username])).rows[0].user_id)
    const login = await json('POST', '/api/auth/login', undefined, { identifier: person.username, password: person.password })
    return login.headers.get('set-cookie').split(';')[0]
  }

  const stock = async () => Number((await pool.query('SELECT stock_quantity FROM inventory WHERE product_id = $1', [productId])).rows[0].stock_quantity)
  const orderRow = async (orderId) => (await pool.query('SELECT status, payment_mode FROM orders WHERE order_id = $1', [orderId])).rows[0]
  const paymentRow = async (paymentId) => (await pool.query('SELECT * FROM payments WHERE payment_id = $1', [paymentId])).rows[0]

  // An online checkout: today's 15-minute hold, paid with QR Ph.
  const checkout = async (quantity = 2, cookie = customerCookie) => {
    const response = await json('POST', '/api/orders', cookie, { items: [{ productId, quantity }], paymentMode: 'QRPH' })
    const body = await response.json()
    assert.equal(response.status, 201, body.message)
    createdOrderIds.push(body.order.id)
    return body.order
  }
  const sendReference = (orderId, ref, cookie = customerCookie) => json('POST', '/api/qrph', cookie, { orderId, reference: ref })
  const verify = (paymentId, body, cookie = cashierCookie) => json('POST', `/api/qrph/payments/${paymentId}/verify`, cookie, body)

  before(async () => {
    server = app.listen(0)
    await new Promise((resolve) => server.once('listening', resolve))
    baseUrl = `http://localhost:${server.address().port}`
    savedSettings = (await pool.query(`SELECT key, value, data, updated_by FROM app_settings WHERE key LIKE 'qrph_%'`)).rows

    const adminId = (await pool.query(`INSERT INTO users (username, password_hash, user_type) VALUES ($1, $2, 'ADMIN') RETURNING user_id`, [admin.username, await bcrypt.hash(admin.password, 4)])).rows[0].user_id
    createdUserIds.push(adminId)
    await pool.query('INSERT INTO admins (user_id, name, contact_num, email) VALUES ($1, $2, $3, $4)', [adminId, 'QR Test Admin', randomContactNumber(), `qrtest_admin_${runId}@example.com`])
    await json('POST', '/api/auth/login', undefined, { identifier: admin.username, password: admin.password })
    const rawCode = '112233'
    const challengeToken = `test-challenge-${crypto.randomUUID()}`
    await pool.query(`INSERT INTO otp_codes (user_id, code_hash, challenge_token, expires_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP + INTERVAL '5 minutes')`, [adminId, crypto.createHash('sha256').update(rawCode).digest('hex'), challengeToken])
    adminCookie = (await json('POST', '/api/auth/verify-otp', undefined, { challengeToken, code: rawCode })).headers.get('set-cookie').split(';')[0]

    assert.equal((await json('POST', '/api/staff', adminCookie, { ...cashier, confirmPassword: cashier.password })).status, 201)
    createdUserIds.push((await pool.query('SELECT user_id FROM users WHERE username = $1', [cashier.username])).rows[0].user_id)
    cashierCookie = (await json('POST', '/api/auth/login', undefined, { identifier: cashier.username, password: cashier.password })).headers.get('set-cookie').split(';')[0]

    customerCookie = await signUpCustomer(makeCustomer('cust'))
    otherCustomerCookie = await signUpCustomer(makeCustomer('other'))

    categoryId = (await pool.query('INSERT INTO categories (category_name) VALUES ($1) RETURNING category_id', [`QR Test Category ${runId}`])).rows[0].category_id
    const product = await json('POST', '/api/products', adminCookie, { categoryId, name: `QR Test Loaf ${runId}`, price: 100 })
    productId = (await product.json()).product.id
    await pool.query('UPDATE inventory SET stock_quantity = 1000 WHERE product_id = $1', [productId])
  })

  after(async () => {
    await pool.query(`DELETE FROM app_settings WHERE key LIKE 'qrph_%'`)
    for (const row of savedSettings) await pool.query('INSERT INTO app_settings (key, value, data, updated_by) VALUES ($1, $2, $3, $4)', [row.key, row.value, row.data, row.updated_by])

    await pool.query('DELETE FROM payments WHERE order_id = ANY($1)', [createdOrderIds])
    await pool.query('DELETE FROM inventory_movements WHERE order_id = ANY($1)', [createdOrderIds])
    await pool.query('DELETE FROM deliveries WHERE order_id = ANY($1)', [createdOrderIds])
    await pool.query('DELETE FROM order_status_history WHERE order_id = ANY($1)', [createdOrderIds])
    await pool.query('DELETE FROM order_details WHERE order_id = ANY($1)', [createdOrderIds])
    await pool.query('DELETE FROM orders WHERE order_id = ANY($1)', [createdOrderIds])
    await pool.query('DELETE FROM stock_alerts WHERE inventory_id IN (SELECT inventory_id FROM inventory WHERE product_id = $1)', [productId]).catch(() => {})
    await pool.query('DELETE FROM inventory WHERE product_id = $1', [productId])
    await pool.query('DELETE FROM products WHERE product_id = $1', [productId])
    await pool.query('DELETE FROM categories WHERE category_id = $1', [categoryId])
    await pool.query('DELETE FROM otp_codes WHERE user_id = ANY($1)', [createdUserIds])
    await pool.query('DELETE FROM sessions WHERE user_id = ANY($1)', [createdUserIds])
    await pool.query('DELETE FROM security_events WHERE user_id = ANY($1)', [createdUserIds]).catch(() => {})
    for (const table of ['admins', 'cashiers', 'customers']) await pool.query(`DELETE FROM ${table} WHERE user_id = ANY($1)`, [createdUserIds]).catch(() => {})
    await pool.query('DELETE FROM users WHERE user_id = ANY($1)', [createdUserIds]).catch(() => {})
    await new Promise((resolve) => server.close(resolve))
    await pool.end()
  })

  test('the admin sets the bakery QR code and account name; nobody else can', async () => {
    await pool.query(`DELETE FROM app_settings WHERE key LIKE 'qrph_%'`)
    const empty = await (await json('GET', '/api/qrph', customerCookie)).json()
    assert.equal(empty.configured, false)
    assert.equal(empty.imageUrl, null)

    assert.equal((await upload('/api/qrph/image', cashierCookie, pngBytes('x'), 'image/png', 'PUT')).status, 403)
    assert.equal((await upload('/api/qrph/image', adminCookie, Buffer.from('GIF89a'), 'image/gif', 'PUT')).status, 422)
    assert.equal((await upload('/api/qrph/image', adminCookie, pngBytes(`code-${runId}`), 'image/png', 'PUT')).status, 200)
    assert.equal((await json('PATCH', '/api/qrph', cashierCookie, { accountName: 'Someone' })).status, 403)
    assert.equal((await json('PATCH', '/api/qrph', adminCookie, { accountName: '' })).status, 422)
    assert.equal((await json('PATCH', '/api/qrph', adminCookie, { accountName: "Pecto's Bakery" })).status, 200)

    const settings = await (await json('GET', '/api/qrph', customerCookie)).json()
    assert.equal(settings.configured, true)
    assert.equal(settings.accountName, "Pecto's Bakery")
    const image = await fetch(`${baseUrl}${settings.imageUrl}`, { headers: { Cookie: customerCookie } })
    assert.equal(image.status, 200)
    assert.deepEqual(Buffer.from(await image.arrayBuffer()), pngBytes(`code-${runId}`))
  })

  test('a checkout paid with QR Ph is a hold whose order is saved as paid-before-release', async () => {
    const order = await checkout()
    const row = await orderRow(order.id)
    assert.equal(row.status, 'AWAITING_PAYMENT')
    assert.equal(row.payment_mode, 'GCASH')
  })

  test('the customer sends a reference number for the full amount; bad ones are refused', async () => {
    const order = await checkout(3)
    assert.equal((await sendReference(order.id, 'ab')).status, 422)
    assert.equal((await sendReference(order.id, 'has space!')).status, 422)
    assert.equal((await sendReference(order.id, reference('own'), otherCustomerCookie)).status, 404)
    assert.equal((await json('POST', '/api/qrph', cashierCookie, { orderId: order.id, reference: reference('staff') })).status, 403)

    const sent = await sendReference(order.id, ` ${reference('first').slice(0, 6)} ${reference('first').slice(6)} `)
    assert.equal(sent.status, 201)
    const payment = await paymentRow((await sent.json()).paymentId)
    assert.equal(payment.payment_method, 'QRPH')
    assert.equal(payment.status, 'PENDING')
    assert.equal(payment.gateway_reference, reference('first'))
    assert.equal(Number(payment.amount), 300)

    const again = await sendReference(order.id, reference('second'))
    assert.equal(again.status, 409)
    assert.match((await again.json()).message, /already sent/)
  })

  test('a reference number can be used only once', async () => {
    const first = await checkout(1)
    const second = await checkout(1)
    assert.equal((await sendReference(first.id, reference('once'))).status, 201)
    const reused = await sendReference(second.id, reference('once'))
    assert.equal(reused.status, 409)
    assert.match((await reused.json()).errors.reference, /already used/)
  })

  test('a hold with a reference sent is never released by the system', async () => {
    const order = await checkout(1)
    assert.equal((await sendReference(order.id, reference('kept'))).status, 201)
    await pool.query(`UPDATE orders SET order_date = CURRENT_TIMESTAMP - INTERVAL '2 hours' WHERE order_id = $1`, [order.id])
    const result = await cancelUnpaidOrders({ onlyOrderIds: [order.id] })
    assert.equal(result.kept, 1)
    assert.equal((await orderRow(order.id)).status, 'AWAITING_PAYMENT')

    const unsent = await checkout(1)
    await pool.query(`UPDATE orders SET order_date = CURRENT_TIMESTAMP - INTERVAL '2 hours' WHERE order_id = $1`, [unsent.id])
    await cancelUnpaidOrders({ onlyOrderIds: [unsent.id] })
    assert.equal((await orderRow(unsent.id)).status, 'CANCELLED')
  })

  test('staff see payments to confirm, oldest first, with an overdue flag', async () => {
    const order = await checkout(1)
    const sent = await sendReference(order.id, reference('list'))
    const paymentId = (await sent.json()).paymentId
    // The bell first, while it is the newest news: suites running alongside
    // fill the feed's limit with newer events once it is backdated.
    const since = new Date(Date.now() - 60000).toISOString()
    const feed = await (await json('GET', `/api/notifications?since=${encodeURIComponent(since)}`, cashierCookie)).json()
    assert.ok(feed.notifications.some((event) => event.type === 'payment_to_confirm' && event.orderId === order.id))
    await pool.query(`UPDATE payments SET created_at = CURRENT_TIMESTAMP - INTERVAL '45 minutes' WHERE payment_id = $1`, [paymentId])

    assert.equal((await json('GET', '/api/qrph/to-confirm', customerCookie)).status, 403)
    const list = await (await json('GET', '/api/qrph/to-confirm', cashierCookie)).json()
    const mine = list.payments.find((payment) => payment.id === paymentId)
    assert.ok(mine)
    assert.equal(mine.reference, reference('list'))
    assert.equal(mine.overdue, true)
    assert.equal(Number(mine.amount), 100)

    const summary = await (await json('GET', '/api/reports/summary', cashierCookie)).json()
    assert.ok(summary.paymentsToConfirm >= 1)
    assert.ok(summary.paymentsOverdue >= 1)
  })

  test('the customer may attach a screenshot, which only staff can see', async () => {
    const order = await checkout(1)
    const paymentId = (await (await sendReference(order.id, reference('proof'))).json()).paymentId
    assert.equal((await upload(`/api/qrph/payments/${paymentId}/proof`, otherCustomerCookie, pngBytes('nope'))).status, 404)
    assert.equal((await upload(`/api/qrph/payments/${paymentId}/proof`, customerCookie, Buffer.from('text'), 'text/plain')).status, 422)
    assert.equal((await upload(`/api/qrph/payments/${paymentId}/proof`, customerCookie, pngBytes(`shot-${runId}`))).status, 201)

    assert.equal((await fetch(`${baseUrl}/api/qrph/payments/${paymentId}/proof`, { headers: { Cookie: customerCookie } })).status, 403)
    const seen = await fetch(`${baseUrl}/api/qrph/payments/${paymentId}/proof`, { headers: { Cookie: cashierCookie } })
    assert.equal(seen.status, 200)
    assert.deepEqual(Buffer.from(await seen.arrayBuffer()), pngBytes(`shot-${runId}`))
  })

  test('confirming marks the payment paid, by whom, and makes the order ready once', async () => {
    const order = await checkout(2)
    const paymentId = (await (await sendReference(order.id, reference('confirm'))).json()).paymentId
    assert.equal((await verify(paymentId, { decision: 'CONFIRM' }, customerCookie)).status, 403)
    assert.equal((await verify(paymentId, { decision: 'maybe' })).status, 422)

    const confirmed = await verify(paymentId, { decision: 'CONFIRM' })
    assert.equal(confirmed.status, 200)
    assert.equal((await confirmed.json()).orderStatus, 'READY_FOR_PICKUP')
    const payment = await paymentRow(paymentId)
    assert.equal(payment.status, 'PAID')
    assert.ok(payment.verified_by)
    assert.ok(payment.verified_at)
    assert.ok(payment.payment_date)
    assert.equal((await orderRow(order.id)).status, 'READY_FOR_PICKUP')

    assert.equal((await verify(paymentId, { decision: 'REJECT', reason: 'Too late' })).status, 409)
    const list = await (await json('GET', '/api/qrph/to-confirm', cashierCookie)).json()
    assert.ok(!list.payments.some((entry) => entry.id === paymentId))
  })

  test('rejecting needs a reason, cancels the hold and returns its stock', async () => {
    const before = await stock()
    const order = await checkout(4)
    assert.equal(await stock(), before - 4)
    const paymentId = (await (await sendReference(order.id, reference('reject'))).json()).paymentId

    assert.equal((await verify(paymentId, { decision: 'REJECT' })).status, 422)
    const rejected = await verify(paymentId, { decision: 'REJECT', reason: 'No payment with this reference number' })
    assert.equal(rejected.status, 200)
    assert.equal((await rejected.json()).orderStatus, 'CANCELLED')
    const payment = await paymentRow(paymentId)
    assert.equal(payment.status, 'FAILED')
    assert.equal(payment.rejected_reason, 'No payment with this reference number')
    assert.equal((await orderRow(order.id)).status, 'CANCELLED')
    assert.equal(await stock(), before)
    const note = await pool.query(`SELECT note FROM order_status_history WHERE order_id = $1 AND status = 'CANCELLED'`, [order.id])
    assert.match(note.rows[0].note, /No payment with this reference number/)

    // Rejected references stay taken: the same one cannot be sent again.
    const retry = await checkout(1)
    assert.equal((await sendReference(retry.id, reference('reject'))).status, 409)
  })

  test('the counter takes a QR Ph scan by its reference number', async () => {
    const response = await json('POST', '/api/orders', cashierCookie, { items: [{ productId, quantity: 1 }], payment: { method: 'QRPH', gatewayReference: reference('counter') } })
    const body = await response.json()
    assert.equal(response.status, 201, body.message)
    createdOrderIds.push(body.order.id)
    const payment = await pool.query('SELECT payment_method, status, gateway_reference FROM payments WHERE order_id = $1', [body.order.id])
    assert.deepEqual(payment.rows[0], { payment_method: 'QRPH', status: 'PAID', gateway_reference: reference('counter') })
    assert.equal((await orderRow(body.order.id)).payment_mode, 'GCASH')

    const missing = await json('POST', '/api/orders', cashierCookie, { items: [{ productId, quantity: 1 }], payment: { method: 'QRPH' } })
    assert.equal(missing.status, 422)
  })
})
