// Six-digit email codes for forgot password (RESET) and for a signed-in
// password change (CHANGE) — the panel, final defense 2026-11-18
// (RULES-PLANS/FINAL_DEFENSE_REVISIONS_PLAN.md C3, migration 045). They
// replaced the emailed reset link.
//
// Every code lives 5 minutes, takes at most 5 wrong tries, and a new one can
// be asked for after 60 seconds. Asking again ends the earlier code, so there
// is only ever one live code per account and purpose to guess at. Only the
// SHA-256 of the code is stored; the code itself exists once, in the email.
import crypto from 'node:crypto'
import { pool } from '../db.js'

export const passwordCodeMinutes = 5
export const passwordCodeResendSeconds = 60
export const passwordCodeMaxAttempts = 5

const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex')

// True when a code for this account and purpose was sent less than
// passwordCodeResendSeconds ago and is still unused.
export async function passwordCodeSentRecently({ userId, purpose }) {
  const recent = await pool.query(
    `SELECT 1 FROM password_reset_tokens
      WHERE user_id = $1 AND purpose = $2 AND consumed_at IS NULL AND code_hash IS NOT NULL
        AND created_at > CURRENT_TIMESTAMP - ($3 * INTERVAL '1 second')`,
    [userId, purpose, passwordCodeResendSeconds],
  )
  return recent.rowCount > 0
}

// Stores a new code (ending any earlier live one) and returns it, for the
// caller to email. `email` is the address it is mailed to (migration 017).
export async function issuePasswordCode({ userId, email, purpose }) {
  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0')
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('UPDATE password_reset_tokens SET consumed_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND purpose = $2 AND consumed_at IS NULL', [userId, purpose])
    await client.query(
      `INSERT INTO password_reset_tokens (user_id, purpose, code_hash, email, expires_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP + ($5 * INTERVAL '1 minute'))`,
      [userId, purpose, sha256(code), email, passwordCodeMinutes],
    )
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
  return code
}

// Checks a typed code against the account's live code for this purpose.
// A wrong code counts against the code (on the pool, so it sticks even if
// the caller's request goes no further). Returns the row on a match:
// { tokenId, email } — the caller spends it with consumePasswordCode inside
// the transaction that changes the password. Returns null otherwise.
export async function checkPasswordCode({ userId, purpose, code }) {
  const found = await pool.query(
    `SELECT token_id, code_hash, attempt_count, email
       FROM password_reset_tokens
      WHERE user_id = $1 AND purpose = $2 AND consumed_at IS NULL AND code_hash IS NOT NULL
        AND expires_at > CURRENT_TIMESTAMP
      ORDER BY created_at DESC
      LIMIT 1`,
    [userId, purpose],
  )
  const row = found.rows[0]
  if (!row || row.attempt_count >= passwordCodeMaxAttempts) return null
  const typed = String(code ?? '').replace(/\D/g, '')
  if (typed.length !== 6 || sha256(typed) !== row.code_hash) {
    // The fifth wrong try ends the code, so a sixth guess is never checked.
    await pool.query(
      `UPDATE password_reset_tokens SET attempt_count = attempt_count + 1,
              consumed_at = CASE WHEN attempt_count + 1 >= $2 THEN CURRENT_TIMESTAMP ELSE consumed_at END
        WHERE token_id = $1`,
      [row.token_id, passwordCodeMaxAttempts],
    )
    return null
  }
  return { tokenId: row.token_id, email: row.email }
}

// Spends a matched code, once. False when a second request got there first.
export async function consumePasswordCode(client, tokenId) {
  const spent = await client.query('UPDATE password_reset_tokens SET consumed_at = CURRENT_TIMESTAMP WHERE token_id = $1 AND consumed_at IS NULL RETURNING token_id', [tokenId])
  return spent.rowCount === 1
}
