// Category management. Anyone — including an anonymous storefront visitor
// — can list categories (needed for the product form's dropdown AND public
// menu browsing, STOREFRONT_PLAN.md Decision 2: category names carry
// nothing private, the same reasoning as the public product read in
// products.js); only admins can create, rename, or delete one. Mounted at
// /api/categories in app.js.
import express from 'express'
import { pool } from '../db.js'
import { optionalAuth, requireAuth, requireRole } from '../lib/auth.js'
import { normalize } from '../lib/validation.js'

const router = express.Router()

const mapCategoryRow = (row) => ({ id: row.category_id, name: row.category_name })

function validateCategoryName(body) {
  const name = normalize(body.name)
  if (!name || name.length > 100) return { error: 'Enter a category name (1-100 characters).' }
  return { name }
}

// GET / is public (optionalAuth); requireAuth only starts gating below it —
// every mutating route still needs a real session, and needs ADMIN on top.
router.get('/', optionalAuth, async (_request, response) => {
  const result = await pool.query('SELECT category_id, category_name FROM categories ORDER BY category_name')
  return response.json({ categories: result.rows.map(mapCategoryRow) })
})

router.use(requireAuth)

router.post('/', requireRole('ADMIN'), async (request, response) => {
  const { name, error } = validateCategoryName(request.body)
  if (error) return response.status(422).json({ message: error, errors: { name: error } })

  try {
    const result = await pool.query('INSERT INTO categories (category_name) VALUES ($1) RETURNING category_id, category_name', [name])
    return response.status(201).json({ category: mapCategoryRow(result.rows[0]) })
  } catch (dbError) {
    if (dbError.code === '23505') return response.status(409).json({ message: 'A category with that name already exists.' })
    throw dbError
  }
})

router.patch('/:id', requireRole('ADMIN'), async (request, response) => {
  const { name, error } = validateCategoryName(request.body)
  if (error) return response.status(422).json({ message: error, errors: { name: error } })

  try {
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
    // 23503 = foreign_key_violation — products.category_id still points here.
    if (dbError.code === '23503') return response.status(409).json({ message: 'This category still has products assigned to it. Reassign or remove them first.' })
    throw dbError
  }
})

export default router
