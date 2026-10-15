// Tests for the security audit trail (RULES-PLANS/SECURITY_REVIEW.md
// finding J, migration 015).
//
// Two things are being checked, and the second matters more than the
// first: that the events are written at all, and that none of them ever
// carries a secret. A log that records the thing it is logging is worse
// than no log, because it concentrates every credential in one table.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { after, before, beforeEach, describe, test } from 'node:test'
import bcrypt from 'bcrypt'
import app from '../app.js'
import { pool } from '../db.js'
import { resetRateLimits } from './security.js'

const runId = crypto.randomUUID().slice(0, 8)
const randomContactNumber = () => `09${Math.floor(100000000 + Math.random() * 899999999)}`

describe('security event logging', () => {
  let server
  let baseUrl
  let adminUserId
  let customerUserId

  const admin = { username: `evtadmin_${runId}`, password: 'Admin-Event-Password-9!' }
  const customer = {
    name: 'Event Customer', firstName: 'Event', lastName: 'Customer', agree: true,
    username: `evtcust_${runId}`,
    email: `evtcust_${runId}@example.com`,
    contactNumber: randomContactNumber(),
    password: 'Correct-Horse-Battery-9!',
  }

  // recordSecurityEvent is deliberately not awaited by its callers: a
  // sign-in should not wait on an insert nobody is reading in real time,
  // and an audit write failing must never turn a successful login into a
  // 500. That means the row can land a few milliseconds after the
  // response, so a test that queries immediately is racing it. This polls
  // briefly rather than pretending the write is synchronous — or, worse,
  // making the application await it just to suit a test.
  const eventsFor = async (userId, type, { expected = 1 } = {}) => {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const result = await pool.query(
        'SELECT * FROM security_events WHERE user_id = $1 AND event_type = $2 ORDER BY created_at DESC',
        [userId, type],
      )
      if (result.rows.length >= expected) return result.rows
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
    return (await pool.query(
      'SELECT * FROM security_events WHERE user_id = $1 AND event_type = $2 ORDER BY created_at DESC',
      [userId, type],
    )).rows
  }

  before(async () => {
    server = app.listen(0)
    await new Promise((resolve) => server.once('listening', resolve))
    baseUrl = `http://localhost:${server.address().port}`

    const passwordHash = await bcrypt.hash(admin.password, 4)
    const result = await pool.query(
      `INSERT INTO users (username, password_hash, user_type) VALUES ($1, $2, 'ADMIN') RETURNING user_id`,
      [admin.username, passwordHash],
    )
    adminUserId = result.rows[0].user_id
    await pool.query('INSERT INTO admins (user_id, name, contact_num, email) VALUES ($1, $2, $3, $4)', [adminUserId, 'Event Admin', randomContactNumber(), `evtadmin_${runId}@example.com`])

    await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...customer, confirmPassword: customer.password }),
    })
    const customerRow = await pool.query('SELECT user_id FROM users WHERE username = $1', [customer.username])
    customerUserId = customerRow.rows[0].user_id
  })

  after(async () => {
    // security_events.user_id is ON DELETE SET NULL, so the rows survive
    // their accounts — which is the intended behaviour, and why this
    // clears them by id BEFORE the users go.
    await pool.query('DELETE FROM security_events WHERE user_id = ANY($1) OR username LIKE $2', [[adminUserId, customerUserId], `evt%_${runId}`])
    await pool.query('DELETE FROM customers WHERE user_id = $1', [customerUserId])
    await pool.query('DELETE FROM admins WHERE user_id = $1', [adminUserId])
    await pool.query('DELETE FROM users WHERE user_id = ANY($1)', [[adminUserId, customerUserId]])
    await new Promise((resolve) => server.close(resolve))
    await pool.end()
  })

  beforeEach(resetRateLimits)

  test('self-registration is recorded', async () => {
    const events = await eventsFor(customerUserId, 'ACCOUNT_CREATED')
    assert.equal(events.length, 1)
    assert.equal(events[0].username, customer.username)
    assert.match(events[0].detail, /CUSTOMER/)
  })

  test('a successful sign-in, and then the logout, are both recorded', async () => {
    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: customer.username, password: customer.password }),
    })
    const cookie = login.headers.get('set-cookie').split(';')[0]

    const success = await eventsFor(customerUserId, 'LOGIN_SUCCESS')
    assert.ok(success.length >= 1)
    assert.equal(success[0].detail, 'CUSTOMER')
    // The session id is the credential this request just created. It must
    // never appear in the log that records the request.
    assert.equal(success[0].detail.includes(cookie.split('=')[1]), false)

    await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST', headers: { Cookie: cookie } })
    assert.ok((await eventsFor(customerUserId, 'LOGOUT')).length >= 1)
  })

  test('a wrong password is recorded against the account, with no password in the row', async () => {
    await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: customer.username, password: 'this-is-the-wrong-password' }),
    })

    const failures = await eventsFor(customerUserId, 'LOGIN_FAILURE')
    assert.ok(failures.length >= 1)
    assert.equal(failures[0].detail, 'wrong password')
    const row = JSON.stringify(failures[0])
    assert.equal(row.includes('this-is-the-wrong-password'), false, 'the attempted password must never be stored')
  })

  test('a sign-in attempt on a username nobody owns is still recorded', async () => {
    // The point of logging this: a burst of failures against names that do
    // not exist is exactly the pattern worth seeing, and a per-account
    // counter cannot see it. The RESPONSE stays identical, so this writes
    // to a table without becoming an enumeration oracle.
    // The typed identifier is deliberately NOT kept when it matches no
    // account: people type their password into the username box, and
    // storing raw input would put that password in this table. So the
    // event is found by time and detail rather than by name.
    const ghost = `evtghost_${runId}`
    const startedAt = new Date()
    await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: ghost, password: 'whatever-it-is' }),
    })
    let rows = []
    for (let attempt = 0; attempt < 40 && rows.length === 0; attempt += 1) {
      rows = (await pool.query(`SELECT user_id, username, detail FROM security_events WHERE detail = 'no such account' AND created_at >= $1`, [startedAt])).rows
      if (rows.length === 0) await new Promise((resolve) => setTimeout(resolve, 25))
    }
    assert.ok(rows.length >= 1)
    assert.equal(rows[0].user_id, null, 'there is no account to attach it to, and that is expected')
    assert.equal(rows[0].username, null, 'and nothing the caller typed is stored')
    const anywhere = await pool.query('SELECT 1 FROM security_events WHERE username = $1 OR detail LIKE $2', [ghost, `%${ghost}%`])
    assert.equal(anywhere.rowCount, 0)
  })

  test('an admin OTP is recorded as issued, and the code itself never reaches the table', async () => {
    const challenge = await (await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: admin.username, password: admin.password }),
    })).json()

    const issued = await eventsFor(adminUserId, 'OTP_ISSUED')
    assert.ok(issued.length >= 1)

    const knownCode = '975310'
    await pool.query('UPDATE otp_codes SET code_hash = $2 WHERE challenge_token = $1', [challenge.challengeToken, crypto.createHash('sha256').update(knownCode).digest('hex')])

    // A wrong code first, then the right one.
    await fetch(`${baseUrl}/api/auth/verify-otp`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeToken: challenge.challengeToken, code: '000000' }),
    })
    await fetch(`${baseUrl}/api/auth/verify-otp`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeToken: challenge.challengeToken, code: knownCode }),
    })

    assert.ok((await eventsFor(adminUserId, 'OTP_FAILURE')).length >= 1)
    assert.ok((await eventsFor(adminUserId, 'OTP_SUCCESS')).length >= 1)

    // The whole table, for this admin, must contain neither code nor the
    // challenge token — the two secrets this flow handles.
    const all = await pool.query('SELECT * FROM security_events WHERE user_id = $1', [adminUserId])
    const dump = JSON.stringify(all.rows)
    assert.equal(dump.includes(knownCode), false, 'the OTP code must never be logged')
    assert.equal(dump.includes('000000'), false, 'not even a wrong guess is logged')
    assert.equal(dump.includes(challenge.challengeToken), false, 'the challenge token must never be logged')
  })

  test('a password reset request is recorded without the reset token', async () => {
    await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: customer.email }),
    })

    const requested = await eventsFor(customerUserId, 'PASSWORD_RESET_REQUESTED')
    assert.equal(requested.length, 1)

    // The token that was just minted is in password_reset_tokens as a
    // hash; whatever it was, no part of it may have reached this table.
    const dump = JSON.stringify(requested[0])
    assert.equal(/[A-Za-z0-9_-]{40,}/.test(dump), false, 'nothing token-shaped may appear in the event')
  })

  test('every event carries the caller address and a truncated user agent', async () => {
    await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'x'.repeat(400) },
      body: JSON.stringify({ identifier: customer.username, password: 'wrong-again-here' }),
    })
    const failures = await eventsFor(customerUserId, 'LOGIN_FAILURE')
    assert.ok(failures[0].ip_address, 'an event with no address cannot answer "who was hammering us"')
    assert.ok(failures[0].user_agent.length <= 255, 'a caller must not be able to write kilobytes into this table')
  })
})
