// Registration, login (with admin OTP second factor), logout, and the
// current-session check. Mounted at /api/auth in index.js.
import crypto from 'node:crypto'
import bcrypt from 'bcrypt'
import express from 'express'
import { pool } from '../db.js'
import { bcryptRounds, findDuplicateAccount, roleTables } from '../lib/accounts.js'
import { createSession, parseCookies, requireAuth, sessionCookieName, sessionCookieOptions } from '../lib/auth.js'
import { normalize, normalizeEmail, validateAccountFields, validateContactNumberField, validateEmailField, validateName, validatePasswordField } from '../lib/validation.js'

const router = express.Router()

const lockAfterAttempts = 5
const lockDurationMinutes = 15
const otpCodeDurationMs = 5 * 60 * 1000
const otpMaxAttempts = 5

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

// Returns BOTH halves of the challenge: the 6-digit code (which goes to the
// admin's phone) and the challenge token (which goes to the browser that
// just proved the password). Redeeming the code requires presenting both,
// so the SMS on its own is not a login — see /verify-otp below.
async function createOtpCode(userId) {
  const code = generateOtpCode()
  // Same size and generator as a session id — this token is a bearer
  // secret for the ~5 minutes the code is alive, so it has to be
  // unguessable, not merely unique.
  const challengeToken = crypto.randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + otpCodeDurationMs)
  await pool.query('INSERT INTO otp_codes (user_id, code_hash, challenge_token, expires_at) VALUES ($1, $2, $3, $4)', [userId, hashOtpCode(code), challengeToken, expiresAt])
  return { code, challengeToken }
}

router.post('/register', async (request, response) => {
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
    return response.status(201).json({ message: 'Account created. You can now sign in.', user: { username: user.username } })
  } catch (error) {
    await client.query('ROLLBACK')
    if (error.code === '23505') return response.status(409).json({ message: 'An account already uses that username, email, or contact number.' })
    throw error
  } finally {
    client.release()
  }
})

router.post('/login', async (request, response) => {
  const identifier = normalize(request.body.identifier).toLowerCase()
  const password = String(request.body.password ?? '')
  if (!identifier || !password) return response.status(422).json({ message: 'Enter your username or email and password.' })

  const result = await pool.query(
    `SELECT u.user_id, u.username, u.password_hash, u.user_type, u.is_active, u.locked_until,
            COALESCE(a.name, ca.name, c.name, d.name) AS name,
            COALESCE(a.email, ca.email, c.email, d.email) AS email,
            COALESCE(a.contact_num, ca.contact_num, c.contact_num, d.contact_num) AS contact_num
     FROM users u
     LEFT JOIN admins a ON a.user_id = u.user_id
     LEFT JOIN cashiers ca ON ca.user_id = u.user_id
     LEFT JOIN customers c ON c.user_id = u.user_id
     LEFT JOIN delivery_personnel d ON d.user_id = u.user_id
     WHERE LOWER(u.username) = $1 OR LOWER(a.email) = $1 OR LOWER(ca.email) = $1 OR LOWER(c.email) = $1 OR LOWER(d.email) = $1
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
    return response.status(401).json({ message: 'Invalid credentials or unavailable account.' })
  }

  await pool.query('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE user_id = $1', [user.user_id])

  if (user.user_type === 'ADMIN') {
    const { code, challengeToken } = await createOtpCode(user.user_id)
    // TODO: send via SMS gateway (e.g. Semaphore, Movider) once an account is set up.
    console.log(`[DEV] OTP for admin "${user.username}": ${code} (would be sent by SMS)`)
    // challengeToken is issued ONLY here, and only once the password above
    // has verified — that's what makes it proof of the first step. username
    // is returned purely so the next screen can say who the code was sent
    // for; /verify-otp does not use it and no longer accepts it.
    return response.json({ otpRequired: true, username: user.username, challengeToken })
  }

  const sessionId = await createSession(user.user_id)
  response.cookie(sessionCookieName, sessionId, sessionCookieOptions)
  return response.json({ user: { id: user.user_id, name: user.name, username: user.username, role: user.user_type.replaceAll('_', ' '), email: user.email, contactNumber: user.contact_num } })
})

// Second step of the admin login. Requires BOTH the challenge token issued
// by /login (proof the password was verified, held by the browser) and the
// 6-digit code (proof of the phone). Presenting only one of them is not a
// login.
//
// This endpoint used to take { username, code }. Nothing in that request
// established that the password step had ever happened — the two halves of
// the login shared no state — so a valid SMS code plus a guessable username
// was a complete admin session, and the password contributed nothing here.
//
// Note there is no username parameter any more: the challenge token
// identifies the OTP row, which identifies the user. That's strictly
// better than validating a username, because it removes a guessable input
// from the endpoint entirely rather than checking it.
router.post('/verify-otp', async (request, response) => {
  const challengeToken = normalize(request.body.challengeToken)
  const code = normalize(request.body.code)
  if (!challengeToken || !code) return response.status(422).json({ message: 'Enter the code sent to your phone.' })

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
  if (!otp || !otp.is_active || otp.attempt_count >= otpMaxAttempts) return response.status(401).json(invalidCodeResponse)

  if (otp.code_hash !== hashOtpCode(code)) {
    await pool.query('UPDATE otp_codes SET attempt_count = attempt_count + 1 WHERE otp_id = $1', [otp.otp_id])
    return response.status(401).json(invalidCodeResponse)
  }

  await pool.query('UPDATE otp_codes SET consumed_at = CURRENT_TIMESTAMP WHERE otp_id = $1', [otp.otp_id])
  const user = { user_id: otp.user_id, username: otp.username, user_type: otp.user_type, name: otp.name, email: otp.email, contact_num: otp.contact_num }
  const sessionId = await createSession(user.user_id)
  response.cookie(sessionCookieName, sessionId, sessionCookieOptions)
  return response.json({ user: { id: user.user_id, name: user.name, username: user.username, role: user.user_type.replaceAll('_', ' '), email: user.email, contactNumber: user.contact_num } })
})

router.post('/logout', async (request, response) => {
  const sessionId = parseCookies(request.headers.cookie)[sessionCookieName]
  if (sessionId) await pool.query('DELETE FROM sessions WHERE session_id = $1', [sessionId])
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

  // Same 4-way role-table join used by login and requireAuth, kept
  // inline here rather than shared — this call site only needs a plain
  // lookup by a known, already-authenticated user_id, while the other
  // two also handle credential checks or session validity, so they
  // aren't quite the same query underneath the similar shape.
  const refreshed = await pool.query(
    `SELECT u.user_id, u.username, u.user_type,
            COALESCE(a.name, ca.name, c.name, d.name) AS name,
            COALESCE(a.email, ca.email, c.email, d.email) AS email,
            COALESCE(a.contact_num, ca.contact_num, c.contact_num, d.contact_num) AS contact_num
     FROM users u
     LEFT JOIN admins a ON a.user_id = u.user_id
     LEFT JOIN cashiers ca ON ca.user_id = u.user_id
     LEFT JOIN customers c ON c.user_id = u.user_id
     LEFT JOIN delivery_personnel d ON d.user_id = u.user_id
     WHERE u.user_id = $1`,
    [current.user_id],
  )
  const row = refreshed.rows[0]
  return response.json({ user: { id: row.user_id, name: row.name, username: row.username, role: row.user_type.replaceAll('_', ' '), email: row.email, contactNumber: row.contact_num } })
})

export default router
