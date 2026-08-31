// Product catalog management. Admin has full CRUD; cashiers and customers
// can only view — customers specifically only ever see products that are
// currently available (the "Product Availability Calendar" rule from the
// paper: unavailable/expired items are hidden from customers). Mounted at
// /api/products in app.js.
//
// Stock quantity, min stock level, and expiration date live on the
// `inventory` table and are deliberately NOT managed here — that's Phase 5
// (Inventory Management). Creating a product still inserts a matching
// inventory row (the schema requires exactly one per product), just with
// its default values untouched.
import express from 'express'
import { pool } from '../db.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { normalize, parseId } from '../lib/validation.js'

const router = express.Router()

const mapProductRow = (row) => ({
  id: row.product_id,
  categoryId: row.category_id,
  categoryName: row.category_name,
  name: row.product_name,
  description: row.description,
  price: row.price,
  variant: row.variant,
  availabilityStatus: row.availability_status,
})

const productSelectQuery = `SELECT p.product_id, p.category_id, c.category_name, p.product_name, p.description, p.price, p.variant, p.availability_status
     FROM products p
     JOIN categories c ON c.category_id = p.category_id`

// Validates whichever of these fields are present in the body. Returns
// { errors, values } where values only contains keys that were both
// present and valid — used for both full creation and partial edits.
function validateProductFields(body, { partial }) {
  const errors = {}
  const values = {}

  const has = (field) => !partial || field in body

  if (has('name')) {
    const name = normalize(body.name)
    if (!name || name.length > 150) errors.name = 'Enter a product name (1-150 characters).'
    else values.name = name
  }
  if (has('description')) {
    values.description = body.description == null ? null : normalize(body.description)
  }
  if (has('variant')) {
    const variant = body.variant == null ? '' : normalize(body.variant)
    values.variant = variant === '' ? null : variant
  }
  if (has('price')) {
    const price = Number(body.price)
    if (body.price === undefined || body.price === null || body.price === '' || Number.isNaN(price) || price < 0) errors.price = 'Enter a valid, non-negative price.'
    else values.price = Math.round(price * 100) / 100
  }
  if (has('categoryId')) {
    const categoryId = Number(body.categoryId)
    if (!body.categoryId || Number.isNaN(categoryId)) errors.categoryId = 'Select a category.'
    else values.categoryId = categoryId
  }
  if (has('availabilityStatus')) {
    const availabilityStatus = partial ? body.availabilityStatus : (body.availabilityStatus ?? true)
    if (typeof availabilityStatus !== 'boolean') errors.availabilityStatus = 'availabilityStatus must be true or false.'
    else values.availabilityStatus = availabilityStatus
  }

  return { errors, values }
}

router.use(requireAuth)

router.get('/', async (request, response) => {
  // Customers only ever see products currently open for ordering; admin
  // and cashier see the full catalog, including unavailable items, since
  // they need to manage/monitor it.
  const restrictToAvailable = request.user.role === 'CUSTOMER'
  const query = restrictToAvailable ? `${productSelectQuery} WHERE p.availability_status = TRUE ORDER BY p.product_name` : `${productSelectQuery} ORDER BY p.product_name`
  const result = await pool.query(query)
  return response.json({ products: result.rows.map(mapProductRow) })
})

router.get('/:id', async (request, response) => {
  // A malformed id can't match any product, so it takes the same 404 path
  // as a missing one instead of failing inside Postgres as a 500.
  const productId = parseId(request.params.id)
  if (!productId) return response.status(404).json({ message: 'Product not found.' })

  const result = await pool.query(`${productSelectQuery} WHERE p.product_id = $1`, [productId])
  const row = result.rows[0]
  // A customer asking for a hidden product gets the same 404 as a
  // nonexistent one — no confirmation that it exists at all.
  if (!row || (request.user.role === 'CUSTOMER' && !row.availability_status)) return response.status(404).json({ message: 'Product not found.' })
  return response.json({ product: mapProductRow(row) })
})

router.post('/', requireRole('ADMIN'), async (request, response) => {
  const { errors, values } = validateProductFields(request.body, { partial: false })
  if (Object.keys(errors).length) return response.status(422).json({ message: 'Please correct the highlighted fields.', errors })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const productResult = await client.query(
      `INSERT INTO products (category_id, product_name, description, price, variant, availability_status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING product_id`,
      [values.categoryId, values.name, values.description, values.price, values.variant, values.availabilityStatus],
    )
    const productId = productResult.rows[0].product_id
    // Every product needs exactly one inventory row (inventory.product_id
    // is NOT NULL UNIQUE) — this just satisfies that with the table's own
    // defaults (stock_quantity 0, min_stock_level 0). Managing those
    // values is Phase 5, not this endpoint.
    await client.query('INSERT INTO inventory (product_id) VALUES ($1)', [productId])
    await client.query('COMMIT')

    const created = await pool.query(`${productSelectQuery} WHERE p.product_id = $1`, [productId])
    return response.status(201).json({ product: mapProductRow(created.rows[0]) })
  } catch (error) {
    await client.query('ROLLBACK')
    if (error.code === '23505') return response.status(409).json({ message: 'A product with that name and variant already exists in this category.' })
    if (error.code === '23503') return response.status(422).json({ message: 'Selected category does not exist.', errors: { categoryId: 'Selected category does not exist.' } })
    throw error
  } finally {
    client.release()
  }
})

router.patch('/:id', requireRole('ADMIN'), async (request, response) => {
  const productId = parseId(request.params.id)
  if (!productId) return response.status(404).json({ message: 'Product not found.' })

  const existing = await pool.query('SELECT product_id FROM products WHERE product_id = $1', [productId])
  if (!existing.rows[0]) return response.status(404).json({ message: 'Product not found.' })

  const { errors, values } = validateProductFields(request.body, { partial: true })
  if (Object.keys(errors).length) return response.status(422).json({ message: 'Please correct the highlighted fields.', errors })
  if (Object.keys(values).length === 0) return response.status(422).json({ message: 'Provide at least one field to update.' })

  try {
    // description/variant are nullable columns where clearing to null is a
    // real, valid edit — COALESCE alone can't distinguish "not sent" from
    // "sent as null", so those two use a CASE keyed on whether the field
    // was present at all. The other fields are NOT NULL columns where an
    // omitted field is never intentionally null, so plain COALESCE is safe.
    await pool.query(
      `UPDATE products
       SET category_id = COALESCE($1, category_id),
           product_name = COALESCE($2, product_name),
           description = CASE WHEN $3 THEN $4 ELSE description END,
           variant = CASE WHEN $5 THEN $6 ELSE variant END,
           price = COALESCE($7, price),
           availability_status = COALESCE($8, availability_status)
       WHERE product_id = $9`,
      [
        values.categoryId ?? null,
        values.name ?? null,
        'description' in values,
        values.description ?? null,
        'variant' in values,
        values.variant ?? null,
        values.price ?? null,
        values.availabilityStatus ?? null,
        productId,
      ],
    )
  } catch (error) {
    if (error.code === '23505') return response.status(409).json({ message: 'A product with that name and variant already exists in this category.' })
    if (error.code === '23503') return response.status(422).json({ message: 'Selected category does not exist.', errors: { categoryId: 'Selected category does not exist.' } })
    throw error
  }

  const updated = await pool.query(`${productSelectQuery} WHERE p.product_id = $1`, [productId])
  return response.json({ product: mapProductRow(updated.rows[0]) })
})

router.delete('/:id', requireRole('ADMIN'), async (request, response) => {
  const productId = parseId(request.params.id)
  if (!productId) return response.status(404).json({ message: 'Product not found.' })

  try {
    const result = await pool.query('DELETE FROM products WHERE product_id = $1', [productId])
    if (result.rowCount === 0) return response.status(404).json({ message: 'Product not found.' })
    return response.status(204).end()
  } catch (error) {
    // 23503 = foreign_key_violation — order_details or inventory_change_requests still reference this product.
    if (error.code === '23503') return response.status(409).json({ message: 'This product has order or change-request history and cannot be deleted. Set it to unavailable instead.' })
    throw error
  }
})

export default router
