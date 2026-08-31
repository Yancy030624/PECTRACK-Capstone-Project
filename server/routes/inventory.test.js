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

describe('editing stock directly', () => {
  let server
  let baseUrl
  let adminCookie
  let cashierCookie
  let categoryId
  let productId
  let inventoryId
  const createdUserIds = []
  const createdProductIds = []

  const admin = { username: `invedit_admin_${runId}`, password: 'Admin-Only-Password-9!' }
  const cashier = { role: 'CASHIER', name: 'Edit Test Cashier', username: `invedit_cash_${runId}`, email: `invedit_cash_${runId}@example.com`, contactNumber: randomContactNumber(), password: 'Cashier-Password-9!' }

  before(async () => {
    server = app.listen(0)
    await new Promise((resolve) => server.once('listening', resolve))
    baseUrl = `http://localhost:${server.address().port}`

    const adminPasswordHash = await bcrypt.hash(admin.password, 4)
    const adminResult = await pool.query(`INSERT INTO users (username, password_hash, user_type) VALUES ($1, $2, 'ADMIN') RETURNING user_id`, [admin.username, adminPasswordHash])
    createdUserIds.push(adminResult.rows[0].user_id)
    await pool.query('INSERT INTO admins (user_id, name, contact_num, email) VALUES ($1, $2, $3, $4)', [adminResult.rows[0].user_id, 'Edit Test Admin', randomContactNumber(), `invedit_admin_${runId}@example.com`])
    await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: admin.username, password: admin.password }) })
    const rawCode = '112233'
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

    const categoryResult = await pool.query('INSERT INTO categories (category_name) VALUES ($1) RETURNING category_id', [`Edit Test Category ${runId}`])
    categoryId = categoryResult.rows[0].category_id

    const productResponse = await fetch(`${baseUrl}/api/products`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ categoryId, name: `Edit Test Loaf ${runId}`, price: 60 }) })
    productId = (await productResponse.json()).product.id
    createdProductIds.push(productId)
    await pool.query('UPDATE inventory SET stock_quantity = 20, min_stock_level = 5 WHERE product_id = $1', [productId])
    inventoryId = (await pool.query('SELECT inventory_id FROM inventory WHERE product_id = $1', [productId])).rows[0].inventory_id
  })

  after(async () => {
    await pool.query('DELETE FROM inventory_movements WHERE inventory_id = $1', [inventoryId]).catch(() => {})
    for (const id of createdProductIds) {
      await pool.query('DELETE FROM order_details WHERE product_id = $1', [id]).catch(() => {})
      await pool.query('DELETE FROM inventory WHERE product_id = $1', [id]).catch(() => {})
      await pool.query('DELETE FROM products WHERE product_id = $1', [id]).catch(() => {})
    }
    await pool.query('DELETE FROM categories WHERE category_id = $1', [categoryId]).catch(() => {})
    await pool.query('DELETE FROM cashiers WHERE user_id = ANY($1)', [createdUserIds])
    await pool.query('DELETE FROM admins WHERE user_id = ANY($1)', [createdUserIds])
    await pool.query('DELETE FROM users WHERE user_id = ANY($1)', [createdUserIds])
    await new Promise((resolve) => server.close(resolve))
  })

  test('PATCH /api/inventory/:productId requires authentication', async () => {
    const response = await fetch(`${baseUrl}/api/inventory/${productId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ minStockLevel: 8 }) })
    assert.equal(response.status, 401)
  })

  // Direct edits are admin-only — a cashier can only PROPOSE a stock
  // change (Step 6, not built yet), never apply one immediately.
  test('PATCH /api/inventory/:productId rejects a cashier', async () => {
    const response = await fetch(`${baseUrl}/api/inventory/${productId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: cashierCookie }, body: JSON.stringify({ minStockLevel: 8 }) })
    assert.equal(response.status, 403)
  })

  test('a malformed or nonexistent product id is treated as "not found"', async () => {
    for (const badId of ['abc', 'undefined', '1.5', '99999999999999999999', '999999999']) {
      const response = await fetch(`${baseUrl}/api/inventory/${badId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ minStockLevel: 8 }) })
      assert.equal(response.status, 404, `id "${badId}"`)
    }
  })

  test('updates minStockLevel and expirationDate without requiring a reason', async () => {
    const response = await fetch(`${baseUrl}/api/inventory/${productId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ minStockLevel: 8, expirationDate: '2026-12-31' }),
    })
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.item.minStockLevel, 8)
    assert.equal(body.item.expirationDate, '2026-12-31')
    // Untouched by this request — proves COALESCE preserved it.
    assert.equal(body.item.stockQuantity, 20)
  })

  test('expirationDate can be cleared back to null', async () => {
    const response = await fetch(`${baseUrl}/api/inventory/${productId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ expirationDate: null }) })
    assert.equal(response.status, 200)
    assert.equal((await response.json()).item.expirationDate, null)
  })

  test('changing stockQuantity without a reason is rejected, and nothing changes', async () => {
    const response = await fetch(`${baseUrl}/api/inventory/${productId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ stockQuantity: 99 }) })
    assert.equal(response.status, 422)
    assert.ok((await response.json()).errors.reason)

    const { rows } = await pool.query('SELECT stock_quantity FROM inventory WHERE product_id = $1', [productId])
    assert.equal(rows[0].stock_quantity, 20, 'stock must be unchanged after a rejected request')
  })

  test('changing stockQuantity with an invalid reason is rejected', async () => {
    const response = await fetch(`${baseUrl}/api/inventory/${productId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ stockQuantity: 99, reason: 'BECAUSE_I_FELT_LIKE_IT' }) })
    assert.equal(response.status, 422)
    assert.ok((await response.json()).errors.reason)
  })

  // ORDER_PLACED / ORDER_CANCELLED are system-written reasons (Steps 3-4) —
  // a person filling in this form must never be able to claim one.
  test('an order-related reason is rejected on a manual edit', async () => {
    const response = await fetch(`${baseUrl}/api/inventory/${productId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ stockQuantity: 99, reason: 'ORDER_PLACED' }) })
    assert.equal(response.status, 422)
  })

  test('rejects a negative stockQuantity and a negative minStockLevel', async () => {
    const badQuantity = await fetch(`${baseUrl}/api/inventory/${productId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ stockQuantity: -5, reason: 'CORRECTION' }) })
    assert.equal(badQuantity.status, 422)

    const badMin = await fetch(`${baseUrl}/api/inventory/${productId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ minStockLevel: -1 }) })
    assert.equal(badMin.status, 422)
  })

  test('a valid stockQuantity change with a reason updates stock and writes exactly one movement row', async () => {
    const response = await fetch(`${baseUrl}/api/inventory/${productId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ stockQuantity: 35, reason: 'RESTOCK', note: 'Delivery from supplier' }),
    })
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.item.stockQuantity, 35)

    const movements = await pool.query('SELECT quantity_change, reason, note, changed_by FROM inventory_movements WHERE inventory_id = $1', [inventoryId])
    assert.equal(movements.rows.length, 1)
    assert.equal(movements.rows[0].quantity_change, 15) // 35 - 20
    assert.equal(movements.rows[0].reason, 'RESTOCK')
    assert.equal(movements.rows[0].note, 'Delivery from supplier')
  })

  test('setting stockQuantity to its current value writes no movement row', async () => {
    // Stock is 35 after the previous test — "changing" it to 35 again is a
    // no-op that should leave the ledger untouched.
    const before = await pool.query('SELECT COUNT(*)::int AS n FROM inventory_movements WHERE inventory_id = $1', [inventoryId])

    const response = await fetch(`${baseUrl}/api/inventory/${productId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ stockQuantity: 35, reason: 'CORRECTION' }) })
    assert.equal(response.status, 200)

    const after = await pool.query('SELECT COUNT(*)::int AS n FROM inventory_movements WHERE inventory_id = $1', [inventoryId])
    assert.equal(after.rows[0].n, before.rows[0].n, 'no-op change must not add a movement row')
  })

  test('a negative movement (spoilage) is recorded with the correct sign', async () => {
    // Stock is 35 going in.
    const response = await fetch(`${baseUrl}/api/inventory/${productId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ stockQuantity: 30, reason: 'SPOILAGE', note: 'Five units past expiry' }),
    })
    assert.equal(response.status, 200)
    assert.equal((await response.json()).item.stockQuantity, 30)

    const latest = await pool.query('SELECT quantity_change, reason FROM inventory_movements WHERE inventory_id = $1 ORDER BY movement_id DESC LIMIT 1', [inventoryId])
    assert.equal(latest.rows[0].quantity_change, -5) // 30 - 35
    assert.equal(latest.rows[0].reason, 'SPOILAGE')
  })

  // syncStockAlert itself is unit-tested thoroughly in lib/inventory.test.js
  // — this just confirms it's actually WIRED IN to this route (min level 5,
  // stock is 30 going in from the previous test).
  test('dropping stock to the minimum opens an alert; restoring it resolves the alert', async () => {
    const dropResponse = await fetch(`${baseUrl}/api/inventory/${productId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ stockQuantity: 5, reason: 'SPOILAGE' }) })
    assert.equal(dropResponse.status, 200)

    const opened = await pool.query('SELECT is_resolved FROM stock_alerts WHERE inventory_id = $1', [inventoryId])
    assert.equal(opened.rows.length, 1)
    assert.equal(opened.rows[0].is_resolved, false)

    const restoreResponse = await fetch(`${baseUrl}/api/inventory/${productId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ stockQuantity: 25, reason: 'RESTOCK' }) })
    assert.equal(restoreResponse.status, 200)

    const resolved = await pool.query('SELECT is_resolved FROM stock_alerts WHERE inventory_id = $1', [inventoryId])
    assert.equal(resolved.rows[0].is_resolved, true)
  })
})

describe('cashier proposes, admin approves (Phase 5, Step 6)', () => {
  let server
  let baseUrl
  let adminCookie
  let cashierCookie
  let secondCashierCookie
  let customerCookie
  let categoryId
  let productId
  let inventoryId
  // A second product, needed because only ONE request may be PENDING per
  // product at a time — so a test that wants two proposals open at once
  // has to spread them across two products.
  let otherProductId
  const createdUserIds = []
  const createdProductIds = []

  const admin = { username: `invreq_admin_${runId}`, password: 'Admin-Only-Password-9!' }
  const cashier = { role: 'CASHIER', name: 'Request Test Cashier', username: `invreq_cash_${runId}`, email: `invreq_cash_${runId}@example.com`, contactNumber: randomContactNumber(), password: 'Cashier-Password-9!' }
  const secondCashier = { role: 'CASHIER', name: 'Second Request Cashier', username: `invreq_cash2_${runId}`, email: `invreq_cash2_${runId}@example.com`, contactNumber: randomContactNumber(), password: 'Cashier-Password-9!' }
  const customer = { name: 'Request Test Customer', username: `invreq_cust_${runId}`, email: `invreq_cust_${runId}@example.com`, contactNumber: randomContactNumber(), password: 'Correct-Horse-Battery-9!' }

  before(async () => {
    server = app.listen(0)
    await new Promise((resolve) => server.once('listening', resolve))
    baseUrl = `http://localhost:${server.address().port}`

    const adminPasswordHash = await bcrypt.hash(admin.password, 4)
    const adminResult = await pool.query(`INSERT INTO users (username, password_hash, user_type) VALUES ($1, $2, 'ADMIN') RETURNING user_id`, [admin.username, adminPasswordHash])
    createdUserIds.push(adminResult.rows[0].user_id)
    await pool.query('INSERT INTO admins (user_id, name, contact_num, email) VALUES ($1, $2, $3, $4)', [adminResult.rows[0].user_id, 'Request Test Admin', randomContactNumber(), `invreq_admin_${runId}@example.com`])
    await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: admin.username, password: admin.password }) })
    const rawCode = '445566'
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

    const secondCashierCreate = await fetch(`${baseUrl}/api/staff`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ ...secondCashier, confirmPassword: secondCashier.password }) })
    assert.equal(secondCashierCreate.status, 201)
    const secondCashierRow = await pool.query('SELECT user_id FROM users WHERE username = $1', [secondCashier.username])
    createdUserIds.push(secondCashierRow.rows[0].user_id)
    const secondCashierLogin = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: secondCashier.username, password: secondCashier.password }) })
    secondCashierCookie = secondCashierLogin.headers.get('set-cookie').split(';')[0]

    await fetch(`${baseUrl}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...customer, confirmPassword: customer.password }) })
    const customerRow = await pool.query('SELECT user_id FROM users WHERE username = $1', [customer.username])
    createdUserIds.push(customerRow.rows[0].user_id)
    const customerLogin = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: customer.username, password: customer.password }) })
    customerCookie = customerLogin.headers.get('set-cookie').split(';')[0]

    const categoryResult = await pool.query('INSERT INTO categories (category_name) VALUES ($1) RETURNING category_id', [`Request Test Category ${runId}`])
    categoryId = categoryResult.rows[0].category_id

    const productResponse = await fetch(`${baseUrl}/api/products`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ categoryId, name: `Request Test Bun ${runId}`, price: 15 }) })
    productId = (await productResponse.json()).product.id
    createdProductIds.push(productId)
    await pool.query('UPDATE inventory SET stock_quantity = 12, min_stock_level = 3 WHERE product_id = $1', [productId])
    inventoryId = (await pool.query('SELECT inventory_id FROM inventory WHERE product_id = $1', [productId])).rows[0].inventory_id

    const otherProductResponse = await fetch(`${baseUrl}/api/products`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ categoryId, name: `Request Test Roll ${runId}`, price: 20 }) })
    otherProductId = (await otherProductResponse.json()).product.id
    createdProductIds.push(otherProductId)
    await pool.query('UPDATE inventory SET stock_quantity = 12, min_stock_level = 3 WHERE product_id = $1', [otherProductId])
  })

  after(async () => {
    await pool.query('DELETE FROM stock_alerts WHERE inventory_id = $1', [inventoryId]).catch(() => {})
    await pool.query('DELETE FROM inventory_movements WHERE inventory_id = $1', [inventoryId]).catch(() => {})
    await pool.query('DELETE FROM inventory_change_requests WHERE product_id = ANY($1)', [createdProductIds]).catch(() => {})
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

  test('POST /api/inventory/requests requires authentication', async () => {
    const response = await fetch(`${baseUrl}/api/inventory/requests`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId, proposedStockQuantity: 20, reason: 'x' }) })
    assert.equal(response.status, 401)
  })

  test('POST /api/inventory/requests rejects a customer and an admin — cashier only', async () => {
    const asCustomer = await fetch(`${baseUrl}/api/inventory/requests`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: customerCookie }, body: JSON.stringify({ productId, proposedStockQuantity: 20, reason: 'x' }) })
    assert.equal(asCustomer.status, 403)

    const asAdmin = await fetch(`${baseUrl}/api/inventory/requests`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ productId, proposedStockQuantity: 20, reason: 'x' }) })
    assert.equal(asAdmin.status, 403)
  })

  test('POST /api/inventory/requests rejects a missing product, missing reason, and an empty proposal', async () => {
    const badProduct = await fetch(`${baseUrl}/api/inventory/requests`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cashierCookie }, body: JSON.stringify({ productId: 'not-a-real-id', proposedStockQuantity: 20, reason: 'x' }) })
    assert.equal(badProduct.status, 422)

    const missingReason = await fetch(`${baseUrl}/api/inventory/requests`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cashierCookie }, body: JSON.stringify({ productId, proposedStockQuantity: 20 }) })
    assert.equal(missingReason.status, 422)
    assert.ok((await missingReason.json()).errors.reason)

    const emptyProposal = await fetch(`${baseUrl}/api/inventory/requests`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cashierCookie }, body: JSON.stringify({ productId, reason: 'x' }) })
    assert.equal(emptyProposal.status, 422)
  })

  // The core enforcement mechanism for "cashiers may only submit INVENTORY
  // requests, never PRODUCT_DETAILS" (PHASE5_PLAN.md, Step 6): the field
  // is never read from the body at all, so even an explicit attempt to
  // set it has no effect — the created row is INVENTORY regardless.
  test('a submitted requestType is ignored — every cashier request is INVENTORY, and observed stock is captured automatically', async () => {
    const response = await fetch(`${baseUrl}/api/inventory/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cashierCookie },
      body: JSON.stringify({ productId, proposedStockQuantity: 20, requestType: 'PRODUCT_DETAILS', proposedPrice: 999, reason: 'Shelf count came up higher than the system' }),
    })
    assert.equal(response.status, 201)
    const body = await response.json()
    assert.equal(body.request.observedStockQuantity, 12, 'should capture CURRENT stock (12), not anything the client sent')
    assert.equal(body.request.proposedStockQuantity, 20)
    assert.equal(body.request.status, 'PENDING')

    const dbRow = await pool.query('SELECT request_type, proposed_price FROM inventory_change_requests WHERE request_id = $1', [body.request.id])
    assert.equal(dbRow.rows[0].request_type, 'INVENTORY', 'requestType from the body must be ignored')
    assert.equal(dbRow.rows[0].proposed_price, null, 'proposedPrice from the body must be ignored — this route never touches product_details fields')

    // Reject it so later tests start from a clean PENDING-free slate.
    await fetch(`${baseUrl}/api/inventory/requests/${body.request.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ status: 'REJECTED' }) })
  })

  // Approval applies the difference the cashier OBSERVED to current stock
  // (Decision 2), which is only correct while ONE proposal is outstanding:
  // two pending rows capture the same baseline, so approving both applies
  // both deltas to it and compounds. The concurrent half matters because
  // the route's own check is a SELECT then an INSERT — four cashiers at
  // once used to produce four pending rows. Migration 004's partial unique
  // index is what actually holds it.
  test('a product may have only one pending request — a second is refused, serially and under concurrency', async () => {
    const propose = (cookie, quantity) => fetch(`${baseUrl}/api/inventory/requests`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ productId, proposedStockQuantity: quantity, reason: 'Shelf recount' }) })
    const pendingCount = async () => (await pool.query(`SELECT COUNT(*)::int AS n FROM inventory_change_requests WHERE product_id = $1 AND status = 'PENDING'`, [productId])).rows[0].n

    const first = await propose(cashierCookie, 20)
    assert.equal(first.status, 201)
    const firstId = (await first.json()).request.id

    // A different cashier gets the same refusal — the rule is per product,
    // not per cashier. The message must NAME the cashier holding it open:
    // GET /requests only shows a cashier their own rows, so without the
    // name this refusal points at something the reader cannot look up.
    const second = await propose(secondCashierCookie, 25)
    assert.equal(second.status, 409)
    assert.match((await second.json()).message, new RegExp(`^${cashier.name} already has a pending request`), 'the refusal must name whoever has the request open')
    assert.equal(await pendingCount(), 1)

    await fetch(`${baseUrl}/api/inventory/requests/${firstId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ status: 'REJECTED' }) })
    assert.equal(await pendingCount(), 0, 'reviewing the first must free the product for a new proposal')

    await pool.query(`UPDATE inventory_change_requests SET status = 'REJECTED' WHERE product_id = $1 AND status = 'PENDING'`, [productId])
  })

  // The check above only proves the route's friendly pre-check works. That
  // pre-check is a SELECT followed by a separate INSERT, so it cannot be
  // what enforces the rule — concurrent submissions can all read "nothing
  // pending" and all proceed. Migration 004's partial unique index is the
  // real guard, and this drives it directly through two transactions
  // rather than through concurrent HTTP requests: firing four fetches and
  // hoping they interleave passes with the index dropped, so it would
  // prove nothing. Holding one transaction open makes the collision
  // certain.
  test('the database itself refuses a second pending row, even when the route\'s pre-check is bypassed', async () => {
    const cashierId = (await pool.query('SELECT cashier_id FROM cashiers WHERE user_id = $1', [(await pool.query('SELECT user_id FROM users WHERE username = $1', [cashier.username])).rows[0].user_id])).rows[0].cashier_id
    const insert = (client, quantity) => client.query(
      `INSERT INTO inventory_change_requests (product_id, requested_by, request_type, observed_stock_quantity, proposed_stock_quantity, reason)
       VALUES ($1, $2, 'INVENTORY', 12, $3, 'Concurrent recount')`,
      [productId, cashierId, quantity],
    )

    const first = await pool.connect()
    const second = await pool.connect()
    try {
      await first.query('BEGIN')
      await second.query('BEGIN')

      await insert(first, 20)
      // Blocks on the index until `first` resolves, rather than failing
      // immediately — so it is started, not awaited, until after the commit.
      const contended = insert(second, 25)
      await first.query('COMMIT')

      await assert.rejects(contended, (error) => error.code === '23505' && error.constraint === 'inventory_change_requests_one_pending_per_product_idx', 'the second pending row must be refused by the unique index')
      await second.query('ROLLBACK')
    } finally {
      first.release()
      second.release()
    }

    const remaining = (await pool.query(`SELECT COUNT(*)::int AS n FROM inventory_change_requests WHERE product_id = $1 AND status = 'PENDING'`, [productId])).rows[0].n
    assert.equal(remaining, 1, 'exactly one pending row may survive two concurrent inserts')
    await pool.query(`UPDATE inventory_change_requests SET status = 'REJECTED' WHERE product_id = $1 AND status = 'PENDING'`, [productId])
  })

  test('GET /api/inventory/requests scopes to the cashier\'s own requests, but shows admin everything', async () => {
    // The two proposals go against DIFFERENT products on purpose: this
    // test needs both open at the same time to compare what each role can
    // see, and only one request may be PENDING per product.
    const first = await fetch(`${baseUrl}/api/inventory/requests`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cashierCookie }, body: JSON.stringify({ productId, proposedMinStockLevel: 4, reason: 'Raise the minimum' }) })
    const firstId = (await first.json()).request.id
    const second = await fetch(`${baseUrl}/api/inventory/requests`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: secondCashierCookie }, body: JSON.stringify({ productId: otherProductId, proposedMinStockLevel: 6, reason: 'Different cashier, different request' }) })
    const secondId = (await second.json()).request.id

    const asFirstCashier = await fetch(`${baseUrl}/api/inventory/requests`, { headers: { Cookie: cashierCookie } })
    const firstCashierIds = (await asFirstCashier.json()).requests.map((r) => r.id)
    assert.ok(firstCashierIds.includes(firstId))
    assert.ok(!firstCashierIds.includes(secondId), 'a cashier must not see another cashier\'s request')

    const asAdmin = await fetch(`${baseUrl}/api/inventory/requests`, { headers: { Cookie: adminCookie } })
    const adminIds = (await asAdmin.json()).requests.map((r) => r.id)
    assert.ok(adminIds.includes(firstId) && adminIds.includes(secondId), 'admin must see every cashier\'s requests')

    // Clean up both so they don't linger PENDING for later tests.
    await fetch(`${baseUrl}/api/inventory/requests/${firstId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ status: 'REJECTED' }) })
    await fetch(`${baseUrl}/api/inventory/requests/${secondId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ status: 'REJECTED' }) })
  })

  test('PATCH /api/inventory/requests/:requestId rejects a cashier — admin only', async () => {
    const created = await fetch(`${baseUrl}/api/inventory/requests`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cashierCookie }, body: JSON.stringify({ productId, proposedStockQuantity: 20, reason: 'x' }) })
    const requestId = (await created.json()).request.id

    const response = await fetch(`${baseUrl}/api/inventory/requests/${requestId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: cashierCookie }, body: JSON.stringify({ status: 'APPROVED' }) })
    assert.equal(response.status, 403)

    await fetch(`${baseUrl}/api/inventory/requests/${requestId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ status: 'REJECTED' }) })
  })

  test('PATCH rejects an invalid decision, and a malformed/missing request id', async () => {
    const created = await fetch(`${baseUrl}/api/inventory/requests`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cashierCookie }, body: JSON.stringify({ productId, proposedStockQuantity: 20, reason: 'x' }) })
    const requestId = (await created.json()).request.id

    const badDecision = await fetch(`${baseUrl}/api/inventory/requests/${requestId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ status: 'MAYBE' }) })
    assert.equal(badDecision.status, 422)

    for (const badId of ['abc', 'undefined', '1.5', '999999999']) {
      const response = await fetch(`${baseUrl}/api/inventory/requests/${badId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ status: 'APPROVED' }) })
      assert.equal(response.status, 404, `id "${badId}"`)
    }

    await fetch(`${baseUrl}/api/inventory/requests/${requestId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ status: 'REJECTED' }) })
  })

  test('rejecting a request changes nothing about stock', async () => {
    await pool.query('UPDATE inventory SET stock_quantity = 12 WHERE product_id = $1', [productId])

    const created = await fetch(`${baseUrl}/api/inventory/requests`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cashierCookie }, body: JSON.stringify({ productId, proposedStockQuantity: 50, reason: 'x' }) })
    const requestId = (await created.json()).request.id

    const response = await fetch(`${baseUrl}/api/inventory/requests/${requestId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ status: 'REJECTED', reviewerNote: 'Recount looks wrong, please redo' }) })
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.request.status, 'REJECTED')
    assert.equal(body.request.reviewerNote, 'Recount looks wrong, please redo')

    const stock = await pool.query('SELECT stock_quantity FROM inventory WHERE product_id = $1', [productId])
    assert.equal(stock.rows[0].stock_quantity, 12, 'a rejected request must not touch stock at all')

    const movements = await pool.query('SELECT 1 FROM inventory_movements WHERE request_id = $1', [requestId])
    assert.equal(movements.rows.length, 0, 'a rejected request must not write a movement row')
  })

  // The exact scenario Decision 2 exists for: stock moves between the
  // proposal and the review, so the absolute proposed value would be
  // wrong — the OBSERVED DELTA is what must be applied instead.
  test('approving applies the observed delta, not the stale absolute value, when stock has moved since the proposal', async () => {
    await pool.query('UPDATE inventory SET stock_quantity = 12 WHERE product_id = $1', [productId])

    // Cashier counts 12 on the shelf, proposes it should be 20 (a delivery
    // they're logging).
    const created = await fetch(`${baseUrl}/api/inventory/requests`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cashierCookie }, body: JSON.stringify({ productId, proposedStockQuantity: 20, reason: 'Delivery received, correcting the count' }) })
    const requestId = (await created.json()).request.id

    // Before the admin reviews it, 5 units sell through a real order.
    await pool.query('UPDATE inventory SET stock_quantity = stock_quantity - 5 WHERE product_id = $1', [productId])
    const midway = await pool.query('SELECT stock_quantity FROM inventory WHERE product_id = $1', [productId])
    assert.equal(midway.rows[0].stock_quantity, 7)

    // Approving now must land on 7 + (20 - 12) = 15 — NOT the stale 20.
    const response = await fetch(`${baseUrl}/api/inventory/requests/${requestId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ status: 'APPROVED' }) })
    assert.equal(response.status, 200)

    const stock = await pool.query('SELECT stock_quantity FROM inventory WHERE product_id = $1', [productId])
    assert.equal(stock.rows[0].stock_quantity, 15, 'must apply the observed delta (+8), not overwrite with the stale absolute 20')

    const movement = await pool.query('SELECT quantity_change, reason, request_id FROM inventory_movements WHERE request_id = $1', [requestId])
    assert.equal(movement.rows.length, 1)
    assert.equal(movement.rows[0].quantity_change, 8)
    assert.equal(movement.rows[0].reason, 'CORRECTION')
  })

  // The test above proves the observed-delta arithmetic across a WIDE gap
  // (stock moved between proposing and reviewing). This one closes the
  // NARROW gap inside the approval itself: read stock, compute a new
  // absolute figure in JavaScript, write it back. Without a lock, a sale
  // committing between that read and that write is clobbered by the
  // absolute write — arithmetic cannot help when both values come from the
  // same instant, so `FOR UPDATE` has to.
  //
  // Driven by holding a transaction open rather than firing concurrent
  // requests and hoping they interleave: an uncommitted UPDATE on the
  // inventory row makes the approval block on exactly the lock under test,
  // so the outcome is the same every run. With the lock the approval sees
  // 7 and lands on 15; without it, it reads the pre-sale 10 under MVCC and
  // writes 18, silently eating the 3 units that sold.
  // Polls until some backend in this database is genuinely parked waiting
  // on a lock. Both the locked and unlocked versions of the route end up
  // blocked — with FOR UPDATE on the SELECT, without it on the UPDATE —
  // so this only synchronises the test; it does not by itself decide the
  // outcome. What differs is WHAT each read before blocking, which is what
  // the final stock figure exposes.
  const waitForLockWait = async () => {
    for (let attempt = 0; attempt < 100; attempt++) {
      const waiting = await pool.query(`SELECT COUNT(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`)
      if (waiting.rows[0].n > 0) return true
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    return false
  }

  test('approving re-reads stock under a lock, so a sale committing mid-approval is not clobbered', async () => {
    await pool.query('UPDATE inventory SET stock_quantity = 10 WHERE product_id = $1', [productId])

    const created = await fetch(`${baseUrl}/api/inventory/requests`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cashierCookie }, body: JSON.stringify({ productId, proposedStockQuantity: 18, reason: 'Delivery received' }) })
    const requestId = (await created.json()).request.id

    const seller = await pool.connect()
    let approval
    try {
      await seller.query('BEGIN')
      // Three units sell, but the transaction is deliberately left open —
      // the row is now locked and the change is invisible to everyone else.
      await seller.query('UPDATE inventory SET stock_quantity = stock_quantity - 3 WHERE product_id = $1', [productId])

      // Started, not awaited: this blocks inside the route on the locked row.
      approval = fetch(`${baseUrl}/api/inventory/requests/${requestId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ status: 'APPROVED' }) })

      // Committing immediately here would be a bug in the TEST: the
      // approval might not have reached its read yet, so it would see the
      // committed 7 either way and the assertion below would pass with or
      // without the lock — which is exactly what happened on the first
      // attempt at this test. Waiting until a backend is genuinely stuck
      // on a lock is what guarantees the two paths diverge.
      const blocked = await waitForLockWait()
      assert.ok(blocked, 'the approval should be waiting on the seller\'s row lock before it commits')

      await seller.query('COMMIT')
    } finally {
      seller.release()
    }

    assert.equal((await approval).status, 200)

    const stock = await pool.query('SELECT stock_quantity FROM inventory WHERE product_id = $1', [productId])
    assert.equal(stock.rows[0].stock_quantity, 15, 'must apply the +8 delta to the POST-SALE stock of 7, not the stale 10 it read before the sale committed')

    // The movement must describe the change that actually happened. A
    // clobbered write breaks this quietly: it would log +8 against a stock
    // figure that moved by +11, so SUM(quantity_change) would stop
    // reconciling to stock_quantity — the one invariant the ledger exists
    // to uphold.
    const movement = await pool.query('SELECT quantity_change FROM inventory_movements WHERE request_id = $1', [requestId])
    assert.equal(movement.rows[0].quantity_change, 8, 'the movement must record the delta actually applied')
  })

  test('approving is refused with 409 if it would drive stock negative, and nothing is applied', async () => {
    await pool.query('UPDATE inventory SET stock_quantity = 15 WHERE product_id = $1', [productId])

    // Cashier observes 15, proposes 3 (reporting heavy spoilage).
    const created = await fetch(`${baseUrl}/api/inventory/requests`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cashierCookie }, body: JSON.stringify({ productId, proposedStockQuantity: 3, reason: 'Large spoilage found' }) })
    const requestId = (await created.json()).request.id

    // Before review, stock crashes to 2 for unrelated reasons (e.g. a
    // separate correction). The proposed delta (3 - 15 = -12) applied to
    // 2 would go to -10, which must be refused.
    await pool.query('UPDATE inventory SET stock_quantity = 2 WHERE product_id = $1', [productId])

    const response = await fetch(`${baseUrl}/api/inventory/requests/${requestId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ status: 'APPROVED' }) })
    assert.equal(response.status, 409)

    const stock = await pool.query('SELECT stock_quantity FROM inventory WHERE product_id = $1', [productId])
    assert.equal(stock.rows[0].stock_quantity, 2, 'stock must be unchanged after a refused approval')

    const stillPending = await pool.query('SELECT status FROM inventory_change_requests WHERE request_id = $1', [requestId])
    assert.equal(stillPending.rows[0].status, 'PENDING', 'a refused approval must leave the request open for a real decision')

    await fetch(`${baseUrl}/api/inventory/requests/${requestId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ status: 'REJECTED' }) })
  })

  test('a request cannot be reviewed twice', async () => {
    await pool.query('UPDATE inventory SET stock_quantity = 12 WHERE product_id = $1', [productId])
    const created = await fetch(`${baseUrl}/api/inventory/requests`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cashierCookie }, body: JSON.stringify({ productId, proposedStockQuantity: 20, reason: 'x' }) })
    const requestId = (await created.json()).request.id

    const first = await fetch(`${baseUrl}/api/inventory/requests/${requestId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ status: 'APPROVED' }) })
    assert.equal(first.status, 200)

    const second = await fetch(`${baseUrl}/api/inventory/requests/${requestId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ status: 'REJECTED' }) })
    assert.equal(second.status, 409)

    // Confirm the second (rejected-at-the-door) attempt didn't undo the first.
    const finalRequest = await pool.query('SELECT status FROM inventory_change_requests WHERE request_id = $1', [requestId])
    assert.equal(finalRequest.rows[0].status, 'APPROVED')
  })

  test('approving a proposed minStockLevel applies it as an absolute value', async () => {
    await pool.query('UPDATE inventory SET stock_quantity = 12, min_stock_level = 3 WHERE product_id = $1', [productId])
    const created = await fetch(`${baseUrl}/api/inventory/requests`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cashierCookie }, body: JSON.stringify({ productId, proposedMinStockLevel: 8, reason: 'We keep running low, raise the minimum' }) })
    const requestId = (await created.json()).request.id

    const response = await fetch(`${baseUrl}/api/inventory/requests/${requestId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ status: 'APPROVED' }) })
    assert.equal(response.status, 200)

    const row = await pool.query('SELECT stock_quantity, min_stock_level FROM inventory WHERE product_id = $1', [productId])
    assert.equal(row.rows[0].stock_quantity, 12, 'stock must be untouched — only minStockLevel was proposed')
    assert.equal(row.rows[0].min_stock_level, 8)
  })
})
