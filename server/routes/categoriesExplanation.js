// ============================================================================
// PECTRACK API — routes/categories.js (annotated for learning)
// Category management — the grouping products belong to (Breads, Cakes,
// etc.). Any authenticated user can list them (products.js's create/edit
// forms need this list, and eventually customers browsing by category
// will too); only admins can create, rename, or delete one. Mounted at
// /api/categories in app.js.
// ============================================================================

import express from 'express'
import { pool } from '../db.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { normalize } from '../lib/validation.js'

const router = express.Router()

// Translates the database's snake_case columns into the camelCase shape
// the frontend expects — the same small translation-layer pattern used
// throughout this app's route files.
const mapCategoryRow = (row) => ({ id: row.category_id, name: row.category_name })

// A tiny, local validator — category has exactly one editable field, so
// this doesn't need the shared validateX functions in lib/validation.js
// (those exist for the name/email/contact/password shape that repeats
// across accounts; a bare "non-empty string, reasonable length" check
// isn't worth extracting for a single caller).
function validateCategoryName(body) {
  const name = normalize(body.name)
  if (!name || name.length > 100) return { error: 'Enter a category name (1-100 characters).' }
  return { name }
}

// Every route needs to be logged in; only the mutating ones also require
// ADMIN — requireRole is applied per-route below, not router-wide, since
// GET is intentionally open to every role.
router.use(requireAuth)

router.get('/', async (_request, response) => {
  const result = await pool.query('SELECT category_id, category_name FROM categories ORDER BY category_name')
  return response.json({ categories: result.rows.map(mapCategoryRow) })
})

router.post('/', requireRole('ADMIN'), async (request, response) => {
  const { name, error } = validateCategoryName(request.body)
  if (error) return response.status(422).json({ message: error, errors: { name: error } })

  try {
    const result = await pool.query('INSERT INTO categories (category_name) VALUES ($1) RETURNING category_id, category_name', [name])
    return response.status(201).json({ category: mapCategoryRow(result.rows[0]) })
  } catch (dbError) {
    // 23505 = unique_violation — categories.category_name is UNIQUE.
    if (dbError.code === '23505') return response.status(409).json({ message: 'A category with that name already exists.' })
    throw dbError
  }
})

router.patch('/:id', requireRole('ADMIN'), async (request, response) => {
  const { name, error } = validateCategoryName(request.body)
  if (error) return response.status(422).json({ message: error, errors: { name: error } })

  try {
    // UPDATE ... RETURNING does both the write and the "did a row with
    // this id exist" check in one round trip — no rows back means the id
    // didn't match anything.
    const result = await pool.query('UPDATE categories SET category_name = $1 WHERE category_id = $2 RETURNING category_id, category_name', [name, request.params.id])
    if (!result.rows[0]) return response.status(404).json({ message: 'Category not found.' })
    return response.json({ category: mapCategoryRow(result.rows[0]) })
  } catch (dbError) {
    if (dbError.code === '23505') return response.status(409).json({ message: 'A category with that name already exists.' })
    throw dbError
  }
})

router.delete('/:id', requireRole('ADMIN'), async (request, response) => {
  try {
    const result = await pool.query('DELETE FROM categories WHERE category_id = $1', [request.params.id])
    if (result.rowCount === 0) return response.status(404).json({ message: 'Category not found.' })
    return response.status(204).end()
  } catch (dbError) {
    // 23503 = foreign_key_violation. products.category_id references
    // this table with NO ON DELETE clause (checked against the actual
    // schema, not assumed) — Postgres's default is RESTRICT, so deleting
    // a category that still has products throws instead of silently
    // orphaning or cascading them. That's the right default: losing track
    // of which products belonged to a deleted category would be worse
    // than just telling the admin to reassign them first.
    if (dbError.code === '23503') return response.status(409).json({ message: 'This category still has products assigned to it. Reassign or remove them first.' })
    throw dbError
  }
})

export default router
