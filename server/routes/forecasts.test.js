// Route tests for /api/forecasts — Phase 9B.
//
// The unit tests prove the methods; these prove the rules around them:
// who may run and read a forecast, that a run records what it was trained
// on, that assumed history never leaks into a sales figure, that the
// training data is real sales on their own day, and the nightly run.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { after, before, beforeEach, describe, test } from 'node:test'
import bcrypt from 'bcrypt'
import app from '../app.js'
import { pool } from '../db.js'
import { nightlySourceFor, runNightlyForecast } from '../lib/forecastRun.js'
import { resetRateLimits } from '../lib/security.js'
import { addDays } from '../lib/forecasting.js'

const runId = crypto.randomUUID().slice(0, 8)
const randomContactNumber = () => `09${Math.floor(100000000 + Math.random() * 899999999)}`

describe('demand forecasting API', () => {
  let server
  let baseUrl
  let adminCookie
  let cashierCookie
  let customerCookie
  const userIds = []
  let categoryId
  let productId
  let yesterday

  const admin = { username: `fcadmin_${runId}`, password: 'Forecast-Admin-Pass-9!' }

  const json = (cookie, method, path, body) => fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  const sessionFor = async (userType, table) => {
    const username = `fc${userType.toLowerCase().slice(0, 4)}_${runId}`
    const created = await pool.query(`INSERT INTO users (username, password_hash, user_type) VALUES ($1, $2, $3) RETURNING user_id`, [username, await bcrypt.hash('Some-Password-9!', 4), userType])
    const userId = created.rows[0].user_id
    userIds.push(userId)
    await pool.query(`INSERT INTO ${table} (user_id, name, contact_num, email) VALUES ($1, $2, $3, $4)`, [userId, `Forecast ${userType}`, randomContactNumber(), `${username}@example.com`])
    if (table === 'customers') await pool.query('UPDATE customers SET email_verified_at = CURRENT_TIMESTAMP WHERE user_id = $1', [userId])
    const login = await json(null, 'POST', '/api/auth/login', { identifier: username, password: 'Some-Password-9!' })
    return login.headers.get('set-cookie').split(';')[0]
  }

  before(async () => {
    server = app.listen(0)
    await new Promise((resolve) => server.once('listening', resolve))
    baseUrl = `http://localhost:${server.address().port}`

    // Admin: through the real password step and a code this test controls,
    // as the other suites do — otp_codes stores only a hash.
    const adminId = (await pool.query(`INSERT INTO users (username, password_hash, user_type) VALUES ($1, $2, 'ADMIN') RETURNING user_id`, [admin.username, await bcrypt.hash(admin.password, 4)])).rows[0].user_id
    userIds.push(adminId)
    await pool.query('INSERT INTO admins (user_id, name, contact_num, email) VALUES ($1, $2, $3, $4)', [adminId, 'Forecast Admin', randomContactNumber(), `fcadmin_${runId}@example.com`])
    const challenge = await (await json(null, 'POST', '/api/auth/login', { identifier: admin.username, password: admin.password })).json()
    await pool.query('UPDATE otp_codes SET code_hash = $2 WHERE challenge_token = $1', [challenge.challengeToken, crypto.createHash('sha256').update('161803').digest('hex')])
    adminCookie = (await json(null, 'POST', '/api/auth/verify-otp', { challengeToken: challenge.challengeToken, code: '161803' })).headers.get('set-cookie').split(';')[0]

    cashierCookie = await sessionFor('CASHIER', 'cashiers')
    customerCookie = await sessionFor('CUSTOMER', 'customers')

    // One product of this test's own, with 70 days of assumed demand: a
    // clean weekly pattern, so what the run produces for it is predictable.
    categoryId = (await pool.query('INSERT INTO categories (category_name) VALUES ($1) RETURNING category_id', [`Forecast Test ${runId}`])).rows[0].category_id
    productId = (await pool.query(`INSERT INTO products (category_id, product_name, price, variant) VALUES ($1, 'Forecast Bun', 10, $2) RETURNING product_id`, [categoryId, runId])).rows[0].product_id
    await pool.query('INSERT INTO inventory (product_id) VALUES ($1)', [productId])

    yesterday = (await pool.query(`SELECT ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date - 1)::text AS d`)).rows[0].d
    const dates = Array.from({ length: 70 }, (_, index) => addDays(yesterday, index - 69))
    await pool.query(
      `INSERT INTO assumed_daily_demand (local_date, product_id, units, generator_version)
       SELECT d, $1, (ARRAY[5,10,10,10,10,20,30])[EXTRACT(DOW FROM d)::int + 1], 'test'
         FROM unnest($2::date[]) AS d
       ON CONFLICT (local_date, product_id) DO UPDATE SET units = EXCLUDED.units`,
      [productId, dates],
    )

  })

  after(async () => {
    try {
      await pool.query('DELETE FROM forecast_runs WHERE run_by = ANY($1)', [userIds])
      await pool.query('DELETE FROM assumed_daily_demand WHERE product_id = $1', [productId])
      await pool.query('DELETE FROM inventory WHERE product_id = $1', [productId])
      await pool.query('DELETE FROM products WHERE product_id = $1', [productId])
      await pool.query('DELETE FROM categories WHERE category_id = $1', [categoryId])
      await pool.query('DELETE FROM security_events WHERE user_id = ANY($1)', [userIds])
      // The sales-report checks ran as the admin, which logs a report.
      await pool.query('DELETE FROM report_logs WHERE user_id = ANY($1) OR generated_by IN (SELECT admin_id FROM admins WHERE user_id = ANY($1))', [userIds])
      await pool.query('DELETE FROM customers WHERE user_id = ANY($1)', [userIds])
      await pool.query('DELETE FROM cashiers WHERE user_id = ANY($1)', [userIds])
      await pool.query('DELETE FROM admins WHERE user_id = ANY($1)', [userIds])
      await pool.query('DELETE FROM users WHERE user_id = ANY($1)', [userIds])
    } finally {
      await new Promise((resolve) => server.close(resolve))
      await pool.end()
    }
  })

  beforeEach(resetRateLimits)

  test('only an admin may start or read a forecast; a cashier, a customer and a guest may not', async () => {
    assert.equal((await json(cashierCookie, 'POST', '/api/forecasts/run', { source: 'ASSUMED' })).status, 403)
    assert.equal((await json(customerCookie, 'POST', '/api/forecasts/run', { source: 'ASSUMED' })).status, 403)
    assert.equal((await json(null, 'POST', '/api/forecasts/run', { source: 'ASSUMED' })).status, 401)
    assert.equal((await json(cashierCookie, 'GET', '/api/forecasts/latest')).status, 403, 'Reporting & Analytics is the admin\'s (2026-10-25)')
    assert.equal((await json(customerCookie, 'GET', '/api/forecasts/latest')).status, 403)
  })

  test('an unknown source is refused rather than guessed', async () => {
    assert.equal((await json(adminCookie, 'POST', '/api/forecasts/run', { source: 'EVERYTHING' })).status, 422)
  })

  test('a run on assumed history forecasts the product and records what it was trained on', async () => {
    const run = await json(adminCookie, 'POST', '/api/forecasts/run', { source: 'ASSUMED' })
    assert.equal(run.status, 201)

    const latest = await (await json(adminCookie, 'GET', '/api/forecasts/latest')).json()
    assert.equal(latest.run.source, 'ASSUMED')
    assert.deepEqual(latest.run.sources, ['ASSUMED'])
    assert.ok(latest.run.daysBySource.ASSUMED >= 70)
    assert.equal(latest.run.horizonDays, 7)
    assert.equal(latest.dates.length, 7)
    // The forecast starts today — the day after the history ends.
    assert.equal(latest.dates[0], addDays(yesterday, 1))

    const bun = latest.products.find((product) => product.productId === productId)
    assert.ok(bun, 'the test product is forecast')
    // A clean weekly pattern is reproduced to within a unit a day.
    const expected = [5, 10, 10, 10, 10, 20, 30]
    for (const day of bun.days) {
      const weekday = new Date(`${day.date}T00:00:00Z`).getUTCDay()
      assert.ok(Math.abs(day.predicted - expected[weekday]) < 1, `${day.date}: ${day.predicted} vs ${expected[weekday]}`)
    }
    assert.ok(bun.mae != null && bun.baselineMae != null, 'enough history to be scored')
    assert.equal(bun.candidates.length, 3)
  })

  // Generated history stops on the day it was generated. The days after
  // that are not in the data — they must not be read as zero sales, or
  // every forecast collapses toward zero.
  test('assumed history that stops before yesterday is not zero-filled: the forecast still starts today at the usual level', async () => {
    const staleId = (await pool.query(`INSERT INTO products (category_id, product_name, price, variant) VALUES ($1, 'Stale Bun', 10, $2) RETURNING product_id`, [categoryId, runId])).rows[0].product_id
    await pool.query('INSERT INTO inventory (product_id) VALUES ($1)', [staleId])
    try {
      // 70 days of a steady 20 a day, ending ten days before yesterday.
      const lastDay = addDays(yesterday, -10)
      const dates = Array.from({ length: 70 }, (_, index) => addDays(lastDay, index - 69))
      await pool.query(
        `INSERT INTO assumed_daily_demand (local_date, product_id, units, generator_version) SELECT d, $1, 20, 'test' FROM unnest($2::date[]) AS d`,
        [staleId, dates],
      )
      assert.equal((await json(adminCookie, 'POST', '/api/forecasts/run', { source: 'ASSUMED' })).status, 201)
      const latest = await (await json(adminCookie, 'GET', '/api/forecasts/latest')).json()
      const stale = latest.products.find((product) => product.productId === staleId)
      assert.ok(stale, 'the product is forecast')
      assert.equal(stale.days.length, 7)
      assert.equal(stale.days[0].date, addDays(yesterday, 1), 'the forecast starts today, not the day after the history ends')
      const average = stale.days.reduce((sum, day) => sum + Number(day.predicted), 0) / 7
      assert.ok(average > 15, `forecast stays near 20 a day, got ${average}`)
    } finally {
      await pool.query('DELETE FROM forecast_runs WHERE run_by = ANY($1)', [userIds])
      await pool.query('DELETE FROM assumed_daily_demand WHERE product_id = $1', [staleId])
      await pool.query('DELETE FROM inventory WHERE product_id = $1', [staleId])
      await pool.query('DELETE FROM products WHERE product_id = $1', [staleId])
    }
  })

  test('a run on REAL sales trains on nothing assumed, and says plainly when there is too little', async () => {
    const run = await json(adminCookie, 'POST', '/api/forecasts/run', { source: 'REAL' })
    assert.equal(run.status, 201)
    const latest = await (await json(adminCookie, 'GET', '/api/forecasts/latest')).json()
    assert.equal(latest.run.source, 'REAL')
    assert.equal(latest.run.sources.includes('ASSUMED'), false)
    assert.equal(latest.run.daysBySource.ASSUMED, undefined)
    // The test product has assumed history only — so under REAL it is
    // skipped, with the reason, not forecast from invented numbers.
    const skipped = latest.skipped.find((product) => product.productId === productId)
    assert.ok(skipped)
    assert.match(skipped.note, /No history/)
  })

  test('assumed demand never appears in any sales figure', async () => {
    // The whole reason it lives in its own table: 70 days of invented buns
    // must not become revenue anywhere.
    const from = addDays(yesterday, -69)
    const sales = await pool.query('SELECT COALESCE(SUM(units_sold), 0)::int AS units FROM analytics_daily_sales WHERE product_id = $1', [productId])
    assert.equal(sales.rows[0].units, 0)
    const report = await (await json(adminCookie, 'GET', `/api/reports/products?from=${from}&to=${yesterday}&limit=50`)).json()
    assert.equal(report.products.some((product) => product.productId === productId), false)
    const csv = await (await json(adminCookie, 'GET', `/api/reports/analytics?from=${from}&to=${yesterday}&format=csv`)).text()
    assert.equal(csv.includes(`Forecast Bun`), false)
  })

  test('the nightly run: from 12:05 AM Manila, once a day, on assumed history until 56 real days (ANALYTICS_PLAN A4)', async () => {
    assert.equal(nightlySourceFor(55), 'ASSUMED')
    assert.equal(nightlySourceFor(56), 'REAL')
    // A far-off day, so it never meets a real nightly claim.
    const day = '2099-01-01'
    await pool.query('DELETE FROM forecast_nightly_runs WHERE day = $1', [day])
    try {
      assert.equal(await runNightlyForecast(new Date('2099-01-01T00:04:00+08:00')), null, 'not before 12:05 AM')
      const run = await runNightlyForecast(new Date('2099-01-01T00:10:00+08:00'))
      assert.ok(run?.id, 'runs once the time has come')
      assert.equal(run.source, 'ASSUMED')
      const stored = await pool.query('SELECT run_by, sources FROM forecast_runs WHERE run_id = $1', [run.id])
      assert.equal(stored.rows[0].run_by, null, 'a system run has no user')
      assert.equal(await runNightlyForecast(new Date('2099-01-01T03:00:00+08:00')), null, 'never twice on one day')
      await pool.query('DELETE FROM forecast_runs WHERE run_id = $1', [run.id])
    } finally {
      await pool.query('DELETE FROM forecast_nightly_runs WHERE day = $1', [day])
    }
  })

  test('the sales the forecast learns from: paid or completed orders only, on their own day (ANALYTICS_PLAN A2)', async () => {
    // A held checkout never paid, and a paid order booked on May 1 for May 10.
    const place = async (status, orderDate, requested) => (await pool.query(
      `INSERT INTO orders (order_type, status, order_date, requested_fulfillment_time) VALUES ('PICKUP', $1, $2, $3) RETURNING order_id`,
      [status, orderDate, requested],
    )).rows[0].order_id
    const hold = await place('AWAITING_PAYMENT', '2021-05-01 09:00:00+08', null)
    const booked = await place('READY_FOR_PICKUP', '2021-05-01 09:00:00+08', '2021-05-10 08:00:00+08')
    const orderIds = [hold, booked]
    try {
      for (const orderId of orderIds) await pool.query('INSERT INTO order_details (order_id, product_id, quantity, unit_price) VALUES ($1, $2, 3, 10)', [orderId, productId])
      await pool.query(`INSERT INTO payments (order_id, payment_method, amount, status, payment_date) VALUES ($1, 'CASH', 30, 'PAID', '2021-05-01 09:05:00+08')`, [booked])
      const rows = (await pool.query(`SELECT local_date::text AS day, units_sold FROM analytics_daily_sales WHERE product_id = $1 ORDER BY local_date`, [productId])).rows
      assert.deepEqual(rows, [{ day: '2021-05-10', units_sold: 3 }], 'only the paid order, on its pickup day')
    } finally {
      await pool.query('DELETE FROM payments WHERE order_id = ANY($1)', [orderIds])
      await pool.query('DELETE FROM order_details WHERE order_id = ANY($1)', [orderIds])
      await pool.query('DELETE FROM orders WHERE order_id = ANY($1)', [orderIds])
    }
  })

  test('the chart history comes from the same source as the run, with quiet days filled', async () => {
    await json(adminCookie, 'POST', '/api/forecasts/run', { source: 'ASSUMED' })
    const chart = await (await json(adminCookie, 'GET', `/api/forecasts/history/${productId}?days=28`)).json()
    assert.equal(chart.history.length, 28)
    assert.equal(chart.history.at(-1).date, yesterday)
    assert.equal(chart.forecast.length, 7)
  })

  test('the CSV export carries what each row was trained on', async () => {
    await json(adminCookie, 'POST', '/api/forecasts/run', { source: 'ASSUMED' })
    const response = await json(adminCookie, 'GET', '/api/forecasts/latest?format=csv')
    assert.match(response.headers.get('content-type'), /text\/csv/)
    const text = await response.text()
    assert.match(text.split('\r\n')[0], /"Trained on"/)
    assert.ok(text.includes('"ASSUMED"'))
  })
})
