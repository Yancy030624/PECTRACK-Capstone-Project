// Integration tests for Phase 8 reporting (see PHASE8_PLAN.md). Same
// approach as the other route tests: real Express app on an ephemeral
// port, real database. Run with: npm test
//
// Report routes have no customer/order scoping — they read the WHOLE
// business's orders and payments for a date range — so every test here
// pins its data to a controlled, arbitrary HISTORICAL date well away from
// "today" (which is where every OTHER test file's orders naturally land,
// since none of them touch order_date/payment_date) and well away from
// any date another test in THIS file uses. Rows are created through the
// real API, then their date columns are moved with a direct UPDATE — the
// API has no way to backdate a timestamp, and cleanup tracks exact ids
// rather than a date range, so a run that leaves rows behind can never
// corrupt a later run's totals.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { after, before, describe, test } from 'node:test'
import bcrypt from 'bcrypt'
import app from '../app.js'
import { pool } from '../db.js'

const runId = crypto.randomUUID().slice(0, 8)
const randomContactNumber = () => `09${Math.floor(100000000 + Math.random() * 899999999)}`

describe('reporting & analytics', () => {
  let server
  let baseUrl
  let adminCookie
  let cashierCookie
  let customerCookie
  let driverCookie
  let adminUserId
  let categoryId
  let productId // price exactly 100.00, so every order here totals a round number
  let customerAddressId
  const createdUserIds = []
  const createdProductIds = []
  const createdOrderIds = []
  // Extra categories created by individual tests below (the formula-
  // injection test, and GET /api/reports/inventory's own fixture) — kept
  // separate from the single `categoryId` the top-level before() creates,
  // and cleaned up the same way: after every product referencing them,
  // never before (categories.category_id is a foreign key products.
  // category_id points at).
  const createdCategoryIds = []

  const admin = { username: `repadmin_${runId}`, password: 'Admin-Only-Password-9!' }
  const cashier = { role: 'CASHIER', name: 'Report Cashier', username: `repcash_${runId}`, email: `repcash_${runId}@example.com`, contactNumber: randomContactNumber(), password: 'Cashier-Password-9!' }
  const customer = { name: 'Report Customer', username: `repcust_${runId}`, email: `repcust_${runId}@example.com`, contactNumber: randomContactNumber(), password: 'Correct-Horse-Battery-9!' }
  const driver = { role: 'DELIVERY_PERSONNEL', name: 'Report Driver', username: `repdrv_${runId}`, email: `repdrv_${runId}@example.com`, contactNumber: randomContactNumber(), password: 'Driver-Password-9!' }

  // Places a ₱100.00 order (1 unit of the fixed-price test product) as the
  // test customer, then moves its order_date to the given instant — a
  // direct UPDATE, since nothing in the API lets a caller backdate an
  // order. Returns the order id.
  const placeOrderAt = async (instant) => {
    const response = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: customerCookie },
      body: JSON.stringify({ items: [{ productId, quantity: 1 }] }),
    })
    const body = await response.json()
    assert.equal(response.status, 201, `order placement must succeed: ${JSON.stringify(body)}`)
    createdOrderIds.push(body.order.id)
    await pool.query('UPDATE orders SET order_date = $1 WHERE order_id = $2', [instant, body.order.id])
    return body.order.id
  }

  const cancelOrder = (orderId) =>
    fetch(`${baseUrl}/api/orders/${orderId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ status: 'CANCELLED' }) })

  // Records a full ₱100.00 cash payment against an order, then moves its
  // payment_date to the given instant. Returns the payment id.
  const payInFullAt = async (orderId, instant) => {
    const response = await fetch(`${baseUrl}/api/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cashierCookie },
      body: JSON.stringify({ orderId, method: 'CASH', amount: 100 }),
    })
    const body = await response.json()
    assert.equal(response.status, 201, `payment must succeed: ${JSON.stringify(body)}`)
    await pool.query('UPDATE payments SET payment_date = $1 WHERE payment_id = $2', [instant, body.payment.id])
    return body.payment.id
  }

  // Flips an existing PAID payment to REFUNDED at a controlled instant —
  // direct SQL, not the real cancel-and-refund workflow (PHASE6_PLAN.md,
  // Decision 8), because that transition is orders.test.js's job to prove
  // correct. This file only needs a REFUNDED row with a known refunded_at
  // to prove the report reads it right.
  const refundAt = (paymentId, instant) =>
    pool.query(`UPDATE payments SET status = 'REFUNDED', refunded_at = $1, refunded_by = $2, refund_reason = 'test refund' WHERE payment_id = $3`, [instant, adminUserId, paymentId])

  const getSales = (query, cookie = adminCookie) => fetch(`${baseUrl}/api/reports/sales?${new URLSearchParams(query)}`, { headers: { Cookie: cookie } })

  before(async () => {
    server = app.listen(0)
    await new Promise((resolve) => server.once('listening', resolve))
    baseUrl = `http://localhost:${server.address().port}`

    const adminPasswordHash = await bcrypt.hash(admin.password, 4)
    const adminResult = await pool.query(`INSERT INTO users (username, password_hash, user_type) VALUES ($1, $2, 'ADMIN') RETURNING user_id`, [admin.username, adminPasswordHash])
    adminUserId = adminResult.rows[0].user_id
    createdUserIds.push(adminUserId)
    await pool.query('INSERT INTO admins (user_id, name, contact_num, email) VALUES ($1, $2, $3, $4)', [adminUserId, 'Report Test Admin', randomContactNumber(), `repadmin_${runId}@example.com`])
    await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: admin.username, password: admin.password }) })
    const rawCode = '112233'
    const challengeToken = `test-challenge-${crypto.randomUUID()}`
    await pool.query(`INSERT INTO otp_codes (user_id, code_hash, challenge_token, expires_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP + INTERVAL '5 minutes')`, [adminUserId, crypto.createHash('sha256').update(rawCode).digest('hex'), challengeToken])
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

    const driverCreate = await fetch(`${baseUrl}/api/staff`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ ...driver, confirmPassword: driver.password }) })
    assert.equal(driverCreate.status, 201)
    const driverRow = await pool.query('SELECT user_id FROM users WHERE username = $1', [driver.username])
    createdUserIds.push(driverRow.rows[0].user_id)
    const driverLogin = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: driver.username, password: driver.password }) })
    driverCookie = driverLogin.headers.get('set-cookie').split(';')[0]

    const categoryResult = await pool.query('INSERT INTO categories (category_name) VALUES ($1) RETURNING category_id', [`Report Test Category ${runId}`])
    categoryId = categoryResult.rows[0].category_id
    const productResponse = await fetch(`${baseUrl}/api/products`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ categoryId, name: `Report Test Loaf ${runId}`, price: 100 }) })
    productId = (await productResponse.json()).product.id
    createdProductIds.push(productId)
    await pool.query('UPDATE inventory SET stock_quantity = 1000 WHERE product_id = $1', [productId])

    // A saved address for the customer — Phase 7's prerequisite for a
    // DELIVERY order, needed only by the summary test that checks
    // deliveriesNeedingAttention.
    const customerRowForAddress = await pool.query('SELECT customer_id FROM customers WHERE user_id = $1', [customerRow.rows[0].user_id])
    const addressResult = await pool.query(
      `INSERT INTO customer_addresses (customer_id, recipient_name, contact_num, address_line_1, is_default)
       VALUES ($1, 'Report Test Recipient', $2, '1 Report St', TRUE) RETURNING address_id`,
      [customerRowForAddress.rows[0].customer_id, randomContactNumber()],
    )
    customerAddressId = addressResult.rows[0].address_id
  })

  after(async () => {
    await pool.query('DELETE FROM report_logs WHERE generated_by = (SELECT admin_id FROM admins WHERE user_id = $1)', [adminUserId]).catch(() => {})
    await pool.query('DELETE FROM deliveries WHERE order_id = ANY($1)', [createdOrderIds]).catch(() => {})
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
    await pool.query('DELETE FROM categories WHERE category_id = ANY($1)', [createdCategoryIds]).catch(() => {})
    await pool.query('DELETE FROM cashiers WHERE user_id = ANY($1)', [createdUserIds])
    await pool.query('DELETE FROM customers WHERE user_id = ANY($1)', [createdUserIds])
    await pool.query('DELETE FROM admins WHERE user_id = ANY($1)', [createdUserIds])
    await pool.query('DELETE FROM delivery_personnel WHERE user_id = ANY($1)', [createdUserIds])
    await pool.query('DELETE FROM users WHERE user_id = ANY($1)', [createdUserIds])
    await new Promise((resolve) => server.close(resolve))
  })

  test('GET /api/reports/sales requires authentication', async () => {
    const response = await fetch(`${baseUrl}/api/reports/sales?from=2021-01-01&to=2021-01-31`)
    assert.equal(response.status, 401)
  })

  test('a CUSTOMER and a DELIVERY PERSONNEL are refused — 403', async () => {
    const asCustomer = await getSales({ from: '2021-01-01', to: '2021-01-31' }, customerCookie)
    assert.equal(asCustomer.status, 403)
    const asDriver = await getSales({ from: '2021-01-01', to: '2021-01-31' }, driverCookie)
    assert.equal(asDriver.status, 403)
  })

  test('rejects a missing date, from-after-to, and a range past the cap — 422', async () => {
    assert.equal((await getSales({ to: '2021-01-31' })).status, 422)
    assert.equal((await getSales({ from: '2021-02-01', to: '2021-01-01' })).status, 422)
    assert.equal((await getSales({ from: '2020-01-01', to: '2021-06-01' })).status, 422) // > 366 days
  })

  test('an empty period returns zeros formatted to two decimals, not null and not a 500', async () => {
    // 2015 — nothing in this suite, or any other, ever writes here.
    const response = await getSales({ from: '2015-01-01', to: '2015-01-31' })
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.deepEqual(body.buckets, [])
    assert.deepEqual(body.totals, { ordersPlaced: 0, ordered: '0.00', collected: '0.00', refunded: '0.00', averagePayment: '0.00' })
  })

  test('a sale at 2pm on the `to` date is included — the half-open range, where BETWEEN would drop it', async () => {
    await placeOrderAt('2021-06-05 14:00:00+08')
    const response = await getSales({ from: '2021-06-05', to: '2021-06-05' })
    const body = await response.json()
    assert.equal(body.totals.ordersPlaced, 1)
    assert.equal(body.totals.ordered, '100.00')
  })

  test('cancelled orders appear in neither ordersPlaced nor ordered', async () => {
    const orderId = await placeOrderAt('2021-07-10 09:00:00+08')
    const cancel = await cancelOrder(orderId)
    assert.equal(cancel.status, 200)

    const response = await getSales({ from: '2021-07-10', to: '2021-07-10' })
    const body = await response.json()
    assert.equal(body.totals.ordersPlaced, 0, 'a cancelled order must not count as ordered volume')
    assert.equal(body.totals.ordered, '0.00')
  })

  test('only PAID payments count as collected — PENDING and FAILED do not', async () => {
    const orderId = await placeOrderAt('2021-08-01 10:00:00+08')
    // A PayMongo intent creates a PENDING row; simulate one directly rather
    // than needing real gateway credentials, then flip it to FAILED —
    // neither status should ever reach `collected`.
    const pending = await pool.query(
      `INSERT INTO payments (order_id, recorded_by, payment_method, amount, status, gateway_reference, payment_date)
       VALUES ($1, $2, 'GCASH', 100, 'PENDING', $3, '2021-08-01 10:05:00+08') RETURNING payment_id`,
      [orderId, adminUserId, `report-test-pending-${runId}`],
    )
    await pool.query(`UPDATE payments SET status = 'FAILED' WHERE payment_id = $1`, [pending.rows[0].payment_id])

    const response = await getSales({ from: '2021-08-01', to: '2021-08-01' })
    const body = await response.json()
    assert.equal(body.totals.collected, '0.00', 'a FAILED payment must not count as collected')
    assert.equal(body.totals.ordersPlaced, 1, 'the order itself still counts as ordered volume')
  })

  test('a refunded payment is excluded from collected and appears in refunded, dated by refunded_at', async () => {
    const orderId = await placeOrderAt('2021-09-01 09:00:00+08')
    const paymentId = await payInFullAt(orderId, '2021-09-01 09:05:00+08')
    // Refunded in a DIFFERENT month than it was paid.
    await refundAt(paymentId, '2021-10-15 11:00:00+08')

    const septemberReport = await (await getSales({ from: '2021-09-01', to: '2021-09-30' })).json()
    assert.equal(septemberReport.totals.collected, '0.00', 'a refunded payment must not count as collected in the month it was PAID')
    assert.equal(septemberReport.totals.refunded, '0.00', 'nor does the refund show up in the month it was paid')

    const octoberReport = await (await getSales({ from: '2021-10-01', to: '2021-10-31' })).json()
    assert.equal(octoberReport.totals.refunded, '100.00', 'the refund is dated by refunded_at — Decision 3')
  })

  // PHASE 8, DECISION 2 — an order placed in one month and paid the next
  // contributes ORDERED volume to the first bucket and COLLECTED revenue
  // to the second. This looks like a bug without the plan open, hence the
  // comment pointing here.
  test('an order placed in one month and paid the next splits ordered and collected across the two months', async () => {
    const orderId = await placeOrderAt('2021-11-28 16:00:00+08')
    await payInFullAt(orderId, '2021-12-03 10:00:00+08')

    const november = await (await getSales({ from: '2021-11-01', to: '2021-11-30' })).json()
    assert.equal(november.totals.ordersPlaced, 1)
    assert.equal(november.totals.ordered, '100.00')
    assert.equal(november.totals.collected, '0.00', 'not yet paid when November ends')

    const december = await (await getSales({ from: '2021-12-01', to: '2021-12-31' })).json()
    assert.equal(december.totals.ordersPlaced, 0, 'the order was PLACED in November, not December')
    assert.equal(december.totals.collected, '100.00', 'the payment landed in December')
  })

  test('groupBy=day, week, and month bucket the same data differently', async () => {
    await placeOrderAt('2022-03-02 10:00:00+08') // a Wednesday
    await placeOrderAt('2022-03-04 10:00:00+08') // the same ISO week (Mon 2022-02-28 - Sun 2022-03-06)
    await placeOrderAt('2022-03-20 10:00:00+08') // a different week, same month

    const byDay = await (await getSales({ from: '2022-03-01', to: '2022-03-31', groupBy: 'day' })).json()
    assert.equal(byDay.buckets.filter((b) => b.ordersPlaced > 0).length, 3, 'three distinct days')

    const byWeek = await (await getSales({ from: '2022-03-01', to: '2022-03-31', groupBy: 'week' })).json()
    const marchTwoAndFour = byWeek.buckets.find((b) => b.period === '2022-02-28')
    assert.equal(marchTwoAndFour?.ordersPlaced, 2, 'the 2nd and 4th fall in the same ISO week')

    const byMonth = await (await getSales({ from: '2022-03-01', to: '2022-03-31', groupBy: 'month' })).json()
    assert.equal(byMonth.buckets.length, 1)
    assert.equal(byMonth.buckets[0].period, '2022-03-01')
    assert.equal(byMonth.buckets[0].ordersPlaced, 3)
  })

  test('rejects an invalid groupBy', async () => {
    const response = await getSales({ from: '2021-01-01', to: '2021-01-31', groupBy: 'year' })
    assert.equal(response.status, 422)
  })

  test('averagePayment is the average PAID payment amount, zero on a quiet period', async () => {
    const orderA = await placeOrderAt('2022-05-01 09:00:00+08')
    await payInFullAt(orderA, '2022-05-01 09:10:00+08')
    const orderB = await placeOrderAt('2022-05-02 09:00:00+08')
    await payInFullAt(orderB, '2022-05-02 09:10:00+08')

    const response = await (await getSales({ from: '2022-05-01', to: '2022-05-31' })).json()
    assert.equal(response.totals.collected, '200.00')
    assert.equal(response.totals.averagePayment, '100.00', 'two ₱100 payments average to ₱100')
  })

  // The field is named for what it MEASURES, not for what a reader might
  // wish it measured. It divides collected money by the number of PAYMENT
  // rows, so an order settled in instalments contributes one figure per
  // instalment — and calling that "average sale" (as this did until the
  // Phase 8 review) reports half the value of the only sale in the period.
  //
  // Renaming rather than recomputing is deliberate: collected/ordersPlaced
  // would look like the fix, but those two are dated by DIFFERENT columns
  // (payment_date vs order_date, Decision 2), so dividing one by the other
  // produces a figure that belongs to no period at all.
  test('averagePayment measures payments, not orders — an instalment-paid order proves which', async () => {
    const order = await placeOrderAt('2022-07-14 09:00:00+08')
    // One ₱100 order, settled as two ₱50 instalments: one sale, two payments.
    const halfA = await fetch(`${baseUrl}/api/payments`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cashierCookie }, body: JSON.stringify({ orderId: order, method: 'CASH', amount: 50 }) })
    assert.equal(halfA.status, 201)
    const halfB = await fetch(`${baseUrl}/api/payments`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cashierCookie }, body: JSON.stringify({ orderId: order, method: 'CASH', amount: 50 }) })
    assert.equal(halfB.status, 201)
    await pool.query('UPDATE payments SET payment_date = $1 WHERE order_id = $2', ['2022-07-14 09:10:00+08', order])

    const response = await (await getSales({ from: '2022-07-14', to: '2022-07-14' })).json()
    assert.equal(response.totals.ordersPlaced, 1, 'one order was placed')
    assert.equal(response.totals.collected, '100.00', 'and it was collected in full')
    assert.equal(response.totals.averagePayment, '50.00', 'two ₱50 payments average to ₱50 — which is why this is not called "average sale"')
  })

  // PHASE 8, DECISION 4 — deliberate generation vs. an ambient view.
  test('an admin\'s request writes exactly one report_logs row; a cashier\'s identical request writes none', async () => {
    const countLogs = async () => (await pool.query('SELECT COUNT(*)::int AS n FROM report_logs WHERE generated_by = (SELECT admin_id FROM admins WHERE user_id = $1)', [adminUserId])).rows[0].n

    const beforeAdmin = await countLogs()
    const asAdmin = await getSales({ from: '2021-01-01', to: '2021-01-31' }, adminCookie)
    assert.equal(asAdmin.status, 200)
    const afterAdmin = await countLogs()
    assert.equal(afterAdmin, beforeAdmin + 1, 'an admin\'s report generation must write exactly one row')

    const row = await pool.query('SELECT report_type FROM report_logs WHERE generated_by = (SELECT admin_id FROM admins WHERE user_id = $1) ORDER BY report_id DESC LIMIT 1', [adminUserId])
    assert.equal(row.rows[0].report_type, 'SALES')

    const beforeCashier = await countLogs()
    const asCashier = await getSales({ from: '2021-01-01', to: '2021-01-31' }, cashierCookie)
    assert.equal(asCashier.status, 200, 'a cashier can still generate the report')
    const afterCashier = await countLogs()
    assert.equal(afterCashier, beforeCashier, 'a cashier has no admin_id, so nothing is logged — not an error, just outside what report_logs can record')
  })

  // PATTERN K + the CSV/SALES_CSV half of Decision 4.
  test('format=csv returns an escaped CSV file and logs SALES_CSV, not SALES', async () => {
    await placeOrderAt('2021-04-05 10:00:00+08')

    const response = await getSales({ from: '2021-04-01', to: '2021-04-30', format: 'csv' })
    assert.equal(response.status, 200)
    assert.match(response.headers.get('content-type'), /text\/csv/)
    assert.match(response.headers.get('content-disposition'), /attachment/)

    const text = await response.text()
    // The Period column names its own grouping. Without it a first column
    // reading '2021-04-05' is ambiguous between a single day and the
    // Monday that opens a week bucket, and the file carries no other
    // record of which one was asked for.
    // The refunds column says, in the header that travels with the file,
    // that it is NOT deducted from Collected. Collected already excludes
    // refunded money (status = 'PAID'), so `Collected - Refunds` subtracts
    // it a second time — the one arithmetic every reader will reach for,
    // and the one the plain label 'Refunded' silently invited.
    assert.match(text, /"Period \(day\)","Orders placed","Ordered","Collected","Refunds issued \(already excluded from Collected\)"/)
    assert.match(text, /100\.00/, 'the ₱100 order placed above must appear in the CSV body')
    assert.match(text, /"Average payment"/, 'the CSV must use the same honest label as the API')

    const weekly = await getSales({ from: '2021-04-01', to: '2021-04-30', groupBy: 'week', format: 'csv' })
    assert.match(await weekly.text(), /"Period \(week\)"/, 'a week-grouped export must say so in the column it groups by')

    const row = await pool.query('SELECT report_type FROM report_logs WHERE generated_by = (SELECT admin_id FROM admins WHERE user_id = $1) ORDER BY report_id DESC LIMIT 1', [adminUserId])
    assert.equal(row.rows[0].report_type, 'SALES_CSV', 'the export must be logged distinctly from a plain SALES view')
  })

  // The actual security property Pattern K exists for: a cell that looks
  // like a spreadsheet formula must never reach the file as one.
  test('a value beginning with =, +, -, or @ is neutralised against formula injection', async () => {
    const category = await pool.query('INSERT INTO categories (category_name) VALUES ($1) RETURNING category_id', [`Report CSV Category ${runId}`])
    createdCategoryIds.push(category.rows[0].category_id)
    const dangerousName = '=HYPERLINK("http://evil.example","click me")'
    const productResponse = await fetch(`${baseUrl}/api/products`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ categoryId: category.rows[0].category_id, name: dangerousName, price: 50 }) })
    const dangerousProductId = (await productResponse.json()).product.id
    createdProductIds.push(dangerousProductId)
    await pool.query('UPDATE inventory SET stock_quantity = 10 WHERE product_id = $1', [dangerousProductId])

    const orderResponse = await fetch(`${baseUrl}/api/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: customerCookie }, body: JSON.stringify({ items: [{ productId: dangerousProductId, quantity: 1 }] }) })
    const orderBody = await orderResponse.json()
    createdOrderIds.push(orderBody.order.id)
    await pool.query('UPDATE orders SET order_date = $1 WHERE order_id = $2', ['2021-04-10 10:00:00+08', orderBody.order.id])

    const response = await fetch(`${baseUrl}/api/reports/products?${new URLSearchParams({ from: '2021-04-10', to: '2021-04-10' })}`, { headers: { Cookie: adminCookie } })
    const body = await response.json()
    const entry = body.products.find((p) => p.productId === dangerousProductId)
    assert.ok(entry, 'the product must still appear in the JSON report')
    assert.equal(entry.productName, dangerousName, 'the JSON response carries the raw name — escaping is a CSV-serialisation concern only')

    // Exercise csvRow directly against exactly this value, the same way
    // the CSV body itself would render it — proving the escape lands where
    // it actually matters (an exported file opened in a spreadsheet), not
    // just that the JSON API leaves the raw string alone.
    const { csvRow } = await import('../lib/reporting.js')
    const rendered = csvRow([entry.productName])
    assert.ok(!/^"?[=+\-@]/.test(rendered), 'a CSV cell must never begin with a formula-triggering character')
    // Prefixed with a bare quote (neutralising the formula) AND every
    // internal " doubled (ordinary CSV quoting) — both escapes apply
    // together, not one instead of the other.
    assert.equal(rendered, `"'${dangerousName.replaceAll('"', '""')}"`)
  })

  // --- GET /api/reports/summary ---------------------------------------
  //
  // Unlike /sales, this route is GLOBAL and UNSCOPED by design — it is the
  // whole business's "right now", not one customer's or one product's. That
  // means it also sees whatever every OTHER concurrently-running test file
  // writes with a real, un-backdated "now" timestamp. An exact assertion
  // like "today's collected equals ₱100.00" would be genuinely flaky
  // against the rest of the suite running in parallel — so these tests
  // either scope by something ONLY this test created (a specific alert's
  // productId) or check that a known, real contribution moved the total by
  // AT LEAST what was added (a safe lower bound: nothing else in this test
  // file's window can ever subtract what THIS test itself just added).
  describe('GET /api/reports/summary', () => {
    test('requires authentication, and refuses a CUSTOMER and a DELIVERY PERSONNEL', async () => {
      const anon = await fetch(`${baseUrl}/api/reports/summary`)
      assert.equal(anon.status, 401)
      const asCustomer = await fetch(`${baseUrl}/api/reports/summary`, { headers: { Cookie: customerCookie } })
      assert.equal(asCustomer.status, 403)
      const asDriver = await fetch(`${baseUrl}/api/reports/summary`, { headers: { Cookie: driverCookie } })
      assert.equal(asDriver.status, 403)
    })

    test('returns today\'s Manila calendar date, computed the same way an independent query would', async () => {
      const expected = await pool.query(`SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date AS today`)
      const response = await fetch(`${baseUrl}/api/reports/summary`, { headers: { Cookie: adminCookie } })
      assert.equal(response.status, 200)
      const body = await response.json()
      assert.equal(body.today.date, expected.rows[0].today)
    })

    // A lower-bound delta is safe against concurrent ADDITIONS elsewhere in
    // the suite, but not against concurrent SUBTRACTIONS — and today's
    // collected genuinely can go down: orders.test.js has its own
    // admin-cancels-a-paid-order test, which refunds a same-day payment and
    // (correctly, per Decision 3 — /summary is an "as things stand now"
    // view, not history) removes it from today's collected the moment that
    // happens. If that refund's UPDATE lands between this test's own
    // before/after snapshots, "after" can read lower than "before + 100"
    // even though this test's own payment is still counted — not a bug in
    // the report, just this test sampling an instant that another file
    // perturbed. Retrying re-samples a fresh before/after pair, which only
    // fails again if that same cross-file race recurs on every attempt.
    test('placing and paying an order today moves ordersPlaced/ordered/collected by at least that amount', async () => {
      let lastError
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const before = await (await fetch(`${baseUrl}/api/reports/summary`, { headers: { Cookie: adminCookie } })).json()

          const orderResponse = await fetch(`${baseUrl}/api/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: customerCookie }, body: JSON.stringify({ items: [{ productId, quantity: 1 }] }) })
          const orderBody = await orderResponse.json()
          assert.equal(orderResponse.status, 201)
          createdOrderIds.push(orderBody.order.id)
          const payResponse = await fetch(`${baseUrl}/api/payments`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cashierCookie }, body: JSON.stringify({ orderId: orderBody.order.id, method: 'CASH', amount: 100 }) })
          assert.equal(payResponse.status, 201)

          const after = await (await fetch(`${baseUrl}/api/reports/summary`, { headers: { Cookie: adminCookie } })).json()
          assert.ok(after.today.ordersPlaced >= before.today.ordersPlaced + 1, 'ordersPlaced must reflect the order just placed')
          assert.ok(Number(after.today.ordered) >= Number(before.today.ordered) + 100, 'ordered must reflect the ₱100 order just placed')
          assert.ok(Number(after.today.collected) >= Number(before.today.collected) + 100, 'collected must reflect the ₱100 payment just recorded')
          return
        } catch (error) {
          lastError = error
        }
      }
      throw lastError
    })

    // Same cross-file race as the two tests above: outstanding is global
    // and can go DOWN as well as up between this test's own before/after
    // snapshot — any concurrently-running test file that pays off or
    // cancels an unrelated unpaid order shrinks total outstanding by that
    // order's own amount. Retrying re-samples a fresh pair.
    test('an unpaid order increases total outstanding by at least its own amount', async () => {
      let lastError
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const before = await (await fetch(`${baseUrl}/api/reports/summary`, { headers: { Cookie: adminCookie } })).json()

          const orderResponse = await fetch(`${baseUrl}/api/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: customerCookie }, body: JSON.stringify({ items: [{ productId, quantity: 1 }] }) })
          const orderBody = await orderResponse.json()
          assert.equal(orderResponse.status, 201)
          createdOrderIds.push(orderBody.order.id)

          const after = await (await fetch(`${baseUrl}/api/reports/summary`, { headers: { Cookie: adminCookie } })).json()
          assert.ok(Number(after.outstanding) >= Number(before.outstanding) + 100, 'an unpaid ₱100 order must be reflected in outstanding')
          return
        } catch (error) {
          lastError = error
        }
      }
      throw lastError
    })

    test('an open low-stock alert for this test\'s own product appears in lowStockAlerts', async () => {
      // A dedicated product so the alert's productId is unique to this
      // test — the LIST is global, but checking for ONE specific id in it
      // is a scoped, non-flaky assertion.
      const category = await pool.query('INSERT INTO categories (category_name) VALUES ($1) RETURNING category_id', [`Report Alert Category ${runId}`])
      const alertProductResponse = await fetch(`${baseUrl}/api/products`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ categoryId: category.rows[0].category_id, name: `Report Alert Loaf ${runId}`, price: 10 }) })
      const alertProductId = (await alertProductResponse.json()).product.id
      // Below min_stock_level — syncStockAlert (lib/inventory.js) opens an
      // alert the next time anything writes to this inventory row; a
      // direct admin stock edit is the simplest trigger. reason is
      // required whenever stockQuantity is part of the body.
      const alertPatch = await fetch(`${baseUrl}/api/inventory/${alertProductId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ stockQuantity: 2, minStockLevel: 5, reason: 'CORRECTION' }) })
      assert.equal(alertPatch.status, 200, `inventory PATCH must succeed: ${JSON.stringify(await alertPatch.json())}`)

      const response = await (await fetch(`${baseUrl}/api/reports/summary`, { headers: { Cookie: adminCookie } })).json()
      const found = response.lowStockAlerts.find((alert) => alert.productId === alertProductId)
      assert.ok(found, 'the open alert for this test\'s own product must appear in lowStockAlerts')
      assert.equal(found.stockQuantity, 2)
      assert.equal(found.minStockLevel, 5)

      await pool.query('DELETE FROM stock_alerts WHERE inventory_id = (SELECT inventory_id FROM inventory WHERE product_id = $1)', [alertProductId])
      await pool.query('DELETE FROM inventory WHERE product_id = $1', [alertProductId])
      await pool.query('DELETE FROM products WHERE product_id = $1', [alertProductId])
      await pool.query('DELETE FROM categories WHERE category_id = $1', [category.rows[0].category_id])
    })

    // Same cross-file race as the collected/ordered test above: deliveries
    // is neither scoped nor historical — deliveries.test.js's own tests
    // concurrently move OTHER deliveries out of PENDING_ASSIGNMENT/ASSIGNED
    // (assigning, marking delivered) as part of their own normal flow. If
    // one of those transitions lands between this test's before/after
    // snapshot, deliveriesNeedingAttention can read lower than "before + 1"
    // even though the delivery THIS test created is still counted. Retrying
    // re-samples a fresh pair rather than chasing the same instant.
    test('a DELIVERY order left PENDING_ASSIGNMENT increases deliveriesNeedingAttention by at least one', async () => {
      let lastError
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const before = await (await fetch(`${baseUrl}/api/reports/summary`, { headers: { Cookie: adminCookie } })).json()

          const orderResponse = await fetch(`${baseUrl}/api/orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Cookie: customerCookie },
            body: JSON.stringify({ orderType: 'DELIVERY', addressId: customerAddressId, items: [{ productId, quantity: 1 }] }),
          })
          const orderBody = await orderResponse.json()
          assert.equal(orderResponse.status, 201, `delivery order placement must succeed: ${JSON.stringify(orderBody)}`)
          createdOrderIds.push(orderBody.order.id)

          const after = await (await fetch(`${baseUrl}/api/reports/summary`, { headers: { Cookie: adminCookie } })).json()
          assert.ok(after.deliveriesNeedingAttention >= before.deliveriesNeedingAttention + 1)
          return
        } catch (error) {
          lastError = error
        }
      }
      throw lastError
    })

    // The one query in Phase 8 whose cost grows with a BUSINESS problem
    // rather than with time: every open alert, on every dashboard load, for
    // every admin and cashier. A bakery with a bad week — a supplier that
    // missed a delivery, a freezer that failed — can put most of the
    // catalogue below its minimum at once, and the count is what the
    // dashboard actually renders, not the rows.
    test('the low-stock alert list is capped, and the count still reports every open alert', async () => {
      const alertCategory = await pool.query('INSERT INTO categories (category_name) VALUES ($1) RETURNING category_id', [`Report Cap Category ${runId}`])
      const capCategoryId = alertCategory.rows[0].category_id
      const capProductIds = []
      // 55 open alerts — comfortably more than the 50 cap, so the assertion
      // below cannot be satisfied by whatever else the suite has left open.
      for (let index = 0; index < 55; index += 1) {
        const product = await pool.query('INSERT INTO products (category_id, product_name, price) VALUES ($1, $2, 10) RETURNING product_id', [capCategoryId, `Cap Loaf ${runId} ${index}`])
        const capProductId = product.rows[0].product_id
        capProductIds.push(capProductId)
        const inv = await pool.query('INSERT INTO inventory (product_id, stock_quantity, min_stock_level) VALUES ($1, 0, 5) RETURNING inventory_id', [capProductId])
        await pool.query('INSERT INTO stock_alerts (inventory_id, alert_message) VALUES ($1, $2)', [inv.rows[0].inventory_id, 'Out of stock'])
      }

      try {
        const summary = await (await fetch(`${baseUrl}/api/reports/summary`, { headers: { Cookie: adminCookie } })).json()
        assert.equal(summary.lowStockAlerts.length, 50, 'the list handed to the dashboard is capped')
        assert.ok(summary.lowStockAlertsTotal >= 55, `the COUNT must not be capped — got ${summary.lowStockAlertsTotal}`)
        assert.ok(summary.lowStockAlertsTotal > summary.lowStockAlerts.length, 'and it must exceed the truncated list, or the cap is invisible to the UI')

        const inventoryReport = await (await fetch(`${baseUrl}/api/reports/inventory?from=2020-01-01&to=2020-01-02`, { headers: { Cookie: adminCookie } })).json()
        assert.equal(inventoryReport.lowStockAlerts.length, 50, 'the inventory report caps the same way')
        assert.ok(inventoryReport.lowStockAlertsTotal >= 55)
      } finally {
        for (const capProductId of capProductIds) {
          await pool.query('DELETE FROM stock_alerts WHERE inventory_id = (SELECT inventory_id FROM inventory WHERE product_id = $1)', [capProductId]).catch(() => {})
          await pool.query('DELETE FROM inventory WHERE product_id = $1', [capProductId]).catch(() => {})
          await pool.query('DELETE FROM products WHERE product_id = $1', [capProductId]).catch(() => {})
        }
        await pool.query('DELETE FROM categories WHERE category_id = $1', [capCategoryId]).catch(() => {})
      }
    })

    test('writes no report_logs row, even for an admin — this is the ambient view, not a generated report', async () => {
      const before = await pool.query('SELECT COUNT(*)::int AS n FROM report_logs WHERE generated_by = (SELECT admin_id FROM admins WHERE user_id = $1)', [adminUserId])
      const response = await fetch(`${baseUrl}/api/reports/summary`, { headers: { Cookie: adminCookie } })
      assert.equal(response.status, 200)
      const after = await pool.query('SELECT COUNT(*)::int AS n FROM report_logs WHERE generated_by = (SELECT admin_id FROM admins WHERE user_id = $1)', [adminUserId])
      assert.equal(after.rows[0].n, before.rows[0].n)
    })
  })

  // --- GET /api/reports/products ---------------------------------------
  describe('GET /api/reports/products', () => {
    const getProducts = (query, cookie = adminCookie) => fetch(`${baseUrl}/api/reports/products?${new URLSearchParams(query)}`, { headers: { Cookie: cookie } })

    test('a CUSTOMER and a DELIVERY PERSONNEL are refused — 403', async () => {
      assert.equal((await getProducts({ from: '2023-01-01', to: '2023-01-31' }, customerCookie)).status, 403)
      assert.equal((await getProducts({ from: '2023-01-01', to: '2023-01-31' }, driverCookie)).status, 403)
    })

    // PHASE 8, DECISION 6 — the test that catches a join to
    // products.price instead of the snapshotted order_details.unit_price.
    // A join to today's price would silently restate this figure the
    // moment the price changes below, which is exactly what must NOT
    // happen: an order made history the instant it was placed.
    test('revenue uses the price snapshotted at order time, not the product\'s current price', async () => {
      await placeOrderAt('2023-02-10 10:00:00+08') // ₱100 at the time

      const before = await (await getProducts({ from: '2023-02-10', to: '2023-02-10' })).json()
      const beforeEntry = before.products.find((p) => p.productId === productId)
      assert.equal(beforeEntry.revenue, '100.00')

      const priceChange = await fetch(`${baseUrl}/api/products/${productId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ price: 500 }) })
      assert.equal(priceChange.status, 200)

      const after = await (await getProducts({ from: '2023-02-10', to: '2023-02-10' })).json()
      const afterEntry = after.products.find((p) => p.productId === productId)
      assert.equal(afterEntry.revenue, '100.00', 'past revenue must not be restated by a later price change')

      // Restore the price so it doesn't leak into any other test in this
      // file that assumes ₱100 orders.
      await fetch(`${baseUrl}/api/products/${productId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ price: 100 }) })
    })

    test('a cancelled order\'s items are excluded entirely', async () => {
      const orderId = await placeOrderAt('2023-02-15 10:00:00+08')
      const cancel = await cancelOrder(orderId)
      assert.equal(cancel.status, 200)

      const response = await (await getProducts({ from: '2023-02-15', to: '2023-02-15' })).json()
      assert.ok(!response.products.some((p) => p.productId === productId), 'a cancelled order must contribute no quantitySold or revenue')
    })

    test('limit is honoured up to the cap, and an out-of-range limit is capped rather than rejected', async () => {
      const withinRange = await getProducts({ from: '2023-01-01', to: '2023-01-01', limit: 5 })
      assert.equal(withinRange.status, 200)
      const overCap = await getProducts({ from: '2023-01-01', to: '2023-01-01', limit: 9999 })
      assert.equal(overCap.status, 200, 'an oversized limit must be capped, not refused')
    })
  })

  // --- GET /api/reports/inventory --------------------------------------
  describe('GET /api/reports/inventory', () => {
    let inventoryProductId
    let inventoryOfId

    before(async () => {
      const category = await pool.query('INSERT INTO categories (category_name) VALUES ($1) RETURNING category_id', [`Report Inventory Category ${runId}`])
      createdCategoryIds.push(category.rows[0].category_id)
      const productResponse = await fetch(`${baseUrl}/api/products`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ categoryId: category.rows[0].category_id, name: `Report Inventory Loaf ${runId}`, price: 20 }) })
      inventoryProductId = (await productResponse.json()).product.id
      createdProductIds.push(inventoryProductId)
      const inventoryRow = await pool.query('SELECT inventory_id FROM inventory WHERE product_id = $1', [inventoryProductId])
      inventoryOfId = inventoryRow.rows[0].inventory_id
      await pool.query('UPDATE inventory SET stock_quantity = 100, min_stock_level = 10 WHERE product_id = $1', [inventoryProductId])
    })

    const getInventory = (query, cookie = adminCookie) => fetch(`${baseUrl}/api/reports/inventory?${new URLSearchParams(query)}`, { headers: { Cookie: cookie } })

    test('a CUSTOMER and a DELIVERY PERSONNEL are refused — 403', async () => {
      assert.equal((await getInventory({ from: '2023-03-01', to: '2023-03-01' }, customerCookie)).status, 403)
      assert.equal((await getInventory({ from: '2023-03-01', to: '2023-03-01' }, driverCookie)).status, 403)
    })

    // PHASE 8, DECISION 7 — movement totals are reported SIGNED, exactly
    // as the ledger stores them, so the sum of every reason's reported
    // total reconciles to the ledger's own SUM(quantity_change) for the
    // same rows. Backdated to an isolated date so this GLOBAL, unscoped
    // report sees only what THIS test wrote.
    test('movement totals group by reason and reconcile with the raw ledger', async () => {
      const testDate = '2023-03-05'

      // RESTOCK +50, then SPOILAGE -8, then a CORRECTION -2 — three
      // different reasons, three different signs.
      const restock = await fetch(`${baseUrl}/api/inventory/${inventoryProductId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ stockQuantity: 150, reason: 'RESTOCK' }) })
      assert.equal(restock.status, 200)
      const spoilage = await fetch(`${baseUrl}/api/inventory/${inventoryProductId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ stockQuantity: 142, reason: 'SPOILAGE' }) })
      assert.equal(spoilage.status, 200)
      const correction = await fetch(`${baseUrl}/api/inventory/${inventoryProductId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ stockQuantity: 140, reason: 'CORRECTION' }) })
      assert.equal(correction.status, 200)

      await pool.query(`UPDATE inventory_movements SET created_at = $1 WHERE inventory_id = $2`, [`${testDate} 12:00:00+08`, inventoryOfId])

      const response = await (await getInventory({ from: testDate, to: testDate })).json()
      const reported = Object.fromEntries(response.movements.map((m) => [m.reason, m.netChange]))
      assert.equal(reported.RESTOCK, 50)
      assert.equal(reported.SPOILAGE, -8)
      assert.equal(reported.CORRECTION, -2)
      assert.equal(response.spoilageUnits, 8, 'spoilageUnits is the positive magnitude')

      // Reconciliation: sum of what the report shows for THIS product's
      // movements must equal the ledger's own signed SUM for those same
      // rows — the exact invariant Phase 5's ledger is built to uphold.
      const reportedSum = Object.values(reported).reduce((sum, value) => sum + value, 0)
      const ledger = await pool.query('SELECT COALESCE(SUM(quantity_change), 0)::int AS n FROM inventory_movements WHERE inventory_id = $1', [inventoryOfId])
      assert.equal(reportedSum, ledger.rows[0].n)
    })

    test('an open alert appears in lowStockAlerts; resolving it removes it', async () => {
      const drop = await fetch(`${baseUrl}/api/inventory/${inventoryProductId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ stockQuantity: 5, reason: 'CORRECTION' }) })
      assert.equal(drop.status, 200)

      const withAlert = await (await getInventory({ from: '2023-01-01', to: '2023-01-01' })).json()
      assert.ok(withAlert.lowStockAlerts.some((a) => a.productId === inventoryProductId), 'stock below minimum must open an alert')

      // Restock above the minimum — syncStockAlert (lib/inventory.js)
      // resolves the open alert automatically.
      const restore = await fetch(`${baseUrl}/api/inventory/${inventoryProductId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ stockQuantity: 100, reason: 'RESTOCK' }) })
      assert.equal(restore.status, 200)

      const resolved = await (await getInventory({ from: '2023-01-01', to: '2023-01-01' })).json()
      assert.ok(!resolved.lowStockAlerts.some((a) => a.productId === inventoryProductId), 'a resolved alert must disappear from the list')
    })

    // The reporting routes must never write to inventory or resolve an
    // alert themselves (Decision 7) — snapshotting a specific product's
    // own state before/after is a safe, non-flaky way to prove that,
    // regardless of what else is happening in the rest of the suite.
    test('calling every report route leaves stock_quantity and stock_alerts untouched', async () => {
      const before = await pool.query('SELECT stock_quantity FROM inventory WHERE product_id = $1', [inventoryProductId])
      const alertsBefore = await pool.query('SELECT alert_id, is_resolved FROM stock_alerts WHERE inventory_id = $1 ORDER BY alert_id', [inventoryOfId])

      await getInventory({ from: '2023-01-01', to: '2023-12-31' })
      await fetch(`${baseUrl}/api/reports/products?${new URLSearchParams({ from: '2023-01-01', to: '2023-12-31' })}`, { headers: { Cookie: adminCookie } })
      await getSales({ from: '2023-01-01', to: '2023-12-31' })
      await fetch(`${baseUrl}/api/reports/summary`, { headers: { Cookie: adminCookie } })

      const after = await pool.query('SELECT stock_quantity FROM inventory WHERE product_id = $1', [inventoryProductId])
      const alertsAfter = await pool.query('SELECT alert_id, is_resolved FROM stock_alerts WHERE inventory_id = $1 ORDER BY alert_id', [inventoryOfId])
      assert.equal(after.rows[0].stock_quantity, before.rows[0].stock_quantity)
      assert.deepEqual(alertsAfter.rows, alertsBefore.rows)
    })
  })

  // --- GET /api/reports/logs --------------------------------------------
  //
  // Every assertion below is a BEFORE/AFTER delta on `total`, never a bare
  // number — the same reasoning the earlier "writes exactly one
  // report_logs row" test already relies on: this file's own admin is the
  // only writer to report_logs for the whole run (no other test file ever
  // calls /api/reports/sales), so a delta taken immediately before and
  // after this describe block's own calls is exact, with no dependency on
  // how many rows earlier tests in this same file already left behind.
  describe('GET /api/reports/logs', () => {
    const getLogs = (query, cookie = adminCookie) => fetch(`${baseUrl}/api/reports/logs?${new URLSearchParams(query)}`, { headers: { Cookie: cookie } })

    test('requires authentication, and is ADMIN only — a CASHIER is refused even though the rest of this router admits one', async () => {
      assert.equal((await fetch(`${baseUrl}/api/reports/logs`)).status, 401)
      // The router-wide requireRole('ADMIN', 'CASHIER') above admits a
      // cashier to every OTHER route in this file — this route's own
      // requireRole('ADMIN') override is what stops it here, because
      // report_logs.generated_by REFERENCES admins(admin_id): a cashier
      // could never appear in this table no matter what they ask for.
      assert.equal((await getLogs({}, cashierCookie)).status, 403)
      assert.equal((await getLogs({}, customerCookie)).status, 403)
      assert.equal((await getLogs({}, driverCookie)).status, 403)
    })

    test('a deliberately generated report appears in the log, with its type and the generating admin\'s name', async () => {
      const before = await (await getLogs({ limit: 1 })).json()

      const salesResponse = await getSales({ from: '2022-06-01', to: '2022-06-30' })
      assert.equal(salesResponse.status, 200)

      const after = await (await getLogs({ limit: 1 })).json()
      assert.equal(after.total, before.total + 1, 'exactly one new row for the one report just generated')
      assert.equal(after.logs[0].reportType, 'SALES')
      assert.equal(after.logs[0].generatedByName, 'Report Test Admin', 'the admin fixture\'s own name, from the before() hook above')
      assert.ok(after.logs[0].generatedAt, 'must carry a timestamp')
    })

    test('the ambient view and a cashier\'s own report never appear here — neither has an admin_id to log', async () => {
      const before = await (await getLogs({ limit: 1 })).json()

      await fetch(`${baseUrl}/api/reports/summary`, { headers: { Cookie: adminCookie } })
      const asCashier = await getSales({ from: '2022-07-01', to: '2022-07-31' }, cashierCookie)
      assert.equal(asCashier.status, 200, 'a cashier can still generate the report itself, same as always')

      const after = await (await getLogs({ limit: 1 })).json()
      assert.equal(after.total, before.total, 'neither call had anything an admin_id could log')
    })

    test('rows come back most-recent-first, and pagination is exact — including an offset placed past the true end', async () => {
      const before = await (await getLogs({ limit: 1 })).json()
      const startTotal = before.total

      // Three distinct, back-to-back report generations.
      for (const [from, to] of [['2022-08-01', '2022-08-05'], ['2022-08-06', '2022-08-10'], ['2022-08-11', '2022-08-15']]) {
        const response = await getSales({ from, to })
        assert.equal(response.status, 200)
      }

      const firstPage = await (await getLogs({ limit: 2, offset: 0 })).json()
      assert.equal(firstPage.total, startTotal + 3)
      assert.equal(firstPage.logs.length, 2)
      assert.equal(firstPage.hasMore, true)
      const timestamps = firstPage.logs.map((log) => new Date(log.generatedAt).getTime())
      assert.ok(timestamps[0] >= timestamps[1], 'rows must be ordered newest first')

      // Two distinct failure modes hide behind one empty page, and only
      // one of them applies here. "Nothing has ever been logged" is not
      // this case — plenty exists, this offset just names a page past
      // where it ends. A plain window-function count cannot tell the two
      // apart (this query returns no rows, so it has no row zero to read
      // a count from), which is exactly why the route falls back to a
      // second, unconditional COUNT(*) whenever the page comes back empty
      // AND the offset is positive.
      const pastEnd = await (await getLogs({ limit: 5, offset: startTotal + 3 })).json()
      assert.equal(pastEnd.logs.length, 0)
      assert.equal(pastEnd.total, startTotal + 3, 'the true total must still be reported even though this specific page is empty')
      assert.equal(pastEnd.hasMore, false)
    })
  })
})

after(async () => {
  await pool.end()
})
