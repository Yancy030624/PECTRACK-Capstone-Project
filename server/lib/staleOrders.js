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
import { applyCancellationEffects } from './orderStatus.js'

export const completedNote = 'Closed automatically after its day: paid in full.'
export const cancelledNote = 'Cancelled automatically: not paid or collected by its day.'

const closableStatuses = ['PLACED', 'CONFIRMED', 'IN_PRODUCTION', 'READY_FOR_PICKUP']

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
    const outcome = await closeOne(orderId)
    if (outcome in result) result[outcome] += 1
  }
  return result
}
