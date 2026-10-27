import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { apiGet, apiPatch, apiPost } from '../../api/client.js'
import { PrintThisButton } from '../../components/PrintReport.jsx'
import { bakery, bakeryAddress } from '../../lib/bakery.js'
import { formatDateTime, formatPeso } from '../../lib/format.js'
import { orderLabel } from '../../lib/orderNumber.js'

// Where PayMongo sends the customer back after paying (the adviser,
// 2026-10-16): the receipt itself, with no list to pick from and no
// button to press first (routes/payments.js POST /intent, successUrl).
//
// Reaching this page never marks anything paid. It asks the server to
// check each pending GCash attempt with PayMongo (POST
// /api/payments/:id/confirm), which settles it only when PayMongo says it
// was paid — exactly as the webhook would — and then shows what the server
// says. If PayMongo has not finished yet it asks again a few times, then
// offers a "Check again" button. Refreshing repeats only those checks: a
// payment is settled once, whatever the number of reports, and nothing on
// this page creates an order or a payment.
//
// The order is read through GET /api/orders/:id, which answers 404 for an
// order that is not this customer's own, so a receipt can only ever show
// the signed-in customer's order.
//
// Payment first (RULES-PLANS/PAYMENT_FIRST_PLAN.md): checkout saves the
// order as a 15-minute hold and opens GCash at once. Back here unpaid (the
// customer backed out of GCash: ?cancelled=1, or the payment failed), the
// page offers the two ways forward — Pay with GCash again, or Cancel order.
// A hold not paid in time is let go by the system; the page says so.
const pollEveryMs = 3000
const pollTries = 10

const humanize = (status) => status.replaceAll('_', ' ').toLowerCase().replace(/^./, (letter) => letter.toUpperCase())
const methodName = (method) => ({ GCASH: 'GCash', CASH: 'Cash' })[method] ?? method

// The newest online attempt decides what to say when the order is not paid.
const latestOnlineAttempt = (order) => [...order.payment.payments].reverse().find((payment) => payment.gatewayReference)

export function ReceiptPage({ user }) {
  const { orderId } = useParams()
  const [searchParams] = useSearchParams()
  // Came back from GCash without paying: check once, then ask what next.
  const backedOut = searchParams.get('cancelled') === '1'
  const [order, setOrder] = useState(null)
  const [phase, setPhase] = useState('verifying') // verifying | paid | cashDue | pending | unpaid | released | lateTaken | error
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const [message, setMessage] = useState('')
  const tries = useRef(0)
  const timer = useRef(null)

  const verify = useCallback(async () => {
    window.clearTimeout(timer.current)
    try {
      let data = await apiGet(`/api/orders/${orderId}`)
      const pending = data.order.payment.payments.filter((payment) => payment.status === 'PENDING')
      if (pending.length && data.order.status !== 'CANCELLED') {
        // A check that fails to reach PayMongo is not an error here: the
        // payment simply stays pending and is asked about again.
        await Promise.all(pending.map((payment) => apiPost(`/api/payments/${payment.id}/confirm`, {}).catch(() => null)))
        data = await apiGet(`/api/orders/${orderId}`)
      }
      const current = data.order
      setOrder(current)
      // Paid after the hold was let go: recorded, flagged for the bakery.
      if (current.status === 'CANCELLED' && current.payment.isFullyPaid) return setPhase('lateTaken')
      if (current.payment.isFullyPaid) return setPhase('paid')
      if (current.status === 'CANCELLED') return setPhase('released')
      // A cash pickup is placed unpaid on purpose (SENIOR_CONSULT_PLAN.md,
      // S3): it is paid at the counter when collected.
      if (current.paymentMode === 'CASH') return setPhase('cashDue')
      const stillPending = current.payment.payments.some((payment) => payment.status === 'PENDING')
      if (stillPending && !backedOut) {
        // Keep the spinner up while there are tries left; after that,
        // say so and let the customer ask again.
        tries.current += 1
        if (tries.current < pollTries) {
          setPhase('verifying')
          timer.current = window.setTimeout(verify, pollEveryMs)
        } else {
          setPhase('pending')
        }
        return undefined
      }
      setPhase('unpaid')
      const attempt = latestOnlineAttempt(current)
      setMessage(attempt?.status === 'FAILED'
        ? 'Your GCash payment did not go through. No money was taken for it.'
        : 'Your order is not paid yet.')
    } catch (error) {
      setPhase('error')
      setMessage(error.status === 404 ? 'We could not find that order on your account.' : error.message)
    }
    return undefined
  }, [orderId, backedOut])

  useEffect(() => {
    tries.current = 0
    verify()
    return () => window.clearTimeout(timer.current)
  }, [verify])

  const checkAgain = () => {
    tries.current = 0
    setPhase('verifying')
    verify()
  }

  // Pay again: an open GCash attempt blocks a new one, so it is closed
  // first (a payment that still lands on it is recorded all the same).
  const payAgain = async () => {
    setBusy(true)
    setActionError('')
    try {
      for (const payment of order.payment.payments.filter((entry) => entry.status === 'PENDING')) {
        await apiPatch(`/api/payments/${payment.id}`, { status: 'CANCELLED' })
      }
      const intent = await apiPost('/api/payments/intent', { orderId: order.id })
      window.location.href = intent.checkoutUrl
    } catch (error) {
      setActionError(error.message)
      setBusy(false)
    }
  }

  // Cancel the unpaid order: its stock goes back; nothing was charged.
  const cancelOrder = async () => {
    if (!window.confirm(`Cancel order ${orderLabel(order)}? Nothing has been charged.`)) return
    const cashOrder = order.paymentMode === 'CASH'
    setBusy(true)
    setActionError('')
    try {
      await apiPatch(`/api/orders/${order.id}`, { status: 'CANCELLED', note: cashOrder ? 'Cash order cancelled by the customer.' : 'Checkout cancelled by the customer.' })
      setPhase('released')
      setOrder({ ...order, status: 'CANCELLED' })
    } catch (error) {
      setActionError(error.message)
    } finally {
      setBusy(false)
    }
  }

  if (phase === 'verifying' || (!order && phase !== 'error')) {
    return (
      <section className="mx-auto max-w-2xl px-4 py-14 text-center sm:px-7">
        <div role="status" aria-live="polite" className="rounded-2xl border border-cream-200 bg-white p-10">
          <span aria-hidden="true" className="mx-auto block h-10 w-10 animate-spin rounded-full border-4 border-cream-200 border-t-crust-600" />
          <h1 className="mt-5 text-xl font-extrabold text-cocoa-900">Confirming your payment…</h1>
          <p className="mt-2 text-sm text-cocoa-500">We are checking with GCash. This usually takes a few seconds — please keep this page open.</p>
        </div>
      </section>
    )
  }

  if (phase === 'error') {
    return (
      <section className="mx-auto max-w-2xl px-4 py-14 text-center sm:px-7">
        <div className="rounded-2xl border border-cream-200 bg-white p-8">
          <p className="text-sm font-semibold text-red-700">{message}</p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button type="button" onClick={checkAgain} className="rounded-full bg-crust-600 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-crust-700">Try again</button>
            <Link to="/account?tab=orders" className="rounded-full border border-crust-600 px-5 py-2.5 text-xs font-bold text-crust-700 transition hover:bg-cream-100">View My Orders</Link>
          </div>
        </div>
      </section>
    )
  }

  if (phase === 'released' || phase === 'lateTaken') {
    return (
      <section className="mx-auto max-w-2xl px-4 py-14 text-center sm:px-7">
        <div className="rounded-2xl border border-cream-200 bg-white p-8">
          <h1 className="text-xl font-extrabold text-cocoa-900">{phase === 'released' ? 'Order not placed' : 'Payment received late'}</h1>
          <p className="mt-3 text-sm text-cocoa-500">
            {phase === 'released'
              ? `Order ${orderLabel(order)} was not paid, so it was cancelled. Nothing was charged.`
              : `Your payment for order ${orderLabel(order)} arrived after the order was let go. Please call the bakery at ${bakery.phones[0]} so we can sort it out.`}
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link to="/menu" className="rounded-full bg-crust-600 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-crust-700">Back to the menu</Link>
          </div>
        </div>
      </section>
    )
  }

  if (phase === 'cashDue') {
    return (
      <section className="mx-auto max-w-2xl px-4 py-14 text-center sm:px-7">
        <div className="rounded-2xl border border-cream-200 bg-white p-8">
          <h1 className="text-xl font-extrabold text-cocoa-900">Order {orderLabel(order)} is placed</h1>
          <p className="mt-3 text-sm text-cocoa-500">
            It is ready for pickup at the bakery{order.requestedFulfillmentTime ? ` on ${formatDateTime(order.requestedFulfillmentTime)}` : ''}. Pay <span className="font-bold text-cocoa-900">{formatPeso(order.payment.totalAmount)}</span> in cash when you pick it up.
          </p>
          <p className="mt-2 text-xs text-cocoa-500">Payment method: Cash · Not paid yet. An order not collected by the end of its day is cancelled.</p>
          {actionError && <p role="alert" className="mt-2 text-xs font-semibold text-red-700">{actionError}</p>}
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link to="/account?tab=orders" className="rounded-full bg-crust-600 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-crust-700">View My Orders</Link>
            <button type="button" onClick={cancelOrder} disabled={busy} className="rounded-full border border-red-300 px-5 py-2.5 text-xs font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-60">{busy ? 'Please wait…' : 'Cancel order'}</button>
          </div>
        </div>
      </section>
    )
  }

  if (phase === 'pending' || phase === 'unpaid') {
    return (
      <section className="mx-auto max-w-2xl px-4 py-14 text-center sm:px-7">
        <div className="rounded-2xl border border-cream-200 bg-white p-8">
          <h1 className="text-xl font-extrabold text-cocoa-900">{phase === 'pending' ? 'Still waiting for GCash' : 'Finish paying to place your order'}</h1>
          <p className="mt-3 text-sm text-cocoa-500">
            {phase === 'pending'
              ? `GCash has not confirmed the payment for order ${orderLabel(order)} yet. If you finished paying, it will show here in a moment.`
              : `${message} We hold order ${orderLabel(order)} (${formatPeso(order.payment.totalAmount)}) for 15 minutes — pay with GCash to place it, or cancel it.`}
          </p>
          {actionError && <p role="alert" className="mt-2 text-xs font-semibold text-red-700">{actionError}</p>}
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            {phase === 'pending' && <button type="button" onClick={checkAgain} className="rounded-full bg-crust-600 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-crust-700">Check again</button>}
            {phase === 'unpaid' && (
              <>
                <button type="button" onClick={payAgain} disabled={busy} className="rounded-full bg-crust-600 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-crust-700 disabled:opacity-60">{busy ? 'Please wait…' : 'Pay with GCash'}</button>
                <button type="button" onClick={cancelOrder} disabled={busy} className="rounded-full border border-red-300 px-5 py-2.5 text-xs font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-60">Cancel order</button>
              </>
            )}
          </div>
        </div>
      </section>
    )
  }

  // Paid: the receipt.
  const paidPayments = order.payment.payments.filter((payment) => payment.status === 'PAID')
  return (
    <section className="mx-auto max-w-2xl px-4 py-10 sm:px-7 sm:py-14">
      <p role="status" className="mb-4 rounded-xl bg-butter-100 px-4 py-3 text-center text-sm font-bold text-cocoa-900 print:hidden">Payment received — thank you! Here is your receipt.</p>
      <article className="print-only-target rounded-2xl border border-cream-200 bg-white p-6 text-sm text-cocoa-700 sm:p-8">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-cream-200 pb-4">
          <div>
            <p className="font-display text-2xl font-bold text-cocoa-900">{bakery.name}</p>
            <p className="text-xs text-cocoa-500">{bakeryAddress} · {bakery.phones.join(' / ')}</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-bold uppercase tracking-wide text-cocoa-500">Receipt</p>
            <p className="text-lg font-extrabold text-cocoa-900">Order {orderLabel(order, { withDay: true })}</p>
          </div>
        </header>

        <dl className="mt-4 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
          <div className="flex justify-between gap-2 sm:block"><dt className="text-cocoa-500">Customer</dt><dd className="font-semibold text-cocoa-900">{order.customerName ?? user?.name}</dd></div>
          {user?.email && <div className="flex justify-between gap-2 sm:block"><dt className="text-cocoa-500">Email</dt><dd className="font-semibold text-cocoa-900">{user.email}</dd></div>}
          {user?.contactNumber && <div className="flex justify-between gap-2 sm:block"><dt className="text-cocoa-500">Contact number</dt><dd className="font-semibold text-cocoa-900">{user.contactNumber}</dd></div>}
          <div className="flex justify-between gap-2 sm:block"><dt className="text-cocoa-500">Placed</dt><dd className="font-semibold text-cocoa-900">{formatDateTime(order.orderDate)}</dd></div>
          <div className="flex justify-between gap-2 sm:block"><dt className="text-cocoa-500">Order type</dt><dd className="font-semibold text-cocoa-900">{order.orderType === 'DELIVERY' ? 'Delivery' : 'Pickup'}</dd></div>
          {/* Where it is delivered (MINOR_REVISIONS_PLAN.md M8). */}
          {order.deliveryAddress && <div className="flex justify-between gap-2 sm:col-span-2 sm:block"><dt className="text-cocoa-500">Delivery address</dt><dd className="text-right font-semibold text-cocoa-900 sm:text-left">{order.deliveryAddress}</dd></div>}
          <div className="flex justify-between gap-2 sm:block"><dt className="text-cocoa-500">Order status</dt><dd className="font-semibold text-cocoa-900">{humanize(order.status)}</dd></div>
          {order.requestedFulfillmentTime && <div className="flex justify-between gap-2 sm:block"><dt className="text-cocoa-500">Needed by</dt><dd className="font-semibold text-cocoa-900">{formatDateTime(order.requestedFulfillmentTime)}</dd></div>}
        </dl>

        <table className="mt-5 w-full text-left text-xs">
          <caption className="sr-only">Items</caption>
          <thead>
            <tr className="border-b border-cream-200 text-cocoa-500">
              <th scope="col" className="py-2 font-semibold">Item</th>
              <th scope="col" className="py-2 text-right font-semibold">Qty</th>
              <th scope="col" className="py-2 text-right font-semibold">Price</th>
              <th scope="col" className="py-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => (
              <tr key={item.productId} className="border-b border-cream-100">
                <td className="py-2 text-cocoa-900">{item.productName}</td>
                <td className="py-2 text-right tabular-nums">{item.quantity}</td>
                <td className="py-2 text-right tabular-nums">{formatPeso(item.unitPrice)}</td>
                <td className="py-2 text-right font-semibold tabular-nums text-cocoa-900">{formatPeso(Number(item.unitPrice) * item.quantity)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {Number(order.deliveryFee) > 0 && (
              <tr>
                <th scope="row" colSpan={3} className="pt-3 text-right text-xs font-semibold text-cocoa-700">Delivery fee</th>
                <td className="pt-3 text-right font-semibold tabular-nums text-cocoa-900">{formatPeso(order.deliveryFee)}</td>
              </tr>
            )}
            <tr>
              <th scope="row" colSpan={3} className="pt-3 text-right text-sm text-cocoa-900">Total</th>
              <td className="pt-3 text-right text-base font-extrabold tabular-nums text-cocoa-900">{formatPeso(order.payment.totalAmount)}</td>
            </tr>
          </tfoot>
        </table>

        <div className="mt-5 rounded-xl bg-cream-50 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-cocoa-500">Payment</p>
          <ul className="mt-2 space-y-2 text-xs">
            {paidPayments.map((payment) => (
              <li key={payment.id} className="flex flex-wrap items-start justify-between gap-2">
                <span>
                  <span className="font-semibold text-cocoa-900">{methodName(payment.method)}</span> · {formatDateTime(payment.paymentDate ?? payment.createdAt)}
                  {(payment.gatewayPaymentId || payment.gatewayReference) && <span className="block break-all text-cocoa-500">Transaction ref: {payment.gatewayPaymentId ?? payment.gatewayReference}</span>}
                </span>
                <span className="text-right">
                  <span className="block font-semibold tabular-nums text-cocoa-900">{formatPeso(payment.amount)}</span>
                  <span className="text-[10px] font-bold uppercase text-green-800">Paid</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center justify-between border-t border-cream-200 pt-2 text-sm">
            <span className="font-bold text-cocoa-900">Payment status</span>
            <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-bold text-green-800">Paid in full</span>
          </div>
        </div>
        <p className="mt-4 text-center text-[11px] text-cocoa-500">Thank you for ordering from {bakery.name}.</p>
      </article>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center print:hidden">
        <PrintThisButton label="Print or save as PDF" />
        <Link to="/account?tab=orders" className="rounded-full border border-crust-600 px-5 py-2.5 text-center text-xs font-bold text-crust-700 transition hover:bg-cream-100">View My Orders</Link>
        <Link to="/menu" className="rounded-full border border-crust-600 px-5 py-2.5 text-center text-xs font-bold text-crust-700 transition hover:bg-cream-100">Back to the menu</Link>
      </div>
    </section>
  )
}
