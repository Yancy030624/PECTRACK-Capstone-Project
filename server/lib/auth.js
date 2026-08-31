// Session/cookie infrastructure shared by every protected route — not just
// the auth routes themselves. Future modules (products, orders, etc.) will
// import `requireAuth` from here to guard their own endpoints.
import crypto from 'node:crypto'
import { config } from '../config.js'
import { pool } from '../db.js'

// Session cookie settings. The cookie holds only a random session id — never
// user data — so a stolen cookie without database access reveals nothing.
export const sessionCookieName = 'pectrack_sid'
const sessionDurationMs = 7 * 24 * 60 * 60 * 1000 // fixed 7-day expiry, no renewal
export const sessionCookieOptions = { httpOnly: true, sameSite: 'lax', secure: config.isProduction, path: '/', maxAge: sessionDurationMs }

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
// this for correctness — findSessionUser already ignores expired sessions,
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
  return { sessions: sessions.rowCount, otpCodes: otpCodes.rowCount }
}

export async function createSession(userId) {
  const sessionId = crypto.randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + sessionDurationMs)
  await pool.query('INSERT INTO sessions (session_id, user_id, expires_at) VALUES ($1, $2, $3)', [sessionId, userId, expiresAt])
  return sessionId
}

async function findSessionUser(sessionId) {
  const result = await pool.query(
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
  if (!user || !user.is_active) return null
  return { id: user.user_id, name: user.name, username: user.username, role: user.user_type.replaceAll('_', ' '), email: user.email, contactNumber: user.contact_num }
}

export async function requireAuth(request, response, next) {
  const sessionId = parseCookies(request.headers.cookie)[sessionCookieName]
  const user = sessionId ? await findSessionUser(sessionId) : null
  if (!user) return response.status(401).json({ message: 'Sign in to continue.' })
  request.user = user
  request.sessionId = sessionId
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
