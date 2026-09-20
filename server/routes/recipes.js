// Recipes — Phase 9A (PHASE9A_DATA_FOUNDATION_PLAN.md, Decisions 4 and 6).
// A recipe is a dough: a named list of ingredient quantities per batch and
// a yield in a base unit of its own ("piece", "gram of dough"). Products
// map onto a recipe with products.units_per_item (routes/products.js
// PATCH), so one dough can be packed as a gallon, a pack and a plate.
// Mounted at /api/recipes in app.js.
//
// ADMIN writes; ADMIN and CASHIER read (the production form needs the
// list). Editing a recipe never rewrites history — every approved batch
// snapshots the quantities it actually used (routes/production.js).
import express from 'express'
import { pool } from '../db.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { normalize, parseId, parseQuantity } from '../lib/validation.js'

const router = express.Router()

const noteMaxLength = 500
const baseUnitMaxLength = 30

const mapRecipeRow = (row) => ({
  id: row.recipe_id,
  name: row.name,
  baseUnit: row.base_unit,
  yieldQuantity: row.yield_quantity,
  note: row.note,
  isActive: row.is_active,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

// The theoretical cost of one batch at today's average ingredient costs —
// computed in NUMERIC here, never stored. The recipe editor shows it next
// to each mapped product's price so an admin sees the effect of a flour
// price change before baking.
async function loadRecipeDetail(recipeId) {
  const recipeResult = await pool.query(
    `SELECT recipe_id, name, base_unit, yield_quantity, note, is_active, created_at, updated_at FROM recipes WHERE recipe_id = $1`,
    [recipeId],
  )
  const recipe = recipeResult.rows[0]
  if (!recipe) return null

  const [linesResult, productsResult, costResult] = await Promise.all([
    pool.query(
      `SELECT ri.ingredient_id, i.name, i.unit, ri.quantity, i.average_unit_cost, i.stock_quantity,
              (ri.quantity * i.average_unit_cost)::numeric(12, 2) AS line_cost
         FROM recipe_ingredients ri
         JOIN ingredients i ON i.ingredient_id = ri.ingredient_id
        WHERE ri.recipe_id = $1
        ORDER BY i.name`,
      [recipeId],
    ),
    pool.query(
      `SELECT product_id, product_name, variant, price, units_per_item FROM products WHERE recipe_id = $1 ORDER BY product_name, variant`,
      [recipeId],
    ),
    pool.query(
      `SELECT COALESCE(SUM(ri.quantity * i.average_unit_cost), 0)::numeric(12, 2) AS batch_cost
         FROM recipe_ingredients ri JOIN ingredients i ON i.ingredient_id = ri.ingredient_id
        WHERE ri.recipe_id = $1`,
      [recipeId],
    ),
  ])
  const batchCost = costResult.rows[0].batch_cost
  const costPerBaseUnit = Number(recipe.yield_quantity) > 0 ? (Number(batchCost) / Number(recipe.yield_quantity)) : null

  return {
    ...mapRecipeRow(recipe),
    ingredients: linesResult.rows.map((row) => ({
      ingredientId: row.ingredient_id,
      name: row.name,
      unit: row.unit,
      quantity: row.quantity,
      averageUnitCost: row.average_unit_cost,
      stockQuantity: row.stock_quantity,
      lineCost: row.line_cost,
    })),
    products: productsResult.rows.map((row) => ({
      productId: row.product_id,
      name: row.product_name,
      variant: row.variant,
      price: row.price,
      unitsPerItem: row.units_per_item,
      // Cost per item at today's averages; display-only, two decimals.
      theoreticalUnitCost: costPerBaseUnit == null ? null : (costPerBaseUnit * Number(row.units_per_item)).toFixed(2),
    })),
    theoreticalBatchCost: batchCost,
    theoreticalCostPerBaseUnit: costPerBaseUnit == null ? null : costPerBaseUnit.toFixed(4),
  }
}

// Validates a full recipe body (POST and PUT share it): name, base unit,
// yield, and the ingredient lines — at least one, no duplicates, every
// ingredient real and active.
async function validateRecipeBody(body) {
  const errors = {}
  const values = {}

  const name = normalize(body.name)
  if (!name || name.length > 150) errors.name = 'Enter a recipe name (1-150 characters).'
  else values.name = name

  const baseUnit = normalize(body.baseUnit)
  if (!baseUnit || baseUnit.length > baseUnitMaxLength) errors.baseUnit = `Enter what one batch is counted in (1-${baseUnitMaxLength} characters), e.g. piece or gram.`
  else values.baseUnit = baseUnit

  const yieldQuantity = parseQuantity(body.yieldQuantity)
  if (yieldQuantity === null) errors.yieldQuantity = 'Enter how many base units one batch makes, greater than zero.'
  else values.yieldQuantity = yieldQuantity

  values.note = body.note == null ? null : normalize(body.note).slice(0, noteMaxLength) || null

  const rawLines = Array.isArray(body.ingredients) ? body.ingredients : []
  if (rawLines.length === 0) errors.ingredients = 'Add at least one ingredient.'
  const lines = new Map()
  for (const line of rawLines) {
    const ingredientId = parseId(line?.ingredientId)
    const quantity = parseQuantity(line?.quantity)
    if (!ingredientId || quantity === null) {
      errors.ingredients = 'Each line needs an ingredient and a quantity greater than zero.'
      break
    }
    if (lines.has(ingredientId)) {
      errors.ingredients = 'An ingredient is listed twice.'
      break
    }
    lines.set(ingredientId, quantity)
  }
  if (!errors.ingredients && lines.size > 0) {
    const found = await pool.query('SELECT ingredient_id FROM ingredients WHERE ingredient_id = ANY($1::bigint[]) AND is_active = TRUE', [[...lines.keys()]])
    if (found.rowCount !== lines.size) errors.ingredients = 'One of the ingredients does not exist or is deactivated.'
  }
  values.lines = [...lines].map(([ingredientId, quantity]) => ({ ingredientId, quantity }))

  return { errors, values }
}

router.use(requireAuth, requireRole('ADMIN', 'CASHIER'))

router.get('/', async (request, response) => {
  const includeInactive = request.query.includeInactive === 'true'
  const result = await pool.query(
    `SELECT r.recipe_id, r.name, r.base_unit, r.yield_quantity, r.note, r.is_active, r.created_at, r.updated_at,
            (SELECT COUNT(*)::int FROM recipe_ingredients ri WHERE ri.recipe_id = r.recipe_id) AS ingredient_count,
            (SELECT COUNT(*)::int FROM products p WHERE p.recipe_id = r.recipe_id) AS product_count,
            (SELECT COALESCE(SUM(ri.quantity * i.average_unit_cost), 0)::numeric(12, 2)
               FROM recipe_ingredients ri JOIN ingredients i ON i.ingredient_id = ri.ingredient_id
              WHERE ri.recipe_id = r.recipe_id) AS theoretical_batch_cost
       FROM recipes r
      ${includeInactive ? '' : 'WHERE r.is_active = TRUE'}
      ORDER BY r.name`,
  )
  return response.json({
    recipes: result.rows.map((row) => ({
      ...mapRecipeRow(row),
      ingredientCount: row.ingredient_count,
      productCount: row.product_count,
      theoreticalBatchCost: row.theoretical_batch_cost,
    })),
  })
})

router.get('/:id', async (request, response) => {
  const recipeId = parseId(request.params.id)
  if (!recipeId) return response.status(404).json({ message: 'Recipe not found.' })
  const recipe = await loadRecipeDetail(recipeId)
  if (!recipe) return response.status(404).json({ message: 'Recipe not found.' })
  return response.json({ recipe })
})

router.post('/', requireRole('ADMIN'), async (request, response) => {
  const { errors, values } = await validateRecipeBody(request.body)
  if (Object.keys(errors).length) return response.status(422).json({ message: 'Please correct the highlighted fields.', errors })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const created = await client.query(
      `INSERT INTO recipes (name, base_unit, yield_quantity, note) VALUES ($1, $2, $3::numeric, $4) RETURNING recipe_id`,
      [values.name, values.baseUnit, values.yieldQuantity, values.note],
    )
    const recipeId = created.rows[0].recipe_id
    for (const line of values.lines) {
      await client.query('INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity) VALUES ($1, $2, $3::numeric)', [recipeId, line.ingredientId, line.quantity])
    }
    await client.query('COMMIT')
    return response.status(201).json({ recipe: await loadRecipeDetail(recipeId) })
  } catch (error) {
    await client.query('ROLLBACK')
    if (error.code === '23505') return response.status(409).json({ message: 'A recipe with that name already exists.', errors: { name: 'A recipe with that name already exists.' } })
    throw error
  } finally {
    client.release()
  }
})

// PUT replaces the whole recipe — header and lines — atomically. Lines are
// deleted and re-inserted inside the transaction so a half-applied edit
// can never be observed.
router.put('/:id', requireRole('ADMIN'), async (request, response) => {
  const recipeId = parseId(request.params.id)
  if (!recipeId) return response.status(404).json({ message: 'Recipe not found.' })
  const exists = await pool.query('SELECT 1 FROM recipes WHERE recipe_id = $1', [recipeId])
  if (!exists.rows[0]) return response.status(404).json({ message: 'Recipe not found.' })

  const { errors, values } = await validateRecipeBody(request.body)
  if (Object.keys(errors).length) return response.status(422).json({ message: 'Please correct the highlighted fields.', errors })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `UPDATE recipes SET name = $1, base_unit = $2, yield_quantity = $3::numeric, note = $4 WHERE recipe_id = $5`,
      [values.name, values.baseUnit, values.yieldQuantity, values.note, recipeId],
    )
    await client.query('DELETE FROM recipe_ingredients WHERE recipe_id = $1', [recipeId])
    for (const line of values.lines) {
      await client.query('INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity) VALUES ($1, $2, $3::numeric)', [recipeId, line.ingredientId, line.quantity])
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    if (error.code === '23505') return response.status(409).json({ message: 'A recipe with that name already exists.', errors: { name: 'A recipe with that name already exists.' } })
    throw error
  } finally {
    client.release()
  }
  return response.json({ recipe: await loadRecipeDetail(recipeId) })
})

router.patch('/:id', requireRole('ADMIN'), async (request, response) => {
  const recipeId = parseId(request.params.id)
  if (!recipeId) return response.status(404).json({ message: 'Recipe not found.' })
  if (typeof request.body.isActive !== 'boolean') return response.status(422).json({ message: 'isActive must be true or false.', errors: { isActive: 'isActive must be true or false.' } })
  const result = await pool.query('UPDATE recipes SET is_active = $1 WHERE recipe_id = $2 RETURNING recipe_id', [request.body.isActive, recipeId])
  if (result.rowCount === 0) return response.status(404).json({ message: 'Recipe not found.' })
  return response.json({ recipe: await loadRecipeDetail(recipeId) })
})

export default router
