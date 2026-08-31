// ============================================================================
// PECTRACK API — routes/staff.js (annotated for learning)
// Admin-only account management for CASHIER and DELIVERY_PERSONNEL staff.
// Mounted at /api/staff in app.js.
//
// Why admins aren't created here too: we agreed on a specific model —
// admin accounts are seeded directly into the database by a developer
// (there's no "first admin" bootstrapping problem to solve, since a
// developer already has direct database access), and from then on, an
// admin creates every other staff account through the app. Letting THIS
// endpoint also create admins would mean any admin could mint unlimited
// more admins through the API with no additional oversight — out of scope
// for what we agreed on, not a technical limitation.
// ============================================================================

import bcrypt from 'bcrypt'
import express from 'express'
import { pool } from '../db.js'
// Same shared helpers routes/auth.js uses for /register — see
// lib/accountsExplanation.js and lib/validationExplanation.js. Staff
// accounts need the exact same field rules and duplicate-check as a
// self-registered customer; only which table the profile row goes into
// differs.
import { bcryptRounds, findDuplicateAccount } from '../lib/accounts.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { normalize, validateAccountFields } from '../lib/validation.js'

const router = express.Router()

// Maps the role a caller asks to create to the profile table it belongs
// in. This is a closed set on purpose — only these two keys can ever
// exist, so `staffRoleTables[someUserSuppliedString]` can only ever
// resolve to 'cashiers', 'delivery_personnel', or undefined. That's what
// makes it safe to use the result inside a SQL string later (see the
// comment on the INSERT in the POST route below).
const staffRoleTables = {
  CASHIER: 'cashiers',
  DELIVERY_PERSONNEL: 'delivery_personnel',
}

// router.use(...) here — rather than repeating requireAuth and
// requireRole on every route below — applies both middlewares to
// EVERYTHING in this file. Any route added to this router later
// automatically inherits "must be a logged-in admin" without having to
// remember to add the check itself.
router.use(requireAuth, requireRole('ADMIN'))

// GET /api/staff — lists every cashier and delivery-personnel account, for
// an eventual "Staff Management" admin screen to render.
router.get('/', async (_request, response) => {
  // COALESCE picks whichever of the two profile tables actually matched —
  // same pattern used for the four-way role lookup in routes/auth.js's
  // /login, just narrowed to the two staff roles this endpoint cares about.
  const result = await pool.query(
    `SELECT u.user_id, u.username, u.user_type, u.is_active, u.created_at,
            COALESCE(ca.name, d.name) AS name,
            COALESCE(ca.contact_num, d.contact_num) AS contact_num,
            COALESCE(ca.email, d.email) AS email
     FROM users u
     LEFT JOIN cashiers ca ON ca.user_id = u.user_id
     LEFT JOIN delivery_personnel d ON d.user_id = u.user_id
     WHERE u.user_type IN ('CASHIER', 'DELIVERY_PERSONNEL')
     ORDER BY u.created_at DESC`,
  )
  // Reshapes each database row (snake_case columns) into camelCase
  // response fields — a small translation layer between "how Postgres
  // names things" and "how the frontend/JSON API names things".
  return response.json({
    staff: result.rows.map((row) => ({
      id: row.user_id,
      username: row.username,
      role: row.user_type,
      isActive: row.is_active,
      name: row.name,
      contactNumber: row.contact_num,
      email: row.email,
      createdAt: row.created_at,
    })),
  })
})

// POST /api/staff — creates a CASHIER or DELIVERY_PERSONNEL account. Very
// similar shape to routes/auth.js's /register, since it's doing the same
// fundamental thing (validate, check for duplicates, insert into users
// plus one role table, inside a transaction) — the differences are just
// WHICH role table, and WHO's allowed to call it.
router.post('/', async (request, response) => {
  const role = normalize(request.body.role).toUpperCase()
  // If `role` isn't exactly 'CASHIER' or 'DELIVERY_PERSONNEL', this is
  // undefined and we reject below BEFORE any database work happens.
  const table = staffRoleTables[role]
  if (!table) return response.status(422).json({ message: 'Role must be CASHIER or DELIVERY_PERSONNEL.', errors: { role: 'Select a valid staff role.' } })

  const { errors, values } = validateAccountFields(request.body)
  if (Object.keys(errors).length) return response.status(422).json({ message: 'Please correct the highlighted fields.', errors })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    if (await findDuplicateAccount(client, values)) {
      await client.query('ROLLBACK')
      return response.status(409).json({ message: 'An account already uses that username, email, or contact number.' })
    }

    // Same reasoning as /register: bcrypt is deliberately slow, so
    // brute-forcing a stolen hash is impractical. The admin typed this
    // password in directly (per the agreed model), but it still goes
    // through the exact same hashing — nothing about who chose the
    // password changes how it needs to be stored.
    const passwordHash = await bcrypt.hash(values.password, bcryptRounds)
    // Unlike /register (which hardcodes 'CUSTOMER'), `role` here is a
    // variable — but it's already been checked against staffRoleTables
    // above, so by this point it can only be 'CASHIER' or
    // 'DELIVERY_PERSONNEL', both valid values of the user_role enum.
    const userResult = await client.query(
      `INSERT INTO users (username, password_hash, user_type)
       VALUES ($1, $2, $3)
       RETURNING user_id, username`,
      [values.username, passwordHash, role],
    )
    const user = userResult.rows[0]
    // `table` is interpolated directly into the SQL string here — normally
    // a red flag for SQL injection, since string-building a query around
    // untrusted input is exactly what parameterized queries ($1, $2, ...)
    // exist to prevent. This is safe specifically because `table` was
    // never derived from raw request input — it only ever came out of the
    // `staffRoleTables` lookup above, whose only possible values are the
    // two hardcoded strings 'cashiers' and 'delivery_personnel'. There is
    // no code path where an attacker's input reaches this string directly.
    await client.query(
      `INSERT INTO ${table} (user_id, name, contact_num, email)
       VALUES ($1, $2, $3, $4)`,
      [user.user_id, values.name, values.contactNumber, values.email],
    )
    await client.query('COMMIT')
    return response.status(201).json({ message: 'Staff account created.', user: { username: user.username, role } })
  } catch (error) {
    await client.query('ROLLBACK')
    if (error.code === '23505') return response.status(409).json({ message: 'An account already uses that username, email, or contact number.' })
    throw error
  } finally {
    client.release()
  }
})

export default router
