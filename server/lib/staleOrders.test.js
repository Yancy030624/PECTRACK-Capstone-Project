// Closing orders whose day has passed (lib/staleOrders.js, the adviser
// 2026-10-16). Orders are written straight into the database with a past
// date, the way leftovers from earlier days sit there. Run with: npm test
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { after, before, describe, test } from 'node:test'
import { pool } from '../db.js'
import { cancelledNote, closeStaleOrders, completedNote } from './staleOrders.js'

const runId = crypto.randomUUID().slice(0, 8)

describe('closing old orders', () => {
  let categoryId
  let productId
  const orderIds = []

  const stock = async () => Number((await pool.query('SELECT stock_quantity FROM inventory WHERE product_id = $1', [productId])).rows[0].stock_quantity)
  const orderStatus = async (orderId) => (await pool.query('SELECT status FROM orders WHERE order_id = $1', [orderId])).rows[0].status

  // An order of 3 buns at ₱10, placed `daysAgo` days ago, optionally needed
  // at `neededInDays` from now, with `paid` pesos paid in cash.
  const oldOrder = async ({ status, daysAgo = 2, neededInDays = null, paid = 0, dataSource = 'RECORDED' }) => {
    const order = await pool.query(
      `INSERT INTO orders (order_type, status, order_date, requested_fulfillment_time, total_amount, data_source)
       VALUES ('PICKUP', $1, CURRENT_TIMESTAMP - make_interval(days => $2::int),
               CASE WHEN $3::int IS NULL THEN NULL ELSE CURRENT_TIMESTAMP + make_interval(days => $3::int) END, 30, $4)
       RETURNING order_id`,
      [status, daysAgo, neededInDays, dataSource],
    )
    const orderId = order.rows[0].order_id
    orderIds.push(orderId)
    await pool.query('INSERT INTO order_details (order_id, product_id, quantity, unit_price) VALUES ($1, $2, 3, 10)', [orderId, productId])
    if (paid) await pool.query(`INSERT INTO payments (order_id, payment_method, amount, status, payment_date) VALUES ($1, 'CASH', $2, 'PAID', CURRENT_TIMESTAMP)`, [orderId, paid])
    return orderId
  }

  before(async () => {
    categoryId = (await pool.query('INSERT INTO categories (category_name) VALUES ($1) RETURNING category_id', [`Stale Test ${runId}`])).rows[0].category_id
    productId = (await pool.query(`INSERT INTO products (category_id, product_name, price, variant) VALUES ($1, 'Stale Test Bun', 10, $2) RETURNING product_id`, [categoryId, runId])).rows[0].product_id
    await pool.query('INSERT INTO inventory (product_id, stock_quantity) VALUES ($1, 100)', [productId])
  })

  after(async () => {
    await pool.query('DELETE FROM inventory_movements WHERE order_id = ANY($1)', [orderIds])
    await pool.query('DELETE FROM payments WHERE order_id = ANY($1)', [orderIds])
    await pool.query('DELETE FROM order_status_history WHERE order_id = ANY($1)', [orderIds])
    await pool.query('DELETE FROM order_details WHERE order_id = ANY($1)', [orderIds])
    await pool.query('DELETE FROM orders WHERE order_id = ANY($1)', [orderIds])
    await pool.query('DELETE FROM stock_alerts WHERE inventory_id IN (SELECT inventory_id FROM inventory WHERE product_id = $1)', [productId]).catch(() => {})
    await pool.query('DELETE FROM inventory WHERE product_id = $1', [productId])
    await pool.query('DELETE FROM products WHERE product_id = $1', [productId])
    await pool.query('DELETE FROM categories WHERE category_id = $1', [categoryId])
    await pool.end()
  })

  test('a paid order from an earlier day is completed, by the system', async () => {
    const orderId = await oldOrder({ status: 'READY_FOR_PICKUP', paid: 30 })
    await closeStaleOrders({ onlyOrderIds: orderIds })
    assert.equal(await orderStatus(orderId), 'COMPLETED')
    const history = await pool.query('SELECT updated_by, note FROM order_status_history WHERE order_id = $1', [orderId])
    assert.deepEqual(history.rows, [{ updated_by: null, note: completedNote }])
  })

  test('an unpaid order that was already baked is cancelled without putting stale bread back in stock', async () => {
    const orderId = await oldOrder({ status: 'IN_PRODUCTION' })
    const before = await stock()
    await closeStaleOrders({ onlyOrderIds: orderIds })
    assert.equal(await orderStatus(orderId), 'CANCELLED')
    assert.equal(await stock(), before)
    const note = (await pool.query('SELECT note FROM order_status_history WHERE order_id = $1', [orderId])).rows[0].note
    assert.ok(note.startsWith(cancelledNote))
  })

  test('an unpaid order that was never baked is cancelled and its stock comes back', async () => {
    const orderId = await oldOrder({ status: 'PLACED' })
    const before = await stock()
    await closeStaleOrders({ onlyOrderIds: orderIds })
    assert.equal(await orderStatus(orderId), 'CANCELLED')
    assert.equal(await stock(), before + 3)
    const movement = await pool.query(`SELECT changed_by, quantity_change FROM inventory_movements WHERE order_id = $1 AND reason = 'ORDER_CANCELLED'`, [orderId])
    assert.deepEqual(movement.rows, [{ changed_by: null, quantity_change: 3 }])
  })

  test('left open: part paid, still to come, today, and synthetic history', async () => {
    const partPaid = await oldOrder({ status: 'IN_PRODUCTION', paid: 10 })
    const neededLater = await oldOrder({ status: 'IN_PRODUCTION', neededInDays: 2 })
    const today = await oldOrder({ status: 'IN_PRODUCTION', daysAgo: 0 })
    const assumed = await oldOrder({ status: 'IN_PRODUCTION', dataSource: 'ASSUMED' })
    const result = await closeStaleOrders({ onlyOrderIds: orderIds })
    assert.ok(result.partPaid >= 1)
    for (const orderId of [partPaid, neededLater, today, assumed]) assert.equal(await orderStatus(orderId), 'IN_PRODUCTION', `order ${orderId}`)
  })

  test('running twice changes nothing the second time', async () => {
    const orderId = await oldOrder({ status: 'IN_PRODUCTION', paid: 30 })
    await closeStaleOrders({ onlyOrderIds: orderIds })
    await closeStaleOrders({ onlyOrderIds: orderIds })
    const history = await pool.query('SELECT COUNT(*)::int AS n FROM order_status_history WHERE order_id = $1', [orderId])
    assert.equal(history.rows[0].n, 1)
  })
})
