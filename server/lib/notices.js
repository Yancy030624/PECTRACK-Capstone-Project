// The emails that tell people an order moved (NOTIFICATIONS_PLAN.md, N4 and
// N5). All the wording is here, in one file; the routes only pass facts.
//
// - The driver: a new delivery was assigned to them. The in-app bell only
//   works while PECTRACK is open in front; a phone pauses it. The Gmail
//   app on the driver's phone shows this email even with the browser
//   closed.
// - The customer: a pickup order is ready; a delivery is on the way, was
//   delivered, or could not be delivered. The "delivered" email is the
//   wrong-house safeguard: the customer learns within a minute that the
//   bakery thinks the order arrived, and has the numbers to call.
//
// Every one is sent AFTER the change is committed, in the background:
// `sendInBackground` never lets an email failure fail or slow the request,
// and the change itself is never undone because mail did not go out.
import { config } from '../config.js'
import { pool } from '../db.js'
import { bakery, bakeryAddress, bakeryPhones } from './bakery.js'
import { sendMail } from './mail.js'
import { orderLabel } from './orderNumber.js'

const manilaTime = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const formatTime = (value) => manilaTime.format(new Date(value))
const firstName = (name) => (name ?? '').trim().split(/\s+/)[0] || 'there'

// "1 Bell St, Brgy. Ayuti, Lucban, Quezon" from a delivery's address.
const formatAddress = (address) => [
  address?.addressLine1,
  address?.addressLine2,
  // People type the barangay with or without "Brgy."; add it only once.
  address?.barangay && (/^(brgy|barangay)/i.test(address.barangay) ? address.barangay : `Brgy. ${address.barangay}`),
  address?.municipality,
  address?.province,
].filter(Boolean).join(', ')

const itemLines = (items = []) => items.map((item) => `  - ${item.name}${item.variant ? ` (${item.variant})` : ''} × ${item.quantity}`)

// The order as people read it: its permanent number, "#21170".
const subjectNumber = (order) => `#${order.orderNumber}`
const bodyLabel = (order) => orderLabel(order.orderNumber)

const accountLink = () => `${config.clientOrigin}/account`
const signOff = [`— ${bakery.name}`, `${bakeryAddress} · ${bakeryPhones}`]

// Runs one send without waiting for it. Logged, never thrown: an email that
// fails must not turn a completed change into an error for the person who
// made it.
export function sendInBackground(what, send) {
  Promise.resolve()
    .then(send)
    .catch((error) => console.error(`Could not send the ${what} email:`, error))
}

// N4 — to the driver, when a delivery is assigned to them.
export function sendDeliveryAssignedEmail({ to, driverName, order, customerName, address, items, requestedFulfillmentTime, instructions }) {
  return sendMail({
    to,
    subject: `New delivery ${subjectNumber(order)} — ${bakery.name}`,
    text: [
      `Hello ${firstName(driverName)},`,
      '',
      `Order ${bodyLabel(order)} has been assigned to you.`,
      '',
      `Deliver to: ${address?.recipientName ?? customerName ?? 'the customer'}${address?.contactNumber ? `, ${address.contactNumber}` : ''}`,
      `Address: ${formatAddress(address)}`,
      ...(address?.deliveryNotes ? [`Directions: ${address.deliveryNotes}`] : []),
      ...(requestedFulfillmentTime ? [`Needed by: ${formatTime(requestedFulfillmentTime)}`] : []),
      ...(instructions ? [`Instructions: ${instructions}`] : []),
      '',
      'Items:',
      ...itemLines(items),
      '',
      'The order is already paid; there is nothing to collect.',
      `Open My Deliveries to start it: ${config.clientOrigin}/dashboard`,
      '',
      ...signOff,
    ].join('\n'),
  })
}

// N5 — to the customer, when their pickup order is ready.
export function sendOrderReadyEmail({ to, name, order, items, requestedTime }) {
  return sendMail({
    to,
    subject: `Your order ${subjectNumber(order)} is ready for pickup`,
    text: [
      `Hello ${firstName(name)},`,
      '',
      `Your order ${bodyLabel(order)} is paid and ready. Pick it up at ${bakery.name}, ${bakeryAddress}${requestedTime ? `, from ${formatTime(requestedTime)}` : ''}.`,
      `We are open ${bakery.hours}.`,
      '',
      'Your order:',
      ...itemLines(items),
      '',
      `See your orders: ${accountLink()}`,
      '',
      ...signOff,
    ].join('\n'),
  })
}

// The "ready for pickup" email for one order, looked up by id: to its
// customer, only at a confirmed email. A walk-in order has no customer and
// gets nothing. Used once the order is paid and ready (payment first,
// lib/gatewayPayments.js) and when staff mark an older order ready.
export async function sendOrderReadyEmailFor(orderId) {
  const found = await pool.query(
    `SELECT o.requested_fulfillment_time, c.name, c.email, c.email_verified_at
       FROM orders o JOIN customers c ON c.customer_id = o.customer_id
      WHERE o.order_id = $1`,
    [orderId],
  )
  const customer = found.rows[0]
  if (!customer?.email || !customer.email_verified_at) return
  const lines = await pool.query(
    `SELECT p.product_name AS name, p.variant, od.quantity
       FROM order_details od JOIN products p ON p.product_id = od.product_id
      WHERE od.order_id = $1 ORDER BY p.product_name, p.variant NULLS FIRST`,
    [orderId],
  )
  await sendOrderReadyEmail({ to: customer.email, name: customer.name, order: { orderNumber: orderId }, items: lines.rows, requestedTime: customer.requested_fulfillment_time })
}

// QR Ph (QRPH_PLAN.md, Q9 and Q12) — to the customer, once staff checked
// the reference number they sent: confirmed, so the order is ready (or
// being prepared for delivery); or not accepted, with the reason, and the
// order cancelled. Only at a confirmed email, like the ready email.
export async function sendQrPaymentDecisionEmail({ orderId, confirmed, reason }) {
  const found = await pool.query(
    `SELECT o.order_type, o.requested_fulfillment_time, c.name, c.email, c.email_verified_at
       FROM orders o JOIN customers c ON c.customer_id = o.customer_id
      WHERE o.order_id = $1`,
    [orderId],
  )
  const customer = found.rows[0]
  if (!customer?.email || !customer.email_verified_at) return
  const order = { orderNumber: orderId }
  if (!confirmed) {
    await sendMail({
      to: customer.email,
      subject: `Your payment for order ${subjectNumber(order)} was not accepted`,
      text: [
        `Hello ${firstName(customer.name)},`,
        '',
        `We could not confirm the GCash payment you sent for order ${bodyLabel(order)}.`,
        `Reason: ${reason}`,
        '',
        'The order was cancelled. If you did pay, call us with your reference number and we will sort it out.',
        `Call us at ${bakeryPhones}.`,
        '',
        ...signOff,
      ].join('\n'),
    })
    return
  }
  if (customer.order_type !== 'DELIVERY') {
    await sendOrderReadyEmailFor(orderId)
    return
  }
  await sendMail({
    to: customer.email,
    subject: `Payment confirmed for order ${subjectNumber(order)}`,
    text: [
      `Hello ${firstName(customer.name)},`,
      '',
      `We confirmed your GCash payment for order ${bodyLabel(order)}. The order is ready for delivery${customer.requested_fulfillment_time ? ` at ${formatTime(customer.requested_fulfillment_time)}` : ''}.`,
      'We will email you again when it leaves the bakery.',
      '',
      `See your orders: ${accountLink()}`,
      '',
      ...signOff,
    ].join('\n'),
  })
}

// N5 — to the customer, when the driver leaves with their order.
export function sendOutForDeliveryEmail({ to, name, order, driverName, address, items }) {
  return sendMail({
    to,
    subject: `Your order ${subjectNumber(order)} is on the way`,
    text: [
      `Hello ${firstName(name)},`,
      '',
      `Your order ${bodyLabel(order)} has left the bakery${driverName ? ` with ${firstName(driverName)}, our rider` : ''}.`,
      '',
      `Delivering to: ${address?.recipientName ? `${address.recipientName}, ` : ''}${formatAddress(address)}`,
      '',
      'Your order:',
      ...itemLines(items),
      '',
      'Please keep your phone nearby; the rider may call or text when they arrive.',
      `See your orders: ${accountLink()}`,
      '',
      ...signOff,
    ].join('\n'),
  })
}

// N5 — to the customer, when the driver marks the order delivered.
export function sendDeliveredEmail({ to, name, order, deliveredAt, address }) {
  return sendMail({
    to,
    subject: `Your order ${subjectNumber(order)} was delivered`,
    text: [
      `Hello ${firstName(name)},`,
      '',
      `Your order ${bodyLabel(order)} was delivered at ${formatTime(deliveredAt ?? new Date())}`,
      `to ${address?.recipientName ? `${address.recipientName}, ` : ''}${formatAddress(address)}.`,
      '',
      `If you did not receive this order, call us today at ${bakeryPhones}.`,
      '',
      `Thank you for ordering from ${bakery.name}.`,
      `See your orders: ${accountLink()}`,
      '',
      ...signOff,
    ].join('\n'),
  })
}

// N5 — to the customer, when a delivery could not be completed. The
// driver's own note stays internal.
export function sendDeliveryFailedEmail({ to, name, order }) {
  return sendMail({
    to,
    subject: `We could not deliver order ${subjectNumber(order)}`,
    text: [
      `Hello ${firstName(name)},`,
      '',
      `We tried to deliver your order ${bodyLabel(order)} but could not complete it.`,
      `The bakery will contact you to arrange it. You can also call us at ${bakeryPhones}.`,
      '',
      `See your orders: ${accountLink()}`,
      '',
      ...signOff,
    ].join('\n'),
  })
}
