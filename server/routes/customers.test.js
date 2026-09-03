// Lightweight integration tests for admin/cashier-facing customer record
// management. Same approach as the other route tests: real Express app on
// an ephemeral port, real database. Run with: npm test
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { after, before, describe, test } from 'node:test'
import bcrypt from 'bcrypt'
import app from '../app.js'
import { pool } from '../db.js'

const runId = crypto.randomUUID().slice(0, 8)
const randomContactNumber = () => `09${Math.floor(100000000 + Math.random() * 899999999)}`

describe('customer record management', () => {
  let server
  let baseUrl
  let adminCookie
  let cashierCookie
  let customerCookie
  let targetCustomerId
  const createdUserIds = []

  const admin = { username: `custadmin_${runId}`, password: 'Admin-Only-Password-9!' }
  const cashier = { role: 'CASHIER', name: 'Test Cashier', username: `custcash_${runId}`, email: `custcash_${runId}@example.com`, contactNumber: randomContactNumber(), password: 'Cashier-Password-9!' }
  const targetCustomer = { name: 'Findable Customer', username: `findme_${runId}`, email: `findme_${runId}@example.com`, contactNumber: randomContactNumber(), password: 'Correct-Horse-Battery-9!' }
  const otherCustomer = { name: 'Other Customer', username: `other_${runId}`, email: `other_${runId}@example.com`, contactNumber: randomContactNumber(), password: 'Correct-Horse-Battery-9!' }

  before(async () => {
    server = app.listen(0)
    await new Promise((resolve) => server.once('listening', resolve))
    baseUrl = `http://localhost:${server.address().port}`

    const adminPasswordHash = await bcrypt.hash(admin.password, 4)
    const adminResult = await pool.query(`INSERT INTO users (username, password_hash, user_type) VALUES ($1, $2, 'ADMIN') RETURNING user_id`, [admin.username, adminPasswordHash])
    createdUserIds.push(adminResult.rows[0].user_id)
    await pool.query('INSERT INTO admins (user_id, name, contact_num, email) VALUES ($1, $2, $3, $4)', [adminResult.rows[0].user_id, 'Customer Test Admin', randomContactNumber(), `custadmin_${runId}@example.com`])
    await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: admin.username, password: admin.password }) })
    const rawCode = '909090'
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

    await fetch(`${baseUrl}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...targetCustomer, confirmPassword: targetCustomer.password }) })
    const targetRow = await pool.query('SELECT user_id FROM users WHERE username = $1', [targetCustomer.username])
    targetCustomerId = targetRow.rows[0].user_id
    createdUserIds.push(targetCustomerId)
    const customerLogin = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: targetCustomer.username, password: targetCustomer.password }) })
    customerCookie = customerLogin.headers.get('set-cookie').split(';')[0]

    await fetch(`${baseUrl}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...otherCustomer, confirmPassword: otherCustomer.password }) })
    const otherRow = await pool.query('SELECT user_id FROM users WHERE username = $1', [otherCustomer.username])
    createdUserIds.push(otherRow.rows[0].user_id)
  })

  after(async () => {
    await pool.query('DELETE FROM cashiers WHERE user_id = ANY($1)', [createdUserIds])
    await pool.query('DELETE FROM customers WHERE user_id = ANY($1)', [createdUserIds])
    await pool.query('DELETE FROM admins WHERE user_id = ANY($1)', [createdUserIds])
    await pool.query('DELETE FROM users WHERE user_id = ANY($1)', [createdUserIds])
    await new Promise((resolve) => server.close(resolve))
  })

  test('GET /api/customers requires authentication', async () => {
    const response = await fetch(`${baseUrl}/api/customers`)
    assert.equal(response.status, 401)
  })

  test('GET /api/customers rejects a plain customer', async () => {
    const response = await fetch(`${baseUrl}/api/customers`, { headers: { Cookie: customerCookie } })
    assert.equal(response.status, 403)
  })

  test('GET /api/customers?search finds a customer by name for both admin and cashier', async () => {
    const asAdmin = await fetch(`${baseUrl}/api/customers?search=Findable`, { headers: { Cookie: adminCookie } })
    assert.equal(asAdmin.status, 200)
    const adminResults = (await asAdmin.json()).customers
    assert.ok(adminResults.some((customer) => customer.id === targetCustomerId))
    assert.ok(!adminResults.some((customer) => customer.name === otherCustomer.name), 'search should exclude non-matching customers')

    const asCashier = await fetch(`${baseUrl}/api/customers?search=Findable`, { headers: { Cookie: cashierCookie } })
    assert.equal(asCashier.status, 200)
    assert.ok((await asCashier.json()).customers.some((customer) => customer.id === targetCustomerId))
  })

  // COUNTER_ORDER_PLAN.md, Decision 3 — `id` (user_id) and `customerId`
  // (customers.customer_id) are two DIFFERENT numbers naming the same
  // person, verified here against the database's own row rather than
  // trusted to just look right. A caller that needs to place an order or
  // fetch addresses for someone on this list wants customerId — sending
  // `id` there is the exact mistake this field exists to prevent.
  test('each customer carries BOTH id (user_id) and customerId (customers.customer_id) — the real row\'s value, not a guess', async () => {
    const response = await fetch(`${baseUrl}/api/customers?search=Findable`, { headers: { Cookie: adminCookie } })
    const found = (await response.json()).customers.find((customer) => customer.id === targetCustomerId)
    assert.ok(found, 'the target customer must be in the results')
    assert.ok(found.customerId, 'customerId must be present')

    const realRow = await pool.query('SELECT customer_id FROM customers WHERE user_id = $1', [targetCustomerId])
    assert.equal(found.customerId, realRow.rows[0].customer_id, 'customerId must be the row\'s actual customers.customer_id')
    // Not a tautology: user_id and customer_id are independent sequences
    // (users is shared across every role; customers is its own table), so
    // asserting they differ here is what would have caught this bug
    // before it shipped, if user_id and customer_id had happened to be
    // sequential integers that could quietly line up.
    assert.notEqual(String(found.customerId), String(found.id), 'user_id and customer_id are different sequences, not aliases of the same number')
  })

  test('PATCH /api/customers/:id lets a cashier edit profile fields but not isActive', async () => {
    const editResponse = await fetch(`${baseUrl}/api/customers/${targetCustomerId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: cashierCookie }, body: JSON.stringify({ name: 'Renamed By Cashier' }) })
    assert.equal(editResponse.status, 200)
    assert.equal((await editResponse.json()).customer.name, 'Renamed By Cashier')

    const deactivateAttempt = await fetch(`${baseUrl}/api/customers/${targetCustomerId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: cashierCookie }, body: JSON.stringify({ isActive: false }) })
    assert.equal(deactivateAttempt.status, 403)
  })

  // Regression: customers.updated_at took its DEFAULT on INSERT and was
  // then never written again, so it permanently equalled created_at. It is
  // now maintained by a database trigger (see database/migrations/
  // 001_updated_at_triggers.sql), which also means this test fails loudly
  // on any database where that migration hasn't been applied.
  test('editing a customer advances updated_at but leaves created_at alone', async () => {
    const before = (await pool.query('SELECT created_at, updated_at FROM customers WHERE user_id = $1', [targetCustomerId])).rows[0]

    const response = await fetch(`${baseUrl}/api/customers/${targetCustomerId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ name: 'Timestamp Check' }) })
    assert.equal(response.status, 200)

    const after = (await pool.query('SELECT created_at, updated_at FROM customers WHERE user_id = $1', [targetCustomerId])).rows[0]
    assert.equal(after.created_at.getTime(), before.created_at.getTime(), 'created_at must never move')
    assert.ok(after.updated_at.getTime() > before.updated_at.getTime(), 'updated_at should reflect the edit — is migration 001 applied?')
  })

  test('PATCH /api/customers/:id rejects an email already used by another customer', async () => {
    const response = await fetch(`${baseUrl}/api/customers/${targetCustomerId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ email: otherCustomer.email }) })
    assert.equal(response.status, 409)
  })

  test('PATCH /api/customers/:id returns 404 for a nonexistent customer', async () => {
    const response = await fetch(`${baseUrl}/api/customers/999999999`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ name: 'Nobody' }) })
    assert.equal(response.status, 404)
  })

  // Regression: a malformed :id used to reach Postgres as an invalid
  // bigint literal and come back as a 500 instead of a 404.
  test('PATCH /api/customers/:id treats a malformed id as "not found"', async () => {
    for (const badId of ['abc', 'undefined', '1.5', '99999999999999999999']) {
      const response = await fetch(`${baseUrl}/api/customers/${badId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ name: 'Nobody' }) })
      assert.equal(response.status, 404, `id "${badId}"`)
    }
  })

  test('PATCH /api/customers/:id lets an admin deactivate, which blocks the customer\'s next login', async () => {
    const deactivateResponse = await fetch(`${baseUrl}/api/customers/${targetCustomerId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ isActive: false }) })
    assert.equal(deactivateResponse.status, 200)
    assert.equal((await deactivateResponse.json()).customer.isActive, false)

    const blockedLogin = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: targetCustomer.username, password: targetCustomer.password }) })
    assert.equal(blockedLogin.status, 401)

    // Restore for cleanliness, though the after() hook deletes this user anyway.
    await fetch(`${baseUrl}/api/customers/${targetCustomerId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ isActive: true }) })
  })
})

after(async () => {
  await pool.end()
})
