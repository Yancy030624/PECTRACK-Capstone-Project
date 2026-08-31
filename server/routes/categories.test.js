// Lightweight integration tests for category management. Same approach as
// the other route tests: real Express app on an ephemeral port, real
// database. Run with: npm test
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { after, before, describe, test } from 'node:test'
import bcrypt from 'bcrypt'
import app from '../app.js'
import { pool } from '../db.js'

const runId = crypto.randomUUID().slice(0, 8)
const randomContactNumber = () => `09${Math.floor(100000000 + Math.random() * 899999999)}`

describe('category management', () => {
  let server
  let baseUrl
  let adminCookie
  let customerCookie
  const createdUserIds = []
  const createdCategoryIds = []

  const admin = { username: `catadmin_${runId}`, password: 'Admin-Only-Password-9!' }
  const customer = { name: 'Test Customer', username: `catcust_${runId}`, email: `catcust_${runId}@example.com`, contactNumber: randomContactNumber(), password: 'Correct-Horse-Battery-9!' }

  before(async () => {
    server = app.listen(0)
    await new Promise((resolve) => server.once('listening', resolve))
    baseUrl = `http://localhost:${server.address().port}`

    const adminPasswordHash = await bcrypt.hash(admin.password, 4)
    const adminResult = await pool.query(`INSERT INTO users (username, password_hash, user_type) VALUES ($1, $2, 'ADMIN') RETURNING user_id`, [admin.username, adminPasswordHash])
    createdUserIds.push(adminResult.rows[0].user_id)
    await pool.query('INSERT INTO admins (user_id, name, contact_num, email) VALUES ($1, $2, $3, $4)', [adminResult.rows[0].user_id, 'Category Test Admin', randomContactNumber(), `catadmin_${runId}@example.com`])
    await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: admin.username, password: admin.password }) })
    const rawCode = '111222'
    await pool.query(`INSERT INTO otp_codes (user_id, code_hash, expires_at) VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '5 minutes')`, [adminResult.rows[0].user_id, crypto.createHash('sha256').update(rawCode).digest('hex')])
    const otpResponse = await fetch(`${baseUrl}/api/auth/verify-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: admin.username, code: rawCode }) })
    adminCookie = otpResponse.headers.get('set-cookie').split(';')[0]

    await fetch(`${baseUrl}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...customer, confirmPassword: customer.password }) })
    const customerRow = await pool.query('SELECT user_id FROM users WHERE username = $1', [customer.username])
    createdUserIds.push(customerRow.rows[0].user_id)
    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: customer.username, password: customer.password }) })
    customerCookie = loginResponse.headers.get('set-cookie').split(';')[0]
  })

  after(async () => {
    for (const id of createdCategoryIds) await pool.query('DELETE FROM categories WHERE category_id = $1', [id]).catch(() => {})
    await pool.query('DELETE FROM customers WHERE user_id = ANY($1)', [createdUserIds])
    await pool.query('DELETE FROM admins WHERE user_id = ANY($1)', [createdUserIds])
    await pool.query('DELETE FROM users WHERE user_id = ANY($1)', [createdUserIds])
    await new Promise((resolve) => server.close(resolve))
  })

  test('GET /api/categories requires authentication', async () => {
    const response = await fetch(`${baseUrl}/api/categories`)
    assert.equal(response.status, 401)
  })

  test('GET /api/categories works for a plain customer', async () => {
    const response = await fetch(`${baseUrl}/api/categories`, { headers: { Cookie: customerCookie } })
    assert.equal(response.status, 200)
    assert.ok(Array.isArray((await response.json()).categories))
  })

  test('POST /api/categories rejects a non-admin', async () => {
    const response = await fetch(`${baseUrl}/api/categories`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: customerCookie }, body: JSON.stringify({ name: `Should Not Exist ${runId}` }) })
    assert.equal(response.status, 403)
  })

  test('POST /api/categories creates a category as admin', async () => {
    const response = await fetch(`${baseUrl}/api/categories`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ name: `Breads ${runId}` }) })
    assert.equal(response.status, 201)
    const body = await response.json()
    assert.equal(body.category.name, `Breads ${runId}`)
    createdCategoryIds.push(body.category.id)
  })

  test('POST /api/categories rejects a duplicate name', async () => {
    const response = await fetch(`${baseUrl}/api/categories`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ name: `Breads ${runId}` }) })
    assert.equal(response.status, 409)
  })

  test('PATCH /api/categories/:id renames a category', async () => {
    const id = createdCategoryIds[0]
    const response = await fetch(`${baseUrl}/api/categories/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ name: `Renamed Breads ${runId}` }) })
    assert.equal(response.status, 200)
    assert.equal((await response.json()).category.name, `Renamed Breads ${runId}`)
  })

  test('PATCH /api/categories/:id returns 404 for a nonexistent category', async () => {
    const response = await fetch(`${baseUrl}/api/categories/999999999`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ name: 'Nope' }) })
    assert.equal(response.status, 404)
  })

  test('DELETE /api/categories/:id is blocked while a product still references it, then succeeds once the product is gone', async () => {
    const category = await fetch(`${baseUrl}/api/categories`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ name: `Cakes ${runId}` }) })
    const categoryId = (await category.json()).category.id

    const product = await fetch(`${baseUrl}/api/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ categoryId, name: `Test Cake ${runId}`, price: 250, description: 'A cake', variant: null }),
    })
    assert.equal(product.status, 201)
    const productId = (await product.json()).product.id

    const blockedDelete = await fetch(`${baseUrl}/api/categories/${categoryId}`, { method: 'DELETE', headers: { Cookie: adminCookie } })
    assert.equal(blockedDelete.status, 409)

    await fetch(`${baseUrl}/api/products/${productId}`, { method: 'DELETE', headers: { Cookie: adminCookie } })
    const allowedDelete = await fetch(`${baseUrl}/api/categories/${categoryId}`, { method: 'DELETE', headers: { Cookie: adminCookie } })
    assert.equal(allowedDelete.status, 204)
  })
})

after(async () => {
  await pool.end()
})
