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
import { optionalAuth, requireAuth, requireRole } from '../lib/auth.js'
import { deleteFile, filePath, saveFile } from '../lib/storage.js'
import { normalize, parseId } from '../lib/validation.js'

const router = express.Router()

// STOREFRONT_PLAN.md, Decision 5 — imageUrl is DERIVED, never the raw
// storage_key. The frontend has exactly one thing to do with it: point an
// <img src> at it, so the translation from "a random UUID this server
// wrote to disk" to "a URL that fetches it" happens exactly once, here,
// rather than every caller having to know the shape of that URL itself.
// null means "no photo yet" — render the Menu's placeholder tile — never
// an empty string, which would leave the frontend unable to tell "no
// photo" apart from "a photo whose key happens to be blank".
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

// Always JOINs categories so every product response carries the
// human-readable category name, not just its id — saves the frontend a
// second lookup to render a product row. image_key is selected here too
// (not looked up separately per row) purely so mapProductRow above never
// has to make a second trip to the database just to decide imageUrl.
const productSelectQuery = `SELECT p.product_id, p.category_id, c.category_name, p.product_name, p.description, p.price, p.variant, p.availability_status, p.image_key
     FROM products p
     JOIN categories c ON c.category_id = p.category_id`

// The SAME shape deliveries.js's own allowedProofMimeTypes uses, for the
// identical reason: this Map IS the validation. express.raw({ type:
// [...allowedImageMimeTypes.keys()] }) below refuses any request whose
// Content-Type isn't one of these three before the route handler even
// runs, and the value each key maps to is what Pattern G derives the
// stored file's extension from — never anything the client named it.
const allowedImageMimeTypes = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
])
const imageUploadLimit = '5mb'

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

// STOREFRONT_PLAN.md, Decision 2 — GET / and GET /:id became the public
// storefront's catalogue read. Before the storefront, EVERY route in this
// file sat behind one `router.use(requireAuth)` at the top — that line has
// now moved down to sit ONLY above the write routes, and these two GET
// routes take `optionalAuth` directly instead.
//
// Why not just make requireAuth itself optional, or add an `if (isPublic)`
// branch inside it? Because the position of a middleware in this list IS
// the security boundary (Pattern M in the plan) — a reader scanning this
// file top to bottom can see exactly which routes need a session by
// whether they're above or below `router.use(requireAuth)`, the same way
// routes/payments.js's webhook route is registered above ITS auth gate for
// the identical reason. Burying "is this route actually public" inside a
// conditional would make that fact invisible from the route list.
router.get('/', optionalAuth, async (request, response) => {
  // Customers only ever see products currently open for ordering; admin
  // and cashier see the full catalog, including unavailable items, since
  // they need to manage/monitor it. An anonymous storefront visitor gets
  // the SAME restricted branch as a CUSTOMER — `!request.user` is the only
  // change from before this endpoint was public, and it deliberately reuses
  // the existing, most-restrictive branch rather than adding a new one that
  // could quietly diverge from it later (Pattern L in the plan).
  const restrictToAvailable = !request.user || request.user.role === 'CUSTOMER'
  const query = restrictToAvailable ? `${productSelectQuery} WHERE p.availability_status = TRUE ORDER BY p.product_name` : `${productSelectQuery} ORDER BY p.product_name`
  const result = await pool.query(query)
  return response.json({ products: result.rows.map(mapProductRow) })
})

router.get('/:id', optionalAuth, async (request, response) => {
  // product_id is a BIGINT, so an id that isn't a valid bigint literal
  // makes the query fail inside Postgres and escape as a generic 500. All
  // three handlers in this file (get, patch, delete) had that hole open
  // until a review found it — parseId closes it by answering 404 instead,
  // which is also the truthful answer: an id that could never exist
  // behaves exactly like one that doesn't. See lib/validationExplanation.js.
  const productId = parseId(request.params.id)
  if (!productId) return response.status(404).json({ message: 'Product not found.' })

  const result = await pool.query(`${productSelectQuery} WHERE p.product_id = $1`, [productId])
  const row = result.rows[0]
  // An anonymous or CUSTOMER caller asking for a hidden product gets the
  // exact same 404 as a genuinely nonexistent one — the response never
  // confirms the product exists at all, matching the "hide unavailable
  // items" rule fully rather than just filtering them out of the list view.
  if (!row || ((!request.user || request.user.role === 'CUSTOMER') && !row.availability_status)) return response.status(404).json({ message: 'Product not found.' })
  return response.json({ product: mapProductRow(row) })
})

// GET /api/products/:id/image — public, exactly as public as the product
// data it illustrates. A photo is not a more sensitive fact than the name
// and price already sitting beside it in GET /:id's own response, so this
// route makes the SAME hidden-product decision that route already makes,
// rather than inventing a second rule for "is this image visible."
router.get('/:id/image', optionalAuth, async (request, response) => {
  const productId = parseId(request.params.id)
  if (!productId) return response.status(404).json({ message: 'Product not found.' })

  const result = await pool.query('SELECT image_key, availability_status FROM products WHERE product_id = $1', [productId])
  const row = result.rows[0]
  // Four ways to end up here with nothing to serve: no such product, a
  // product with no photo yet, or a hidden product being asked about by
  // an anonymous visitor or a CUSTOMER — all collapse to the SAME 404,
  // for the same "don't confirm what a stranger can't already see" reason
  // GET /:id already applies to the product row itself.
  if (!row || !row.image_key || ((!request.user || request.user.role === 'CUSTOMER') && !row.availability_status)) {
    return response.status(404).json({ message: 'Image not found.' })
  }

  // The extension IS the content type here — Pattern G means the stored
  // key is a UUID this server generated from an already-validated mime
  // type, so reading the extension back off the key is reading something
  // this server itself wrote, not trusting anything new. That is why this
  // needs no separate "mime_type" column the way delivery_proofs has one:
  // proof files come with caller-supplied metadata worth keeping; this
  // file's own name already carries everything response.type() needs.
  response.type(filePath(row.image_key).split('.').pop())
  return response.sendFile(filePath(row.image_key), (error) => {
    // Same guard deliveries.js's own proof download uses: the row and the
    // file CAN disagree (a hand-cleaned uploads/, a restored backup), and
    // without this callback that ENOENT reaches app.js as a generic 500 —
    // "the service is broken" — when the honest answer is simpler.
    if (error && !response.headersSent) response.status(404).json({ message: 'Image not found.' })
  })
})

// Everything below here still needs a real session — only the two catalogue
// reads and the image read above are public. See the comment above them
// for why this line's POSITION (not a conditional inside requireAuth) is
// what draws that line.
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
  // Same id-shape guard as GET above — see that comment for why.
  const productId = parseId(request.params.id)
  if (!productId) return response.status(404).json({ message: 'Product not found.' })

  const existing = await pool.query('SELECT product_id FROM products WHERE product_id = $1', [productId])
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
// 5). The SAME upload shape deliveries.js's proof-of-delivery route uses,
// on purpose: raw bytes read by express.raw() (never JSON — a photo isn't
// text), an extension derived from the ALREADY-validated Content-Type
// (never a client-supplied filename), and a server-generated storage key
// via lib/storage.js — the module this file now shares a second caller
// with.
router.post(
  '/:id/image',
  requireRole('ADMIN'),
  express.raw({ type: [...allowedImageMimeTypes.keys()], limit: imageUploadLimit }),
  async (request, response) => {
    const productId = parseId(request.params.id)
    if (!productId) return response.status(404).json({ message: 'Product not found.' })

    // Same normalization deliveries.js documents at length: express.raw()
    // matches a Content-Type via `type-is`, which PARSES it (so
    // 'image/jpeg; charset=binary' still gets read as a Buffer), while a
    // bare Map.get() below needs an exact, lowercase match — so the
    // header is trimmed to its bare media type first, or a perfectly
    // legal variant would be read in full and then rejected here anyway.
    const contentType = String(request.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase()
    const extension = allowedImageMimeTypes.get(contentType)
    if (!extension || !Buffer.isBuffer(request.body) || request.body.length === 0) {
      return response.status(422).json({ message: 'Upload a JPEG, PNG, or WEBP image.', errors: { file: 'Upload a JPEG, PNG, or WEBP image.' } })
    }

    const existing = await pool.query('SELECT image_key FROM products WHERE product_id = $1', [productId])
    if (!existing.rows[0]) return response.status(404).json({ message: 'Product not found.' })

    const storageKey = await saveFile(request.body, extension)
    await pool.query('UPDATE products SET image_key = $1 WHERE product_id = $2', [storageKey, productId])

    // The OLD file is deleted only AFTER the new one is written and the row
    // updated — ordering that matters: a crash between saveFile and here
    // leaves one orphaned file on disk (harmless, just wasted space), where
    // deleting first and then crashing before the write would leave the
    // product pointing at nothing at all.
    const oldKey = existing.rows[0].image_key
    if (oldKey) await deleteFile(oldKey)

    const updated = await pool.query(`${productSelectQuery} WHERE p.product_id = $1`, [productId])
    return response.status(201).json({ product: mapProductRow(updated.rows[0]) })
  },
)

// DELETE /api/products/:id/image — ADMIN only. Reverts a product back to
// the Menu's placeholder tile without touching the product row itself —
// deliberately a SEPARATE action from PATCH /:id, which never accepts an
// image_key field at all (validateProductFields above has no branch for
// it), so a photo can only ever be attached or removed through these two
// dedicated, byte-handling routes, never smuggled through the JSON one.
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
  // Same id-shape guard as the two handlers above.
  const productId = parseId(request.params.id)
  if (!productId) return response.status(404).json({ message: 'Product not found.' })

  // Read before delete — not because the DELETE below needs it, but
  // because a file sitting on disk has to be cleaned up by SOMEONE, and
  // the row about to be deleted is the only place that still remembers
  // which file (if any) was ever attached to this product. Once the
  // DELETE below succeeds, that knowledge is gone for good — so it has to
  // be captured before, not after.
  const existing = await pool.query('SELECT image_key FROM products WHERE product_id = $1', [productId])

  try {
    const result = await pool.query('DELETE FROM products WHERE product_id = $1', [productId])
    if (result.rowCount === 0) return response.status(404).json({ message: 'Product not found.' })
    if (existing.rows[0]?.image_key) await deleteFile(existing.rows[0].image_key)
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
