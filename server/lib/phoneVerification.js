// Proving a phone number with a texted code (RULES-PLANS/RESERVE_SMS_PLAN.md):
// at customer sign-up (REGISTER) and when the cashier takes a reservation
// (RESERVE). Three steps:
//
//   1. startPhoneVerification texts a 6-digit code and hands back a
//      verification token (the browser keeps it; it is useless without the
//      code, the same split as the admin sign-in code in routes/auth.js).
//   2. checkPhoneCode marks the number verified when the code matches.
//   3. consumeVerifiedPhone, inside the transaction that creates the
//      account or the order, spends the token — once, for that number and
//      that purpose, within half an hour of verifying.
//
// Only SHA-256 hashes of the code and the token are stored.
import crypto from 'node:crypto'
import { pool } from '../db.js'
import { sendSms } from './sms.js'

export const codeMinutes = 10
const maxAttempts = 5
const resendSeconds = 60
const verifiedMinutes = 30

const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex')

export class PhoneVerificationError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

export async function startPhoneVerification({ phone, purpose }) {
  // One code a minute per number, so a double-click or an impatient
  // customer does not spend two texts.
  const recent = await pool.query(
    `SELECT 1 FROM phone_verifications
      WHERE phone = $1 AND purpose = $2 AND consumed_at IS NULL
        AND created_at > CURRENT_TIMESTAMP - ($3 * INTERVAL '1 second')`,
    [phone, purpose, resendSeconds],
  )
  if (recent.rowCount > 0) throw new PhoneVerificationError(429, 'A code was just sent to this number. Wait a minute before asking for another.')

  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0')
  const token = crypto.randomBytes(32).toString('base64url')
  // Any earlier code for this number and purpose stops working, so asking
  // again never leaves two live codes to guess at.
  await pool.query(`UPDATE phone_verifications SET consumed_at = CURRENT_TIMESTAMP WHERE phone = $1 AND purpose = $2 AND consumed_at IS NULL`, [phone, purpose])
  await pool.query(
    `INSERT INTO phone_verifications (phone, purpose, code_hash, token_hash, expires_at)
     VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP + ($5 * INTERVAL '1 minute'))`,
    [phone, purpose, sha256(code), sha256(token), codeMinutes],
  )
  // Never starts with "TEST": Semaphore silently drops those.
  const { sent } = await sendSms({ to: phone, message: `PECTRACK code: ${code}. Valid for ${codeMinutes} minutes. Do not share this code.`, priority: true })
  // `code` goes back to the route, which shows it only in test mode.
  return { verificationToken: token, sent, code }
}

export async function checkPhoneCode({ verificationToken, code }) {
  const found = await pool.query(
    `SELECT verification_id, phone, code_hash, attempt_count, expires_at, verified_at, consumed_at
       FROM phone_verifications WHERE token_hash = $1`,
    [sha256(verificationToken)],
  )
  const row = found.rows[0]
  const expired = new PhoneVerificationError(400, 'This code has expired. Send a new one.')
  if (!row || row.consumed_at) throw expired
  if (row.verified_at) return { phone: row.phone }
  if (new Date(row.expires_at) <= new Date()) throw expired
  if (row.attempt_count >= maxAttempts) throw new PhoneVerificationError(429, 'Too many wrong codes. Send a new one.')
  if (sha256(String(code ?? '').trim()) !== row.code_hash) {
    await pool.query('UPDATE phone_verifications SET attempt_count = attempt_count + 1 WHERE verification_id = $1', [row.verification_id])
    throw new PhoneVerificationError(400, 'That code is not right. Check the text and try again.')
  }
  await pool.query('UPDATE phone_verifications SET verified_at = CURRENT_TIMESTAMP WHERE verification_id = $1', [row.verification_id])
  return { phone: row.phone }
}

// True when the token was verified for this number and purpose and is now
// spent. Run on the transaction's own client, so a rolled-back sign-up or
// order leaves the token usable for the retry.
export async function consumeVerifiedPhone(client, { verificationToken, phone, purpose }) {
  if (!verificationToken) return false
  const spent = await client.query(
    `UPDATE phone_verifications SET consumed_at = CURRENT_TIMESTAMP
      WHERE token_hash = $1 AND phone = $2 AND purpose = $3
        AND verified_at IS NOT NULL AND consumed_at IS NULL
        AND verified_at > CURRENT_TIMESTAMP - ($4 * INTERVAL '1 minute')
      RETURNING verification_id`,
    [sha256(verificationToken), phone, purpose, verifiedMinutes],
  )
  return spent.rowCount === 1
}
