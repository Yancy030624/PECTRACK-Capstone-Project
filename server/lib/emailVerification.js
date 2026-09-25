// Customer email verification — migration 016.
//
// Kept apart from routes/auth.js because three routes need it: register
// sends the first link, /resend-verification sends another, and a profile
// edit that changes the email has to send one to the new address. One
// implementation, so the token rules cannot drift between them.
//
// The token follows the password-reset pattern exactly: 32 random bytes,
// only a SHA-256 hash stored, single-use, time-limited, carried in the
// URL fragment so it is never transmitted in a Referer header or to the
// server hosting the page.
import crypto from 'node:crypto'
import { config } from '../config.js'
import { pool } from '../db.js'
import { sendVerificationEmail } from './mail.js'

// A day is long enough to reach an inbox that is not checked hourly, and
// short enough that a link sitting in an old email is not a standing way
// to verify an address. Unlike a password reset, verifying grants nothing
// an attacker could use, so this does not need the reset's 30 minutes.
const verificationDurationMs = 24 * 60 * 60 * 1000
export const verificationDurationHours = verificationDurationMs / (60 * 60 * 1000)

export function hashVerificationToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

// Issues a fresh token and mails it. Any earlier unconsumed token for the
// account is deleted first, so only the newest link ever works — the same
// rule the OTP and the password reset follow, for the same reason: every
// live link is another way in.
//
// Never throws on a MAIL failure. The token is stored either way, and the
// customer can ask for another; failing registration because the mail
// server was briefly unreachable would lose the account they just filled
// in. Returns whether the mail actually went out, for the caller to log.
export async function issueEmailVerification({ userId, email, name }) {
  const token = crypto.randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + verificationDurationMs)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('DELETE FROM email_verification_tokens WHERE user_id = $1 AND consumed_at IS NULL', [userId])
    await client.query(
      'INSERT INTO email_verification_tokens (user_id, token_hash, email, expires_at) VALUES ($1, $2, $3, $4)',
      [userId, hashVerificationToken(token), email, expiresAt],
    )
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }

  const url = `${config.clientOrigin}/verify-email#token=${token}`
  try {
    const result = await sendVerificationEmail({ to: email, name, url, hours: verificationDurationHours })
    return { sent: result.delivered }
  } catch (error) {
    console.error('Could not send an email verification link:', error)
    return { sent: false }
  }
}

// Redeems a token. Returns the verified account, or null for anything that
// is not a live, unconsumed token for the address the account holds NOW.
//
// That last condition is the subtle one. A link verifies the address it
// was MAILED to. If the customer changed their email after the link went
// out, the old link must not mark the new, unproven address as verified —
// so the stored `email` has to match the customer's current one.
//
// Consumption is a conditional UPDATE, not a SELECT then UPDATE, so two
// clicks racing on the same link verify once, not twice.
export async function redeemEmailVerification(token) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const claimed = await client.query(
      `UPDATE email_verification_tokens t
          SET consumed_at = CURRENT_TIMESTAMP
         FROM customers c
        WHERE t.token_hash = $1
          AND t.consumed_at IS NULL
          AND t.expires_at > CURRENT_TIMESTAMP
          AND c.user_id = t.user_id
          AND LOWER(c.email) = LOWER(t.email)
       RETURNING t.user_id`,
      [hashVerificationToken(token)],
    )
    if (claimed.rowCount === 0) {
      await client.query('ROLLBACK')
      return null
    }
    const userId = claimed.rows[0].user_id
    // COALESCE keeps the ORIGINAL verification time if this account was
    // somehow already verified — the first proof is the one worth dating.
    await client.query('UPDATE customers SET email_verified_at = COALESCE(email_verified_at, CURRENT_TIMESTAMP) WHERE user_id = $1', [userId])
    const user = await client.query('SELECT user_id, username FROM users WHERE user_id = $1', [userId])
    await client.query('COMMIT')
    return user.rows[0]
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
