// ============================================================================
// PECTRACK API — lib/auth.js (annotated for learning)
// This file is infrastructure, not routes — it has no app.get/app.post
// anywhere in it. It's the shared session/cookie machinery that the auth
// ROUTES use to create sessions, and that EVERY future protected route
// (products, orders, whatever comes next) will use via requireAuth to
// check whether a request is logged in at all. "lib" = code meant to be
// imported by multiple route files, as opposed to a route file itself.
// ============================================================================

// Node's built-in cryptography module — no external package needed for
// generating random bytes or hashing.
import crypto from 'node:crypto'
import { config } from '../config.js'
// Path is '../db.js' (not './db.js') because this file lives one folder
// deeper than db.js (server/lib/auth.js vs server/db.js).
import { pool } from '../db.js'

// Session cookie settings. The cookie itself holds only a random session
// id — never user data — so a stolen cookie without database access
// reveals nothing.
export const sessionCookieName = 'pectrack_sid'

// Not exported — only used locally to build sessionCookieOptions below.
const sessionDurationMs = 7 * 24 * 60 * 60 * 1000 // fixed 7-day expiry, no renewal

// Exported because both this file (to read the cookie back out via
// requireAuth) and routes/auth.js (to set/clear it on login/logout) need
// the EXACT same options object — centralizing avoids the bug where one
// file's cookie settings drift from another's.
export const sessionCookieOptions = {
  // httpOnly: JavaScript running on the page (including any injected via
  // an XSS bug) cannot read this cookie's value at all — only the browser
  // and server can see it. This is the main defense against a stolen
  // session via XSS.
  httpOnly: true,
  // sameSite: 'lax': the browser will NOT attach this cookie to requests
  // triggered by another site (e.g. a malicious page auto-submitting a
  // form to this API) except for plain top-level navigation. This is the
  // main defense against CSRF.
  sameSite: 'lax',
  // secure: only send this cookie over HTTPS — but only enforced in
  // production (see config.js), since local dev runs on plain HTTP.
  secure: config.isProduction,
  // Cookie applies to every path on this origin, not just one sub-route.
  path: '/',
  // Tells the BROWSER to auto-delete the cookie after this long. The
  // database's own `expires_at` check (below) is the real enforcement —
  // this is just a courtesy so an old cookie doesn't linger forever.
  maxAge: sessionDurationMs,
}

// Express has no built-in request-cookie parser (only res.cookie() for
// setting them), so we parse the raw "Cookie" header ourselves rather than
// add a dependency for a handful of lines.
export function parseCookies(header) {
  const cookies = {}
  if (!header) return cookies
  for (const part of header.split(';')) {
    // indexOf (not split('=')) matters here: a cookie VALUE could itself
    // contain "=" (e.g. base64 data), so we only split on the FIRST "=".
    const separatorIndex = part.indexOf('=')
    if (separatorIndex === -1) continue
    const key = part.slice(0, separatorIndex).trim()
    // decodeURIComponent undoes the percent-encoding the browser applies
    // when a cookie value contains special characters.
    if (key) cookies[key] = decodeURIComponent(part.slice(separatorIndex + 1).trim())
  }
  return cookies
}

// Called after a successful login to start a new session.
export async function createSession(userId) {
  // 32 random bytes = 256 bits of entropy — this string IS the security
  // boundary (anyone who has it is treated as logged in), so it must be
  // unguessable, unlike e.g. an incrementing integer id.
  // base64url is like base64 but uses characters safe for URLs/cookies
  // (no "+", "/", or "=" that would need extra encoding).
  const sessionId = crypto.randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + sessionDurationMs)
  await pool.query('INSERT INTO sessions (session_id, user_id, expires_at) VALUES ($1, $2, $3)', [sessionId, userId, expiresAt])
  // Returned so the caller (a route handler) can put it in a cookie via
  // response.cookie(sessionCookieName, sessionId, sessionCookieOptions).
  return sessionId
}

// Not exported — an internal helper only requireAuth needs.
async function findSessionUser(sessionId) {
  const result = await pool.query(
    // Same "join all four role tables, COALESCE the name" pattern used by
    // the login query in routes/auth.js — see that file for the full
    // explanation. `s.expires_at > CURRENT_TIMESTAMP` means an expired
    // session simply won't be found by this query at all; no separate
    // cleanup step is needed for CORRECTNESS (expired rows just
    // accumulate in the table until something eventually prunes them).
    `SELECT u.user_id, u.username, u.user_type, u.is_active,
            COALESCE(a.name, ca.name, c.name, d.name) AS name,
            COALESCE(a.email, ca.email, c.email, d.email) AS email,
            COALESCE(a.contact_num, ca.contact_num, c.contact_num, d.contact_num) AS contact_num
     FROM sessions s
     JOIN users u ON u.user_id = s.user_id
     LEFT JOIN admins a ON a.user_id = u.user_id
     LEFT JOIN cashiers ca ON ca.user_id = u.user_id
     LEFT JOIN customers c ON c.user_id = u.user_id
     LEFT JOIN delivery_personnel d ON d.user_id = u.user_id
     WHERE s.session_id = $1 AND s.expires_at > CURRENT_TIMESTAMP`,
    [sessionId],
  )
  const user = result.rows[0]
  // Checked separately from expiry: a session can still be technically
  // unexpired while the account itself was deactivated since it was
  // issued (e.g. an admin disabled a cashier mid-shift).
  if (!user || !user.is_active) return null
  // email/contact_num were added alongside PATCH /api/auth/me (Phase 4) —
  // the self-service profile form needs the CURRENT values to pre-fill
  // its fields, and this is the one place every authenticated request
  // already resolves the full user record, so it's the natural place to
  // carry them without a second round-trip.
  return { id: user.user_id, name: user.name, username: user.username, role: user.user_type.replaceAll('_', ' '), email: user.email, contactNumber: user.contact_num }
}

// A "middleware" — a function with the (request, response, next) shape
// that Express runs before the actual route handler. Any future route
// that should require login adds this as an extra argument, e.g.:
//   router.get('/some-protected-thing', requireAuth, (request, response) => { ... })
export async function requireAuth(request, response, next) {
  const sessionId = parseCookies(request.headers.cookie)[sessionCookieName]
  const user = sessionId ? await findSessionUser(sessionId) : null
  // No valid session — stop here, never reach the real route handler.
  if (!user) return response.status(401).json({ message: 'Sign in to continue.' })
  // Attach the resolved user (and the raw session id, in case a future
  // route needs it — e.g. "log out of just this device") onto the
  // request object, so the next handler in the chain can read
  // request.user without looking anything up itself.
  request.user = user
  request.sessionId = sessionId
  // Only calling next() lets the request continue to the actual route.
  next()
}

// requireAuth answers "is this request logged in at all?" — AUTHENTICATION.
// requireRole answers a different question — "is this specific logged-in
// user allowed to do THIS?" — AUTHORIZATION. It must run after requireAuth
// in the middleware chain, since it reads request.user, which only exists
// once requireAuth has already succeeded:
//   router.post('/staff', requireAuth, requireRole('ADMIN'), handler)
//
// This returns a FUNCTION rather than being the middleware directly,
// because it needs a parameter (which role(s) are allowed) that varies per
// route — requireRole('ADMIN') and a hypothetical requireRole('ADMIN',
// 'CASHIER') need to produce two different middleware functions from the
// same code. Calling requireRole(...) once immediately returns the actual
// (request, response, next) middleware Express will call per-request.
export function requireRole(...allowedRoles) {
  // findSessionUser (above) stores role with underscores replaced by
  // spaces (e.g. 'DELIVERY PERSONNEL'), matching what /me and the login
  // response already send to the frontend. Callers of requireRole might
  // naturally reach for the raw enum spelling instead (requireRole('ADMIN')
  // vs requireRole('DELIVERY_PERSONNEL')) — normalizing here means either
  // spelling works, so nobody has to remember which format this function
  // expects.
  const normalizedAllowedRoles = allowedRoles.map((role) => role.replaceAll('_', ' '))
  return (request, response, next) => {
    // request.user?.role — optional chaining in case requireRole were ever
    // mistakenly used without requireAuth first; this fails safe (denies)
    // rather than throwing.
    if (!normalizedAllowedRoles.includes(request.user?.role)) return response.status(403).json({ message: 'You do not have permission to perform this action.' })
    // 403 = Forbidden, not 401 = Unauthorized. The distinction matters: by
    // the time this runs, requireAuth has already confirmed the caller IS
    // a valid logged-in user — they're just not permitted to do THIS
    // particular thing. 401 would incorrectly suggest they need to log in
    // (again), when the real problem is their role.
    next()
  }
}
