// Proof of order for a counter reservation (RULES-PLANS/RESERVE_SMS_PLAN.md):
// the receipt by email, with the private receipt link, and the order
// number by SMS for a customer with no internet to open the email. Both
// go out after the order is committed, in the background; neither can
// fail or undo the order.
import { pool } from '../db.js'
import { bakery, bakeryAddress, bakeryPhones } from './bakery.js'
import { sendMail } from './mail.js'
import { sendInBackground } from './notices.js'
import { sendSms } from './sms.js'

const manilaDateTime = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const peso = (amount) => `P${Number(amount).toFixed(2)}`
const firstName = (name) => (name ?? '').trim().split(/\s+/)[0] || 'there'

export function sendReservationNotices({ orderId, receiptUrl }) {
  sendInBackground('reservation receipt', async () => {
    const found = await pool.query(
      `SELECT o.order_id, o.guest_name, o.guest_contact, o.guest_email, o.total_amount, o.requested_fulfillment_time,
              (SELECT p.payment_method FROM payments p WHERE p.order_id = o.order_id AND p.status = 'PAID' ORDER BY p.payment_id LIMIT 1) AS payment_method
         FROM orders o WHERE o.order_id = $1`,
      [orderId],
    )
    const order = found.rows[0]
    if (!order) return
    const pickup = order.requested_fulfillment_time ? manilaDateTime.format(new Date(order.requested_fulfillment_time)) : 'when it is ready'

    // The SMS first and short: one text (160 characters) and no link,
    // because it is for a phone with no data. Never starts with "TEST",
    // which Semaphore drops.
    if (order.guest_contact) {
      sendInBackground('reservation SMS', () => sendSms({
        to: order.guest_contact,
        message: `PECTRACK order #${order.order_id} is paid (${peso(order.total_amount)}). Pick up ${pickup}. Show this text at the counter.`,
      }))
    }

    if (!order.guest_email) return
    const lines = await pool.query(
      `SELECT p.product_name AS name, p.variant, od.quantity, od.unit_price
         FROM order_details od JOIN products p ON p.product_id = od.product_id
        WHERE od.order_id = $1 ORDER BY od.order_detail_id`,
      [orderId],
    )
    await sendMail({
      to: order.guest_email,
      subject: `Your advanced order #${order.order_id} at ${bakery.name}`,
      text: [
        `Hello ${firstName(order.guest_name)},`,
        '',
        `Thank you for your advanced order. It is paid and will be ready for you.`,
        '',
        `Order number: #${order.order_id}`,
        `Pick up: ${pickup}`,
        `Where: ${bakery.name}, ${bakeryAddress}`,
        `We are open ${bakery.hours}.`,
        '',
        'Your order:',
        ...lines.rows.map((line) => `  - ${line.name}${line.variant ? ` (${line.variant})` : ''} × ${line.quantity}  ${peso(Number(line.unit_price) * line.quantity)}`),
        '',
        `Total paid: ${peso(order.total_amount)}${order.payment_method ? ` (${({ QRPH: 'GCash', GCASH: 'GCash' })[order.payment_method] ?? 'Cash'})` : ''}`,
        '',
        'Show this email, the receipt page, or the order number at the counter when you pick it up.',
        `Your receipt: ${receiptUrl}`,
        '',
        `— ${bakery.name}`,
        `${bakeryAddress} · ${bakeryPhones}`,
      ].join('\n'),
    })
  })
}
