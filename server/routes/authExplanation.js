// ============================================================================
// PECTRACK API — routes/auth.js (annotated for learning)
// The actual HTTP endpoints for registration, login (including the admin
// OTP second factor), logout, and the current-session check. Mounted at
// /api/auth in index.js — see indexExplanation.js for what mounting means.
//
// A note before you read the routes below: this app runs Express 5
// (see package.json). Express 5 automatically catches a rejected promise
// or thrown error from an async route handler and forwards it to the
// global error handler in index.js — the same effect as manually calling
// next(error), just without having to write that yourself. That's why
// most routes below have no try/catch at all. The one exception is
// /register, which keeps a try/catch/finally — not to forward the error,
// but because it needs to actually DO something (ROLLBACK the transaction,
// release the connection) before the error is allowed to propagate.
// ============================================================================

import crypto from 'node:crypto'
// bcrypt hashes and verifies passwords. We NEVER store raw passwords —
// only a one-way hash. Even if the database leaks, attackers can't easily
// recover the original passwords from the hash.
import bcrypt from 'bcrypt'
import express from 'express'
import { pool } from '../db.js'
// bcryptRounds and findDuplicateAccount are shared with routes/staff.js
// (Phase 3 added a second route that creates accounts) — see
// lib/accountsExplanation.js.
import { bcryptRounds, findDuplicateAccount } from '../lib/accounts.js'
// Pulling in the shared session/cookie machinery from lib/auth.js — see
// lib/authExplanation.js for how each of these works internally. This file
// only needs to know WHAT they do, not HOW.
import { createSession, parseCookies, requireAuth, sessionCookieName, sessionCookieOptions } from '../lib/auth.js'
// normalize and validateAccountFields are also shared with routes/staff.js
// — see lib/validationExplanation.js. This file used to define its own
// validateRegistration() with the exact same rules; Phase 3 extracted it
// once staff creation needed the identical checks.
import { normalize, validateAccountFields } from '../lib/validation.js'

// An Express Router — a mini sub-app. Every `router.METHOD(path, ...)`
// below is relative to wherever this router gets mounted (index.js mounts
// it at '/api/auth'), so this file never needs to know or spell out that
// prefix itself.
const router = express.Router()

// Account lockout settings: after this many WRONG password attempts in a
// row, the account gets temporarily locked. This defends against
// brute-force attacks (a bot guessing thousands of passwords per minute).
const lockAfterAttempts = 5

// How long (in minutes) the account stays locked once triggered.
const lockDurationMinutes = 15

// How long an admin's OTP code stays valid after being issued.
const otpCodeDurationMs = 5 * 60 * 1000

// A 6-digit code has 1,000,000 possibilities — without a cap on guesses,
// that's crackable by a script within a code's 5-minute window. Capping
// attempts per code closes that door.
const otpMaxAttempts = 5

// --- OTP helpers (admin second factor) -------------------------------

// crypto.randomInt(0, 1_000_000) gives 0–999999; padStart forces it to
// always be exactly 6 digits (e.g. 42 becomes "000042"), so it always
// looks and behaves like a real 6-digit code.
function generateOtpCode() {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0')
}

// Same principle as password hashing: if the otp_codes table ever leaked,
// storing raw codes would let an attacker log in as any admin within the
// code's 5-minute window. A plain sha256 (no bcrypt-style slow hashing) is
// fine here specifically because codes are short-lived and guess-limited
// by otpMaxAttempts — unlike passwords, there's no long-term secret value
// being protected.
function hashOtpCode(code) {
  return crypto.createHash('sha256').update(code).digest('hex')
}

async function createOtpCode(userId) {
  const code = generateOtpCode()
  const expiresAt = new Date(Date.now() + otpCodeDurationMs)
  await pool.query('INSERT INTO otp_codes (user_id, code_hash, expires_at) VALUES ($1, $2, $3)', [userId, hashOtpCode(code), expiresAt])
  // Returns the RAW code (not the hash) — this is what needs to be texted
  // to the admin. Only the hash gets persisted to the database.
  return code
}

// --- Routes ---------------------------------------------------------------

// POST /api/auth/register — creates a new CUSTOMER account. There is
// currently no way to create an admin account through the API (seeded
// manually — see routes/staffExplanation.js for why); CASHIER and
// DELIVERY_PERSONNEL accounts are created by an admin through
// POST /api/staff, added in Phase 3.
router.post('/register', async (request, response) => {
  // Validate everything up front. If anything's wrong, respond with
  // HTTP 422 (Unprocessable Entity — "I understood the request, but the
  // data is invalid") and don't touch the database at all.
  // validateAccountFields lives in lib/validation.js — routes/staff.js
  // uses the exact same function, since an admin-created staff account
  // needs identical field rules to a self-registered customer.
  const { errors, values } = validateAccountFields(request.body)
  if (Object.keys(errors).length) return response.status(422).json({ message: 'Please correct the highlighted fields.', errors })

  // Grab a single dedicated connection from the pool so we can run a
  // multi-statement TRANSACTION on it (transactions must stay on the same
  // connection for their entire lifetime).
  const client = await pool.connect()
  // This is the one route in the file that still uses try/catch/finally.
  // Not to forward the error to Express manually (Express 5 would catch a
  // thrown error on its own) — but because the catch block has real work
  // to do first: ROLLBACK the transaction. Without that, throwing straight
  // through would leave the transaction open on this connection.
  try {
    // BEGIN starts a transaction: all the queries below either ALL
    // succeed together (COMMIT) or ALL get undone together (ROLLBACK).
    // This matters here because we're inserting into TWO tables (users
    // and customers) — without a transaction, a crash between the two
    // inserts could leave a "user" row with no matching "customer" row.
    await client.query('BEGIN')

    // findDuplicateAccount (lib/accounts.js) checks EVERY role table, not
    // just customers — see lib/accountsExplanation.js for why. Also
    // shared with routes/staff.js.
    if (await findDuplicateAccount(client, values)) {
      await client.query('ROLLBACK')
      // 409 = Conflict: the request is valid, but conflicts with existing
      // data.
      return response.status(409).json({ message: 'An account already uses that username, email, or contact number.' })
    }

    // Hash the password. `bcrypt.hash` is asynchronous and CPU-intensive
    // on purpose (see bcryptRounds in lib/accountsExplanation.js) — that
    // intentional slowness is what makes brute-forcing the hash impractical.
    const passwordHash = await bcrypt.hash(values.password, bcryptRounds)

    // Insert the core account row. `user_type` is hardcoded to
    // 'CUSTOMER' here — this endpoint can only ever create customer
    // accounts. `RETURNING` gives back the columns of the row we just
    // inserted without needing a second SELECT query.
    const userResult = await client.query(
      `INSERT INTO users (username, password_hash, user_type)
       VALUES ($1, $2, 'CUSTOMER')
       RETURNING user_id, username`,
      [values.username, passwordHash],
    )
    const user = userResult.rows[0]

    // Insert the customer-specific profile info (name, phone, email),
    // linked back to the users row via user_id — a classic one-to-one
    // relationship split across two tables (auth info vs. profile info).
    await client.query(
      `INSERT INTO customers (user_id, name, contact_num, email)
       VALUES ($1, $2, $3, $4)`,
      [user.user_id, values.name, values.contactNumber, values.email],
    )

    // Both inserts succeeded — make them permanent.
    await client.query('COMMIT')

    // 201 = Created. Note we only send back the username, never the
    // password or password hash — the response should contain the
    // minimum info the frontend actually needs.
    return response.status(201).json({ message: 'Account created. You can now sign in.', user: { username: user.username } })
  } catch (error) {
    // Something failed mid-transaction — undo any partial inserts so the
    // database never ends up in a half-finished state.
    await client.query('ROLLBACK')

    // Postgres error code 23505 = "unique_violation". This is a safety
    // net in case two requests race past the earlier duplicate-check at
    // nearly the same time (a "race condition") — the database's own
    // UNIQUE constraints catch what the manual check might miss.
    if (error.code === '23505') return response.status(409).json({ message: 'An account already uses that username, email, or contact number.' })

    // Anything else unexpected — re-throw. Express 5 catches a thrown
    // error from an async handler automatically and forwards it to the
    // generic error handler in index.js, same as calling next(error)
    // would in Express 4.
    throw error
  } finally {
    // ALWAYS release the connection back to the pool, whether we
    // succeeded or threw — otherwise the pool slowly runs out of
    // available connections ("connection leak") and the app eventually
    // stops being able to talk to the database at all.
    client.release()
  }
})

// POST /api/auth/login — verifies credentials. For CUSTOMER/CASHIER/
// DELIVERY_PERSONNEL accounts this immediately starts a session. For
// ADMIN accounts it instead issues an OTP and tells the frontend to show
// a code-entry screen — the session isn't created until /verify-otp
// succeeds, further down this file.
//
// No try/catch here: if pool.query rejects (e.g. the database is briefly
// unreachable), Express 5 catches that rejection automatically and routes
// it to the error handler in index.js — nothing in this function needs to
// clean anything up first, unlike /register above.
router.post('/login', async (request, response) => {
  // Users can log in with either their username OR their email — both
  // get normalized to lowercase for a case-insensitive match.
  const identifier = normalize(request.body.identifier).toLowerCase()
  const password = String(request.body.password ?? '')
  if (!identifier || !password) return response.status(422).json({ message: 'Enter your username or email and password.' })

  // Look up the account by username OR email, across ALL FOUR possible
  // role tables (admins, cashiers, customers, delivery_personnel) since
  // each role stores its profile (including email) in its own table.
  // COALESCE picks whichever of the four "name" columns is non-null —
  // only one LEFT JOIN will have actually matched a row for this user.
  const result = await pool.query(
    `SELECT u.user_id, u.username, u.password_hash, u.user_type, u.is_active, u.locked_until,
            COALESCE(a.name, ca.name, c.name, d.name) AS name
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

  // This line deliberately checks ALL failure reasons together (no such
  // user, inactive account, currently locked, OR wrong password) and
  // always returns the SAME generic "Invalid credentials" message for
  // every case. This is intentional: if the error message were different
  // for "no such user" vs. "wrong password", an attacker could use that
  // difference to figure out which usernames/emails actually exist in the
  // system (a "user enumeration" vulnerability).
  //
  // `await bcrypt.compare(...)` re-hashes the submitted password with the
  // same salt stored in the hash and checks if it matches — this is how
  // you "check" a bcrypt password; you never reverse the hash.
  const invalidCredentials = !user || !user.is_active || (user.locked_until && new Date(user.locked_until) > new Date()) || !(await bcrypt.compare(password, user.password_hash))

  if (invalidCredentials) {
    // Only increment the failed-attempt counter if a real user was found —
    // no point tracking attempts against a username that doesn't exist.
    if (user) {
      await pool.query(
        `UPDATE users
         SET failed_login_attempts = failed_login_attempts + 1,
             locked_until = CASE WHEN failed_login_attempts + 1 >= $2 THEN CURRENT_TIMESTAMP + ($3 * INTERVAL '1 minute') ELSE locked_until END
         WHERE user_id = $1`,
        [user.user_id, lockAfterAttempts, lockDurationMinutes],
      )
      // This CASE expression means: "if this failed attempt is the 5th
      // (or more) in a row, set locked_until to 15 minutes from now;
      // otherwise leave locked_until unchanged." This is what actually
      // implements the account-lockout defense declared at the top of
      // the file.
    }
    // 401 = Unauthorized. Same generic message regardless of the exact
    // reason, per the enumeration-prevention note above.
    return response.status(401).json({ message: 'Invalid credentials or unavailable account.' })
  }

  // Successful password check — reset the failed-attempt counter and
  // clear any lock, so the next login attempt starts with a clean slate.
  await pool.query('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE user_id = $1', [user.user_id])

  // Admins get a second factor before a session is issued. Instead of
  // logging them in here, generate an OTP, "send" it (currently just
  // logged to the console — see the TODO), and tell the frontend to show
  // a code-entry screen instead of the dashboard.
  if (user.user_type === 'ADMIN') {
    const code = await createOtpCode(user.user_id)
    // TODO: send via SMS gateway (e.g. Semaphore, Movider) once an account is set up.
    console.log(`[DEV] OTP for admin "${user.username}": ${code} (would be sent by SMS)`)
    return response.json({ otpRequired: true, username: user.username })
  }

  // Every other role: password was correct, no second factor needed —
  // start the session immediately.
  const sessionId = await createSession(user.user_id)
  // response.cookie(...) builds a Set-Cookie response header. The browser
  // receiving this response stores the cookie and will automatically
  // attach it to future requests to this origin (until it expires) —
  // this is how "being logged in" persists across page loads without the
  // frontend manually managing a token.
  response.cookie(sessionCookieName, sessionId, sessionCookieOptions)
  // Send back just enough info for the frontend to personalize the UI
  // and gate access to role-specific screens. No password hash, no other
  // sensitive fields. `user_type.replaceAll('_', ' ')` turns a
  // DB-friendly value like "DELIVERY_PERSONNEL" into the more
  // display-friendly "DELIVERY PERSONNEL" your React code checks against.
  return response.json({ user: { id: user.user_id, name: user.name, username: user.username, role: user.user_type.replaceAll('_', ' ') } })
})

// POST /api/auth/verify-otp — the second half of admin login. Called by
// the frontend after /login responds with { otpRequired: true }.
router.post('/verify-otp', async (request, response) => {
  const username = normalize(request.body.username).toLowerCase()
  const code = normalize(request.body.code)
  if (!username || !code) return response.status(422).json({ message: 'Enter the code sent to your phone.' })

  // One shared response for every failure case, same enumeration-
  // prevention reasoning as the login route above.
  const invalidCodeResponse = { message: 'Invalid or expired code. Please sign in again.' }

  const userResult = await pool.query(
    `SELECT u.user_id, u.username, u.user_type, u.is_active, a.name
     FROM users u
     JOIN admins a ON a.user_id = u.user_id
     WHERE LOWER(u.username) = $1 AND u.user_type = 'ADMIN'
     LIMIT 1`,
    [username],
  )
  const user = userResult.rows[0]
  if (!user || !user.is_active) return response.status(401).json(invalidCodeResponse)

  // Find this admin's most recent OTP that hasn't already been used
  // (consumed_at IS NULL) and hasn't expired yet.
  const otpResult = await pool.query(
    `SELECT otp_id, code_hash, attempt_count
     FROM otp_codes
     WHERE user_id = $1 AND consumed_at IS NULL AND expires_at > CURRENT_TIMESTAMP
     ORDER BY created_at DESC
     LIMIT 1`,
    [user.user_id],
  )
  const otp = otpResult.rows[0]
  // No valid OTP row at all, or this one's already had too many wrong
  // guesses against it — reject without even checking the code.
  if (!otp || otp.attempt_count >= otpMaxAttempts) return response.status(401).json(invalidCodeResponse)

  if (otp.code_hash !== hashOtpCode(code)) {
    await pool.query('UPDATE otp_codes SET attempt_count = attempt_count + 1 WHERE otp_id = $1', [otp.otp_id])
    return response.status(401).json(invalidCodeResponse)
  }

  // Correct code — mark it consumed so this exact code can never be used
  // again (even if it hasn't expired yet), then finally create the
  // session that /login deferred.
  await pool.query('UPDATE otp_codes SET consumed_at = CURRENT_TIMESTAMP WHERE otp_id = $1', [otp.otp_id])
  const sessionId = await createSession(user.user_id)
  response.cookie(sessionCookieName, sessionId, sessionCookieOptions)
  return response.json({ user: { id: user.user_id, name: user.name, username: user.username, role: user.user_type.replaceAll('_', ' ') } })
})

// POST /api/auth/logout
router.post('/logout', async (request, response) => {
  const sessionId = parseCookies(request.headers.cookie)[sessionCookieName]
  // If sessionId is missing or doesn't match any row, DELETE just matches
  // zero rows — harmless either way, no need to check first.
  if (sessionId) await pool.query('DELETE FROM sessions WHERE session_id = $1', [sessionId])
  // Tells the BROWSER to remove the cookie immediately, regardless of its
  // maxAge.
  response.clearCookie(sessionCookieName, { path: '/' })
  // 204 = No Content: success, nothing to send back.
  return response.status(204).end()
})

// GET /api/auth/me — lets the frontend ask "is my session still valid?"
// on page load, so a refresh doesn't force a re-login.
// Express route handlers can take multiple functions in a row; each runs
// in order and either calls next() to continue or ends the response
// itself. requireAuth (from lib/auth.js) runs FIRST — only if it calls
// next() does this second function run at all.
router.get('/me', requireAuth, (request, response) => {
  // requireAuth already attached the resolved user onto `request.user` —
  // this handler just echoes it back.
  return response.json({ user: request.user })
})

// Default export, paired with `import authRouter from './routes/auth.js'`
// in index.js.
export default router
