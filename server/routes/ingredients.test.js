// Integration tests for ingredient stock (CLIENT_REVISIONS_PLAN.md, R5).
// Same approach as the other route tests: real Express app on an ephemeral
// port, real database. Run with: npm test
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { after, before, beforeEach, describe, test } from 'node:test'
import bcrypt from 'bcrypt'
import app from '../app.js'
import { resetRateLimits } from '../lib/security.js'
import { pool } from '../db.js'

const runId = crypto.randomUUID().slice(0, 8)
const randomContactNumber = () => `09${Math.floor(100000000 + Math.random() * 899999999)}`

describe('ingredient stock', () => {
  beforeEach(resetRateLimits)

  let server
  let baseUrl
  let adminCookie
  let cashierCookie
  let customerCookie
  let flourId
  const createdUserIds = []
  const createdIngredientIds = []

  const admin = { username: `ingadmin_${runId}`, password: 'Admin-Only-Password-9!' }
  const cashier = { role: 'CASHIER', name: 'Ingredient Test Cashier', username: `ingcash_${runId}`, email: `ingcash_${runId}@example.com`, contactNumber: randomContactNumber(), password: 'Cashier-Password-9!' }
  const customer = { name: 'Ingredient Test Customer', firstName: 'Ingredient Test', lastName: 'Customer', agree: true, username: `ingcust_${runId}`, email: `ingcust_${runId}@example.com`, contactNumber: randomContactNumber(), password: 'Correct-Horse-Battery-9!' }

  const json = (cookie, method, body) => ({ method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(body) })
  const move = (cookie, id, body) => fetch(`${baseUrl}/api/ingredients/${id}/movements`, json(cookie, 'POST', body))
  const stockOf = async (id) => (await pool.query('SELECT stock_quantity::text AS stock FROM ingredients WHERE ingredient_id = $1', [id])).rows[0].stock
  const ledgerSum = async (id) => (await pool.query('SELECT COALESCE(SUM(quantity_change), 0)::text AS total FROM ingredient_movements WHERE ingredient_id = $1', [id])).rows[0].total

  before(async () => {
    server = app.listen(0)
    await new Promise((resolve) => server.once('listening', resolve))
    baseUrl = `http://localhost:${server.address().port}`

    const adminPasswordHash = await bcrypt.hash(admin.password, 4)
    const adminResult = await pool.query(`INSERT INTO users (username, password_hash, user_type) VALUES ($1, $2, 'ADMIN') RETURNING user_id`, [admin.username, adminPasswordHash])
    createdUserIds.push(adminResult.rows[0].user_id)
    await pool.query('INSERT INTO admins (user_id, name, contact_num, email) VALUES ($1, $2, $3, $4)', [adminResult.rows[0].user_id, 'Ingredient Test Admin', randomContactNumber(), `ingadmin_${runId}@example.com`])
    await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: admin.username, password: admin.password }) })
    const rawCode = '665544'
    const challengeToken = `test-challenge-${crypto.randomUUID()}`
    await pool.query(`INSERT INTO otp_codes (user_id, code_hash, challenge_token, expires_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP + INTERVAL '5 minutes')`, [adminResult.rows[0].user_id, crypto.createHash('sha256').update(rawCode).digest('hex'), challengeToken])
    const otpResponse = await fetch(`${baseUrl}/api/auth/verify-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ challengeToken, code: rawCode }) })
    adminCookie = otpResponse.headers.get('set-cookie').split(';')[0]

    const cashierCreate = await fetch(`${baseUrl}/api/staff`, json(adminCookie, 'POST', { ...cashier, confirmPassword: cashier.password }))
    assert.equal(cashierCreate.status, 201)
    createdUserIds.push((await pool.query('SELECT user_id FROM users WHERE username = $1', [cashier.username])).rows[0].user_id)
    const cashierLogin = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: cashier.username, password: cashier.password }) })
    cashierCookie = cashierLogin.headers.get('set-cookie').split(';')[0]

    await fetch(`${baseUrl}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...customer, confirmPassword: customer.password }) })
    createdUserIds.push((await pool.query('SELECT user_id FROM users WHERE username = $1', [customer.username])).rows[0].user_id)
    const customerLogin = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: customer.username, password: customer.password }) })
    customerCookie = customerLogin.headers.get('set-cookie').split(';')[0]
  })

  after(async () => {
    await pool.query('DELETE FROM ingredient_movements WHERE ingredient_id = ANY($1)', [createdIngredientIds]).catch(() => {})
    await pool.query('DELETE FROM ingredients WHERE ingredient_id = ANY($1)', [createdIngredientIds]).catch(() => {})
    await pool.query('DELETE FROM cashiers WHERE user_id = ANY($1)', [createdUserIds])
    await pool.query('DELETE FROM customers WHERE user_id = ANY($1)', [createdUserIds])
    await pool.query('DELETE FROM admins WHERE user_id = ANY($1)', [createdUserIds])
    await pool.query('DELETE FROM users WHERE user_id = ANY($1)', [createdUserIds])
    await new Promise((resolve) => server.close(resolve))
  })

  test('only staff can read ingredients', async () => {
    assert.equal((await fetch(`${baseUrl}/api/ingredients`)).status, 401)
    assert.equal((await fetch(`${baseUrl}/api/ingredients`, { headers: { Cookie: customerCookie } })).status, 403)
    for (const cookie of [adminCookie, cashierCookie]) {
      const response = await fetch(`${baseUrl}/api/ingredients`, { headers: { Cookie: cookie } })
      assert.equal(response.status, 200)
      assert.ok(Array.isArray((await response.json()).ingredients))
    }
  })

  test('the admin adds an ingredient; an opening count is written to the ledger', async () => {
    const response = await fetch(`${baseUrl}/api/ingredients`, json(adminCookie, 'POST', { name: `Flour ${runId}`, unit: 'kg', minStockLevel: '10', stockQuantity: '25.5' }))
    assert.equal(response.status, 201)
    const { ingredient } = await response.json()
    flourId = ingredient.id
    createdIngredientIds.push(flourId)
    assert.equal(Number(ingredient.stockQuantity), 25.5)
    assert.equal(ingredient.unit, 'kg')
    assert.equal(Number(await ledgerSum(flourId)), 25.5)

    const duplicate = await fetch(`${baseUrl}/api/ingredients`, json(adminCookie, 'POST', { name: `Flour ${runId}`, unit: 'kg' }))
    assert.equal(duplicate.status, 409)
    const badUnit = await fetch(`${baseUrl}/api/ingredients`, json(adminCookie, 'POST', { name: `Odd ${runId}`, unit: 'bucket' }))
    assert.equal(badUnit.status, 422)
  })

  test('a cashier records movements but cannot add or edit an ingredient', async () => {
    assert.equal((await fetch(`${baseUrl}/api/ingredients`, json(cashierCookie, 'POST', { name: `Sugar ${runId}`, unit: 'kg' }))).status, 403)
    assert.equal((await fetch(`${baseUrl}/api/ingredients/${flourId}`, json(cashierCookie, 'PATCH', { minStockLevel: '1' }))).status, 403)

    const restock = await move(cashierCookie, flourId, { reason: 'RESTOCK', quantity: '50', note: 'Two sacks delivered' })
    assert.equal(restock.status, 201)
    assert.equal(Number((await restock.json()).ingredient.stockQuantity), 75.5)
    const latest = (await pool.query(
      `SELECT m.reason, m.quantity_change::text AS change, m.note, u.user_type FROM ingredient_movements m JOIN users u ON u.user_id = m.changed_by
        WHERE m.ingredient_id = $1 ORDER BY m.movement_id DESC LIMIT 1`,
      [flourId],
    )).rows[0]
    assert.deepEqual({ reason: latest.reason, change: Number(latest.change), note: latest.note, by: latest.user_type }, { reason: 'RESTOCK', change: 50, note: 'Two sacks delivered', by: 'CASHIER' })
  })

  test('usage and rejects remove stock, a recount sets it, and every one writes a ledger row', async () => {
    // 75.5 going in.
    const before = (await pool.query('SELECT COUNT(*)::int AS n FROM ingredient_movements WHERE ingredient_id = $1', [flourId])).rows[0].n
    assert.equal((await move(adminCookie, flourId, { reason: 'USAGE', quantity: '12.25' })).status, 201)
    assert.equal(Number(await stockOf(flourId)), 63.25)
    assert.equal((await move(adminCookie, flourId, { reason: 'REJECT', quantity: '0.25', note: 'Wet bag' })).status, 201)
    assert.equal(Number(await stockOf(flourId)), 63)
    assert.equal((await move(cashierCookie, flourId, { reason: 'CORRECTION', quantity: '60' })).status, 403, 'a count is corrected by the admin')
    assert.equal((await move(adminCookie, flourId, { reason: 'CORRECTION', quantity: '60' })).status, 201)
    assert.equal(Number(await stockOf(flourId)), 60)

    const rows = await pool.query('SELECT reason, quantity_change::text AS change FROM ingredient_movements WHERE ingredient_id = $1 ORDER BY movement_id DESC LIMIT 3', [flourId])
    assert.deepEqual(rows.rows.map((row) => [row.reason, Number(row.change)]), [['CORRECTION', -3], ['REJECT', -0.25], ['USAGE', -12.25]])
    assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM ingredient_movements WHERE ingredient_id = $1', [flourId])).rows[0].n, before + 3)
    // The ledger always sums to the figure on the shelf.
    assert.equal(Number(await ledgerSum(flourId)), Number(await stockOf(flourId)))
  })

  test('stock never goes below zero, and a refused movement writes nothing', async () => {
    const before = (await pool.query('SELECT COUNT(*)::int AS n FROM ingredient_movements WHERE ingredient_id = $1', [flourId])).rows[0].n
    const tooMuch = await move(adminCookie, flourId, { reason: 'USAGE', quantity: '60.001' })
    assert.equal(tooMuch.status, 409)
    assert.match((await tooMuch.json()).message, /Only 60 kg on hand/)
    for (const body of [{ reason: 'USAGE', quantity: '-5' }, { reason: 'USAGE', quantity: '0' }, { reason: 'SPOILAGE', quantity: '1' }, { reason: 'RESTOCK', quantity: '1.2345' }, { reason: 'CORRECTION', quantity: '60' }]) {
      assert.equal((await move(adminCookie, flourId, body)).status, 422, JSON.stringify(body))
    }
    assert.equal(Number(await stockOf(flourId)), 60)
    assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM ingredient_movements WHERE ingredient_id = $1', [flourId])).rows[0].n, before)
  })

  test('simultaneous usage cannot overdraw', async () => {
    // 60 on hand; five people each use 15 at once — only four can.
    const results = await Promise.all(Array.from({ length: 5 }, () => move(adminCookie, flourId, { reason: 'USAGE', quantity: '15' })))
    assert.deepEqual(results.map((response) => response.status).sort(), [201, 201, 201, 201, 409])
    assert.equal(Number(await stockOf(flourId)), 0)
    assert.equal(Number(await ledgerSum(flourId)), 0)
  })

  test('a deactivated ingredient takes no movements and leaves the list', async () => {
    assert.equal((await fetch(`${baseUrl}/api/ingredients/${flourId}`, json(adminCookie, 'PATCH', { isActive: false }))).status, 200)
    assert.equal((await move(adminCookie, flourId, { reason: 'RESTOCK', quantity: '1' })).status, 409)
    const list = await (await fetch(`${baseUrl}/api/ingredients`, { headers: { Cookie: adminCookie } })).json()
    assert.ok(!list.ingredients.some((row) => row.id === flourId))
    const all = await (await fetch(`${baseUrl}/api/ingredients?includeInactive=true`, { headers: { Cookie: adminCookie } })).json()
    assert.ok(all.ingredients.some((row) => row.id === flourId))
    assert.equal((await fetch(`${baseUrl}/api/ingredients/${flourId}`, json(adminCookie, 'PATCH', { isActive: true }))).status, 200)
  })

  test('the movement history lists who did what, newest first', async () => {
    const response = await fetch(`${baseUrl}/api/ingredients/movements?ingredientId=${flourId}&limit=3`, { headers: { Cookie: cashierCookie } })
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.movements.length, 3)
    assert.ok(body.hasMore)
    assert.equal(body.movements[0].ingredientName, `Flour ${runId}`)
    assert.equal(body.movements[0].reason, 'USAGE')
    assert.equal(body.movements[0].changedByName, 'Ingredient Test Admin')
  })

})

after(async () => {
  await pool.end()
})
