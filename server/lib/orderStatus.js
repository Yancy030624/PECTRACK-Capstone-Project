// Orders go into production on their own (the adviser, 2026-10-16): there
// is no confirmation step any more whose only job was to move a new or a
// newly paid order to IN_PRODUCTION.
//
// - A PICKUP order (online or at the counter) starts IN_PRODUCTION the
//   moment it is placed; it can be paid at pickup (routes/orders.js POST /).
// - A DELIVERY order is baked only once it is paid in full (NO_COD_PLAN
//   D1), so it waits as PLACED and moves to IN_PRODUCTION the moment the
//   payment that settles it is recorded — at the counter (POST
//   /api/payments) or online (the PayMongo webhook or confirm-on-return).
//
// Only PLACED or CONFIRMED (an order from before this change) ever moves.
// A later status — ready, out for delivery, completed, cancelled — is never
// overwritten, however often a page is refreshed or a payment re-checked.
import { getBillingSummary } from './billing.js'
import { syncStockAlert } from './inventory.js'

export const autoProductionNote = 'Paid in full — sent to production automatically.'

// Call inside the transaction that recorded the payment, holding the
// order's row lock (the payment routes take it first, as every money path
// does). Returns true when the order moved.
export async function startProductionIfPaid(client, orderId, updatedBy) {
  const billing = await getBillingSummary(client, orderId)
  if (!billing.isFullyPaid) return false
  const moved = await client.query(
    `UPDATE orders SET status = 'IN_PRODUCTION'
      WHERE order_id = $1 AND status IN ('PLACED', 'CONFIRMED')
    RETURNING order_id`,
    [orderId],
  )
  if (moved.rowCount === 0) return false
  await client.query(
    'INSERT INTO order_status_history (order_id, updated_by, status, note) VALUES ($1, $2, $3, $4)',
    [orderId, updatedBy, 'IN_PRODUCTION', autoProductionNote],
  )
  return true
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
  const items = restoreStock
    ? await client.query('SELECT product_id, quantity FROM order_details WHERE order_id = $1 ORDER BY product_id', [orderId])
    : { rows: [] }
  for (const item of items.rows) {
    const restored = await client.query(
      'UPDATE inventory SET stock_quantity = stock_quantity + $2, last_updated = CURRENT_TIMESTAMP WHERE product_id = $1 RETURNING inventory_id, stock_quantity, min_stock_level',
      [item.product_id, item.quantity],
    )
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
