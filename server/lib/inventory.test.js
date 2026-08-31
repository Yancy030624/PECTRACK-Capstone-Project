// Focused tests for syncStockAlert (server/lib/inventory.js), called
// directly against a raw client rather than through HTTP — it's shared by
// three different routes (order placement/cancellation, admin direct
// edit), so testing its rules thoroughly once here is better than
// triplicating the same coverage at every call site. See orders.test.js
// and inventory.test.js for a couple of end-to-end checks confirming it's
// actually wired into those routes. Run with: npm test
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { after, before, beforeEach, describe, test } from 'node:test'
import { pool } from '../db.js'
import { syncStockAlert } from './inventory.js'

const runId = crypto.randomUUID().slice(0, 8)

describe('syncStockAlert', () => {
  let categoryId
  let productId
  let inventoryId

  before(async () => {
    const category = await pool.query('INSERT INTO categories (category_name) VALUES ($1) RETURNING category_id', [`Alert Test Category ${runId}`])
    categoryId = category.rows[0].category_id
    const product = await pool.query('INSERT INTO products (category_id, product_name, price) VALUES ($1, $2, $3) RETURNING product_id', [categoryId, `Alert Test Loaf ${runId}`, 25])
    productId = product.rows[0].product_id
    const inventory = await pool.query('INSERT INTO inventory (product_id, stock_quantity, min_stock_level) VALUES ($1, 0, 5) RETURNING inventory_id', [productId])
    inventoryId = inventory.rows[0].inventory_id
  })

  after(async () => {
    await pool.query('DELETE FROM stock_alerts WHERE inventory_id = $1', [inventoryId])
    await pool.query('DELETE FROM inventory WHERE product_id = $1', [productId])
    await pool.query('DELETE FROM products WHERE product_id = $1', [productId])
    await pool.query('DELETE FROM categories WHERE category_id = $1', [categoryId])
  })

  // Every test starts from a clean slate — no open alerts — so each one
  // can assert exact row counts without depending on execution order.
  beforeEach(async () => {
    await pool.query('DELETE FROM stock_alerts WHERE inventory_id = $1', [inventoryId])
  })

  const openAlertCount = async () => (await pool.query('SELECT COUNT(*)::int AS n FROM stock_alerts WHERE inventory_id = $1 AND is_resolved = FALSE', [inventoryId])).rows[0].n

  test('stock above the minimum creates no alert', async () => {
    await syncStockAlert(pool, { inventoryId, stockQuantity: 10, minStockLevel: 5 })
    assert.equal(await openAlertCount(), 0)
  })

  test('stock at or below the minimum opens exactly one alert, with a readable message', async () => {
    await syncStockAlert(pool, { inventoryId, stockQuantity: 5, minStockLevel: 5 }) // exactly at the line counts as low
    assert.equal(await openAlertCount(), 1)

    const { rows } = await pool.query('SELECT alert_message FROM stock_alerts WHERE inventory_id = $1 AND is_resolved = FALSE', [inventoryId])
    assert.match(rows[0].alert_message, new RegExp(`Alert Test Loaf ${runId}`))
    assert.match(rows[0].alert_message, /5/)
  })

  // The exact scenario the plan calls out: without this, a popular
  // product sitting below its minimum would get a new row every time an
  // order nudged it lower, flooding whatever screen reads this table.
  test('repeated low-stock calls do not create duplicate alerts', async () => {
    await syncStockAlert(pool, { inventoryId, stockQuantity: 4, minStockLevel: 5 })
    await syncStockAlert(pool, { inventoryId, stockQuantity: 3, minStockLevel: 5 })
    await syncStockAlert(pool, { inventoryId, stockQuantity: 2, minStockLevel: 5 })
    assert.equal(await openAlertCount(), 1, 'three low-stock calls in a row must still leave exactly one open alert')
  })

  test('climbing back above the minimum resolves the open alert', async () => {
    await syncStockAlert(pool, { inventoryId, stockQuantity: 2, minStockLevel: 5 })
    assert.equal(await openAlertCount(), 1)

    await syncStockAlert(pool, { inventoryId, stockQuantity: 8, minStockLevel: 5 })
    assert.equal(await openAlertCount(), 0)

    const resolved = await pool.query('SELECT is_resolved FROM stock_alerts WHERE inventory_id = $1', [inventoryId])
    assert.equal(resolved.rows[0].is_resolved, true, 'the row should be marked resolved, not deleted — it stays as history')
  })

  test('a fresh low-stock dip after resolution opens a NEW alert rather than reusing the resolved one', async () => {
    await syncStockAlert(pool, { inventoryId, stockQuantity: 2, minStockLevel: 5 }) // open
    await syncStockAlert(pool, { inventoryId, stockQuantity: 8, minStockLevel: 5 }) // resolve
    await syncStockAlert(pool, { inventoryId, stockQuantity: 1, minStockLevel: 5 }) // open again

    const all = await pool.query('SELECT is_resolved FROM stock_alerts WHERE inventory_id = $1 ORDER BY alert_id', [inventoryId])
    assert.equal(all.rows.length, 2, 'the resolved cycle and the new cycle should both exist as separate rows')
    assert.equal(all.rows[0].is_resolved, true)
    assert.equal(all.rows[1].is_resolved, false)
  })

  test('resolving when nothing is open is a harmless no-op', async () => {
    await syncStockAlert(pool, { inventoryId, stockQuantity: 20, minStockLevel: 5 })
    assert.equal(await openAlertCount(), 0)
  })
})

after(async () => {
  await pool.end()
})
