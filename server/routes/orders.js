// Order creation, listing, detail, and status updates. PICKUP orders only
// for now — DELIVERY needs customer_addresses management, deliberately
// deferred to a later pass (the orders CHECK constraint requires
// address_id for DELIVERY and forbids it for PICKUP, so staying
// PICKUP-only means never having to touch address_id at all here).
//
// Admin is deliberately NOT able to create orders through this router —
// orders.processed_by references cashiers(cashier_id) only, not admins,
// so the schema itself treats order-taking as a cashier concern.
// Mounted at /api/orders in app.js.
import express from 'express'
import { pool } from '../db.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { parseId } from '../lib/validation.js'

const router = express.Router()

const validStatuses = new Set(['PLACED', 'CONFIRMED', 'IN_PRODUCTION', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED'])
const instructionsMaxLength = 500

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
    const customerResult = await pool.query('SELECT customer_id FROM customers WHERE user_id = $1', [request.user.id])
    const customerId = customerResult.rows[0]?.customer_id
    const result = await pool.query(`${orderSummarySelectQuery} WHERE o.customer_id = $1 ORDER BY o.order_date DESC`, [customerId])
    return response.json({ orders: result.rows.map(mapOrderSummary) })
  }
  // Cashier and admin see every order.
  const result = await pool.query(`${orderSummarySelectQuery} ORDER BY o.order_date DESC`)
  return response.json({ orders: result.rows.map(mapOrderSummary) })
})

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

  const itemsResult = await pool.query(
    `SELECT od.product_id, p.product_name, od.quantity, od.unit_price
     FROM order_details od
     JOIN products p ON p.product_id = od.product_id
     WHERE od.order_id = $1
     ORDER BY od.order_detail_id`,
    [order.order_id],
  )
  const historyResult = await pool.query(
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

router.post('/', requireRole('CUSTOMER', 'CASHIER'), async (request, response) => {
  const orderType = request.body.orderType ?? 'PICKUP'
  if (orderType !== 'PICKUP') return response.status(422).json({ message: 'Delivery orders are not supported yet — pickup only for now.', errors: { orderType: 'Only PICKUP is currently supported.' } })

  const instructions = request.body.instructions == null ? null : String(request.body.instructions).trim().slice(0, instructionsMaxLength)
  const items = Array.isArray(request.body.items) ? request.body.items : []
  if (items.length === 0) return response.status(422).json({ message: 'Add at least one item to the order.', errors: { items: 'Add at least one item to the order.' } })

  // Accumulate into a Map keyed by productId rather than pushing one entry
  // per submitted item. order_details has UNIQUE (order_id, product_id), so
  // sending the same product twice would violate that constraint partway
  // through the INSERT loop below and surface as a generic 500. Summing the
  // quantities is also what a customer means when they add the same item to
  // their cart twice, so this is the correct behaviour, not just a guard.
  //
  // parseId keeps productId a STRING (see lib/validation.js): product_id is
  // a BIGINT, and a value past Number's safe range would otherwise reach
  // Postgres as an out-of-range literal — another 500. Keeping it a string
  // also means it already matches the string keys pg returns for bigint
  // columns, so no conversion is needed at the lookup sites further down.
  const quantityByProductId = new Map()
  for (const item of items) {
    const productId = parseId(item?.productId)
    const quantity = Number(item?.quantity)
    if (!productId || !Number.isInteger(quantity) || quantity <= 0) {
      return response.status(422).json({ message: 'Each item needs a valid productId and a positive whole-number quantity.', errors: { items: 'Each item needs a valid productId and a positive whole-number quantity.' } })
    }
    quantityByProductId.set(productId, (quantityByProductId.get(productId) ?? 0) + quantity)
  }
  const parsedItems = [...quantityByProductId].map(([productId, quantity]) => ({ productId, quantity }))

  // Resolve who this order belongs to and who's processing it, based on
  // the caller's own role — never trust a customerId claiming to be
  // someone else.
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
    // Otherwise customerId stays null — a walk-in order with no account.
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Look up every product in one query, confirm each is available, and
    // snapshot its CURRENT price — later price changes must never affect
    // an already-placed order.
    const productIds = parsedItems.map((item) => item.productId)
    // ::bigint[] casts the array explicitly rather than leaving Postgres to
    // infer a type for the string values parseId produced.
    const productsResult = await client.query('SELECT product_id, price, availability_status FROM products WHERE product_id = ANY($1::bigint[])', [productIds])
    // pg returns bigint columns (product_id) as STRINGS, not numbers, to
    // avoid precision loss for values beyond Number.MAX_SAFE_INTEGER — and
    // parseId above kept item.productId a string for the same reason, so
    // the map keys and the lookup keys already match with no conversion.
    const productsById = new Map(productsResult.rows.map((row) => [row.product_id, row]))
    for (const item of parsedItems) {
      const product = productsById.get(item.productId)
      if (!product || !product.availability_status) {
        await client.query('ROLLBACK')
        return response.status(422).json({ message: `Product ${item.productId} is not available.`, errors: { items: `Product ${item.productId} is not available.` } })
      }
    }

    const totalAmount = parsedItems.reduce((sum, item) => sum + Number(productsById.get(item.productId).price) * item.quantity, 0)

    const orderResult = await client.query(
      `INSERT INTO orders (customer_id, processed_by, order_type, instructions, total_amount)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING order_id`,
      [customerId, processedBy, orderType, instructions, totalAmount.toFixed(2)],
    )
    const orderId = orderResult.rows[0].order_id

    for (const item of parsedItems) {
      const product = productsById.get(item.productId)
      await client.query('INSERT INTO order_details (order_id, product_id, quantity, unit_price) VALUES ($1, $2, $3, $4)', [orderId, item.productId, item.quantity, product.price])
    }

    await client.query('INSERT INTO order_status_history (order_id, updated_by, status) VALUES ($1, $2, $3)', [orderId, request.user.id, 'PLACED'])

    await client.query('COMMIT')
    return response.status(201).json({ message: 'Order placed.', order: { id: orderId, status: 'PLACED', totalAmount: totalAmount.toFixed(2) } })
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
})

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
  // first pass, kept deliberately simple rather than encoding a full
  // state machine before there's a real workflow to validate it against.

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
