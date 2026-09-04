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
})

// The second factor itself (createOtpCode / /verify-otp) is still fully
// working and still covered below — /login just doesn't reach it for
// ADMIN any more (see routes/auth.js's own comment at that branch for
// why). Renamed from 'admin login requires OTP', which stopped being
// true the moment that branch was switched off.
describe('admin login, and the (currently unreachable from /login) OTP second factor', () => {
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

  test('POST /api/auth/login gives an admin an immediate session, same as any other role', async () => {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: admin.username, password: admin.password }),
    })
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.otpRequired, undefined, 'no OTP branch is reachable from here any more')
    assert.equal(body.user.username, admin.username)
    assert.equal(body.user.role, 'ADMIN')

    const setCookie = response.headers.get('set-cookie')
    assert.ok(setCookie?.startsWith('pectrack_sid='), 'a correct admin password must set a session cookie directly')
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

// Runs once after every test in this file (all describe blocks above) has
// finished — closing the pool any earlier would break whichever describe
// block hasn't run its database queries yet.
after(async () => {
  await pool.end()
})
