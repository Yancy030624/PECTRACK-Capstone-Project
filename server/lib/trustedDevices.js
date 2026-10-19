// "Trust this device for 30 days" for the admin sign-in code (migration
// 033, the user 2026-10-20). After a correct code, a browser the admin
// chose to trust carries a random token in an HttpOnly cookie; only its
// SHA-256 hash is stored. A later sign-in from that browser still needs
// the right password — the trust only skips the emailed code — and it
// counts for that one account only.
import crypto from 'node:crypto'
import { config } from '../config.js'
import { pool } from '../db.js'

export const trustedDeviceCookieName = 'pectrack_trusted'
export const trustedDeviceDays = 30
const trustedDeviceMs = trustedDeviceDays * 24 * 60 * 60 * 1000
// Sent only to the sign-in routes, never to the rest of the API.
export const trustedDeviceCookieOptions = { httpOnly: true, sameSite: 'lax', secure: config.isProduction, path: '/api/auth', maxAge: trustedDeviceMs }

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex')

export async function trustDevice(userId, userAgent) {
  const token = crypto.randomBytes(32).toString('base64url')
  await pool.query(
    `INSERT INTO trusted_devices (user_id, token_hash, user_agent, expires_at)
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP + ($4 * INTERVAL '1 day'))`,
    [userId, sha256(token), String(userAgent ?? '').slice(0, 300) || null, trustedDeviceDays],
  )
  return token
}

// Whether this browser's token is a live trust for this account.
export async function isTrustedDevice(userId, token) {
  if (!token) return false
  const found = await pool.query(
    `UPDATE trusted_devices SET last_used_at = CURRENT_TIMESTAMP
      WHERE user_id = $1 AND token_hash = $2 AND expires_at > CURRENT_TIMESTAMP
      RETURNING trusted_device_id`,
    [userId, sha256(token)],
  )
  return found.rowCount === 1
}

// A new password means every device must prove itself again.
export async function forgetTrustedDevices(client, userId) {
  await client.query('DELETE FROM trusted_devices WHERE user_id = $1', [userId])
}
