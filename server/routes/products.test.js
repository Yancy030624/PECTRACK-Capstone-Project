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
    // /verify-otp now requires the challenge token that /login issues
    // after the password check, so a seeded OTP row needs one too.
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

  // Regression: a malformed :id used to reach Postgres as an invalid
  // bigint literal and come back as a 500 on all three handlers.
  test('a malformed :id is treated as "not found" on read, update, and delete', async () => {
    for (const badId of ['abc', 'undefined', '1.5', '99999999999999999999']) {
      const read = await fetch(`${baseUrl}/api/products/${badId}`, { headers: { Cookie: adminCookie } })
      assert.equal(read.status, 404, `GET with id "${badId}"`)
      const update = await fetch(`${baseUrl}/api/products/${badId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ price: 10 }) })
      assert.equal(update.status, 404, `PATCH with id "${badId}"`)
      const remove = await fetch(`${baseUrl}/api/products/${badId}`, { method: 'DELETE', headers: { Cookie: adminCookie } })
      assert.equal(remove.status, 404, `DELETE with id "${badId}"`)
    }
  })

  // STOREFRONT_PLAN.md, Decision 2 — GET / and GET /:id must behave for a
  // caller with NO session cookie at all exactly the way they behave for a
  // CUSTOMER, and every write route must still refuse one outright. This
  // is the exposure surface the whole plan is organised around, so it gets
  // its own dedicated products (never toggled by another test) and asserts
  // on KNOWN PRODUCTS BY NAME rather than a count or "it returned an
  // array" — the plan's own warning is that a broken endpoint returning
  // nothing at all would pass a count-based assertion just as happily as a
  // correct one.
  describe('the public storefront catalogue (anonymous callers)', () => {
    let publicAvailableId
    let publicHiddenId

    before(async () => {
      const available = await fetch(`${baseUrl}/api/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
        body: JSON.stringify({ categoryId, name: `Public Loaf ${runId}`, description: 'Available to everyone', price: 45, variant: 'Whole' }),
      })
      publicAvailableId = (await available.json()).product.id
      createdProductIds.push(publicAvailableId)

      const hidden = await fetch(`${baseUrl}/api/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
        body: JSON.stringify({ categoryId, name: `Hidden Loaf ${runId}`, price: 45, availabilityStatus: false }),
      })
      publicHiddenId = (await hidden.json()).product.id
      createdProductIds.push(publicHiddenId)
    })

    test('an anonymous GET / returns 200 and includes the available product', async () => {
      const response = await fetch(`${baseUrl}/api/products`)
      assert.equal(response.status, 200)
      const { products } = await response.json()
      assert.ok(products.some((product) => product.id === publicAvailableId), 'the available product must be present')
      assert.ok(!products.some((product) => product.id === publicHiddenId), 'the hidden product must be absent')
    })

    test('the anonymous response is field-identical to what a CUSTOMER sees for the same product', async () => {
      const anonymous = await (await fetch(`${baseUrl}/api/products/${publicAvailableId}`)).json()
      const asCustomer = await (await fetch(`${baseUrl}/api/products/${publicAvailableId}`, { headers: { Cookie: customerCookie } })).json()
      assert.deepEqual(anonymous.product, asCustomer.product, 'anonymous must see exactly the CUSTOMER view — not a new, separate one')
    })

    // Guards against a field ever being ADDED to mapProductRow without
    // someone consciously deciding it is safe to publish. stock lives on
    // `inventory`, never on `products`, so this also proves the two tables
    // were never accidentally joined together for this response.
    test('the public response carries no stock or cost field, by name', async () => {
      const { product } = await (await fetch(`${baseUrl}/api/products/${publicAvailableId}`)).json()
      assert.deepEqual(Object.keys(product).sort(), ['availabilityStatus', 'categoryId', 'categoryName', 'description', 'id', 'imageUrl', 'name', 'price', 'variant'])
      for (const forbidden of ['stockQuantity', 'stock_quantity', 'cost', 'minStockLevel', 'min_stock_level']) {
        assert.ok(!(forbidden in product), `product must not carry a "${forbidden}" field`)
      }
    })

    test('an anonymous GET /:id for a hidden product is 404, never 403 and never the product', async () => {
      const response = await fetch(`${baseUrl}/api/products/${publicHiddenId}`)
      assert.equal(response.status, 404)
    })

    test('an anonymous POST, PATCH, and DELETE are all still refused — the write boundary did not move', async () => {
      const post = await fetch(`${baseUrl}/api/products`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ categoryId, name: `Should Never Exist ${runId}`, price: 10 }) })
      assert.equal(post.status, 401)

      const patch = await fetch(`${baseUrl}/api/products/${publicAvailableId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ price: 1 }) })
      assert.equal(patch.status, 401)

      const remove = await fetch(`${baseUrl}/api/products/${publicAvailableId}`, { method: 'DELETE' })
      assert.equal(remove.status, 401)

      // And the product must be provably untouched by the refused writes.
      const stillThere = await (await fetch(`${baseUrl}/api/products/${publicAvailableId}`)).json()
      assert.equal(stillThere.product.price, '45.00')
    })

    test('CASHIER and ADMIN are unaffected — they still see the hidden product too', async () => {
      const asCashier = await (await fetch(`${baseUrl}/api/products`, { headers: { Cookie: cashierCookie } })).json()
      assert.ok(asCashier.products.some((product) => product.id === publicHiddenId), 'cashier must still see the hidden product')

      const asAdmin = await (await fetch(`${baseUrl}/api/products`, { headers: { Cookie: adminCookie } })).json()
      assert.ok(asAdmin.products.some((product) => product.id === publicHiddenId), 'admin must still see the hidden product')
    })
  })

  // STOREFRONT_PLAN.md, Decision 5 — product photos. Same upload shape as
  // deliveries.js's proof-of-delivery route (the file was RENAMED, not
  // duplicated, when this became its second caller), tested the same way.
  describe('product images', () => {
    const tinyJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9])
    const tinyPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    let imageProductId
    let hiddenImageProductId

    before(async () => {
      const available = await fetch(`${baseUrl}/api/products`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ categoryId, name: `Image Test Loaf ${runId}`, price: 30 }) })
      imageProductId = (await available.json()).product.id
      createdProductIds.push(imageProductId)

      const hidden = await fetch(`${baseUrl}/api/products`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ categoryId, name: `Hidden Image Test Loaf ${runId}`, price: 30, availabilityStatus: false }) })
      hiddenImageProductId = (await hidden.json()).product.id
      createdProductIds.push(hiddenImageProductId)
    })

    test('a product with no photo yet reports imageUrl: null', async () => {
      const { product } = await (await fetch(`${baseUrl}/api/products/${imageProductId}`, { headers: { Cookie: adminCookie } })).json()
      assert.equal(product.imageUrl, null)
    })

    test('POST /:id/image is refused for a cashier and a customer — ADMIN only', async () => {
      const asCashier = await fetch(`${baseUrl}/api/products/${imageProductId}/image`, { method: 'POST', headers: { 'Content-Type': 'image/jpeg', Cookie: cashierCookie }, body: tinyJpeg })
      assert.equal(asCashier.status, 403)
      const asCustomer = await fetch(`${baseUrl}/api/products/${imageProductId}/image`, { method: 'POST', headers: { 'Content-Type': 'image/jpeg', Cookie: customerCookie }, body: tinyJpeg })
      assert.equal(asCustomer.status, 403)
    })

    test('an unsupported content type is a clean 422, never a 500', async () => {
      const response = await fetch(`${baseUrl}/api/products/${imageProductId}/image`, { method: 'POST', headers: { 'Content-Type': 'text/plain', Cookie: adminCookie }, body: 'not an image' })
      assert.equal(response.status, 422)
    })

    test('an admin can upload a photo, and it becomes fetchable by anyone', async () => {
      const upload = await fetch(`${baseUrl}/api/products/${imageProductId}/image`, { method: 'POST', headers: { 'Content-Type': 'image/jpeg', Cookie: adminCookie }, body: tinyJpeg })
      const uploadBody = await upload.json()
      assert.equal(upload.status, 201, `upload must succeed: ${JSON.stringify(uploadBody)}`)

      const { product: refetched } = await (await fetch(`${baseUrl}/api/products/${imageProductId}`)).json()
      assert.match(refetched.imageUrl, new RegExp(`/api/products/${imageProductId}/image$`))

      // Fetchable ANONYMOUSLY — a product photo is exactly as public as
      // the product itself (Decision 5), no cookie sent at all here.
      const download = await fetch(`${baseUrl}${refetched.imageUrl}`)
      assert.equal(download.status, 200)
      assert.match(download.headers.get('content-type'), /image\/jpeg/)
      const bytes = Buffer.from(await download.arrayBuffer())
      assert.deepEqual(bytes, tinyJpeg, 'the exact bytes uploaded must be the exact bytes served back')
    })

    test('uploading a second photo replaces the first — old bytes are gone, new bytes are served', async () => {
      const first = await fetch(`${baseUrl}/api/products/${imageProductId}/image`, { method: 'POST', headers: { 'Content-Type': 'image/jpeg', Cookie: adminCookie }, body: tinyJpeg })
      assert.equal(first.status, 201)
      const firstUrl = (await (await fetch(`${baseUrl}/api/products/${imageProductId}`)).json()).product.imageUrl

      const second = await fetch(`${baseUrl}/api/products/${imageProductId}/image`, { method: 'POST', headers: { 'Content-Type': 'image/png', Cookie: adminCookie }, body: tinyPng })
      assert.equal(second.status, 201)
      const secondUrl = (await (await fetch(`${baseUrl}/api/products/${imageProductId}`)).json()).product.imageUrl

      // Same product, same URL shape (it's keyed by product id, not by
      // upload) — what changed is what that URL now serves.
      assert.equal(firstUrl, secondUrl)
      const served = await fetch(`${baseUrl}${secondUrl}`)
      assert.match(served.headers.get('content-type'), /image\/png/)
      assert.deepEqual(Buffer.from(await served.arrayBuffer()), tinyPng, 'the OLD jpeg must be gone, not just shadowed')
    })

    test('DELETE /:id/image removes the photo — the product reverts to imageUrl: null, and the file 404s', async () => {
      const upload = await fetch(`${baseUrl}/api/products/${imageProductId}/image`, { method: 'POST', headers: { 'Content-Type': 'image/jpeg', Cookie: adminCookie }, body: tinyJpeg })
      assert.equal(upload.status, 201)
      const imageUrl = (await (await fetch(`${baseUrl}/api/products/${imageProductId}`)).json()).product.imageUrl

      const removed = await fetch(`${baseUrl}/api/products/${imageProductId}/image`, { method: 'DELETE', headers: { Cookie: adminCookie } })
      assert.equal(removed.status, 204)

      const { product } = await (await fetch(`${baseUrl}/api/products/${imageProductId}`)).json()
      assert.equal(product.imageUrl, null)

      const stillThere = await fetch(`${baseUrl}${imageUrl}`)
      assert.equal(stillThere.status, 404, 'the old URL must not keep serving a file the product no longer references')
    })

    // The same "an anonymous or CUSTOMER caller gets a 404, never a
    // confirmation" rule GET /:id already applies to the product row
    // itself (tested above) — the image route must apply it too, or a
    // photo would leak confirmation of a product's existence that the
    // product endpoint itself was careful never to give.
    test('a hidden product\'s image is a 404 for anonymous and CUSTOMER, but visible to staff', async () => {
      const upload = await fetch(`${baseUrl}/api/products/${hiddenImageProductId}/image`, { method: 'POST', headers: { 'Content-Type': 'image/jpeg', Cookie: adminCookie }, body: tinyJpeg })
      assert.equal(upload.status, 201)
      const imageUrl = `/api/products/${hiddenImageProductId}/image`

      const anonymous = await fetch(`${baseUrl}${imageUrl}`)
      assert.equal(anonymous.status, 404)
      const asCustomer = await fetch(`${baseUrl}${imageUrl}`, { headers: { Cookie: customerCookie } })
      assert.equal(asCustomer.status, 404)
      const asAdmin = await fetch(`${baseUrl}${imageUrl}`, { headers: { Cookie: adminCookie } })
      assert.equal(asAdmin.status, 200)
    })

    test('deleting a product with a photo cleans up its file — a later request for the id-scoped URL is 404, not a leaked file', async () => {
      const created = await fetch(`${baseUrl}/api/products`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ categoryId, name: `Deletable Image Test Loaf ${runId}`, price: 15 }) })
      const deletableId = (await created.json()).product.id
      const upload = await fetch(`${baseUrl}/api/products/${deletableId}/image`, { method: 'POST', headers: { 'Content-Type': 'image/jpeg', Cookie: adminCookie }, body: tinyJpeg })
      assert.equal(upload.status, 201)

      const deleted = await fetch(`${baseUrl}/api/products/${deletableId}`, { method: 'DELETE', headers: { Cookie: adminCookie } })
      assert.equal(deleted.status, 204)

      // The product itself is gone, so its own image route now 404s
      // through the "no such product" branch — this cannot prove the FILE
      // was deleted from disk (nothing can ask for it by product id any
      // more), but it does prove the delete path completed without
      // throwing on the cleanup step, which is what deleteFile's
      // `force: true` — the same guard delivery proof cleanup relies on —
      // exists to guarantee.
      const afterDelete = await fetch(`${baseUrl}/api/products/${deletableId}/image`)
      assert.equal(afterDelete.status, 404)
    })
  })
})

after(async () => {
  await pool.end()
})
