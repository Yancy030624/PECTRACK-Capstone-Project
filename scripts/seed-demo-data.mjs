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

// The three admin-only steps below (an admin-cancel refund, and
// Decision 10's restock/spoilage pass) need an authenticated ADMIN
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
// and SPOILAGE rows it writes into inventory_movements are real
// inventory corrections Decision 10 explicitly says clear-demo-data.mjs
// must NOT undo, so inventory_movements.changed_by keeps pointing at
// this account forever, and that reference (REFERENCES users(user_id),
// no ON DELETE clause — RESTRICT) makes deleting the user row fail on
// purpose. Leaving it in place is not just simpler, it is the honest
// record of who actually performed the restock.
async function createTempAdmin() {
  const suffix = crypto.randomUUID().slice(0, 8)
  const username = `seedadmin_${suffix}`
  const password = `SeedAdmin-${suffix}!`
  const passwordHash = await bcrypt.hash(password, bcryptRounds)
  const userResult = await pool.query(`INSERT INTO users (username, password_hash, user_type) VALUES ($1, $2, 'ADMIN') RETURNING user_id`, [username, passwordHash])
  const userId = userResult.rows[0].user_id
  // The NAME matters, and not for tidiness. order_status_history.
  // updated_by resolves through this row, and OrderManagement.jsx's
  // detail panel renders it verbatim: "CANCELLED by {updatedByName}".
  // The admin-cancelled refund below therefore puts this string on
  // screen, on the one refunded order a panel is most likely to open —
  // so it has to read like a real person's role, not like a script.
  // (Decision 9's "no visible marker" rule, reached through a column
  // that isn't obviously a display field.)
  await pool.query('INSERT INTO admins (user_id, name, contact_num, email) VALUES ($1, $2, $3, $4)', [userId, 'Store Admin', '09171234567', `${username}@pectrack.local`])

  await call('POST', '/api/auth/login', null, { identifier: username, password })
  const rawCode = '482913'
  const challengeToken = `seed-challenge-${crypto.randomUUID()}`
  await pool.query(
    `INSERT INTO otp_codes (user_id, code_hash, challenge_token, expires_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP + INTERVAL '5 minutes')`,
    [userId, crypto.createHash('sha256').update(rawCode).digest('hex'), challengeToken],
  )
  const raw = await fetch(`${baseUrl}/api/auth/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ challengeToken, code: rawCode }),
  })
  const cookie = raw.headers.get('set-cookie')?.split(';')[0]
  if (!cookie) throw new Error(`Temp admin OTP verification failed: ${JSON.stringify(await raw.json())}`)
  return { userId, cookie }
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
  log('Logging in...')
  const cashierCookie = await login('cashier1', 'Cashier@Pectrack1')
  const customerCookie = await login('customer1', 'Customer@Pectrack1')
  const { cookie: adminCookie } = await createTempAdmin()
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

  const personnelResult = await call('GET', '/api/deliveries/personnel', cashierCookie)
  const driver = personnelResult.body.personnel.find((p) => p.name === 'Test Delivery Personnel') ?? personnelResult.body.personnel[0]

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
  async function placeOrder(cookie, { customerId, orderType = 'PICKUP', items, addressId } = {}) {
    const body = { orderType, items }
    if (customerId) body.customerId = customerId
    if (orderType === 'DELIVERY') body.addressId = addressId
    const result = await call('POST', '/api/orders', cookie, body)
    if (result.status !== 201) throw new Error(`Order placement failed: ${JSON.stringify(result.body)}`)
    orderIds.push(result.body.order.id)
    return result.body.order
  }

  async function advanceStatus(orderId, status) {
    const result = await call('PATCH', `/api/orders/${orderId}`, cashierCookie, { status })
    if (result.status !== 200) throw new Error(`Status update to ${status} failed for order ${orderId}: ${JSON.stringify(result.body)}`)
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
    await advanceStatus(order.id, 'CONFIRMED')
    await advanceStatus(order.id, 'IN_PRODUCTION')
    if (!isDelivery) await advanceStatus(order.id, 'READY_FOR_PICKUP')
    // A DELIVERY order's status is driven by deliveries.js, not this
    // route (Phase 7, Decision 2) — going straight to COMPLETED after
    // IN_PRODUCTION skips the OUT_FOR_DELIVERY step this seed doesn't
    // need to model for a completed historical order.
    const useGcash = Math.random() < 0.2
    const paymentId = await recordPayment(order.id, order.totalAmount, useGcash ? 'GCASH' : 'CASH')
    await advanceStatus(order.id, 'COMPLETED')

    const instant = randomPastInstant(90)
    await backdateOrder(order.id, instant)
    await backdatePayment(paymentId, instant)
  }
  log(`  ${completedCount} completed orders seeded.\n`)

  // ============ 2. A few CANCELLED, unpaid — proves reports exclude them ============
  log('Seeding cancelled orders...')
  for (let i = 0; i < 4; i++) {
    const order = await placeOrder(i % 2 === 0 ? cashierCookie : customerCookie, {
      customerId: i % 2 === 0 ? undefined : customer1.customerId,
      items: randomItems(commonProducts),
    })
    const cancelResult = await call('PATCH', `/api/orders/${order.id}`, i % 2 === 0 ? cashierCookie : customerCookie, { status: 'CANCELLED' })
    if (cancelResult.status !== 200) throw new Error(`Cancel failed: ${JSON.stringify(cancelResult.body)}`)
    await backdateOrder(order.id, randomPastInstant(90))
  }
  log('  4 cancelled orders seeded.\n')

  // ============ 3. One REFUNDED payment — paid, then admin-cancelled ============
  // PHASE6_PLAN.md, Decision 8 — cancelling a PAID order is admin-only,
  // and automatically refunds it. Seeded through that exact real path,
  // not by hand-flipping a payments row to REFUNDED.
  log('Seeding one paid-then-refunded order...')
  {
    const order = await placeOrder(cashierCookie, { items: randomItems(commonProducts) })
    const paymentId = await recordPayment(order.id, order.totalAmount)
    const cancelResult = await call('PATCH', `/api/orders/${order.id}`, adminCookie, { status: 'CANCELLED', note: 'Customer requested a refund.' })
    if (cancelResult.status !== 200) throw new Error(`Admin refund-cancel failed: ${JSON.stringify(cancelResult.body)}`)
    const instant = randomPastInstant(60, 5)
    await backdateOrder(order.id, instant)
    await backdatePayment(paymentId, instant)
    await pool.query(`UPDATE payments SET refunded_at = $1 WHERE payment_id = $2`, [instant, paymentId])
  }
  log('  1 refunded order seeded.\n')

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
  const confirmedOrder = await placeOrder(cashierCookie, { items: randomItems(commonProducts) })
  await advanceStatus(confirmedOrder.id, 'CONFIRMED')

  const inProductionOrder = await placeOrder(cashierCookie, { items: randomItems(commonProducts) })
  await advanceStatus(inProductionOrder.id, 'CONFIRMED')
  await advanceStatus(inProductionOrder.id, 'IN_PRODUCTION')

  const readyOrder = await placeOrder(cashierCookie, { items: randomItems(commonProducts) })
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
  const queue = await call('GET', '/api/deliveries?status=PENDING_ASSIGNMENT', cashierCookie)
  const queueRow = queue.body.deliveries.find((d) => String(d.orderId) === String(deliveryOrder.id))
  const assignResult = await call('PATCH', `/api/deliveries/${queueRow.id}/assign`, cashierCookie, { deliveryPersonnelId: driver.id })
  if (assignResult.status !== 200) throw new Error(`Delivery assignment failed: ${JSON.stringify(assignResult.body)}`)
  log(`  Delivery for order #${deliveryOrder.id} assigned to ${driver.name}.\n`)

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
    await backdateOrder(order.id, randomPastInstant(14, 2))
  }
  log(`  Ordered heavily against ${scarceProducts.map((p) => p.name).join(', ')}.\n`)

  // ============ 9. Restock everything else (Decision 10), and log spoilage ============
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
  // Two SPOILAGE movements — the number a bakery cares most about, and
  // until now nothing in this seed (or the app) ever recorded one.
  const spoilageTargets = [byName('Cheese Loaf'), byName('Broas Plate')].filter(Boolean)
  for (const product of spoilageTargets) {
    const current = (await pool.query('SELECT stock_quantity FROM inventory WHERE product_id = $1', [product.id])).rows[0].stock_quantity
    await call('PATCH', `/api/inventory/${product.id}`, adminCookie, { stockQuantity: Math.max(0, current - 5), reason: 'SPOILAGE' })
  }
  log(`  Restocked; logged SPOILAGE on ${spoilageTargets.map((p) => p.name).join(', ')}.\n`)

  // ============ Manifest ============
  await fs.writeFile(manifestPath, JSON.stringify({ seededAt: new Date().toISOString(), orderIds }, null, 2))
  log(`Done. ${orderIds.length} orders seeded. Manifest written to ${manifestPath}.`)
  log('Run scripts/clear-demo-data.mjs to remove exactly these rows later.')

  await pool.end()
}

main().catch((error) => {
  console.error('Seeding failed:', error)
  pool.end()
  process.exit(1)
})
