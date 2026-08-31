// ============================================================================
// PECTRACK API — routes/products.js (annotated for learning)
// Product catalog management — the actual bakery items. Admin has full
// CRUD; cashiers and customers can only view, and customers specifically
// only ever see products that are currently AVAILABLE — the "Product
// Availability Calendar" rule from the paper: unavailable/expired items
// are hidden from customers entirely. Mounted at /api/products in app.js.
//
// Deliberately scoped OUT of this file: stock quantity, min stock level,
// and expiration date. Those live on the `inventory` table and are Phase
// 5 (Inventory Management) — this file only ever inserts a bare inventory
// row (with the table's own defaults) when a product is created, just to
// satisfy the schema's "every product needs exactly one inventory row"
// requirement. Nothing here reads or writes stock levels.
// ============================================================================

import express from 'express'
import { pool } from '../db.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { normalize } from '../lib/validation.js'

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

// Always JOINs categories so every product response carries the
// human-readable category name, not just its id — saves the frontend a
// second lookup to render a product row.
const productSelectQuery = `SELECT p.product_id, p.category_id, c.category_name, p.product_name, p.description, p.price, p.variant, p.availability_status
     FROM products p
     JOIN categories c ON c.category_id = p.category_id`

// One validator handles both POST (partial: false — every field is
// required) and PATCH (partial: true — only validate whatever was
// actually sent). `has(field)` is the switch between those two modes:
// in partial mode, a field only gets checked/included if the caller
// actually sent it; in full mode, every field is always checked.
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
    // Explicitly nullable — an empty/omitted description means "no
    // description", stored as NULL, not an empty string.
    values.description = body.description == null ? null : normalize(body.description)
  }
  if (has('variant')) {
    // Same idea as description: an empty variant normalizes to NULL
    // (matters for the products_category_name_variant_key unique index
    // from Phase 1, which specifically COALESCEs variant to '' so two
    // NULL-variant products in the same category still collide correctly).
    const variant = body.variant == null ? '' : normalize(body.variant)
    values.variant = variant === '' ? null : variant
  }
  if (has('price')) {
    const price = Number(body.price)
    // Number('') is 0, not NaN — so '' must be checked separately, or an
    // explicitly blank price field would silently become a valid ₱0 product.
    if (body.price === undefined || body.price === null || body.price === '' || Number.isNaN(price) || price < 0) errors.price = 'Enter a valid, non-negative price.'
    // Rounds to 2 decimal places to match the column's NUMERIC(12, 2) —
    // avoids storing something like 19.999999998 from float arithmetic.
    else values.price = Math.round(price * 100) / 100
  }
  if (has('categoryId')) {
    const categoryId = Number(body.categoryId)
    if (!body.categoryId || Number.isNaN(categoryId)) errors.categoryId = 'Select a category.'
    else values.categoryId = categoryId
  }
  if (has('availabilityStatus')) {
    // In full-create mode, an omitted availabilityStatus defaults to
    // true (matches the column's own DEFAULT TRUE); in partial-edit
    // mode, `has()` already filtered out the omitted case, so whatever's
    // here was actually sent and must be a real boolean.
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
  const result = await pool.query(`${productSelectQuery} WHERE p.product_id = $1`, [request.params.id])
  const row = result.rows[0]
  // A customer asking for a hidden product gets the exact same 404 as a
  // genuinely nonexistent one — the response never confirms the product
  // exists at all, matching the "hide unavailable items" rule fully
  // rather than just filtering them out of the list view.
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
    // is NOT NULL UNIQUE, checked against the real schema) — this just
    // satisfies that with the table's own defaults (stock_quantity 0,
    // min_stock_level 0). Managing those values is Phase 5, not here.
    await client.query('INSERT INTO inventory (product_id) VALUES ($1)', [productId])
    await client.query('COMMIT')

    // Re-fetch through the same SELECT used everywhere else, so the
    // response includes categoryName (not available from the INSERT
    // ... RETURNING above, which only touched the products table).
    const created = await pool.query(`${productSelectQuery} WHERE p.product_id = $1`, [productId])
    return response.status(201).json({ product: mapProductRow(created.rows[0]) })
  } catch (error) {
    await client.query('ROLLBACK')
    // 23505 = unique_violation — the (category_id, product_name, variant)
    // index from Phase 1. 23503 = foreign_key_violation — categoryId
    // doesn't reference a real category row.
    if (error.code === '23505') return response.status(409).json({ message: 'A product with that name and variant already exists in this category.' })
    if (error.code === '23503') return response.status(422).json({ message: 'Selected category does not exist.', errors: { categoryId: 'Selected category does not exist.' } })
    throw error
  } finally {
    client.release()
  }
})

router.patch('/:id', requireRole('ADMIN'), async (request, response) => {
  const existing = await pool.query('SELECT product_id FROM products WHERE product_id = $1', [request.params.id])
  if (!existing.rows[0]) return response.status(404).json({ message: 'Product not found.' })

  const { errors, values } = validateProductFields(request.body, { partial: true })
  if (Object.keys(errors).length) return response.status(422).json({ message: 'Please correct the highlighted fields.', errors })
  if (Object.keys(values).length === 0) return response.status(422).json({ message: 'Provide at least one field to update.' })

  try {
    // description/variant are nullable columns where clearing to null is
    // a real, valid edit ("remove this product's description") —
    // COALESCE alone can't distinguish "field not sent" from "field sent
    // as null" (both would look like NULL to COALESCE), so those two use
    // a CASE keyed on a companion boolean ('description' in values) that
    // says whether the field was present at all. The other fields
    // (category_id, product_name, price, availability_status) are all
    // NOT NULL columns where an omitted field is never intentionally
    // null — the validator above already guarantees any value present
    // is non-null — so plain COALESCE is safe for those.
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
        request.params.id,
      ],
    )
  } catch (error) {
    if (error.code === '23505') return response.status(409).json({ message: 'A product with that name and variant already exists in this category.' })
    if (error.code === '23503') return response.status(422).json({ message: 'Selected category does not exist.', errors: { categoryId: 'Selected category does not exist.' } })
    throw error
  }

  const updated = await pool.query(`${productSelectQuery} WHERE p.product_id = $1`, [request.params.id])
  return response.json({ product: mapProductRow(updated.rows[0]) })
})

router.delete('/:id', requireRole('ADMIN'), async (request, response) => {
  try {
    const result = await pool.query('DELETE FROM products WHERE product_id = $1', [request.params.id])
    if (result.rowCount === 0) return response.status(404).json({ message: 'Product not found.' })
    return response.status(204).end()
  } catch (error) {
    // 23503 = foreign_key_violation. Both order_details.product_id and
    // inventory_change_requests.product_id reference this table WITHOUT
    // ON DELETE CASCADE (checked against the schema), so a product with
    // any order or change-request history can't be deleted — only
    // inventory (which DOES cascade) goes with it. This preserves order
    // history correctness: an order line item must always be able to
    // point at the product it was actually for.
    if (error.code === '23503') return response.status(409).json({ message: 'This product has order or change-request history and cannot be deleted. Set it to unavailable instead.' })
    throw error
  }
})

export default router
