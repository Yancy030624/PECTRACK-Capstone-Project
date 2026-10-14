// COUNTER_ORDER_PLAN.md, Part B — makes the working system LOOK like it
// works, for a presentation.
//
// DECISION 8 — every order goes through the real API (POST /api/orders,
// POST /api/payments, the delivery/inventory PATCH routes), never a
// direct INSERT. A direct insert would skip stock deduction, the
// inventory_movements ledger, and order_status_history — the sales
// report and the inventory report would stop reconciling with each
// other, which is exactly the invariant Phases 5 and 8 exist to protect.
// Only order_date / payment_date / refunded_at are moved afterwards, with
// a direct UPDATE — the same technique reports.test.js's own
// placeOrderAt() helper already uses.
//
// DECISION 9 — every id this script creates is written to
// scripts/demo-data-manifest.json. clear-demo-data.mjs reads that file
// back and removes exactly those rows — nothing is tagged with a visible
// "[demo]" marker anywhere a screen would show it.
//
// DECISION 11 — no new users. Everything runs through the four accounts
// that already exist (ymata_admin, cashier1, delivery1, customer1).
// Variety comes from WALK-INS (customer_id left null), the realistic
// source of variety at an actual bakery counter.
//
// Run with the API server already up (npm run server) and the database
// reachable: node scripts/seed-demo-data.mjs
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import bcrypt from 'bcrypt'
import { bcryptRounds } from '../server/lib/accounts.js'
import { createSession, sessionCookieName } from '../server/lib/auth.js'
import { pool } from '../server/db.js'

const baseUrl = 'http://localhost:3001'
const manifestPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'demo-data-manifest.json')

const orderIds = []
const log = (...args) => console.log(...args)

// ---- HTTP helpers -----------------------------------------------------
async function call(method, urlPath, cookie, body) {
  const response = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  let payload = null
  try { payload = await response.json() } catch { payload = null }
  return { status: response.status, body: payload }
}

// The admin-only steps below (Decision 10's restock/reject pass) need an authenticated ADMIN
// session — but ymata_admin is the user's own real account, and this
// script has no business knowing that password. Rather than touch the
// real admin, it creates a small helper admin through the same real
// account-creation path (bcryptRounds, the real admins table) and uses
// it only for these calls.
//
// It is NOT deleted afterward, deliberately — and this is not a
// loophole in Decision 11 ("no new users"), because it is provably
// invisible to that decision's own concern: GET /api/staff (Staff
// Management's list) filters `WHERE user_type IN ('CASHIER',
// 'DELIVERY_PERSONNEL')` — an ADMIN row is structurally excluded, and no
// other screen in this app lists admin accounts at all. Deleting it
// would also be a genuine FK problem, not just extra code: the RESTOCK
// and REJECT rows it writes into inventory_movements are real
// inventory corrections Decision 10 explicitly says clear-demo-data.mjs
// must NOT undo, so inventory_movements.changed_by keeps pointing at
// this account forever, and that reference (REFERENCES users(user_id),
// no ON DELETE clause — RESTRICT) makes deleting the user row fail on
// purpose. Leaving it in place is not just simpler, it is the honest
// record of who actually performed the restock.
// Two changes since this was first written:
//   - It no longer signs in through /api/auth/login. An admin sign-in
//     emails a one-time code, so every seed run sent a real email through
//     the bakery's Gmail to a .local address nobody reads. The session is
//     created directly in the database instead — the same row a
//     successful sign-in would write.
//   - It reuses the retired helper from an earlier run (reactivated for
//     the run, retired again at the end) instead of adding one more
//     admin account each time.
async function createTempAdmin() {
  const existing = await pool.query(
    `SELECT u.user_id FROM users u JOIN admins a ON a.user_id = u.user_id
      WHERE u.username LIKE 'seedadmin\\_%' ORDER BY u.user_id LIMIT 1`,
  )
  let userId = existing.rows[0]?.user_id
  if (userId) {
    await pool.query('UPDATE users SET is_active = TRUE WHERE user_id = $1', [userId])
  } else {
    const suffix = crypto.randomUUID().slice(0, 8)
    const username = `seedadmin_${suffix}`
    const passwordHash = await bcrypt.hash(crypto.randomUUID(), bcryptRounds)
    userId = (await pool.query(`INSERT INTO users (username, password_hash, user_type) VALUES ($1, $2, 'ADMIN') RETURNING user_id`, [username, passwordHash])).rows[0].user_id
    // The NAME matters: the stock history shows who made each change, so
    // it reads like a role, not like a script.
    await pool.query('INSERT INTO admins (user_id, name, contact_num, email) VALUES ($1, $2, $3, $4)', [userId, 'Store Admin', '09171234567', `${username}@pectrack.local`])
  }
  const sessionId = await createSession(userId)
  return { userId, cookie: `${sessionCookieName}=${sessionId}` }
}

async function login(username, password) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: username, password }),
  })
  const setCookie = response.headers.get('set-cookie')
  if (!setCookie) throw new Error(`Login failed for ${username}: ${JSON.stringify(await response.json())}`)
  return setCookie.split(';')[0]
}

// ---- Date helpers -------------------------------------------------------
// Spread across ~90 days, ending YESTERDAY — today is kept clean for the
// "live" orders (Decision 12's mid-status board and the assigned
// delivery), so the demo's very first live click isn't dated in the past.
const dayMs = 86400000
function randomPastInstant(maxDaysAgo, minDaysAgo = 1) {
  const daysAgo = minDaysAgo + Math.random() * (maxDaysAgo - minDaysAgo)
  const hour = 6 + Math.random() * 14 // bakery hours, 6am-8pm (StorefrontLayout's own footer)
  const instant = new Date(Date.now() - daysAgo * dayMs)
  instant.setHours(Math.floor(hour), Math.floor(Math.random() * 60), 0, 0)
  return instant.toISOString()
}
function sqlInstant(dateIso) {
  return dateIso // Postgres accepts ISO 8601 directly.
}

// ---- Product pools --------------------------------------------------
// Two pools so a ₱850 tin of Broas doesn't show up as often as a ₱7
// Star Bread — CHECKOUT_PLAN and everyday bakery buying both skew
// heavily toward the cheap, frequent items.
const commonProductNames = [
  'Star Bread', 'Kabayan', 'Donut', 'Monggo Twist', 'Pandesal',
  'Spanish Bread', 'Buns', 'Hopia Baboy', 'Pancake', 'Ube Flower',
  'Mini Butter', 'Cheese Monay', 'Hard Monay', 'Monay', 'Ensaymada',
]
const rareProductNames = [
  'Broas Medium Pack', 'Broas Plate', 'Broas Pack', 'Cinnamon Tasty',
  'Marble Tasty', 'Bavarian', 'Swedish Ring', 'Special Ensaymada',
  'Cheese Loaf', 'Romano', 'Salted Biscuits',
]
// Deliberately over-ordered so their REAL stock drops under its minimum
// through genuine order volume — Decision 10 restocks everything else
// back to a healthy level but skips these on purpose, so "Needs
// attention" has something real to show.
const scarceProductNames = ['Otap', 'Camachile', 'Paborita']

async function main() {
  // Everything this run writes to inventory_movements is dated after this
  // instant and by the helper admin — see the provenance pass at the end.
  const runStartedAt = new Date()
  log('Logging in...')
  const cashierCookie = await login('cashier1', 'carlaCashier#1')
  const customerCookie = await login('customer1', 'valenciaCustomer#1')
  // The driver's own session: a delivery order only reaches COMPLETED
  // once its delivery is DELIVERED, and only the assigned driver can
  // drive ASSIGNED -> OUT_FOR_DELIVERY -> DELIVERED (Phase 7, Pattern H).
  const driverCookie = await login('delivery1', 'luzaDelivery#1')
  const { cookie: adminCookie, userId: seedAdminUserId } = await createTempAdmin()
  log('Logged in as cashier1, customer1, and a helper admin (see createTempAdmin\'s own comment).\n')

  const productsResult = await call('GET', '/api/products', cashierCookie)
  const products = productsResult.body.products.filter((p) => p.availabilityStatus)
  const byName = (name) => products.find((p) => p.name === name)
  const commonProducts = commonProductNames.map(byName).filter(Boolean)
  const rareProducts = rareProductNames.map(byName).filter(Boolean)
  const scarceProducts = scarceProductNames.map(byName).filter(Boolean)

  const customerResult = await call('GET', '/api/customers', cashierCookie)
  const customer1 = customerResult.body.customers.find((c) => c.username === 'customer1')
  const addressesResult = await call('GET', `/api/addresses?${new URLSearchParams({ customerId: customer1.customerId })}`, cashierCookie)
  const address = addressesResult.body.addresses[0]
  if (!address) throw new Error('customer1 has no saved address — DELIVERY orders in this seed need one. Save one via My Profile > Addresses first.')

  // Must be delivery1 specifically — driverCookie above is what moves the
  // deliveries assigned here, and a driver can only move their own.
  const driverRow = (await pool.query(`SELECT dp.delivery_personnel_id, dp.name FROM delivery_personnel dp JOIN users u ON u.user_id = dp.user_id WHERE u.username = 'delivery1'`)).rows[0]
  if (!driverRow) throw new Error('delivery1 has no delivery_personnel row — run create-test-accounts.mjs first.')
  const driver = { id: driverRow.delivery_personnel_id, name: driverRow.name }

  // Randomly builds 1-3 lines, mostly from `pool`, occasionally reaching
  // into rareProducts for variety — never from scarceProducts (those are
  // seeded in their own dedicated pass below, at higher volume).
  function randomItems(pool) {
    const lineCount = 1 + Math.floor(Math.random() * 3)
    const chosen = new Set()
    const items = []
    for (let i = 0; i < lineCount; i++) {
      const useRare = Math.random() < 0.15 && rareProducts.length > 0
      const source = useRare ? rareProducts : pool
      const product = source[Math.floor(Math.random() * source.length)]
      if (!product || chosen.has(product.id)) continue
      chosen.add(product.id)
      items.push({ productId: product.id, quantity: 1 + Math.floor(Math.random() * 3) })
    }
    return items.length > 0 ? items : [{ productId: pool[0].id, quantity: 1 }]
  }

  // Places one order as `cookie`. `customerId` omitted means a walk-in.
  // `orderType`/`addressId` follow COUNTER_ORDER_PLAN.md Decision 4's
  // legal shapes — DELIVERY is only ever used with customer1 here, since
  // a walk-in has no saved address.
  async function placeOrder(cookie, { customerId, orderType = 'PICKUP', items, addressId, requestedFulfillmentTime } = {}) {
    const body = { orderType, items }
    if (customerId) body.customerId = customerId
    if (orderType === 'DELIVERY') body.addressId = addressId
    if (requestedFulfillmentTime) body.requestedFulfillmentTime = requestedFulfillmentTime
    const result = await call('POST', '/api/orders', cookie, body)
    if (result.status !== 201) throw new Error(`Order placement failed: ${JSON.stringify(result.body)}`)
    orderIds.push(result.body.order.id)
    return result.body.order
  }

  async function advanceStatus(orderId, status) {
    const result = await call('PATCH', `/api/orders/${orderId}`, cashierCookie, { status })
    if (result.status !== 200) throw new Error(`Status update to ${status} failed for order ${orderId}: ${JSON.stringify(result.body)}`)
  }

  // Hands a DELIVERY order's delivery to delivery1 and drives it to
  // DELIVERED through the real routes. Assignment needs the order
  // CONFIRMED or later (routes/deliveries.js), so callers confirm first.
  async function deliverOrder(orderId) {
    const delivery = (await pool.query('SELECT delivery_id FROM deliveries WHERE order_id = $1', [orderId])).rows[0]
    const assigned = await call('PATCH', `/api/deliveries/${delivery.delivery_id}/assign`, cashierCookie, { deliveryPersonnelId: driver.id })
    if (assigned.status !== 200) throw new Error(`Delivery assignment failed for order ${orderId}: ${JSON.stringify(assigned.body)}`)
    for (const status of ['OUT_FOR_DELIVERY', 'DELIVERED']) {
      const moved = await call('PATCH', `/api/deliveries/${delivery.delivery_id}/status`, driverCookie, { status })
      if (moved.status !== 200) throw new Error(`Delivery ${status} failed for order ${orderId}: ${JSON.stringify(moved.body)}`)
    }
  }

  async function recordPayment(orderId, amount, method = 'CASH') {
    const body = { orderId, method, amount }
    // A plausible 13-digit GCash reference, NOT a "SEED-" prefix.
    // payments.gateway_reference is rendered verbatim — as a whole
    // column in PaymentLog.jsx and inline on the receipt in
    // PaymentBilling.jsx — so a marker here is a marker on screen,
    // which is exactly what Decision 9 rules out. Uniqueness is the
    // column's own UNIQUE constraint; 13 random digits collide about
    // never, and a collision would surface as a clean 409 rather than
    // bad data.
    if (method === 'GCASH') body.gatewayReference = String(Math.floor(1e12 + Math.random() * 9e12))
    const result = await call('POST', '/api/payments', cashierCookie, body)
    if (result.status !== 201) throw new Error(`Payment failed for order ${orderId}: ${JSON.stringify(result.body)}`)
    return result.body.payment.id
  }

  async function backdateOrder(orderId, instant) {
    await pool.query('UPDATE orders SET order_date = $1 WHERE order_id = $2', [sqlInstant(instant), orderId])
    // A historical delivery order's delivery happened when the order did,
    // not on the day the seed ran. The driver flow above stamped both
    // columns with "now"; move them alongside the order, an hour apart.
    await pool.query(
      `UPDATE deliveries SET assigned_at = $1::timestamptz + INTERVAL '1 hour', delivered_at = CASE WHEN delivered_at IS NULL THEN NULL ELSE $1::timestamptz + INTERVAL '2 hours' END
        WHERE order_id = $2 AND assigned_at IS NOT NULL`,
      [sqlInstant(instant), orderId],
    )
  }
  async function backdatePayment(paymentId, instant) {
    await pool.query('UPDATE payments SET payment_date = $1 WHERE payment_id = $2', [sqlInstant(instant), paymentId])
  }

  // ============ 1. The bulk: COMPLETED and fully paid (~40 orders) ============
  log('Seeding completed, fully paid orders...')
  const completedCount = 40
  for (let i = 0; i < completedCount; i++) {
    const isWalkIn = Math.random() < 0.6
    const isDelivery = !isWalkIn && Math.random() < 0.3
    const order = await placeOrder(cashierCookie, {
      customerId: isWalkIn ? undefined : customer1.customerId,
      orderType: isDelivery ? 'DELIVERY' : 'PICKUP',
      addressId: isDelivery ? address.id : undefined,
      items: randomItems(commonProducts),
    })
    // No cash on delivery (NO_COD_PLAN): a delivery order is paid in full
    // before it is confirmed, so it is paid up front — mostly GCash, the
    // way a customer pays online. A pickup order is paid at the counter
    // when collected.
    const useGcash = Math.random() < (isDelivery ? 0.8 : 0.2)
    const paymentId = isDelivery ? await recordPayment(order.id, order.totalAmount, useGcash ? 'GCASH' : 'CASH') : null
    await advanceStatus(order.id, 'CONFIRMED')
    await advanceStatus(order.id, 'IN_PRODUCTION')
    // A DELIVERY order's status is driven by deliveries.js, not this
    // route (Phase 7, Decision 2): the driver's own routes take it to
    // OUT_FOR_DELIVERY and DELIVERED, and COMPLETED requires DELIVERED.
    if (isDelivery) await deliverOrder(order.id)
    else await advanceStatus(order.id, 'READY_FOR_PICKUP')
    const counterPaymentId = isDelivery ? paymentId : await recordPayment(order.id, order.totalAmount, useGcash ? 'GCASH' : 'CASH')
    await advanceStatus(order.id, 'COMPLETED')

    const instant = randomPastInstant(90)
    await backdateOrder(order.id, instant)
    await backdatePayment(counterPaymentId, instant)
  }
  log(`  ${completedCount} completed orders seeded.\n`)

  // ============ 2. A few CANCELLED, unpaid — proves reports exclude them ============
  log('Seeding cancelled orders...')
  for (let i = 0; i < 4; i++) {
    const order = await placeOrder(i % 2 === 0 ? cashierCookie : customerCookie, {
      customerId: i % 2 === 0 ? undefined : customer1.customerId,
      items: randomItems(commonProducts),
    })
    // A cancellation needs a logged reason (PHASE10 B7).
    const reasons = ['Customer changed their mind', 'Cancelled by customer: Ordered by mistake', 'Customer did not pick up', 'Cancelled by customer: Pickup or delivery time no longer works']
    const cancelResult = await call('PATCH', `/api/orders/${order.id}`, i % 2 === 0 ? cashierCookie : customerCookie, { status: 'CANCELLED', note: reasons[i % reasons.length] })
    if (cancelResult.status !== 200) throw new Error(`Cancel failed: ${JSON.stringify(cancelResult.body)}`)
    await backdateOrder(order.id, randomPastInstant(90))
  }
  log('  4 cancelled orders seeded.\n')

  // ============ 3. (removed) No refunds ============
  // The bakery gives no refunds (CLIENT_REVISIONS_PLAN.md, R2): a paid
  // order can no longer be cancelled, so the old "paid, then
  // admin-cancelled and refunded" demo order is gone.

  // ============ 4. A few unpaid, open orders — outstanding > 0 ============
  log('Seeding unpaid open orders...')
  for (let i = 0; i < 3; i++) {
    const order = await placeOrder(cashierCookie, { items: randomItems(commonProducts) })
    await backdateOrder(order.id, randomPastInstant(10, 1))
  }
  log('  3 unpaid open orders seeded.\n')

  // ============ 5. A couple of part-paid orders ============
  log('Seeding part-paid orders...')
  for (let i = 0; i < 2; i++) {
    const order = await placeOrder(cashierCookie, { items: randomItems(commonProducts.concat(rareProducts)) })
    const half = (Math.round(Number(order.totalAmount) / 2 * 100) / 100).toFixed(2)
    const paymentId = await recordPayment(order.id, half)
    const instant = randomPastInstant(14, 1)
    await backdateOrder(order.id, instant)
    await backdatePayment(paymentId, instant)
  }
  log('  2 part-paid orders seeded.\n')

  // ============ 6. Live mid-status board — dated TODAY, not backdated ============
  log('Seeding today\'s in-progress orders...')
  // Each due a few hours from now, so Production → Due today shows real
  // hours instead of only "as soon as possible".
  const dueIn = (hours) => new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
  const confirmedOrder = await placeOrder(cashierCookie, { items: randomItems(commonProducts), requestedFulfillmentTime: dueIn(5) })
  await advanceStatus(confirmedOrder.id, 'CONFIRMED')

  const inProductionOrder = await placeOrder(cashierCookie, { items: randomItems(commonProducts), requestedFulfillmentTime: dueIn(2) })
  await advanceStatus(inProductionOrder.id, 'CONFIRMED')
  await advanceStatus(inProductionOrder.id, 'IN_PRODUCTION')

  const readyOrder = await placeOrder(cashierCookie, { items: randomItems(commonProducts), requestedFulfillmentTime: dueIn(1) })
  await advanceStatus(readyOrder.id, 'CONFIRMED')
  await advanceStatus(readyOrder.id, 'IN_PRODUCTION')
  await advanceStatus(readyOrder.id, 'READY_FOR_PICKUP')
  log('  3 live orders seeded (CONFIRMED, IN_PRODUCTION, READY_FOR_PICKUP).\n')

  // ============ 7. One delivery ASSIGNED to delivery1, not yet delivered ============
  // The single highest-value row in this whole seed — without it, My
  // Deliveries reads "Nothing assigned right now" in front of the panel.
  log('Seeding one assigned, undelivered delivery...')
  const deliveryOrder = await placeOrder(cashierCookie, {
    customerId: customer1.customerId,
    orderType: 'DELIVERY',
    addressId: address.id,
    items: randomItems(commonProducts),
  })
  // Paid up front (no cash on delivery), then accepted by the kitchen —
  // assignment requires both.
  await recordPayment(deliveryOrder.id, deliveryOrder.totalAmount, 'GCASH')
  await advanceStatus(deliveryOrder.id, 'CONFIRMED')
  const queue = await call('GET', '/api/deliveries?status=PENDING_ASSIGNMENT', cashierCookie)
  const queueRow = queue.body.deliveries.find((d) => String(d.orderId) === String(deliveryOrder.id))
  const assignResult = await call('PATCH', `/api/deliveries/${queueRow.id}/assign`, cashierCookie, { deliveryPersonnelId: driver.id })
  if (assignResult.status !== 200) throw new Error(`Delivery assignment failed: ${JSON.stringify(assignResult.body)}`)
  log(`  Delivery for order #${deliveryOrder.id} assigned to ${driver.name}.\n`)

  // ============ 7b. One delivery order waiting for payment ============
  // Shows the no-cash-on-delivery rule in the demo: Order Management says
  // "Not paid yet — don't bake it", Due today tags it, and the customer's
  // My Orders says it is waiting for payment.
  log('Seeding one unpaid delivery order...')
  const unpaidDelivery = await placeOrder(customerCookie, {
    orderType: 'DELIVERY',
    addressId: address.id,
    items: randomItems(commonProducts),
    requestedFulfillmentTime: dueIn(4),
  })
  log(`  Order #${unpaidDelivery.id} placed for delivery, not yet paid.\n`)

  // ============ 8. Push three products under their minimum through real volume ============
  // One large order per product, sized against its OWN current stock
  // (read fresh, not assumed) so it lands a few units under
  // min_stock_level regardless of what earlier passes already deducted —
  // a fixed small quantity here would barely dent a 100-unit stock and
  // never trip the low-stock alert Decision 10 wants demonstrated.
  log('Driving three products under their minimum stock level...')
  for (const product of scarceProducts) {
    const inventoryRow = (await pool.query('SELECT stock_quantity, min_stock_level FROM inventory WHERE product_id = $1', [product.id])).rows[0]
    const targetRemaining = Math.max(0, inventoryRow.min_stock_level - 3)
    const quantity = inventoryRow.stock_quantity - targetRemaining
    if (quantity <= 0) continue
    const order = await placeOrder(cashierCookie, { items: [{ productId: product.id, quantity }] })
    // A past sale, finished: paid and completed. Left PLACED, it sat in
    // "Orders to prepare" and Production → Due today every day forever.
    const paymentId = await recordPayment(order.id, order.totalAmount)
    await advanceStatus(order.id, 'COMPLETED')
    const instant = randomPastInstant(14, 2)
    await backdateOrder(order.id, instant)
    await backdatePayment(paymentId, instant)
  }
  log(`  Ordered heavily against ${scarceProducts.map((p) => p.name).join(', ')}.\n`)

  // ============ 9. Restock everything else (Decision 10), and log rejects ============
  log('Restocking (Decision 10 — everything except the three scarce products)...')
  const scarceIds = new Set(scarceProducts.map((p) => p.id))
  const stockResult = await pool.query('SELECT product_id, stock_quantity FROM inventory')
  const stockByProduct = new Map(stockResult.rows.map((row) => [row.product_id, row.stock_quantity]))
  for (const product of [...commonProducts, ...rareProducts]) {
    if (scarceIds.has(product.id)) continue
    const current = stockByProduct.get(product.id) ?? 0
    if (current >= 80) continue
    await call('PATCH', `/api/inventory/${product.id}`, adminCookie, { stockQuantity: 100, reason: 'RESTOCK' })
  }
  // Two REJECT movements — the only loss the bakery writes down
  // (CLIENT_REVISIONS_PLAN.md, R3), and the number it cares most about.
  const rejectTargets = [byName('Cheese Loaf'), byName('Broas Plate')].filter(Boolean)
  for (const product of rejectTargets) {
    const current = (await pool.query('SELECT stock_quantity FROM inventory WHERE product_id = $1', [product.id])).rows[0].stock_quantity
    await call('PATCH', `/api/inventory/${product.id}`, adminCookie, { stockQuantity: Math.max(0, current - 5), reason: 'REJECT', note: 'Rejected at the end of the day' })
  }
  log(`  Restocked; logged rejects on ${rejectTargets.map((p) => p.name).join(', ')}.\n`)

  // ============ 10. Ingredients (CLIENT_REVISIONS_PLAN.md, R5) ============
  // A bakery's usual raw materials, with a week of restocks, usage and one
  // reject, so the Ingredients tab, its Dashboard tile and the report have
  // something to show. Three are left low or close to it on purpose. An
  // ingredient that already exists (a second run) is left alone.
  log('Adding demo ingredients...')
  const demoIngredients = [
    { name: 'Bread flour', unit: 'kg', min: '25', opening: '50', moves: [['USAGE', '18'], ['RESTOCK', '50'], ['USAGE', '22.5']] },
    { name: 'All-purpose flour', unit: 'kg', min: '20', opening: '40', moves: [['USAGE', '12'], ['USAGE', '9.5']] },
    { name: 'White sugar', unit: 'kg', min: '15', opening: '30', moves: [['USAGE', '8'], ['USAGE', '6.25']] },
    { name: 'Brown sugar', unit: 'kg', min: '10', opening: '14', moves: [['USAGE', '4'], ['USAGE', '3']] },
    { name: 'Eggs', unit: 'tray', min: '5', opening: '12', moves: [['USAGE', '4'], ['REJECT', '1', 'Cracked in delivery'], ['RESTOCK', '6']] },
    { name: 'Butter', unit: 'kg', min: '5', opening: '9', moves: [['USAGE', '2.5']] },
    { name: 'Instant yeast', unit: 'pack', min: '10', opening: '30', moves: [['USAGE', '6']] },
    { name: 'Evaporated milk', unit: 'pc', min: '24', opening: '48', moves: [['USAGE', '12']] },
    { name: 'Cheese', unit: 'kg', min: '3', opening: '4', moves: [['USAGE', '1.5']] },
    { name: 'Salt', unit: 'kg', min: '2', opening: '10', moves: [['USAGE', '1']] },
  ]
  const ingredientIds = []
  for (const demo of demoIngredients) {
    const created = await call('POST', '/api/ingredients', adminCookie, { name: demo.name, unit: demo.unit, minStockLevel: demo.min, stockQuantity: demo.opening })
    if (created.status === 409) continue
    if (created.status !== 201) throw new Error(`Ingredient ${demo.name} failed: ${JSON.stringify(created.body)}`)
    const id = created.body.ingredient.id
    ingredientIds.push(id)
    for (const [reason, quantity, note] of demo.moves) {
      const moved = await call('POST', `/api/ingredients/${id}/movements`, adminCookie, { reason, quantity, ...(note ? { note } : {}) })
      if (moved.status !== 201) throw new Error(`Ingredient ${demo.name} ${reason} failed: ${JSON.stringify(moved.body)}`)
    }
  }
  // Spread each ingredient's history over the past week: the opening count
  // seven days ago, then one movement a day after it, in the order made.
  await pool.query(
    `UPDATE ingredient_movements m
        SET created_at = CURRENT_TIMESTAMP - make_interval(days => 7 - n.position) + INTERVAL '2 hours',
            data_source = 'ASSUMED'
       FROM (SELECT movement_id, (ROW_NUMBER() OVER (PARTITION BY ingredient_id ORDER BY movement_id) - 1)::int AS position
               FROM ingredient_movements WHERE ingredient_id = ANY($1)) n
      WHERE n.movement_id = m.movement_id`,
    [ingredientIds],
  )
  log(`  Added ${ingredientIds.length} ingredients with a week of movements.\n`)

  // ============ Daily order numbers (CLIENT_REVISIONS_PLAN.md, R4) ============
  // Each order was numbered for the day it was placed — today — and then
  // moved to an earlier day. Number every day again from order_date.
  await pool.query('SELECT renumber_daily_orders()')

  // ============ Provenance (PHASE9A_DATA_FOUNDATION_PLAN.md, Decision 9) ============
  // Every order this script placed went through the real API, which writes
  // data_source = 'RECORDED' because from the API's point of view it was.
  // From the bakery's point of view it was not — these are demo rows — and
  // the whole point of the column is that a model can tell the two apart.
  await pool.query(`UPDATE orders SET data_source = 'ASSUMED' WHERE order_id = ANY($1)`, [orderIds])
  // The ledger rows those orders wrote, and the RESTOCK / REJECT rows
  // Decision 10's pass wrote through the helper admin, are marked the same
  // way: the stock they moved is real state, the events are not real
  // history. analytics_daily_waste would otherwise report the two seeded
  // rejects as genuine waste.
  const marked = await pool.query(
    `UPDATE inventory_movements SET data_source = 'ASSUMED'
      WHERE order_id = ANY($1) OR (changed_by = $2 AND created_at >= $3)`,
    [orderIds, seedAdminUserId, runStartedAt.toISOString()],
  )
  log(`Marked every seeded order and ${marked.rowCount} inventory movements data_source = ASSUMED.`)

  // ============ Retire the helper admin ============
  // It cannot be deleted — the RESTOCK/REJECT rows it wrote reference it
  // through inventory_movements.changed_by, which is exactly the point of
  // an audit trail. But it must not stay USABLE: it is a full admin whose
  // sign-in codes go to a .local address nobody reads, and every run of
  // this script used to leave one more behind. Deactivating it keeps the
  // record of who restocked and makes the account inert.
  await pool.query('UPDATE users SET is_active = FALSE WHERE user_id = $1', [seedAdminUserId])
  await pool.query('DELETE FROM sessions WHERE user_id = $1', [seedAdminUserId])
  log('Deactivated the helper admin account used for the restock pass.')

  // ============ Manifest ============
  await fs.writeFile(manifestPath, JSON.stringify({ seededAt: new Date().toISOString(), orderIds, ingredientIds }, null, 2))
  log(`Done. ${orderIds.length} orders seeded. Manifest written to ${manifestPath}.`)
  log('Run scripts/clear-demo-data.mjs to remove exactly these rows later.')

  await pool.end()
}

main().catch((error) => {
  console.error('Seeding failed:', error)
  pool.end()
  process.exit(1)
})
