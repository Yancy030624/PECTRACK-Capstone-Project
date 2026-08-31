// ============================================================================
// PECTRACK API — routes/inventory.js (annotated for learning)
// Inventory management (Phase 5). Every product already has exactly one
// inventory row — routes/products.js creates it at product-creation time,
// with the table's own defaults (stock_quantity 0, min_stock_level 0).
// This file is about the STOCK side of that same row: quantity, minimum
// level, expiry. The product's own name/price/description stay entirely
// in routes/products.js — the two files own different columns of a
// relationship the schema already ties together 1:1
// (inventory.product_id is NOT NULL UNIQUE).
//
// Admin and cashier only. Customers have no reason to see raw stock
// numbers (they see availability_status on the product itself, which is a
// separate boolean), and delivery personnel have no inventory concern at
// all. Mounted at /api/inventory in app.js.
//
// This file now implements Steps 1, 2, and 5 of PHASE5_PLAN.md: the
// read-only list, admin editing stock directly with a movement-ledger row
// alongside every change, and low-stock alerting on every edit. See that
// document for the full design — the conditional-update deduction pattern
// that keeps overselling from crashing as a 500 (Step 3), and the
// observed-vs-proposed shape used by the cashier-approval workflow
// (Step 6) that comes later.
// ============================================================================

import express from 'express'
import { pool } from '../db.js'
import { requireAuth, requireRole } from '../lib/auth.js'
// syncStockAlert is shared with routes/orders.js — every place stock can
// change (order placement/cancellation, and this file's direct edit)
// needs the exact same low-stock rule applied the exact same way, so it
// lives once in lib/inventory.js rather than being reimplemented here.
// See that file for the full reasoning.
import { syncStockAlert } from '../lib/inventory.js'
import { normalize, parseId } from '../lib/validation.js'

const router = express.Router()

// The reasons a DIRECT admin edit is allowed to record. Deliberately a
// SUBSET of the full stock_movement_reason database enum (which also has
// ORDER_PLACED and ORDER_CANCELLED) — those two are written by the system
// itself when an order is placed or cancelled (Steps 3–4), and must never
// be something a person can type into this form. If they could, the
// ledger would no longer reliably distinguish "the system moved this
// stock because of an order" from "an admin claims this was an order" —
// which defeats the entire point of having a reason column.
const manualMovementReasons = new Set(['RESTOCK', 'SPOILAGE', 'CORRECTION'])

// Reshapes one joined row into the camelCase shape the frontend consumes —
// same pattern as mapProductRow, mapOrderSummary, etc. throughout this app.
const mapInventoryRow = (row) => ({
  productId: row.product_id,
  productName: row.product_name,
  categoryId: row.category_id,
  categoryName: row.category_name,
  stockQuantity: row.stock_quantity,
  minStockLevel: row.min_stock_level,
  expirationDate: row.expiration_date,
  lastUpdated: row.last_updated,
  // Computed here rather than stored as its own column. It is ALWAYS
  // exactly this comparison — there is no other rule for "is this low" —
  // so storing it would just create a second place it could go stale
  // relative to stock_quantity and min_stock_level. Deriving it on every
  // read means it can never disagree with the numbers it's based on.
  lowStock: row.stock_quantity <= row.min_stock_level,
})

// JOINs both products (for the name) and categories (for the category
// name), the same two-hop join products.js's own productSelectQuery does —
// inventory doesn't know its own product's name or category, so both
// joins are needed just to build a useful list row.
const inventorySelectQuery = `SELECT i.inventory_id, i.product_id, p.product_name, p.category_id, c.category_name,
            i.stock_quantity, i.min_stock_level, i.expiration_date, i.last_updated
     FROM inventory i
     JOIN products p ON p.product_id = i.product_id
     JOIN categories c ON c.category_id = p.category_id`

// Applies to every route below: must be logged in AND be admin or cashier.
// Unlike routes/products.js (which lets every authenticated role read the
// catalog, just with different visibility rules per role), there is no
// customer-facing reason to expose stock counts at all, so the router
// simply doesn't admit that role.
router.use(requireAuth, requireRole('ADMIN', 'CASHIER'))

// GET /api/inventory — the full stock list. No role-based filtering (unlike
// products.js's customer/staff split) because both roles allowed past the
// requireRole guard above are staff who need to see everything, including
// items that are currently well-stocked — there is no "hide the boring
// ones" rule the way there is a "hide unavailable products from customers"
// rule on the catalog.
router.get('/', async (_request, response) => {
  const result = await pool.query(`${inventorySelectQuery} ORDER BY p.product_name`)
  return response.json({ inventory: result.rows.map(mapInventoryRow) })
})

// PATCH /api/inventory/:productId — the ADMIN-ONLY direct stock edit.
//
// requireRole('ADMIN') is applied AGAIN here, even though the router-wide
// router.use(...) above already lets a cashier this far for GET. That's
// deliberate, not redundant: a cashier needs read access to this router
// (they'll need it for Step 6's approval screen too), but writing stock
// immediately, with no approval step, is an admin-only power. Cashiers can
// only PROPOSE a change (Step 6, inventory_change_requests — not built
// yet), which an admin then reviews before anything actually moves. This
// route is the admin path that skips that review because the admin IS the
// review.
router.patch('/:productId', requireRole('ADMIN'), async (request, response) => {
  // parseId (see lib/validationExplanation.js) rejects a malformed id
  // before it can reach Postgres as an invalid bigint literal — the same
  // 404-not-500 pattern used by every other :id route in this app.
  const productId = parseId(request.params.productId)
  if (!productId) return response.status(404).json({ message: 'Product not found.' })

  // Needed for two things below: inventory_id (the foreign key any
  // movement row must reference) and the CURRENT stock_quantity (to
  // compute how much it's changing by — the movement ledger stores a
  // DELTA, not an absolute value, so the old value has to be read first).
  const existing = await pool.query('SELECT inventory_id, stock_quantity FROM inventory WHERE product_id = $1', [productId])
  const current = existing.rows[0]
  if (!current) return response.status(404).json({ message: 'Product not found.' })

  // Partial update: validate only whichever fields are actually present in
  // the body, same `'field' in request.body` pattern products.js's own
  // PATCH uses for exactly the same reason — a request that only wants to
  // bump minStockLevel shouldn't be forced to also resend a valid
  // stockQuantity.
  const errors = {}
  const values = {}

  if ('stockQuantity' in request.body) {
    const stockQuantity = Number(request.body.stockQuantity)
    // Number.isInteger rejects 4.5, NaN, and Infinity all at once — stock
    // is always a whole count of items, never a fraction.
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
    // Clearing the expiry (no batch currently tracked) is a real, valid
    // edit — an empty string from a cleared date input is treated the
    // same as an explicit null, so the frontend doesn't have to know the
    // difference.
    if (rawExpirationDate == null || rawExpirationDate === '') values.expirationDate = null
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(rawExpirationDate)) errors.expirationDate = 'Enter a valid date (YYYY-MM-DD).'
    else values.expirationDate = rawExpirationDate
  }

  // WHY A CHANGE TO stockQuantity SPECIFICALLY NEEDS A REASON, WHEN THE
  // OTHER TWO FIELDS DON'T. This is the entire point of the
  // inventory_movements ledger (PHASE5_PLAN.md, Decision 1): without it,
  // stock_quantity is just a number that changes with no record of why.
  // minStockLevel and expirationDate are thresholds/metadata about the
  // product, not stock ITSELF moving in or out, so they have nothing for
  // the ledger to explain.
  let reason = null
  if ('stockQuantity' in values) {
    reason = normalize(request.body.reason).toUpperCase()
    if (!manualMovementReasons.has(reason)) errors.reason = 'Select why stock is changing: restock, spoilage, or correction.'
  }

  if (Object.keys(errors).length) return response.status(422).json({ message: 'Please correct the highlighted fields.', errors })
  if (Object.keys(values).length === 0) return response.status(422).json({ message: 'Provide at least one field to update.' })

  // Optional free-text explanation stored alongside the movement — e.g.
  // "delivery from supplier" or "5 units past expiry". Capped at 500
  // characters, same limit used for order instructions/notes elsewhere in
  // this app, purely to keep the column from growing unbounded.
  const note = request.body.note == null ? null : normalize(request.body.note).slice(0, 500) || null

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // expiration_date is nullable, and clearing it to NULL is a real edit
    // — plain COALESCE can't tell "field not sent" apart from "field sent
    // as null" (COALESCE(NULL, existing) would just keep the old value,
    // silently ignoring an intentional clear). So it uses a CASE keyed on
    // whether the field was present at all — the exact pattern
    // products.js's description/variant fields use for the same reason.
    // stock_quantity and min_stock_level are NOT NULL columns where an
    // omitted field is never intentionally null, so plain COALESCE is
    // correct and simpler for those two.
    // RETURNING the post-update figures rather than reading them back with
    // a separate SELECT — cheaper, and immune to a theoretical race where
    // something else touches this row between the UPDATE and a follow-up
    // read (not possible here anyway, since both happen inside the same
    // transaction, but RETURNING is the idiom that makes that true by
    // construction rather than by reasoning about it).
    const updated = await client.query(
      `UPDATE inventory
       SET stock_quantity = COALESCE($1, stock_quantity),
           min_stock_level = COALESCE($2, min_stock_level),
           expiration_date = CASE WHEN $3 THEN $4 ELSE expiration_date END,
           last_updated = CURRENT_TIMESTAMP
       WHERE product_id = $5
       RETURNING stock_quantity, min_stock_level`,
      [values.stockQuantity ?? null, values.minStockLevel ?? null, 'expirationDate' in values, values.expirationDate ?? null, productId],
    )

    // Only a stockQuantity change gets a ledger row. inventory_movements
    // exists to explain changes IN STOCK — min_stock_level and
    // expiration_date aren't stock, so there's nothing for it to say
    // about them, the same reasoning that decided which field needs a
    // `reason` above.
    if ('stockQuantity' in values) {
      const quantityChange = values.stockQuantity - current.stock_quantity
      // Guards against writing a movement row for a "change" that isn't
      // one — an admin submitting the SAME value stock already has. Two
      // reasons this matters: inventory_movements has
      // CHECK (quantity_change <> 0), so a 0 would fail the constraint
      // outright; and more fundamentally, nothing actually happened, so
      // there is nothing true to log. A ledger with false entries would
      // be worse than no ledger at all.
      if (quantityChange !== 0) {
        await client.query(
          'INSERT INTO inventory_movements (inventory_id, changed_by, quantity_change, reason, note) VALUES ($1, $2, $3, $4, $5)',
          [current.inventory_id, request.user.id, quantityChange, reason, note],
        )
      }
    }

    // Called UNCONDITIONALLY here — not only when stockQuantity changed.
    // That's deliberate: an admin editing minStockLevel ALONE can just as
    // easily move the product across the low-stock line. Example: stock
    // sits at 8 with a minimum of 10 (already low, alert open); the admin
    // corrects the minimum down to 5 without touching stock at all — now
    // 8 > 5, and the alert should close even though stock_quantity itself
    // never moved. syncStockAlert re-evaluates against whatever the
    // CURRENT threshold actually is, using the values this same UPDATE
    // just returned.
    await syncStockAlert(client, { inventoryId: current.inventory_id, stockQuantity: updated.rows[0].stock_quantity, minStockLevel: updated.rows[0].min_stock_level })

    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }

  const updated = await pool.query(`${inventorySelectQuery} WHERE i.product_id = $1`, [productId])
  // { item: ... } rather than { inventory: ... } — GET / above already
  // uses "inventory" for the ARRAY, so reusing that key here for a single
  // object would mean the same field name sometimes holds a list and
  // sometimes holds one row, depending purely on which endpoint answered.
  // A distinct key removes that ambiguity for whatever reads this response.
  return response.json({ item: mapInventoryRow(updated.rows[0]) })
})

export default router
