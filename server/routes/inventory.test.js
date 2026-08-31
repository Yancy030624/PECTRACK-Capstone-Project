// Lightweight integration tests for GET /api/inventory (Phase 5, Step 1 —
// see PHASE5_PLAN.md). Same approach as the other route tests: real Express
// app on an ephemeral port, real database. Run with: npm test
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { after, before, describe, test } from 'node:test'
import bcrypt from 'bcrypt'
import app from '../app.js'
import { pool } from '../db.js'

const runId = crypto.randomUUID().slice(0, 8)
const randomContactNumber = () => `09${Math.floor(100000000 + Math.random() * 899999999)}`

describe('inventory list', () => {
  let server
  let baseUrl
  let adminCookie
  let cashierCookie
  let customerCookie
  let categoryId
  let inStockProductId
  let lowStockProductId
  const createdUserIds = []
  const createdProductIds = []

  const admin = { username: `invadmin_${runId}`, password: 'Admin-Only-Password-9!' }
  const cashier = { role: 'CASHIER', name: 'Inventory Test Cashier', username: `invcash_${runId}`, email: `invcash_${runId}@example.com`, contactNumber: randomContactNumber(), password: 'Cashier-Password-9!' }
  const customer = { name: 'Inventory Test Customer', username: `invcust_${runId}`, email: `invcust_${runId}@example.com`, contactNumber: randomContactNumber(), password: 'Correct-Horse-Battery-9!' }

  before(async () => {
    server = app.listen(0)
    await new Promise((resolve) => server.once('listening', resolve))
    baseUrl = `http://localhost:${server.address().port}`

    const adminPasswordHash = await bcrypt.hash(admin.password, 4)
    const adminResult = await pool.query(`INSERT INTO users (username, password_hash, user_type) VALUES ($1, $2, 'ADMIN') RETURNING user_id`, [admin.username, adminPasswordHash])
    createdUserIds.push(adminResult.rows[0].user_id)
    await pool.query('INSERT INTO admins (user_id, name, contact_num, email) VALUES ($1, $2, $3, $4)', [adminResult.rows[0].user_id, 'Inventory Test Admin', randomContactNumber(), `invadmin_${runId}@example.com`])
    await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: admin.username, password: admin.password }) })
    const rawCode = '778899'
    const challengeToken = `test-challenge-${crypto.randomUUID()}`
    await pool.query(`INSERT INTO otp_codes (user_id, code_hash, challenge_token, expires_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP + INTERVAL '5 minutes')`, [adminResult.rows[0].user_id, crypto.createHash('sha256').update(rawCode).digest('hex'), challengeToken])
    const otpResponse = await fetch(`${baseUrl}/api/auth/verify-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ challengeToken, code: rawCode }) })
    adminCookie = otpResponse.headers.get('set-cookie').split(';')[0]

    const cashierCreate = await fetch(`${baseUrl}/api/staff`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ ...cashier, confirmPassword: cashier.password }) })
    assert.equal(cashierCreate.status, 201)
    const cashierRow = await pool.query('SELECT user_id FROM users WHERE username = $1', [cashier.username])
    createdUserIds.push(cashierRow.rows[0].user_id)
    const cashierLogin = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: cashier.username, password: cashier.password }) })
    cashierCookie = cashierLogin.headers.get('set-cookie').split(';')[0]

    await fetch(`${baseUrl}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...customer, confirmPassword: customer.password }) })
    const customerRow = await pool.query('SELECT user_id FROM users WHERE username = $1', [customer.username])
    createdUserIds.push(customerRow.rows[0].user_id)
    const customerLogin = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: customer.username, password: customer.password }) })
    customerCookie = customerLogin.headers.get('set-cookie').split(';')[0]

    const categoryResult = await pool.query('INSERT INTO categories (category_name) VALUES ($1) RETURNING category_id', [`Inventory Test Category ${runId}`])
    categoryId = categoryResult.rows[0].category_id

    // POST /api/products always creates a matching inventory row at the
    // table's defaults (stock_quantity 0, min_stock_level 0) — this is the
    // one and only place these two products get created, then their stock
    // is set directly since PATCH /api/inventory/:productId doesn't exist
    // yet (that's Step 2).
    const inStock = await fetch(`${baseUrl}/api/products`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ categoryId, name: `In Stock Bread ${runId}`, price: 45.5 }) })
    inStockProductId = (await inStock.json()).product.id
    createdProductIds.push(inStockProductId)
    await pool.query('UPDATE inventory SET stock_quantity = 50, min_stock_level = 10 WHERE product_id = $1', [inStockProductId])

    const lowStock = await fetch(`${baseUrl}/api/products`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ categoryId, name: `Low Stock Cake ${runId}`, price: 120 }) })
    lowStockProductId = (await lowStock.json()).product.id
    createdProductIds.push(lowStockProductId)
    await pool.query('UPDATE inventory SET stock_quantity = 2, min_stock_level = 5 WHERE product_id = $1', [lowStockProductId])
  })

  after(async () => {
    for (const id of createdProductIds) {
      await pool.query('DELETE FROM order_details WHERE product_id = $1', [id]).catch(() => {})
      await pool.query('DELETE FROM inventory WHERE product_id = $1', [id]).catch(() => {})
      await pool.query('DELETE FROM products WHERE product_id = $1', [id]).catch(() => {})
    }
    await pool.query('DELETE FROM categories WHERE category_id = $1', [categoryId]).catch(() => {})
    await pool.query('DELETE FROM cashiers WHERE user_id = ANY($1)', [createdUserIds])
    await pool.query('DELETE FROM customers WHERE user_id = ANY($1)', [createdUserIds])
    await pool.query('DELETE FROM admins WHERE user_id = ANY($1)', [createdUserIds])
    await pool.query('DELETE FROM users WHERE user_id = ANY($1)', [createdUserIds])
    await new Promise((resolve) => server.close(resolve))
  })

  test('GET /api/inventory rejects an unauthenticated request', async () => {
    const response = await fetch(`${baseUrl}/api/inventory`)
    assert.equal(response.status, 401)
  })

  test('GET /api/inventory rejects a plain customer', async () => {
    const response = await fetch(`${baseUrl}/api/inventory`, { headers: { Cookie: customerCookie } })
    assert.equal(response.status, 403)
  })

  test('GET /api/inventory is visible to admin and cashier alike', async () => {
    for (const cookie of [adminCookie, cashierCookie]) {
      const response = await fetch(`${baseUrl}/api/inventory`, { headers: { Cookie: cookie } })
      assert.equal(response.status, 200)
      const body = await response.json()
      assert.ok(Array.isArray(body.inventory))
    }
  })

  test('returns correct stock figures and a computed lowStock flag', async () => {
    const response = await fetch(`${baseUrl}/api/inventory`, { headers: { Cookie: adminCookie } })
    const body = await response.json()

    const inStockRow = body.inventory.find((row) => row.productId === inStockProductId)
    assert.ok(inStockRow, 'the in-stock product should be listed')
    assert.equal(inStockRow.stockQuantity, 50)
    assert.equal(inStockRow.minStockLevel, 10)
    assert.equal(inStockRow.lowStock, false)
    assert.equal(inStockRow.productName, `In Stock Bread ${runId}`)
    assert.equal(inStockRow.categoryId, categoryId)

    const lowStockRow = body.inventory.find((row) => row.productId === lowStockProductId)
    assert.ok(lowStockRow, 'the low-stock product should be listed')
    assert.equal(lowStockRow.stockQuantity, 2)
    assert.equal(lowStockRow.minStockLevel, 5)
    assert.equal(lowStockRow.lowStock, true)
  })
})
