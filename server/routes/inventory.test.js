// Lightweight integration tests for GET /api/inventory (Phase 5, Step 1 —
// see PHASE5_PLAN.md). Same approach as the other route tests: real Express
// app on an ephemeral port, real database. Run with: npm test
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { after, before, beforeEach, describe, test } from 'node:test'
import bcrypt from 'bcrypt'
import app from '../app.js'
import { resetRateLimits } from '../lib/security.js'
import { pool } from '../db.js'

const runId = crypto.randomUUID().slice(0, 8)
const randomContactNumber = () => `09${Math.floor(100000000 + Math.random() * 899999999)}`

describe('inventory list', () => {
  // The rate limiter (lib/security.js) counts by client IP, and every
  // request in this suite comes from the same one — so without a reset
  // the tests would throttle each other rather than the abuse the limiter
  // exists to stop. Resetting per test is ordinary test isolation: the
  // limiter itself is untouched and fully active in production.
  beforeEach(resetRateLimits)

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
  const customer = { name: 'Inventory Test Customer', firstName: 'Inventory Test', lastName: 'Customer', agree: true, username: `invcust_${runId}`, email: `invcust_${runId}@example.com`, contactNumber: randomContactNumber(), password: 'Correct-Horse-Battery-9!' }

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
    // Fixture: confirm the email the way clicking the emailed link would
    // (migration 016). This suite is not testing verification — auth.test.js
    // is — so its customers start verified and can place orders.
    await pool.query('UPDATE customers SET email_verified_at = CURRENT_TIMESTAMP WHERE user_id = (SELECT user_id FROM users WHERE username = $1)', [customer.username])
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
  // The rate limiter (lib/security.js) counts by client IP, and every
  // request in this suite comes from the same one — so without a reset
  // the tests would throttle each other rather than the abuse the limiter
  // exists to stop. Resetting per test is ordinary test isolation: the
  // limiter itself is untouched and fully active in production.
  beforeEach(resetRateLimits)

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

  // CLIENT_REVISIONS_PLAN.md, R1 — cashiers encode stock themselves, with
  // no approval step; the ledger records which cashier did it. The minimum
  // level stays an admin setting.
  test('a cashier changes the stock count directly, and the ledger names the cashier', async () => {
    const before = (await pool.query('SELECT stock_quantity FROM inventory WHERE product_id = $1', [productId])).rows[0].stock_quantity
    const response = await fetch(`${baseUrl}/api/inventory/${productId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: cashierCookie }, body: JSON.stringify({ stockQuantity: before + 4, reason: 'RESTOCK', note: 'Morning delivery' }) })
    assert.equal(response.status, 200)
    assert.equal((await pool.query('SELECT stock_quantity FROM inventory WHERE product_id = $1', [productId])).rows[0].stock_quantity, before + 4)
    const movement = (await pool.query(
      `SELECT m.reason, m.quantity_change, u.user_type FROM inventory_movements m JOIN inventory i ON i.inventory_id = m.inventory_id JOIN users u ON u.user_id = m.changed_by
        WHERE i.product_id = $1 ORDER BY m.movement_id DESC LIMIT 1`,
      [productId],
    )).rows[0]
    assert.deepEqual({ reason: movement.reason, change: movement.quantity_change, by: movement.user_type }, { reason: 'RESTOCK', change: 4, by: 'CASHIER' })

    // The later tests in this block count on the product's starting stock
    // and on its ledger holding only their own rows.
    await pool.query('UPDATE inventory SET stock_quantity = $2 WHERE product_id = $1', [productId, before])
    await pool.query(`DELETE FROM inventory_movements WHERE inventory_id = (SELECT inventory_id FROM inventory WHERE product_id = $1) AND reason = 'RESTOCK' AND note = 'Morning delivery'`, [productId])
  })

  test('Add puts pieces ON TOP of the shelf count, as a restock with no reason typed', async () => {
    const before = (await pool.query('SELECT stock_quantity FROM inventory WHERE product_id = $1', [productId])).rows[0].stock_quantity
    const response = await fetch(`${baseUrl}/api/inventory/${productId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: cashierCookie }, body: JSON.stringify({ addQuantity: 50 }) })
    assert.equal(response.status, 200, await response.clone().text())
    assert.equal((await pool.query('SELECT stock_quantity FROM inventory WHERE product_id = $1', [productId])).rows[0].stock_quantity, before + 50, '7 + 50 is 57, never 50')
    const movement = (await pool.query(
      `SELECT m.reason, m.quantity_change FROM inventory_movements m JOIN inventory i ON i.inventory_id = m.inventory_id WHERE i.product_id = $1 ORDER BY m.movement_id DESC LIMIT 1`,
      [productId],
    )).rows[0]
    assert.deepEqual({ reason: movement.reason, change: movement.quantity_change }, { reason: 'RESTOCK', change: 50 })

    for (const bad of [0, -3, 2.5, 'ten']) {
      const refused = await fetch(`${baseUrl}/api/inventory/${productId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: cashierCookie }, body: JSON.stringify({ addQuantity: bad }) })
      assert.equal(refused.status, 422, `addQuantity ${bad}`)
    }

    await pool.query('UPDATE inventory SET stock_quantity = $2 WHERE product_id = $1', [productId, before])
    await pool.query(`DELETE FROM inventory_movements WHERE movement_id = (SELECT max(m.movement_id) FROM inventory_movements m JOIN inventory i ON i.inventory_id = m.inventory_id WHERE i.product_id = $1)`, [productId])
  })

  test('a cashier cannot change the minimum level', async () => {
    const response = await fetch(`${baseUrl}/api/inventory/${productId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: cashierCookie }, body: JSON.stringify({ minStockLevel: 8 }) })
    assert.equal(response.status, 403)
  })

  test('a malformed or nonexistent product id is treated as "not found"', async () => {
    for (const badId of ['abc', 'undefined', '1.5', '99999999999999999999', '999999999']) {
      const response = await fetch(`${baseUrl}/api/inventory/${badId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ minStockLevel: 8 }) })
      assert.equal(response.status, 404, `id "${badId}"`)
    }
  })

  test('updates minStockLevel without requiring a reason', async () => {
    const response = await fetch(`${baseUrl}/api/inventory/${productId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ minStockLevel: 8 }),
    })
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.item.minStockLevel, 8)
    // Untouched by this request — proves COALESCE preserved it.
    assert.equal(body.item.stockQuantity, 20)
    // No expiry any more (CLIENT_REVISIONS_PLAN.md, R3).
    assert.ok(!('expirationDate' in body.item) && !('expired' in body.item))
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

  // A reason and a new figure arrive separately, and used to be accepted
  // in any combination. RESTOCK only adds; REJECT only removes.
  test('a reason that contradicts the direction of the change is refused, and the ledger is untouched', async () => {
    // Stock is 35 going in.
    const before = await pool.query('SELECT COUNT(*)::int AS n FROM inventory_movements WHERE inventory_id = $1', [inventoryId])
    const restockDown = await fetch(`${baseUrl}/api/inventory/${productId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ stockQuantity: 30, reason: 'RESTOCK' }) })
    assert.equal(restockDown.status, 422)
    const rejectUp = await fetch(`${baseUrl}/api/inventory/${productId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ stockQuantity: 40, reason: 'REJECT' }) })
    assert.equal(rejectUp.status, 422)
    const after = await pool.query('SELECT COUNT(*)::int AS n, (SELECT stock_quantity FROM inventory WHERE inventory_id = $1) AS stock FROM inventory_movements WHERE inventory_id = $1', [inventoryId])
    assert.equal(after.rows[0].n, before.rows[0].n)
    assert.equal(after.rows[0].stock, 35)
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

  test('a negative movement (reject) is recorded with the correct sign', async () => {
    // Stock is 35 going in.
    const response = await fetch(`${baseUrl}/api/inventory/${productId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ stockQuantity: 30, reason: 'REJECT', note: 'Five rejected at the end of the day' }),
    })
    assert.equal(response.status, 200)
    assert.equal((await response.json()).item.stockQuantity, 30)

    const latest = await pool.query('SELECT quantity_change, reason FROM inventory_movements WHERE inventory_id = $1 ORDER BY movement_id DESC LIMIT 1', [inventoryId])
    assert.equal(latest.rows[0].quantity_change, -5) // 30 - 35
    assert.equal(latest.rows[0].reason, 'REJECT')
  })

  // CLIENT_REVISIONS_PLAN.md, R3 — REJECT is the one loss reason a person
  // may record. The older loss reasons stay in the enum for past rows only,
  // so a new edit naming one is refused, and the ledger is untouched.
  test('the retired loss reasons are refused for new edits', async () => {
    // Stock is 30 going in from the previous test.
    const before = await pool.query('SELECT COUNT(*)::int AS n FROM inventory_movements WHERE inventory_id = $1', [inventoryId])
    for (const reason of ['SPOILAGE', 'PRODUCTION_LOSS', 'EXPIRED', 'DAMAGED']) {
      const response = await fetch(`${baseUrl}/api/inventory/${productId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
        body: JSON.stringify({ stockQuantity: 25, reason }),
      })
      assert.equal(response.status, 422, reason)
      assert.ok((await response.json()).errors.reason, reason)
    }
    const after = await pool.query('SELECT COUNT(*)::int AS n, (SELECT stock_quantity FROM inventory WHERE inventory_id = $1) AS stock FROM inventory_movements WHERE inventory_id = $1', [inventoryId])
    assert.equal(after.rows[0].n, before.rows[0].n)
    assert.equal(after.rows[0].stock, 30)
  })

  // syncStockAlert itself is unit-tested thoroughly in lib/inventory.test.js
  // — this just confirms it's actually WIRED IN to this route (min level 5;
  // whatever stock is going in, this PATCH sets it ABSOLUTELY to 5, so the
  // prior test's ending figure doesn't matter here).
  test('dropping stock to the minimum opens an alert; restoring it resolves the alert', async () => {
    const dropResponse = await fetch(`${baseUrl}/api/inventory/${productId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ stockQuantity: 5, reason: 'REJECT' }) })
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
