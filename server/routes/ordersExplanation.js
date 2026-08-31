// ============================================================================
// PECTRACK API — routes/orders.js (annotated for learning)
// Order creation, listing, detail, and status updates. PICKUP orders only
// for now — DELIVERY needs customer_addresses management, deliberately
// deferred to a later pass (the orders CHECK constraint from Phase 1
// requires address_id for DELIVERY and forbids it for PICKUP, so staying
// PICKUP-only means this file never has to touch address_id at all).
//
// Admin is deliberately NOT able to create orders through this router —
// orders.processed_by references cashiers(cashier_id) ONLY, not admins,
// so the schema itself treats order-taking as a cashier concern, not an
// admin one. This is the first route file in the app where the schema
// itself (not a business-rule decision made in conversation) is what
// draws a role boundary.
// ============================================================================

import express from 'express'
import { pool } from '../db.js'
import { requireAuth, requireRole } from '../lib/auth.js'

const router = express.Router()

// Mirrors the order_status enum exactly — validated here (a clean 422)
// rather than letting an invalid value reach Postgres as an enum-cast
// error (a confusing 500).
const validStatuses = new Set(['PLACED', 'CONFIRMED', 'IN_PRODUCTION', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED'])
const instructionsMaxLength = 500

// Used for the LIST view (GET /) — a lighter shape than the full detail
// GET /:id returns, since a list doesn't need every order's items and
// full status history loaded at once.
const mapOrderSummary = (row) => ({
  id: row.order_id,
  customerId: row.customer_id,
  customerName: row.customer_name,
  orderType: row.order_type,
  status: row.status,
  totalAmount: row.total_amount,
  orderDate: row.order_date,
})

const orderSummarySelectQuery = `SELECT o.order_id, o.customer_id, c.name AS customer_name, o.order_type, o.status, o.total_amount, o.order_date
     FROM orders o
     LEFT JOIN customers c ON c.customer_id = o.customer_id`

// Delivery personnel are excluded entirely for now — their real access
// should be scoped to "orders assigned to my current deliveries," which
// doesn't exist until Delivery Management (a later phase) does. Without
// that, the alternative would be either blanket access to every order
// (wrong) or silently giving them nothing useful, so the router just
// doesn't admit that role yet rather than pretending to support it.
router.use(requireAuth, requireRole('CUSTOMER', 'CASHIER', 'ADMIN'))

router.get('/', async (request, response) => {
  if (request.user.role === 'CUSTOMER') {
    // A customer only ever sees orders tied to their OWN customer_id —
    // resolved from their session's user_id, never trusted from the
    // request itself.
    const customerResult = await pool.query('SELECT customer_id FROM customers WHERE user_id = $1', [request.user.id])
    const customerId = customerResult.rows[0]?.customer_id
    const result = await pool.query(`${orderSummarySelectQuery} WHERE o.customer_id = $1 ORDER BY o.order_date DESC`, [customerId])
    return response.json({ orders: result.rows.map(mapOrderSummary) })
  }
  // Cashier and admin see every order — they're staff, doing the actual
  // fulfillment work, not customers checking on their own purchases.
  const result = await pool.query(`${orderSummarySelectQuery} ORDER BY o.order_date DESC`)
  return response.json({ orders: result.rows.map(mapOrderSummary) })
})

// A non-numeric :id (a typo'd URL, or literally the string "undefined" —
// this actually happened once, from a test bug during development) would
// otherwise reach Postgres as an invalid bigint literal and surface as a
// raw 500. This treats it the same as "no such order" instead, which is
// both a cleaner response and arguably more correct: an id that can't
// possibly exist behaves exactly like one that doesn't.
function parseOrderId(rawId) {
  return /^\d+$/.test(rawId) ? rawId : null
}

router.get('/:id', async (request, response) => {
  const orderId = parseOrderId(request.params.id)
  if (!orderId) return response.status(404).json({ message: 'Order not found.' })

  const orderResult = await pool.query(
    `SELECT o.order_id, o.customer_id, c.name AS customer_name, o.processed_by, ca.name AS cashier_name,
            o.order_type, o.status, o.instructions, o.requested_fulfillment_time, o.requires_admin_approval,
            o.total_amount, o.order_date
     FROM orders o
     LEFT JOIN customers c ON c.customer_id = o.customer_id
     LEFT JOIN cashiers ca ON ca.cashier_id = o.processed_by
     WHERE o.order_id = $1`,
    [orderId],
  )
  const order = orderResult.rows[0]
  if (!order) return response.status(404).json({ message: 'Order not found.' })

  if (request.user.role === 'CUSTOMER') {
    const customerResult = await pool.query('SELECT customer_id FROM customers WHERE user_id = $1', [request.user.id])
    // Same "don't confirm it exists" 404 used in routes/products.js for a
    // customer requesting an unavailable product — a customer asking for
    // someone ELSE's order shouldn't learn that order id is even real.
    if (order.customer_id !== customerResult.rows[0]?.customer_id) return response.status(404).json({ message: 'Order not found.' })
  }

  // Two more queries, both scoped by order_id — kept as separate SELECTs
  // rather than one giant multi-JOIN, since items and status history are
  // both one-to-many relative to the order and joining them together
  // would multiply rows against each other (a 3-item order with 2
  // history entries would return 6 rows of nonsense, not 3+2).
  const itemsResult = await pool.query(
    `SELECT od.product_id, p.product_name, od.quantity, od.unit_price
     FROM order_details od
     JOIN products p ON p.product_id = od.product_id
     WHERE od.order_id = $1
     ORDER BY od.order_detail_id`,
    [order.order_id],
  )
  const historyResult = await pool.query(
    // Same "join all four role tables, COALESCE the name" pattern seen
    // throughout this app — order_status_history.updated_by can be ANY
    // user (a customer cancelling their own order, or a cashier/admin
    // moving it through the kitchen), so there's no single table to join.
    `SELECT h.status, h.note, h.updated_at, COALESCE(a.name, ca.name, c.name, d.name) AS updated_by_name
     FROM order_status_history h
     JOIN users u ON u.user_id = h.updated_by
     LEFT JOIN admins a ON a.user_id = u.user_id
     LEFT JOIN cashiers ca ON ca.user_id = u.user_id
     LEFT JOIN customers c ON c.user_id = u.user_id
     LEFT JOIN delivery_personnel d ON d.user_id = u.user_id
     WHERE h.order_id = $1
     ORDER BY h.updated_at`,
    [order.order_id],
  )

  return response.json({
    order: {
      id: order.order_id,
      customerId: order.customer_id,
      customerName: order.customer_name,
      cashierName: order.cashier_name,
      orderType: order.order_type,
      status: order.status,
      instructions: order.instructions,
      requestedFulfillmentTime: order.requested_fulfillment_time,
      requiresAdminApproval: order.requires_admin_approval,
      totalAmount: order.total_amount,
      orderDate: order.order_date,
      items: itemsResult.rows.map((row) => ({ productId: row.product_id, productName: row.product_name, quantity: row.quantity, unitPrice: row.unit_price })),
      statusHistory: historyResult.rows.map((row) => ({ status: row.status, note: row.note, updatedAt: row.updated_at, updatedByName: row.updated_by_name })),
    },
  })
})

// requireRole('CUSTOMER', 'CASHIER') here, NARROWER than the router-wide
// requireRole above — this is the one route ADMIN can't use, matching
// the "orders.processed_by only references cashiers" reasoning at the
// top of this file.
router.post('/', requireRole('CUSTOMER', 'CASHIER'), async (request, response) => {
  // orderType defaults to PICKUP and is REJECTED if anything else is
  // sent — an explicit, clear error rather than silently ignoring an
  // unsupported DELIVERY request.
  const orderType = request.body.orderType ?? 'PICKUP'
  if (orderType !== 'PICKUP') return response.status(422).json({ message: 'Delivery orders are not supported yet — pickup only for now.', errors: { orderType: 'Only PICKUP is currently supported.' } })

  const instructions = request.body.instructions == null ? null : String(request.body.instructions).trim().slice(0, instructionsMaxLength)
  const items = Array.isArray(request.body.items) ? request.body.items : []
  if (items.length === 0) return response.status(422).json({ message: 'Add at least one item to the order.', errors: { items: 'Add at least one item to the order.' } })

  // Validate the SHAPE of every item before touching the database at
  // all — a malformed item anywhere in the array rejects the whole
  // request up front, rather than partially processing then failing.
  const parsedItems = []
  for (const item of items) {
    const productId = Number(item?.productId)
    const quantity = Number(item?.quantity)
    if (!productId || Number.isNaN(productId) || !Number.isInteger(quantity) || quantity <= 0) {
      return response.status(422).json({ message: 'Each item needs a valid productId and a positive whole-number quantity.', errors: { items: 'Each item needs a valid productId and a positive whole-number quantity.' } })
    }
    parsedItems.push({ productId, quantity })
  }

  // Resolve who this order belongs to and who's processing it, based on
  // the CALLER'S OWN role and session — never trust a customerId in the
  // request body claiming to be someone else. A customer placing their
  // own order always gets their own customer_id; a cashier can either
  // leave customerId out (a walk-in, no account) or supply one for a
  // known customer they looked up.
  let customerId = null
  let processedBy = null
  if (request.user.role === 'CUSTOMER') {
    const customerResult = await pool.query('SELECT customer_id FROM customers WHERE user_id = $1', [request.user.id])
    customerId = customerResult.rows[0]?.customer_id
  } else {
    const cashierResult = await pool.query('SELECT cashier_id FROM cashiers WHERE user_id = $1', [request.user.id])
    processedBy = cashierResult.rows[0]?.cashier_id
    if ('customerId' in request.body && request.body.customerId != null) {
      const requestedCustomerId = Number(request.body.customerId)
      const customerCheck = await pool.query('SELECT customer_id FROM customers WHERE customer_id = $1', [requestedCustomerId])
      if (!customerCheck.rows[0]) return response.status(422).json({ message: 'Selected customer does not exist.', errors: { customerId: 'Selected customer does not exist.' } })
      customerId = requestedCustomerId
    }
    // Otherwise customerId stays null — a walk-in order with no account,
    // matching the guest/walk-in order design confirmed back in Phase 1.
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Look up every product in ONE query (WHERE product_id = ANY($1)
    // rather than N separate queries), confirm each is currently
    // available, and snapshot its CURRENT price — a price change made
    // after this order is placed must never retroactively affect it.
    const productIds = parsedItems.map((item) => item.productId)
    const productsResult = await client.query('SELECT product_id, price, availability_status FROM products WHERE product_id = ANY($1)', [productIds])
    // pg returns bigint columns (product_id) as STRINGS, not numbers, to
    // avoid precision loss for values beyond Number.MAX_SAFE_INTEGER —
    // so this map is keyed by string, and every lookup below converts
    // item.productId (a JS number, from the validation above) to match.
    // Getting this wrong was a real bug during development: without the
    // String() conversion, every product silently looked "not found"
    // even though the query itself returned the right rows.
    const productsById = new Map(productsResult.rows.map((row) => [row.product_id, row]))
    for (const item of parsedItems) {
      const product = productsById.get(String(item.productId))
      if (!product || !product.availability_status) {
        await client.query('ROLLBACK')
        return response.status(422).json({ message: `Product ${item.productId} is not available.`, errors: { items: `Product ${item.productId} is not available.` } })
      }
    }

    // Computed ONCE, here, from the snapshotted prices — orders.total_amount
    // is denormalized (not derived live from order_details by a query),
    // so this is the one and only place it ever gets set. That's only
    // safe because this app doesn't yet support editing an order's items
    // after creation; if it did, every edit would need to recompute this
    // the same way, or the two would drift out of sync.
    const totalAmount = parsedItems.reduce((sum, item) => sum + Number(productsById.get(String(item.productId)).price) * item.quantity, 0)

    const orderResult = await client.query(
      `INSERT INTO orders (customer_id, processed_by, order_type, instructions, total_amount)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING order_id`,
      [customerId, processedBy, orderType, instructions, totalAmount.toFixed(2)],
    )
    const orderId = orderResult.rows[0].order_id

    for (const item of parsedItems) {
      const product = productsById.get(String(item.productId))
      await client.query('INSERT INTO order_details (order_id, product_id, quantity, unit_price) VALUES ($1, $2, $3, $4)', [orderId, item.productId, item.quantity, product.price])
    }

    // Every order gets an initial PLACED row in the audit trail, not just
    // a status column update — this is what GET /:id's statusHistory
    // shows as the very first entry.
    await client.query('INSERT INTO order_status_history (order_id, updated_by, status) VALUES ($1, $2, $3)', [orderId, request.user.id, 'PLACED'])

    await client.query('COMMIT')
    return response.status(201).json({ message: 'Order placed.', order: { id: orderId, status: 'PLACED', totalAmount: totalAmount.toFixed(2) } })
  } catch (error) {
    await client.query('ROLLBACK')
    // No try/catch translation for a specific Postgres error code here,
    // unlike most other POST routes in this app — nothing about order
    // creation can hit a uniqueness or foreign-key violation that
    // deserves a friendlier message; a genuine failure here is
    // unexpected, so it just propagates to the generic error handler.
    throw error
  } finally {
    client.release()
  }
})

// No requireRole here beyond the router-wide one — customer, cashier,
// and admin can ALL reach this route, but with very different
// permissions once inside, checked manually below rather than with a
// second requireRole (which can only express "allowed" or "not", not
// "allowed, but only for your own order, and only in this direction").
router.patch('/:id', async (request, response) => {
  const orderId = parseOrderId(request.params.id)
  if (!orderId) return response.status(404).json({ message: 'Order not found.' })

  const status = request.body.status
  if (!validStatuses.has(status)) return response.status(422).json({ message: 'Enter a valid order status.', errors: { status: 'Enter a valid order status.' } })

  const current = await pool.query('SELECT order_id, customer_id, status FROM orders WHERE order_id = $1', [orderId])
  const order = current.rows[0]
  if (!order) return response.status(404).json({ message: 'Order not found.' })

  if (request.user.role === 'CUSTOMER') {
    const customerResult = await pool.query('SELECT customer_id FROM customers WHERE user_id = $1', [request.user.id])
    if (order.customer_id !== customerResult.rows[0]?.customer_id) return response.status(404).json({ message: 'Order not found.' })
    // A customer can only cancel their own order, and only before the
    // kitchen has started on it — once it's CONFIRMED or later, self-
    // cancellation is blocked (staff can still cancel it via their own
    // broader status permissions below).
    if (status !== 'CANCELLED') return response.status(403).json({ message: 'You can only cancel your own order.' })
    if (order.status !== 'PLACED') return response.status(409).json({ message: 'This order can no longer be cancelled — it is already being processed.' })
  }
  // Cashier/admin (the only other roles that reach this route — see the
  // router-wide requireRole above): no transition restrictions in this
  // first pass. Deliberately simple: encoding a full order-status state
  // machine (which transitions are "valid" from which starting status)
  // before there's a real kitchen workflow to validate it against would
  // be guessing at rules nobody's confirmed yet.

  const note = request.body.note == null ? null : String(request.body.note).trim().slice(0, instructionsMaxLength) || null

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('UPDATE orders SET status = $1 WHERE order_id = $2', [status, orderId])
    await client.query('INSERT INTO order_status_history (order_id, updated_by, status, note) VALUES ($1, $2, $3, $4)', [orderId, request.user.id, status, note])
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }

  return response.json({ message: 'Order updated.', order: { id: Number(orderId), status } })
})

export default router
