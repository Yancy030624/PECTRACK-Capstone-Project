// ============================================================================
// PECTRACK API — routes/customers.js (annotated for learning)
// Admin/cashier-facing customer record management — searching, viewing,
// and editing customers OTHER than yourself. Mounted at /api/customers.
//
// Compare this against routes/staffExplanation.js: same overall shape
// (a router-wide guard, a list route, a PATCH-by-id route reusing the
// shared validators), because it's fundamentally the same kind of
// problem — an admin/cashier managing a category of accounts. The real
// differences are role-shaped: staff creation exists (admins are seeded
// manually, so SOMEONE has to make cashier/delivery accounts through the
// app); customer creation doesn't, because self-registration already
// covers it. And unlike staff.js's router.use(requireAuth, requireRole
// ('ADMIN')), this router allows BOTH admin and cashier through the
// door — access differences inside are handled per-action, not per-route.
// ============================================================================

import express from 'express'
import { pool } from '../db.js'
// Shared with routes/staff.js and PATCH /api/auth/me — see
// lib/accountsExplanation.js.
import { findDuplicateAccount } from '../lib/accounts.js'
import { requireAuth, requireRole } from '../lib/auth.js'
// Same individual field validators PATCH /api/auth/me uses — see
// lib/validationExplanation.js.
import { normalize, normalizeEmail, validateContactNumberField, validateEmailField, validateName } from '../lib/validation.js'

const router = express.Router()

const mapCustomerRow = (row) => ({
  id: row.user_id,
  username: row.username,
  name: row.name,
  email: row.email,
  contactNumber: row.contact_num,
  isActive: row.is_active,
  createdAt: row.created_at,
})

// A plain JOIN (not LEFT JOIN) is correct here, unlike the four-way role
// lookups elsewhere in this app — every row this router touches is
// already known to be a customer, so there's no "which of four tables
// matched" ambiguity to resolve.
const customerSelectQuery = `SELECT u.user_id, u.username, u.is_active, c.name, c.email, c.contact_num, c.created_at
     FROM users u
     JOIN customers c ON c.user_id = u.user_id`

// Both admin AND cashier get through this gate — narrower per-action
// checks (like the isActive block inside PATCH below) handle the cases
// where their permissions actually diverge.
router.use(requireAuth, requireRole('ADMIN', 'CASHIER'))

// GET /api/customers — with an optional ?search= for the "cashier
// searches for a customer" use case from the thesis. ILIKE is a
// case-insensitive LIKE; wrapping the term in % on both sides makes it
// match anywhere in the field, not just the start.
router.get('/', async (request, response) => {
  const search = normalize(request.query.search)
  if (search) {
    const result = await pool.query(`${customerSelectQuery} WHERE c.name ILIKE $1 OR c.email ILIKE $1 OR c.contact_num ILIKE $1 ORDER BY c.name`, [`%${search}%`])
    return response.json({ customers: result.rows.map(mapCustomerRow) })
  }
  const result = await pool.query(`${customerSelectQuery} ORDER BY c.name`)
  return response.json({ customers: result.rows.map(mapCustomerRow) })
})

router.patch('/:id', async (request, response) => {
  const userId = request.params.id
  const current = await pool.query('SELECT u.user_id, u.username FROM users u JOIN customers c ON c.user_id = u.user_id WHERE u.user_id = $1', [userId])
  const target = current.rows[0]
  if (!target) return response.status(404).json({ message: 'Customer not found.' })

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
    // This is the one place admin and cashier actually diverge: the
    // thesis gives admin "full access" but only lets cashier search,
    // view, and edit — not deactivate. Checked here, inside the handler,
    // rather than with a second router-level guard, because it depends
    // on WHICH field was sent, not the route itself.
    if (request.user.role !== 'ADMIN') return response.status(403).json({ message: 'Only an admin can activate or deactivate a customer account.' })
    if (typeof request.body.isActive !== 'boolean') errors.isActive = 'isActive must be true or false.'
    else updates.isActive = request.body.isActive
  }

  if (Object.keys(errors).length) return response.status(422).json({ message: 'Please correct the highlighted fields.', errors })
  if (Object.keys(updates).length === 0) return response.status(422).json({ message: 'Provide at least one field to update.' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    if (updates.email !== undefined || updates.contactNumber !== undefined) {
      const isDuplicate = await findDuplicateAccount(client, { username: target.username, email: updates.email ?? null, contactNumber: updates.contactNumber ?? null }, userId)
      if (isDuplicate) {
        await client.query('ROLLBACK')
        return response.status(409).json({ message: 'Another account already uses that email or contact number.' })
      }
    }
    await client.query(
      `UPDATE customers SET name = COALESCE($1, name), email = COALESCE($2, email), contact_num = COALESCE($3, contact_num) WHERE user_id = $4`,
      [updates.name ?? null, updates.email ?? null, updates.contactNumber ?? null, userId],
    )
    // Runs even when isActive wasn't sent — COALESCE(null, is_active)
    // just keeps the current value, so this is a harmless no-op update
    // in that case rather than something that needs its own `if`.
    if (updates.isActive !== undefined) {
      await client.query('UPDATE users SET is_active = $1 WHERE user_id = $2', [updates.isActive, userId])
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    if (error.code === '23505') return response.status(409).json({ message: 'Another account already uses that email or contact number.' })
    throw error
  } finally {
    client.release()
  }

  const updated = await pool.query(`${customerSelectQuery} WHERE u.user_id = $1`, [userId])
  return response.json({ customer: mapCustomerRow(updated.rows[0]) })
})

export default router
