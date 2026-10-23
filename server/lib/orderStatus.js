// Payment first (RULES-PLANS/PAYMENT_FIRST_PLAN.md, the adviser 2026-10-16).
// The bakery bakes its day's stock before opening and is paid before it
// hands anything over, so there is no production step: the moment an order
// is paid in full it is ready.
//
// - A pickup order (online or walk-in) becomes READY_FOR_PICKUP.
// - A delivery order becomes READY_FOR_DELIVERY, and its deliveries row is
//   created now, so the assignment queue only ever holds paid orders.
// - An online checkout held as AWAITING_PAYMENT also takes the time it was
//   paid as its placed time: that is when it really became an order, and
//   it is what the staff's new-order bell watches.
//
// Called inside the transaction that recorded the payment, holding the
// order's row lock (every money path takes it first): at the counter (POST
// /api/payments, and walk-in orders paid as they are placed) and online
// (the PayMongo webhook and confirm-on-return). Only an unpaid status ever
// moves (AWAITING_PAYMENT, or PLACED / CONFIRMED / IN_PRODUCTION from before
// payment first). A later status is never overwritten, however often a page
// is refreshed or a payment re-checked.
import { getBillingSummary } from './billing.js'
import { syncStockAlert } from './inventory.js'

export const unpaidStatuses = ['AWAITING_PAYMENT', 'PLACED', 'CONFIRMED', 'IN_PRODUCTION']
export const readyNote = (orderType) => (orderType === 'DELIVERY' ? 'Paid — ready for delivery.' : 'Paid — ready for pickup.')

// Returns the new status, or null when the order did not move.
export async function readyIfPaid(client, orderId, updatedBy) {
  const billing = await getBillingSummary(client, orderId)
  if (!billing.isFullyPaid) return null
  const moved = await client.query(
    `UPDATE orders
        SET status = CASE WHEN order_type = 'DELIVERY' THEN 'READY_FOR_DELIVERY'::order_status ELSE 'READY_FOR_PICKUP'::order_status END,
            order_date = CASE WHEN status = 'AWAITING_PAYMENT' THEN CURRENT_TIMESTAMP ELSE order_date END
      WHERE order_id = $1 AND status = ANY($2::order_status[])
    RETURNING order_type, status`,
    [orderId, unpaidStatuses],
  )
  if (moved.rowCount === 0) return null
  const { order_type: orderType, status } = moved.rows[0]
  if (orderType === 'DELIVERY') {
    await client.query('INSERT INTO deliveries (order_id) VALUES ($1) ON CONFLICT (order_id) DO NOTHING', [orderId])
  }
  await client.query(
    'INSERT INTO order_status_history (order_id, updated_by, status, note) VALUES ($1, $2, $3, $4)',
    [orderId, updatedBy, status, readyNote(orderType)],
  )
  return status
}

// What cancelling an order undoes, in the transaction that cancels it and
// after the status claim (routes/orders.js PATCH /:id, and the automatic
// closing in lib/staleOrders.js). `changedBy` is the user, or null for the
// system (migration 028).
//
// - Stock goes back on the shelf, in product_id order (the same lock order
//   placement uses, so a restore and a placement cannot deadlock), with an
//   ORDER_CANCELLED ledger row each. A plain increment is safe: adding
//   stock can never break CHECK (stock_quantity >= 0).
// - An open GCash attempt is closed, so a payment that still arrives is
//   recorded as one made after the cancel (routes/payments.js webhook).
// - A delivery still in progress is resolved to FAILED (PHASE7 Decision 6),
//   so it leaves the driver's list and the assignment queue.
//
// `restoreStock: false` skips the first step, for an order closed after
// its day that was already baked: that bread is not on the shelf any more.
export async function applyCancellationEffects(client, orderId, changedBy, { restoreStock = true } = {}) {
  // What this order actually took off the shelf, from its ORDER_PLACED
  // ledger rows — not its items: a soft bread in an advanced order took
  // nothing (it is baked on its day), so there is nothing to put back.
  const items = restoreStock
    ? await client.query(
      `SELECT i.product_id, -SUM(m.quantity_change)::int AS quantity
         FROM inventory_movements m JOIN inventory i ON i.inventory_id = m.inventory_id
        WHERE m.order_id = $1 AND m.reason = 'ORDER_PLACED'
        GROUP BY i.product_id
       HAVING SUM(m.quantity_change) < 0
        ORDER BY i.product_id`,
      [orderId],
    )
    : { rows: [] }
  for (const item of items.rows) {
    const restored = await client.query(
      'UPDATE inventory SET stock_quantity = stock_quantity + $2, last_updated = CURRENT_TIMESTAMP WHERE product_id = $1 RETURNING inventory_id, stock_quantity, min_stock_level',
      [item.product_id, item.quantity],
    )
    // A product whose stock row is gone (deleted since) has no shelf to
    // return to; the rest of the cancellation still goes through.
    if (restored.rowCount === 0) continue
    await client.query(
      'INSERT INTO inventory_movements (inventory_id, order_id, changed_by, quantity_change, reason) VALUES ($1, $2, $3, $4, $5)',
      [restored.rows[0].inventory_id, orderId, changedBy, item.quantity, 'ORDER_CANCELLED'],
    )
    await syncStockAlert(client, { inventoryId: restored.rows[0].inventory_id, stockQuantity: restored.rows[0].stock_quantity, minStockLevel: restored.rows[0].min_stock_level })
  }
  await client.query(`UPDATE payments SET status = 'CANCELLED' WHERE order_id = $1 AND status = 'PENDING'`, [orderId])
  await client.query(
    `UPDATE deliveries SET status = 'FAILED', failed_at = CURRENT_TIMESTAMP
      WHERE order_id = $1 AND status NOT IN ('DELIVERED', 'FAILED')`,
    [orderId],
  )
}
