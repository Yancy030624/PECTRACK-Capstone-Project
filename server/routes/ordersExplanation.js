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
// Shared id-shape validation — see lib/validationExplanation.js for why
// every route that looks a record up by id has to run this first.
import { parseId } from '../lib/validation.js'

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
// raw 500. parseId treats it the same as "no such order" instead, which is
// both a cleaner response and arguably more correct: an id that can't
// possibly exist behaves exactly like one that doesn't.
//
// This check used to live here as a local `parseOrderId` helper, which is
// why orders was the ONLY router that handled it — a later review found
// the same 500 sitting open in products, customers, and staff. It now
// lives in lib/validation.js as `parseId` so every route shares one
// implementation, and it additionally rejects ids that are all digits but
// too large for a BIGINT column (see that file for the full reasoning).
router.get('/:id', async (request, response) => {
  const orderId = parseId(request.params.id)
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
  //
  // Note this accumulates into a Map keyed by productId rather than
  // pushing one entry per submitted item. That is deliberate, and it fixes
  // a real bug: order_details has UNIQUE (order_id, product_id), so an
  // order listing the same product twice used to violate that constraint
  // partway through the INSERT loop further down. The transaction rolled
  // back correctly, but the error escaped as a generic 500. And "the same
  // product twice" is not an exotic input — it is exactly what a shopping
  // cart sends when someone clicks "add to cart" on an item they already
  // added.
  //
  // Summing the quantities is the RIGHT answer rather than merely a safe
  // one: 1 of something plus 2 more of it is an order for 3, which is what
  // the customer meant. Rejecting the request would have been defensible
  // but worse for the person using it.
  //
  // parseId (not Number) keeps productId a STRING. Two reasons:
  //   1. product_id is a BIGINT. A value past Number's safe range would
  //      pass a Number-based check and only fail once Postgres rejected
  //      the literal — as a 500, not a validation error.
  //   2. pg returns bigint columns AS STRINGS, so keeping our ids in the
  //      same form means the Map built below is keyed identically to the
  //      values we look up with. An earlier version converted with
  //      Number() here and had to convert back with String() at three
  //      separate lookup sites — and missing one of those conversions was
  //      itself a bug during development, because a Map keyed by the
  //      string '7' never matches a lookup for the number 7.
  const quantityByProductId = new Map()
  for (const item of items) {
    const productId = parseId(item?.productId)
    const quantity = Number(item?.quantity)
    // Number.isInteger rejects 1.5, NaN, and Infinity in one check —
    // quantities are whole units of a baked good, never fractional.
    if (!productId || !Number.isInteger(quantity) || quantity <= 0) {
      return response.status(422).json({ message: 'Each item needs a valid productId and a positive whole-number quantity.', errors: { items: 'Each item needs a valid productId and a positive whole-number quantity.' } })
    }
    quantityByProductId.set(productId, (quantityByProductId.get(productId) ?? 0) + quantity)
  }
  // Flatten back to the array shape the rest of this handler expects.
  const parsedItems = [...quantityByProductId].map(([productId, quantity]) => ({ productId, quantity }))

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
    // The ::bigint[] cast tells Postgres exactly what type the array holds
    // instead of leaving it to infer one from the string values parseId
    // produced.
    const productsResult = await client.query('SELECT product_id, price, availability_status FROM products WHERE product_id = ANY($1::bigint[])', [productIds])
    // pg returns bigint columns (product_id) as STRINGS, not numbers, to
    // avoid precision loss for values beyond Number.MAX_SAFE_INTEGER — and
    // parseId kept item.productId a string for the same reason, so this
    // map's keys and the lookup keys below already match with no
    // conversion at all.
    //
    // An earlier version converted ids to numbers during validation and
    // then had to convert back with String() at each of the three lookup
    // sites below. That was a real bug during development: miss one of
    // those conversions and every product silently looks "not found", even
    // though the query itself returned exactly the right rows — because a
    // Map keyed by the string '7' never matches a lookup for the number 7.
    // Keeping one type throughout removes the chance to get it wrong.
    const productsById = new Map(productsResult.rows.map((row) => [row.product_id, row]))
    for (const item of parsedItems) {
      const product = productsById.get(item.productId)
      if (!product || !product.availability_status) {
        await client.query('ROLLBACK')
        return response.status(422).json({ message: `Product ${item.productId} is not available.`, errors: { items: `Product ${item.productId} is not available.` } })
      }
    }

    // total_amount is deliberately omitted here and set further down, after
    // the line items exist to add up. It has DEFAULT 0 in the schema, so
    // the row is valid in the meantime — and nothing outside this
    // transaction can observe that intermediate state anyway.
    const orderResult = await client.query(
      `INSERT INTO orders (customer_id, processed_by, order_type, instructions)
       VALUES ($1, $2, $3, $4)
       RETURNING order_id`,
      [customerId, processedBy, orderType, instructions],
    )
    const orderId = orderResult.rows[0].order_id

    for (const item of parsedItems) {
      const product = productsById.get(item.productId)
      await client.query('INSERT INTO order_details (order_id, product_id, quantity, unit_price) VALUES ($1, $2, $3, $4)', [orderId, item.productId, item.quantity, product.price])
    }

    // THE TOTAL IS SUMMED BY POSTGRES, NOT BY JAVASCRIPT.
    //
    // The earlier version did this in JS before the INSERTs:
    //   parsedItems.reduce((sum, item) => sum + Number(price) * qty, 0)
    // then wrote .toFixed(2). It gave the right answer for realistic
    // bakery numbers, so this is a hardening change, not a bug fix — but
    // it's worth understanding both reasons it's better.
    //
    // 1. EXACTNESS. JavaScript numbers are binary floating point, where
    //    0.1 + 0.2 === 0.30000000000000004. Rounding to 2dp at the end
    //    hides that for small baskets, but the arithmetic is approximate
    //    the whole way through. Postgres NUMERIC is exact decimal — it was
    //    designed for money, which is exactly what this is.
    //
    // 2. ONE SOURCE OF TRUTH — the more important reason. orders.total_amount
    //    is DENORMALIZED: it's a stored copy of something already implied
    //    by the order_details rows. Any denormalized value can drift from
    //    what it duplicates. Computing it in JS made it a PARALLEL
    //    calculation that merely happened to agree with the rows being
    //    written beside it; summing the rows themselves makes it a
    //    FUNCTION of them, so it cannot disagree. Whatever was actually
    //    stored is what the customer is charged.
    //
    // That second point is why this matters more later than it does now.
    // Once orders become editable — or Phase 5 starts adjusting quantities
    // against stock — keeping the total correct is just re-running this
    // exact statement, rather than remembering to redo a calculation that
    // lives somewhere else in JavaScript.
    //
    // COALESCE(..., 0) guards the empty case. An order always has items
    // here (the handler rejects an empty list much earlier), but SUM over
    // zero rows returns NULL, not 0 — and total_amount is NOT NULL.
    const totalResult = await client.query(
      `UPDATE orders
       SET total_amount = (SELECT COALESCE(SUM(quantity * unit_price), 0) FROM order_details WHERE order_id = $1)
       WHERE order_id = $1
       RETURNING total_amount`,
      [orderId],
    )
    // pg returns NUMERIC as a STRING — same precision reasoning as bigint —
    // already formatted to the column's 2 decimal places. So this is the
    // identical '136.50' shape the old toFixed(2) produced, and the API
    // response doesn't change at all.
    const totalAmount = totalResult.rows[0].total_amount

    // Every order gets an initial PLACED row in the audit trail, not just
    // a status column update — this is what GET /:id's statusHistory
    // shows as the very first entry.
    await client.query('INSERT INTO order_status_history (order_id, updated_by, status) VALUES ($1, $2, $3)', [orderId, request.user.id, 'PLACED'])

    await client.query('COMMIT')
    return response.status(201).json({ message: 'Order placed.', order: { id: orderId, status: 'PLACED', totalAmount } })
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
  const orderId = parseId(request.params.id)
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
