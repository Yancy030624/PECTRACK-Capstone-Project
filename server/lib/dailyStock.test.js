// Soft and hard breads (RULES-PLANS/DAILY_STOCK_PLAN.md): the 5:00 AM
// top-up, the production list, and soft-bread advanced orders. Real
// database; every product here is the test's own. Run with: npm test
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { after, before, describe, test } from 'node:test'
import { pool } from '../db.js'
import { applyCancellationEffects } from './orderStatus.js'
import { forecastShortfall, productionFor, runDailyStockReset } from './dailyStock.js'

const runId = crypto.randomUUID().slice(0, 8)
// Days far in the future, so they never collide with a real top-up.
const offset = Math.floor(Math.random() * 3000)
const futureDay = (extra = 0) => {
  const date = new Date(Date.UTC(2090, 0, 1) + (offset + extra) * 86400000)
  return date.toISOString().slice(0, 10)
}

describe('soft and hard breads', () => {
  let categoryId
  let soft
  let hard
  const days = []
  const orderIds = []

  const stockOf = async (productId) => (await pool.query('SELECT stock_quantity FROM inventory WHERE product_id = $1', [productId])).rows[0].stock_quantity
  const makeProduct = async (name, type, inventory) => {
    const id = (await pool.query('INSERT INTO products (category_id, product_name, price, stock_type) VALUES ($1, $2, 10, $3) RETURNING product_id', [categoryId, `${name} ${runId}`, type])).rows[0].product_id
    await pool.query('INSERT INTO inventory (product_id, stock_quantity, min_stock_level, standard_stock, target_stock) VALUES ($1, $2, $3, $4, $5)', [id, inventory.stock, inventory.min ?? 0, inventory.standard ?? 0, inventory.target ?? 0])
    return id
  }

  before(async () => {
    categoryId = (await pool.query('INSERT INTO categories (category_name) VALUES ($1) RETURNING category_id', [`Bread Type Test ${runId}`])).rows[0].category_id
    soft = await makeProduct('Soft Pandesal', 'SOFT', { stock: 40, standard: 300 })
    hard = await makeProduct('Hard Broas', 'HARD', { stock: 150, min: 200, target: 600 })
  })

  after(async () => {
    await pool.query('DELETE FROM daily_stock_resets WHERE day = ANY($1::date[])', [days])
    await pool.query('DELETE FROM inventory_movements WHERE order_id = ANY($1)', [orderIds])
    await pool.query('DELETE FROM order_details WHERE order_id = ANY($1)', [orderIds])
    await pool.query('DELETE FROM order_status_history WHERE order_id = ANY($1)', [orderIds])
    await pool.query('DELETE FROM orders WHERE order_id = ANY($1)', [orderIds])
    await pool.query('DELETE FROM inventory_movements WHERE inventory_id IN (SELECT inventory_id FROM inventory WHERE product_id = ANY($1))', [[soft, hard]])
    await pool.query('DELETE FROM stock_alerts WHERE inventory_id IN (SELECT inventory_id FROM inventory WHERE product_id = ANY($1))', [[soft, hard]]).catch(() => {})
    await pool.query('DELETE FROM inventory WHERE product_id = ANY($1)', [[soft, hard]])
    await pool.query('DELETE FROM products WHERE product_id = ANY($1)', [[soft, hard]])
    await pool.query('DELETE FROM categories WHERE category_id = $1', [categoryId])
    await pool.end()
  })

  test('before 5:00 AM nothing is topped up', async () => {
    const day = futureDay()
    assert.equal(await runDailyStockReset(new Date(`${day}T04:59:00+08:00`), { onlyProductIds: [soft] }), null)
    assert.equal(await stockOf(soft), 40)
  })

  test('at 5:00 AM a soft bread is topped up to its standard, once a day; a hard bread is left alone', async () => {
    const day = futureDay()
    days.push(day)
    assert.equal(await runDailyStockReset(new Date(`${day}T05:00:00+08:00`), { onlyProductIds: [soft, hard] }), 1)
    assert.equal(await stockOf(soft), 300, '40 left + 260 baked')
    assert.equal(await stockOf(hard), 150, 'hard breads carry over')
    const ledger = (await pool.query(`SELECT quantity_change FROM inventory_movements m JOIN inventory i USING (inventory_id) WHERE i.product_id = $1 AND m.reason = 'DAILY_STOCK'`, [soft])).rows
    assert.deepEqual(ledger.map((row) => row.quantity_change), [260])

    await pool.query('UPDATE inventory SET stock_quantity = 10 WHERE product_id = $1', [soft])
    assert.equal(await runDailyStockReset(new Date(`${day}T09:00:00+08:00`), { onlyProductIds: [soft] }), null, 'never twice a day')
    assert.equal(await stockOf(soft), 10, 'and never restocked during the day')
  })

  test('leftovers already above the standard are kept as they are', async () => {
    const day = futureDay(1)
    days.push(day)
    await pool.query('UPDATE inventory SET stock_quantity = 320 WHERE product_id = $1', [soft])
    assert.equal(await runDailyStockReset(new Date(`${day}T05:30:00+08:00`), { onlyProductIds: [soft] }), 0)
    assert.equal(await stockOf(soft), 320)
  })

  // A Monday far from any event: no boost.
  const plainMonday = () => {
    const date = new Date(Date.UTC(2090, 0, 1) + offset * 86400000)
    while (date.getUTCDay() !== 1) date.setUTCDate(date.getUTCDate() + 1)
    return date.toISOString().slice(0, 10)
  }

  test('the production list: soft = top-up + advanced orders that day; hard = target − stock at or under the minimum', async () => {
    const day = plainMonday()
    await pool.query('UPDATE inventory SET stock_quantity = 50 WHERE product_id = $1', [soft])
    const order = (await pool.query(
      `INSERT INTO orders (order_type, status, is_reservation, requested_fulfillment_time, guest_name, guest_contact) VALUES ('PICKUP', 'READY_FOR_PICKUP', TRUE, $1, 'Test', '09171234567') RETURNING order_id`,
      [`${day}T10:00:00+08:00`],
    )).rows[0].order_id
    orderIds.push(order)
    await pool.query('INSERT INTO order_details (order_id, product_id, quantity, unit_price) VALUES ($1, $2, 20, 10)', [order, soft])

    const items = await productionFor(day)
    const softLine = items.find((item) => String(item.productId) === String(soft))
    assert.equal(softLine.topUp, 250)
    assert.equal(softLine.advanced, 20)
    assert.equal(softLine.toBake, 270)
    const hardLine = items.find((item) => String(item.productId) === String(hard))
    assert.equal(hardLine.needed, true)
    assert.equal(hardLine.toBake, 450, '600 − 150')

    await pool.query('UPDATE inventory SET stock_quantity = 550 WHERE product_id = $1', [hard])
    const later = (await productionFor(day)).find((item) => String(item.productId) === String(hard))
    assert.equal(later.needed, false, 'above the minimum: not needed')
  })

  test('events and weekends raise hard breads only: x2 from Thursday, an event x4 from a week before', async () => {
    await pool.query('UPDATE inventory SET stock_quantity = 150 WHERE product_id = $1', [hard])
    await pool.query('UPDATE inventory SET stock_quantity = 50 WHERE product_id = $1', [soft])
    const monday = plainMonday()
    const thursday = new Date(`${monday}T12:00:00Z`); thursday.setUTCDate(thursday.getUTCDate() + 3)
    const thursdayIso = thursday.toISOString().slice(0, 10)
    const line = async (day, id) => (await productionFor(day)).find((item) => String(item.productId) === String(id))

    const weekendHard = await line(thursdayIso, hard)
    assert.equal(weekendHard.boost, 'Weekend x2')
    assert.equal(weekendHard.toBake, 1050, '600 x 2 − 150')
    assert.equal((await line(thursdayIso, soft)).standardStock, 300, 'soft breads unchanged on weekends')

    // An event the following Monday, x4: from a week ahead (the Monday
    // before is inside its lead days) hard breads build up to 600 x 4.
    const eventDay = new Date(`${monday}T12:00:00Z`); eventDay.setUTCDate(eventDay.getUTCDate() + 7)
    const eventIso = eventDay.toISOString().slice(0, 10)
    const event = (await pool.query(`INSERT INTO events (name, starts_on, ends_on) VALUES ($1, $2, $2) RETURNING event_id`, [`Test event ${runId}`, eventIso])).rows[0].event_id
    try {
      const ahead = await line(monday, hard)
      assert.equal(ahead.boost, `Test event ${runId} x4`)
      assert.equal(ahead.toBake, 2250, '600 x 4 − 150')
      assert.equal((await line(monday, soft)).standardStock, 300, 'a hard-bread event leaves soft breads alone')
    } finally {
      await pool.query('DELETE FROM events WHERE event_id = $1', [event])
    }
  })

  test('the forecast check flags shortfalls only (ANALYTICS_PLAN A3)', () => {
    assert.equal(forecastShortfall(320, 300), 20)
    assert.equal(forecastShortfall(300, 300), null, 'equal is covered')
    assert.equal(forecastShortfall(150, 300), null, 'a forecast below the plan never flags')
    assert.equal(forecastShortfall(null, 300), null, 'no forecast, no flag')
  })

  test('cancelling gives back only what an order took off the shelf', async () => {
    await pool.query('UPDATE inventory SET stock_quantity = 100 WHERE product_id = $1', [soft])
    const order = (await pool.query(`INSERT INTO orders (order_type, status) VALUES ('PICKUP', 'READY_FOR_PICKUP') RETURNING order_id`)).rows[0].order_id
    orderIds.push(order)
    // 5 in its items, but only 3 really came off the shelf.
    await pool.query('INSERT INTO order_details (order_id, product_id, quantity, unit_price) VALUES ($1, $2, 5, 10)', [order, soft])
    await pool.query(`INSERT INTO inventory_movements (inventory_id, order_id, quantity_change, reason) SELECT inventory_id, $1, -3, 'ORDER_PLACED' FROM inventory WHERE product_id = $2`, [order, soft])
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await applyCancellationEffects(client, order, null)
      await client.query('COMMIT')
    } finally {
      client.release()
    }
    assert.equal(await stockOf(soft), 103)
  })
})
