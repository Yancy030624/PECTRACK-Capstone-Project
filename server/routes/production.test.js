// The Due today production schedule (PHASE10 B5). Production batches,
// recipes and ingredients were removed (migration 022); what this suite
// covers is the schedule, which works from orders alone.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { after, before, beforeEach, describe, test } from 'node:test'
import bcrypt from 'bcrypt'
import app from '../app.js'
import { createSession, sessionCookieName } from '../lib/auth.js'
import { resetRateLimits } from '../lib/security.js'
import { pool } from '../db.js'

const runId = crypto.randomUUID().slice(0, 8)
const randomContactNumber = () => `09${Math.floor(100000000 + Math.random() * 899999999)}`

describe('production schedule', () => {
  beforeEach(resetRateLimits)

  let server
  let baseUrl
  let cashierCookie
  let customerCookie
  let categoryId
  let packId
  const userIds = []
  const createdOrderIds = []

  const json = (cookie, method, path, body) =>
    fetch(`${baseUrl}${path}`, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) })

  before(async () => {
    server = app.listen(0)
    await new Promise((resolve) => server.once('listening', resolve))
    baseUrl = `http://localhost:${server.address().port}`
    const hash = await bcrypt.hash(crypto.randomUUID(), 4)
    // Sessions are created directly: this suite is about the schedule, not
    // sign-in, which auth.test.js covers.
    const cashierId = (await pool.query(`INSERT INTO users (username, password_hash, user_type) VALUES ($1, $2, 'CASHIER') RETURNING user_id`, [`schedcash_${runId}`, hash])).rows[0].user_id
    await pool.query('INSERT INTO cashiers (user_id, name, contact_num, email) VALUES ($1, $2, $3, $4)', [cashierId, 'Schedule Cashier', randomContactNumber(), `schedcash_${runId}@example.com`])
    const customerId = (await pool.query(`INSERT INTO users (username, password_hash, user_type) VALUES ($1, $2, 'CUSTOMER') RETURNING user_id`, [`schedcust_${runId}`, hash])).rows[0].user_id
    await pool.query('INSERT INTO customers (user_id, name, contact_num, email) VALUES ($1, $2, $3, $4)', [customerId, 'Schedule Customer', randomContactNumber(), `schedcust_${runId}@example.com`])
    userIds.push(cashierId, customerId)
    cashierCookie = `${sessionCookieName}=${await createSession(cashierId)}`
    customerCookie = `${sessionCookieName}=${await createSession(customerId)}`

    categoryId = (await pool.query('INSERT INTO categories (category_name) VALUES ($1) RETURNING category_id', [`Schedule Category ${runId}`])).rows[0].category_id
    packId = (await pool.query('INSERT INTO products (category_id, product_name, variant, price) VALUES ($1, $2, $3, 30) RETURNING product_id', [categoryId, 'Broas', `Pack ${runId}`])).rows[0].product_id
  })

  after(async () => {
    try {
      await pool.query('DELETE FROM orders WHERE order_id = ANY($1)', [createdOrderIds])
      await pool.query('DELETE FROM inventory WHERE product_id = $1', [packId])
      await pool.query('DELETE FROM products WHERE product_id = $1', [packId])
      await pool.query('DELETE FROM categories WHERE category_id = $1', [categoryId])
      await pool.query('DELETE FROM sessions WHERE user_id = ANY($1)', [userIds])
      await pool.query('DELETE FROM cashiers WHERE user_id = ANY($1)', [userIds])
      await pool.query('DELETE FROM customers WHERE user_id = ANY($1)', [userIds])
      await pool.query('DELETE FROM users WHERE user_id = ANY($1)', [userIds])
    } finally {
      await new Promise((resolve) => server.close(resolve))
    }
  })

  test('GET /api/production/schedule groups open orders by the hour they are due, flags overdue and due soon, and sums what is left to make', async () => {
    const manilaDate = (instant) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(instant)
    const place = async (status, requestedAt, quantity) => {
      const order = await pool.query(
        `INSERT INTO orders (status, order_type, requested_fulfillment_time) VALUES ($1, 'PICKUP', $2) RETURNING order_id`,
        [status, requestedAt],
      )
      const id = order.rows[0].order_id
      createdOrderIds.push(id)
      await pool.query('INSERT INTO order_details (order_id, product_id, quantity, unit_price) VALUES ($1, $2, $3, 30)', [id, packId, quantity])
      return id
    }
    const now = Date.now()
    const late = await place('IN_PRODUCTION', new Date(now - 30 * 60000), 3)
    const soon = await place('CONFIRMED', new Date(now + 30 * 60000), 4)
    const ready = await place('READY_FOR_PICKUP', new Date(now + 30 * 60000), 5)
    const asap = await place('PLACED', null, 2)
    const done = await place('COMPLETED', new Date(now + 30 * 60000), 7)

    const schedule = async (date) => {
      const response = await json(cashierCookie, 'GET', `/api/production/schedule${date ? `?date=${date}` : ''}`)
      assert.equal(response.status, 200)
      return response.json()
    }
    const find = (body, id) => {
      for (const slot of body.slots) {
        const order = slot.orders.find((candidate) => candidate.id === id)
        if (order) return { slot, order }
      }
      return null
    }

    const today = await schedule()
    assert.equal(today.isToday, true)
    assert.equal(today.date, manilaDate(new Date()))

    const lateHit = find(today, late)
    assert.ok(lateHit, 'a not-ready order due 30 minutes ago is on today\'s schedule (or under Earlier, just after midnight)')
    assert.equal(lateHit.order.overdue, true)
    assert.equal(lateHit.slot.overdue, true)

    const asapHit = find(today, asap)
    assert.equal(asapHit.slot.key, 'ASAP')

    // "Soon" and "ready" are due in 30 minutes — which is tomorrow just
    // before midnight, so read them from the schedule of their own day.
    const soonDay = manilaDate(new Date(now + 30 * 60000))
    const soonSchedule = soonDay === today.date ? today : await schedule(soonDay)
    const soonHit = find(soonSchedule, soon)
    assert.equal(soonHit.order.dueSoon, true)
    assert.equal(soonHit.order.overdue, false)
    const readyHit = find(soonSchedule, ready)
    assert.equal(readyHit.order.dueSoon, false, 'a ready order is never flagged')
    assert.equal(find(soonSchedule, done), null, 'a completed order is not on the schedule')

    // What is left to make in the slot counts not-ready orders only.
    // The pack product is this suite's own, so only these orders hold it:
    // 4 from "soon", plus 3 if "late" fell in the same hour — never the
    // ready order's 5.
    const sameSlot = soonSchedule === today && lateHit.slot.key === soonHit.slot.key
    const packInSoonSlot = soonHit.slot.items.find((item) => item.productId === packId)
    assert.equal(packInSoonSlot.quantity, sameSlot ? 7 : 4)

    // Other days: no ASAP or Earlier groups — those only make sense today.
    const later = await schedule('2099-01-01')
    assert.equal(later.isToday, false)
    assert.equal(later.slots.length, 0)

    assert.equal((await json(cashierCookie, 'GET', '/api/production/schedule?date=2026-02-30')).status, 422)
    assert.equal((await json(customerCookie, 'GET', '/api/production/schedule')).status, 403)
  })
})

after(async () => {
  await pool.end()
})
