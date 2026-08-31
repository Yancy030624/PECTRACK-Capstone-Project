// Lightweight integration tests for the admin-only staff routes. Same
// approach as auth.test.js: real Express app on an ephemeral port, real
// database. Run with: npm test
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { after, before, describe, test } from 'node:test'
import bcrypt from 'bcrypt'
import app from '../app.js'
import { pool } from '../db.js'

const runId = crypto.randomUUID().slice(0, 8)
const randomContactNumber = () => `09${Math.floor(100000000 + Math.random() * 899999999)}`

async function deleteTestUser(userId) {
  await pool.query('DELETE FROM customers WHERE user_id = $1', [userId])
  await pool.query('DELETE FROM admins WHERE user_id = $1', [userId])
  await pool.query('DELETE FROM cashiers WHERE user_id = $1', [userId])
  await pool.query('DELETE FROM delivery_personnel WHERE user_id = $1', [userId])
  await pool.query('DELETE FROM users WHERE user_id = $1', [userId])
}

describe('staff routes require an authenticated admin', () => {
  let server
  let baseUrl
  let adminCookie
  let customerCookie
  const createdUserIds = []

  const admin = { username: `staffadmin_${runId}`, email: `staffadmin_${runId}@example.com`, password: 'Admin-Only-Password-9!' }
  const customer = { name: 'Test Customer', username: `staffcust_${runId}`, email: `staffcust_${runId}@example.com`, contactNumber: randomContactNumber(), password: 'Correct-Horse-Battery-9!' }

  before(async () => {
    server = app.listen(0)
    await new Promise((resolve) => server.once('listening', resolve))
    baseUrl = `http://localhost:${server.address().port}`

    // Seed an admin directly (no API path for this — admins are seeded
    // manually, not created through the app).
    const adminPasswordHash = await bcrypt.hash(admin.password, 4)
    const adminResult = await pool.query(`INSERT INTO users (username, password_hash, user_type) VALUES ($1, $2, 'ADMIN') RETURNING user_id`, [admin.username, adminPasswordHash])
    createdUserIds.push(adminResult.rows[0].user_id)
    await pool.query('INSERT INTO admins (user_id, name, contact_num, email) VALUES ($1, $2, $3, $4)', [adminResult.rows[0].user_id, 'Staff Test Admin', randomContactNumber(), admin.email])

    // Log the admin in through the real OTP flow so the session cookie
    // exercises the same path a real admin would use.
    await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: admin.username, password: admin.password }) })
    const rawCode = '123456'
    await pool.query(`INSERT INTO otp_codes (user_id, code_hash, expires_at) VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '5 minutes')`, [adminResult.rows[0].user_id, crypto.createHash('sha256').update(rawCode).digest('hex')])
    const otpResponse = await fetch(`${baseUrl}/api/auth/verify-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: admin.username, code: rawCode }) })
    adminCookie = otpResponse.headers.get('set-cookie').split(';')[0]

    // Register and log in an ordinary customer, to prove non-admins are
    // rejected by these routes.
    await fetch(`${baseUrl}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...customer, confirmPassword: customer.password }) })
    const { rows } = await pool.query('SELECT user_id FROM users WHERE username = $1', [customer.username])
    createdUserIds.push(rows[0].user_id)
    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: customer.username, password: customer.password }) })
    customerCookie = loginResponse.headers.get('set-cookie').split(';')[0]
  })

  after(async () => {
    for (const userId of createdUserIds) await deleteTestUser(userId)
    await new Promise((resolve) => server.close(resolve))
  })

  test('GET /api/staff rejects an unauthenticated request', async () => {
    const response = await fetch(`${baseUrl}/api/staff`)
    assert.equal(response.status, 401)
  })

  test('GET /api/staff rejects a logged-in customer (403, not 401)', async () => {
    const response = await fetch(`${baseUrl}/api/staff`, { headers: { Cookie: customerCookie } })
    assert.equal(response.status, 403)
  })

  test('POST /api/staff rejects a logged-in customer', async () => {
    const response = await fetch(`${baseUrl}/api/staff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: customerCookie },
      body: JSON.stringify({ role: 'CASHIER', name: 'Nope', username: `shouldnotexist_${runId}`, email: `nope_${runId}@example.com`, contactNumber: randomContactNumber(), password: 'Whatever-Password-9!', confirmPassword: 'Whatever-Password-9!' }),
    })
    assert.equal(response.status, 403)
    const { rows } = await pool.query('SELECT 1 FROM users WHERE username = $1', [`shouldnotexist_${runId}`])
    assert.equal(rows.length, 0)
  })

  test('POST /api/staff rejects an invalid role', async () => {
    const response = await fetch(`${baseUrl}/api/staff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ role: 'ADMIN', name: 'Nope', username: `nope2_${runId}`, email: `nope2_${runId}@example.com`, contactNumber: randomContactNumber(), password: 'Whatever-Password-9!', confirmPassword: 'Whatever-Password-9!' }),
    })
    assert.equal(response.status, 422)
  })

  test('POST /api/staff creates a cashier account, and GET /api/staff lists it', async () => {
    const cashier = { role: 'CASHIER', name: 'Test Cashier', username: `cashier_${runId}`, email: `cashier_${runId}@example.com`, contactNumber: randomContactNumber(), password: 'Cashier-Password-9!', confirmPassword: 'Cashier-Password-9!' }
    const createResponse = await fetch(`${baseUrl}/api/staff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify(cashier),
    })
    assert.equal(createResponse.status, 201)
    const createBody = await createResponse.json()
    assert.equal(createBody.user.username, cashier.username)
    assert.equal(createBody.user.role, 'CASHIER')

    const { rows } = await pool.query('SELECT user_id FROM users WHERE username = $1', [cashier.username])
    createdUserIds.push(rows[0].user_id)

    const listResponse = await fetch(`${baseUrl}/api/staff`, { headers: { Cookie: adminCookie } })
    assert.equal(listResponse.status, 200)
    const listBody = await listResponse.json()
    const listed = listBody.staff.find((entry) => entry.username === cashier.username)
    assert.ok(listed, 'newly created cashier should appear in the staff list')
    assert.equal(listed.role, 'CASHIER')
    assert.equal(listed.name, cashier.name)
    assert.equal(listed.isActive, true)
  })

  test('the new cashier account can log in with the password the admin set', async () => {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: `cashier_${runId}`, password: 'Cashier-Password-9!' }),
    })
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.user.role, 'CASHIER')
  })

  test('POST /api/staff rejects a duplicate username', async () => {
    const response = await fetch(`${baseUrl}/api/staff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ role: 'DELIVERY_PERSONNEL', name: 'Duplicate', username: `cashier_${runId}`, email: `duplicate_${runId}@example.com`, contactNumber: randomContactNumber(), password: 'Another-Password-9!', confirmPassword: 'Another-Password-9!' }),
    })
    assert.equal(response.status, 409)
  })
})

describe('editing and deactivating a staff account', () => {
  let server
  let baseUrl
  let adminCookie
  let customerCookie
  let cashierId
  let secondCashierEmail
  const createdUserIds = []

  const admin = { username: `editadmin_${runId}`, password: 'Admin-Only-Password-9!' }
  const customer = { name: 'Test Customer', username: `editcust_${runId}`, email: `editcust_${runId}@example.com`, contactNumber: randomContactNumber(), password: 'Correct-Horse-Battery-9!' }
  const cashier = { role: 'CASHIER', name: 'Edit Target', username: `edittarget_${runId}`, email: `edittarget_${runId}@example.com`, contactNumber: randomContactNumber(), password: 'Cashier-Password-9!' }
  const secondCashier = { role: 'CASHIER', name: 'Other Cashier', username: `othercashier_${runId}`, email: `othercashier_${runId}@example.com`, contactNumber: randomContactNumber(), password: 'Cashier-Password-9!' }

  before(async () => {
    server = app.listen(0)
    await new Promise((resolve) => server.once('listening', resolve))
    baseUrl = `http://localhost:${server.address().port}`

    const adminPasswordHash = await bcrypt.hash(admin.password, 4)
    const adminResult = await pool.query(`INSERT INTO users (username, password_hash, user_type) VALUES ($1, $2, 'ADMIN') RETURNING user_id`, [admin.username, adminPasswordHash])
    createdUserIds.push(adminResult.rows[0].user_id)
    await pool.query('INSERT INTO admins (user_id, name, contact_num, email) VALUES ($1, $2, $3, $4)', [adminResult.rows[0].user_id, 'Edit Test Admin', randomContactNumber(), `editadmin_${runId}@example.com`])
    await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: admin.username, password: admin.password }) })
    const rawCode = '654321'
    await pool.query(`INSERT INTO otp_codes (user_id, code_hash, expires_at) VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '5 minutes')`, [adminResult.rows[0].user_id, crypto.createHash('sha256').update(rawCode).digest('hex')])
    const otpResponse = await fetch(`${baseUrl}/api/auth/verify-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: admin.username, code: rawCode }) })
    adminCookie = otpResponse.headers.get('set-cookie').split(';')[0]

    await fetch(`${baseUrl}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...customer, confirmPassword: customer.password }) })
    const customerRow = await pool.query('SELECT user_id FROM users WHERE username = $1', [customer.username])
    createdUserIds.push(customerRow.rows[0].user_id)
    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: customer.username, password: customer.password }) })
    customerCookie = loginResponse.headers.get('set-cookie').split(';')[0]

    const createResponse = await fetch(`${baseUrl}/api/staff`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ ...cashier, confirmPassword: cashier.password }) })
    assert.equal(createResponse.status, 201)
    const cashierRow = await pool.query('SELECT user_id FROM users WHERE username = $1', [cashier.username])
    cashierId = cashierRow.rows[0].user_id
    createdUserIds.push(cashierId)

    const secondResponse = await fetch(`${baseUrl}/api/staff`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ ...secondCashier, confirmPassword: secondCashier.password }) })
    assert.equal(secondResponse.status, 201)
    const secondRow = await pool.query('SELECT user_id FROM users WHERE username = $1', [secondCashier.username])
    createdUserIds.push(secondRow.rows[0].user_id)
    secondCashierEmail = secondCashier.email
  })

  after(async () => {
    for (const userId of createdUserIds) await deleteTestUser(userId)
    await new Promise((resolve) => server.close(resolve))
  })

  test('PATCH /api/staff/:id rejects a logged-in customer', async () => {
    const response = await fetch(`${baseUrl}/api/staff/${cashierId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: customerCookie }, body: JSON.stringify({ name: 'Nope' }) })
    assert.equal(response.status, 403)
  })

  test('PATCH /api/staff/:id returns 404 for a nonexistent account', async () => {
    const response = await fetch(`${baseUrl}/api/staff/999999999`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ name: 'Nobody' }) })
    assert.equal(response.status, 404)
  })

  // Regression: a malformed :id used to reach Postgres as an invalid
  // bigint literal and come back as a 500 instead of a 404.
  test('PATCH /api/staff/:id treats a malformed id as "not found"', async () => {
    for (const badId of ['abc', 'undefined', '1.5', '99999999999999999999']) {
      const response = await fetch(`${baseUrl}/api/staff/${badId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ name: 'Nobody' }) })
      assert.equal(response.status, 404, `id "${badId}"`)
    }
  })

  test('PATCH /api/staff/:id rejects an invalid email without touching other fields', async () => {
    const response = await fetch(`${baseUrl}/api/staff/${cashierId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ email: 'not-an-email' }) })
    assert.equal(response.status, 422)
    const body = await response.json()
    assert.ok(body.errors.email)
  })

  test('PATCH /api/staff/:id rejects an email already used by another staff account', async () => {
    const response = await fetch(`${baseUrl}/api/staff/${cashierId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ email: secondCashierEmail }) })
    assert.equal(response.status, 409)
  })

  test('PATCH /api/staff/:id updates name/email/contactNumber, and the change persists', async () => {
    const newContactNumber = randomContactNumber()
    const response = await fetch(`${baseUrl}/api/staff/${cashierId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ name: 'Renamed Cashier', email: `renamed_${runId}@example.com`, contactNumber: newContactNumber }),
    })
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.staff.name, 'Renamed Cashier')
    assert.equal(body.staff.email, `renamed_${runId}@example.com`)
    assert.equal(body.staff.contactNumber, newContactNumber)

    // Re-fetch independently to confirm this was actually persisted, not
    // just echoed back from the request.
    const listResponse = await fetch(`${baseUrl}/api/staff`, { headers: { Cookie: adminCookie } })
    const listBody = await listResponse.json()
    const listed = listBody.staff.find((entry) => entry.id === cashierId)
    assert.equal(listed.name, 'Renamed Cashier')
    assert.equal(listed.username, cashier.username, 'username must be unchanged — editing does not touch it')
  })

  test('PATCH /api/staff/:id deactivating an account blocks its next login, and reactivating restores it', async () => {
    const deactivateResponse = await fetch(`${baseUrl}/api/staff/${cashierId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ isActive: false }) })
    assert.equal(deactivateResponse.status, 200)
    assert.equal((await deactivateResponse.json()).staff.isActive, false)

    const blockedLogin = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: cashier.username, password: cashier.password }) })
    assert.equal(blockedLogin.status, 401)

    const reactivateResponse = await fetch(`${baseUrl}/api/staff/${cashierId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ isActive: true }) })
    assert.equal(reactivateResponse.status, 200)
    assert.equal((await reactivateResponse.json()).staff.isActive, true)

    const restoredLogin = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: cashier.username, password: cashier.password }) })
    assert.equal(restoredLogin.status, 200)
  })
})

after(async () => {
  await pool.end()
})
