import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiGet, apiPatch, apiPost, apiUpload } from '../../api/client.js'
import { PrintThisButton } from '../../components/PrintReport.jsx'
import { bakery, bakeryAddress } from '../../lib/bakery.js'
import { formatDateTime, formatPeso } from '../../lib/format.js'
import { orderLabel } from '../../lib/orderNumber.js'

// The receipt page, and since QR Ph (RULES-PLANS/QRPH_PLAN.md) also where
// an online order is paid. Checkout saves the order as a 15-minute hold
// (payment first, PAYMENT_FIRST_PLAN.md) and opens this page, which shows:
//
// - pay:      the bakery's QR Ph code, the account name and the exact
//             amount; the customer pays in their own bank or e-wallet app,
//             then types the reference number (and may attach a
//             screenshot). Or cancels the order.
// - waiting:  "Waiting for payment confirmation" while a person at the
//             bakery checks that reference in the bakery's app. The page
//             asks again every few seconds; the customer is also emailed.
// - rejected: the bakery did not find the payment; the reason, and the
//             order cancelled with its stock returned.
// - paid:     the receipt.
// - cashDue:  a cash pickup, paid at the counter (SENIOR_CONSULT_PLAN.md S3).
// - released: a hold nobody paid in 15 minutes, let go by the system.
//
// Reaching this page never marks anything paid. The order is read through
// GET /api/orders/:id, which answers 404 for an order that is not this
// customer's own, so a receipt can only ever show their own order.
const waitingPollMs = 8000

const humanize = (status) => status.replaceAll('_', ' ').toLowerCase().replace(/^./, (letter) => letter.toUpperCase())
// QRPH: QR Ph (QRPH_PLAN.md, Q14); GCASH: an older PayMongo payment.
const methodName = (method) => ({ QRPH: 'QR Ph', GCASH: 'GCash', CASH: 'Cash' })[method] ?? method

const latestQrPayment = (order) => [...order.payment.payments].reverse().find((payment) => payment.method === 'QRPH')

export function ReceiptPage({ user }) {
  const { orderId } = useParams()
  const [order, setOrder] = useState(null)
  const [phase, setPhase] = useState('loading') // loading | paid | cashDue | pay | waiting | rejected | released | lateTaken | error
  const [qr, setQr] = useState(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const [message, setMessage] = useState('')
  const timer = useRef(null)

  const load = useCallback(async () => {
    window.clearTimeout(timer.current)
    try {
      const { order: current } = await apiGet(`/api/orders/${orderId}`, { background: true })
      setOrder(current)
      const qrPayment = latestQrPayment(current)
      // Paid after the hold was let go: recorded, flagged for the bakery.
      if (current.status === 'CANCELLED' && current.payment.isFullyPaid) return setPhase('lateTaken')
      if (current.payment.isFullyPaid) return setPhase('paid')
      if (current.status === 'CANCELLED') return setPhase(qrPayment?.status === 'FAILED' ? 'rejected' : 'released')
      // A cash pickup is placed unpaid on purpose (SENIOR_CONSULT_PLAN.md,
      // S3): it is paid at the counter when collected.
      if (current.paymentMode === 'CASH') return setPhase('cashDue')
      if (qrPayment?.status === 'PENDING') {
        setPhase('waiting')
        timer.current = window.setTimeout(load, waitingPollMs)
        return undefined
      }
      setPhase('pay')
    } catch (error) {
      setPhase('error')
      setMessage(error.status === 404 ? 'We could not find that order on your account.' : error.message)
    }
    return undefined
  }, [orderId])

  useEffect(() => {
    load()
    return () => window.clearTimeout(timer.current)
  }, [load])

  useEffect(() => {
    if (phase !== 'pay' || qr) return
    apiGet('/api/qrph').then(setQr).catch(() => setQr({ configured: false }))
  }, [phase, qr])

  const tryAgain = () => {
    setPhase('loading')
    load()
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

  if (phase === 'loading' || (!order && phase !== 'error')) {
    return (
      <section className="mx-auto max-w-2xl px-4 py-14 text-center sm:px-7">
        <div role="status" aria-live="polite" className="rounded-2xl border border-cream-200 bg-white p-10">
          <span aria-hidden="true" className="mx-auto block h-10 w-10 animate-spin rounded-full border-4 border-cream-200 border-t-crust-600" />
          <h1 className="mt-5 text-xl font-extrabold text-cocoa-900">Opening your order…</h1>
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
            <button type="button" onClick={tryAgain} className="rounded-full bg-crust-600 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-crust-700">Try again</button>
            <Link to="/account?tab=orders" className="rounded-full border border-crust-600 px-5 py-2.5 text-xs font-bold text-crust-700 transition hover:bg-cream-100">View My Orders</Link>
          </div>
        </div>
      </section>
    )
  }

  if (phase === 'rejected') {
    const rejected = latestQrPayment(order)
    return (
      <section className="mx-auto max-w-2xl px-4 py-14 text-center sm:px-7">
        <div className="rounded-2xl border border-cream-200 bg-white p-8">
          <h1 className="text-xl font-extrabold text-cocoa-900">Payment not accepted</h1>
          <p className="mt-3 text-sm text-cocoa-500">The bakery could not confirm the QR Ph payment for order {orderLabel(order)}, so the order was cancelled and nothing was set aside.</p>
          {rejected?.rejectedReason && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800">Reason: {rejected.rejectedReason}</p>}
          <p className="mt-3 text-xs text-cocoa-500">If you did pay, call us at {bakery.phones.join(' or ')} with your reference number{rejected?.gatewayReference ? ` (${rejected.gatewayReference})` : ''}.</p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link to="/menu" className="rounded-full bg-crust-600 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-crust-700">Back to the menu</Link>
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

  if (phase === 'waiting') {
    const sent = latestQrPayment(order)
    return (
      <section className="mx-auto max-w-2xl px-4 py-14 text-center sm:px-7">
        <div className="rounded-2xl border border-cream-200 bg-white p-8">
          <span aria-hidden="true" className="mx-auto block h-10 w-10 animate-spin rounded-full border-4 border-cream-200 border-t-crust-600" />
          <h1 role="status" className="mt-5 text-xl font-extrabold text-cocoa-900">Waiting for payment confirmation</h1>
          <p className="mt-3 text-sm text-cocoa-500">
            We received reference number <span className="font-bold break-all text-cocoa-900">{sent.gatewayReference}</span> for <span className="font-bold text-cocoa-900">{formatPeso(sent.amount)}</span>. Someone at the bakery is checking it now. This page updates by itself, and we email you once it is confirmed.
          </p>
          {sent.hasProof
            ? <p className="mt-3 text-xs font-semibold text-green-800">Screenshot attached.</p>
            : <ProofUpload paymentId={sent.id} onDone={load} />}
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link to="/account?tab=orders" className="rounded-full border border-crust-600 px-5 py-2.5 text-xs font-bold text-crust-700 transition hover:bg-cream-100">View My Orders</Link>
          </div>
        </div>
      </section>
    )
  }

  if (phase === 'pay') {
    return (
      <section className="mx-auto max-w-2xl px-4 py-10 sm:px-7 sm:py-14">
        <div className="rounded-2xl border border-cream-200 bg-white p-6 text-center sm:p-8">
          <h1 className="text-xl font-extrabold text-cocoa-900">Pay with QR Ph</h1>
          <p className="mt-2 text-sm text-cocoa-500">
            Scan the code with GCash, Maya or your bank's app, and pay exactly <span className="font-bold text-cocoa-900">{formatPeso(order.payment.balanceDue ?? order.payment.totalAmount)}</span> for order {orderLabel(order)}. We hold your order for 15 minutes.
          </p>
          <QrCode qr={qr} />
          <ReferenceForm order={order} onSent={load} />
          {actionError && <p role="alert" className="mt-2 text-xs font-semibold text-red-700">{actionError}</p>}
          <button type="button" onClick={cancelOrder} disabled={busy} className="mt-4 rounded-full border border-red-300 px-5 py-2.5 text-xs font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-60">{busy ? 'Please wait…' : 'Cancel order'}</button>
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

        <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 [&_dd]:min-w-0 [&_dd]:[overflow-wrap:anywhere] [&_dt]:shrink-0">
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

// The bakery's QR Ph code, set by the admin in Payment & Billing.
function QrCode({ qr }) {
  if (!qr) return <div aria-hidden="true" className="mx-auto mt-5 h-60 w-60 max-w-full animate-pulse rounded-2xl bg-cream-100" />
  if (!qr.configured) {
    return <p role="alert" className="mt-5 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800">The bakery's QR code is not available right now. Please call {bakery.phones[0]}, or cancel this order.</p>
  }
  return (
    <figure className="mt-5">
      <img src={qr.imageUrl} alt="The bakery's QR Ph code" className="mx-auto w-60 max-w-full rounded-2xl border border-cream-200 bg-white p-2" />
      {qr.accountName && <figcaption className="mt-2 text-xs text-cocoa-500">Account name: <span className="font-bold text-cocoa-900">{qr.accountName}</span></figcaption>}
    </figure>
  )
}

// The reference number from the customer's payment app (required) and a
// screenshot of it (optional, QRPH_PLAN.md Q3).
function ReferenceForm({ order, onSent }) {
  const [reference, setReference] = useState('')
  const [file, setFile] = useState(null)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    if (!reference.trim()) {
      setError('Enter the reference number from your payment app.')
      return
    }
    setSending(true)
    try {
      const { paymentId } = await apiPost('/api/qrph', { orderId: order.id, reference })
      // The screenshot is extra: if it fails, the reference still counts.
      if (file) await apiUpload(`/api/qrph/payments/${paymentId}/proof`, file).catch(() => null)
      await onSent()
    } catch (sendError) {
      setError(sendError.errors?.reference ?? sendError.message)
      setSending(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="mx-auto mt-6 max-w-sm space-y-2 text-left">
      <label className="block text-xs font-bold text-cocoa-700" htmlFor="qr-reference">Reference number</label>
      <input
        id="qr-reference"
        value={reference}
        onChange={(event) => setReference(event.target.value)}
        autoComplete="off"
        placeholder="e.g. 1234 567 890123"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? 'qr-reference-error' : 'qr-reference-help'}
        className={`w-full rounded-xl border px-4 py-3 text-sm outline-none focus:ring-2 ${error ? 'border-red-400 focus:ring-red-200' : 'border-cream-300 focus:border-blue-500 focus:ring-blue-100'}`}
      />
      {error
        ? <p id="qr-reference-error" role="alert" className="text-xs font-semibold text-red-700">{error}</p>
        : <p id="qr-reference-help" className="text-xs text-cocoa-500">Shown in your app after paying, as Ref. No.</p>}
      <label className="block pt-2 text-xs font-bold text-cocoa-700" htmlFor="qr-proof">Screenshot of the payment <span className="font-normal text-cocoa-500">(optional)</span></label>
      <input id="qr-proof" type="file" accept="image/jpeg,image/png" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="block w-full text-xs text-cocoa-700 file:mr-3 file:rounded-full file:border-0 file:bg-cream-100 file:px-4 file:py-2 file:text-xs file:font-bold file:text-crust-700" />
      <button type="submit" disabled={sending} className="!mt-4 w-full rounded-2xl bg-crust-600 py-3.5 text-sm font-bold text-white shadow-md transition hover:bg-crust-700 disabled:opacity-60">{sending ? 'Sending…' : 'I have paid — send reference'}</button>
    </form>
  )
}

// Attach a screenshot after the reference was sent.
function ProofUpload({ paymentId, onDone }) {
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const choose = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    setSending(true)
    setError('')
    try {
      await apiUpload(`/api/qrph/payments/${paymentId}/proof`, file)
      await onDone()
    } catch (uploadError) {
      setError(uploadError.message)
    } finally {
      setSending(false)
    }
  }
  return (
    <div className="mt-4 text-xs text-cocoa-500">
      <label className="cursor-pointer font-bold text-crust-700 hover:underline">
        {sending ? 'Attaching…' : 'Attach a screenshot of the payment (optional)'}
        <input type="file" accept="image/jpeg,image/png" onChange={choose} disabled={sending} className="sr-only" />
      </label>
      {error && <p role="alert" className="mt-1 font-semibold text-red-700">{error}</p>}
    </div>
  )
}
