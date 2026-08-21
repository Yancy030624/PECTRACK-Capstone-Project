import 'dotenv/config'
import bcrypt from 'bcrypt'
import cors from 'cors'
import express from 'express'
import { pool } from './db.js'

const app = express()
const port = Number(process.env.PORT ?? 3001)
const bcryptRounds = 12
const lockAfterAttempts = 5
const lockDurationMinutes = 15
const commonPasswords = new Set(['password', 'password123', '12345678', 'qwerty123', 'admin123', 'letmein', 'pectrack'])

app.use(cors({ origin: 'http://localhost:5173' }))
app.use(express.json({ limit: '10kb' }))

const normalize = (value) => String(value ?? '').trim()
const normalizeEmail = (value) => normalize(value).toLowerCase()

function validateRegistration(body) {
  const name = normalize(body.name)
  const username = normalize(body.username).toLowerCase()
  const email = normalizeEmail(body.email)
  const contactNumber = normalize(body.contactNumber)
  const password = String(body.password ?? '')
  const confirmPassword = String(body.confirmPassword ?? '')
  const errors = {}

  if (!/^[\p{L}][\p{L}\s.'-]{1,148}$/u.test(name)) errors.name = 'Enter a full name using letters, spaces, apostrophes, periods, or hyphens only.'
  if (!/^[a-z][a-z0-9._-]{2,29}$/.test(username)) errors.username = 'Username must be 3–30 characters and use lowercase letters, numbers, periods, underscores, or hyphens.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) errors.email = 'Enter a valid email address.'
  if (!/^\+?[0-9]{10,15}$/.test(contactNumber.replace(/[\s()-]/g, ''))) errors.contactNumber = 'Enter a valid contact number with 10–15 digits.'
  if (Buffer.byteLength(password, 'utf8') > 72) errors.password = 'Password is too long. Use 72 bytes or fewer.'
  else if (password.length < 12 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) errors.password = 'Use at least 12 characters with uppercase, lowercase, number, and symbol.'
  else if (commonPasswords.has(password.toLowerCase()) || password.toLowerCase().includes(username) || password.toLowerCase().includes(email.split('@')[0])) errors.password = 'Choose a less predictable password that does not contain your username or email name.'
  if (password !== confirmPassword) errors.confirmPassword = 'Passwords do not match.'

  return { errors, values: { name, username, email, contactNumber: contactNumber.replace(/[\s()-]/g, ''), password } }
}

app.get('/api/health', async (_request, response, next) => {
  try {
    await pool.query('SELECT 1')
    response.json({ status: 'ok' })
  } catch (error) {
    next(error)
  }
})

app.post('/api/auth/register', async (request, response, next) => {
  const { errors, values } = validateRegistration(request.body)
  if (Object.keys(errors).length) return response.status(422).json({ message: 'Please correct the highlighted fields.', errors })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const duplicate = await client.query(
      `SELECT 1
       FROM users u
       LEFT JOIN customers c ON c.user_id = u.user_id
       WHERE LOWER(u.username) = $1 OR LOWER(c.email) = $2 OR c.contact_num = $3
       LIMIT 1`,
      [values.username, values.email, values.contactNumber],
    )
    if (duplicate.rowCount) {
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
    return next(error)
  } finally {
    client.release()
  }
})

app.post('/api/auth/login', async (request, response, next) => {
  const identifier = normalize(request.body.identifier).toLowerCase()
  const password = String(request.body.password ?? '')
  if (!identifier || !password) return response.status(422).json({ message: 'Enter your username or email and password.' })

  try {
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
    const invalidCredentials = !user || !user.is_active || (user.locked_until && new Date(user.locked_until) > new Date()) || !(await bcrypt.compare(password, user.password_hash))
    if (invalidCredentials) {
      if (user) {
        await pool.query(
          `UPDATE users
           SET failed_login_attempts = failed_login_attempts + 1,
               locked_until = CASE WHEN failed_login_attempts + 1 >= $2 THEN CURRENT_TIMESTAMP + ($3 * INTERVAL '1 minute') ELSE locked_until END
           WHERE user_id = $1`,
          [user.user_id, lockAfterAttempts, lockDurationMinutes],
        )
      }
      return response.status(401).json({ message: 'Invalid credentials or unavailable account.' })
    }

    await pool.query('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE user_id = $1', [user.user_id])
    return response.json({ user: { id: user.user_id, name: user.name, username: user.username, role: user.user_type.replaceAll('_', ' ') } })
  } catch (error) {
    return next(error)
  }
})

app.use((error, _request, response, _next) => {
  console.error(error)
  response.status(500).json({ message: 'The service could not process your request. Please try again later.' })
})

app.listen(port, () => console.log(`PECTRACK API listening on http://localhost:${port}`))
