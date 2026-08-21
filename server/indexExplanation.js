// ============================================================================
// PECTRACK API — index.js (annotated for learning)
// This is an Express.js backend server. It exposes a small REST API with
// three routes: health check, register, and login.
// ============================================================================

// Loads variables from a ".env" file into process.env (e.g. DATABASE_URL,
// PORT). Must be imported first so env vars are ready before anything else
// (like db.js) tries to read them.
import 'dotenv/config'

// bcrypt hashes and verifies passwords. We NEVER store raw passwords —
// only a one-way hash. Even if the database leaks, attackers can't easily
// recover the original passwords from the hash.
import bcrypt from 'bcrypt'

// CORS = Cross-Origin Resource Sharing. Browsers block a webpage on one
// origin (e.g. http://localhost:5173, your React dev server) from calling
// an API on a different origin (e.g. http://localhost:3001) unless the API
// explicitly allows it. This middleware adds the headers that grant that
// permission.
import cors from 'cors'

// The web framework itself — handles HTTP routing, request parsing, etc.
import express from 'express'

// Your own module that sets up and exports a PostgreSQL connection pool
// (presumably using the `pg` package). Kept in a separate file so the
// connection logic isn't duplicated across every route file.
import { pool } from './db.js'

// Create the Express application instance. Every route and middleware
// attaches to this object.
const app = express()

// Which port the server listens on. `process.env.PORT` lets you override
// it via environment variable (useful in production/hosting); `?? 3001`
// is the fallback default if that env var isn't set.
const port = Number(process.env.PORT ?? 3001)

// bcrypt "rounds" controls how many times the hashing algorithm loops —
// higher = slower to compute = harder to brute-force, but also slower for
// your own server to check logins. 12 is a solid, commonly recommended
// default in 2024+ (roughly ~250ms per hash on typical hardware).
const bcryptRounds = 12

// Account lockout settings: after this many WRONG password attempts in a
// row, the account gets temporarily locked. This defends against
// brute-force attacks (a bot guessing thousands of passwords per minute).
const lockAfterAttempts = 5

// How long (in minutes) the account stays locked once triggered.
const lockDurationMinutes = 15

// A small denylist of extremely common/guessable passwords. Even though
// the regex below already demands complexity (upper/lower/digit/symbol),
// something like "Password123!" would still pass that regex while being
// trivially guessable — so we block a few obvious ones by name too.
const commonPasswords = new Set(['password', 'password123', '12345678', 'qwerty123', 'admin123', 'letmein', 'pectrack'])

// --- Middleware setup -------------------------------------------------
// Middleware = functions that run on EVERY incoming request before it
// reaches your route handlers below.

// Only allow requests from the React dev server's origin. Any other
// origin trying to call this API from a browser gets blocked by the
// browser itself (the server technically responds, but the browser
// refuses to hand the response to the calling page's JavaScript).
app.use(cors({ origin: 'http://localhost:5173' }))

// Automatically parses incoming JSON request bodies (e.g. from
// fetch(..., { body: JSON.stringify(...) })) into `request.body` as a
// plain JS object. `limit: '10kb'` caps body size to prevent someone
// from sending a huge payload to exhaust server memory (a basic DoS
// defense).
app.use(express.json({ limit: '10kb' }))

// --- Small helper functions --------------------------------------------

// Converts any input to a string and trims leading/trailing whitespace.
// `value ?? ''` means: if value is null or undefined, use '' instead —
// this avoids String(null) becoming the literal text "null".
const normalize = (value) => String(value ?? '').trim()

// Same as normalize, but also lowercases — used for emails, since
// "User@Example.com" and "user@example.com" should be treated as the
// same address when checking for duplicates or logging in.
const normalizeEmail = (value) => normalize(value).toLowerCase()

// --- Registration validation --------------------------------------------
// Runs every field from the signup form through checks BEFORE anything
// touches the database. This is "server-side validation" — even though
// your React form already checks some of this, a malicious user could
// call the API directly (skipping the browser form entirely), so the
// server must never trust the client and must re-validate everything.
function validateRegistration(body) {
  const name = normalize(body.name)
  const username = normalize(body.username).toLowerCase()
  const email = normalizeEmail(body.email)
  const contactNumber = normalize(body.contactNumber)
  // Passwords are NOT normalized/trimmed — a trailing space could be an
  // intentional part of someone's password, so we keep it exactly as typed.
  const password = String(body.password ?? '')
  const confirmPassword = String(body.confirmPassword ?? '')

  // Collect field-specific error messages here. Keying by field name lets
  // the frontend show the right error under the right input box.
  const errors = {}

  // Name: must start with a letter (any language, thanks to \p{L} — the
  // Unicode "Letter" category, so "José" or "李" are valid), then allow
  // letters, spaces, apostrophes, periods, or hyphens for the rest,
  // 2–149 characters total (150 max). The `u` flag enables Unicode mode
  // so \p{L} works.
  if (!/^[\p{L}][\p{L}\s.'-]{1,148}$/u.test(name)) errors.name = 'Enter a full name using letters, spaces, apostrophes, periods, or hyphens only.'

  // Username: must start with a lowercase letter, then 2–29 more
  // characters of lowercase letters/digits/./_/- (3–30 chars total).
  // Restricting to lowercase avoids "Alice" and "alice" being treated as
  // different usernames later.
  if (!/^[a-z][a-z0-9._-]{2,29}$/.test(username)) errors.username = 'Username must be 3–30 characters and use lowercase letters, numbers, periods, underscores, or hyphens.'

  // Email: a deliberately simple "good enough" pattern (something@something.something)
  // rather than a fully RFC-5322-compliant regex (those are notoriously
  // complex and still imperfect). 254 is the practical max length for an
  // email address per RFC 5321.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) errors.email = 'Enter a valid email address.'

  // Contact number: strip spaces/parens/hyphens first, then require an
  // optional leading "+" followed by 10–15 digits (a loose international
  // phone number format, per the ITU E.164-ish convention).
  if (!/^\+?[0-9]{11}$/.test(contactNumber.replace(/[\s()-]/g, ''))) errors.contactNumber = 'Enter a valid contact number with 11 digits.'

  // --- Password checks (checked in order, most fundamental first) -----

  // bcrypt has a hard limit: it only looks at the first 72 BYTES of a
  // password (not characters — a single emoji or accented letter can be
  // several bytes). Anything beyond byte 72 is silently ignored by
  // bcrypt, which would be misleading, so we explicitly reject it here
  // instead of pretending the whole password mattered.
  if (Buffer.byteLength(password, 'utf8') > 72) errors.password = 'Password is too long. Use 72 bytes or fewer.'

  // Otherwise, enforce complexity: at least 12 characters, and at least
  // one of each: lowercase, uppercase, digit, and symbol (\d = digit,
  // [^A-Za-z0-9] = anything that's not a letter or digit).
  else if (password.length < 12 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) errors.password = 'Use at least 12 characters with uppercase, lowercase, number, and symbol.'

  // Even a "complex" password can be weak if it's a known common password,
  // or if it just contains the person's own username/email (e.g.
  // "Maria123!maria" technically passes the regex above but is an easy
  // guess once an attacker knows the username).
  else if (commonPasswords.has(password.toLowerCase()) || password.toLowerCase().includes(username) || password.toLowerCase().includes(email.split('@')[0])) errors.password = 'Choose a less predictable password that does not contain your username or email name.'

  // Simple equality check — the classic "type your password twice" guard
  // against typos.
  if (password !== confirmPassword) errors.confirmPassword = 'Passwords do not match.'

  // Return both the errors (empty object = all valid) and the cleaned-up
  // values, so the route handler below doesn't have to re-normalize
  // anything.
  return { errors, values: { name, username, email, contactNumber: contactNumber.replace(/[\s()-]/g, ''), password } }
}

// --- Routes ---------------------------------------------------------------

// GET /api/health — a simple "is the server (and database) alive?" check,
// commonly used by uptime monitors, load balancers, or deployment tools
// to confirm the service is ready before routing traffic to it.
app.get('/api/health', async (_request, response, next) => {
  try {
    // A trivial query that doesn't touch real tables — if this succeeds,
    // the database connection itself is working.
    await pool.query('SELECT 1')
    response.json({ status: 'ok' })
  } catch (error) {
    // Pass the error to Express's error-handling middleware at the bottom
    // of this file, instead of crashing the process or handling it here.
    next(error)
  }
})

// POST /api/auth/register — creates a new CUSTOMER account.
app.post('/api/auth/register', async (request, response, next) => {
  // Validate everything up front. If anything's wrong, respond with
  // HTTP 422 (Unprocessable Entity — "I understood the request, but the
  // data is invalid") and don't touch the database at all.
  const { errors, values } = validateRegistration(request.body)
  if (Object.keys(errors).length) return response.status(422).json({ message: 'Please correct the highlighted fields.', errors })

  // Grab a single dedicated connection from the pool so we can run a
  // multi-statement TRANSACTION on it (transactions must stay on the same
  // connection for their entire lifetime).
  const client = await pool.connect()
  try {
    // BEGIN starts a transaction: all the queries below either ALL
    // succeed together (COMMIT) or ALL get undone together (ROLLBACK).
    // This matters here because we're inserting into TWO tables (users
    // and customers) — without a transaction, a crash between the two
    // inserts could leave a "user" row with no matching "customer" row.
    await client.query('BEGIN')

    // Check whether the username, email, or contact number is already
    // taken. This is a pre-check for a friendlier error message — the
    // database itself likely also has UNIQUE constraints as a backstop
    // (see the catch block below, which handles that case too).
    const duplicate = await client.query(
      `SELECT 1
       FROM users u
       LEFT JOIN customers c ON c.user_id = u.user_id
       WHERE LOWER(u.username) = $1 OR LOWER(c.email) = $2 OR c.contact_num = $3
       LIMIT 1`,
      [values.username, values.email, values.contactNumber],
    )
    // Note: `$1`, `$2`, `$3` are parameterized query placeholders — the
    // actual values are sent separately from the SQL text. This is the
    // standard defense against SQL injection; never build queries by
    // concatenating user input directly into the SQL string.
    if (duplicate.rowCount) {
      await client.query('ROLLBACK')
      return response.status(409).json({ message: 'An account already uses that username, email, or contact number.' })
      // 409 = Conflict: the request is valid, but conflicts with existing
      // data.
    }

    // Hash the password. `bcrypt.hash` is asynchronous and CPU-intensive
    // on purpose (see bcryptRounds above) — that intentional slowness is
    // what makes brute-forcing the hash impractical.
    const passwordHash = await bcrypt.hash(values.password, bcryptRounds)

    // Insert the core account row. `user_type` is hardcoded to
    // 'CUSTOMER' here — this endpoint can only ever create customer
    // accounts; admin/cashier/delivery accounts presumably get created
    // some other way (e.g. by an admin, not public self-registration).
    // `RETURNING` gives back the columns of the row we just inserted
    // without needing a second SELECT query.
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
    // UNIQUE constraint catches what the manual check might miss.
    if (error.code === '23505') return response.status(409).json({ message: 'An account already uses that username, email, or contact number.' })

    // Anything else unexpected — hand off to the generic error handler.
    return next(error)
  } finally {
    // ALWAYS release the connection back to the pool, whether we
    // succeeded or threw — otherwise the pool slowly runs out of
    // available connections ("connection leak") and the app eventually
    // stops being able to talk to the database at all.
    client.release()
  }
})

// POST /api/auth/login — verifies credentials and starts a session
// (well — here it just returns the user's info; actual session/token
// issuance isn't shown in this file).
app.post('/api/auth/login', async (request, response, next) => {
  // Users can log in with either their username OR their email — both
  // get normalized to lowercase for a case-insensitive match.
  const identifier = normalize(request.body.identifier).toLowerCase()
  const password = String(request.body.password ?? '')
  if (!identifier || !password) return response.status(422).json({ message: 'Enter your username or email and password.' })

  try {
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

    // This line deliberately checks ALL failure reasons together (no
    // such user, inactive account, currently locked, OR wrong password)
    // and always returns the SAME generic "Invalid credentials" message
    // for every case. This is intentional: if the error message were
    // different for "no such user" vs. "wrong password", an attacker
    // could use that difference to figure out which usernames/emails
    // actually exist in the system (a "user enumeration" vulnerability).
    //
    // `await bcrypt.compare(...)` re-hashes the submitted password with
    // the same salt stored in the hash and checks if it matches — this
    // is how you "check" a bcrypt password; you never reverse the hash.
    const invalidCredentials = !user || !user.is_active || (user.locked_until && new Date(user.locked_until) > new Date()) || !(await bcrypt.compare(password, user.password_hash))

    if (invalidCredentials) {
      // Only increment the failed-attempt counter if a real user was
      // found — no point tracking attempts against a username that
      // doesn't exist.
      if (user) {
        await pool.query(
          `UPDATE users
           SET failed_login_attempts = failed_login_attempts + 1,
               locked_until = CASE WHEN failed_login_attempts + 1 >= $2 THEN CURRENT_TIMESTAMP + ($3 * INTERVAL '1 minute') ELSE locked_until END
           WHERE user_id = $1`,
          [user.user_id, lockAfterAttempts, lockDurationMinutes],
        )
        // This CASE expression means: "if this failed attempt is the
        // 5th (or more) in a row, set locked_until to 15 minutes from
        // now; otherwise leave locked_until unchanged." This is what
        // actually implements the account-lockout defense declared at
        // the top of the file.
      }
      // 401 = Unauthorized. Same generic message regardless of the exact
      // reason, per the enumeration-prevention note above.
      return response.status(401).json({ message: 'Invalid credentials or unavailable account.' })
    }

    // Successful login — reset the failed-attempt counter and clear any
    // lock, so the next login starts with a clean slate.
    await pool.query('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE user_id = $1', [user.user_id])

    // Send back just enough info for the frontend to personalize the UI
    // and gate access to role-specific screens. Note: no password hash,
    // no other sensitive fields — only what's needed.
    // `user_type.replaceAll('_', ' ')` turns a DB-friendly value like
    // "DELIVERY_PERSONNEL" into the more display-friendly "DELIVERY
    // PERSONNEL" your React code checks against.
    return response.json({ user: { id: user.user_id, name: user.name, username: user.username, role: user.user_type.replaceAll('_', ' ') } })
  } catch (error) {
    return next(error)
  }
})

// --- Global error handler --------------------------------------------
// Express recognizes this as an error-handling middleware specifically
// because it takes FOUR arguments (error, request, response, next) —
// that's how Express distinguishes it from normal middleware. Any error
// passed to `next(error)` anywhere above ends up here.
app.use((error, _request, response, _next) => {
  // Log the full error server-side for debugging...
  console.error(error)
  // ...but never leak internal error details (stack traces, SQL errors,
  // etc.) to the client — that could expose sensitive implementation
  // details to an attacker. Just a generic 500 (Internal Server Error).
  response.status(500).json({ message: 'The service could not process your request. Please try again later.' })
})

// Start listening for HTTP requests on the configured port.
app.listen(port, () => console.log(`PECTRACK API listening on http://localhost:${port}`))