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
import { optionalAuth, requireAuth, requireRole } from '../lib/auth.js'
import { deleteFile, filePath, saveFile } from '../lib/storage.js'
import { normalize, parseId } from '../lib/validation.js'

const router = express.Router()

// STOREFRONT_PLAN.md, Decision 5 — imageUrl is derived, never a raw
// storage_key. The frontend gets one thing to do with it: point an <img>
// at it. null means "no photo yet" (show the Menu's placeholder tile),
// never an empty string or a key it would have to know how to turn into
// a URL itself — that translation happens exactly once, here.
const mapProductRow = (row) => ({
  id: row.product_id,
  categoryId: row.category_id,
  categoryName: row.category_name,
  name: row.product_name,
  description: row.description,
  price: row.price,
  variant: row.variant,
  availabilityStatus: row.availability_status,
  imageUrl: row.image_key ? `/api/products/${row.product_id}/image` : null,
})

const productSelectQuery = `SELECT p.product_id, p.category_id, c.category_name, p.product_name, p.description, p.price, p.variant, p.availability_status, p.image_key
     FROM products p
     JOIN categories c ON c.category_id = p.category_id`

// Same shape as deliveries.js's allowedProofMimeTypes — the content type
// IS the validation (express.raw({ type: [...keys] }) below refuses
// anything else before the handler runs), and the extension it maps to is
// what Pattern G derives the storage key's extension from, never a
// client-supplied filename.
const allowedImageMimeTypes = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
])
const imageUploadLimit = '5mb'

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

// STOREFRONT_PLAN.md, Decision 2 — GET / and GET /:id are the storefront's
// public catalogue. optionalAuth (not requireAuth) sits above them, and
// requireAuth only starts gating BELOW this point — every write route
// still needs a real session. This ordering IS the security control (see
// the plan's Pattern M): Express matches within a router in registration
// order, so a route added above the router.use(requireAuth) line below
// would silently inherit the public/optional treatment instead of needing
// a session. Anything that writes to the catalogue belongs below that line.
router.get('/', optionalAuth, async (request, response) => {
  // An anonymous visitor gets exactly the CUSTOMER view — never a new,
  // separate "public" one — because a customer view is already the most
  // restricted view this table has. `!request.user` covers the storefront;
  // the CUSTOMER check is unchanged from before this endpoint was public.
  const restrictToAvailable = !request.user || request.user.role === 'CUSTOMER'
  const query = restrictToAvailable ? `${productSelectQuery} WHERE p.availability_status = TRUE ORDER BY p.product_name` : `${productSelectQuery} ORDER BY p.product_name`
  const result = await pool.query(query)
  return response.json({ products: result.rows.map(mapProductRow) })
})

router.get('/:id', optionalAuth, async (request, response) => {
  // A malformed id can't match any product, so it takes the same 404 path
  // as a missing one instead of failing inside Postgres as a 500.
  const productId = parseId(request.params.id)
  if (!productId) return response.status(404).json({ message: 'Product not found.' })

  const result = await pool.query(`${productSelectQuery} WHERE p.product_id = $1`, [productId])
  const row = result.rows[0]
  // An anonymous or CUSTOMER caller asking for a hidden product gets the
  // same 404 as a nonexistent one — no confirmation that it exists at all.
  if (!row || ((!request.user || request.user.role === 'CUSTOMER') && !row.availability_status)) return response.status(404).json({ message: 'Product not found.' })
  return response.json({ product: mapProductRow(row) })
})

// GET /api/products/:id/image — public, same visibility rule as the
// product itself: a photo is not more sensitive than the name and price
// sitting right next to it in the API response, so it follows GET /:id's
// own decision on who gets a 404 rather than inventing a second one.
router.get('/:id/image', optionalAuth, async (request, response) => {
  const productId = parseId(request.params.id)
  if (!productId) return response.status(404).json({ message: 'Product not found.' })

  const result = await pool.query('SELECT image_key, availability_status FROM products WHERE product_id = $1', [productId])
  const row = result.rows[0]
  if (!row || !row.image_key || ((!request.user || request.user.role === 'CUSTOMER') && !row.availability_status)) {
    return response.status(404).json({ message: 'Image not found.' })
  }

  // Extension IS the content type here (Pattern G — the key is a UUID
  // this server generated, never a client-supplied name), so response
  // .type() reads it straight off the stored key rather than a second
  // database column just to remember what was already encoded in it.
  response.type(filePath(row.image_key).split('.').pop())
  return response.sendFile(filePath(row.image_key), (error) => {
    // Row and file can disagree (a hand-cleaned uploads/, a restored
    // backup) — same guard deliveries.js's own proof download uses, so a
    // missing file reads as "not there any more," not a 500.
    if (error && !response.headersSent) response.status(404).json({ message: 'Image not found.' })
  })
})

router.use(requireAuth)

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

// POST /api/products/:id/image — ADMIN only (STOREFRONT_PLAN.md, Decision
// 5). Same upload shape as deliveries.js's proof-of-delivery route: raw
// bytes, content-type-derived extension, a server-generated storage key.
router.post(
  '/:id/image',
  requireRole('ADMIN'),
  express.raw({ type: [...allowedImageMimeTypes.keys()], limit: imageUploadLimit }),
  async (request, response) => {
    const productId = parseId(request.params.id)
    if (!productId) return response.status(404).json({ message: 'Product not found.' })

    // Same normalization deliveries.js's own upload route documents at
    // length: express.raw() matches a Content-Type via `type-is` (which
    // parses it, so 'image/jpeg; charset=binary' still gets read as a
    // Buffer), while a bare Map.get() below needs an exact match — so the
    // header is trimmed to its bare media type first, or a legal variant
    // would be read in full and then rejected anyway.
    const contentType = String(request.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase()
    const extension = allowedImageMimeTypes.get(contentType)
    if (!extension || !Buffer.isBuffer(request.body) || request.body.length === 0) {
      return response.status(422).json({ message: 'Upload a JPEG, PNG, or WEBP image.', errors: { file: 'Upload a JPEG, PNG, or WEBP image.' } })
    }

    const existing = await pool.query('SELECT image_key FROM products WHERE product_id = $1', [productId])
    if (!existing.rows[0]) return response.status(404).json({ message: 'Product not found.' })

    const storageKey = await saveFile(request.body, extension)
    await pool.query('UPDATE products SET image_key = $1 WHERE product_id = $2', [storageKey, productId])

    // The OLD file is removed only after the new one is safely written and
    // the row updated — so a crash between saveFile and here leaves an
    // orphaned file (harmless, just wasted disk) rather than a product
    // pointing at a file that no longer exists.
    const oldKey = existing.rows[0].image_key
    if (oldKey) await deleteFile(oldKey)

    const updated = await pool.query(`${productSelectQuery} WHERE p.product_id = $1`, [productId])
    return response.status(201).json({ product: mapProductRow(updated.rows[0]) })
  },
)

// DELETE /api/products/:id/image — ADMIN only. Reverts a product to the
// Menu's placeholder tile without deleting the product itself.
router.delete('/:id/image', requireRole('ADMIN'), async (request, response) => {
  const productId = parseId(request.params.id)
  if (!productId) return response.status(404).json({ message: 'Product not found.' })

  const existing = await pool.query('SELECT image_key FROM products WHERE product_id = $1', [productId])
  if (!existing.rows[0]) return response.status(404).json({ message: 'Product not found.' })
  if (!existing.rows[0].image_key) return response.status(404).json({ message: 'This product has no image to remove.' })

  await pool.query('UPDATE products SET image_key = NULL WHERE product_id = $1', [productId])
  await deleteFile(existing.rows[0].image_key)
  return response.status(204).end()
})

router.delete('/:id', requireRole('ADMIN'), async (request, response) => {
  const productId = parseId(request.params.id)
  if (!productId) return response.status(404).json({ message: 'Product not found.' })

  // Read before delete, not because the delete needs it, but because a
  // file on disk has to be cleaned up somewhere — and the row is the only
  // place that remembers which file was ever attached to this product.
  // Once the DELETE below succeeds, that knowledge is gone for good.
  const existing = await pool.query('SELECT image_key FROM products WHERE product_id = $1', [productId])

  try {
    const result = await pool.query('DELETE FROM products WHERE product_id = $1', [productId])
    if (result.rowCount === 0) return response.status(404).json({ message: 'Product not found.' })
    if (existing.rows[0]?.image_key) await deleteFile(existing.rows[0].image_key)
    return response.status(204).end()
  } catch (error) {
    // 23503 = foreign_key_violation — order_details or inventory_change_requests still reference this product.
    if (error.code === '23503') return response.status(409).json({ message: 'This product has order or change-request history and cannot be deleted. Set it to unavailable instead.' })
    throw error
  }
})

export default router
