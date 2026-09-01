// Order creation, listing, detail, and status updates. Both PICKUP and
// DELIVERY orders (Phase 7 — see PHASE7_PLAN.md). A DELIVERY order needs
// an address_id (the orders CHECK constraint requires it for DELIVERY and
// forbids it for PICKUP) and a customer account (Decision 7 — walk-ins
// have nowhere on file to deliver to), and gets a deliveries row created
// alongside it (Decision 3). deliveries.status is the source of truth for
// where a delivery order stands; see routes/deliveries.js and Decision 2
// for the one-directional sync into orders.status.
//
// Admin is deliberately NOT able to create orders through this router —
// orders.processed_by references cashiers(cashier_id) only, not admins,
// so the schema itself treats order-taking as a cashier concern.
// Mounted at /api/orders in app.js.
import express from 'express'
import { pool } from '../db.js'
import { billingListSql, getBillingSummary, mapBillingColumns } from '../lib/billing.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { syncStockAlert } from '../lib/inventory.js'
import { parseId } from '../lib/validation.js'

const router = express.Router()

const validStatuses = new Set(['PLACED', 'CONFIRMED', 'IN_PRODUCTION', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED'])
// Terminal: nothing moves OUT of these, for any role. See PHASE5_PLAN.md,
// Pattern C — this is what makes the stock restore on cancellation safe to
// run without checking whether a restore already happened.
const terminalStatuses = new Set(['COMPLETED', 'CANCELLED'])
// The states a transition may be claimed FROM. Staff may move an order out
// of any non-terminal state; a customer may only cancel one the kitchen
// hasn't started on. Derived from validStatuses rather than written out
// again, so a new status can never be added to one list but not the other.
const nonTerminalStatuses = [...validStatuses].filter((status) => !terminalStatuses.has(status))
const customerClaimableStatuses = ['PLACED']
const instructionsMaxLength = 500

const mapOrderSummary = (row) => ({
  id: row.order_id,
  customerId: row.customer_id,
  customerName: row.customer_name,
  orderType: row.order_type,
  status: row.status,
  totalAmount: row.total_amount,
  orderDate: row.order_date,
  // Phase 6: what this order still owes, carried on the LIST as well as
  // the detail. Without it, the only way to answer "which orders still owe
  // money" — the question the Payment & Billing screen exists to answer —
  // was to open every order in turn.
  //
  // The columns come from lib/billing.js rather than a SUM written out
  // again here: one definition, two consumers. Restating it would be the
  // duplication that module exists to prevent, and would have quietly
  // reintroduced its amount_paid formatting fix in a place no test covers.
  ...mapBillingColumns(row),
})

const orderSummarySelectQuery = `SELECT o.order_id, o.customer_id, c.name AS customer_name, o.order_type, o.status, o.total_amount, o.order_date,
            ${billingListSql.columns}
     FROM orders o
     LEFT JOIN customers c ON c.customer_id = o.customer_id
     ${billingListSql.join}`

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
            o.order_type, o.status, o.instructions, o.requested_fulfillment_time,
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

  // Phase 6: what this order has been paid, and what it still owes — see
  // lib/billing.js. Fetched for every role: a customer's receipt needs it
  // exactly as much as a cashier's does, and the same "customer sees only
  // their own order" guard above already covers who may reach this far.
  const payment = await getBillingSummary(pool, order.order_id)

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
      totalAmount: order.total_amount,
      orderDate: order.order_date,
      items: itemsResult.rows.map((row) => ({ productId: row.product_id, productName: row.product_name, quantity: row.quantity, unitPrice: row.unit_price })),
      statusHistory: historyResult.rows.map((row) => ({ status: row.status, note: row.note, updatedAt: row.updated_at, updatedByName: row.updated_by_name })),
      payment,
    },
  })
})

router.post('/', requireRole('CUSTOMER', 'CASHIER'), async (request, response) => {
  const orderType = request.body.orderType ?? 'PICKUP'
  if (orderType !== 'PICKUP' && orderType !== 'DELIVERY') return response.status(422).json({ message: 'Enter a valid order type.', errors: { orderType: 'Enter a valid order type.' } })

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
  // Sorted by productId so every transaction deducts stock in the same
  // order across every order — see the deduction loop further down for
  // why: two orders for the same items in opposite order ([bread,cake] vs
  // [cake,bread]) could otherwise each hold a lock the other needs, and
  // Postgres kills one as a deadlock. BigInt comparison because productId
  // is a string that can exceed Number's safe integer range.
  const parsedItems = [...quantityByProductId]
    .map(([productId, quantity]) => ({ productId, quantity }))
    .sort((a, b) => (BigInt(a.productId) < BigInt(b.productId) ? -1 : 1))

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

  // PHASE 7, DECISION 7 — a DELIVERY order needs somewhere to send it, and
  // addresses hang off customers: a walk-in order has customerId null (the
  // guest-order design), so it has no addresses to choose from and cannot
  // be a delivery. The address must also belong to THIS order's customer —
  // verified server-side, never trusted from the body, so a customer can't
  // send an order to someone else's saved address by passing its id, and a
  // cashier can't do it by accident.
  let addressId = null
  if (orderType === 'DELIVERY') {
    if (!customerId) return response.status(422).json({ message: 'A delivery order needs a customer account — walk-in orders can only be picked up.', errors: { orderType: 'Delivery requires a customer account.' } })
    addressId = parseId(request.body.addressId)
    if (!addressId) return response.status(422).json({ message: 'Select a delivery address.', errors: { addressId: 'Select a delivery address.' } })
    const addressCheck = await pool.query('SELECT address_id FROM customer_addresses WHERE address_id = $1 AND customer_id = $2 AND is_active = TRUE', [addressId, customerId])
    if (!addressCheck.rows[0]) return response.status(422).json({ message: 'Selected address is not available.', errors: { addressId: 'Selected address is not available.' } })
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

    // total_amount is left to its DEFAULT 0 here and filled in below, once
    // the line items exist to add up.
    const orderResult = await client.query(
      `INSERT INTO orders (customer_id, processed_by, order_type, address_id, instructions)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING order_id`,
      [customerId, processedBy, orderType, addressId, instructions],
    )
    const orderId = orderResult.rows[0].order_id

    // PHASE 7, DECISION 3 — the deliveries row is created WITH the order,
    // in the same transaction, not lazily on first assignment. status
    // defaults to PENDING_ASSIGNMENT, which is exactly right: nothing has
    // assigned this yet. Creating it lazily would mean a delivery order
    // that exists but is invisible to the assignment queue until someone
    // remembers it.
    if (orderType === 'DELIVERY') {
      await client.query('INSERT INTO deliveries (order_id) VALUES ($1)', [orderId])
    }

    for (const item of parsedItems) {
      const product = productsById.get(item.productId)

      // Deduct with a CONDITIONAL update, never a plain decrement.
      // inventory has CHECK (stock_quantity >= 0); a plain decrement
      // relies on that CHECK to catch overselling, which fails INSIDE the
      // query (error 23514) and would surface as a generic 500. The
      // `AND stock_quantity >= $2` guard makes it fail the WHERE clause
      // instead — rowCount === 0 becomes the "not enough stock" signal,
      // race-free with no explicit locking, because the UPDATE itself
      // takes the row lock. See PHASE5_PLAN.md, Pattern A, for the
      // measured before/after (two 500s vs two clean 409s racing three
      // buyers for the last 10 units).
      const deducted = await client.query(
        `UPDATE inventory
            SET stock_quantity = stock_quantity - $2,
                last_updated = CURRENT_TIMESTAMP
          WHERE product_id = $1
            AND stock_quantity >= $2
        RETURNING inventory_id, stock_quantity, min_stock_level`,
        [item.productId, item.quantity],
      )
      if (deducted.rowCount === 0) {
        await client.query('ROLLBACK')
        return response.status(409).json({ message: `Not enough stock for product ${item.productId}.`, errors: { items: `Not enough stock for product ${item.productId}.` } })
      }

      await client.query('INSERT INTO order_details (order_id, product_id, quantity, unit_price) VALUES ($1, $2, $3, $4)', [orderId, item.productId, item.quantity, product.price])
      // Records WHY stock moved, alongside the fact that it did — see
      // PHASE5_PLAN.md, Decision 1. Negative because stock is leaving.
      await client.query(
        'INSERT INTO inventory_movements (inventory_id, order_id, changed_by, quantity_change, reason) VALUES ($1, $2, $3, $4, $5)',
        [deducted.rows[0].inventory_id, orderId, request.user.id, -item.quantity, 'ORDER_PLACED'],
      )
      // Opens (or leaves open) a low-stock alert if this deduction pushed
      // the product to or below its minimum. See lib/inventory.js — it
      // won't duplicate an alert that's already open for this product.
      await syncStockAlert(client, { inventoryId: deducted.rows[0].inventory_id, stockQuantity: deducted.rows[0].stock_quantity, minStockLevel: deducted.rows[0].min_stock_level })
    }

    // The total is summed by Postgres in NUMERIC, from the rows that were
    // just written, rather than in JavaScript.
    //
    // Two reasons. First, JS numbers are binary floating point, where 0.1 +
    // 0.2 is famously 0.30000000000000004 — fine for a few bakery items
    // rounded to 2dp, but it's money, and NUMERIC is exact by design.
    //
    // Second and more importantly, this makes the total a function of the
    // stored line items instead of a parallel calculation that merely
    // happens to agree with them. orders.total_amount is denormalized, so
    // the risk was always that the two could drift apart. Summing the
    // actual order_details rows means they cannot: whatever was really
    // written is what gets charged. When order editing arrives, re-running
    // exactly this statement is all that's needed to keep it true.
    const totalResult = await client.query(
      `UPDATE orders
       SET total_amount = (SELECT COALESCE(SUM(quantity * unit_price), 0) FROM order_details WHERE order_id = $1)
       WHERE order_id = $1
       RETURNING total_amount`,
      [orderId],
    )
    // pg returns NUMERIC as a string (same precision reasoning as bigint),
    // already formatted to the column's 2 decimal places — so this is the
    // same '136.50' shape the old toFixed(2) produced.
    const totalAmount = totalResult.rows[0].total_amount

    await client.query('INSERT INTO order_status_history (order_id, updated_by, status) VALUES ($1, $2, $3)', [orderId, request.user.id, 'PLACED'])

    await client.query('COMMIT')
    return response.status(201).json({ message: 'Order placed.', order: { id: orderId, status: 'PLACED', totalAmount } })
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

  // A friendly pre-check for the terminal case. It is NOT what enforces
  // the rule — the read above ran on a pooled connection outside any
  // transaction, so its answer can be stale by the time the write happens.
  // The authoritative claim is inside the transaction below; this exists
  // only to produce a better message in the common, uncontended case.
  if (terminalStatuses.has(order.status)) {
    return response.status(409).json({ message: `This order is already ${order.status.toLowerCase()} and cannot be changed further.` })
  }

  const note = request.body.note == null ? null : String(request.body.note).trim().slice(0, instructionsMaxLength) || null

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // CLAIM THE TRANSITION FIRST, atomically, before restoring anything.
    //
    // This conditional UPDATE — not the pre-check above — is what makes
    // the transition happen at most once. The pre-check reads on a pooled
    // connection outside any transaction, so several concurrent requests
    // can all see the same non-terminal status and all conclude they may
    // proceed. Measured, six simultaneous cancels of one order for 4
    // units: every one of them ran the restore loop, stock went 46 -> 70,
    // and the ledger grew six ORDER_CANCELLED rows for a single order —
    // twenty units invented from nothing, with a ledger that reconciles
    // to the wrong number and so corroborates it.
    //
    // Putting the status write here, at the TOP of the transaction with
    // the source state in its WHERE clause, makes the row lock decide the
    // winner: the first transaction to claim it commits, and every other
    // one finds rowCount === 0 and rolls back having touched no stock.
    // That is the same conditional-write pattern POST / uses to deduct
    // stock and PATCH /api/inventory/requests/:id uses to review a
    // request; the cancellation path is where it was missing.
    //
    // The allowed source states are role-scoped, so this also re-enforces
    // the customer's narrower "only from PLACED" rule under concurrency
    // rather than trusting the stale read for it.
    const claimable = request.user.role === 'CUSTOMER' ? customerClaimableStatuses : nonTerminalStatuses
    const claimed = await client.query(
      `UPDATE orders
          SET status = $1
        WHERE order_id = $2
          AND status = ANY($3::order_status[])
      RETURNING status`,
      [status, orderId, claimable],
    )
    if (claimed.rowCount === 0) {
      await client.query('ROLLBACK')
      return response.status(409).json({ message: 'This order was updated by someone else — reload it and try again.' })
    }

    // PHASE 7, DECISION 2 — deliveries.status is the source of truth for a
    // delivery order's progress; orders.status is synced FROM it, one
    // direction only (see routes/deliveries.js, Pattern F). If this order
    // has a deliveries row at all, it IS a delivery order (Decision 3
    // creates one with every delivery order, never lazily), and moving it
    // to OUT_FOR_DELIVERY must go through the driver's own workflow —
    // PATCH /api/deliveries/:id/status — not through here. Without this
    // refusal, a manual write here could disagree with deliveries.status
    // with nothing able to say which is true, the exact drift this
    // decision exists to prevent. Checked here, AFTER the claim, inside
    // the transaction — the same reasoning PHASE6_PLAN.md's Decision 7
    // uses for the COMPLETED check just below: a condition checked outside
    // the write it gates is only ever a suggestion, never a guarantee.
    if (status === 'OUT_FOR_DELIVERY') {
      const deliveryCheck = await client.query('SELECT delivery_id FROM deliveries WHERE order_id = $1', [orderId])
      if (deliveryCheck.rows[0]) {
        await client.query('ROLLBACK')
        return response.status(409).json({ message: 'This order\'s delivery status is managed through Delivery Management, not here.' })
      }
    }

    // PHASE 6, DECISION 7 — an order cannot be marked COMPLETED while
    // money is still owed. This has to live INSIDE the transaction, AFTER
    // the claim above, using the same client — reading the balance before
    // the transaction (or before the claim) would be exactly the mistake
    // the Phase 5 review corrected three times: a condition read outside
    // the write it gates can only produce a friendlier message, never a
    // guarantee. Because the claim already holds this order's row lock, no
    // concurrent payment can be recorded against it while this check runs
    // — POST /api/payments opens by locking the very same row, so it
    // queues behind this transaction rather than racing it.
    //
    // isFullyPaid is a boolean computed IN Postgres (lib/billing.js) —
    // never a NUMERIC string compared here in JavaScript.
    if (status === 'COMPLETED') {
      const billing = await getBillingSummary(client, orderId)
      if (!billing.isFullyPaid) {
        await client.query('ROLLBACK')
        return response.status(409).json({ message: `This order still owes ₱${billing.balanceDue} — it can only be marked COMPLETED once it is fully paid.` })
      }
    }

    // PHASE 6, DECISION 8 — cancelling a PAID order is admin-only, and
    // refunds it. An order with no PAID payments cancels exactly as it
    // did in Phase 5 (nothing below changes for that case). One with
    // PAID payments may only be cancelled by an ADMIN, because cancelling
    // it means the bakery owes that money back — a cashier or the
    // customer themselves should not be able to trigger a refund alone.
    //
    // hasPayments is computed once here, under the same lock reasoning as
    // the COMPLETED check above, and reused after the stock-restore loop
    // below to decide whether the refund UPDATE has anything to do.
    let hasPayments = false
    if (status === 'CANCELLED') {
      const billing = await getBillingSummary(client, orderId)
      hasPayments = billing.hasPayments
      if (hasPayments && request.user.role !== 'ADMIN') {
        await client.query('ROLLBACK')
        return response.status(409).json({ message: 'This order has already been paid — only an admin can cancel it, since doing so refunds the payment.' })
      }
    }

    // Restoring stock is triggered by the TRANSITION into CANCELLED, not
    // by the resulting state. The claim above guarantees this block runs
    // at most once per order — a second cancel can never get past it —
    // which is exactly what makes it safe to restore unconditionally
    // rather than needing to check whether a restore already happened.
    if (status === 'CANCELLED') {
      // ORDER BY product_id for the same deadlock-avoidance reason the
      // deduction loop in POST / sorts its items — a restore and a
      // simultaneous placement touching overlapping products should
      // always take their row locks in the same order.
      const items = await client.query('SELECT product_id, quantity FROM order_details WHERE order_id = $1 ORDER BY product_id', [orderId])
      for (const item of items.rows) {
        // A plain increment is safe here with no conditional guard,
        // unlike the deduction in POST / — adding stock back can never
        // violate CHECK (stock_quantity >= 0), so there's no failure mode
        // to detect.
        const restored = await client.query(
          'UPDATE inventory SET stock_quantity = stock_quantity + $2, last_updated = CURRENT_TIMESTAMP WHERE product_id = $1 RETURNING inventory_id, stock_quantity, min_stock_level',
          [item.product_id, item.quantity],
        )
        await client.query(
          'INSERT INTO inventory_movements (inventory_id, order_id, changed_by, quantity_change, reason) VALUES ($1, $2, $3, $4, $5)',
          [restored.rows[0].inventory_id, orderId, request.user.id, item.quantity, 'ORDER_CANCELLED'],
        )
        // Closes a low-stock alert if restoring this order's stock brought
        // the product back above its minimum. See lib/inventory.js.
        await syncStockAlert(client, { inventoryId: restored.rows[0].inventory_id, stockQuantity: restored.rows[0].stock_quantity, minStockLevel: restored.rows[0].min_stock_level })
      }

      // PHASE 6, DECISION 8 (continued) — the refund itself. A status
      // change on the EXISTING row, not a new negative one:
      // payments.amount has CHECK (amount >= 0), so a negative row is
      // impossible by design, and payment_status already has REFUNDED
      // for precisely this. hasPayments was computed above, before the
      // admin-only gate, so this only runs when there is genuinely
      // something to refund.
      //
      // WHERE status = 'PAID' rather than an unconditional UPDATE: a
      // payment can never have MORE than one meaningful transition
      // (PAID -> REFUNDED), so this is naturally a no-op against any row
      // that was never PAID in the first place — nothing here needs to
      // filter payments by hand first.
      if (hasPayments) {
        await client.query(
          `UPDATE payments
              SET status = 'REFUNDED', refunded_by = $1, refunded_at = CURRENT_TIMESTAMP, refund_reason = $2
            WHERE order_id = $3 AND status = 'PAID'`,
          [request.user.id, note ?? 'Order cancelled.', orderId],
        )
      }

      // PHASE 7, DECISION 6 — cancelling an order must resolve its
      // delivery row, in this same transaction. Without this, cancelling
      // an order that's ASSIGNED or OUT_FOR_DELIVERY leaves that row
      // pointing at a cancelled order forever — it stays on some driver's
      // "my deliveries" list, and the assignment queue slowly fills with
      // work nobody should do. NOT IN ('DELIVERED', 'FAILED') so an
      // already-terminal delivery (the goods already arrived, or a prior
      // failure) is left alone — this only touches a delivery that was
      // still genuinely in progress when the order was cancelled.
      await client.query(
        `UPDATE deliveries SET status = 'FAILED'
          WHERE order_id = $1 AND status NOT IN ('DELIVERED', 'FAILED')`,
        [orderId],
      )
    }

    // orders.status was already written by the claim at the top of this
    // transaction; only the history row is left to record.
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
