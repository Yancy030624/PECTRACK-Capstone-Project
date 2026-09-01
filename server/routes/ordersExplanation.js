// ============================================================================
// PECTRACK API — routes/orders.js (annotated for learning)
// Order creation, listing, detail, and status updates. Both PICKUP and
// DELIVERY orders (Phase 7 — see PHASE7_PLAN.md). A DELIVERY order needs
// an address_id (the orders CHECK constraint from Phase 1 requires it for
// DELIVERY and forbids it for PICKUP) and a customer account (Decision 7
// — walk-ins have nowhere on file to deliver to), and gets a deliveries
// row created alongside it (Decision 3). deliveries.status is the source
// of truth for where a delivery order stands; see routes/deliveries.js
// and Decision 2 for the one-directional sync into orders.status.
//
// Admin is deliberately NOT able to create orders through this router —
// orders.processed_by references cashiers(cashier_id) ONLY, not admins,
// so the schema itself treats order-taking as a cashier concern, not an
// admin one. This is the first route file in the app where the schema
// itself (not a business-rule decision made in conversation) is what
// draws a role boundary.
//
// Phase 5 additions (see PHASE5_PLAN.md, Steps 3-4): placing an order now
// deducts real stock instead of just checking availability_status, and
// cancelling one restores it. Both changes are annotated in place, in
// POST / and PATCH /:id below, right where they happen.
// ============================================================================

import express from 'express'
import { pool } from '../db.js'
// Phase 6's "what does this order owe" calculation — see
// lib/billingExplanation.js. Three imports, because this file needs it in
// two different SHAPES:
//
//   getBillingSummary   — one order at a time (GET /:id's receipt, and
//                         both the COMPLETED and CANCELLED branches of
//                         PATCH /:id further down). Runs its own query.
//   billingListSql      — the raw SQL fragments, spliced into the LIST
//                         query below so every order's balance is
//                         computed in ONE query rather than one per row.
//                         Calling getBillingSummary in a loop would be an
//                         N+1; sharing the SQL is what avoids it.
//   mapBillingColumns   — so the list response names those fields exactly
//                         as the detail response does.
import { billingListSql, getBillingSummary, mapBillingColumns } from '../lib/billing.js'
import { requireAuth, requireRole } from '../lib/auth.js'
// Shared with routes/inventory.js — every place stock can change needs
// the exact same low-stock rule. See lib/inventoryExplanation.js.
import { syncStockAlert } from '../lib/inventory.js'
// Shared id-shape validation — see lib/validationExplanation.js for why
// every route that looks a record up by id has to run this first.
import { parseId } from '../lib/validation.js'

const router = express.Router()

// Mirrors the order_status enum exactly — validated here (a clean 422)
// rather than letting an invalid value reach Postgres as an enum-cast
// error (a confusing 500).
const validStatuses = new Set(['PLACED', 'CONFIRMED', 'IN_PRODUCTION', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED'])
// Terminal: nothing moves OUT of these, for any role.
const terminalStatuses = new Set(['COMPLETED', 'CANCELLED'])
// The states a status change may be claimed FROM. Staff may move an order
// out of any non-terminal state; a customer may only cancel one the kitchen
// has not started on yet.
//
// DERIVED from validStatuses rather than written out by hand. The two lists
// have to agree — a status that exists but appears in neither would be
// silently unreachable — and deriving one from the other makes that
// impossible to get wrong when a future phase adds, say, a DELIVERED status.
const nonTerminalStatuses = [...validStatuses].filter((status) => !terminalStatuses.has(status))
const customerClaimableStatuses = ['PLACED']
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
  // PHASE 6 (added in review) — what this order still owes, carried on the
  // LIST as well as the detail.
  //
  // Without it, the only way to answer "which orders still owe money" —
  // the single question the Payment & Billing screen exists to answer —
  // was to open every order in turn and read its receipt. That is the
  // module's main workflow, so making it require N clicks to see N
  // balances defeated the point of the screen.
  //
  // The columns come from lib/billing.js rather than a SUM written out
  // again here. That is not just tidiness: the obvious hand-rolled version
  // would have omitted that module's ::numeric(12,2) cast on amount_paid
  // and quietly shipped a SECOND copy of a formatting bug that had already
  // been found and fixed once — in a place no test was watching.
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

  // Phase 6: what this order has been paid, and what it still owes. See
  // lib/billingExplanation.js for the full reasoning — the short version
  // is that this is a SUM over payments, not a stored column, because
  // payments.order_id deliberately has no UNIQUE constraint (one order
  // can hold several payment rows: a deposit then a balance, or a failed
  // attempt then a successful retry).
  //
  // Fetched for EVERY role that can reach this far, not just staff: a
  // customer's own receipt needs their balance exactly as much as a
  // cashier processing pickup does. The role check just above this query
  // (customer sees only their own order, 404 otherwise) already decided
  // who is allowed to reach this point — nothing extra is needed here.
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
      // requiresAdminApproval was intentionally dropped from this response
      // (Phase 5, Decision 3, PHASE5_PLAN.md). The column itself is NOT
      // deleted — it's part of the approved thesis schema and has an
      // obvious future job (a bulk order exceeding available stock, needing
      // an admin's sign-off rather than an outright 409) — but nothing
      // writes it yet, so it was permanently `false` here, which implied a
      // feature that doesn't exist. Reserved for that later flow instead of
      // exposed as dead weight now.
      totalAmount: order.total_amount,
      orderDate: order.order_date,
      items: itemsResult.rows.map((row) => ({ productId: row.product_id, productName: row.product_name, quantity: row.quantity, unitPrice: row.unit_price })),
      statusHistory: historyResult.rows.map((row) => ({ status: row.status, note: row.note, updatedAt: row.updated_at, updatedByName: row.updated_by_name })),
      payment,
    },
  })
})

// requireRole('CUSTOMER', 'CASHIER') here, NARROWER than the router-wide
// requireRole above — this is the one route ADMIN can't use, matching
// the "orders.processed_by only references cashiers" reasoning at the
// top of this file.
router.post('/', requireRole('CUSTOMER', 'CASHIER'), async (request, response) => {
  // orderType defaults to PICKUP; anything besides PICKUP or DELIVERY is
  // REJECTED — an explicit, clear error rather than silently ignoring an
  // unsupported value.
  const orderType = request.body.orderType ?? 'PICKUP'
  if (orderType !== 'PICKUP' && orderType !== 'DELIVERY') return response.status(422).json({ message: 'Enter a valid order type.', errors: { orderType: 'Enter a valid order type.' } })

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
  // Flatten back to the array shape the rest of this handler expects — and
  // SORT by productId while doing it. This matters once Phase 5's stock
  // deduction is in play (further down): two orders for the same items in
  // opposite order ([bread,cake] vs [cake,bread]) would otherwise each
  // hold a row lock the other needs, and Postgres kills one of them as a
  // deadlock. Rare, intermittent, and exactly the kind of bug that
  // surfaces during a live demo rather than in testing. Sorting means
  // every transaction acquires its inventory locks in the same order, so
  // that cycle can never form. BigInt comparison because productId is a
  // string (see parseId) that can exceed Number's safe integer range.
  const parsedItems = [...quantityByProductId]
    .map(([productId, quantity]) => ({ productId, quantity }))
    .sort((a, b) => (BigInt(a.productId) < BigInt(b.productId) ? -1 : 1))

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

  // ------------------------------------------------------------------
  // PHASE 7, DECISION 7 — A DELIVERY ORDER NEEDS SOMEWHERE TO SEND IT.
  //
  // customer_addresses hangs off customers, and a walk-in order has
  // customerId NULL (the guest-order design just above) — so a walk-in
  // has no addresses to choose from and cannot be a delivery. Refused here
  // with a clean 422 rather than letting the address lookup below fail
  // into something confusing.
  //
  // The address must ALSO belong to THIS order's customer — verified
  // server-side against the database, never trusted from the request
  // body. Without this, a customer could send an order to someone ELSE's
  // saved address just by passing its id, and a cashier could do it by
  // accident acting on a customer's behalf.
  // ------------------------------------------------------------------
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
      `INSERT INTO orders (customer_id, processed_by, order_type, address_id, instructions)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING order_id`,
      [customerId, processedBy, orderType, addressId, instructions],
    )
    const orderId = orderResult.rows[0].order_id

    // PHASE 7, DECISION 3 — the deliveries row is created WITH the order,
    // in the SAME transaction, not lazily on first assignment.
    // deliveries.status defaults to PENDING_ASSIGNMENT, which is exactly
    // right: nothing has assigned this yet. Creating it lazily instead
    // would mean a delivery order that exists but is invisible to the
    // assignment queue until someone remembers it — the queue would be
    // missing exactly the orders that most need to be in it.
    if (orderType === 'DELIVERY') {
      await client.query('INSERT INTO deliveries (order_id) VALUES ($1)', [orderId])
    }

    for (const item of parsedItems) {
      const product = productsById.get(item.productId)

      // DEDUCT WITH A CONDITIONAL UPDATE, NEVER A PLAIN DECREMENT. This is
      // the single most important line in Phase 5 (see PHASE5_PLAN.md,
      // Pattern A). inventory has CHECK (stock_quantity >= 0). A plain
      // `SET stock_quantity = stock_quantity - $2` relies on THAT
      // CONSTRAINT to catch overselling — which means the failure happens
      // INSIDE the query as error 23514, gets caught by the generic
      // catch block below, and reaches the customer as a raw 500 rather
      // than an honest "not enough stock".
      //
      // Adding `AND stock_quantity >= $2` to the WHERE clause moves that
      // same check into a place this code can actually observe: if the
      // condition fails, the UPDATE simply matches zero rows, and
      // rowCount === 0 becomes the "not enough stock" signal instead —
      // answered with a clean 409.
      //
      // This is also RACE-FREE WITH NO EXPLICIT LOCKING. The UPDATE
      // statement itself takes a row lock on the inventory row for the
      // duration of this transaction, so two concurrent orders for the
      // same product's last unit cannot both read "1 available" and both
      // proceed — the second one's UPDATE simply won't find a row
      // matching `stock_quantity >= $2` once the first has committed its
      // decrement. Measured directly: three buyers racing for the last 10
      // units, 6 each — a plain decrement gave "ok | ERROR 23514 | ERROR
      // 23514" (two 500s); this pattern gives "sold | refused | refused"
      // (two clean 409s). Both land at the same correct final stock; only
      // what the customer sees differs.
      // RETURNING stock_quantity and min_stock_level alongside inventory_id
      // (not just inventory_id, which is all POST / originally needed) —
      // syncStockAlert further down needs both to decide whether this
      // deduction just pushed the product below its minimum.
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

      // Records WHY stock moved, not just that it did — see
      // PHASE5_PLAN.md, Decision 1. Without this table, stock_quantity is
      // just a number that changes with no explanation anywhere for
      // spoilage, corrections, or (as here) an order. quantity_change is
      // NEGATIVE because stock is leaving the shelf; the mirror-image
      // POSITIVE entry for a cancellation is written in the PATCH handler
      // further down.
      await client.query(
        'INSERT INTO inventory_movements (inventory_id, order_id, changed_by, quantity_change, reason) VALUES ($1, $2, $3, $4, $5)',
        [deducted.rows[0].inventory_id, orderId, request.user.id, -item.quantity, 'ORDER_PLACED'],
      )

      // Phase 5, Step 5: opens (or leaves open — it won't duplicate) a
      // low-stock alert if this deduction pushed the product to or below
      // its minimum. See lib/inventoryExplanation.js for the full
      // reasoning, including why "at most one open alert per product"
      // matters here specifically — a popular item selling out across
      // many small orders would otherwise generate one alert PER ORDER.
      await syncStockAlert(client, { inventoryId: deducted.rows[0].inventory_id, stockQuantity: deducted.rows[0].stock_quantity, minStockLevel: deducted.rows[0].min_stock_level })
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

  // TERMINAL STATUSES. CANCELLED and COMPLETED are dead ends — nothing
  // moves out of them, for ANY role, not just the customer-specific rule
  // above. Phase 4 left this deliberately unenforced for cashier/admin
  // ("no transition restrictions in this first pass") because there was
  // no real consequence to getting it wrong yet. Phase 5's stock restore
  // below is that consequence: without this rule, a cashier or admin
  // could cycle the SAME order through CANCELLED more than once, and the
  // restore logic would credit its stock back again on every attempt —
  // inventing units that were never returned to the shelf.
  //
  // BUT THIS CHECK IS NOT WHAT ENFORCES THAT. Read the next paragraph
  // before trusting it, because the original version of this code trusted
  // it and was wrong.
  //
  // The `order` row above was read with `pool.query`, on a pooled
  // connection, outside any transaction. Its answer is a snapshot from a
  // moment ago, and nothing holds it still. Several concurrent PATCH
  // requests can therefore ALL read status 'PLACED', ALL conclude they
  // may proceed, and ALL run the restore loop. Measured with six
  // simultaneous cancels of one order for 4 units: stock went 46 -> 70,
  // and the ledger gained six ORDER_CANCELLED rows for a single order.
  // Twenty units invented from nothing — and because each restore also
  // wrote its own movement row, SUM(quantity_change) still reconciled to
  // stock_quantity, so the ledger CORROBORATED the phantom stock instead
  // of exposing it.
  //
  // So this check earns its place only as a courtesy: it produces a clear,
  // specific message in the ordinary uncontended case. The real guarantee
  // is the conditional UPDATE at the top of the transaction below.
  if (terminalStatuses.has(order.status)) {
    return response.status(409).json({ message: `This order is already ${order.status.toLowerCase()} and cannot be changed further.` })
  }

  const note = request.body.note == null ? null : String(request.body.note).trim().slice(0, instructionsMaxLength) || null

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // ----------------------------------------------------------------
    // CLAIM THE TRANSITION FIRST — atomically, before touching stock.
    //
    // This conditional UPDATE, and not the friendly pre-check above, is
    // what makes the transition happen AT MOST ONCE. The pattern is
    // identical to the stock deduction in POST / and the request review in
    // routes/inventory.js: put the condition you are relying on into the
    // WHERE clause of the write itself, then check rowCount. The row lock
    // Postgres takes for the UPDATE serializes the contenders, so exactly
    // one transaction can match a given source status; every other one
    // matches zero rows and rolls back having changed nothing.
    //
    // TWO DETAILS THAT MATTER.
    //
    // First, ORDER. This must come BEFORE the restore loop, not after it
    // — the old code wrote the status at the very END of the transaction,
    // which meant every concurrent request had already run its restore by
    // the time the winner was decided. Claiming first means a loser exits
    // before it can credit anything back.
    //
    // Second, the allowed SOURCE states are role-scoped, so this also
    // re-enforces the customer's narrower "only from PLACED" rule under
    // concurrency rather than trusting the stale read for it. A customer
    // double-tapping cancel as a cashier confirms their order gets one
    // clean outcome, not two conflicting ones.
    // ----------------------------------------------------------------
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
      // Deliberately vaguer than the pre-check's message. Reaching here
      // means the state changed underneath this request while it was in
      // flight, so naming a specific current status would be quoting a
      // value that is itself already a moment old.
      return response.status(409).json({ message: 'This order was updated by someone else — reload it and try again.' })
    }

    // ------------------------------------------------------------------
    // PHASE 7, DECISION 2 — DELIVERIES.STATUS IS THE SOURCE OF TRUTH.
    //
    // order_status already contains OUT_FOR_DELIVERY. delivery_status
    // contains its OWN OUT_FOR_DELIVERY too, plus DELIVERED and FAILED —
    // two state machines describing one real-world process. If both were
    // independently writable they WOULD drift: an order reading
    // OUT_FOR_DELIVERY while its delivery row still says
    // PENDING_ASSIGNMENT, with nothing able to say which is true. See
    // routes/deliveries.js's Pattern F for the sync itself.
    //
    // If this order has a deliveries row AT ALL, it IS a delivery order —
    // Decision 3 above creates one with EVERY delivery order, never
    // lazily — and moving it to OUT_FOR_DELIVERY must go through the
    // driver's own workflow, PATCH /api/deliveries/:id/status, not
    // through here. Checked HERE, after the claim, inside the
    // transaction — the exact same reasoning the COMPLETED check just
    // below uses: a condition checked outside the write it gates is only
    // ever a suggestion, never a guarantee.
    // ------------------------------------------------------------------
    if (status === 'OUT_FOR_DELIVERY') {
      const deliveryCheck = await client.query('SELECT delivery_id FROM deliveries WHERE order_id = $1', [orderId])
      if (deliveryCheck.rows[0]) {
        await client.query('ROLLBACK')
        return response.status(409).json({ message: 'This order\'s delivery status is managed through Delivery Management, not here.' })
      }
    }

    // ------------------------------------------------------------------
    // PHASE 6, DECISION 7 — COMPLETED REQUIRES FULL PAYMENT.
    //
    // An order management system should not let staff mark an order
    // complete while money is still owed on it. This has to live RIGHT
    // HERE — inside the transaction, AFTER the claim above, on the SAME
    // client — for exactly the reason PHASE5_PLAN.md's corrected Pattern
    // C spells out: a condition checked before the transaction (or
    // before the claim) can only produce a friendlier message, never a
    // guarantee, because nothing stops the real answer from changing in
    // the gap between that check and the write it was supposed to gate.
    //
    // WHY THIS CAN'T RACE A CONCURRENT PAYMENT. The claim just above
    // already holds THIS order's row lock (an UPDATE always locks the
    // rows it touches, for the rest of the transaction). POST
    // /api/payments opens by locking that exact same row before it does
    // anything else — so a payment recorded while this check is running
    // is structurally impossible; that request would be blocked, queued
    // behind THIS transaction, until it commits or rolls back.
    //
    // isFullyPaid is a BOOLEAN, computed inside Postgres by
    // lib/billing.js — never a NUMERIC string compared here in
    // JavaScript. See that file's own comment on why even the
    // seemingly-safe case of comparing a money string against the
    // literal 0 is a habit not worth forming.
    // ------------------------------------------------------------------
    if (status === 'COMPLETED') {
      const billing = await getBillingSummary(client, orderId)
      if (!billing.isFullyPaid) {
        await client.query('ROLLBACK')
        return response.status(409).json({ message: `This order still owes ₱${billing.balanceDue} — it can only be marked COMPLETED once it is fully paid.` })
      }
    }

    // ------------------------------------------------------------------
    // PHASE 6, DECISION 8 — CANCELLING A PAID ORDER IS ADMIN-ONLY, AND
    // REFUNDS IT.
    //
    // Phase 5 made CANCELLED terminal and made it restore stock. Money
    // needs the SAME treatment: cancelling an order the customer has
    // already paid for must not silently keep their money. An order with
    // NO paid payments cancels exactly as it always has in Phase 5 —
    // nothing below this comment changes for that ordinary case. An
    // order WITH paid payments may only be cancelled by an ADMIN, because
    // doing so means the bakery now owes that money back — a cashier, or
    // the customer cancelling their own order, should never be able to
    // trigger a refund unilaterally.
    //
    // hasPayments is computed here, under the SAME lock reasoning as the
    // COMPLETED check above, and then reused a second time further down
    // — AFTER the stock-restore loop — to decide whether the refund
    // UPDATE has anything to do. Computing it once and threading it
    // through (rather than re-querying) is not just an optimization: it
    // guarantees both places agree on the SAME answer, from the SAME
    // instant, rather than risking two separate reads somehow disagreeing.
    // ------------------------------------------------------------------
    let hasPayments = false
    if (status === 'CANCELLED') {
      const billing = await getBillingSummary(client, orderId)
      hasPayments = billing.hasPayments
      if (hasPayments && request.user.role !== 'ADMIN') {
        await client.query('ROLLBACK')
        return response.status(409).json({ message: 'This order has already been paid — only an admin can cancel it, since doing so refunds the payment.' })
      }
    }

    // RESTORE ON THE TRANSITION, NOT THE STATE. This block runs when the
    // NEW status being set is CANCELLED — not "whenever order.status
    // happens to equal CANCELLED" — because the claim above has already
    // guaranteed this is the ONE AND ONLY time this particular order will
    // ever make that transition. That guarantee is what removes the need
    // for any extra "have we already restored this order's stock?" check
    // here: there is structurally no way to reach this code a second time
    // for the same order.
    if (status === 'CANCELLED') {
      // ORDER BY product_id — the same deadlock-avoidance reasoning as
      // the sorted deduction loop in POST / above. A restore here and a
      // simultaneous new order placement touching an overlapping product
      // should always acquire their row locks in the same order.
      const items = await client.query('SELECT product_id, quantity FROM order_details WHERE order_id = $1 ORDER BY product_id', [orderId])
      for (const item of items.rows) {
        // A PLAIN increment, with no conditional guard — unlike the
        // deduction in POST /. Adding stock back can never violate
        // CHECK (stock_quantity >= 0) the way subtracting could, so
        // there's no overselling-style failure mode here to detect.
        const restored = await client.query(
          'UPDATE inventory SET stock_quantity = stock_quantity + $2, last_updated = CURRENT_TIMESTAMP WHERE product_id = $1 RETURNING inventory_id, stock_quantity, min_stock_level',
          [item.product_id, item.quantity],
        )
        // The mirror image of the ORDER_PLACED row written in POST / —
        // same order_id, same inventory_id, POSITIVE quantity_change
        // this time because stock is coming back.
        await client.query(
          'INSERT INTO inventory_movements (inventory_id, order_id, changed_by, quantity_change, reason) VALUES ($1, $2, $3, $4, $5)',
          [restored.rows[0].inventory_id, orderId, request.user.id, item.quantity, 'ORDER_CANCELLED'],
        )
        // The mirror image of the alert check in POST / too: restoring
        // stock can just as easily bring a product back ABOVE its
        // minimum as deducting can push it below, and that should close
        // out an alert exactly as promptly as going low opened one.
        await syncStockAlert(client, { inventoryId: restored.rows[0].inventory_id, stockQuantity: restored.rows[0].stock_quantity, minStockLevel: restored.rows[0].min_stock_level })
      }

      // ------------------------------------------------------------------
      // PHASE 6, DECISION 8 (continued) — THE REFUND ITSELF.
      //
      // A STATUS CHANGE on the existing payment row, not a brand new
      // negative one. payments.amount has CHECK (amount >= 0), so a
      // negative row recording "money leaving" is impossible by design —
      // payment_status already has REFUNDED in the approved thesis
      // schema for exactly this transition. hasPayments was computed
      // ABOVE, before the admin-only gate was even checked, so by the
      // time execution reaches here it is already known there is
      // genuinely something to refund.
      //
      // WHERE status = 'PAID', not an unconditional UPDATE across every
      // row for this order — a payment can never have MORE than one
      // meaningful transition in this app (PAID -> REFUNDED is the only
      // one Phase 6 writes; see PHASE6_PLAN.md, Decision 8's note on why
      // three audit columns are enough without a full history table).
      // That WHERE clause is what makes this naturally a no-op against
      // any row that was never PAID to begin with (say, a hypothetical
      // future FAILED row), without this code having to filter the
      // payments list by hand first.
      // ------------------------------------------------------------------
      if (hasPayments) {
        await client.query(
          `UPDATE payments
              SET status = 'REFUNDED', refunded_by = $1, refunded_at = CURRENT_TIMESTAMP, refund_reason = $2
            WHERE order_id = $3 AND status = 'PAID'`,
          [request.user.id, note ?? 'Order cancelled.', orderId],
        )
      }

      // ------------------------------------------------------------------
      // PHASE 7, DECISION 6 — CANCELLING AN ORDER MUST RESOLVE ITS
      // DELIVERY ROW, in this SAME transaction.
      //
      // Without this, cancelling an order that is ASSIGNED or
      // OUT_FOR_DELIVERY would leave that delivery row pointing at a
      // cancelled order forever — it stays on some driver's "my
      // deliveries" list, and the assignment queue slowly fills with work
      // nobody should do. This is exactly the kind of cross-module
      // interaction that gets missed when a phase adds a second workflow
      // touching the same order; it is called out in the plan so it gets
      // built, not discovered.
      //
      // NOT IN ('DELIVERED', 'FAILED') so an ALREADY-terminal delivery —
      // the goods already arrived, or a prior failed attempt — is left
      // alone. This only touches a delivery that was still genuinely in
      // progress at the moment its order was cancelled.
      // ------------------------------------------------------------------
      await client.query(
        `UPDATE deliveries SET status = 'FAILED'
          WHERE order_id = $1 AND status NOT IN ('DELIVERED', 'FAILED')`,
        [orderId],
      )
    }

    // orders.status was already written by the claim at the top of this
    // transaction, so only the history row remains. Writing the history
    // row here rather than up beside the claim keeps it on the same side
    // of the restore loop as the COMMIT: if anything in that loop throws,
    // the rollback takes the status change and the history row together,
    // and no record survives claiming something happened that didn't.
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
