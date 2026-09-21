// Tests for the transport-level protections added in response to
// RULES-PLANS/SECURITY_REVIEW.md findings H, K and N.
//
// These go through the real app (app.listen on an ephemeral port), not a
// mocked request, because the thing being tested is partly the ORDER the
// middleware runs in — a header that is set after a route has already
// answered protects nothing.
import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, test } from 'node:test'
import app from '../app.js'
import { pool } from '../db.js'
import { rateLimit, resetRateLimits } from './security.js'

describe('security headers', () => {
  let server
  let baseUrl

  before(async () => {
    server = app.listen(0)
    await new Promise((resolve) => server.once('listening', resolve))
    baseUrl = `http://localhost:${server.address().port}`
  })

  after(async () => {
    await new Promise((resolve) => server.close(resolve))
  })

  beforeEach(resetRateLimits)

  test('every response carries the four always-on headers', async () => {
    const response = await fetch(`${baseUrl}/api/health`)
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
    assert.equal(response.headers.get('x-frame-options'), 'DENY')
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer')
    assert.equal(response.headers.get('content-security-policy'), "frame-ancestors 'none'")
  })

  test('a REFUSED response carries them too', async () => {
    // The case that matters most: an error page is still a page a browser
    // renders, so it needs the same protection. A middleware ordered after
    // the routers would miss exactly this.
    const unauthorized = await fetch(`${baseUrl}/api/orders`)
    assert.equal(unauthorized.status, 401)
    assert.equal(unauthorized.headers.get('x-content-type-options'), 'nosniff')

    const notFound = await fetch(`${baseUrl}/api/nothing-here`)
    assert.equal(notFound.headers.get('x-frame-options'), 'DENY')
  })

  test('HSTS is NOT sent outside production', async () => {
    // Deliberate: "never use plain HTTP for this host again" is close to
    // irreversible for its max-age, and sending it from a dev server would
    // poison the developer's own browser for every other localhost project.
    const response = await fetch(`${baseUrl}/api/health`)
    assert.equal(response.headers.get('strict-transport-security'), null)
  })
})

describe('rate limiting', () => {
  let server
  let baseUrl

  before(async () => {
    server = app.listen(0)
    await new Promise((resolve) => server.once('listening', resolve))
    baseUrl = `http://localhost:${server.address().port}`
  })

  after(async () => {
    await new Promise((resolve) => server.close(resolve))
    await pool.end()
  })

  beforeEach(resetRateLimits)

  test('the auth limiter refuses the 11th sign-in attempt in the window with 429 and Retry-After', async () => {
    const attempt = () => fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'nobody_rate_limit_test', password: 'wrong-password-here' }),
    })

    // Ten are allowed — a person mistyping a password several times must
    // not be locked out of the form itself.
    for (let index = 0; index < 10; index += 1) {
      const response = await attempt()
      assert.equal(response.status, 401, `attempt ${index + 1} should still reach the password check`)
    }

    const refused = await attempt()
    assert.equal(refused.status, 429)
    assert.match((await refused.json()).message, /too many sign-in attempts/i)
    // Retry-After tells a well-behaved client when to come back instead of
    // making it guess, and is part of what makes a 429 actionable.
    assert.ok(Number(refused.headers.get('retry-after')) > 0)
  })

  test('the password-reset limiter is much stricter, because each request emails a real person', async () => {
    const request = () => fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nobody-here@example.com' }),
    })

    for (let index = 0; index < 3; index += 1) {
      assert.equal((await request()).status, 200, `request ${index + 1} should be allowed`)
    }
    assert.equal((await request()).status, 429)
  })

  test('limiters do not share counters with each other', async () => {
    // Namespacing matters: spending the sign-in allowance must not lock
    // someone out of registering, and vice versa.
    for (let index = 0; index < 3; index += 1) {
      await fetch(`${baseUrl}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'nobody-here@example.com' }),
      })
    }
    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'nobody_namespace_test', password: 'wrong-password-here' }),
    })
    assert.equal(login.status, 401, 'the sign-in allowance should be untouched by password-reset requests')
  })

  test('a window that has passed resets the count rather than accumulating', async () => {
    // Verified on a limiter with a tiny window rather than by waiting 15
    // real minutes: the behaviour under test is the fixed window itself.
    const limiter = rateLimit({ name: 'window-test', windowMs: 40, max: 1 })
    const run = () => new Promise((resolve) => {
      const response = { statusCode: 200, setHeader() {}, status(code) { this.statusCode = code; return this }, json() { resolve(this.statusCode) } }
      limiter({ ip: '203.0.113.9' }, response, () => resolve(200))
    })

    assert.equal(await run(), 200)
    assert.equal(await run(), 429, 'the second request inside the window is refused')
    await new Promise((resolve) => setTimeout(resolve, 60))
    assert.equal(await run(), 200, 'once the window has passed the caller starts fresh')
  })

  test('two different clients get their own allowance', async () => {
    const limiter = rateLimit({ name: 'per-ip-test', windowMs: 60_000, max: 1 })
    const run = (ip) => new Promise((resolve) => {
      const response = { statusCode: 200, setHeader() {}, status(code) { this.statusCode = code; return this }, json() { resolve(this.statusCode) } }
      limiter({ ip }, response, () => resolve(200))
    })

    assert.equal(await run('198.51.100.1'), 200)
    assert.equal(await run('198.51.100.1'), 429)
    assert.equal(await run('198.51.100.2'), 200, 'one caller flooding must not lock out everyone else')
  })
})
