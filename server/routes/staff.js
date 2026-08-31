// Admin-only staff account management. Admins are seeded directly into the
// database (not created through the API) — this router is how an admin
// creates CASHIER and DELIVERY_PERSONNEL accounts, per the agreed model
// where self-registration only ever creates CUSTOMER accounts. Mounted at
// /api/staff in app.js.
import bcrypt from 'bcrypt'
import express from 'express'
import { pool } from '../db.js'
import { bcryptRounds, findDuplicateAccount } from '../lib/accounts.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { normalize, normalizeEmail, parseId, validateAccountFields, validateContactNumberField, validateEmailField, validateName } from '../lib/validation.js'

const router = express.Router()

// Maps the role a caller asks to create to the profile table it belongs
// in. Deliberately only these two — creating another ADMIN through this
// endpoint is out of scope (admins are seeded manually, agreed earlier).
const staffRoleTables = {
  CASHIER: 'cashiers',
  DELIVERY_PERSONNEL: 'delivery_personnel',
}

// Shared by GET / and PATCH /:id, so both return staff rows in the exact
// same shape.
const mapStaffRow = (row) => ({
  id: row.user_id,
  username: row.username,
  role: row.user_type,
  isActive: row.is_active,
  name: row.name,
  contactNumber: row.contact_num,
  email: row.email,
  createdAt: row.created_at,
})

const staffSelectQuery = `SELECT u.user_id, u.username, u.user_type, u.is_active, u.created_at,
            COALESCE(ca.name, d.name) AS name,
            COALESCE(ca.contact_num, d.contact_num) AS contact_num,
            COALESCE(ca.email, d.email) AS email
     FROM users u
     LEFT JOIN cashiers ca ON ca.user_id = u.user_id
     LEFT JOIN delivery_personnel d ON d.user_id = u.user_id`

// Applies to every route below: must be logged in AND be an admin.
router.use(requireAuth, requireRole('ADMIN'))

router.get('/', async (_request, response) => {
  const result = await pool.query(`${staffSelectQuery} WHERE u.user_type IN ('CASHIER', 'DELIVERY_PERSONNEL') ORDER BY u.created_at DESC`)
  return response.json({ staff: result.rows.map(mapStaffRow) })
})

router.post('/', async (request, response) => {
  const role = normalize(request.body.role).toUpperCase()
  // staffRoleTables[role] is only ever one of the two hardcoded table names
  // above — never a value derived from request input — so interpolating it
  // into the INSERT below is not a SQL-injection risk despite being a
  // dynamic identifier.
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

    const passwordHash = await bcrypt.hash(values.password, bcryptRounds)
    const userResult = await client.query(
      `INSERT INTO users (username, password_hash, user_type)
       VALUES ($1, $2, $3)
       RETURNING user_id, username`,
      [values.username, passwordHash, role],
    )
    const user = userResult.rows[0]
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

// PATCH /api/staff/:id — edit name/email/contactNumber and/or toggle
// isActive. Deliberately excludes username and role: changing role would
// mean moving the profile row between tables entirely (closer to
// "deactivate and recreate" than an edit), and username isn't meant to
// change once set.
router.patch('/:id', async (request, response) => {
  // Same reasoning as routes/customers.js — an id that can't be a valid
  // bigint gets the "not found" answer rather than crashing the query.
  const userId = parseId(request.params.id)
  if (!userId) return response.status(404).json({ message: 'Staff account not found.' })

  const current = await pool.query(
    `SELECT u.user_id, u.username, u.user_type FROM users u WHERE u.user_id = $1 AND u.user_type IN ('CASHIER', 'DELIVERY_PERSONNEL')`,
    [userId],
  )
  const target = current.rows[0]
  if (!target) return response.status(404).json({ message: 'Staff account not found.' })
  const table = staffRoleTables[target.user_type]

  // Validate only the fields actually present in the request body — this
  // is a PARTIAL update, so a request that only wants to toggle isActive
  // shouldn't be forced to also resend a valid name/email.
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
  if ('isActive' in request.body) {
    if (typeof request.body.isActive !== 'boolean') errors.isActive = 'isActive must be true or false.'
    else updates.isActive = request.body.isActive
  }

  if (Object.keys(errors).length) return response.status(422).json({ message: 'Please correct the highlighted fields.', errors })
  if (Object.keys(updates).length === 0) return response.status(422).json({ message: 'Provide at least one field to update.' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    if (updates.email !== undefined || updates.contactNumber !== undefined) {
      // target.username is only here to satisfy findDuplicateAccount's
      // shape — since username never changes, excluding this user's own
      // id makes that particular check a guaranteed no-op. Only the
      // email/contactNumber checks do real work for an edit.
      const isDuplicate = await findDuplicateAccount(client, { username: target.username, email: updates.email ?? null, contactNumber: updates.contactNumber ?? null }, userId)
      if (isDuplicate) {
        await client.query('ROLLBACK')
        return response.status(409).json({ message: 'Another account already uses that email or contact number.' })
      }
    }

    // COALESCE keeps the existing value for any field not being updated —
    // simpler than building a dynamic SET clause for a handful of columns.
    await client.query(
      `UPDATE ${table} SET name = COALESCE($1, name), email = COALESCE($2, email), contact_num = COALESCE($3, contact_num) WHERE user_id = $4`,
      [updates.name ?? null, updates.email ?? null, updates.contactNumber ?? null, userId],
    )
    await client.query('UPDATE users SET is_active = COALESCE($1, is_active) WHERE user_id = $2', [updates.isActive ?? null, userId])

    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    if (error.code === '23505') return response.status(409).json({ message: 'Another account already uses that email or contact number.' })
    throw error
  } finally {
    client.release()
  }

  const updated = await pool.query(`${staffSelectQuery} WHERE u.user_id = $1`, [userId])
  return response.json({ staff: mapStaffRow(updated.rows[0]) })
})

export default router
