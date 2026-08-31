// ============================================================================
// PECTRACK API — lib/validation.js (annotated for learning)
// Field validation and string normalization shared by every route that
// creates an account. Extracted here in Phase 3 because routes/staff.js
// needed the EXACT same name/username/email/contact/password rules that
// routes/auth.js's /register already had — rather than copy-pasting that
// logic into a second file, both routes now import it from one place. If
// the password policy ever changes, there's one function to update, not two.
// ============================================================================

// A small denylist of extremely common/guessable passwords. Even though
// the regex below already demands complexity (upper/lower/digit/symbol),
// something like "Password123!" would still pass that regex while being
// trivially guessable — so we block a few obvious ones by name too.
const commonPasswords = new Set(['password', 'password123', '12345678', 'qwerty123', 'admin123', 'letmein', 'pectrack'])

// Converts any input to a string and trims leading/trailing whitespace.
// `value ?? ''` means: if value is null or undefined, use '' instead —
// this avoids String(null) becoming the literal text "null". Exported
// because routes/auth.js also uses it directly for login/OTP identifiers,
// not just inside validateAccountFields below.
export const normalize = (value) => String(value ?? '').trim()

// Same as normalize, but also lowercases — used for emails, since
// "User@Example.com" and "user@example.com" should be treated as the
// same address when checking for duplicates or logging in.
export const normalizeEmail = (value) => normalize(value).toLowerCase()

// The largest value a Postgres BIGINT column can hold. The trailing `n`
// makes this a BigInt literal rather than a normal number — necessary
// because this value is larger than JavaScript's Number can represent
// exactly, so writing it without the `n` would silently round it and make
// the comparison below wrong.
const maxBigIntValue = 9223372036854775807n

// Validates a database id that arrived as TEXT — either a :id route
// parameter (`/api/products/7` gives you the string '7') or a productId
// inside a JSON request body.
//
// WHY this exists: all our primary keys are BIGINT. When Postgres is asked
// to compare a BIGINT column against something that isn't a valid bigint
// literal, the QUERY ITSELF fails:
//   'abc'                  -> error 22P02, invalid input syntax
//   '99999999999999999999' -> error 22003, value out of range
// Those failures happen inside the database, so they bubble up to app.js's
// global error handler and reach the user as a generic 500 — "the service
// is broken" — when the honest answer is just "no such record". Any
// frontend bug that puts `undefined` in a URL would trigger it.
//
// Checking the SHAPE of the id before querying lets each route answer with
// a normal 404 (or 422 for a body field) instead. That's not merely
// prettier: an id that could never exist behaves exactly like one that
// doesn't, which is the truthful response.
//
// WHY it returns a string and never a Number: bigint values can exceed
// Number.MAX_SAFE_INTEGER, where converting to a Number loses precision.
// The pg driver already hands bigint columns back as strings for that same
// reason, so keeping ids as strings end-to-end means our values and the
// database's values are always directly comparable — no conversion at the
// call sites, and no chance of a silently mangled id. (routes/orders.js
// depends on exactly this when it keys a Map of products by id.)
export function parseId(rawId) {
  const value = normalize(rawId)
  // Digits only — this also rejects '', '1.5', '-1', and ' 12 ' after trim.
  if (!/^\d+$/.test(value)) return null
  // Shape is fine but the number may still be too big for the column.
  if (BigInt(value) > maxBigIntValue) return null
  return value
}

// Runs every field from an account-creation form through checks BEFORE
// anything touches the database. This is "server-side validation" — even
// though the React form already checks some of this, a malicious user
// could call the API directly (skipping the browser form entirely), so
// the server must never trust the client and must re-validate everything.
// Used for BOTH customer self-registration and admin-created staff
// accounts — the fields and rules are identical either way; only what
// happens with the validated values afterward differs per route.
export function validateAccountFields(body) {
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
  if (!/^\+?[0-9]{10,15}$/.test(contactNumber.replace(/[\s()-]/g, ''))) errors.contactNumber = 'Enter a valid contact number with 10–15 digits.'

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
  // guess once an attacker knows the username). This check applies just
  // as much when an admin is typing a password in for someone else, which
  // is why staff creation reuses this function rather than skipping it.
  else if (commonPasswords.has(password.toLowerCase()) || password.toLowerCase().includes(username) || password.toLowerCase().includes(email.split('@')[0])) errors.password = 'Choose a less predictable password that does not contain your username or email name.'

  // Simple equality check — the classic "type your password twice" guard
  // against typos. Kept for staff creation too: an admin mistyping a
  // password with no confirmation field would lock the new hire out of
  // their first login with no way to know why.
  if (password !== confirmPassword) errors.confirmPassword = 'Passwords do not match.'

  // Return both the errors (empty object = all valid) and the cleaned-up
  // values, so the calling route doesn't have to re-normalize anything.
  return { errors, values: { name, username, email, contactNumber: contactNumber.replace(/[\s()-]/g, ''), password } }
}
