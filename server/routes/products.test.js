// Lightweight integration tests for product catalog management. Same
// approach as the other route tests: real Express app on an ephemeral
// port, real database. Run with: npm test
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { after, before, describe, test } from 'node:test'
import bcrypt from 'bcrypt'
import app from '../app.js'
import { pool } from '../db.js'

const runId = crypto.randomUUID().slice(0, 8)
const randomContactNumber = () => `09${Math.floor(100000000 + Math.random() * 899999999)}`

describe('product catalog management', () => {
  let server
  let baseUrl
  let adminCookie
  let cashierCookie
  let customerCookie
  let categoryId
  const createdUserIds = []
  const createdProductIds = []

  const admin = { username: `prodadmin_${runId}`, password: 'Admin-Only-Password-9!' }
  const cashier = { role: 'CASHIER', name: 'Test Cashier', username: `prodcash_${runId}`, email: `prodcash_${runId}@example.com`, contactNumber: randomContactNumber(), password: 'Cashier-Password-9!' }
  const customer = { name: 'Test Customer', username: `prodcust_${runId}`, email: `prodcust_${runId}@example.com`, contactNumber: randomContactNumber(), password: 'Correct-Horse-Battery-9!' }

  before(async () => {
    server = app.listen(0)
    await new Promise((resolve) => server.once('listening', resolve))
    baseUrl = `http://localhost:${server.address().port}`

    const adminPasswordHash = await bcrypt.hash(admin.password, 4)
    const adminResult = await pool.query(`INSERT INTO users (username, password_hash, user_type) VALUES ($1, $2, 'ADMIN') RETURNING user_id`, [admin.username, adminPasswordHash])
    createdUserIds.push(adminResult.rows[0].user_id)
    await pool.query('INSERT INTO admins (user_id, name, contact_num, email) VALUES ($1, $2, $3, $4)', [adminResult.rows[0].user_id, 'Product Test Admin', randomContactNumber(), `prodadmin_${runId}@example.com`])
    await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: admin.username, password: admin.password }) })
    const rawCode = '333444'
    await pool.query(`INSERT INTO otp_codes (user_id, code_hash, expires_at) VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '5 minutes')`, [adminResult.rows[0].user_id, crypto.createHash('sha256').update(rawCode).digest('hex')])
    const otpResponse = await fetch(`${baseUrl}/api/auth/verify-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: admin.username, code: rawCode }) })
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

    const categoryResult = await pool.query('INSERT INTO categories (category_name) VALUES ($1) RETURNING category_id', [`Test Category ${runId}`])
    categoryId = categoryResult.rows[0].category_id
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

  test('POST /api/products rejects a cashier (view-only for now, per Phase 4 scope)', async () => {
    const response = await fetch(`${baseUrl}/api/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cashierCookie },
      body: JSON.stringify({ categoryId, name: `Should Not Exist ${runId}`, price: 10 }),
    })
    assert.equal(response.status, 403)
  })

  test('POST /api/products creates a product and its matching inventory row', async () => {
    const response = await fetch(`${baseUrl}/api/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ categoryId, name: `Pandesal ${runId}`, description: 'Soft bread rolls', price: 65.5, variant: '10-pack' }),
    })
    assert.equal(response.status, 201)
    const body = await response.json()
    assert.equal(body.product.name, `Pandesal ${runId}`)
    assert.equal(body.product.price, '65.50')
    assert.equal(body.product.availabilityStatus, true)
    createdProductIds.push(body.product.id)

    const inventoryRow = await pool.query('SELECT stock_quantity, min_stock_level FROM inventory WHERE product_id = $1', [body.product.id])
    assert.equal(inventoryRow.rows[0].stock_quantity, 0)
    assert.equal(inventoryRow.rows[0].min_stock_level, 0)
  })

  test('POST /api/products rejects a duplicate name+variant+category combination', async () => {
    const response = await fetch(`${baseUrl}/api/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ categoryId, name: `Pandesal ${runId}`, price: 65.5, variant: '10-pack' }),
    })
    assert.equal(response.status, 409)
  })

  test('POST /api/products rejects an invalid price without creating anything', async () => {
    const response = await fetch(`${baseUrl}/api/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ categoryId, name: `Bad Price Product ${runId}`, price: -5 }),
    })
    assert.equal(response.status, 422)
    const { rows } = await pool.query('SELECT 1 FROM products WHERE product_name = $1', [`Bad Price Product ${runId}`])
    assert.equal(rows.length, 0)
  })

  test('PATCH /api/products/:id updates only the fields sent, including clearing description to null', async () => {
    const productId = createdProductIds[0]
    const response = await fetch(`${baseUrl}/api/products/${productId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ price: 70, description: null }),
    })
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.product.price, '70.00')
    assert.equal(body.product.description, null)
    assert.equal(body.product.name, `Pandesal ${runId}`, 'name was not sent, so it must be unchanged')
  })

  test('GET /api/products hides unavailable products from a customer but not from admin/cashier', async () => {
    const productId = createdProductIds[0]
    await fetch(`${baseUrl}/api/products/${productId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ availabilityStatus: false }) })

    const asCustomer = await fetch(`${baseUrl}/api/products`, { headers: { Cookie: customerCookie } })
    const customerList = (await asCustomer.json()).products
    assert.ok(!customerList.some((product) => product.id === productId), 'customer should not see the unavailable product in the list')

    const asAdmin = await fetch(`${baseUrl}/api/products`, { headers: { Cookie: adminCookie } })
    const adminList = (await asAdmin.json()).products
    assert.ok(adminList.some((product) => product.id === productId), 'admin should still see the unavailable product')

    const asCashier = await fetch(`${baseUrl}/api/products`, { headers: { Cookie: cashierCookie } })
    const cashierList = (await asCashier.json()).products
    assert.ok(cashierList.some((product) => product.id === productId), 'cashier should still see the unavailable product')

    const detailAsCustomer = await fetch(`${baseUrl}/api/products/${productId}`, { headers: { Cookie: customerCookie } })
    assert.equal(detailAsCustomer.status, 404, 'a hidden product looks nonexistent to a customer, not forbidden')

    // Restore availability for the rest of the suite.
    await fetch(`${baseUrl}/api/products/${productId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ availabilityStatus: true }) })
  })

  test('DELETE /api/products/:id is blocked once the product has order history', async () => {
    const productId = createdProductIds[0]
    // No order-creation endpoint exists yet (that's a later phase) — seed
    // the minimal order/order_details rows directly to set up this
    // data-integrity scenario.
    const orderResult = await pool.query(`INSERT INTO orders (order_type, status) VALUES ('PICKUP', 'PLACED') RETURNING order_id`)
    const orderId = orderResult.rows[0].order_id
    await pool.query('INSERT INTO order_details (order_id, product_id, quantity, unit_price) VALUES ($1, $2, 1, 70.00)', [orderId, productId])

    const blockedDelete = await fetch(`${baseUrl}/api/products/${productId}`, { method: 'DELETE', headers: { Cookie: adminCookie } })
    assert.equal(blockedDelete.status, 409)

    await pool.query('DELETE FROM order_details WHERE order_id = $1', [orderId])
    await pool.query('DELETE FROM orders WHERE order_id = $1', [orderId])
  })

  test('DELETE /api/products/:id succeeds for a product with no history', async () => {
    const createResponse = await fetch(`${baseUrl}/api/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ categoryId, name: `Disposable Product ${runId}`, price: 15 }),
    })
    const productId = (await createResponse.json()).product.id

    const deleteResponse = await fetch(`${baseUrl}/api/products/${productId}`, { method: 'DELETE', headers: { Cookie: adminCookie } })
    assert.equal(deleteResponse.status, 204)

    const { rows } = await pool.query('SELECT 1 FROM inventory WHERE product_id = $1', [productId])
    assert.equal(rows.length, 0, 'inventory row should be cascade-deleted along with the product')
  })
})

after(async () => {
  await pool.end()
})
