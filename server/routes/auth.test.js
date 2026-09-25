// Lightweight integration tests for the auth routes. Uses Node's built-in
// test runner (node:test) — no extra dependency — and hits the real
// Express app on an ephemeral local port, against the real database
// configured in .env. Run with: npm test
//
// Deliberately NOT covered here (kept out of scope for a "lightweight"
// suite): rate limiting (not yet implemented — deferred) and
// malformed-JSON handling (exercised manually during Phase 2 review).
// The account lockout IS covered, in the last describe block below.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { after, before, beforeEach, describe, test } from 'node:test'
import bcrypt from 'bcrypt'
import app from '../app.js'
import { resetRateLimits } from '../lib/security.js'
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
  // The rate limiter (lib/security.js) counts by client IP, and every
  // request in this suite comes from the same one — so without a reset
  // the tests would throttle each other rather than the abuse the limiter
  // exists to stop. Resetting per test is ordinary test isolation: the
  // limiter itself is untouched and fully active in production.
  beforeEach(resetRateLimits)

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

  test('POST /api/auth/login accepts a customer at the customer door and turns them away at the staff door', async () => {
    const login = (audience) => fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: customer.username, password: customer.password, audience }),
    })

    const rightDoor = await login('customer')
    assert.equal(rightDoor.status, 200)

    const wrongDoor = await login('staff')
    assert.equal(wrongDoor.status, 403)
    const body = await wrongDoor.json()
    // The refusal names the door that WOULD have worked, so the form can
    // offer a one-click switch — and it leaves no session behind.
    assert.equal(body.audience, 'customer')
    assert.match(body.message, /customer account/i)
    assert.equal(wrongDoor.headers.get('set-cookie'), null)

    // An unknown audience is treated as "no door declared", the same as
    // omitting the field — that is what keeps the seed scripts working.
    const noDoor = await login('something-else')
    assert.equal(noDoor.status, 200)
  })

  test('POST /api/auth/login still answers 401, not 403, when the password is wrong at the other door', async () => {
    // The door check must never become an oracle: a wrong password gets
    // the same enumeration-safe 401 whatever audience was declared.
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: customer.username, password: 'not-the-password', audience: 'staff' }),
    })
    assert.equal(response.status, 401)
    assert.equal((await response.json()).audience, undefined)
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

  // PATCH /api/auth/password — until this existed there was no way for
  // anyone to change their own password, which meant an admin permanently
  // knew the password of every staff account they created.
  describe('changing your own password', () => {
    const changePassword = (body, cookie = sessionCookie) =>
      fetch(`${baseUrl}/api/auth/password`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(body) })

    test('requires authentication', async () => {
      const response = await fetch(`${baseUrl}/api/auth/password`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword: 'x', newPassword: 'y', confirmPassword: 'y' }) })
      assert.equal(response.status, 401)
    })

    // A valid session must not be enough on its own — otherwise anyone who
    // got hold of a signed-in browser could lock the owner out for good.
    test('rejects a wrong current password even though the session is valid', async () => {
      const response = await changePassword({ currentPassword: 'not-my-password', newPassword: 'Brand-New-Password-1!', confirmPassword: 'Brand-New-Password-1!' })
      assert.equal(response.status, 422)
      assert.ok((await response.json()).errors.currentPassword)

      // The old password must still work — nothing should have changed.
      const stillWorks = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: customer.username, password: customer.password }) })
      assert.equal(stillWorks.status, 200)
    })

    test('rejects a weak new password and a mismatched confirmation', async () => {
      const weak = await changePassword({ currentPassword: customer.password, newPassword: 'short', confirmPassword: 'short' })
      assert.equal(weak.status, 422)
      assert.ok((await weak.json()).errors.newPassword)

      const mismatched = await changePassword({ currentPassword: customer.password, newPassword: 'Brand-New-Password-1!', confirmPassword: 'Something-Else-1!' })
      assert.equal(mismatched.status, 422)
      assert.ok((await mismatched.json()).errors.confirmPassword)
    })

    test('rejects reusing the current password as the new one', async () => {
      const response = await changePassword({ currentPassword: customer.password, newPassword: customer.password, confirmPassword: customer.password })
      assert.equal(response.status, 422)
      assert.ok((await response.json()).errors.newPassword)
    })

    test('changes the password, ends other sessions, and keeps the caller signed in', async () => {
      // A second session for the same account, standing in for the same
      // person signed in on another device — or an intruder.
      const otherLogin = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: customer.username, password: customer.password }) })
      const otherCookie = otherLogin.headers.get('set-cookie').split(';')[0]
      assert.equal((await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: otherCookie } })).status, 200)

      const newPassword = 'Rotated-Password-9!'
      const response = await changePassword({ currentPassword: customer.password, newPassword, confirmPassword: newPassword })
      assert.equal(response.status, 200)
      assert.ok((await response.json()).otherSessionsEnded >= 1)

      // The other device is signed out — otherwise changing a password
      // after a compromise would leave the intruder's session working.
      assert.equal((await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: otherCookie } })).status, 401)
      // ...but the caller's own session survives, so they aren't kicked out
      // of the page they just used.
      assert.equal((await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: sessionCookie } })).status, 200)

      // The old password no longer works and the new one does.
      const oldPassword = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: customer.username, password: customer.password }) })
      assert.equal(oldPassword.status, 401)
      const withNew = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: customer.username, password: newPassword }) })
      assert.equal(withNew.status, 200)

      // Put it back, so the logout test below still has working credentials.
      customer.password = newPassword
    })
  })

  test('POST /api/auth/logout ends the session', async () => {
    const logoutResponse = await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST', headers: { Cookie: sessionCookie } })
    assert.equal(logoutResponse.status, 204)

    const meResponse = await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: sessionCookie } })
    assert.equal(meResponse.status, 401)
  })

  // "Remember me" was a checkbox wired to nothing. Unticked now means a
  // browser-session cookie (no Max-Age); ticked or omitted keeps the
  // 7-day cookie every login has always produced.
  test('POST /api/auth/login honours rememberMe: false with a session cookie that carries no Max-Age', async () => {
    const remembered = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: customer.username, password: customer.password }) })
    assert.equal(remembered.status, 200)
    assert.match(remembered.headers.get('set-cookie'), /Max-Age=/)

    const forgotten = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: customer.username, password: customer.password, rememberMe: false }) })
    assert.equal(forgotten.status, 200)
    const cookie = forgotten.headers.get('set-cookie')
    assert.doesNotMatch(cookie, /Max-Age=/)
    assert.doesNotMatch(cookie, /Expires=/)
    // Still a working session — only the cookie's lifetime differs.
    const me = await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: cookie.split(';')[0] } })
    assert.equal(me.status, 200)
  })

  // Email password recovery (migration 010). The token never leaves the
  // server except inside the email, so the test reads the stored hash's
  // row only to prove it exists — and gets the token itself by capturing
  // what lib/mail.js prints when SMTP is not configured.
  test('forgot-password answers identically for known and unknown emails, and the emailed link resets the password once', async () => {
    const unknown = await fetch(`${baseUrl}/api/auth/forgot-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `nobody_${runId}@example.com` }) })
    assert.equal(unknown.status, 200)
    const unknownBody = await unknown.json()

    const printed = []
    const originalLog = console.log
    console.log = (...args) => printed.push(args.join(' '))
    let known
    try {
      known = await fetch(`${baseUrl}/api/auth/forgot-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: customer.email.toUpperCase() }) })
    } finally {
      console.log = originalLog
    }
    assert.equal(known.status, 200)
    assert.deepEqual(await known.json(), unknownBody, 'the response must not reveal whether the email is on file')

    const mail = printed.find((line) => line.includes('[mail not configured]'))
    assert.ok(mail, 'with no SMTP configured the email is printed to the console')
    // The token rides in the URL FRAGMENT now, not the query string — a
    // fragment is never sent in a Referer header or to the server hosting
    // the page (RULES-PLANS/SECURITY_REVIEW.md item 7).
    const token = mail.match(/reset-password#token=([A-Za-z0-9_-]+)/)[1]

    // Cooldown: a second request straight away sends nothing and issues
    // no second token — but still answers exactly the same 200.
    const printedAgain = []
    console.log = (...args) => printedAgain.push(args.join(' '))
    let again
    try {
      again = await fetch(`${baseUrl}/api/auth/forgot-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: customer.email }) })
    } finally {
      console.log = originalLog
    }
    assert.equal(again.status, 200)
    assert.deepEqual(await again.json(), unknownBody)
    assert.ok(!printedAgain.some((line) => line.includes('[mail not configured]')), 'no second email inside the cooldown')
    assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM password_reset_tokens WHERE user_id = $1', [createdUserId])).rows[0].n, 1)
    const stored = await pool.query('SELECT consumed_at FROM password_reset_tokens WHERE user_id = $1', [createdUserId])
    assert.equal(stored.rows.length, 1)
    assert.equal(stored.rows[0].consumed_at, null)

    const weak = await fetch(`${baseUrl}/api/auth/reset-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, newPassword: 'short', confirmPassword: 'short' }) })
    assert.equal(weak.status, 422)
    const wrongToken = await fetch(`${baseUrl}/api/auth/reset-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'not-a-real-token', newPassword: 'Brand-New-Password-7!', confirmPassword: 'Brand-New-Password-7!' }) })
    assert.equal(wrongToken.status, 400)

    // An open session exists from the rememberMe test above; the reset must end it.
    const before = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: customer.username, password: customer.password }) })
    const liveCookie = before.headers.get('set-cookie').split(';')[0]

    const reset = await fetch(`${baseUrl}/api/auth/reset-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, newPassword: 'Brand-New-Password-7!', confirmPassword: 'Brand-New-Password-7!' }) })
    assert.equal(reset.status, 200)
    assert.equal((await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: liveCookie } })).status, 401, 'existing sessions are ended')

    const oldPassword = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: customer.username, password: customer.password }) })
    assert.equal(oldPassword.status, 401)
    const newPassword = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: customer.username, password: 'Brand-New-Password-7!' }) })
    assert.equal(newPassword.status, 200)
    customer.password = 'Brand-New-Password-7!'

    const reuse = await fetch(`${baseUrl}/api/auth/reset-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, newPassword: 'Another-Password-8!', confirmPassword: 'Another-Password-8!' }) })
    assert.equal(reuse.status, 400, 'a consumed token is dead')
  })
})

// The second factor itself (createOtpCode / /verify-otp) is still fully
// working and still covered below — /login just doesn't reach it for
// ADMIN any more (see routes/auth.js's own comment at that branch for
// why). The branch is reachable again as of the security review (item 5),
// and by email rather than SMS.
describe('admin login and the email OTP second factor', () => {
  // The rate limiter (lib/security.js) counts by client IP, and every
  // request in this suite comes from the same one — so without a reset
  // the tests would throttle each other rather than the abuse the limiter
  // exists to stop. Resetting per test is ordinary test isolation: the
  // limiter itself is untouched and fully active in production.
  beforeEach(resetRateLimits)

  let server
  let baseUrl
  let adminUserId
  let cashierUserId

  const admin = {
    username: `testadmin_${runId}`,
    email: `testadmin_${runId}@example.com`,
    password: 'Admin-Only-Password-9!',
  }
  // A non-admin to prove the second factor is admin-only, not global.
  const cashier = {
    username: `testotpcash_${runId}`,
    email: `testotpcash_${runId}@example.com`,
    password: 'Cashier-Password-9!',
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

    const cashierHash = await bcrypt.hash(cashier.password, 4)
    const cashierResult = await pool.query(
      `INSERT INTO users (username, password_hash, user_type) VALUES ($1, $2, 'CASHIER') RETURNING user_id`,
      [cashier.username, cashierHash],
    )
    cashierUserId = cashierResult.rows[0].user_id
    await pool.query('INSERT INTO cashiers (user_id, name, contact_num, email) VALUES ($1, $2, $3, $4)', [cashierUserId, 'Test OTP Cashier', randomContactNumber(), cashier.email])
  })

  after(async () => {
    if (cashierUserId) {
      await pool.query('DELETE FROM cashiers WHERE user_id = $1', [cashierUserId])
      await pool.query('DELETE FROM users WHERE user_id = $1', [cashierUserId])
    }
    if (adminUserId) await deleteTestUser(adminUserId)
    await new Promise((resolve) => server.close(resolve))
  })

  test('POST /api/auth/login accepts an admin at the staff door and turns them away at the customer door', async () => {
    const login = (audience) => fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: admin.username, password: admin.password, audience }),
    })

    const rightDoor = await login('staff')
    assert.equal(rightDoor.status, 200)
    // Right door, right password — and still no session, because an admin
    // owes a second factor first.
    assert.equal((await rightDoor.json()).otpRequired, true)

    const wrongDoor = await login('customer')
    assert.equal(wrongDoor.status, 403)
    const body = await wrongDoor.json()
    assert.equal(body.audience, 'staff')
    assert.match(body.message, /staff account/i)
    assert.equal(wrongDoor.headers.get('set-cookie'), null)
  })

  // The whole point of the second factor: a correct admin password, on
  // its own, buys nothing an attacker can act on.
  test('POST /api/auth/login gives an admin a challenge instead of a session', async () => {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: admin.username, password: admin.password }),
    })
    assert.equal(response.status, 200)
    const body = await response.json()

    assert.equal(body.otpRequired, true)
    assert.ok(body.challengeToken, 'the browser needs the challenge token to redeem a code')
    assert.equal(body.user, undefined, 'no profile is disclosed before the second factor')
    assert.equal(response.headers.get('set-cookie'), null, 'a correct password alone must not create a session')

    // The code itself never leaves the server in the response — it goes to
    // the mailbox — and what is stored is a hash, not the code.
    assert.equal(JSON.stringify(body).match(/\b\d{6}\b/), null, 'the response must not carry the code')
    const stored = await pool.query('SELECT code_hash FROM otp_codes WHERE challenge_token = $1', [body.challengeToken])
    assert.match(stored.rows[0].code_hash, /^[0-9a-f]{64}$/, 'the code is stored as a SHA-256 hash')
  })

  test('a non-admin is NOT asked for a code — the second factor is admin-only', async () => {
    // Deliberate asymmetry: an admin can change prices, approve production
    // and read every customer record; a cashier password is worth less,
    // and a code every shift would be friction paid for nothing.
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: cashier.username, password: cashier.password }),
    })
    assert.equal(response.status, 200)
    assert.equal((await response.json()).otpRequired, undefined)
    assert.ok(response.headers.get('set-cookie')?.startsWith('pectrack_sid='))
  })

  test('asking for a second code invalidates the first', async () => {
    // The gap the security review found: without this, ten "resend" clicks
    // left ten live codes, which is ten simultaneous guesses at a six-digit
    // number instead of one.
    const first = await (await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: admin.username, password: admin.password }),
    })).json()
    const knownCode = '135791'
    await pool.query('UPDATE otp_codes SET code_hash = $2 WHERE challenge_token = $1', [first.challengeToken, crypto.createHash('sha256').update(knownCode).digest('hex')])

    // Sign in again: this issues a second code and must retire the first.
    await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: admin.username, password: admin.password }),
    })

    const stale = await fetch(`${baseUrl}/api/auth/verify-otp`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeToken: first.challengeToken, code: knownCode }),
    })
    assert.equal(stale.status, 401, 'the superseded code must no longer work')
    assert.equal(stale.headers.get('set-cookie'), null)
  })

  test('a code redeemed through the real login flow creates the session', async () => {
    // End to end, the way an admin actually signs in: password, then the
    // code from the email. The code is overwritten with a known one
    // because otp_codes stores only a hash — which is the property being
    // relied on, not worked around.
    const challenge = await (await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: admin.username, password: admin.password }),
    })).json()
    const knownCode = '246813'
    await pool.query('UPDATE otp_codes SET code_hash = $2 WHERE challenge_token = $1', [challenge.challengeToken, crypto.createHash('sha256').update(knownCode).digest('hex')])

    const verified = await fetch(`${baseUrl}/api/auth/verify-otp`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeToken: challenge.challengeToken, code: knownCode }),
    })
    assert.equal(verified.status, 200)
    assert.ok(verified.headers.get('set-cookie')?.startsWith('pectrack_sid='))
    assert.equal((await verified.json()).user.role, 'ADMIN')

    // And it is single-use — a replayed code is not a second session.
    const replay = await fetch(`${baseUrl}/api/auth/verify-otp`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeToken: challenge.challengeToken, code: knownCode }),
    })
    assert.equal(replay.status, 401)
  })

  // Seeds a known OTP directly rather than going through /login's random
  // code generation, so a test controls the exact code without scraping the
  // console.log the route uses as a stand-in for SMS. Returns the challenge
  // token that redeeming it will require.
  const seedOtp = async (rawCode) => {
    const challengeToken = `test-challenge-${crypto.randomUUID()}`
    await pool.query(
      `INSERT INTO otp_codes (user_id, code_hash, challenge_token, expires_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP + INTERVAL '5 minutes')`,
      [adminUserId, crypto.createHash('sha256').update(rawCode).digest('hex'), challengeToken],
    )
    return challengeToken
  }

  test('POST /api/auth/verify-otp rejects a wrong code', async () => {
    const challengeToken = await seedOtp('111111')

    const response = await fetch(`${baseUrl}/api/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeToken, code: '000000' }),
    })
    assert.equal(response.status, 401)
  })

  test('POST /api/auth/verify-otp accepts the correct code once, then rejects reuse of the same code', async () => {
    const rawCode = '222222'
    const challengeToken = await seedOtp(rawCode)

    const first = await fetch(`${baseUrl}/api/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeToken, code: rawCode }),
    })
    assert.equal(first.status, 200)
    assert.ok(first.headers.get('set-cookie')?.startsWith('pectrack_sid='))
    assert.equal((await first.json()).user.role, 'ADMIN', 'redeeming a valid code must authenticate as the admin it was seeded for')

    const second = await fetch(`${baseUrl}/api/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeToken, code: rawCode }),
    })
    assert.equal(second.status, 401)
  })

  // Regression for the core of the fix. /verify-otp previously took
  // { username, code }, so nothing tied it to the password step — a valid
  // SMS code plus a guessable username was a complete admin session, and
  // the password contributed nothing at the second step.
  test('a correct code is useless without the challenge token from /login', async () => {
    const rawCode = '333333'
    await seedOtp(rawCode)

    // The old request shape: right code, right username, no token.
    const withoutToken = await fetch(`${baseUrl}/api/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: admin.username, code: rawCode }),
    })
    assert.equal(withoutToken.status, 422, 'the code alone must not be accepted')
    assert.equal(withoutToken.headers.get('set-cookie'), null, 'no session may be issued')
  })

  test('a correct code is useless with someone else\'s challenge token', async () => {
    const rawCode = '444444'
    await seedOtp(rawCode)
    // A token that is well-formed but was never issued for this code.
    const wrongToken = `test-challenge-${crypto.randomUUID()}`

    const response = await fetch(`${baseUrl}/api/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeToken: wrongToken, code: rawCode }),
    })
    assert.equal(response.status, 401)
    assert.equal(response.headers.get('set-cookie'), null)
  })

  // There used to be a test here for the full real flow end to end —
  // /login issues a token, the code is read the way an admin would read
  // it off their phone, and the two together produce a session. Removed,
  // not rewritten: /login no longer issues a challenge token for ADMIN
  // at all (the test just above this one already covers that directly),
  // so there is no "the token /login issued" left for such a test to
  // exercise. The one thing that test proved beyond the others in this
  // file — that redeeming a valid code authenticates specifically as the
  // ADMIN it was seeded for — now lives as an extra assertion on 'accepts
  // the correct code once...' above, so no coverage was actually lost.
})

// Regression cover for the account lockout. Previously every failed
// attempt pushed locked_until further into the future, INCLUDING attempts
// made while the account was already locked — so anyone who knew a
// username could keep that account locked out permanently just by looping
// wrong passwords. Needs its own throwaway account because locking one out
// is destructive.
describe('account lockout cannot be extended indefinitely', () => {
  // The rate limiter (lib/security.js) counts by client IP, and every
  // request in this suite comes from the same one — so without a reset
  // the tests would throttle each other rather than the abuse the limiter
  // exists to stop. Resetting per test is ordinary test isolation: the
  // limiter itself is untouched and fully active in production.
  beforeEach(resetRateLimits)

  let server
  let baseUrl
  let createdUserId

  const victim = {
    name: 'Lockout Victim',
    username: `lockout_${runId}`,
    email: `lockout_${runId}@example.com`,
    contactNumber: randomContactNumber(),
    password: 'Correct-Horse-Battery-9!',
  }

  const failLogin = () => fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: victim.username, password: 'definitely-the-wrong-password' }) })
  const readLockState = async () => (await pool.query('SELECT failed_login_attempts, locked_until FROM users WHERE user_id = $1', [createdUserId])).rows[0]

  before(async () => {
    server = app.listen(0)
    await new Promise((resolve) => server.once('listening', resolve))
    baseUrl = `http://localhost:${server.address().port}`

    await fetch(`${baseUrl}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...victim, confirmPassword: victim.password }) })
    // Fixture: confirm the email the way clicking the emailed link would
    // (migration 016). This suite is not testing verification — auth.test.js
    // is — so its customers start verified and can place orders.
    await pool.query('UPDATE customers SET email_verified_at = CURRENT_TIMESTAMP WHERE user_id = (SELECT user_id FROM users WHERE username = $1)', [victim.username])
    createdUserId = (await pool.query('SELECT user_id FROM users WHERE username = $1', [victim.username])).rows[0].user_id
  })

  after(async () => {
    await deleteTestUser(createdUserId)
    server.close()
  })

  test('five failures lock the account', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) assert.equal((await failLogin()).status, 401)
    const state = await readLockState()
    assert.equal(state.failed_login_attempts, 5)
    assert.ok(state.locked_until && new Date(state.locked_until) > new Date(), 'the account should now be locked')
  })

  test('further failures while locked neither extend the lock nor raise the counter', async () => {
    const before = await readLockState()
    for (let attempt = 0; attempt < 4; attempt += 1) await failLogin()
    const after = await readLockState()

    assert.equal(
      new Date(after.locked_until).getTime(),
      new Date(before.locked_until).getTime(),
      'locked_until must not move — otherwise an attacker can hold the account locked forever',
    )
    assert.equal(after.failed_login_attempts, before.failed_login_attempts, 'the counter must not keep climbing during a lockout')
  })

  test('a successful login after the lock is lifted clears the counter', async () => {
    // Expire the lock directly rather than waiting out the real 15 minutes.
    await pool.query('UPDATE users SET locked_until = CURRENT_TIMESTAMP - INTERVAL \'1 minute\' WHERE user_id = $1', [createdUserId])

    const response = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: victim.username, password: victim.password }) })
    assert.equal(response.status, 200)

    const state = await readLockState()
    assert.equal(state.failed_login_attempts, 0)
    assert.equal(state.locked_until, null)
  })

  // Regression: /login used to skip the bcrypt comparison entirely when no
  // account matched, so a missing username answered in ~3ms while a real
  // one took ~250ms. Both replies said "Invalid credentials", but the
  // response TIME did not — a reliable way to discover which usernames are
  // real, defeating the point of the identical error message.
  //
  // This is a timing test, so it compares MEDIANS over several samples and
  // allows a generous margin. The gap it guards against was ~215ms; a
  // correct implementation sits near zero.
  test('a wrong password takes the same time whether or not the account exists', async () => {
    const medianLoginMs = async (identifier) => {
      const samples = []
      for (let sample = 0; sample < 9; sample += 1) {
        // Keep the account unlocked so this measures the password hash,
        // not the (much faster) already-locked path.
        await pool.query('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE user_id = $1', [createdUserId])
        // And keep the rate limiter out of the way for the same reason.
        // 18 attempts from one IP is exactly what lib/security.js exists
        // to refuse, and its 429 is returned BEFORE bcrypt runs — which is
        // the point of a limiter, but it would make this measure the
        // limiter instead of the hash. The limiter cannot leak account
        // existence anyway: it counts by IP, so it answers identically
        // whether or not the username is real.
        resetRateLimits()
        const startedAt = process.hrtime.bigint()
        await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier, password: 'definitely-the-wrong-password' }) })
        samples.push(Number(process.hrtime.bigint() - startedAt) / 1e6)
      }
      return samples.sort((a, b) => a - b)[Math.floor(samples.length / 2)]
    }

    const existing = await medianLoginMs(victim.username)
    const missing = await medianLoginMs(`no_such_user_${runId}`)

    assert.ok(
      Math.abs(existing - missing) < 100,
      `login timing must not reveal whether an account exists (real ${existing.toFixed(1)}ms vs missing ${missing.toFixed(1)}ms)`,
    )
  })

  test('one typo after a lock expires starts a fresh window instead of re-locking immediately', async () => {
    // Put the account back into "was locked, lock has now expired" with the
    // counter still at the limit — the exact state that used to re-lock on
    // a single mistyped password.
    await pool.query('UPDATE users SET failed_login_attempts = 5, locked_until = CURRENT_TIMESTAMP - INTERVAL \'1 minute\' WHERE user_id = $1', [createdUserId])

    await failLogin()

    const state = await readLockState()
    assert.equal(state.failed_login_attempts, 1, 'the expired lock should reset the count, not carry it over')
    assert.equal(state.locked_until, null, 'one typo after an expired lock must not re-lock the account')
  })
})

// Customer email verification — migration 016. A new customer can sign in
// and browse at once, but cannot place an order until the emailed link is
// opened. Staff are never asked; existing customers were grandfathered.
describe('customer email verification', () => {
  beforeEach(resetRateLimits)

  let server
  let baseUrl
  let userId
  const person = {
    name: 'Verify Customer',
    username: `verifycust_${runId}`,
    email: `verifycust_${runId}@example.com`,
    contactNumber: randomContactNumber(),
    password: 'Correct-Horse-Battery-9!',
  }
  let cookie

  const post = (path, body, sessionCookie) => fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(sessionCookie ? { Cookie: sessionCookie } : {}) },
    body: JSON.stringify(body ?? {}),
  })

  // The token only exists in the email, so a test captures it from the
  // console — the path lib/mail.js takes under the test runner.
  const captureMailedToken = async (action) => {
    const printed = []
    const original = console.log
    console.log = (...args) => printed.push(args.join(' '))
    try {
      await action()
    } finally {
      console.log = original
    }
    const mail = printed.find((line) => line.includes('/verify-email#token='))
    return mail?.match(/verify-email#token=([A-Za-z0-9_-]+)/)?.[1] ?? null
  }

  const placeOrder = async () => {
    const product = await pool.query('SELECT product_id FROM products WHERE availability_status = TRUE LIMIT 1')
    return post('/api/orders', { orderType: 'PICKUP', items: [{ productId: product.rows[0].product_id, quantity: 1 }] }, cookie)
  }

  before(async () => {
    server = app.listen(0)
    await new Promise((resolve) => server.once('listening', resolve))
    baseUrl = `http://localhost:${server.address().port}`
  })

  after(async () => {
    // try/finally so the server always closes: a cleanup query that throws
    // would otherwise leave it listening and hang the whole test run.
    try {
      if (userId) {
        // The order placed by the "once verified" test references this
        // customer, so it — and everything hanging off it — goes first.
        const orders = (await pool.query('SELECT o.order_id FROM orders o JOIN customers c ON c.customer_id = o.customer_id WHERE c.user_id = $1', [userId])).rows.map((row) => row.order_id)
        if (orders.length > 0) {
          await pool.query('DELETE FROM payments WHERE order_id = ANY($1)', [orders])
          await pool.query('DELETE FROM inventory_movements WHERE order_id = ANY($1)', [orders])
          await pool.query('DELETE FROM order_status_history WHERE order_id = ANY($1)', [orders])
          await pool.query('DELETE FROM order_details WHERE order_id = ANY($1)', [orders])
          await pool.query('DELETE FROM deliveries WHERE order_id = ANY($1)', [orders])
          await pool.query('DELETE FROM orders WHERE order_id = ANY($1)', [orders])
        }
        await pool.query('DELETE FROM security_events WHERE user_id = $1', [userId])
        await deleteTestUser(userId)
      }
    } finally {
      await new Promise((resolve) => server.close(resolve))
    }
  })

  let firstToken

  test('registering sends a confirmation link, and the new account starts unverified', async () => {
    let registration
    firstToken = await captureMailedToken(async () => {
      registration = await post('/api/auth/register', { ...person, confirmPassword: person.password })
    })
    assert.equal(registration.status, 201)
    assert.ok(firstToken, 'the confirmation email carries a token in its link')

    const row = await pool.query('SELECT u.user_id, c.email_verified_at FROM users u JOIN customers c ON c.user_id = u.user_id WHERE u.username = $1', [person.username])
    userId = row.rows[0].user_id
    assert.equal(row.rows[0].email_verified_at, null)

    // Only a hash is stored — the token itself exists once, in the email.
    const stored = await pool.query('SELECT token_hash FROM email_verification_tokens WHERE user_id = $1', [userId])
    assert.notEqual(stored.rows[0].token_hash, firstToken)
    assert.match(stored.rows[0].token_hash, /^[0-9a-f]{64}$/)
  })

  test('an unverified customer can sign in and browse, and the session says they are unverified', async () => {
    const login = await post('/api/auth/login', { identifier: person.username, password: person.password, audience: 'customer' })
    assert.equal(login.status, 200)
    assert.equal((await login.json()).user.emailVerified, false)
    cookie = login.headers.get('set-cookie').split(';')[0]

    const me = await (await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: cookie } })).json()
    assert.equal(me.user.emailVerified, false)
  })

  test('an unverified customer cannot place an order', async () => {
    const response = await placeOrder()
    assert.equal(response.status, 403)
    assert.equal((await response.json()).code, 'EMAIL_NOT_VERIFIED')
  })

  test('asking for a new link invalidates the first one', async () => {
    // Past the per-account cooldown, so the resend is allowed.
    await pool.query(`UPDATE email_verification_tokens SET created_at = created_at - INTERVAL '10 minutes' WHERE user_id = $1`, [userId])
    let resend
    const secondToken = await captureMailedToken(async () => {
      resend = await post('/api/auth/resend-verification', {}, cookie)
    })
    assert.equal(resend.status, 200)
    assert.ok(secondToken)

    const stale = await post('/api/auth/verify-email', { token: firstToken })
    assert.equal(stale.status, 400, 'only the newest link may work')

    firstToken = secondToken
  })

  test('a second resend inside the cooldown is refused, so a double-click does not mail twice', async () => {
    const again = await post('/api/auth/resend-verification', {}, cookie)
    assert.equal(again.status, 429)
  })

  test('opening the link verifies the account — without needing to be signed in', async () => {
    // No cookie: registering on a laptop and opening the email on a phone
    // is the common case, and the token alone proves the mailbox.
    const verified = await post('/api/auth/verify-email', { token: firstToken })
    assert.equal(verified.status, 200)

    const row = await pool.query('SELECT email_verified_at FROM customers WHERE user_id = $1', [userId])
    assert.ok(row.rows[0].email_verified_at)

    // And it is single-use.
    const replay = await post('/api/auth/verify-email', { token: firstToken })
    assert.equal(replay.status, 400)
  })

  test('once verified, the same session can place an order — no sign-out needed', async () => {
    const response = await placeOrder()
    assert.equal(response.status, 201)
    const orderId = (await response.json()).order.id
    // Cancel it so the stock this test borrowed goes straight back.
    await fetch(`${baseUrl}/api/orders/${orderId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ status: 'CANCELLED' }) })
  })

  test('changing the email requires the current password — a session alone is not enough', async () => {
    // The takeover this closes: an account left signed in on a shared
    // computer. Without a password check, whoever sits down next could
    // swap in their own address and then reset the password.
    const attempt = (body) => fetch(`${baseUrl}/api/auth/me`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(body) })

    const without = await attempt({ email: `thief_${runId}@example.com` })
    assert.equal(without.status, 422)
    assert.ok((await without.json()).errors.currentPassword)

    const wrong = await attempt({ email: `thief_${runId}@example.com`, currentPassword: 'not-my-password' })
    assert.equal(wrong.status, 422)

    const unchanged = await pool.query('SELECT email FROM customers WHERE user_id = $1', [userId])
    assert.equal(unchanged.rows[0].email, person.email, 'a refused change must not have written anything')

    // Editing something else, with the same email sent back as the form
    // does, needs no password at all.
    const nameOnly = await attempt({ name: 'Verify Customer Renamed', email: person.email })
    assert.equal(nameOnly.status, 200)
  })

  test('changing the email warns the OLD address', async () => {
    const printed = []
    const original = console.log
    console.log = (...args) => printed.push(args.join(' '))
    const newEmail = `verifycust_warn_${runId}@example.com`
    try {
      const edit = await fetch(`${baseUrl}/api/auth/me`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ email: newEmail, currentPassword: person.password }) })
      assert.equal(edit.status, 200)
    } finally {
      console.log = original
    }
    const notice = printed.find((line) => line.includes('Your PECTRACK email address was changed'))
    assert.ok(notice, 'the previous address is told')
    assert.ok(notice.includes(`To: ${person.email}`), 'and it goes to the OLD address, not the new one')

    // Put it back for the tests that follow.
    await pool.query('UPDATE customers SET email = $2 WHERE user_id = $1', [userId, person.email])
  })

  test('changing the email makes it unverified again and mails the NEW address', async () => {
    const newEmail = `verifycust2_${runId}@example.com`
    let edit
    const token = await captureMailedToken(async () => {
      edit = await fetch(`${baseUrl}/api/auth/me`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ email: newEmail, currentPassword: person.password }) })
    })
    assert.equal(edit.status, 200)
    const body = await edit.json()
    assert.equal(body.user.emailVerified, false)
    assert.equal(body.verificationSent, true)
    assert.ok(token)

    const stored = await pool.query('SELECT email FROM email_verification_tokens WHERE user_id = $1 AND consumed_at IS NULL', [userId])
    assert.equal(stored.rows[0].email, newEmail)
  })

  test('re-saving the SAME email does not cost a verified customer their status', async () => {
    await pool.query('UPDATE customers SET email_verified_at = CURRENT_TIMESTAMP WHERE user_id = $1', [userId])
    const current = (await pool.query('SELECT email FROM customers WHERE user_id = $1', [userId])).rows[0].email
    const edit = await fetch(`${baseUrl}/api/auth/me`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ email: current.toUpperCase() }) })
    assert.equal(edit.status, 200)
    assert.equal((await edit.json()).user.emailVerified, true)
  })

  test('a link sent to an OLD address cannot verify the new one', async () => {
    // Issue a link for the current address, then change the address before
    // it is opened. The link verifies what it was MAILED to — not whatever
    // the account holds by the time someone clicks it.
    await pool.query(`UPDATE email_verification_tokens SET created_at = created_at - INTERVAL '10 minutes' WHERE user_id = $1`, [userId])
    await pool.query('UPDATE customers SET email_verified_at = NULL WHERE user_id = $1', [userId])
    const oldLink = await captureMailedToken(async () => {
      await post('/api/auth/resend-verification', {}, cookie)
    })
    await pool.query('UPDATE customers SET email = $2 WHERE user_id = $1', [userId, `verifycust3_${runId}@example.com`])

    const attempt = await post('/api/auth/verify-email', { token: oldLink })
    assert.equal(attempt.status, 400)
    const row = await pool.query('SELECT email_verified_at FROM customers WHERE user_id = $1', [userId])
    assert.equal(row.rows[0].email_verified_at, null)
  })

  test('staff are never asked to verify — the key is absent, not false', async () => {
    const cashierHash = await bcrypt.hash('Cashier-Password-9!', 4)
    const created = await pool.query(`INSERT INTO users (username, password_hash, user_type) VALUES ($1, $2, 'CASHIER') RETURNING user_id`, [`verifycash_${runId}`, cashierHash])
    const cashierId = created.rows[0].user_id
    try {
      await pool.query('INSERT INTO cashiers (user_id, name, contact_num, email) VALUES ($1, $2, $3, $4)', [cashierId, 'Verify Cashier', randomContactNumber(), `verifycash_${runId}@example.com`])
      const login = await post('/api/auth/login', { identifier: `verifycash_${runId}`, password: 'Cashier-Password-9!', audience: 'staff' })
      const user = (await login.json()).user
      assert.equal('emailVerified' in user, false)
      const resend = await post('/api/auth/resend-verification', {}, login.headers.get('set-cookie').split(';')[0])
      assert.equal(resend.status, 403)
    } finally {
      await pool.query('DELETE FROM security_events WHERE user_id = $1', [cashierId])
      await pool.query('DELETE FROM sessions WHERE user_id = $1', [cashierId])
      await pool.query('DELETE FROM cashiers WHERE user_id = $1', [cashierId])
      await pool.query('DELETE FROM users WHERE user_id = $1', [cashierId])
    }
  })

  test('completing a password reset confirms the email it was mailed to', async () => {
    // This is also how the real owner reclaims an address someone else
    // registered: the reset link goes to THEIR inbox.
    await pool.query('UPDATE customers SET email_verified_at = NULL WHERE user_id = $1', [userId])
    const current = (await pool.query('SELECT email FROM customers WHERE user_id = $1', [userId])).rows[0].email

    const printed = []
    const original = console.log
    console.log = (...args) => printed.push(args.join(' '))
    try {
      await post('/api/auth/forgot-password', { email: current })
    } finally {
      console.log = original
    }
    const resetToken = printed.find((line) => line.includes('/reset-password#token='))?.match(/reset-password#token=([A-Za-z0-9_-]+)/)?.[1]
    assert.ok(resetToken)

    const reset = await post('/api/auth/reset-password', { token: resetToken, newPassword: 'Another-Strong-Pass-7!', confirmPassword: 'Another-Strong-Pass-7!' })
    assert.equal(reset.status, 200)
    const row = await pool.query('SELECT email_verified_at FROM customers WHERE user_id = $1', [userId])
    assert.ok(row.rows[0].email_verified_at, 'owning the mailbox is exactly what confirmation proves')
  })

  test('a reset link from BEFORE an email change does not confirm the new address', async () => {
    await pool.query(`UPDATE password_reset_tokens SET created_at = created_at - INTERVAL '10 minutes' WHERE user_id = $1`, [userId])
    await pool.query('UPDATE customers SET email_verified_at = NULL WHERE user_id = $1', [userId])
    const current = (await pool.query('SELECT email FROM customers WHERE user_id = $1', [userId])).rows[0].email

    const printed = []
    const original = console.log
    console.log = (...args) => printed.push(args.join(' '))
    try {
      await post('/api/auth/forgot-password', { email: current })
    } finally {
      console.log = original
    }
    const resetToken = printed.find((line) => line.includes('/reset-password#token='))?.match(/reset-password#token=([A-Za-z0-9_-]+)/)?.[1]
    assert.ok(resetToken)

    // The address changes after the link went out.
    await pool.query('UPDATE customers SET email = $2 WHERE user_id = $1', [userId, `verifycust_later_${runId}@example.com`])

    const reset = await post('/api/auth/reset-password', { token: resetToken, newPassword: 'Yet-Another-Pass-8!', confirmPassword: 'Yet-Another-Pass-8!' })
    assert.equal(reset.status, 200, 'the password reset itself still works')
    const row = await pool.query('SELECT email_verified_at FROM customers WHERE user_id = $1', [userId])
    assert.equal(row.rows[0].email_verified_at, null, 'but it proves the OLD address, not the new one')
  })

  test('a made-up token is refused with the same message as an expired one', async () => {
    const response = await post('/api/auth/verify-email', { token: 'not-a-real-token-at-all' })
    assert.equal(response.status, 400)
    assert.match((await response.json()).message, /invalid or has expired/)
  })
})

// Runs once after every test in this file (all describe blocks above) has
// finished — closing the pool any earlier would break whichever describe
// block hasn't run its database queries yet.
after(async () => {
  await pool.end()
})
