// Shared field validation and normalization for any route that creates or
// edits an account — customer self-registration and admin-created staff
// accounts (routes/auth.js, routes/staff.js) need the exact same rules.
// Individual field validators are exported separately from
// validateAccountFields so a partial-update endpoint (editing just a
// name or email) can validate only the fields it actually received,
// without also requiring a password.

const commonPasswords = new Set(['password', 'password123', '12345678', 'qwerty123', 'admin123', 'letmein', 'pectrack'])

export const normalize = (value) => String(value ?? '').trim()
export const normalizeEmail = (value) => normalize(value).toLowerCase()

// Largest value a Postgres BIGINT can hold. Written as a BigInt literal
// (the trailing n) because this number is bigger than Number can represent
// exactly — comparing it as a plain number would silently round.
const maxBigIntValue = 9223372036854775807n

// Validates a database id that arrived as text — a :id route param, or a
// productId inside a request body. Postgres rejects anything that isn't a
// valid BIGINT literal (error 22P02 for 'abc', 22003 for a value past the
// range above), and since those errors happen inside the query they'd
// surface to the client as a generic 500 rather than "no such record".
// Checking the shape up front lets the route answer 404/422 instead, which
// is both cleaner AND correct: an id that could never exist behaves
// exactly like one that doesn't.
//
// Returns the id as a STRING, never a Number. Bigint values can exceed
// Number.MAX_SAFE_INTEGER, and pg already returns them as strings, so
// staying in string form keeps comparisons consistent and avoids any
// precision loss.
export function parseId(rawId) {
  const value = normalize(rawId)
  if (!/^\d+$/.test(value)) return null
  if (BigInt(value) > maxBigIntValue) return null
  return value
}

// Each validator returns an error message string, or undefined when valid —
// callers do `const error = validateX(value); if (error) errors.x = error`.

export function validateName(name) {
  if (!/^[\p{L}][\p{L}\s.'-]{1,148}$/u.test(name)) return 'Enter a full name using letters, spaces, apostrophes, periods, or hyphens only.'
}

// First name or last name of a customer (migration 026). 70 characters
// each, so the two with a space still fit customers.name (150).
const personNameMaxLength = 70
export function validatePersonName(value, label) {
  if (!value) return `Enter your ${label}.`
  if (value.length > personNameMaxLength) return `Keep the ${label} to ${personNameMaxLength} characters or fewer.`
  if (!/^[\p{L}][\p{L}\s.'-]*$/u.test(value)) return `Enter a ${label} using letters, spaces, apostrophes, periods, or hyphens only.`
}

export function validateUsername(username) {
  if (!/^[a-z][a-z0-9._-]{2,29}$/.test(username)) return 'Username must be 3–30 characters and use lowercase letters, numbers, periods, underscores, or hyphens.'
}

export function validateEmailField(email) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return 'Enter a valid email address.'
}

// Expects contactNumber already stripped of spaces/parens/hyphens.
export function validateContactNumberField(contactNumber) {
  if (!/^\+?[0-9]{10,15}$/.test(contactNumber)) return 'Enter a valid contact number with 10–15 digits.'
}

export function validatePasswordField(password, { username, email }) {
  if (Buffer.byteLength(password, 'utf8') > 72) return 'Password is too long. Use 72 bytes or fewer.'
  if (password.length < 12 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) return 'Use at least 12 characters with uppercase, lowercase, number, and symbol.'

  const lowered = password.toLowerCase()
  const emailName = String(email ?? '').split('@')[0]
  // The `username &&` / `emailName &&` guards matter: ''.includes('') is
  // TRUE in JavaScript, so on a form submitted with an empty username or
  // email this check used to fire for every password, adding a confusing
  // "does not contain your username" error on top of the real blank-field
  // one. An absent value simply has nothing to compare against.
  if (commonPasswords.has(lowered) || (username && lowered.includes(username)) || (emailName && lowered.includes(emailName))) return 'Choose a less predictable password that does not contain your username or email name.'
}

export function validateAccountFields(body) {
  const name = normalize(body.name)
  const username = normalize(body.username).toLowerCase()
  const email = normalizeEmail(body.email)
  const contactNumber = normalize(body.contactNumber).replace(/[\s()-]/g, '')
  const password = String(body.password ?? '')
  const confirmPassword = String(body.confirmPassword ?? '')
  const errors = {}

  const nameError = validateName(name)
  if (nameError) errors.name = nameError
  const usernameError = validateUsername(username)
  if (usernameError) errors.username = usernameError
  const emailError = validateEmailField(email)
  if (emailError) errors.email = emailError
  const contactNumberError = validateContactNumberField(contactNumber)
  if (contactNumberError) errors.contactNumber = contactNumberError
  const passwordError = validatePasswordField(password, { username, email })
  if (passwordError) errors.password = passwordError
  if (password !== confirmPassword) errors.confirmPassword = 'Passwords do not match.'

  return { errors, values: { name, username, email, contactNumber, password } }
}

// Customer self-registration (routes/auth.js /register). The adviser
// (2026-10-16) asked for a first and a last name instead of one full name,
// and for every required field to say so when it is left empty — here as
// well as on the form, so a request sent straight to the server cannot
// skip a field. Staff accounts keep validateAccountFields and one name.
const requiredMessages = {
  username: 'Enter a username.',
  email: 'Enter your email address.',
  contactNumber: 'Enter your contact number.',
  password: 'Enter a password.',
  confirmPassword: 'Enter your password again.',
}
export function validateCustomerRegistration(body) {
  const { errors, values } = validateAccountFields(body)
  delete errors.name
  const firstName = normalize(body.firstName)
  const lastName = normalize(body.lastName)
  const firstNameError = validatePersonName(firstName, 'first name')
  if (firstNameError) errors.firstName = firstNameError
  const lastNameError = validatePersonName(lastName, 'last name')
  if (lastNameError) errors.lastName = lastNameError
  // An empty field gets "Enter your …", not the format rule it also fails.
  for (const [field, message] of Object.entries(requiredMessages)) {
    if (!normalize(body[field])) errors[field] = message
  }
  if (body.agree !== true) errors.agree = 'Agree to the Terms of Service and Privacy Policy to create an account.'
  const { name: _unused, ...rest } = values
  return { errors, values: { ...rest, firstName, lastName } }
}

// A NUMERIC quantity (ingredient stock, CLIENT_REVISIONS_PLAN.md R5), kept
// as a STRING so it reaches Postgres exactly as typed — 12.5 kg is never a
// binary float on the way. Returns null when invalid: not a plain decimal,
// more than `decimals` places, outside [min, max], or zero unless allowed.
export function parseQuantity(raw, { min = 0, max = 999999999, decimals = 3, allowZero = false } = {}) {
  const text = normalize(raw)
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null
  const value = Number(text)
  if (!Number.isFinite(value)) return null
  const fraction = text.split('.')[1] ?? ''
  if (fraction.length > decimals) return null
  if (value < min || value > max) return null
  if (!allowZero && value === 0) return null
  return text.replace(/^(-?)0+(?=\d)/, '$1')
}
