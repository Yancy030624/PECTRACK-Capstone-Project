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

// Each validator returns an error message string, or undefined when valid —
// callers do `const error = validateX(value); if (error) errors.x = error`.

export function validateName(name) {
  if (!/^[\p{L}][\p{L}\s.'-]{1,148}$/u.test(name)) return 'Enter a full name using letters, spaces, apostrophes, periods, or hyphens only.'
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
  if (commonPasswords.has(password.toLowerCase()) || password.toLowerCase().includes(username) || password.toLowerCase().includes(email.split('@')[0])) return 'Choose a less predictable password that does not contain your username or email name.'
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
