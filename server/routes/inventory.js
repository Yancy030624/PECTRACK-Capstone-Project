// Inventory management (Phase 5). Every product has exactly one inventory
// row (products.js creates it on product creation), so this router is
// about the STOCK side of that row — quantity and minimum level —
// not the product's own name/price/description, which stay in
// routes/products.js.
//
// Admin and cashier only: customers have no reason to see stock numbers,
// and delivery personnel have no inventory concern at all. Mounted at
// /api/inventory in app.js.
//
// See PHASE5_PLAN.md for the movement ledger and the conditional-update
// deduction pattern. The cashier-proposes/admin-approves workflow was
// removed at the client's request (CLIENT_REVISIONS_PLAN.md, R1): cashiers
// encode stock themselves, so the admin and cashiers both change stock
// directly here, and the ledger records who did it and why. The
// inventory_change_requests table stays, as the history of past requests.
import express from 'express'
import { pool } from '../db.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { syncStockAlert } from '../lib/inventory.js'
import { normalize, parseId } from '../lib/validation.js'
import { productionFor } from '../lib/dailyStock.js'

const router = express.Router()

// Reasons a direct stock edit may record (CLIENT_REVISIONS_PLAN.md, R3).
// ORDER_PLACED and ORDER_CANCELLED are written by the system itself when an
// order moves, never chosen in a form. The bakery records only rejected
// bread as a loss — burned or dropped bread is not written down — so REJECT
// is the one loss reason. The older loss reasons (SPOILAGE, PRODUCTION_LOSS,
// EXPIRED, DAMAGED) stay in the enum for past ledger rows only.
const manualMovementReasons = new Set(['RESTOCK', 'REJECT', 'CORRECTION'])
// Which way each reason may move stock: a restock only adds, a reject only
// removes, a correction (a recount) goes either way. Checked because the
// reason and the new figure arrive separately — a "+20 REJECT" ledger row
// would not be a loss, and the loss figures built on the ledger would read
// it as one.
const reasonDirection = { RESTOCK: 1, REJECT: -1 }

const mapInventoryRow = (row) => ({
  productId: row.product_id,
  productName: row.product_name,
  // Three "Broas" rows with no variant were indistinguishable on the
  // stock screen; the variant is what tells the gallon tin from the pack.
  variant: row.variant,
  categoryId: row.category_id,
  categoryName: row.category_name,
  stockQuantity: row.stock_quantity,
  minStockLevel: row.min_stock_level,
  // Migration 035: how the bakery stocks it, and its levels.
  stockType: row.stock_type,
  standardStock: row.standard_stock,
  targetStock: row.target_stock,
  lastUpdated: row.last_updated,
  // Computed rather than stored: it's always exactly this comparison, so
  // storing it would just be a second place it could go stale relative to
  // stock_quantity and min_stock_level.
  lowStock: row.stock_quantity <= row.min_stock_level,
})

const inventorySelectQuery = `SELECT i.inventory_id, i.product_id, p.product_name, p.variant, p.category_id, c.category_name,
            i.stock_quantity, i.min_stock_level, i.last_updated, p.stock_type, i.standard_stock, i.target_stock
     FROM inventory i
     JOIN products p ON p.product_id = i.product_id
     JOIN categories c ON c.category_id = p.category_id`

router.use(requireAuth, requireRole('ADMIN', 'CASHIER'))

router.get('/', async (_request, response) => {
  const result = await pool.query(`${inventorySelectQuery} ORDER BY p.product_name`)
  return response.json({ inventory: result.rows.map(mapInventoryRow) })
})

// GET /api/inventory/production?day=YYYY-MM-DD — what to bake that day
// (default tomorrow), per product: RULES-PLANS/DAILY_STOCK_PLAN.md.
router.get('/production', async (request, response) => {
  const asked = String(request.query.day ?? '')
  const day = /^\d{4}-\d{2}-\d{2}$/.test(asked)
    ? asked
    : (await pool.query(`SELECT ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date + 1)::text AS day`)).rows[0].day
  return response.json({ day, items: await productionFor(day) })
})

// PATCH /api/inventory/:productId — a direct stock change, applied at once
// and written to the ledger with who made it. Admin and cashier both Add
// stock (addQuantity). Setting the count outright ("Correct count") and the
// levels are the admin's: the bakery keeps no rejects list, so a corrected
// count is how thrown-away bread leaves the shelf figure (the client,
// 2026-10-23).
const adminOnlyInventoryFields = ['minStockLevel', 'standardStock', 'targetStock', 'stockQuantity']
router.patch('/:productId', async (request, response) => {
  if (request.user.role !== 'ADMIN' && adminOnlyInventoryFields.some((field) => field in request.body)) {
    return response.status(403).json({ message: 'Only an admin can change the stock levels or correct the count.' })
  }
  const productId = parseId(request.params.productId)
  if (!productId) return response.status(404).json({ message: 'Product not found.' })

  // A cheap existence check so a bad product id 404s before doing any
  // validation work. Deliberately NOT used for the ledger arithmetic below
  // — it runs on a pooled connection outside any transaction, so by the
  // time the write happens its stock_quantity is only a hint. The
  // authoritative, locked read happens inside the transaction.
  const existing = await pool.query('SELECT 1 FROM inventory WHERE product_id = $1', [productId])
  if (!existing.rows[0]) return response.status(404).json({ message: 'Product not found.' })

  // Validates only the fields actually present in the body — a partial
  // update, same pattern as products.js's own PATCH.
  const errors = {}
  const values = {}

  // `addQuantity` (the adviser, 2026-10-23): pieces received, ADDED to
  // what is on the shelf — 7 camachile plus 50 received is 57 — recorded
  // as a restock. The total is worked out below under the row lock, so a
  // sale in between is never lost.
  let addQuantity = null
  if ('addQuantity' in request.body) {
    addQuantity = Number(request.body.addQuantity)
    if (!Number.isInteger(addQuantity) || addQuantity < 1 || addQuantity > 100000) errors.addQuantity = 'Enter how many pieces to add, 1 or more.'
    if ('stockQuantity' in request.body) errors.addQuantity = 'Send either the pieces to add or the new count, not both.'
  }
  if ('stockQuantity' in request.body) {
    const stockQuantity = Number(request.body.stockQuantity)
    if (!Number.isInteger(stockQuantity) || stockQuantity < 0) errors.stockQuantity = 'Enter a whole number, zero or greater.'
    else values.stockQuantity = stockQuantity
  }
  // Migration 035: a soft bread's daily standard, a hard bread's stop level.
  for (const field of ['standardStock', 'targetStock']) {
    if (field in request.body) {
      const level = Number(request.body[field])
      if (!Number.isInteger(level) || level < 0 || level > 100000) errors[field] = 'Enter a whole number, zero or greater.'
      else values[field] = level
    }
  }
  if ('minStockLevel' in request.body) {
    const minStockLevel = Number(request.body.minStockLevel)
    if (!Number.isInteger(minStockLevel) || minStockLevel < 0) errors.minStockLevel = 'Enter a whole number, zero or greater.'
    else values.minStockLevel = minStockLevel
  }

  // A stock_quantity change must say WHY — that's the entire point of the
  // movement ledger (see PHASE5_PLAN.md, Decision 1). Every other field on
  // this route is metadata that doesn't need a reason.
  let reason = null
  if (addQuantity != null && !errors.addQuantity) reason = 'RESTOCK'
  else if ('stockQuantity' in values) {
    reason = normalize(request.body.reason).toUpperCase()
    if (!manualMovementReasons.has(reason)) errors.reason = 'Select why stock is changing: restock, reject, or recount.'
  }

  if (Object.keys(errors).length) return response.status(422).json({ message: 'Please correct the highlighted fields.', errors })
  if (Object.keys(values).length === 0 && addQuantity == null) return response.status(422).json({ message: 'Provide at least one field to update.' })

  const note = request.body.note == null ? null : normalize(request.body.note).slice(0, 500) || null

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // The authoritative read, INSIDE the transaction and holding the row
    // until it commits. The existence check above deliberately doesn't
    // supply this figure: it ran outside any transaction, so an order
    // could sell through between it and the write below, and the ledger
    // delta computed from it would then be wrong — measured: stock 20,
    // an order sells 3 (genuinely 17), admin sets 25, and the movement
    // logged +5 when stock actually moved +8. SUM(quantity_change) would
    // no longer reconcile to stock_quantity, which is the one invariant
    // the ledger exists to uphold.
    //
    // Note this locks the row but still writes stock_quantity ABSOLUTELY,
    // unlike the relative deduction in routes/orders.js. That's correct
    // for this route specifically: an admin typing 25 is stating "the
    // shelf has 25", a fact about the world that supersedes whatever the
    // system believed. The lock isn't there to preserve a concurrent
    // order's arithmetic — it's there so the MOVEMENT ROW accurately
    // describes the change that actually happened.
    const locked = await client.query('SELECT inventory_id, stock_quantity FROM inventory WHERE product_id = $1 FOR UPDATE', [productId])
    if (!locked.rows[0]) {
      await client.query('ROLLBACK')
      return response.status(404).json({ message: 'Product not found.' })
    }
    const current = locked.rows[0]
    if (addQuantity != null) values.stockQuantity = current.stock_quantity + addQuantity

    // Judged against the LOCKED figure, for the same reason the ledger row
    // below is: the direction of the change is only knowable once the
    // starting point cannot move under it.
    if ('stockQuantity' in values) {
      const direction = Math.sign(values.stockQuantity - current.stock_quantity)
      const expected = reasonDirection[reason]
      if (expected && direction !== 0 && direction !== expected) {
        await client.query('ROLLBACK')
        const message = expected > 0
          ? `A restock adds stock — the new quantity is below the current ${current.stock_quantity}. Use reject, or a recount, for a decrease.`
          : `${reason.toLowerCase().replaceAll('_', ' ')} removes stock — the new quantity is above the current ${current.stock_quantity}. Use restock, or a recount, for an increase.`
        return response.status(422).json({ message, errors: { reason: message } })
      }
    }

    // stock_quantity and min_stock_level are NOT NULL columns where an
    // omitted field is never intentionally null, so plain COALESCE is safe.
    const updated = await client.query(
      `UPDATE inventory
       SET stock_quantity = COALESCE($1, stock_quantity),
           min_stock_level = COALESCE($2, min_stock_level),
           standard_stock = COALESCE($4, standard_stock),
           target_stock = COALESCE($5, target_stock),
           last_updated = CURRENT_TIMESTAMP
       WHERE product_id = $3
       RETURNING stock_quantity, min_stock_level`,
      [values.stockQuantity ?? null, values.minStockLevel ?? null, productId, values.standardStock ?? null, values.targetStock ?? null],
    )

    // Only stock_quantity changes get a ledger row — min_stock_level is a
    // threshold, not stock itself, so
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
