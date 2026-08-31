// Lightweight integration tests for the auth routes. Uses Node's built-in
// test runner (node:test) — no extra dependency — and hits the real
// Express app on an ephemeral local port, against the real database
// configured in .env. Run with: npm test
//
// Deliberately NOT covered here (kept out of scope for a "lightweight"
// suite): the 5-attempt account lockout timing, rate limiting (not yet
// implemented — deferred), and malformed-JSON handling (exercised
// manually during Phase 2 review).
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { after, before, describe, test } from 'node:test'
import bcrypt from 'bcrypt'
import app from '../app.js'
import { pool } from '../db.js'

const runId = crypto.randomUUID().slice(0, 8)
const randomContactNumber = () => `09${Math.floor(100000000 + Math.random() * 899999999)}`

// Deletes a seeded test user. customers/admins reference users(user_id)
// WITHOUT ON DELETE CASCADE (only sessions/otp_codes cascade — see
// database/schema.sql), so the role-table row must be deleted before the
// users row or this hits a foreign-key violation.
async function deleteTestUser(userId) {
  await pool.query('DELETE FROM customers WHERE user_id = $1', [userId])
  await pool.query('DELETE FROM admins WHERE user_id = $1', [userId])
  await pool.query('DELETE FROM users WHERE user_id = $1', [userId])
}

describe('customer registration and session lifecycle', () => {
  let server
  let baseUrl
  let sessionCookie
  let createdUserId

  const customer = {
    name: 'Test Customer',
    username: `testcust_${runId}`,
    email: `testcust_${runId}@example.com`,
    contactNumber: randomContactNumber(),
    password: 'Correct-Horse-Battery-9!',
  }

  before(async () => {
    server = app.listen(0)
    await new Promise((resolve) => server.once('listening', resolve))
    baseUrl = `http://localhost:${server.address().port}`
  })

  after(async () => {
    if (createdUserId) await deleteTestUser(createdUserId)
    await new Promise((resolve) => server.close(resolve))
  })

  test('GET /api/health responds ok', async () => {
    const response = await fetch(`${baseUrl}/api/health`)
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { status: 'ok' })
  })

  test('POST /api/auth/register rejects an invalid payload', async () => {
    const response = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...customer, password: 'short', confirmPassword: 'short' }),
    })
    assert.equal(response.status, 422)
    const body = await response.json()
    assert.ok(body.errors.password)
  })

  test('POST /api/auth/register creates a customer account', async () => {
    const response = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...customer, confirmPassword: customer.password }),
    })
    assert.equal(response.status, 201)
    const body = await response.json()
    assert.equal(body.user.username, customer.username)

    const { rows } = await pool.query('SELECT user_id FROM users WHERE username = $1', [customer.username])
    createdUserId = rows[0].user_id
  })

  test('POST /api/auth/register rejects a duplicate username', async () => {
    const response = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...customer, confirmPassword: customer.password }),
    })
    assert.equal(response.status, 409)
  })

  test('POST /api/auth/login gives an identical response for a wrong password and an unknown user (enumeration-safe)', async () => {
    const wrongPassword = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: customer.username, password: 'not-the-password' }),
    })
    const unknownUser = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: `nobody_${runId}`, password: 'whatever' }),
    })
    assert.equal(wrongPassword.status, 401)
    assert.equal(unknownUser.status, 401)
    assert.deepEqual(await wrongPassword.json(), await unknownUser.json())
  })

  test('POST /api/auth/login succeeds with correct credentials and sets a session cookie', async () => {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: customer.username, password: customer.password }),
    })
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.user.username, customer.username)
    assert.equal(body.user.role, 'CUSTOMER')

    const setCookie = response.headers.get('set-cookie')
    assert.ok(setCookie?.startsWith('pectrack_sid='))
    sessionCookie = setCookie.split(';')[0]
  })

  test('GET /api/auth/me rejects a request with no session cookie', async () => {
    const response = await fetch(`${baseUrl}/api/auth/me`)
    assert.equal(response.status, 401)
  })

  test('GET /api/auth/me confirms the session from the cookie', async () => {
    const response = await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: sessionCookie } })
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.user.username, customer.username)
  })

  test('PATCH /api/auth/me requires authentication', async () => {
    const response = await fetch(`${baseUrl}/api/auth/me`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Nope' }) })
    assert.equal(response.status, 401)
  })

  test('PATCH /api/auth/me lets the logged-in customer edit their own name and contact number', async () => {
    const newContactNumber = randomContactNumber()
    const response = await fetch(`${baseUrl}/api/auth/me`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({ name: 'Renamed Self', contactNumber: newContactNumber }),
    })
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.user.name, 'Renamed Self')
    assert.equal(body.user.username, customer.username, 'username must be unchanged — this endpoint never touches it')

    // Re-fetch independently to confirm this was actually persisted, not
    // just echoed back from the request.
    const persisted = await pool.query('SELECT c.name, c.contact_num FROM customers c JOIN users u ON u.user_id = c.user_id WHERE u.username = $1', [customer.username])
    assert.equal(persisted.rows[0].name, 'Renamed Self')
    assert.equal(persisted.rows[0].contact_num, newContactNumber)
  })

  test('PATCH /api/auth/me rejects an invalid email', async () => {
    const response = await fetch(`${baseUrl}/api/auth/me`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: sessionCookie }, body: JSON.stringify({ email: 'not-an-email' }) })
    assert.equal(response.status, 422)
    assert.ok((await response.json()).errors.email)
  })

  test('POST /api/auth/logout ends the session', async () => {
    const logoutResponse = await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST', headers: { Cookie: sessionCookie } })
    assert.equal(logoutResponse.status, 204)

    const meResponse = await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: sessionCookie } })
    assert.equal(meResponse.status, 401)
  })
})

describe('admin login requires OTP', () => {
  let server
  let baseUrl
  let adminUserId

  const admin = {
    username: `testadmin_${runId}`,
    email: `testadmin_${runId}@example.com`,
    password: 'Admin-Only-Password-9!',
  }

  before(async () => {
    server = app.listen(0)
    await new Promise((resolve) => server.once('listening', resolve))
    baseUrl = `http://localhost:${server.address().port}`

    // Seeded directly — there's no API endpoint to create an admin yet
    // (that's Phase 3 work). Cost factor 4 instead of the route's 12
    // purely for test speed; bcrypt.compare works with any cost the hash
    // was created at.
    const passwordHash = await bcrypt.hash(admin.password, 4)
    const userResult = await pool.query(
      `INSERT INTO users (username, password_hash, user_type) VALUES ($1, $2, 'ADMIN') RETURNING user_id`,
      [admin.username, passwordHash],
    )
    adminUserId = userResult.rows[0].user_id
    await pool.query('INSERT INTO admins (user_id, name, contact_num, email) VALUES ($1, $2, $3, $4)', [adminUserId, 'Test Admin', randomContactNumber(), admin.email])
  })

  after(async () => {
    if (adminUserId) await deleteTestUser(adminUserId)
    await new Promise((resolve) => server.close(resolve))
  })

  test('POST /api/auth/login defers an admin to OTP instead of starting a session', async () => {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: admin.username, password: admin.password }),
    })
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { otpRequired: true, username: admin.username })
    assert.equal(response.headers.get('set-cookie'), null)
  })

  test('POST /api/auth/verify-otp rejects a wrong code', async () => {
    // Seed a known OTP directly rather than going through /login's random
    // code generation, so this test controls the exact code without
    // scraping the console.log the route uses as a stand-in for SMS.
    const codeHash = crypto.createHash('sha256').update('111111').digest('hex')
    await pool.query(`INSERT INTO otp_codes (user_id, code_hash, expires_at) VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '5 minutes')`, [adminUserId, codeHash])

    const response = await fetch(`${baseUrl}/api/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: admin.username, code: '000000' }),
    })
    assert.equal(response.status, 401)
  })

  test('POST /api/auth/verify-otp accepts the correct code once, then rejects reuse of the same code', async () => {
    const rawCode = '222222'
    const codeHash = crypto.createHash('sha256').update(rawCode).digest('hex')
    await pool.query(`INSERT INTO otp_codes (user_id, code_hash, expires_at) VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '5 minutes')`, [adminUserId, codeHash])

    const first = await fetch(`${baseUrl}/api/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: admin.username, code: rawCode }),
    })
    assert.equal(first.status, 200)
    assert.ok(first.headers.get('set-cookie')?.startsWith('pectrack_sid='))

    const second = await fetch(`${baseUrl}/api/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: admin.username, code: rawCode }),
    })
    assert.equal(second.status, 401)
  })
})

// Runs once after every test in this file (both describe blocks above) has
// finished — closing the pool any earlier would break whichever describe
// block hasn't run its database queries yet.
after(async () => {
  await pool.end()
})
