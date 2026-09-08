// Admin/cashier-facing customer record management. Admin has full access
// (list, search, edit, activate/deactivate); cashier is read-only — they
// can list and search, but every write below is admin-only. The read stays
// open to CASHIER because the counter-order screen (NewOrderForm.jsx)
// looks a customer up here to attach one to an order, and a DELIVERY order
// is impossible without one — see the comment on router.use below.
// Every customer comes from self-registration (routes/auth.js's
// /register) — there's no create-customer capability here, confirmed
// intentional. A customer editing their OWN profile is a different
// endpoint entirely: PATCH /api/auth/me. Mounted at /api/customers.
import express from 'express'
import { pool } from '../db.js'
import { findDuplicateAccount } from '../lib/accounts.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { normalize, normalizeEmail, parseId, validateContactNumberField, validateEmailField, validateName } from '../lib/validation.js'

const router = express.Router()

// `id` is the USER id (u.user_id) — it's what this screen has always
// keyed its own rows and PATCH /:id calls by. `customerId` is the
// SEPARATE customers.customer_id — a different sequence entirely, and
// the one POST /api/orders and GET /api/addresses?customerId= actually
// want. The two can and do differ for the same person (verified live:
// user_id 4868, customer_id 1914, one account) — added so a caller that
// needs to place an order for someone on this list (COUNTER_ORDER_PLAN.md)
// has the right id to send, rather than reaching for the only one that
// used to be here and silently addressing the wrong customer once two
// people's ids happen to cross.
const mapCustomerRow = (row) => ({
  id: row.user_id,
  customerId: row.customer_id,
  username: row.username,
  name: row.name,
  email: row.email,
  contactNumber: row.contact_num,
  isActive: row.is_active,
  createdAt: row.created_at,
})

const customerSelectQuery = `SELECT u.user_id, u.username, u.is_active, c.customer_id, c.name, c.email, c.contact_num, c.created_at
     FROM users u
     JOIN customers c ON c.user_id = u.user_id`

// CASHIER stays admitted here even though PATCH below is ADMIN-only — this
// guard covers GET too, and NewOrderForm.jsx's counter-order screen fetches
// this list to attach a customer to an order (required for DELIVERY).
// Tightening this to ADMIN-only would silently take delivery orders down
// at the counter, not just this screen. See UI_REVISIONS_PLAN.md Decision 12.
router.use(requireAuth, requireRole('ADMIN', 'CASHIER'))

router.get('/', async (request, response) => {
  const search = normalize(request.query.search)
  if (search) {
    const result = await pool.query(`${customerSelectQuery} WHERE c.name ILIKE $1 OR c.email ILIKE $1 OR c.contact_num ILIKE $1 ORDER BY c.name`, [`%${search}%`])
    return response.json({ customers: result.rows.map(mapCustomerRow) })
  }
  const result = await pool.query(`${customerSelectQuery} ORDER BY c.name`)
  return response.json({ customers: result.rows.map(mapCustomerRow) })
})

// ADMIN only — a cashier can look a customer up (the router-wide guard
// above) but not change their record, full stop; there's no partial case
// where a cashier reaches this handler any more, so the field edit and the
// isActive toggle no longer need separate role checks of their own.
router.patch('/:id', requireRole('ADMIN'), async (request, response) => {
  // A malformed id can never match a real customer, so it gets the same
  // 404 as a nonexistent one — without this it would reach Postgres as an
  // invalid bigint literal and surface as a generic 500 instead.
  const userId = parseId(request.params.id)
  if (!userId) return response.status(404).json({ message: 'Customer not found.' })

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
