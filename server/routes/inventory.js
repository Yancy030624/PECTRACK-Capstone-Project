// Inventory management (Phase 5). Every product has exactly one inventory
// row (products.js creates it on product creation), so this router is
// about the STOCK side of that row — quantity, minimum level, expiry —
// not the product's own name/price/description, which stay in
// routes/products.js.
//
// Admin and cashier only: customers have no reason to see stock numbers,
// and delivery personnel have no inventory concern at all. Mounted at
// /api/inventory in app.js.
//
// See PHASE5_PLAN.md for the full design (the movement ledger, the
// conditional-update deduction pattern, the observed-vs-proposed stock
// change request shape) — this file now covers Steps 1 and 2 from that
// plan: the read-only list, and admin editing stock directly.
import express from 'express'
import { pool } from '../db.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { normalize, parseId } from '../lib/validation.js'

const router = express.Router()

// Reasons a DIRECT admin edit is allowed to record. Deliberately narrower
// than the full stock_movement_reason enum: ORDER_PLACED and
// ORDER_CANCELLED are written by the system itself when an order moves
// (Steps 3–4), never chosen by a person filling in a form here.
const manualMovementReasons = new Set(['RESTOCK', 'SPOILAGE', 'CORRECTION'])

const mapInventoryRow = (row) => ({
  productId: row.product_id,
  productName: row.product_name,
  categoryId: row.category_id,
  categoryName: row.category_name,
  stockQuantity: row.stock_quantity,
  minStockLevel: row.min_stock_level,
  expirationDate: row.expiration_date,
  lastUpdated: row.last_updated,
  // Computed rather than stored: it's always exactly this comparison, so
  // storing it would just be a second place it could go stale relative to
  // stock_quantity and min_stock_level.
  lowStock: row.stock_quantity <= row.min_stock_level,
})

const inventorySelectQuery = `SELECT i.inventory_id, i.product_id, p.product_name, p.category_id, c.category_name,
            i.stock_quantity, i.min_stock_level, i.expiration_date, i.last_updated
     FROM inventory i
     JOIN products p ON p.product_id = i.product_id
     JOIN categories c ON c.category_id = p.category_id`

router.use(requireAuth, requireRole('ADMIN', 'CASHIER'))

router.get('/', async (_request, response) => {
  const result = await pool.query(`${inventorySelectQuery} ORDER BY p.product_name`)
  return response.json({ inventory: result.rows.map(mapInventoryRow) })
})

// PATCH /api/inventory/:productId — admin-only direct stock edit. Cashiers
// can only PROPOSE a stock change (Step 6, inventory_change_requests, not
// built yet) — this endpoint is the admin path that applies immediately,
// no approval needed. That split is why requireRole('ADMIN') is added
// again here even though the router-wide guard above already lets a
// cashier this far (a cashier needs GET access for Step 6's approval
// screen, but not this route).
router.patch('/:productId', requireRole('ADMIN'), async (request, response) => {
  const productId = parseId(request.params.productId)
  if (!productId) return response.status(404).json({ message: 'Product not found.' })

  const existing = await pool.query('SELECT inventory_id, stock_quantity FROM inventory WHERE product_id = $1', [productId])
  const current = existing.rows[0]
  if (!current) return response.status(404).json({ message: 'Product not found.' })

  // Validates only the fields actually present in the body — a partial
  // update, same pattern as products.js's own PATCH.
  const errors = {}
  const values = {}

  if ('stockQuantity' in request.body) {
    const stockQuantity = Number(request.body.stockQuantity)
    if (!Number.isInteger(stockQuantity) || stockQuantity < 0) errors.stockQuantity = 'Enter a whole number, zero or greater.'
    else values.stockQuantity = stockQuantity
  }
  if ('minStockLevel' in request.body) {
    const minStockLevel = Number(request.body.minStockLevel)
    if (!Number.isInteger(minStockLevel) || minStockLevel < 0) errors.minStockLevel = 'Enter a whole number, zero or greater.'
    else values.minStockLevel = minStockLevel
  }
  if ('expirationDate' in request.body) {
    const rawExpirationDate = request.body.expirationDate
    if (rawExpirationDate == null || rawExpirationDate === '') values.expirationDate = null
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(rawExpirationDate)) errors.expirationDate = 'Enter a valid date (YYYY-MM-DD).'
    else values.expirationDate = rawExpirationDate
  }

  // A stock_quantity change must say WHY — that's the entire point of the
  // movement ledger (see PHASE5_PLAN.md, Decision 1). Every other field on
  // this route is metadata that doesn't need a reason.
  let reason = null
  if ('stockQuantity' in values) {
    reason = normalize(request.body.reason).toUpperCase()
    if (!manualMovementReasons.has(reason)) errors.reason = 'Select why stock is changing: restock, spoilage, or correction.'
  }

  if (Object.keys(errors).length) return response.status(422).json({ message: 'Please correct the highlighted fields.', errors })
  if (Object.keys(values).length === 0) return response.status(422).json({ message: 'Provide at least one field to update.' })

  const note = request.body.note == null ? null : normalize(request.body.note).slice(0, 500) || null

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // expiration_date is nullable and clearing it to NULL is a real, valid
    // edit — COALESCE alone can't distinguish "not sent" from "sent as
    // null", so it uses a CASE keyed on presence, same as products.js's
    // description/variant fields. stock_quantity and min_stock_level are
    // NOT NULL columns where an omitted field is never intentionally null,
    // so plain COALESCE is safe for those two.
    await client.query(
      `UPDATE inventory
       SET stock_quantity = COALESCE($1, stock_quantity),
           min_stock_level = COALESCE($2, min_stock_level),
           expiration_date = CASE WHEN $3 THEN $4 ELSE expiration_date END,
           last_updated = CURRENT_TIMESTAMP
       WHERE product_id = $5`,
      [values.stockQuantity ?? null, values.minStockLevel ?? null, 'expirationDate' in values, values.expirationDate ?? null, productId],
    )

    // Only stock_quantity changes get a ledger row — min_stock_level and
    // expiration_date are thresholds/metadata, not stock itself, so
    // inventory_movements (which exists to explain changes IN STOCK) has
    // nothing to say about them.
    if ('stockQuantity' in values) {
      const quantityChange = values.stockQuantity - current.stock_quantity
      // Skip the insert entirely if the admin "changed" it to the same
      // value it already was — inventory_movements.quantity_change has
      // CHECK (quantity_change <> 0), and more importantly, nothing
      // actually happened, so there is nothing true to log.
      if (quantityChange !== 0) {
        await client.query(
          'INSERT INTO inventory_movements (inventory_id, changed_by, quantity_change, reason, note) VALUES ($1, $2, $3, $4, $5)',
          [current.inventory_id, request.user.id, quantityChange, reason, note],
        )
      }
    }

    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }

  const updated = await pool.query(`${inventorySelectQuery} WHERE i.product_id = $1`, [productId])
  return response.json({ item: mapInventoryRow(updated.rows[0]) })
})

export default router
