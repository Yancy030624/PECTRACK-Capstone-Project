// Ingredient stock (CLIENT_REVISIONS_PLAN.md, R5). Flour, sugar, eggs and
// the rest, counted the way finished goods are: a current figure per
// ingredient and a signed ledger that always sums to it. STOCK ONLY — no
// recipes, batches or costing, and nothing deducts an ingredient
// automatically; staff record what came in, what was used, and what was
// thrown out. Mounted at /api/ingredients in app.js.
//
// Admin and cashier both record movements, as with product stock (R1).
// Adding an ingredient and changing its name, unit or minimum stay with
// the admin, as product names and prices do.
import express from 'express'
import { pool } from '../db.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { normalize, parseId, parseQuantity } from '../lib/validation.js'

const router = express.Router()

// Validated in code rather than an enum: a new unit is a line here.
const units = ['kg', 'g', 'L', 'mL', 'pc', 'pack', 'sack', 'tray']
// The sign each reason gives the amount typed. CORRECTION is different: its
// amount is the counted figure, and the change is whatever it differs by.
const reasonSign = { RESTOCK: 1, USAGE: -1, REJECT: -1 }
const reasons = new Set([...Object.keys(reasonSign), 'CORRECTION'])
const noteMaxLength = 500
const defaultMovementsLimit = 50
const maxMovementsLimit = 200

const mapIngredientRow = (row) => ({
  id: row.ingredient_id,
  name: row.name,
  unit: row.unit,
  // NUMERIC as strings ("12.500"): exact, and formatted by the screen.
  stockQuantity: row.stock_quantity,
  minStockLevel: row.min_stock_level,
  isActive: row.is_active,
  // Computed, never stored — the same rule product stock follows.
  lowStock: Number(row.stock_quantity) <= Number(row.min_stock_level),
  updatedAt: row.updated_at,
})

const ingredientSelectQuery = 'SELECT ingredient_id, name, unit, stock_quantity, min_stock_level, is_active, updated_at FROM ingredients'

const mapMovementRow = (row) => ({
  id: row.movement_id,
  ingredientId: row.ingredient_id,
  ingredientName: row.ingredient_name,
  unit: row.unit,
  quantityChange: row.quantity_change,
  reason: row.reason,
  note: row.note,
  changedByName: row.changed_by_name,
  createdAt: row.created_at,
})

const readNote = (raw) => (raw == null ? null : normalize(raw).slice(0, noteMaxLength) || null)

// One validator for create (partial: false) and PATCH (partial: true).
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
    if (!units.includes(unit)) errors.unit = `Choose a unit: ${units.join(', ')}.`
    else values.unit = unit
  }
  if ('minStockLevel' in body) {
    const minStockLevel = parseQuantity(body.minStockLevel, { allowZero: true })
    if (minStockLevel === null) errors.minStockLevel = 'Enter an amount, zero or greater, with up to three decimals.'
    else values.minStockLevel = minStockLevel
  }
  if ('isActive' in body) {
    if (typeof body.isActive !== 'boolean') errors.isActive = 'isActive must be true or false.'
    else values.isActive = body.isActive
  }
  return { errors, values }
}

const duplicateName = { message: 'An ingredient with that name already exists.', errors: { name: 'An ingredient with that name already exists.' } }

router.use(requireAuth, requireRole('ADMIN', 'CASHIER'))

router.get('/', async (request, response) => {
  const includeInactive = request.query.includeInactive === 'true'
  const result = await pool.query(`${ingredientSelectQuery} ${includeInactive ? '' : 'WHERE is_active = TRUE'} ORDER BY name`)
  return response.json({ ingredients: result.rows.map(mapIngredientRow), units })
})

// GET /api/ingredients/movements?ingredientId=&limit=&offset= — the
// ledger, newest first; every ingredient, or one.
router.get('/movements', async (request, response) => {
  const ingredientId = request.query.ingredientId == null || request.query.ingredientId === '' ? null : parseId(request.query.ingredientId)
  if (request.query.ingredientId && !ingredientId) return response.status(404).json({ message: 'Ingredient not found.' })
  const limit = Math.min(Math.max(Math.trunc(Number(request.query.limit)) || defaultMovementsLimit, 1), maxMovementsLimit)
  const offset = Math.max(Math.trunc(Number(request.query.offset)) || 0, 0)
  const result = await pool.query(
    `SELECT m.movement_id, m.ingredient_id, i.name AS ingredient_name, i.unit, m.quantity_change, m.reason, m.note, m.created_at,
            COALESCE(a.name, ca.name) AS changed_by_name,
            COUNT(*) OVER()::int AS full_count
       FROM ingredient_movements m
       JOIN ingredients i ON i.ingredient_id = m.ingredient_id
       LEFT JOIN admins a ON a.user_id = m.changed_by
       LEFT JOIN cashiers ca ON ca.user_id = m.changed_by
      WHERE ($1::bigint IS NULL OR m.ingredient_id = $1)
      ORDER BY m.created_at DESC, m.movement_id DESC
      LIMIT $2 OFFSET $3`,
    [ingredientId, limit, offset],
  )
  const total = result.rows[0]?.full_count ?? 0
  return response.json({ movements: result.rows.map(mapMovementRow), total, hasMore: offset + result.rows.length < total })
})

// POST /api/ingredients — admin only. An optional opening `stockQuantity`
// is written as a CORRECTION ("Opening count"), so the ledger still sums
// to the figure from the very first row.
router.post('/', requireRole('ADMIN'), async (request, response) => {
  const { errors, values } = validateIngredientFields(request.body, { partial: false })
  let opening = null
  if (request.body.stockQuantity != null && request.body.stockQuantity !== '') {
    opening = parseQuantity(request.body.stockQuantity, { allowZero: true })
    if (opening === null) errors.stockQuantity = 'Enter an amount, zero or greater, with up to three decimals.'
  }
  if (Object.keys(errors).length) return response.status(422).json({ message: 'Please correct the highlighted fields.', errors })

  const client = await pool.connect()
  let ingredientId
  try {
    await client.query('BEGIN')
    const created = await client.query(
      'INSERT INTO ingredients (name, unit, min_stock_level, stock_quantity) VALUES ($1, $2, $3, $4) RETURNING ingredient_id',
      [values.name, values.unit, values.minStockLevel ?? '0', opening ?? '0'],
    )
    ingredientId = created.rows[0].ingredient_id
    if (opening !== null && Number(opening) > 0) {
      await client.query(
        `INSERT INTO ingredient_movements (ingredient_id, changed_by, quantity_change, reason, note) VALUES ($1, $2, $3::numeric, 'CORRECTION', 'Opening count')`,
        [ingredientId, request.user.id, opening],
      )
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    if (error.code === '23505') return response.status(409).json(duplicateName)
    throw error
  } finally {
    client.release()
  }
  const result = await pool.query(`${ingredientSelectQuery} WHERE ingredient_id = $1`, [ingredientId])
  return response.status(201).json({ ingredient: mapIngredientRow(result.rows[0]) })
})

// PATCH /api/ingredients/:id — admin only: name, unit, minimum, active.
// The stock figure is never set here; it moves only through a movement.
router.patch('/:id', requireRole('ADMIN'), async (request, response) => {
  const ingredientId = parseId(request.params.id)
  if (!ingredientId) return response.status(404).json({ message: 'Ingredient not found.' })
  const { errors, values } = validateIngredientFields(request.body, { partial: true })
  if (Object.keys(errors).length) return response.status(422).json({ message: 'Please correct the highlighted fields.', errors })
  if (Object.keys(values).length === 0) return response.status(422).json({ message: 'Provide at least one field to update.' })

  let result
  try {
    result = await pool.query(
      `UPDATE ingredients
          SET name = COALESCE($1, name), unit = COALESCE($2, unit),
              min_stock_level = COALESCE($3::numeric, min_stock_level), is_active = COALESCE($4, is_active)
        WHERE ingredient_id = $5
      RETURNING ingredient_id`,
      [values.name ?? null, values.unit ?? null, values.minStockLevel ?? null, values.isActive ?? null, ingredientId],
    )
  } catch (error) {
    if (error.code === '23505') return response.status(409).json(duplicateName)
    throw error
  }
  if (result.rowCount === 0) return response.status(404).json({ message: 'Ingredient not found.' })
  const updated = await pool.query(`${ingredientSelectQuery} WHERE ingredient_id = $1`, [ingredientId])
  return response.json({ ingredient: mapIngredientRow(updated.rows[0]) })
})

// POST /api/ingredients/:id/movements — admin and cashier.
//   { reason: 'RESTOCK' | 'USAGE' | 'REJECT', quantity: <amount> }
//   { reason: 'CORRECTION', quantity: <the counted figure> }
// The stock change and its ledger row are written together, under the
// ingredient's row lock. Removing more than is on hand is refused by the
// conditional UPDATE — the same guard product stock uses — so stock never
// goes below zero.
router.post('/:id/movements', async (request, response) => {
  const ingredientId = parseId(request.params.id)
  if (!ingredientId) return response.status(404).json({ message: 'Ingredient not found.' })

  const errors = {}
  const reason = normalize(request.body.reason).toUpperCase()
  if (!reasons.has(reason)) errors.reason = 'Choose what happened: restock, usage, reject, or recount.'
  const quantity = parseQuantity(request.body.quantity, { allowZero: reason === 'CORRECTION' })
  if (quantity === null) {
    errors.quantity = reason === 'CORRECTION'
      ? 'Enter the amount counted, zero or greater, with up to three decimals.'
      : 'Enter an amount greater than zero, with up to three decimals.'
  }
  if (Object.keys(errors).length) return response.status(422).json({ message: 'Please correct the highlighted fields.', errors })
  const note = readNote(request.body.note)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const locked = await client.query('SELECT stock_quantity, unit, is_active FROM ingredients WHERE ingredient_id = $1 FOR UPDATE', [ingredientId])
    const ingredient = locked.rows[0]
    if (!ingredient) {
      await client.query('ROLLBACK')
      return response.status(404).json({ message: 'Ingredient not found.' })
    }
    if (!ingredient.is_active) {
      await client.query('ROLLBACK')
      return response.status(409).json({ message: 'This ingredient is no longer in use. An admin can turn it back on first.' })
    }

    // The signed change, computed in Postgres NUMERIC, never in a float.
    const change = reason === 'CORRECTION'
      ? (await client.query('SELECT ($1::numeric - $2::numeric)::text AS change', [quantity, ingredient.stock_quantity])).rows[0].change
      : `${reasonSign[reason] < 0 ? '-' : ''}${quantity}`
    if (Number(change) === 0) {
      await client.query('ROLLBACK')
      return response.status(422).json({ message: 'That is already the amount on hand — nothing to record.', errors: { quantity: 'That is already the amount on hand.' } })
    }

    const updated = await client.query(
      `UPDATE ingredients SET stock_quantity = stock_quantity + $2::numeric
        WHERE ingredient_id = $1 AND stock_quantity + $2::numeric >= 0
      RETURNING stock_quantity`,
      [ingredientId, change],
    )
    if (updated.rowCount === 0) {
      await client.query('ROLLBACK')
      const onHand = `${Number(ingredient.stock_quantity)} ${ingredient.unit}`
      return response.status(409).json({ message: `Only ${onHand} on hand — that is more than there is.`, errors: { quantity: `Only ${onHand} on hand.` } })
    }
    await client.query(
      'INSERT INTO ingredient_movements (ingredient_id, changed_by, quantity_change, reason, note) VALUES ($1, $2, $3::numeric, $4, $5)',
      [ingredientId, request.user.id, change, reason, note],
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
