// The security audit trail — RULES-PLANS/SECURITY_REVIEW.md finding J.
//
// One function, called from the auth and staff routes wherever something
// happens to an ACCOUNT rather than to an order. See migration 015 for
// the table and the three rules it is built around; the important one
// bears repeating here, at the place that decides what gets written:
//
//   NEVER pass a secret to this function. Not a password, not an OTP
//   code, not a session id, not a reset token. `detail` is for context a
//   person needs to read the event — which role, which door, why a reset
//   was refused — and for nothing else.
import { pool } from '../db.js'

const usernameMaxLength = 50
const userAgentMaxLength = 255
const detailMaxLength = 255

// Express resolves request.ip through the `trust proxy` setting, so this
// is the real client address when TRUST_PROXY_HOPS matches the
// deployment and the proxy's address when it does not — the same caveat
// the rate limiter carries, documented in lib/security.js.
const clientIp = (request) => request?.ip?.slice(0, 64) ?? null

// Deliberately never throws. An audit write failing must not turn a
// successful sign-in into a 500 — losing one log line is bad, refusing a
// legitimate login because the log table is full is worse. The failure is
// reported to the server console, which is where anyone investigating a
// gap in this table will look.
//
// Deliberately NOT awaited by most callers either: the response should
// not wait on an insert nobody is reading in real time. Callers that do
// await it are the ones already inside a transaction.
export async function recordSecurityEvent({ request, type, userId = null, username = null, detail = null }) {
  try {
    await pool.query(
      `INSERT INTO security_events (event_type, user_id, username, ip_address, user_agent, detail)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        type,
        userId,
        username ? String(username).slice(0, usernameMaxLength) : null,
        clientIp(request),
        request?.headers?.['user-agent']?.slice(0, userAgentMaxLength) ?? null,
        detail ? String(detail).slice(0, detailMaxLength) : null,
      ],
    )
  } catch (error) {
    console.error(`Could not record a ${type} security event:`, error)
  }
}
