// Ingredient inventory — Phase 9A (see PHASE9A_DATA_FOUNDATION_PLAN.md,
// Decisions 1–3 and 7). Raw materials and their movement ledger. Mounted
// at /api/ingredients in app.js.
//
// ADMIN and CASHIER may read; every write is ADMIN. There is no
// propose/approve step here — ingredient corrections are the admin's own
// action, the way the finished-goods direct edit is — and production
// consumes ingredients through routes/production.js, never through this
// file.
//
// The one rule, copied from finished goods: ingredients.stock_quantity is
// never written without an ingredient_movements row in the same
// transaction, and SUM(quantity_change) per ingredient equals it.
import express from 'express'
import { pool } from '../db.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { normalize, parseId, parseQuantity } from '../lib/validation.js'

const router = express.Router()

// Units the bakery measures in. Validated in code rather than an enum so
// adding one is a line here, not a migration.
const units = new Set(['kg', 'g', 'L', 'mL', 'pc', 'pack', 'sack', 'dozen'])
const adjustReasons = new Set(['WASTE', 'CORRECTION'])
const noteMaxLength = 500
const defaultMovementsLimit = 50
const maxMovementsLimit = 200

const mapIngredientRow = (row) => ({
  id: row.ingredient_id,
  name: row.name,
  unit: row.unit,
  stockQuantity: row.stock_quantity,
  minStockLevel: row.min_stock_level,
  averageUnitCost: row.average_unit_cost,
  isActive: row.is_active,
  // Computed, never stored — same rule the finished-goods list follows.
  lowStock: Number(row.stock_quantity) <= Number(row.min_stock_level),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const ingredientSelectQuery = `SELECT ingredient_id, name, unit, stock_quantity, min_stock_level, average_unit_cost, is_active, created_at, updated_at
     FROM ingredients`

const mapMovementRow = (row) => ({
  id: row.movement_id,
  ingredientId: row.ingredient_id,
  batchId: row.batch_id,
  quantityChange: row.quantity_change,
  reason: row.reason,
  unitCost: row.unit_cost,
  note: row.note,
  changedByName: row.changed_by_name,
  dataSource: row.data_source,
  createdAt: row.created_at,
})

// Validates whichever of name/unit/minStockLevel are present — one
// function for creation (partial: false) and PATCH (partial: true), the
// shape routes/products.js uses.
function validateIngredientFields(body, { partial }) {
  const errors = {}
  const values = {}
  const has = (field) => !partial || field in body

  if (has('name')) {
    const name = normalize(body.name)
    if (!name || name.length > 150) errors.name = 'Enter an ingredient name (1-150 characters).'
    else values.name = name
  }
  if (has('unit')) {
    const unit = normalize(body.unit)
    if (!units.has(unit)) errors.unit = `Unit must be one of: ${[...units].join(', ')}.`
    else values.unit = unit
  }
  if ('minStockLevel' in body) {
    const minStockLevel = parseQuantity(body.minStockLevel, { allowZero: true })
    if (minStockLevel === null) errors.minStockLevel = 'Enter a quantity, zero or greater, with up to three decimals.'
    else values.minStockLevel = minStockLevel
  }
  if ('isActive' in body) {
    if (typeof body.isActive !== 'boolean') errors.isActive = 'isActive must be true or false.'
    else values.isActive = body.isActive
  }
  return { errors, values }
}

router.use(requireAuth, requireRole('ADMIN', 'CASHIER'))

router.get('/', async (request, response) => {
  const includeInactive = request.query.includeInactive === 'true'
  const result = await pool.query(`${ingredientSelectQuery} ${includeInactive ? '' : 'WHERE is_active = TRUE'} ORDER BY name`)
  return response.json({ ingredients: result.rows.map(mapIngredientRow) })
})

router.get('/:id/movements', async (request, response) => {
  const ingredientId = parseId(request.params.id)
  if (!ingredientId) return response.status(404).json({ message: 'Ingredient not found.' })
  const exists = await pool.query('SELECT 1 FROM ingredients WHERE ingredient_id = $1', [ingredientId])
  if (!exists.rows[0]) return response.status(404).json({ message: 'Ingredient not found.' })

  const limit = Math.min(Math.max(Math.trunc(Number(request.query.limit)) || defaultMovementsLimit, 1), maxMovementsLimit)
  const offset = Math.max(Math.trunc(Number(request.query.offset)) || 0, 0)
  const result = await pool.query(
    `SELECT m.movement_id, m.ingredient_id, m.batch_id, m.quantity_change, m.reason, m.unit_cost, m.note, m.data_source, m.created_at,
            COALESCE(a.name, ca.name) AS changed_by_name,
            COUNT(*) OVER()::int AS full_count
       FROM ingredient_movements m
       LEFT JOIN admins a ON a.user_id = m.changed_by
       LEFT JOIN cashiers ca ON ca.user_id = m.changed_by
      WHERE m.ingredient_id = $1
      ORDER BY m.created_at DESC, m.movement_id DESC
      LIMIT $2 OFFSET $3`,
    [ingredientId, limit, offset],
  )
  const total = result.rows[0]?.full_count ?? 0
  return response.json({ movements: result.rows.map(mapMovementRow), total, hasMore: offset + result.rows.length < total })
})

router.post('/', requireRole('ADMIN'), async (request, response) => {
  const { errors, values } = validateIngredientFields(request.body, { partial: false })
  if (Object.keys(errors).length) return response.status(422).json({ message: 'Please correct the highlighted fields.', errors })

  try {
    const result = await pool.query(
      `INSERT INTO ingredients (name, unit, min_stock_level) VALUES ($1, $2, $3) RETURNING ingredient_id`,
      [values.name, values.unit, values.minStockLevel ?? '0'],
    )
    const created = await pool.query(`${ingredientSelectQuery} WHERE ingredient_id = $1`, [result.rows[0].ingredient_id])
    return response.status(201).json({ ingredient: mapIngredientRow(created.rows[0]) })
  } catch (error) {
    if (error.code === '23505') return response.status(409).json({ message: 'An ingredient with that name already exists.', errors: { name: 'An ingredient with that name already exists.' } })
    throw error
  }
})

router.patch('/:id', requireRole('ADMIN'), async (request, response) => {
  const ingredientId = parseId(request.params.id)
  if (!ingredientId) return response.status(404).json({ message: 'Ingredient not found.' })
  const exists = await pool.query('SELECT 1 FROM ingredients WHERE ingredient_id = $1', [ingredientId])
  if (!exists.rows[0]) return response.status(404).json({ message: 'Ingredient not found.' })

  const { errors, values } = validateIngredientFields(request.body, { partial: true })
  if (Object.keys(errors).length) return response.status(422).json({ message: 'Please correct the highlighted fields.', errors })
  if (Object.keys(values).length === 0) return response.status(422).json({ message: 'Provide at least one field to update.' })

  try {
    await pool.query(
      `UPDATE ingredients
          SET name = COALESCE($1, name), unit = COALESCE($2, unit),
              min_stock_level = COALESCE($3, min_stock_level), is_active = COALESCE($4, is_active)
        WHERE ingredient_id = $5`,
      [values.name ?? null, values.unit ?? null, values.minStockLevel ?? null, values.isActive ?? null, ingredientId],
    )
  } catch (error) {
    if (error.code === '23505') return response.status(409).json({ message: 'An ingredient with that name already exists.', errors: { name: 'An ingredient with that name already exists.' } })
    throw error
  }
  const updated = await pool.query(`${ingredientSelectQuery} WHERE ingredient_id = $1`, [ingredientId])
  return response.json({ ingredient: mapIngredientRow(updated.rows[0]) })
})

// POST /api/ingredients/:id/purchase — stock in, with what it cost. The
// moving average (Decision 3) is recomputed under the row lock:
//   new_average = (stock × average + q × c) / (stock + q)
// in Postgres NUMERIC, never in JavaScript floating point.
router.post('/:id/purchase', requireRole('ADMIN'), async (request, response) => {
  const ingredientId = parseId(request.params.id)
  if (!ingredientId) return response.status(404).json({ message: 'Ingredient not found.' })

  const errors = {}
  const quantity = parseQuantity(request.body.quantity)
  if (quantity === null) errors.quantity = 'Enter a quantity greater than zero, with up to three decimals.'
  const unitCost = parseQuantity(request.body.unitCost, { decimals: 4, allowZero: true })
  if (unitCost === null) errors.unitCost = 'Enter the price paid per unit, zero or greater.'
  if (Object.keys(errors).length) return response.status(422).json({ message: 'Please correct the highlighted fields.', errors })
  const note = request.body.note == null ? null : normalize(request.body.note).slice(0, noteMaxLength) || null

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const locked = await client.query('SELECT stock_quantity, average_unit_cost, is_active FROM ingredients WHERE ingredient_id = $1 FOR UPDATE', [ingredientId])
    if (!locked.rows[0]) {
      await client.query('ROLLBACK')
      return response.status(404).json({ message: 'Ingredient not found.' })
    }
    if (!locked.rows[0].is_active) {
      await client.query('ROLLBACK')
      return response.status(409).json({ message: 'This ingredient is deactivated — reactivate it before recording a purchase.' })
    }
    await client.query(
      `UPDATE ingredients
          SET average_unit_cost = CASE WHEN stock_quantity + $2::numeric > 0
                                       THEN (stock_quantity * average_unit_cost + $2::numeric * $3::numeric) / (stock_quantity + $2::numeric)
                                       ELSE average_unit_cost END,
              stock_quantity = stock_quantity + $2::numeric
        WHERE ingredient_id = $1`,
      [ingredientId, quantity, unitCost],
    )
    await client.query(
      `INSERT INTO ingredient_movements (ingredient_id, changed_by, quantity_change, reason, unit_cost, note)
       VALUES ($1, $2, $3::numeric, 'PURCHASE', $4::numeric, $5)`,
      [ingredientId, request.user.id, quantity, unitCost, note],
    )
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
  const updated = await pool.query(`${ingredientSelectQuery} WHERE ingredient_id = $1`, [ingredientId])
  return response.status(201).json({ ingredient: mapIngredientRow(updated.rows[0]) })
})

// POST /api/ingredients/:id/adjust — WASTE (must remove stock) or
// CORRECTION (either way, a recount). The conditional UPDATE is the
// "not enough stock" guard, the same idiom every stock write uses.
router.post('/:id/adjust', requireRole('ADMIN'), async (request, response) => {
  const ingredientId = parseId(request.params.id)
  if (!ingredientId) return response.status(404).json({ message: 'Ingredient not found.' })

  const errors = {}
  const reason = normalize(request.body.reason).toUpperCase()
  if (!adjustReasons.has(reason)) errors.reason = 'Reason must be WASTE or CORRECTION.'
  const quantityChange = parseQuantity(request.body.quantityChange, { min: -999999999 })
  if (quantityChange === null) errors.quantityChange = 'Enter a non-zero quantity with up to three decimals.'
  else if (reason === 'WASTE' && Number(quantityChange) > 0) errors.quantityChange = 'Waste removes stock — enter a negative quantity.'
  if (Object.keys(errors).length) return response.status(422).json({ message: 'Please correct the highlighted fields.', errors })
  const note = request.body.note == null ? null : normalize(request.body.note).slice(0, noteMaxLength) || null

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const locked = await client.query('SELECT stock_quantity FROM ingredients WHERE ingredient_id = $1 FOR UPDATE', [ingredientId])
    if (!locked.rows[0]) {
      await client.query('ROLLBACK')
      return response.status(404).json({ message: 'Ingredient not found.' })
    }
    const updated = await client.query(
      `UPDATE ingredients SET stock_quantity = stock_quantity + $2::numeric
        WHERE ingredient_id = $1 AND stock_quantity + $2::numeric >= 0
      RETURNING stock_quantity`,
      [ingredientId, quantityChange],
    )
    if (updated.rowCount === 0) {
      await client.query('ROLLBACK')
      return response.status(409).json({ message: `Only ${locked.rows[0].stock_quantity} in stock — the adjustment would drive it negative.`, errors: { quantityChange: 'More than is in stock.' } })
    }
    await client.query(
      `INSERT INTO ingredient_movements (ingredient_id, changed_by, quantity_change, reason, note) VALUES ($1, $2, $3::numeric, $4, $5)`,
      [ingredientId, request.user.id, quantityChange, reason, note],
    )
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
  const result = await pool.query(`${ingredientSelectQuery} WHERE ingredient_id = $1`, [ingredientId])
  return response.status(201).json({ ingredient: mapIngredientRow(result.rows[0]) })
})

export default router
