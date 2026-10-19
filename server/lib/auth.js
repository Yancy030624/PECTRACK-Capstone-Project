// Session/cookie infrastructure shared by every protected route — not just
// the auth routes themselves. Future modules (products, orders, etc.) will
// import `requireAuth` from here to guard their own endpoints.
import crypto from 'node:crypto'
import { config } from '../config.js'
import { pool } from '../db.js'
import { profileColumnsSql, profileJoinsSql, toPublicUser } from './accounts.js'
import { recordSecurityEvent } from './securityEvents.js'

// Session cookie settings. The cookie holds only a random session id — never
// user data — so a stolen cookie without database access reveals nothing.
export const sessionCookieName = 'pectrack_sid'
const sessionDurationMs = 7 * 24 * 60 * 60 * 1000 // fixed 7-day expiry, no renewal
export const sessionCookieOptions = { httpOnly: true, sameSite: 'lax', secure: config.isProduction, path: '/', maxAge: sessionDurationMs }
// "Remember me" unticked: the SAME server-side session (7 days in the
// sessions table, unchanged), but the cookie carrying its id is a browser
// session cookie — no maxAge, so it is dropped when the browser closes.
// That is what the checkbox on the login form promises, and until now it
// was wired to nothing: every login was remembered for 7 days regardless.
export const sessionCookieOptionsForBrowserSession = { httpOnly: true, sameSite: 'lax', secure: config.isProduction, path: '/' }

// Express has no built-in request-cookie parser (only res.cookie() for
// setting them), so we parse the raw "Cookie" header ourselves rather than
// add a dependency for a handful of lines.
export function parseCookies(header) {
  const cookies = {}
  if (!header) return cookies
  for (const part of header.split(';')) {
    const separatorIndex = part.indexOf('=')
    if (separatorIndex === -1) continue
    const key = part.slice(0, separatorIndex).trim()
    if (key) cookies[key] = decodeURIComponent(part.slice(separatorIndex + 1).trim())
  }
  return cookies
}

// Deletes rows that can no longer be used for anything. Nothing depends on
// this for correctness — resolveSession already ignores expired sessions,
// and verify-otp already ignores expired codes — but without it both tables
// grow forever, since neither one ever removes a row on its own.
//
// Old OTP codes are kept for a grace period rather than deleted the moment
// they expire, so a code involved in a support question ("I never got my
// login working") is still there to look at shortly afterwards. They hold
// only a SHA-256 hash of the code, never the code itself.
//
// Called from index.js on startup and hourly after that. It lives here
// rather than in a route because it belongs to the same session/OTP
// lifecycle the rest of this file owns.
const expiredOtpGraceDays = 1

export async function pruneExpiredAuthRows() {
  const sessions = await pool.query('DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP')
  const otpCodes = await pool.query(`DELETE FROM otp_codes WHERE expires_at <= CURRENT_TIMESTAMP - ($1 * INTERVAL '1 day')`, [expiredOtpGraceDays])
  // Password reset tokens (migration 010) get the same grace period, for
  // the same support-question reason.
  const resetTokens = await pool.query(`DELETE FROM password_reset_tokens WHERE expires_at <= CURRENT_TIMESTAMP - ($1 * INTERVAL '1 day')`, [expiredOtpGraceDays])
  // Trusted admin devices past their 30 days (migration 033).
  await pool.query('DELETE FROM trusted_devices WHERE expires_at <= CURRENT_TIMESTAMP')
  return { sessions: sessions.rowCount, otpCodes: otpCodes.rowCount, resetTokens: resetTokens.rowCount }
}

export async function createSession(userId) {
  const sessionId = crypto.randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + sessionDurationMs)
  await pool.query('INSERT INTO sessions (session_id, user_id, expires_at) VALUES ($1, $2, $3)', [sessionId, userId, expiresAt])
  return sessionId
}

// Inactivity timeout — PHASE10 B6, Decision D1; the thesis (p.92): "idle
// accounts are automatically logged out." A staff session with no request
// for 30 minutes ends: a cashier who walks away from a shared counter
// leaves nothing open behind them. A customer keeps the 7-day session —
// being signed out of a shopping cart protects nobody.
//
// last_seen_at is written at most once a minute per session, so an active
// user costs one small UPDATE a minute, not one per request. A request the
// page makes on its own — the Due today screen refreshing itself — sends
// X-Pectrack-Background and does not count as activity; otherwise a screen
// left open would keep its session alive forever.
export const staffIdleLimitMinutes = 30
// OFF since 2026-10-20, at the user's request: admin, cashier and driver
// stay signed in like a customer (the 7-day session). STAFF_IDLE_LOGOUT=on
// brings the 30-minute rule back; the tests switch it here.
export const idleLogout = { enabled: process.env.STAFF_IDLE_LOGOUT === 'on' }
const touchEverySeconds = 60
export const backgroundRequestHeader = 'x-pectrack-background'

// Returns { user } for a live session, { idle: true } for a staff session
// that has just timed out (and is now deleted), or {} for anything else.
async function resolveSession(sessionId, request) {
  const result = await pool.query(
    `SELECT u.user_id, u.username, u.user_type, u.is_active,
            ($4::boolean AND u.user_type <> 'CUSTOMER' AND s.last_seen_at < CURRENT_TIMESTAMP - make_interval(mins => $2)) AS idle,
            (s.last_seen_at < CURRENT_TIMESTAMP - make_interval(secs => $3)) AS stale,
            ${profileColumnsSql}
     FROM sessions s
     JOIN users u ON u.user_id = s.user_id
     ${profileJoinsSql}
     WHERE s.session_id = $1 AND s.expires_at > CURRENT_TIMESTAMP`,
    [sessionId, staffIdleLimitMinutes, touchEverySeconds, idleLogout.enabled],
  )
  const row = result.rows[0]
  if (!row || !row.is_active) return {}
  if (row.idle) {
    await pool.query('DELETE FROM sessions WHERE session_id = $1', [sessionId])
    recordSecurityEvent({ request, type: 'SESSION_EXPIRED', userId: row.user_id, username: row.username, detail: `no activity for ${staffIdleLimitMinutes} minutes` })
    return { idle: true }
  }
  if (row.stale && !request?.headers?.[backgroundRequestHeader]) {
    // Not awaited: the request should not wait on a timestamp. A lost
    // write only means the next request tries again.
    pool.query('UPDATE sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE session_id = $1', [sessionId]).catch(() => {})
  }
  return { user: toPublicUser(row) }
}

export async function requireAuth(request, response, next) {
  const sessionId = parseCookies(request.headers.cookie)[sessionCookieName]
  const { user, idle } = sessionId ? await resolveSession(sessionId, request) : {}
  // The code tells the client this was a session ending under it, not a
  // wrong password — it clears the account and opens the sign-in pop-up.
  if (idle) return response.status(401).json({ code: 'SESSION_IDLE', message: `You were signed out after ${staffIdleLimitMinutes} minutes without activity. Sign in again to continue.` })
  if (!user) return response.status(401).json({ code: 'SIGNED_OUT', message: 'Sign in to continue.' })
  request.user = user
  request.sessionId = sessionId
  next()
}

// STOREFRONT_PLAN.md, Decision 2 — the public catalogue's ONLY entry point
// into the auth system. Unlike requireAuth, a missing or invalid session is
// not an error here: it just means request.user stays undefined, and the
// route itself decides what an anonymous caller may see (in practice,
// products.js and categories.js treat "no user" the same as CUSTOMER —
// the most restricted view that already exists, never a new one).
//
// Reuses resolveSession rather than a second query, so "what counts as a
// valid session" can never drift between the two middlewares. A staff
// session that timed out is simply anonymous here.
export async function optionalAuth(request, response, next) {
  const sessionId = parseCookies(request.headers.cookie)[sessionCookieName]
  const { user } = sessionId ? await resolveSession(sessionId, request) : {}
  if (user) {
    request.user = user
    request.sessionId = sessionId
  }
  next()
}

// Restricts a route to specific roles. Must run after requireAuth (needs
// request.user already set). Roles are compared against the same
// space-separated display format requireAuth attaches to request.user.role
// (e.g. 'DELIVERY PERSONNEL', not 'DELIVERY_PERSONNEL') so callers can pass
// either style and it'll still match correctly.
export function requireRole(...allowedRoles) {
  const normalizedAllowedRoles = allowedRoles.map((role) => role.replaceAll('_', ' '))
  return (request, response, next) => {
    if (!normalizedAllowedRoles.includes(request.user?.role)) return response.status(403).json({ message: 'You do not have permission to perform this action.' })
    next()
  }
}
