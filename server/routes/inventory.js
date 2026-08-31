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
// change request shape) — this file now covers Steps 1, 2, 5, and 6 from
// that plan: the read-only list, admin editing stock directly, low-stock
// alerting, and the cashier-proposes/admin-approves workflow.
import express from 'express'
import { pool } from '../db.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { syncStockAlert } from '../lib/inventory.js'
import { normalize, parseId } from '../lib/validation.js'

const router = express.Router()

// Reasons a DIRECT admin edit is allowed to record. Deliberately narrower
// than the full stock_movement_reason enum: ORDER_PLACED and
// ORDER_CANCELLED are written by the system itself when an order moves
// (Steps 3–4), never chosen by a person filling in a form here.
const manualMovementReasons = new Set(['RESTOCK', 'SPOILAGE', 'CORRECTION'])
const requestDecisions = new Set(['APPROVED', 'REJECTED'])
const requestReasonMaxLength = 500

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

const mapChangeRequestRow = (row) => ({
  id: row.request_id,
  productId: row.product_id,
  productName: row.product_name,
  requestedByName: row.requested_by_name,
  observedStockQuantity: row.observed_stock_quantity,
  proposedStockQuantity: row.proposed_stock_quantity,
  proposedMinStockLevel: row.proposed_min_stock_level,
  reason: row.reason,
  status: row.status,
  reviewedByName: row.reviewed_by_name,
  reviewedAt: row.reviewed_at,
  reviewerNote: row.reviewer_note,
  createdAt: row.created_at,
})

const changeRequestSelectQuery = `SELECT r.request_id, r.product_id, p.product_name, r.requested_by, rc.name AS requested_by_name,
            r.observed_stock_quantity, r.proposed_stock_quantity, r.proposed_min_stock_level,
            r.reason, r.status, r.reviewed_by, ra.name AS reviewed_by_name, r.reviewed_at, r.reviewer_note, r.created_at
     FROM inventory_change_requests r
     JOIN products p ON p.product_id = r.product_id
     JOIN cashiers rc ON rc.cashier_id = r.requested_by
     LEFT JOIN admins ra ON ra.admin_id = r.reviewed_by`

router.use(requireAuth, requireRole('ADMIN', 'CASHIER'))

router.get('/', async (_request, response) => {
  const result = await pool.query(`${inventorySelectQuery} ORDER BY p.product_name`)
  return response.json({ inventory: result.rows.map(mapInventoryRow) })
})

// GET /api/inventory/requests — a cashier sees their OWN proposals (so
// they can check whether one was approved or rejected); an admin sees
// everyone's, since reviewing them is the whole point of this screen for
// that role. Same role-scoping shape as GET /api/orders.
//
// Registered BEFORE the /:productId route below even though Express's
// path matching wouldn't actually confuse a two-segment path like this
// with a one-segment wildcard — specific literal paths are kept ahead of
// wildcard ones anyway, as a matter of habit that stays correct if a
// route here ever changes shape.
router.get('/requests', async (request, response) => {
  if (request.user.role === 'CASHIER') {
    const cashierResult = await pool.query('SELECT cashier_id FROM cashiers WHERE user_id = $1', [request.user.id])
    const cashierId = cashierResult.rows[0]?.cashier_id
    const result = await pool.query(`${changeRequestSelectQuery} WHERE r.requested_by = $1 ORDER BY r.created_at DESC`, [cashierId])
    return response.json({ requests: result.rows.map(mapChangeRequestRow) })
  }
  const result = await pool.query(`${changeRequestSelectQuery} ORDER BY r.created_at DESC`)
  return response.json({ requests: result.rows.map(mapChangeRequestRow) })
})

// POST /api/inventory/requests — cashier-only. This is the ONLY way a
// cashier can influence stock; PATCH /:productId below is admin-only.
//
// request_type is HARDCODED to 'INVENTORY' below and never read from the
// request body at all — that is what actually enforces "cashiers may only
// submit INVENTORY requests, never PRODUCT_DETAILS" (PHASE5_PLAN.md,
// Step 6). The database CHECK constraint on this table allows either type
// for either kind of proposed_* field combination; it does not know or
// care WHO is submitting. An input that is never read cannot be misused,
// which is a stronger guarantee than validating a submitted requestType
// against an allowed set — there is no set to bypass because there is no
// field.
router.post('/requests', requireRole('CASHIER'), async (request, response) => {
  const productId = parseId(request.body.productId)
  if (!productId) return response.status(422).json({ message: 'Select a valid product.', errors: { productId: 'Select a valid product.' } })

  const errors = {}
  const values = {}

  if (request.body.proposedStockQuantity != null) {
    const proposedStockQuantity = Number(request.body.proposedStockQuantity)
    if (!Number.isInteger(proposedStockQuantity) || proposedStockQuantity < 0) errors.proposedStockQuantity = 'Enter a whole number, zero or greater.'
    else values.proposedStockQuantity = proposedStockQuantity
  }
  if (request.body.proposedMinStockLevel != null) {
    const proposedMinStockLevel = Number(request.body.proposedMinStockLevel)
    if (!Number.isInteger(proposedMinStockLevel) || proposedMinStockLevel < 0) errors.proposedMinStockLevel = 'Enter a whole number, zero or greater.'
    else values.proposedMinStockLevel = proposedMinStockLevel
  }
  // Mirrors the table's own CHECK constraint for an INVENTORY request:
  // at least one of the two proposed fields must be present.
  if (values.proposedStockQuantity === undefined && values.proposedMinStockLevel === undefined) {
    errors.proposedStockQuantity = 'Propose a new stock quantity, a new minimum level, or both.'
  }

  const reason = normalize(request.body.reason).slice(0, requestReasonMaxLength)
  if (!reason) errors.reason = 'Explain why this change is needed.'

  if (Object.keys(errors).length) return response.status(422).json({ message: 'Please correct the highlighted fields.', errors })

  const cashierResult = await pool.query('SELECT cashier_id FROM cashiers WHERE user_id = $1', [request.user.id])
  const cashierId = cashierResult.rows[0]?.cashier_id

  const inventoryResult = await pool.query('SELECT stock_quantity FROM inventory WHERE product_id = $1', [productId])
  const inventoryRow = inventoryResult.rows[0]
  if (!inventoryRow) return response.status(404).json({ message: 'Product not found.' })

  // observed_stock_quantity is captured HERE, server-side, from the
  // CURRENT stock — never accepted from the client. A client-supplied
  // value could already be stale by the moment it's submitted (the
  // cashier's screen may have loaded minutes ago; orders may have sold
  // through since); reading it fresh at the instant of submission is what
  // makes it a trustworthy baseline for the delta calculation an approval
  // performs later (see PATCH /requests/:requestId, and Decision 2 in
  // PHASE5_PLAN.md).
  const created = await pool.query(
    `INSERT INTO inventory_change_requests (product_id, requested_by, request_type, observed_stock_quantity, proposed_stock_quantity, proposed_min_stock_level, reason)
     VALUES ($1, $2, 'INVENTORY', $3, $4, $5, $6)
     RETURNING request_id`,
    [productId, cashierId, inventoryRow.stock_quantity, values.proposedStockQuantity ?? null, values.proposedMinStockLevel ?? null, reason],
  )

  const full = await pool.query(`${changeRequestSelectQuery} WHERE r.request_id = $1`, [created.rows[0].request_id])
  return response.status(201).json({ request: mapChangeRequestRow(full.rows[0]) })
})

// PATCH /api/inventory/requests/:requestId — admin-only approve/reject.
router.patch('/requests/:requestId', requireRole('ADMIN'), async (request, response) => {
  const requestId = parseId(request.params.requestId)
  if (!requestId) return response.status(404).json({ message: 'Request not found.' })

  const decision = normalize(request.body.status).toUpperCase()
  if (!requestDecisions.has(decision)) return response.status(422).json({ message: 'Enter a valid decision.', errors: { status: 'status must be APPROVED or REJECTED.' } })

  const reviewerNote = request.body.reviewerNote == null ? null : normalize(request.body.reviewerNote).slice(0, requestReasonMaxLength) || null

  // A friendly pre-check for the two "can't do this" cases, before
  // opening a transaction — 404 for a request that never existed, 409 for
  // one that's already been decided (a request is reviewed exactly once;
  // there is no "PENDING again" path back).
  const existing = await pool.query('SELECT status FROM inventory_change_requests WHERE request_id = $1', [requestId])
  if (!existing.rows[0]) return response.status(404).json({ message: 'Request not found.' })
  if (existing.rows[0].status !== 'PENDING') return response.status(409).json({ message: 'This request has already been reviewed.' })

  const adminResult = await pool.query('SELECT admin_id FROM admins WHERE user_id = $1', [request.user.id])
  const adminId = adminResult.rows[0]?.admin_id

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Conditional UPDATE, WHERE status = 'PENDING' — the pre-check above
    // already covers the common case with a friendly message, but this
    // guards the genuine race: two admins reviewing the same request at
    // the same moment. rowCount === 0 here means the pre-check's answer
    // is now stale (someone else's review landed in between), and that's
    // still correctly a 409, just discovered slightly later.
    const reviewed = await client.query(
      `UPDATE inventory_change_requests
       SET status = $1, reviewed_by = $2, reviewed_at = CURRENT_TIMESTAMP, reviewer_note = $3
       WHERE request_id = $4 AND status = 'PENDING'
       RETURNING product_id, observed_stock_quantity, proposed_stock_quantity, proposed_min_stock_level, reason`,
      [decision, adminId, reviewerNote, requestId],
    )
    if (reviewed.rowCount === 0) {
      await client.query('ROLLBACK')
      return response.status(409).json({ message: 'This request has already been reviewed.' })
    }
    const changeRequest = reviewed.rows[0]

    // A rejection needs nothing further — no inventory row is touched at
    // all. Only an approval applies anything.
    if (decision === 'APPROVED') {
      const inventoryResult = await client.query('SELECT inventory_id, stock_quantity, min_stock_level FROM inventory WHERE product_id = $1', [changeRequest.product_id])
      const inventoryRow = inventoryResult.rows[0]

      let newStockQuantity = inventoryRow.stock_quantity
      if (changeRequest.proposed_stock_quantity != null) {
        // THE OBSERVED-DELTA CALCULATION — PHASE5_PLAN.md, Decision 2.
        // observed_stock_quantity is what stock WAS when the cashier
        // proposed this; inventoryRow.stock_quantity is what it IS right
        // now, which may have moved (orders placed or cancelled) while
        // this request sat pending. Applying proposed_stock_quantity
        // directly would silently erase whatever happened in between —
        // applying the DIFFERENCE the cashier observed to CURRENT stock
        // preserves it instead: newStock = current + (proposed - observed).
        //
        // NULL observed_stock_quantity falls back to treating the
        // proposal as an absolute value — documented in migration 003 for
        // any row that could predate this column; every row this route
        // creates always has one, so that branch is a safety net, not
        // something this code path exercises in practice.
        newStockQuantity = changeRequest.observed_stock_quantity != null
          ? inventoryRow.stock_quantity + (changeRequest.proposed_stock_quantity - changeRequest.observed_stock_quantity)
          : changeRequest.proposed_stock_quantity

        if (newStockQuantity < 0) {
          await client.query('ROLLBACK')
          return response.status(409).json({ message: 'Approving this would drive stock negative — stock has changed since the request was submitted. Reject it and ask for a fresh count instead.' })
        }
      }
      // min_stock_level has no observed baseline (nothing else changes it
      // automatically the way orders drain stock_quantity), so it's
      // applied as a plain absolute value.
      const newMinStockLevel = changeRequest.proposed_min_stock_level ?? inventoryRow.min_stock_level

      const updated = await client.query(
        'UPDATE inventory SET stock_quantity = $1, min_stock_level = $2, last_updated = CURRENT_TIMESTAMP WHERE inventory_id = $3 RETURNING stock_quantity, min_stock_level',
        [newStockQuantity, newMinStockLevel, inventoryRow.inventory_id],
      )

      if (newStockQuantity !== inventoryRow.stock_quantity) {
        // CORRECTION, not RESTOCK/SPOILAGE — this movement originates
        // from a cashier's physical recount being confirmed by an admin,
        // which is exactly what CORRECTION means. request_id (not
        // order_id) is what this movement's cause is; changed_by is the
        // APPROVING ADMIN's user_id, since they're the one who actually
        // authorized the stock change, even though a cashier proposed it.
        await client.query(
          'INSERT INTO inventory_movements (inventory_id, request_id, changed_by, quantity_change, reason, note) VALUES ($1, $2, $3, $4, $5, $6)',
          [inventoryRow.inventory_id, requestId, request.user.id, newStockQuantity - inventoryRow.stock_quantity, 'CORRECTION', changeRequest.reason],
        )
      }

      await syncStockAlert(client, { inventoryId: inventoryRow.inventory_id, stockQuantity: updated.rows[0].stock_quantity, minStockLevel: updated.rows[0].min_stock_level })
    }

    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }

  const full = await pool.query(`${changeRequestSelectQuery} WHERE r.request_id = $1`, [requestId])
  return response.json({ request: mapChangeRequestRow(full.rows[0]) })
})

// PATCH /api/inventory/:productId — admin-only direct stock edit. Cashiers
// can only PROPOSE a stock change (POST /requests above) — this endpoint
// is the admin path that applies immediately, no approval needed. That
// split is why requireRole('ADMIN') is added again here even though the
// router-wide guard above already lets a cashier this far (a cashier
// needs GET access to this router for /requests, but not this route).
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

    // Called unconditionally, not just when stockQuantity changed — an
    // admin editing minStockLevel ALONE can just as easily push the
    // product across the low-stock threshold (e.g. raising the minimum
    // above stock that was previously fine), and the alert needs to
    // reflect the threshold that's actually in effect now.
    await syncStockAlert(client, { inventoryId: current.inventory_id, stockQuantity: updated.rows[0].stock_quantity, minStockLevel: updated.rows[0].min_stock_level })

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
