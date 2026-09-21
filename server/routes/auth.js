// Registration, login, logout, and the current-session check. Mounted at
// /api/auth in index.js. An ADMIN password is not a session on its own:
// /login answers with a challenge and emails a code, and /verify-otp
// further down is the only thing that turns that pair into a session.
import crypto from 'node:crypto'
import bcrypt from 'bcrypt'
import express from 'express'
import { config } from '../config.js'
import { pool } from '../db.js'
import { bcryptRounds, findDuplicateAccount, profileColumnsSql, profileEmailMatchesSql, profileJoinsSql, roleTables } from '../lib/accounts.js'
import { createSession, parseCookies, requireAuth, sessionCookieName, sessionCookieOptions, sessionCookieOptionsForBrowserSession } from '../lib/auth.js'
import { authLimiter, passwordResetLimiter, registerLimiter } from '../lib/security.js'
import { recordSecurityEvent } from '../lib/securityEvents.js'
import { sendMail, sendOtpEmail } from '../lib/mail.js'
import { normalize, normalizeEmail, validateAccountFields, validateContactNumberField, validateEmailField, validateName, validatePasswordField } from '../lib/validation.js'

const router = express.Router()

const lockAfterAttempts = 5
const lockDurationMinutes = 15
const otpCodeDurationMs = 5 * 60 * 1000
const otpMaxAttempts = 5
// A reset link lives 30 minutes — long enough to find the email, short
// enough that a forgotten inbox is not a standing way in.
const passwordResetDurationMs = 30 * 60 * 1000
// One reset email per account per this window. Without it a known address
// can be flooded — every request sends a mail — and the SMTP quota burned.
// Still a 200 either way: the cooldown must not become an oracle for
// which addresses exist any more than a miss does.
const passwordResetCooldownMinutes = 2

// The reset token is hashed the same way an OTP code is: the table holds
// only a digest, the token itself exists once, in the email.
function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

// A real bcrypt hash of a value no one can submit, used only to give
// /login something to compare against when there's no account. See the
// comment at its use site for why that matters. Generated once at startup
// rather than hardcoded so it always matches the current cost factor.
const dummyPasswordHash = bcrypt.hashSync('no-account-with-this-password', bcryptRounds)

function generateOtpCode() {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0')
}

function hashOtpCode(code) {
  return crypto.createHash('sha256').update(code).digest('hex')
}

// Issues the two halves of an admin's second factor: the 6-digit code
// (emailed) and the challenge token (returned to the browser that just
// proved the password). Redeeming requires BOTH, so an intercepted email
// is not a login and a stolen challenge token is not one either.
//
// Consuming any earlier live code for this user is the fix for a gap the
// security review found: without it, every "resend" left another valid
// code alive, so asking for ten codes gave an attacker ten simultaneous
// guesses at a six-digit number instead of one. Marking them consumed
// rather than deleting them keeps the audit trail intact.
async function createOtpCode(userId) {
  const code = generateOtpCode()
  // Same size and generator as a session id — this token is a bearer
  // secret for the ~5 minutes the code is alive, so it has to be
  // unguessable, not merely unique.
  const challengeToken = crypto.randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + otpCodeDurationMs)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('UPDATE otp_codes SET consumed_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND consumed_at IS NULL', [userId])
    await client.query('INSERT INTO otp_codes (user_id, code_hash, challenge_token, expires_at) VALUES ($1, $2, $3, $4)', [userId, hashOtpCode(code), challengeToken, expiresAt])
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
  return { code, challengeToken }
}

router.post('/register', registerLimiter, async (request, response) => {
  const { errors, values } = validateAccountFields(request.body)
  if (Object.keys(errors).length) return response.status(422).json({ message: 'Please correct the highlighted fields.', errors })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    if (await findDuplicateAccount(client, values)) {
      await client.query('ROLLBACK')
      return response.status(409).json({ message: 'An account already uses that username, email, or contact number.' })
    }

    const passwordHash = await bcrypt.hash(values.password, bcryptRounds)
    const userResult = await client.query(
      `INSERT INTO users (username, password_hash, user_type)
       VALUES ($1, $2, 'CUSTOMER')
       RETURNING user_id, username`,
      [values.username, passwordHash],
    )
    const user = userResult.rows[0]
    await client.query(
      `INSERT INTO customers (user_id, name, contact_num, email)
       VALUES ($1, $2, $3, $4)`,
      [user.user_id, values.name, values.contactNumber, values.email],
    )
    await client.query('COMMIT')
    recordSecurityEvent({ request, type: 'ACCOUNT_CREATED', userId: user.user_id, username: user.username, detail: 'CUSTOMER self-registration' })
    return response.status(201).json({ message: 'Account created. You can now sign in.', user: { username: user.username } })
  } catch (error) {
    await client.query('ROLLBACK')
    if (error.code === '23505') return response.status(409).json({ message: 'An account already uses that username, email, or contact number.' })
    throw error
  } finally {
    client.release()
  }
})

// Which sign-in door the request came through. 'customer' and 'staff' are
// the two the app sends; anything else (including a missing field) means
// "no door was declared" and no audience check runs — the seed scripts and
// the test suites sign in that way, and so would any future integration.
//
// This REVERSES LOGIN_SPLIT_PLAN.md Decision 1, deliberately and at the
// user's instruction (2026-09-21). That decision refused the check on two
// grounds. The second — "the session cookie is already set by the time the
// client learns the role" — was only ever true of a CLIENT-side check; the
// server knows the role one line before it calls createSession, so the
// refusal below costs nothing and leaks no session. The first — that
// turning away a valid credential is hostile — is answered by the message:
// it names the right door instead of pretending the password was wrong,
// and the form offers a one-click switch that keeps what was typed.
//
// It is still NOT an access control, and must not be described as one in
// the paper: an audience is self-declared, so a caller that omits it is
// unaffected. What actually guards every route is requireRole, unchanged.
// This stops a cashier from landing on the customer storefront, and a
// customer from reaching the staff door, through the app's own front pages.
const audiences = new Set(['customer', 'staff'])
const audienceOf = (userType) => (userType === 'CUSTOMER' ? 'customer' : 'staff')

router.post('/login', authLimiter, async (request, response) => {
  const identifier = normalize(request.body.identifier).toLowerCase()
  const password = String(request.body.password ?? '')
  const requestedAudience = normalize(request.body.audience).toLowerCase()
  if (!identifier || !password) return response.status(422).json({ message: 'Enter your username or email and password.' })

  const result = await pool.query(
    `SELECT u.user_id, u.username, u.password_hash, u.user_type, u.is_active, u.locked_until,
            ${profileColumnsSql}
     FROM users u
     ${profileJoinsSql}
     WHERE LOWER(u.username) = $1 OR ${profileEmailMatchesSql('$1')}
     LIMIT 1`,
    [identifier],
  )
  const user = result.rows[0]

  // The bcrypt comparison runs on EVERY login attempt, including ones for
  // usernames that don't exist — that's the point, and it's why the result
  // is computed here instead of inline in the || chain below.
  //
  // bcrypt is deliberately slow (~250ms at 12 rounds). The previous version
  // short-circuited, so a nonexistent or locked account skipped the hash
  // entirely and answered in ~3ms while a real account took ~250ms. Both
  // replies said "Invalid credentials", but the RESPONSE TIME didn't — and
  // that difference is a reliable oracle for discovering which usernames
  // and emails are real, which is exactly what the identical error message
  // was written to prevent. Comparing against a throwaway hash when there's
  // no account spends the same time either way, so the timing carries no
  // information.
  const passwordMatches = await bcrypt.compare(password, user?.password_hash ?? dummyPasswordHash)
  const isLocked = Boolean(user?.locked_until && new Date(user.locked_until) > new Date())
  const invalidCredentials = !user || !user.is_active || isLocked || !passwordMatches
  if (invalidCredentials) {
    if (user) {
      // The WHERE clause is what stops an attacker from holding a known
      // account locked out permanently: while locked_until is still in the
      // future this UPDATE matches no rows at all, so further wrong
      // guesses can neither increment the counter nor push the unlock time
      // further away. Without it, every attempt during a lockout extended
      // that lockout by another full window.
      //
      // Since the WHERE guarantees the row is either never-locked or
      // expired-locked, the CASE only has to tell those two apart:
      //   locked_until IS NULL -> no prior lock, keep counting up
      //   otherwise            -> a lock just expired, so this failure
      //                           starts a fresh window at 1 rather than
      //                           re-locking the account on one typo.
      await pool.query(
        `UPDATE users
         SET failed_login_attempts = CASE WHEN locked_until IS NULL THEN failed_login_attempts + 1 ELSE 1 END,
             locked_until = CASE
               WHEN locked_until IS NULL AND failed_login_attempts + 1 >= $2 THEN CURRENT_TIMESTAMP + ($3 * INTERVAL '1 minute')
               ELSE NULL
             END
         WHERE user_id = $1 AND (locked_until IS NULL OR locked_until <= CURRENT_TIMESTAMP)`,
        [user.user_id, lockAfterAttempts, lockDurationMinutes],
      )
    }
    // Recorded whether or not the account exists: a burst of failures
    // against usernames that do not exist is exactly the pattern worth
    // seeing, and it is invisible to a per-account counter. The RESPONSE
    // stays identical either way — this writes to a table, not to the
    // reply, so it cannot become an enumeration oracle.
    recordSecurityEvent({
      request,
      type: isLocked ? 'LOGIN_LOCKED_OUT' : 'LOGIN_FAILURE',
      userId: user?.user_id ?? null,
      username: identifier,
      detail: !user ? 'no such account' : !user.is_active ? 'account deactivated' : isLocked ? 'account locked' : 'wrong password',
    })
    return response.status(401).json({ message: 'Invalid credentials or unavailable account.' })
  }

  await pool.query('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE user_id = $1', [user.user_id])

  // The door check — after the password is proven correct, so the reply
  // can name the right door without telling an attacker anything a
  // correct password did not already tell them, and BEFORE createSession,
  // so a wrong-door attempt leaves no session behind to clean up. The
  // failed-attempt counter was reset just above on purpose: the password
  // was right, this is not a failed login.
  const actualAudience = audienceOf(user.user_type)
  if (audiences.has(requestedAudience) && requestedAudience !== actualAudience) {
    recordSecurityEvent({ request, type: 'LOGIN_FAILURE', userId: user.user_id, username: user.username, detail: `correct password at the wrong door (${requestedAudience})` })
    return response.status(403).json({
      message: actualAudience === 'staff'
        ? 'This is a staff account. Use the staff sign-in to continue.'
        : 'This is a customer account. Use the customer sign-in to continue.',
      audience: actualAudience,
    })
  }

  // ADMIN gets a second factor; nobody else does. The asymmetry is the
  // point: an admin can change prices, delete products, approve
  // production and read every customer's record, so a leaked admin
  // password should not be enough on its own. A cashier or customer
  // password is worth far less, and a code at every counter shift would
  // be friction paid for nothing.
  //
  // This branch was dormant until now because it targeted SMS and no
  // gateway existed (RULES-PLANS/SECURITY_REVIEW.md finding C — a control
  // the thesis claimed but the code did not run). It is email now, over
  // lib/mail.js, which already delivers password resets.
  //
  // No session is created here. The reply carries only the challenge
  // token, which is useless without the code, so a correct password alone
  // leaves the caller with nothing they can act on.
  if (user.user_type === 'ADMIN') {
    const { code, challengeToken } = await createOtpCode(user.user_id)
    try {
      await sendOtpEmail({ to: user.email, code, minutes: Math.round(otpCodeDurationMs / 60000) })
    } catch (error) {
      // A mail outage must not become a lockout for the one role that can
      // fix a mail outage. The code is live in the database either way,
      // and with SMTP unconfigured lib/mail.js prints it to the server
      // console outside production, which is how this is exercised on a
      // development machine.
      console.error('Could not send an admin sign-in code:', error)
    }
    // The code itself is never logged — only that one was issued.
    recordSecurityEvent({ request, type: 'OTP_ISSUED', userId: user.user_id, username: user.username })
    return response.json({ otpRequired: true, username: user.username, challengeToken })
  }

  const sessionId = await createSession(user.user_id)
  recordSecurityEvent({ request, type: 'LOGIN_SUCCESS', userId: user.user_id, username: user.username, detail: user.user_type })
  // rememberMe defaults to TRUE — a caller that never sends the field
  // (an older client, a script) keeps the 7-day cookie every login has
  // always produced; only an explicit false asks for a browser-session
  // cookie instead.
  response.cookie(sessionCookieName, sessionId, request.body.rememberMe === false ? sessionCookieOptionsForBrowserSession : sessionCookieOptions)
  return response.json({ user: { id: user.user_id, name: user.name, username: user.username, role: user.user_type.replaceAll('_', ' '), email: user.email, contactNumber: user.contact_num } })
})

// POST /api/auth/forgot-password — step one of email password recovery.
// ALWAYS answers 200 with the same message, whether or not the email is
// on file: the response must not become a way to test which addresses
// have accounts (the same reasoning /login's timing fix makes for
// usernames). Any role may use it — the email is looked up across every
// role table the way /login already does.
//
// A new request replaces any earlier unconsumed token for the account,
// so at most one live link exists per user, and the link goes to the
// email ON FILE, never to an address supplied in the request.
router.post('/forgot-password', passwordResetLimiter, async (request, response) => {
  const email = normalizeEmail(request.body.email)
  const genericResponse = { message: 'If that email belongs to an account, a reset link has been sent to it.' }
  if (validateEmailField(email)) return response.status(422).json({ message: 'Enter a valid email address.', errors: { email: 'Enter a valid email address.' } })

  const result = await pool.query(
    `SELECT u.user_id, u.is_active, ${profileColumnsSql}
       FROM users u
       ${profileJoinsSql}
      WHERE ${profileEmailMatchesSql('$1')}
      LIMIT 1`,
    [email],
  )
  const user = result.rows[0]
  if (!user || !user.is_active) return response.json(genericResponse)

  const recent = await pool.query(
    `SELECT 1 FROM password_reset_tokens WHERE user_id = $1 AND consumed_at IS NULL AND created_at > CURRENT_TIMESTAMP - ($2 * INTERVAL '1 minute')`,
    [user.user_id, passwordResetCooldownMinutes],
  )
  if (recent.rowCount > 0) return response.json(genericResponse)

  const token = crypto.randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + passwordResetDurationMs)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('DELETE FROM password_reset_tokens WHERE user_id = $1 AND consumed_at IS NULL', [user.user_id])
    await client.query('INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)', [user.user_id, hashResetToken(token), expiresAt])
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }

  // The token rides in the URL FRAGMENT, not the query string — item 7
  // of RULES-PLANS/SECURITY_REVIEW.md. A fragment is never transmitted:
  // not in a Referer header when the page links onward, and not to the
  // server hosting the front end, so it cannot land in that host's access
  // logs either. The Referrer-Policy header added in 6d7b0c2 mitigates
  // the first of those; this removes the whole class instead.
  const resetUrl = `${config.clientOrigin}/reset-password#token=${token}`
  try {
    recordSecurityEvent({ request, type: 'PASSWORD_RESET_REQUESTED', userId: user.user_id, username: user.username })
    await sendMail({
      to: email,
      subject: 'Reset your PECTRACK password',
      text: `Hello ${user.name},\n\nSomeone asked to reset the password for your PECTRACK account. If that was you, open this link within 30 minutes:\n\n${resetUrl}\n\nIf you did not ask for this, you can ignore this email — your password stays as it is.`,
    })
  } catch (error) {
    // The token is already stored, so a mail failure is logged, not
    // surfaced: surfacing it would tell the caller the address exists.
    console.error('Could not send a password reset email:', error)
  }
  return response.json(genericResponse)
})

// POST /api/auth/reset-password — step two. The token from the email plus
// a new password. Single use, time-bounded, and it ends every existing
// session for the account — the same reasoning PATCH /password gives:
// someone resetting a password after a compromise needs the intruder's
// session gone too, and here there is no "own session" to spare.
router.post('/reset-password', authLimiter, async (request, response) => {
  const token = normalize(request.body.token)
  const newPassword = String(request.body.newPassword ?? '')
  const confirmPassword = String(request.body.confirmPassword ?? '')
  const invalidTokenResponse = { message: 'This reset link is invalid or has expired. Request a new one.' }
  // Captured inside the transaction so the audit event below can name who
  // the reset was for without a second lookup.
  let resetUserId = null
  let resetUsername = null
  if (!token) return response.status(400).json(invalidTokenResponse)

  const tokenResult = await pool.query(
    `SELECT t.token_id, u.user_id, u.username, u.is_active, ${profileColumnsSql}
       FROM password_reset_tokens t
       JOIN users u ON u.user_id = t.user_id
       ${profileJoinsSql}
      WHERE t.token_hash = $1 AND t.consumed_at IS NULL AND t.expires_at > CURRENT_TIMESTAMP`,
    [hashResetToken(token)],
  )
  const row = tokenResult.rows[0]
  if (!row || !row.is_active) return response.status(400).json(invalidTokenResponse)

  const errors = {}
  const passwordError = validatePasswordField(newPassword, { username: row.username, email: row.email })
  if (passwordError) errors.newPassword = passwordError
  if (newPassword !== confirmPassword) errors.confirmPassword = 'Passwords do not match.'
  if (Object.keys(errors).length) return response.status(422).json({ message: 'Please correct the highlighted fields.', errors })

  const passwordHash = await bcrypt.hash(newPassword, bcryptRounds)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // Consuming the token is conditional, so two submissions of the same
    // link cannot both get through: the second finds it consumed.
    const consumed = await client.query('UPDATE password_reset_tokens SET consumed_at = CURRENT_TIMESTAMP WHERE token_id = $1 AND consumed_at IS NULL RETURNING token_id', [row.token_id])
    if (consumed.rowCount === 0) {
      await client.query('ROLLBACK')
      return response.status(400).json(invalidTokenResponse)
    }
    // A reset also clears a lockout: the person proving they own the
    // email is exactly who the lockout was protecting.
    resetUserId = row.user_id
    resetUsername = row.username ?? null
    await client.query('UPDATE users SET password_hash = $1, failed_login_attempts = 0, locked_until = NULL WHERE user_id = $2', [passwordHash, row.user_id])
    await client.query('DELETE FROM sessions WHERE user_id = $1', [row.user_id])
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
  recordSecurityEvent({ request, type: 'PASSWORD_RESET_COMPLETED', userId: resetUserId, username: resetUsername, detail: 'all sessions ended' })
  return response.json({ message: 'Password updated. You can now sign in with your new password.' })
})

// Second step of the admin login. Requires BOTH the challenge token issued
// by /login (proof the password was verified, held by the browser) and the
// 6-digit code (proof of the mailbox). Presenting only one of them is not
// a login.
//
// This endpoint used to take { username, code }. Nothing in that request
// established that the password step had ever happened — the two halves of
// the login shared no state — so a valid emailed code plus a guessable username
// was a complete admin session, and the password contributed nothing here.
//
// Note there is no username parameter any more: the challenge token
// identifies the OTP row, which identifies the user. That's strictly
// better than validating a username, because it removes a guessable input
// from the endpoint entirely rather than checking it.
router.post('/verify-otp', authLimiter, async (request, response) => {
  const challengeToken = normalize(request.body.challengeToken)
  const code = normalize(request.body.code)
  if (!challengeToken || !code) return response.status(422).json({ message: 'Enter the code sent to your email.' })

  const invalidCodeResponse = { message: 'Invalid or expired code. Please sign in again.' }

  // One query instead of the previous two: find the live, unconsumed code
  // for this token and pull the admin's profile along with it. Joining
  // admins also re-confirms the account is still an admin, and is_active is
  // re-checked below in case the account was disabled between the two
  // steps.
  const otpResult = await pool.query(
    `SELECT o.otp_id, o.code_hash, o.attempt_count,
            u.user_id, u.username, u.user_type, u.is_active,
            a.name, a.email, a.contact_num
     FROM otp_codes o
     JOIN users u ON u.user_id = o.user_id
     JOIN admins a ON a.user_id = u.user_id
     WHERE o.challenge_token = $1
       AND o.consumed_at IS NULL
       AND o.expires_at > CURRENT_TIMESTAMP
     LIMIT 1`,
    [challengeToken],
  )
  const otp = otpResult.rows[0]
  if (!otp || !otp.is_active || otp.attempt_count >= otpMaxAttempts) {
    recordSecurityEvent({ request, type: 'OTP_FAILURE', userId: otp?.user_id ?? null, username: otp?.username ?? null, detail: !otp ? 'unknown or expired challenge' : otp.attempt_count >= otpMaxAttempts ? 'too many attempts on this code' : 'account unavailable' })
    return response.status(401).json(invalidCodeResponse)
  }

  if (otp.code_hash !== hashOtpCode(code)) {
    await pool.query('UPDATE otp_codes SET attempt_count = attempt_count + 1 WHERE otp_id = $1', [otp.otp_id])
    recordSecurityEvent({ request, type: 'OTP_FAILURE', userId: otp.user_id, username: otp.username, detail: `wrong code (attempt ${otp.attempt_count + 1} of ${otpMaxAttempts})` })
    return response.status(401).json(invalidCodeResponse)
  }

  await pool.query('UPDATE otp_codes SET consumed_at = CURRENT_TIMESTAMP WHERE otp_id = $1', [otp.otp_id])
  const user = { user_id: otp.user_id, username: otp.username, user_type: otp.user_type, name: otp.name, email: otp.email, contact_num: otp.contact_num }
  const sessionId = await createSession(user.user_id)
  recordSecurityEvent({ request, type: 'OTP_SUCCESS', userId: user.user_id, username: user.username })
  recordSecurityEvent({ request, type: 'LOGIN_SUCCESS', userId: user.user_id, username: user.username, detail: 'ADMIN, second factor verified' })
  response.cookie(sessionCookieName, sessionId, sessionCookieOptions)
  return response.json({ user: { id: user.user_id, name: user.name, username: user.username, role: user.user_type.replaceAll('_', ' '), email: user.email, contactNumber: user.contact_num } })
})

router.post('/logout', async (request, response) => {
  const sessionId = parseCookies(request.headers.cookie)[sessionCookieName]
  if (sessionId) {
    // Read the owner BEFORE the delete, so the event can name them. The
    // session id itself is never written to the log.
    const owner = await pool.query('SELECT u.user_id, u.username FROM sessions s JOIN users u ON u.user_id = s.user_id WHERE s.session_id = $1', [sessionId])
    await pool.query('DELETE FROM sessions WHERE session_id = $1', [sessionId])
    if (owner.rows[0]) recordSecurityEvent({ request, type: 'LOGOUT', userId: owner.rows[0].user_id, username: owner.rows[0].username })
  }
  response.clearCookie(sessionCookieName, { path: '/' })
  return response.status(204).end()
})

router.get('/me', requireAuth, (request, response) => {
  return response.json({ user: request.user })
})

// PATCH /api/auth/password — self-service password change, for any role.
// Separate from PATCH /me on purpose: a password isn't a profile field. It
// needs the current password re-proved, it has its own strength rules, and
// it has a side effect none of the profile fields have (ending other
// sessions), so folding it into the profile edit would make that endpoint
// mean two quite different things.
//
// This closes a real gap rather than adding a nicety. Staff accounts are
// created by an admin who chooses the initial password, and until now there
// was no way for that staff member to ever change it — so every admin
// permanently knew every cashier's and driver's password.
router.patch('/password', requireAuth, async (request, response) => {
  const currentPassword = String(request.body.currentPassword ?? '')
  const newPassword = String(request.body.newPassword ?? '')
  const confirmPassword = String(request.body.confirmPassword ?? '')

  const result = await pool.query('SELECT user_id, username, password_hash FROM users WHERE user_id = $1', [request.user.id])
  const user = result.rows[0]

  // Re-prove the CURRENT password even though the caller is already signed
  // in. A valid session alone must not be enough to change the password —
  // otherwise anyone who got hold of a logged-in browser (a shared terminal
  // at the bakery counter, a stolen cookie) could lock the real owner out
  // of their own account permanently.
  if (!currentPassword || !(await bcrypt.compare(currentPassword, user.password_hash))) {
    return response.status(422).json({ message: 'Please correct the highlighted fields.', errors: { currentPassword: 'That is not your current password.' } })
  }

  const errors = {}
  // Same strength rules as registration — a password chosen later should
  // not be allowed to be weaker than one chosen at sign-up.
  const passwordError = validatePasswordField(newPassword, { username: user.username, email: request.user.email })
  if (passwordError) errors.newPassword = passwordError
  else if (newPassword === currentPassword) errors.newPassword = 'Enter a new password that is different from your current one.'
  if (newPassword !== confirmPassword) errors.confirmPassword = 'Passwords do not match.'
  if (Object.keys(errors).length) return response.status(422).json({ message: 'Please correct the highlighted fields.', errors })

  const passwordHash = await bcrypt.hash(newPassword, bcryptRounds)
  await pool.query('UPDATE users SET password_hash = $1 WHERE user_id = $2', [passwordHash, user.user_id])

  // Sign out everywhere else. Sessions are independent of the password —
  // they're rows keyed by a random id — so without this, changing a
  // password after a compromise would leave the intruder's session working
  // exactly as before, which is the opposite of what someone changing their
  // password is trying to achieve.
  //
  // The caller's OWN session is deliberately kept (session_id != $2), so
  // the person doing this isn't logged out of the page they're standing on.
  const endedElsewhere = await pool.query('DELETE FROM sessions WHERE user_id = $1 AND session_id <> $2', [user.user_id, request.sessionId])

  recordSecurityEvent({ request, type: 'PASSWORD_CHANGED', userId: user.user_id, username: user.username, detail: `self-service; ${endedElsewhere.rowCount} other session(s) ended` })
  return response.json({ message: 'Password updated.', otherSessionsEnded: endedElsewhere.rowCount })
})

// PATCH /api/auth/me — self-service profile editing. Works for ANY
// authenticated role, editing whichever role table that user's own row
// lives in — unlike routes/staff.js and routes/customers.js, which are
// each scoped to an admin/cashier managing OTHER people's accounts.
// Deliberately excludes username, role, and password — those aren't
// "profile" fields and each has its own separate concern (identity,
// authorization, security) that a plain profile edit shouldn't touch.
router.patch('/me', requireAuth, async (request, response) => {
  const currentResult = await pool.query('SELECT user_id, username, user_type FROM users WHERE user_id = $1', [request.user.id])
  const current = currentResult.rows[0]
  const table = roleTables[current.user_type]

  const errors = {}
  const updates = {}

  if ('name' in request.body) {
    const name = normalize(request.body.name)
    const error = validateName(name)
    if (error) errors.name = error
    else updates.name = name
  }
  if ('email' in request.body) {
    const email = normalizeEmail(request.body.email)
    const error = validateEmailField(email)
    if (error) errors.email = error
    else updates.email = email
  }
  if ('contactNumber' in request.body) {
    const contactNumber = normalize(request.body.contactNumber).replace(/[\s()-]/g, '')
    const error = validateContactNumberField(contactNumber)
    if (error) errors.contactNumber = error
    else updates.contactNumber = contactNumber
  }

  if (Object.keys(errors).length) return response.status(422).json({ message: 'Please correct the highlighted fields.', errors })
  if (Object.keys(updates).length === 0) return response.status(422).json({ message: 'Provide at least one field to update.' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    if (updates.email !== undefined || updates.contactNumber !== undefined) {
      const isDuplicate = await findDuplicateAccount(client, { username: current.username, email: updates.email ?? null, contactNumber: updates.contactNumber ?? null }, current.user_id)
      if (isDuplicate) {
        await client.query('ROLLBACK')
        return response.status(409).json({ message: 'Another account already uses that email or contact number.' })
      }
    }
    await client.query(
      `UPDATE ${table} SET name = COALESCE($1, name), email = COALESCE($2, email), contact_num = COALESCE($3, contact_num) WHERE user_id = $4`,
      [updates.name ?? null, updates.email ?? null, updates.contactNumber ?? null, current.user_id],
    )
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    if (error.code === '23505') return response.status(409).json({ message: 'Another account already uses that email or contact number.' })
    throw error
  } finally {
    client.release()
  }

  // The same profile shape login and requireAuth read, from the one
  // definition in lib/accounts.js — only the WHERE differs per caller.
  const refreshed = await pool.query(
    `SELECT u.user_id, u.username, u.user_type,
            ${profileColumnsSql}
     FROM users u
     ${profileJoinsSql}
     WHERE u.user_id = $1`,
    [current.user_id],
  )
  const row = refreshed.rows[0]
  return response.json({ user: { id: row.user_id, name: row.name, username: row.username, role: row.user_type.replaceAll('_', ' '), email: row.email, contactNumber: row.contact_num } })
})

export default router
