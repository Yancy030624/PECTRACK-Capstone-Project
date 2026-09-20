// Production batches — Phase 9A (PHASE9A_DATA_FOUNDATION_PLAN.md,
// Decisions 5–7 and 9). Mounted at /api/production in app.js.
//
// A batch runs one recipe, says what went in (ingredient lines), what came
// out in the recipe's base unit (produced, lost), and how the produced
// base units were packed into sellable products (outputs). It is PROPOSED
// by whoever is at the oven (CASHIER or ADMIN) and APPROVED by an ADMIN —
// the same propose/approve gate inventory_change_requests has — and only
// approval moves stock. An ADMIN's own batch is approved in the same
// request; there is nobody above them to wait for.
//
// Approval is the one place in the app that writes BOTH ledgers. Lock
// order is fixed and recorded here so any future route touching both takes
// them the same way: the batch row, then every ingredient row ordered by
// ingredient_id, then every output product's inventory row ordered by
// product_id. (The ABBA lesson from PHASE7_PLAN.md, Decision 2.)
import express from 'express'
import { pool } from '../db.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { syncStockAlert } from '../lib/inventory.js'
import { dateRangeSql, parseDateRange } from '../lib/reporting.js'
import { normalize, parseId, parseQuantity } from '../lib/validation.js'

const router = express.Router()

const noteMaxLength = 500
const batchStatuses = new Set(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'])
const defaultLimit = 50
const maxLimit = 200

const mapBatchRow = (row) => ({
  id: row.batch_id,
  recipeId: row.recipe_id,
  recipeName: row.recipe_name,
  baseUnit: row.base_unit,
  plannedQuantity: row.planned_quantity,
  producedQuantity: row.produced_quantity,
  lossQuantity: row.loss_quantity,
  totalCost: row.total_cost,
  status: row.status,
  // The recorder's user id, so the screen can offer Withdraw only on a
  // cashier's own pending batch — the same rule PATCH /:id enforces.
  recordedById: row.recorded_by,
  recordedByName: row.recorded_by_name,
  reviewedByName: row.reviewed_by_name,
  reviewedAt: row.reviewed_at,
  reviewerNote: row.reviewer_note,
  producedAt: row.produced_at,
  note: row.note,
  dataSource: row.data_source,
  createdAt: row.created_at,
})

const batchSelectQuery = `SELECT b.batch_id, b.recipe_id, b.recipe_name, b.base_unit, b.planned_quantity, b.produced_quantity, b.loss_quantity,
            b.total_cost, b.status, b.reviewed_at, b.reviewer_note, b.produced_at, b.note, b.data_source, b.created_at, b.recorded_by,
            COALESCE(ra.name, rc.name) AS recorded_by_name, va.name AS reviewed_by_name
       FROM production_batches b
       LEFT JOIN admins ra ON ra.user_id = b.recorded_by
       LEFT JOIN cashiers rc ON rc.user_id = b.recorded_by
       LEFT JOIN admins va ON va.user_id = b.reviewed_by`

async function loadBatchDetail(batchId) {
  const batchResult = await pool.query(`${batchSelectQuery} WHERE b.batch_id = $1`, [batchId])
  const batch = batchResult.rows[0]
  if (!batch) return null
  const [lines, outputs] = await Promise.all([
    pool.query(
      `SELECT bi.ingredient_id, i.name, i.unit, bi.quantity_used, bi.unit_cost,
              (bi.quantity_used * bi.unit_cost)::numeric(12, 2) AS line_cost
         FROM production_batch_ingredients bi JOIN ingredients i ON i.ingredient_id = bi.ingredient_id
        WHERE bi.batch_id = $1 ORDER BY i.name`,
      [batchId],
    ),
    pool.query(
      `SELECT bo.product_id, p.product_name, p.variant, bo.quantity, bo.units_per_item,
              (bo.quantity * bo.units_per_item)::numeric(12, 3) AS base_units
         FROM production_batch_outputs bo JOIN products p ON p.product_id = bo.product_id
        WHERE bo.batch_id = $1 ORDER BY p.product_name, p.variant`,
      [batchId],
    ),
  ])
  const produced = Number(batch.produced_quantity)
  const costPerBaseUnit = batch.status === 'APPROVED' && produced > 0 ? Number(batch.total_cost) / produced : null
  return {
    ...mapBatchRow(batch),
    ingredients: lines.rows.map((row) => ({ ingredientId: row.ingredient_id, name: row.name, unit: row.unit, quantityUsed: row.quantity_used, unitCost: row.unit_cost, lineCost: row.line_cost })),
    outputs: outputs.rows.map((row) => ({
      productId: row.product_id,
      name: row.product_name,
      variant: row.variant,
      quantity: row.quantity,
      unitsPerItem: row.units_per_item,
      baseUnits: row.base_units,
      // Cost per packed item: the batch's cost per base unit times the
      // ratio snapshotted on this line. Display-only, two decimals.
      unitCost: costPerBaseUnit == null ? null : (costPerBaseUnit * Number(row.units_per_item)).toFixed(2),
    })),
    costPerBaseUnit: costPerBaseUnit == null ? null : costPerBaseUnit.toFixed(4),
  }
}

// ---------------------------------------------------------------------------
// The approval transaction — shared by PATCH /:id (an admin approving a
// cashier's batch) and POST / (an admin whose own batch is approved on the
// spot). `client` must already be inside BEGIN. Returns null on success or
// a { status, body } refusal; the caller rolls back on refusal.
// ---------------------------------------------------------------------------
async function applyBatch(client, batchId, reviewerUserId) {
  // Step 1 — claim. The conditional UPDATE is what makes approval happen
  // at most once; two admins clicking together resolve on this row lock.
  const claimed = await client.query(
    `UPDATE production_batches SET status = 'APPROVED', reviewed_by = $2, reviewed_at = CURRENT_TIMESTAMP
      WHERE batch_id = $1 AND status = 'PENDING'
    RETURNING batch_id, produced_quantity`,
    [batchId, reviewerUserId],
  )
  if (claimed.rowCount === 0) return { status: 409, body: { message: 'This batch has already been reviewed.' } }

  // Step 2 — ingredients, locked in id order. The conditional deduction is
  // the "not enough" guard; the first shortfall rolls the whole batch back.
  const lines = await client.query(
    `SELECT bi.ingredient_id, bi.quantity_used, i.name, i.stock_quantity, i.average_unit_cost, i.is_active
       FROM production_batch_ingredients bi JOIN ingredients i ON i.ingredient_id = bi.ingredient_id
      WHERE bi.batch_id = $1 ORDER BY bi.ingredient_id FOR UPDATE OF i`,
    [batchId],
  )
  for (const line of lines.rows) {
    const deducted = await client.query(
      `UPDATE ingredients SET stock_quantity = stock_quantity - $2::numeric
        WHERE ingredient_id = $1 AND stock_quantity >= $2::numeric
      RETURNING average_unit_cost`,
      [line.ingredient_id, line.quantity_used],
    )
    if (deducted.rowCount === 0) {
      return { status: 409, body: { message: `Not enough ${line.name}: the batch needs ${line.quantity_used} and ${line.stock_quantity} is in stock. Record a purchase first.`, errors: { ingredients: `Not enough ${line.name}.` } } }
    }
    const unitCost = deducted.rows[0].average_unit_cost
    await client.query('UPDATE production_batch_ingredients SET unit_cost = $3 WHERE batch_id = $1 AND ingredient_id = $2', [batchId, line.ingredient_id, unitCost])
    await client.query(
      `INSERT INTO ingredient_movements (ingredient_id, batch_id, changed_by, quantity_change, reason, unit_cost)
       VALUES ($1, $2, $3, -$4::numeric, 'PRODUCTION_USE', $5)`,
      [line.ingredient_id, batchId, reviewerUserId, line.quantity_used, unitCost],
    )
  }

  // Step 3 — the cost, summed in NUMERIC from the snapshotted lines.
  await client.query(
    `UPDATE production_batches SET total_cost = (
       SELECT COALESCE(SUM(quantity_used * unit_cost), 0)::numeric(12, 2) FROM production_batch_ingredients WHERE batch_id = $1
     ) WHERE batch_id = $1`,
    [batchId],
  )

  // Step 4 — finished goods, locked in product id order. A plain increment
  // (adding stock can never violate the CHECK), one PRODUCTION ledger row
  // per output pointing at this batch, and the same alert sync every other
  // stock write performs.
  const outputs = await client.query(
    `SELECT bo.product_id, bo.quantity FROM production_batch_outputs bo WHERE bo.batch_id = $1 ORDER BY bo.product_id`,
    [batchId],
  )
  for (const output of outputs.rows) {
    const stocked = await client.query(
      `UPDATE inventory SET stock_quantity = stock_quantity + $2, last_updated = CURRENT_TIMESTAMP
        WHERE product_id = $1 RETURNING inventory_id, stock_quantity, min_stock_level`,
      [output.product_id, output.quantity],
    )
    if (stocked.rowCount === 0) return { status: 409, body: { message: `Product ${output.product_id} has no inventory row.` } }
    await client.query(
      `INSERT INTO inventory_movements (inventory_id, batch_id, changed_by, quantity_change, reason) VALUES ($1, $2, $3, $4, 'PRODUCTION')`,
      [stocked.rows[0].inventory_id, batchId, reviewerUserId, output.quantity],
    )
    await syncStockAlert(client, { inventoryId: stocked.rows[0].inventory_id, stockQuantity: stocked.rows[0].stock_quantity, minStockLevel: stocked.rows[0].min_stock_level })
  }
  return null
}

router.use(requireAuth, requireRole('ADMIN', 'CASHIER'))

router.get('/', async (request, response) => {
  const filters = []
  const params = []
  if (request.query.status != null) {
    const status = normalize(request.query.status).toUpperCase()
    if (!batchStatuses.has(status)) return response.status(422).json({ message: 'Enter a valid batch status.', errors: { status: 'Enter a valid batch status.' } })
    params.push(status)
    filters.push(`b.status = $${params.length}`)
  }
  if ('from' in request.query || 'to' in request.query) {
    const { from, to, errors } = parseDateRange(request.query)
    if (Object.keys(errors).length) return response.status(422).json({ message: 'Please correct the highlighted fields.', errors })
    params.push(from, to)
    filters.push(dateRangeSql('b.produced_at', { fromParam: `$${params.length - 1}`, toParam: `$${params.length}` }))
  }
  if (request.query.recipeId != null) {
    const recipeId = parseId(request.query.recipeId)
    if (!recipeId) return response.status(422).json({ message: 'Select a valid recipe.', errors: { recipeId: 'Select a valid recipe.' } })
    params.push(recipeId)
    filters.push(`b.recipe_id = $${params.length}`)
  }
  const limit = Math.min(Math.max(Math.trunc(Number(request.query.limit)) || defaultLimit, 1), maxLimit)
  const offset = Math.max(Math.trunc(Number(request.query.offset)) || 0, 0)
  params.push(limit, offset)

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : ''
  const result = await pool.query(
    `${batchSelectQuery.replace('SELECT b.batch_id', 'SELECT COUNT(*) OVER()::int AS full_count, b.batch_id')}
      ${whereClause}
      ORDER BY b.created_at DESC, b.batch_id DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  )
  const total = result.rows[0]?.full_count ?? 0
  const batches = await Promise.all(result.rows.map((row) => loadBatchDetail(row.batch_id)))
  return response.json({ batches, total, hasMore: offset + result.rows.length < total })
})

router.get('/:id', async (request, response) => {
  const batchId = parseId(request.params.id)
  if (!batchId) return response.status(404).json({ message: 'Batch not found.' })
  const batch = await loadBatchDetail(batchId)
  if (!batch) return response.status(404).json({ message: 'Batch not found.' })
  return response.json({ batch })
})

// POST /api/production — propose a batch. Validates everything the
// approval will rely on, so a PENDING batch is always applicable as far
// as its own shape goes (stock levels are checked at approval, when they
// matter). Ingredient lines omitted = the recipe scaled to plannedQuantity.
router.post('/', async (request, response) => {
  const errors = {}
  const recipeId = parseId(request.body.recipeId)
  if (!recipeId) errors.recipeId = 'Select a recipe.'
  const plannedQuantity = parseQuantity(request.body.plannedQuantity)
  if (plannedQuantity === null) errors.plannedQuantity = 'Enter the base units this batch was meant to make, greater than zero.'
  const producedQuantity = parseQuantity(request.body.producedQuantity, { allowZero: true })
  if (producedQuantity === null) errors.producedQuantity = 'Enter the base units that came out good, zero or greater.'
  const lossQuantity = request.body.lossQuantity == null || request.body.lossQuantity === '' ? '0' : parseQuantity(request.body.lossQuantity, { allowZero: true })
  if (lossQuantity === null) errors.lossQuantity = 'Enter the base units lost, zero or greater.'
  const note = request.body.note == null ? null : normalize(request.body.note).slice(0, noteMaxLength) || null

  let producedAt = null
  if (request.body.producedAt != null && request.body.producedAt !== '') {
    producedAt = new Date(request.body.producedAt)
    if (Number.isNaN(producedAt.getTime())) errors.producedAt = 'Enter a valid date and time.'
    else if (producedAt.getTime() > Date.now() + 5 * 60 * 1000) errors.producedAt = 'A batch cannot be recorded for the future.'
  }
  if (Object.keys(errors).length) return response.status(422).json({ message: 'Please correct the highlighted fields.', errors })

  const recipeResult = await pool.query('SELECT recipe_id, name, base_unit, yield_quantity, is_active FROM recipes WHERE recipe_id = $1', [recipeId])
  const recipe = recipeResult.rows[0]
  if (!recipe) return response.status(422).json({ message: 'Selected recipe does not exist.', errors: { recipeId: 'Selected recipe does not exist.' } })
  if (!recipe.is_active) return response.status(422).json({ message: 'This recipe is deactivated.', errors: { recipeId: 'This recipe is deactivated.' } })

  // Ingredient lines: supplied, or the recipe scaled to the planned size.
  const recipeLines = await pool.query(
    `SELECT ri.ingredient_id, ri.quantity, i.is_active FROM recipe_ingredients ri JOIN ingredients i ON i.ingredient_id = ri.ingredient_id WHERE ri.recipe_id = $1`,
    [recipeId],
  )
  const recipeByIngredient = new Map(recipeLines.rows.map((row) => [row.ingredient_id, row]))
  let lines
  if (Array.isArray(request.body.ingredients) && request.body.ingredients.length > 0) {
    lines = new Map()
    for (const line of request.body.ingredients) {
      const ingredientId = parseId(line?.ingredientId)
      const quantityUsed = parseQuantity(line?.quantityUsed)
      if (!ingredientId || quantityUsed === null) return response.status(422).json({ message: 'Each ingredient line needs an ingredient and a quantity greater than zero.', errors: { ingredients: 'Each ingredient line needs an ingredient and a quantity greater than zero.' } })
      if (!recipeByIngredient.has(ingredientId)) return response.status(422).json({ message: 'An ingredient line is not part of this recipe.', errors: { ingredients: 'An ingredient line is not part of this recipe.' } })
      if (lines.has(ingredientId)) return response.status(422).json({ message: 'An ingredient is listed twice.', errors: { ingredients: 'An ingredient is listed twice.' } })
      lines.set(ingredientId, quantityUsed)
    }
  } else {
    // Scaled in Postgres so the three-decimal rounding is NUMERIC's, not
    // floating point's.
    const scaled = await pool.query(
      `SELECT ingredient_id, ROUND(quantity * $2::numeric / $3::numeric, 3) AS quantity FROM recipe_ingredients WHERE recipe_id = $1`,
      [recipeId, plannedQuantity, recipe.yield_quantity],
    )
    lines = new Map(scaled.rows.map((row) => [row.ingredient_id, row.quantity]))
  }
  if (lines.size === 0) return response.status(422).json({ message: 'This recipe has no ingredients yet.', errors: { recipeId: 'This recipe has no ingredients yet.' } })
  for (const [ingredientId, quantity] of lines) {
    if (Number(quantity) <= 0) return response.status(422).json({ message: 'A scaled ingredient quantity rounded to zero — plan a larger batch.', errors: { plannedQuantity: 'Too small for this recipe.' } })
    if (!recipeByIngredient.get(ingredientId).is_active) return response.status(422).json({ message: 'One of the recipe\'s ingredients is deactivated.', errors: { ingredients: 'One of the recipe\'s ingredients is deactivated.' } })
  }

  // Outputs: every product must be mapped to this recipe, and the packed
  // base units must equal producedQuantity exactly — the route refuses a
  // mismatch rather than guessing where the difference went.
  const rawOutputs = Array.isArray(request.body.outputs) ? request.body.outputs : []
  if (rawOutputs.length === 0 && Number(producedQuantity) > 0) return response.status(422).json({ message: 'Say how the produced quantity was packed.', errors: { outputs: 'Add at least one output.' } })
  const outputs = new Map()
  for (const output of rawOutputs) {
    const productId = parseId(output?.productId)
    const quantity = Number(output?.quantity)
    if (!productId || !Number.isInteger(quantity) || quantity <= 0) return response.status(422).json({ message: 'Each output needs a product and a whole-number quantity greater than zero.', errors: { outputs: 'Each output needs a product and a whole-number quantity greater than zero.' } })
    if (outputs.has(productId)) return response.status(422).json({ message: 'A product is listed twice in the outputs.', errors: { outputs: 'A product is listed twice.' } })
    outputs.set(productId, quantity)
  }
  let packedBaseUnits = 0
  const outputRows = []
  if (outputs.size > 0) {
    const products = await pool.query('SELECT product_id, units_per_item FROM products WHERE product_id = ANY($1::bigint[]) AND recipe_id = $2', [[...outputs.keys()], recipeId])
    if (products.rowCount !== outputs.size) return response.status(422).json({ message: 'Every output product must be mapped to this recipe (Product Management → recipe and units per item).', errors: { outputs: 'A product is not mapped to this recipe.' } })
    for (const row of products.rows) {
      const quantity = outputs.get(row.product_id)
      outputRows.push({ productId: row.product_id, quantity, unitsPerItem: row.units_per_item })
      packedBaseUnits += quantity * Number(row.units_per_item)
    }
  }
  // Compared to three decimals — the precision both figures are stored at.
  if (Math.abs(packedBaseUnits - Number(producedQuantity)) >= 0.0005) {
    return response.status(422).json({ message: `The outputs pack ${packedBaseUnits.toFixed(3)} ${recipe.base_unit} but the batch produced ${producedQuantity}. Adjust the outputs or the produced quantity — or record the difference as loss.`, errors: { outputs: 'Packed base units must equal the produced quantity.' } })
  }

  const isAdmin = request.user.role === 'ADMIN'
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const created = await client.query(
      `INSERT INTO production_batches (recipe_id, recipe_name, base_unit, planned_quantity, produced_quantity, loss_quantity, recorded_by, produced_at, note)
       VALUES ($1, $2, $3, $4::numeric, $5::numeric, $6::numeric, $7, COALESCE($8, CURRENT_TIMESTAMP), $9)
       RETURNING batch_id`,
      [recipeId, recipe.name, recipe.base_unit, plannedQuantity, producedQuantity, lossQuantity, request.user.id, producedAt, note],
    )
    const batchId = created.rows[0].batch_id
    for (const [ingredientId, quantity] of lines) {
      await client.query('INSERT INTO production_batch_ingredients (batch_id, ingredient_id, quantity_used) VALUES ($1, $2, $3::numeric)', [batchId, ingredientId, quantity])
    }
    for (const output of outputRows) {
      await client.query('INSERT INTO production_batch_outputs (batch_id, product_id, quantity, units_per_item) VALUES ($1, $2, $3, $4)', [batchId, output.productId, output.quantity, output.unitsPerItem])
    }
    // An admin's own batch is approved here, in the same transaction — the
    // proposal and its approval are one event when the proposer is the
    // approver.
    if (isAdmin) {
      const refused = await applyBatch(client, batchId, request.user.id)
      if (refused) {
        await client.query('ROLLBACK')
        return response.status(refused.status).json(refused.body)
      }
    }
    await client.query('COMMIT')
    return response.status(201).json({ batch: await loadBatchDetail(batchId) })
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
})

// PATCH /api/production/:id — ADMIN approves or rejects a PENDING batch;
// the CASHIER who proposed it may withdraw it (CANCELLED) while PENDING.
router.patch('/:id', async (request, response) => {
  const batchId = parseId(request.params.id)
  if (!batchId) return response.status(404).json({ message: 'Batch not found.' })
  const decision = normalize(request.body.status).toUpperCase()
  const reviewerNote = request.body.reviewerNote == null ? null : normalize(request.body.reviewerNote).slice(0, noteMaxLength) || null

  if (request.user.role === 'CASHIER') {
    if (decision !== 'CANCELLED') return response.status(403).json({ message: 'Only an admin can approve or reject a batch — you can withdraw your own pending one.' })
    const withdrawn = await pool.query(
      `UPDATE production_batches SET status = 'CANCELLED', reviewed_at = CURRENT_TIMESTAMP
        WHERE batch_id = $1 AND status = 'PENDING' AND recorded_by = $2 RETURNING batch_id`,
      [batchId, request.user.id],
    )
    if (withdrawn.rowCount === 0) {
      const owns = await pool.query('SELECT 1 FROM production_batches WHERE batch_id = $1 AND recorded_by = $2', [batchId, request.user.id])
      if (!owns.rows[0]) return response.status(404).json({ message: 'Batch not found.' })
      return response.status(409).json({ message: 'This batch has already been reviewed.' })
    }
    return response.json({ batch: await loadBatchDetail(batchId) })
  }

  if (decision !== 'APPROVED' && decision !== 'REJECTED') return response.status(422).json({ message: 'Enter a valid decision.', errors: { status: 'status must be APPROVED or REJECTED.' } })
  const existing = await pool.query('SELECT status FROM production_batches WHERE batch_id = $1', [batchId])
  if (!existing.rows[0]) return response.status(404).json({ message: 'Batch not found.' })
  if (existing.rows[0].status !== 'PENDING') return response.status(409).json({ message: 'This batch has already been reviewed.' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    if (decision === 'REJECTED') {
      const rejected = await client.query(
        `UPDATE production_batches SET status = 'REJECTED', reviewed_by = $2, reviewed_at = CURRENT_TIMESTAMP, reviewer_note = $3
          WHERE batch_id = $1 AND status = 'PENDING' RETURNING batch_id`,
        [batchId, request.user.id, reviewerNote],
      )
      if (rejected.rowCount === 0) {
        await client.query('ROLLBACK')
        return response.status(409).json({ message: 'This batch has already been reviewed.' })
      }
    } else {
      const refused = await applyBatch(client, batchId, request.user.id)
      if (refused) {
        await client.query('ROLLBACK')
        return response.status(refused.status).json(refused.body)
      }
      if (reviewerNote) await client.query('UPDATE production_batches SET reviewer_note = $2 WHERE batch_id = $1', [batchId, reviewerNote])
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
  return response.json({ batch: await loadBatchDetail(batchId) })
})

export default router
