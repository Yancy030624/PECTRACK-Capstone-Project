// Closing orders whose day has passed (the adviser, 2026-10-16): test and
// real orders were left open long after their date, and nobody should have
// to close them by hand.
//
// An order's day is the Manila date it was needed (requested time), or the
// day it was placed when it named no time. Once that day is over and the
// order is still open, the system closes it:
// - paid in full → COMPLETED. A delivery that never went out is resolved
//   to FAILED, so it leaves the driver's list and the assignment queue.
// - nothing paid → CANCELLED, with the same effects as a cancel by staff
//   (an open GCash link is closed, a delivery resolved). Its stock goes back
//   on the shelf only if it was never baked (PLACED, or CONFIRMED from
//   before automatic production): bread baked for a past day is not
//   sellable stock any more.
// - part paid → left open: it cannot be completed (money is owed) or
//   cancelled (the bakery gives no refunds), so it stays for staff, and is
//   counted in the result.
//
// Left alone: orders out for delivery (the driver may still be on the
// road; DELIVERED completes them), and synthetic history (data_source
// ASSUMED). Each order is closed in its own transaction holding the order
// row's lock (SKIP LOCKED: an order a person is changing right now is
// simply looked at again on the next run), and the status claim only
// succeeds from an open status, so a run that overlaps another changes
// nothing twice. The history and ledger rows have no user (migration 028),
// which the screens show as "System".
import { pool } from '../db.js'
import { getBillingSummary } from './billing.js'
import { config } from '../config.js'
import { markGatewayPaymentPaid } from './gatewayPayments.js'
import { applyCancellationEffects } from './orderStatus.js'
import { retrieveCheckoutSession } from './paymongo.js'

export const completedNote = 'Closed automatically after its day: paid in full.'
export const cancelledNote = 'Cancelled automatically: not paid or collected by its day.'

const closableStatuses = ['PLACED', 'CONFIRMED', 'IN_PRODUCTION', 'READY_FOR_PICKUP', 'READY_FOR_DELIVERY']

const staleOrdersQuery = `
  SELECT order_id FROM orders
   WHERE status = ANY($1::order_status[])
     AND data_source = 'RECORDED'
     AND (COALESCE(requested_fulfillment_time, order_date) AT TIME ZONE 'Asia/Manila')::date
         < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date
     AND ($2::bigint[] IS NULL OR order_id = ANY($2::bigint[]))
   ORDER BY order_id`

async function closeOne(orderId) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const locked = await client.query('SELECT status FROM orders WHERE order_id = $1 FOR UPDATE SKIP LOCKED', [orderId])
    if (!locked.rows[0] || !closableStatuses.includes(locked.rows[0].status)) {
      await client.query('ROLLBACK')
      return 'skipped'
    }
    const billing = await getBillingSummary(client, orderId)
    const paidSomething = Number(billing.amountPaid) > 0
    if (!billing.isFullyPaid && paidSomething) {
      await client.query('ROLLBACK')
      return 'partPaid'
    }
    const status = billing.isFullyPaid ? 'COMPLETED' : 'CANCELLED'
    const claimed = await client.query(
      `UPDATE orders SET status = $1 WHERE order_id = $2 AND status = ANY($3::order_status[]) RETURNING order_id`,
      [status, orderId, closableStatuses],
    )
    if (claimed.rowCount === 0) {
      await client.query('ROLLBACK')
      return 'skipped'
    }
    const neverBaked = ['PLACED', 'CONFIRMED'].includes(locked.rows[0].status)
    if (status === 'CANCELLED') {
      await applyCancellationEffects(client, orderId, null, { restoreStock: neverBaked })
    } else {
      await client.query(
        `UPDATE deliveries SET status = 'FAILED', failed_at = CURRENT_TIMESTAMP, note = left(concat_ws(chr(10), NULLIF(note, ''), $2::text), 2000)
          WHERE order_id = $1 AND status IN ('PENDING_ASSIGNMENT', 'ASSIGNED')`,
        [orderId, 'Closed automatically after its day; it was never sent out.'],
      )
    }
    await client.query(
      'INSERT INTO order_status_history (order_id, updated_by, status, note) VALUES ($1, NULL, $2, $3)',
      [orderId, status, status === 'COMPLETED' ? completedNote : neverBaked ? `${cancelledNote} Its stock was returned.` : `${cancelledNote} It was already baked, so no stock was returned.`],
    )
    await client.query('COMMIT')
    return status === 'COMPLETED' ? 'completed' : 'cancelled'
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

// Returns how many orders were completed, cancelled, and left open because
// they are part paid. `onlyOrderIds` limits a run to those orders (the
// tests, which share the database with suites running alongside).
export async function closeStaleOrders({ onlyOrderIds = null } = {}) {
  const stale = await pool.query(staleOrdersQuery, [closableStatuses, onlyOrderIds])
  const result = { completed: 0, cancelled: 0, partPaid: 0 }
  for (const { order_id: orderId } of stale.rows) {
    // One order that cannot be closed is logged and skipped, never allowed
    // to stop the rest of the run.
    const outcome = await closeOne(orderId).catch((error) => { console.error(`Could not close order ${orderId}:`, error); return 'failed' })
    if (outcome in result) result[outcome] += 1
  }
  return result
}

// ============================================================================
// Unpaid orders (payment first, RULES-PLANS/PAYMENT_FIRST_PLAN.md).
//
// - An online checkout held as AWAITING_PAYMENT for more than 15 minutes is
//   let go: CANCELLED by the system, its stock back on the shelf, its open
//   GCash attempt closed. It was never shown to staff and stays hidden.
//   Before letting it go, each open GCash attempt is checked with PayMongo:
//   one paid just now makes the order ready instead. If PayMongo cannot be
//   reached the hold is kept and asked about again on the next run.
// - An order from before payment first that is still open and has no
//   payment at all is cancelled the same way: there are no unpaid orders
//   any more. (One whose day has passed is closed by closeStaleOrders
//   above instead, without returning baked stock.)
// - A cash pickup (payment_mode CASH, SENIOR_CONSULT_PLAN.md S3) is unpaid
//   on purpose until it is collected, so it is left alone here; if nobody
//   comes, closeStaleOrders cancels it after its day.
// ============================================================================
export const holdMinutes = 15
export const releasedNote = `Checkout not paid within ${holdMinutes} minutes — released.`
export const unpaidNote = 'Cancelled automatically: no payment (payment first).'

const unpaidOrdersQuery = `
  SELECT o.order_id, o.status FROM orders o
   WHERE o.data_source = 'RECORDED'
     AND (
       (o.status = 'AWAITING_PAYMENT' AND o.order_date < CURRENT_TIMESTAMP - make_interval(mins => $1::int))
       OR (o.status IN ('PLACED', 'CONFIRMED', 'IN_PRODUCTION', 'READY_FOR_PICKUP', 'READY_FOR_DELIVERY')
           AND o.payment_mode IS DISTINCT FROM 'CASH'
           AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.order_id = o.order_id AND p.status IN ('PAID', 'PENDING')))
     )
     AND ($2::bigint[] IS NULL OR o.order_id = ANY($2::bigint[]))
   ORDER BY o.order_id`

// true when the hold must be kept: paid after all (now ready), or PayMongo
// could not be asked.
async function paidAfterAll(orderId) {
  const pending = await pool.query(`SELECT gateway_reference FROM payments WHERE order_id = $1 AND status = 'PENDING' AND gateway_reference IS NOT NULL`, [orderId])
  if (pending.rows.length === 0 || !config.paymongo.secretKey) return false
  for (const { gateway_reference: sessionId } of pending.rows) {
    try {
      const session = await retrieveCheckoutSession({ secretKey: config.paymongo.secretKey, checkoutSessionId: sessionId })
      if (session.paidPaymentId) {
        await markGatewayPaymentPaid(sessionId, session.paidPaymentId)
        return true
      }
    } catch {
      return true
    }
  }
  return false
}

async function cancelUnpaidOne(orderId, wasHold) {
  if (wasHold && (await paidAfterAll(orderId))) return 'kept'
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const locked = await client.query('SELECT status FROM orders WHERE order_id = $1 FOR UPDATE SKIP LOCKED', [orderId])
    const status = locked.rows[0]?.status
    if (!status || status === 'COMPLETED' || status === 'CANCELLED' || status === 'OUT_FOR_DELIVERY') {
      await client.query('ROLLBACK')
      return 'skipped'
    }
    const billing = await getBillingSummary(client, orderId)
    if (Number(billing.amountPaid) > 0) {
      await client.query('ROLLBACK')
      return 'skipped'
    }
    await client.query(`UPDATE orders SET status = 'CANCELLED' WHERE order_id = $1`, [orderId])
    await applyCancellationEffects(client, orderId, null)
    await client.query(
      'INSERT INTO order_status_history (order_id, updated_by, status, note) VALUES ($1, NULL, $2, $3)',
      [orderId, 'CANCELLED', wasHold ? releasedNote : unpaidNote],
    )
    await client.query('COMMIT')
    return 'cancelled'
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

// Returns how many holds/unpaid orders were cancelled, and how many holds
// were kept (paid after all, or PayMongo unreachable).
export async function cancelUnpaidOrders({ onlyOrderIds = null } = {}) {
  const unpaid = await pool.query(unpaidOrdersQuery, [holdMinutes, onlyOrderIds])
  const result = { cancelled: 0, kept: 0 }
  for (const { order_id: orderId, status } of unpaid.rows) {
    const outcome = await cancelUnpaidOne(orderId, status === 'AWAITING_PAYMENT').catch((error) => { console.error(`Could not release order ${orderId}:`, error); return 'failed' })
    if (outcome in result) result[outcome] += 1
  }
  return result
}
