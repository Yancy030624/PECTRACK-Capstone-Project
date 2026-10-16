// Settling a GCash payment made through PayMongo — shared by POST
// /api/payments/webhook (PayMongo tells us), POST /api/payments/:id/confirm
// (we ask PayMongo when the customer comes back), and the job that releases
// unpaid checkout holds (lib/staleOrders.js asks before letting one go).
import { pool } from '../db.js'
import { readyIfPaid } from './orderStatus.js'
import { sendInBackground, sendOrderReadyEmailFor } from './notices.js'

// ============================================================================
// Settling a gateway payment — shared by POST /webhook (PayMongo tells us)
// and POST /:id/confirm (we ask PayMongo when the customer comes back).
// Both can report the same payment, in either order and more than once, so
// each write is conditional on the row still being open: the first report
// settles it and every later one matches no row.
// ============================================================================

// A CANCELLED intent can still be paid: the checkout link was live in the
// customer's browser when it was closed — by an order cancel, or by staff
// clearing an abandoned attempt (PATCH /:id below) — and by the time PayMongo
// reports it their money has moved. Ignoring it would leave collected money
// with no record at all, so it is always recorded as PAID. The bakery gives
// no refunds (CLIENT_REVISIONS_PLAN.md, R2): if the order was cancelled in
// the meantime, the order shows as "paid after cancellation" for staff to
// settle with the customer — nothing is sent back automatically.
//
// gateway_payment_id (migration 009) is the PayMongo Payment id, kept on
// every paid row as the reference for that payment.
//
// The payment that settles an order also makes it ready
// (lib/orderStatus.js), so this now takes the ORDER row's lock first, as
// every other money path in this file does, and settles the payment and
// moves the order in one transaction. The payment write itself is still
// conditional on the row being open, so a second report (webhook after
// confirm-on-return, or a retried webhook) matches nothing and moves
// nothing. The status history names the customer who started the payment.
export async function markGatewayPaymentPaid(checkoutSessionId, paymongoPaymentId) {
  const found = await pool.query('SELECT order_id FROM payments WHERE gateway_reference = $1', [checkoutSessionId])
  const orderId = found.rows[0]?.order_id
  if (!orderId) return
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT order_id FROM orders WHERE order_id = $1 FOR UPDATE', [orderId])
    const settled = await client.query(
      `UPDATE payments
          SET status = 'PAID', payment_date = CURRENT_TIMESTAMP, gateway_payment_id = COALESCE($2, gateway_payment_id)
        WHERE gateway_reference = $1 AND status IN ('PENDING', 'CANCELLED')
      RETURNING recorded_by`,
      [checkoutSessionId, paymongoPaymentId],
    )
    let ready = null
    if (settled.rowCount > 0 && settled.rows[0].recorded_by) {
      ready = await readyIfPaid(client, orderId, settled.rows[0].recorded_by)
    }
    await client.query('COMMIT')
    // Paid online and ready: tell the customer, after the commit and in the
    // background (lib/notices.js). A delivery order is told when it leaves.
    if (ready === 'READY_FOR_PICKUP') sendInBackground('order ready', () => sendOrderReadyEmailFor(orderId))
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function markGatewayPaymentFailed(checkoutSessionId) {
  await pool.query(`UPDATE payments SET status = 'FAILED' WHERE gateway_reference = $1 AND status = 'PENDING'`, [checkoutSessionId])
}
