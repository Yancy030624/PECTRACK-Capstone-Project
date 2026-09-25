// Phase 9A — ingredients, recipes, production batches, costing, and the
// analytics views. One suite, because the pieces only mean something
// together: a batch needs a recipe, a recipe needs ingredients, and the
// approval writes both ledgers at once.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { after, before, beforeEach, describe, test } from 'node:test'
import bcrypt from 'bcrypt'
import app from '../app.js'
import { resetRateLimits } from '../lib/security.js'
import { pool } from '../db.js'

const runId = crypto.randomUUID().slice(0, 8)
const randomContactNumber = () => `09${Math.floor(100000000 + Math.random() * 899999999)}`

describe('ingredients, recipes and production', () => {
  // The rate limiter (lib/security.js) counts by client IP, and every
  // request in this suite comes from the same one — so without a reset
  // the tests would throttle each other rather than the abuse the limiter
  // exists to stop. Resetting per test is ordinary test isolation: the
  // limiter itself is untouched and fully active in production.
  beforeEach(resetRateLimits)

  let server
  let baseUrl
  let adminCookie
  let adminUserId
  let cashierCookie
  let secondCashierCookie
  let customerCookie
  let categoryId
  let flourId
  let sugarId
  let recipeId
  let gallonId
  let packId
  let boughtInId
  const createdUserIds = []
  const createdProductIds = []
  const createdIngredientIds = []
  const createdRecipeIds = []

  const admin = { username: `prodadmin_${runId}`, password: 'Admin-Only-Password-9!' }
  const cashier = { role: 'CASHIER', name: 'Prod Cashier', username: `prodcash_${runId}`, email: `prodcash_${runId}@example.com`, contactNumber: randomContactNumber(), password: 'Cashier-Password-9!' }
  const secondCashier = { role: 'CASHIER', name: 'Prod Cashier Two', username: `prodcash2_${runId}`, email: `prodcash2_${runId}@example.com`, contactNumber: randomContactNumber(), password: 'Cashier-Password-9!' }
  const customer = { name: 'Prod Customer', username: `prodcust_${runId}`, email: `prodcust_${runId}@example.com`, contactNumber: randomContactNumber(), password: 'Correct-Horse-Battery-9!' }

  const json = (cookie, method, path, body) =>
    fetch(`${baseUrl}${path}`, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) })

  const ingredientLedgerSum = async (ingredientId) => {
    const r = await pool.query('SELECT COALESCE(SUM(quantity_change), 0)::numeric(12,3) AS s, (SELECT stock_quantity FROM ingredients WHERE ingredient_id = $1) AS stock FROM ingredient_movements WHERE ingredient_id = $1', [ingredientId])
    return r.rows[0]
  }

  before(async () => {
    server = app.listen(0)
    await new Promise((resolve) => server.once('listening', resolve))
    baseUrl = `http://localhost:${server.address().port}`

    const adminPasswordHash = await bcrypt.hash(admin.password, 4)
    const adminResult = await pool.query(`INSERT INTO users (username, password_hash, user_type) VALUES ($1, $2, 'ADMIN') RETURNING user_id`, [admin.username, adminPasswordHash])
    adminUserId = adminResult.rows[0].user_id
    createdUserIds.push(adminUserId)
    await pool.query('INSERT INTO admins (user_id, name, contact_num, email) VALUES ($1, $2, $3, $4)', [adminUserId, 'Prod Admin', randomContactNumber(), `prodadmin_${runId}@example.com`])
    // An admin password is not a session on its own any more (the email
    // second factor — RULES-PLANS/SECURITY_REVIEW.md item 5), so the
    // fixture completes the challenge the way the other suites do: take
    // the token /login issues, overwrite the stored hash with a code this
    // test knows, and redeem it. Overwriting is necessary precisely
    // BECAUSE otp_codes keeps only a hash — the real code is in an email.
    const adminLogin = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: admin.username, password: admin.password }) })
    const challengeToken = (await adminLogin.json()).challengeToken
    const rawCode = '314159'
    await pool.query('UPDATE otp_codes SET code_hash = $2 WHERE challenge_token = $1', [challengeToken, crypto.createHash('sha256').update(rawCode).digest('hex')])
    const verified = await fetch(`${baseUrl}/api/auth/verify-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ challengeToken, code: rawCode }) })
    adminCookie = verified.headers.get('set-cookie').split(';')[0]

    for (const [person, setCookie] of [[cashier, (c) => { cashierCookie = c }], [secondCashier, (c) => { secondCashierCookie = c }]]) {
      const create = await json(adminCookie, 'POST', '/api/staff', { ...person, confirmPassword: person.password })
      assert.equal(create.status, 201)
      const row = await pool.query('SELECT user_id FROM users WHERE username = $1', [person.username])
      createdUserIds.push(row.rows[0].user_id)
      const login = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: person.username, password: person.password }) })
      setCookie(login.headers.get('set-cookie').split(';')[0])
    }

    await fetch(`${baseUrl}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...customer, confirmPassword: customer.password }) })
    // Fixture: confirm the email the way clicking the emailed link would
    // (migration 016). This suite is not testing verification — auth.test.js
    // is — so its customers start verified and can place orders.
    await pool.query('UPDATE customers SET email_verified_at = CURRENT_TIMESTAMP WHERE user_id = (SELECT user_id FROM users WHERE username = $1)', [customer.username])
    const customerRow = await pool.query('SELECT user_id FROM users WHERE username = $1', [customer.username])
    createdUserIds.push(customerRow.rows[0].user_id)
    const customerLogin = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: customer.username, password: customer.password }) })
    customerCookie = customerLogin.headers.get('set-cookie').split(';')[0]

    const categoryResult = await pool.query('INSERT INTO categories (category_name) VALUES ($1) RETURNING category_id', [`Production Test Category ${runId}`])
    categoryId = categoryResult.rows[0].category_id
    for (const [name, variant, price, setId] of [['Broas', `1 Gallon ${runId}`, 270, (id) => { gallonId = id }], ['Broas', `Pack ${runId}`, 30, (id) => { packId = id }], ['Bottled Water', runId, 20, (id) => { boughtInId = id }]]) {
      const created = await json(adminCookie, 'POST', '/api/products', { categoryId, name, variant, price })
      assert.equal(created.status, 201)
      const id = (await created.json()).product.id
      createdProductIds.push(id)
      setId(id)
    }
  })

  after(async () => {
    // FK order: both ledgers point at batches, batches point at recipes,
    // ingredients and users — so ledgers first, then batches, then the rest.
    await pool.query('DELETE FROM ingredient_movements WHERE ingredient_id = ANY($1)', [createdIngredientIds])
    for (const id of createdProductIds) {
      await pool.query('DELETE FROM inventory_movements WHERE inventory_id IN (SELECT inventory_id FROM inventory WHERE product_id = $1)', [id])
    }
    await pool.query('DELETE FROM production_batches WHERE recorded_by = ANY($1)', [createdUserIds])
    await pool.query('DELETE FROM recipes WHERE recipe_id = ANY($1)', [createdRecipeIds])
    await pool.query('DELETE FROM ingredients WHERE ingredient_id = ANY($1)', [createdIngredientIds])
    for (const id of createdProductIds) {
      await pool.query('DELETE FROM stock_alerts WHERE inventory_id IN (SELECT inventory_id FROM inventory WHERE product_id = $1)', [id]).catch(() => {})
      await pool.query('DELETE FROM inventory WHERE product_id = $1', [id]).catch(() => {})
      await pool.query('DELETE FROM products WHERE product_id = $1', [id]).catch(() => {})
    }
    await pool.query('DELETE FROM categories WHERE category_id = $1', [categoryId]).catch(() => {})
    await pool.query('DELETE FROM report_logs WHERE generated_by IN (SELECT admin_id FROM admins WHERE user_id = ANY($1))', [createdUserIds]).catch(() => {})
    await pool.query('DELETE FROM cashiers WHERE user_id = ANY($1)', [createdUserIds])
    await pool.query('DELETE FROM customers WHERE user_id = ANY($1)', [createdUserIds])
    await pool.query('DELETE FROM admins WHERE user_id = ANY($1)', [createdUserIds])
    await pool.query('DELETE FROM users WHERE user_id = ANY($1)', [createdUserIds])
    await new Promise((resolve) => server.close(resolve))
  })

  // ---------------- ingredients ----------------

  test('ingredients: anonymous 401, customer 403, cashier may read but not write', async () => {
    assert.equal((await fetch(`${baseUrl}/api/ingredients`)).status, 401)
    assert.equal((await fetch(`${baseUrl}/api/ingredients`, { headers: { Cookie: customerCookie } })).status, 403)
    assert.equal((await fetch(`${baseUrl}/api/ingredients`, { headers: { Cookie: cashierCookie } })).status, 200)
    assert.equal((await json(cashierCookie, 'POST', '/api/ingredients', { name: 'x', unit: 'kg' })).status, 403)
  })

  test('POST /api/ingredients validates and creates; a duplicate name is 409', async () => {
    const bad = await json(adminCookie, 'POST', '/api/ingredients', { name: '', unit: 'stone', minStockLevel: '1.2345' })
    assert.equal(bad.status, 422)
    const errors = (await bad.json()).errors
    assert.ok(errors.name && errors.unit && errors.minStockLevel)

    const flour = await json(adminCookie, 'POST', '/api/ingredients', { name: `Flour ${runId}`, unit: 'kg', minStockLevel: '5' })
    assert.equal(flour.status, 201)
    flourId = (await flour.json()).ingredient.id
    createdIngredientIds.push(flourId)
    const sugar = await json(adminCookie, 'POST', '/api/ingredients', { name: `Sugar ${runId}`, unit: 'kg' })
    sugarId = (await sugar.json()).ingredient.id
    createdIngredientIds.push(sugarId)

    const duplicate = await json(adminCookie, 'POST', '/api/ingredients', { name: `flour ${runId}`.replace('flour', 'Flour'), unit: 'g' })
    assert.equal(duplicate.status, 409)
  })

  test('purchases move stock, write PURCHASE rows with the price, and keep a moving average to four decimals', async () => {
    const first = await json(adminCookie, 'POST', `/api/ingredients/${flourId}/purchase`, { quantity: '10', unitCost: '40' })
    assert.equal(first.status, 201)
    assert.equal((await first.json()).ingredient.averageUnitCost, '40.0000')

    // 10 kg at 40 + 5 kg at 52 = (400 + 260) / 15 = 44.0000
    const second = await json(adminCookie, 'POST', `/api/ingredients/${flourId}/purchase`, { quantity: '5', unitCost: '52' })
    const afterSecond = (await second.json()).ingredient
    assert.equal(afterSecond.stockQuantity, '15.000')
    assert.equal(afterSecond.averageUnitCost, '44.0000')

    await json(adminCookie, 'POST', `/api/ingredients/${sugarId}/purchase`, { quantity: '4', unitCost: '60' })

    const ledger = await pool.query('SELECT reason, quantity_change, unit_cost FROM ingredient_movements WHERE ingredient_id = $1 ORDER BY movement_id', [flourId])
    assert.deepEqual(ledger.rows.map((r) => [r.reason, r.quantity_change, r.unit_cost]), [['PURCHASE', '10.000', '40.0000'], ['PURCHASE', '5.000', '52.0000']])
  })

  test('adjustments: waste must be negative, cannot drive stock negative, and does not touch the average', async () => {
    const positiveWaste = await json(adminCookie, 'POST', `/api/ingredients/${flourId}/adjust`, { quantityChange: '1', reason: 'WASTE' })
    assert.equal(positiveWaste.status, 422)
    const tooMuch = await json(adminCookie, 'POST', `/api/ingredients/${flourId}/adjust`, { quantityChange: '-100', reason: 'WASTE' })
    assert.equal(tooMuch.status, 409)
    const waste = await json(adminCookie, 'POST', `/api/ingredients/${flourId}/adjust`, { quantityChange: '-1', reason: 'WASTE', note: 'Spilled' })
    assert.equal(waste.status, 201)
    const body = (await waste.json()).ingredient
    assert.equal(body.stockQuantity, '14.000')
    assert.equal(body.averageUnitCost, '44.0000', 'waste does not change the average')

    const reconciled = await ingredientLedgerSum(flourId)
    assert.equal(reconciled.s, reconciled.stock, 'the ingredient ledger reconciles to stock')
  })

  // ---------------- recipes ----------------

  test('recipes: creation validates lines, computes the theoretical cost, and products map onto a recipe with a ratio', async () => {
    const noLines = await json(adminCookie, 'POST', '/api/recipes', { name: `Broas dough ${runId}`, baseUnit: 'piece', yieldQuantity: '240', ingredients: [] })
    assert.equal(noLines.status, 422)

    // One batch: 10 kg flour at 44 + 2 kg sugar at 60 = 440 + 120 = 560; 240 pieces → 2.3333/piece
    const created = await json(adminCookie, 'POST', '/api/recipes', { name: `Broas dough ${runId}`, baseUnit: 'piece', yieldQuantity: '240', ingredients: [{ ingredientId: flourId, quantity: '10' }, { ingredientId: sugarId, quantity: '2' }] })
    assert.equal(created.status, 201)
    const recipe = (await created.json()).recipe
    recipeId = recipe.id
    createdRecipeIds.push(recipeId)
    assert.equal(recipe.theoreticalBatchCost, '560.00')
    assert.equal(recipe.theoreticalCostPerBaseUnit, '2.3333')

    const cashierWrite = await json(cashierCookie, 'PUT', `/api/recipes/${recipeId}`, { name: 'x', baseUnit: 'piece', yieldQuantity: '1', ingredients: [{ ingredientId: flourId, quantity: '1' }] })
    assert.equal(cashierWrite.status, 403)

    // Map the gallon (120 pieces) and the pack (12 pieces). Recipe without a ratio, or vice versa, is refused.
    const halfMapped = await json(adminCookie, 'PATCH', `/api/products/${gallonId}`, { recipeId })
    assert.equal(halfMapped.status, 422)
    assert.equal((await json(adminCookie, 'PATCH', `/api/products/${gallonId}`, { recipeId, unitsPerItem: '120', shelfLifeDays: 30 })).status, 200)
    assert.equal((await json(adminCookie, 'PATCH', `/api/products/${packId}`, { recipeId, unitsPerItem: '12' })).status, 200)

    const detail = await (await json(adminCookie, 'GET', `/api/recipes/${recipeId}`)).json()
    assert.equal(detail.recipe.products.length, 2)
    const gallon = detail.recipe.products.find((p) => p.productId === gallonId)
    assert.equal(gallon.theoreticalUnitCost, '280.00', '120 pieces at 2.3333')

    // The public catalogue does not carry the production fields.
    const anonymous = await (await fetch(`${baseUrl}/api/products/${gallonId}`)).json()
    assert.ok(!('recipeId' in anonymous.product) && !('unitsPerItem' in anonymous.product))
    const staff = await (await json(adminCookie, 'GET', `/api/products/${gallonId}`)).json()
    assert.equal(staff.product.unitsPerItem, '120.000')
    assert.equal(staff.product.shelfLifeDays, 30)
  })

  // ---------------- production ----------------

  test('POST /api/production validates the shape: recipe scaling, outputs must pack the produced quantity, unmapped products refused', async () => {
    const unmapped = await json(cashierCookie, 'POST', '/api/production', { recipeId, plannedQuantity: '240', producedQuantity: '240', outputs: [{ productId: boughtInId, quantity: 2 }] })
    assert.equal(unmapped.status, 422)
    assert.ok((await unmapped.json()).errors.outputs)

    const mismatch = await json(cashierCookie, 'POST', '/api/production', { recipeId, plannedQuantity: '240', producedQuantity: '240', outputs: [{ productId: gallonId, quantity: 1 }] })
    assert.equal(mismatch.status, 422)
    assert.match((await mismatch.json()).message, /pack 120.000 piece/)

    const foreignLine = await json(cashierCookie, 'POST', '/api/production', { recipeId, plannedQuantity: '240', producedQuantity: '240', ingredients: [{ ingredientId: '999999999', quantityUsed: '1' }], outputs: [{ productId: gallonId, quantity: 2 }] })
    assert.equal(foreignLine.status, 422)
  })

  let pendingBatchId
  test('a cashier\'s batch is PENDING, scales the recipe, and touches no stock', async () => {
    const flourBefore = (await ingredientLedgerSum(flourId)).stock
    // Planned 480 = 2× the recipe's 240 → flour 20, sugar 4. Produced 470, lost 10; 470 = 3 gallons (360) + 9 packs (108) + 2 pieces … so pack 3 gallons + 9 packs = 468 and lose 12.
    const response = await json(cashierCookie, 'POST', '/api/production', {
      recipeId, plannedQuantity: '480', producedQuantity: '468', lossQuantity: '12', note: 'Morning bake',
      outputs: [{ productId: gallonId, quantity: 3 }, { productId: packId, quantity: 9 }],
    })
    assert.equal(response.status, 201)
    const batch = (await response.json()).batch
    pendingBatchId = batch.id
    assert.equal(batch.status, 'PENDING')
    assert.equal(batch.recipeName, `Broas dough ${runId}`)
    assert.deepEqual(batch.ingredients.map((l) => [l.ingredientId, l.quantityUsed, l.unitCost]).sort(), [[flourId, '20.000', null], [sugarId, '4.000', null]].sort())
    assert.equal(batch.totalCost, '0.00')
    assert.equal((await ingredientLedgerSum(flourId)).stock, flourBefore, 'PENDING moves nothing')
    const inventory = await pool.query('SELECT stock_quantity FROM inventory WHERE product_id = $1', [gallonId])
    assert.equal(inventory.rows[0].stock_quantity, 0)
  })

  test('a cashier cannot approve; another cashier cannot withdraw it; the owner can withdraw', async () => {
    assert.equal((await json(cashierCookie, 'PATCH', `/api/production/${pendingBatchId}`, { status: 'APPROVED' })).status, 403)
    assert.equal((await json(secondCashierCookie, 'PATCH', `/api/production/${pendingBatchId}`, { status: 'CANCELLED' })).status, 404)
    const withdrawn = await json(cashierCookie, 'PATCH', `/api/production/${pendingBatchId}`, { status: 'CANCELLED' })
    assert.equal(withdrawn.status, 200)
    assert.equal((await withdrawn.json()).batch.status, 'CANCELLED')
    assert.equal((await json(adminCookie, 'PATCH', `/api/production/${pendingBatchId}`, { status: 'APPROVED' })).status, 409, 'a withdrawn batch cannot be approved')
  })

  test('approval is atomic: a short ingredient rolls everything back, including the status claim', async () => {
    // Flour has 14 kg; a full-size batch needs 20.
    const proposed = await json(cashierCookie, 'POST', '/api/production', {
      recipeId, plannedQuantity: '480', producedQuantity: '468', lossQuantity: '12',
      outputs: [{ productId: gallonId, quantity: 3 }, { productId: packId, quantity: 9 }],
    })
    const batchId = (await proposed.json()).batch.id
    const refused = await json(adminCookie, 'PATCH', `/api/production/${batchId}`, { status: 'APPROVED' })
    assert.equal(refused.status, 409)
    assert.match((await refused.json()).message, /Not enough Flour/)

    const status = await pool.query('SELECT status, total_cost FROM production_batches WHERE batch_id = $1', [batchId])
    assert.equal(status.rows[0].status, 'PENDING', 'the claim rolled back with the rest')
    assert.equal((await ingredientLedgerSum(flourId)).stock, '14.000')
    assert.equal((await ingredientLedgerSum(sugarId)).stock, '4.000')
    const movements = await pool.query('SELECT COUNT(*)::int AS n FROM ingredient_movements WHERE batch_id = $1', [batchId])
    assert.equal(movements.rows[0].n, 0)
    await json(adminCookie, 'PATCH', `/api/production/${batchId}`, { status: 'REJECTED', reviewerNote: 'Not enough flour' })
  })

  let approvedBatchId
  test('approval deducts ingredients at their average, stocks every output with a PRODUCTION row, and snapshots the cost', async () => {
    await pool.query('UPDATE inventory SET min_stock_level = 2 WHERE product_id = $1', [gallonId])
    // Open a low-stock alert the batch should close.
    await pool.query(`INSERT INTO stock_alerts (inventory_id, alert_message) SELECT inventory_id, 'low' FROM inventory WHERE product_id = $1`, [gallonId])

    // Half-size batch: planned 240 → flour 10 (have 14), sugar 2 (have 4). Produced 234 = 1 gallon + 9 packs + 6 loose → lose 6.
    const proposed = await json(cashierCookie, 'POST', '/api/production', {
      recipeId, plannedQuantity: '240', producedQuantity: '228', lossQuantity: '12',
      outputs: [{ productId: gallonId, quantity: 1 }, { productId: packId, quantity: 9 }],
    })
    assert.equal(proposed.status, 201)
    approvedBatchId = (await proposed.json()).batch.id

    const approved = await json(adminCookie, 'PATCH', `/api/production/${approvedBatchId}`, { status: 'APPROVED', reviewerNote: 'Looks right' })
    assert.equal(approved.status, 200)
    const batch = (await approved.json()).batch
    assert.equal(batch.status, 'APPROVED')
    assert.equal(batch.reviewedByName, 'Prod Admin')
    // 10 kg flour × 44 + 2 kg sugar × 60 = 440 + 120 = 560.00
    assert.equal(batch.totalCost, '560.00')
    assert.equal(batch.costPerBaseUnit, (560 / 228).toFixed(4))
    const gallonOut = batch.outputs.find((o) => o.productId === gallonId)
    assert.equal(gallonOut.unitCost, ((560 / 228) * 120).toFixed(2))

    assert.equal((await ingredientLedgerSum(flourId)).stock, '4.000')
    const flourLedger = await ingredientLedgerSum(flourId)
    assert.equal(flourLedger.s, flourLedger.stock)
    const use = await pool.query(`SELECT quantity_change, unit_cost FROM ingredient_movements WHERE batch_id = $1 AND ingredient_id = $2`, [approvedBatchId, flourId])
    assert.deepEqual([use.rows[0].quantity_change, use.rows[0].unit_cost], ['-10.000', '44.0000'])

    const stock = await pool.query('SELECT p.product_id, i.stock_quantity FROM inventory i JOIN products p ON p.product_id = i.product_id WHERE p.product_id = ANY($1) ORDER BY p.product_id', [[gallonId, packId]])
    assert.deepEqual(Object.fromEntries(stock.rows.map((r) => [r.product_id, r.stock_quantity])), { [gallonId]: 1, [packId]: 9 })
    const productionRows = await pool.query(`SELECT COUNT(*)::int AS n FROM inventory_movements WHERE batch_id = $1 AND reason = 'PRODUCTION'`, [approvedBatchId])
    assert.equal(productionRows.rows[0].n, 2)
    const alert = await pool.query(`SELECT is_resolved FROM stock_alerts WHERE inventory_id = (SELECT inventory_id FROM inventory WHERE product_id = $1)`, [gallonId])
    assert.equal(alert.rows[0].is_resolved, false, '1 gallon is still at or below the minimum of 2')

    assert.equal((await json(adminCookie, 'PATCH', `/api/production/${approvedBatchId}`, { status: 'REJECTED' })).status, 409, 'reviewed once')
  })

  test('editing the recipe or the packaging ratio afterwards does not change the approved batch', async () => {
    await json(adminCookie, 'PUT', `/api/recipes/${recipeId}`, { name: `Broas dough ${runId}`, baseUnit: 'piece', yieldQuantity: '240', ingredients: [{ ingredientId: flourId, quantity: '99' }] })
    await json(adminCookie, 'PATCH', `/api/products/${gallonId}`, { recipeId, unitsPerItem: '200' })
    const batch = (await (await json(adminCookie, 'GET', `/api/production/${approvedBatchId}`)).json()).batch
    assert.equal(batch.totalCost, '560.00')
    assert.equal(batch.ingredients.find((l) => l.ingredientId === flourId).quantityUsed, '10.000')
    assert.equal(batch.outputs.find((o) => o.productId === gallonId).unitsPerItem, '120.000')
    // put it back
    await json(adminCookie, 'PUT', `/api/recipes/${recipeId}`, { name: `Broas dough ${runId}`, baseUnit: 'piece', yieldQuantity: '240', ingredients: [{ ingredientId: flourId, quantity: '10' }, { ingredientId: sugarId, quantity: '2' }] })
    await json(adminCookie, 'PATCH', `/api/products/${gallonId}`, { recipeId, unitsPerItem: '120' })
  })

  test('an admin\'s own batch is approved in the same request', async () => {
    await json(adminCookie, 'POST', `/api/ingredients/${flourId}/purchase`, { quantity: '20', unitCost: '44' })
    await json(adminCookie, 'POST', `/api/ingredients/${sugarId}/purchase`, { quantity: '4', unitCost: '60' })
    const response = await json(adminCookie, 'POST', '/api/production', {
      recipeId, plannedQuantity: '240', producedQuantity: '240', outputs: [{ productId: gallonId, quantity: 2 }],
    })
    assert.equal(response.status, 201)
    const batch = (await response.json()).batch
    assert.equal(batch.status, 'APPROVED')
    assert.equal(batch.recordedByName, 'Prod Admin')
    assert.equal(batch.totalCost, '560.00')
  })

  // ---------------- costing, reports, views ----------------

  test('product_costing reports the latest approved batch, allocated by units per item', async () => {
    const costing = await (await json(cashierCookie, 'GET', '/api/reports/costing')).json()
    const gallon = costing.products.find((p) => p.productId === gallonId)
    // Latest batch: 560 / 240 = 2.3333 per piece × 120 = 280.00; price 270 → margin -10.00
    assert.equal(gallon.unitCost, '280.00')
    assert.equal(gallon.margin, '-10.00')
    const pack = costing.products.find((p) => p.productId === packId)
    // The pack's latest batch is the earlier one: 560 / 228 × 12
    assert.equal(pack.unitCost, ((560 / 228) * 12).toFixed(2))
    const water = costing.products.find((p) => p.productId === boughtInId)
    assert.equal(water.unitCost, null, 'a bought-in product has no production cost')
  })

  test('GET /api/reports/production totals yield and cost per recipe and per product', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const from = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10)
    const report = await (await json(adminCookie, 'GET', `/api/reports/production?from=${from}&to=${today}`)).json()
    const recipe = report.recipes.find((r) => r.recipeId === recipeId)
    assert.equal(recipe.batches, 2)
    assert.equal(recipe.produced, '468.000')
    assert.equal(recipe.loss, '12.000')
    assert.equal(recipe.totalCost, '1120.00')
    assert.equal(recipe.yieldPercent, '97.50')
    const gallon = report.products.find((p) => p.productId === gallonId)
    assert.equal(gallon.itemsProduced, 3)
  })

  test('GET /api/reports/analytics joins the views, carries data_source, and exports CSV; summary counts pending batches and low ingredients', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const from = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10)
    const analytics = await (await json(cashierCookie, 'GET', `/api/reports/analytics?from=${from}&to=${today}`)).json()
    const gallonRow = analytics.rows.find((r) => r.productId === gallonId)
    assert.ok(gallonRow)
    assert.equal(gallonRow.dataSource, 'RECORDED')
    assert.equal(gallonRow.itemsProduced, 3)
    assert.equal(gallonRow.unitsSold, 0)

    // Waste carries data_source too: a SPOILAGE row marked ASSUMED (the way
    // the demo seed marks its rows) lands on its own ASSUMED line, not on
    // the RECORDED one.
    const gallonStock = (await pool.query('SELECT stock_quantity FROM inventory WHERE product_id = $1', [gallonId])).rows[0].stock_quantity
    assert.equal((await json(adminCookie, 'PATCH', `/api/inventory/${gallonId}`, { stockQuantity: gallonStock - 1, reason: 'SPOILAGE' })).status, 200)
    await pool.query(`UPDATE inventory_movements SET data_source = 'ASSUMED' WHERE reason = 'SPOILAGE' AND inventory_id = (SELECT inventory_id FROM inventory WHERE product_id = $1)`, [gallonId])
    const split = await (await json(cashierCookie, 'GET', `/api/reports/analytics?from=${from}&to=${today}`)).json()
    const gallonRows = split.rows.filter((r) => r.productId === gallonId)
    assert.equal(gallonRows.find((r) => r.dataSource === 'ASSUMED')?.spoiled, 1)
    assert.equal(gallonRows.find((r) => r.dataSource === 'RECORDED')?.spoiled, 0)

    const csv = await json(adminCookie, 'GET', `/api/reports/analytics?from=${from}&to=${today}&format=csv`)
    assert.equal(csv.status, 200)
    assert.match(csv.headers.get('content-type'), /text\/csv/)
    const text = await csv.text()
    assert.match(text.split('\r\n')[0], /^"Date","Product ID"/)

    // Flour 14 kg is above its minimum of 5 now; sugar has min 0 and 4 kg. Set flour's minimum high to see it listed.
    await json(adminCookie, 'PATCH', `/api/ingredients/${flourId}`, { minStockLevel: '50' })
    const summary = await (await json(adminCookie, 'GET', '/api/reports/summary')).json()
    assert.ok(summary.lowIngredients.some((i) => i.id === flourId))
    assert.ok(summary.lowIngredientsTotal >= 1)
    assert.equal(typeof summary.pendingBatches, 'number')
  })

  test('a deactivated ingredient cannot be purchased into or used by a new batch', async () => {
    const extra = await json(adminCookie, 'POST', '/api/ingredients', { name: `Yeast ${runId}`, unit: 'g' })
    const yeastId = (await extra.json()).ingredient.id
    createdIngredientIds.push(yeastId)
    assert.equal((await json(adminCookie, 'PATCH', `/api/ingredients/${yeastId}`, { isActive: false })).status, 200)
    assert.equal((await json(adminCookie, 'POST', `/api/ingredients/${yeastId}/purchase`, { quantity: '1', unitCost: '1' })).status, 409)
    const recipe = await json(adminCookie, 'POST', '/api/recipes', { name: `Yeast dough ${runId}`, baseUnit: 'piece', yieldQuantity: '10', ingredients: [{ ingredientId: yeastId, quantity: '1' }] })
    assert.equal(recipe.status, 422)
  })

  test('approving a pending batch is refused when one of its ingredients was deactivated after it was recorded', async () => {
    await json(adminCookie, 'POST', `/api/ingredients/${flourId}/purchase`, { quantity: '20', unitCost: '40' })
    const pending = await json(cashierCookie, 'POST', '/api/production', { recipeId, plannedQuantity: '24', producedQuantity: '24', outputs: [{ productId: packId, quantity: 2 }] })
    assert.equal(pending.status, 201)
    const batchId = (await pending.json()).batch.id
    assert.equal((await json(adminCookie, 'PATCH', `/api/ingredients/${flourId}`, { isActive: false })).status, 200)
    const refused = await json(adminCookie, 'PATCH', `/api/production/${batchId}`, { status: 'APPROVED' })
    assert.equal(refused.status, 409)
    assert.match((await refused.json()).message, /deactivated/)
    // Nothing moved and the batch is still reviewable.
    assert.equal((await (await json(adminCookie, 'GET', `/api/production/${batchId}`)).json()).batch.status, 'PENDING')
    assert.equal((await json(adminCookie, 'PATCH', `/api/ingredients/${flourId}`, { isActive: true })).status, 200)
    assert.equal((await json(adminCookie, 'PATCH', `/api/production/${batchId}`, { status: 'REJECTED' })).status, 200)
  })
})
