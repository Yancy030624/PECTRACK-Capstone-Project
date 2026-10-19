// GET /api/receipts/:token — a counter reservation's receipt, opened from
// the link in its email (RULES-PLANS/RESERVE_SMS_PLAN.md). No sign-in: the
// long random token is the key, and only its hash is stored. It shows what
// the customer needs at the counter and nothing more — no contact number,
// no email, the first name only.
import crypto from 'node:crypto'
import express from 'express'
import { pool } from '../db.js'
import { receiptLimiter } from '../lib/security.js'

const router = express.Router()

router.get('/:token', receiptLimiter, async (request, response) => {
  const token = String(request.params.token ?? '')
  const notFound = { message: 'This receipt link is not valid.' }
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return response.status(404).json(notFound)

  const found = await pool.query(
    `SELECT o.order_id, o.guest_name, o.status, o.total_amount, o.requested_fulfillment_time, o.order_date,
            (SELECT COALESCE(SUM(p.amount), 0) FROM payments p WHERE p.order_id = o.order_id AND p.status = 'PAID') AS amount_paid,
            (SELECT p.payment_method FROM payments p WHERE p.order_id = o.order_id AND p.status = 'PAID' ORDER BY p.payment_id LIMIT 1) AS payment_method
       FROM orders o
      WHERE o.receipt_token_hash = $1`,
    [crypto.createHash('sha256').update(token).digest('hex')],
  )
  const order = found.rows[0]
  if (!order) return response.status(404).json(notFound)

  const items = await pool.query(
    `SELECT p.product_name, p.variant, od.quantity, od.unit_price
       FROM order_details od JOIN products p ON p.product_id = od.product_id
      WHERE od.order_id = $1 ORDER BY od.order_detail_id`,
    [order.order_id],
  )
  return response.json({
    receipt: {
      orderNumber: order.order_id,
      firstName: (order.guest_name ?? '').trim().split(/\s+/)[0] || null,
      status: order.status,
      totalAmount: order.total_amount,
      amountPaid: order.amount_paid,
      paymentMethod: order.payment_method,
      pickupTime: order.requested_fulfillment_time,
      orderedAt: order.order_date,
      items: items.rows.map((row) => ({ name: row.product_name, variant: row.variant, quantity: row.quantity, unitPrice: row.unit_price })),
    },
  })
})

export default router
