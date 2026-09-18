// Turns a ledger refund into a gateway refund. Two callers: PATCH
// /api/orders/:id CANCELLED (after its transaction commits) and POST
// /api/payments/:id/refund (an admin retrying one that did not go through).
//
// A REFUNDED row with a gateway_payment_id but no refund_reference is the
// whole definition of "owed at the gateway" (migration 009): the books
// already say refunded, PayMongo has not been told. This function finds
// those rows for one order and tells it, one row at a time, recording the
// refund id as each succeeds. Anything that fails stays exactly as it was
// — still owed, still findable by the next call — and is reported back so
// the caller can say so.
//
// Deliberately called OUTSIDE any transaction and holding no lock: this is
// a network round trip to a third party, and PHASE6.5_PLAN.md's intent
// route documents (with measurements) why a pooled connection must never
// wait on one. The ledger write that made the row REFUNDED already
// committed before this runs; what happens here can only ADD a reference
// to it, never change its status.
import { config } from '../config.js'
import { pool } from '../db.js'
import { createRefund, PaymongoApiError } from './paymongo.js'

export async function settleGatewayRefunds(orderId) {
  const owed = await pool.query(
    `SELECT payment_id, gateway_payment_id, amount, refund_reason
       FROM payments
      WHERE order_id = $1 AND status = 'REFUNDED' AND gateway_payment_id IS NOT NULL AND refund_reference IS NULL
      ORDER BY payment_id`,
    [orderId],
  )
  const result = { owed: owed.rowCount, settled: 0, failed: 0, configured: Boolean(config.paymongo.secretKey) }
  if (owed.rowCount === 0 || !result.configured) return result

  for (const row of owed.rows) {
    try {
      const refund = await createRefund({
        secretKey: config.paymongo.secretKey,
        paymentId: row.gateway_payment_id,
        // NUMERIC arrives as a string; the only arithmetic done on it here
        // is the fixed 2dp -> centavos shift PayMongo's API is defined in.
        amountCentavos: Math.round(Number(row.amount) * 100),
        notes: `PECTRACK order #${orderId}: ${row.refund_reason ?? 'Order cancelled.'}`,
      })
      // Conditional on refund_reference still being NULL, so two admins
      // retrying the same row at once cannot both record a reference —
      // and the Idempotency-Key inside createRefund means the second call
      // would not have moved money twice either.
      const recorded = await pool.query(
        `UPDATE payments SET refund_reference = $1 WHERE payment_id = $2 AND refund_reference IS NULL`,
        [refund.id, row.payment_id],
      )
      if (recorded.rowCount > 0) result.settled += 1
    } catch (error) {
      if (!(error instanceof PaymongoApiError)) throw error
      result.failed += 1
      console.error(`Gateway refund failed for payment ${row.payment_id} (order ${orderId}):`, error.message, error.body)
    }
  }
  return result
}

// The sentence a route appends to its own success message when settle()
// leaves something owed — one place to phrase it, so the cancel route and
// the retry route cannot drift.
export function describeGatewayRefunds(result) {
  if (result.owed === 0) return null
  if (!result.configured) return `${result.owed} online payment(s) were marked refunded, but online payments are not configured on this server — refund them in the PayMongo dashboard.`
  if (result.failed > 0) return `${result.failed} online refund(s) could not be sent to PayMongo — an admin can retry from Payment & Billing, or refund them in the PayMongo dashboard.`
  return `${result.settled} online payment(s) refunded through PayMongo.`
}
