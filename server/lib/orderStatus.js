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
