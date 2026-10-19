import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiGet } from '../../api/client.js'
import { PrintThisButton } from '../../components/PrintReport.jsx'
import { bakery, bakeryAddress } from '../../lib/bakery.js'
import { formatDateTime, formatPeso } from '../../lib/format.js'

// /r/:token — a counter reservation's receipt, opened from the link in its
// email (RULES-PLANS/RESERVE_SMS_PLAN.md). No sign-in: the reservation was
// taken at the counter and the customer may have no account. The token in
// the link is the key (GET /api/receipts/:token). It is the proof of order
// to show at pickup, with the order number large and the pickup time
// first; the SMS with the order number is the same proof without internet.
const humanize = (status) => status.replaceAll('_', ' ').toLowerCase().replace(/^./, (letter) => letter.toUpperCase())
const methodName = (method) => ({ GCASH: 'GCash', CASH: 'Cash' })[method] ?? method

export function ReservationReceiptPage() {
  const { token } = useParams()
  const [receipt, setReceipt] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    apiGet(`/api/receipts/${encodeURIComponent(token)}`)
      .then((data) => setReceipt(data.receipt))
      .catch((failure) => setError(failure.message))
  }, [token])

  if (error) {
    return (
      <section className="mx-auto max-w-2xl px-4 py-14 text-center sm:px-7">
        <div className="rounded-2xl border border-cream-200 bg-white p-8">
          <h1 className="text-xl font-extrabold text-cocoa-900">Receipt not found</h1>
          <p className="mt-3 text-sm text-cocoa-500">{error} Check the link in your email, or call the bakery at {bakery.phones[0]}.</p>
          <Link to="/menu" className="mt-6 inline-block rounded-full bg-crust-600 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-crust-700">See the menu</Link>
        </div>
      </section>
    )
  }

  if (!receipt) return <section className="mx-auto max-w-2xl px-4 py-14 text-center text-sm text-cocoa-500 sm:px-7">Loading your receipt…</section>

  const done = receipt.status === 'COMPLETED'
  return (
    <section className="mx-auto max-w-2xl px-4 py-10 sm:px-7 sm:py-14">
      <div className="mb-4 rounded-xl bg-butter-100 px-4 py-4 text-center print:hidden">
        <p className="text-xs font-bold uppercase tracking-wide text-cocoa-500">{done ? 'Picked up' : 'Show this at the counter'}</p>
        <p className="mt-1 text-3xl font-extrabold text-cocoa-900">Order #{receipt.orderNumber}</p>
        {receipt.pickupTime && <p className="mt-1 text-sm font-bold text-cocoa-900">{done ? 'Was for' : 'Pick up'} {formatDateTime(receipt.pickupTime)}</p>}
      </div>

      <article className="print-only-target rounded-2xl border border-cream-200 bg-white p-6 text-sm text-cocoa-700 sm:p-8">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-cream-200 pb-4">
          <div>
            <p className="font-display text-2xl font-bold text-cocoa-900">{bakery.name}</p>
            <p className="text-xs text-cocoa-500">{bakeryAddress} · {bakery.phones.join(' / ')}</p>
            <p className="text-xs text-cocoa-500">Open {bakery.hours.days.toLowerCase()}, {bakery.hours.time}</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-bold uppercase tracking-wide text-cocoa-500">Reservation receipt</p>
            <p className="text-lg font-extrabold text-cocoa-900">Order #{receipt.orderNumber}</p>
          </div>
        </header>

        <dl className="mt-4 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
          {receipt.firstName && <div className="flex justify-between gap-2 sm:block"><dt className="text-cocoa-500">For</dt><dd className="font-semibold text-cocoa-900">{receipt.firstName}</dd></div>}
          <div className="flex justify-between gap-2 sm:block"><dt className="text-cocoa-500">Ordered</dt><dd className="font-semibold text-cocoa-900">{formatDateTime(receipt.orderedAt)}</dd></div>
          {receipt.pickupTime && <div className="flex justify-between gap-2 sm:block"><dt className="text-cocoa-500">Pick up</dt><dd className="font-semibold text-cocoa-900">{formatDateTime(receipt.pickupTime)}</dd></div>}
          <div className="flex justify-between gap-2 sm:block"><dt className="text-cocoa-500">Status</dt><dd className="font-semibold text-cocoa-900">{humanize(receipt.status)}</dd></div>
        </dl>

        <table className="mt-5 w-full text-left text-xs">
          <caption className="sr-only">Items</caption>
          <thead>
            <tr className="border-b border-cream-200 text-cocoa-500">
              <th scope="col" className="py-2 font-semibold">Item</th>
              <th scope="col" className="py-2 text-right font-semibold">Qty</th>
              <th scope="col" className="py-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {receipt.items.map((item, index) => (
              <tr key={index} className="border-b border-cream-100">
                <td className="py-2 text-cocoa-900">{item.name}{item.variant ? ` (${item.variant})` : ''}</td>
                <td className="py-2 text-right tabular-nums">{item.quantity}</td>
                <td className="py-2 text-right font-semibold tabular-nums text-cocoa-900">{formatPeso(Number(item.unitPrice) * item.quantity)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={2} className="pt-3 text-right text-sm text-cocoa-900">Total</th>
              <td className="pt-3 text-right text-base font-extrabold tabular-nums text-cocoa-900">{formatPeso(receipt.totalAmount)}</td>
            </tr>
            <tr>
              <th scope="row" colSpan={2} className="pt-1 text-right text-xs font-semibold text-cocoa-500">Paid{receipt.paymentMethod ? ` (${methodName(receipt.paymentMethod)})` : ''}</th>
              <td className="pt-1 text-right text-xs font-semibold tabular-nums text-cocoa-900">{formatPeso(receipt.amountPaid)}</td>
            </tr>
          </tfoot>
        </table>
        <p className="mt-5 text-xs text-cocoa-500">Paid in full at the counter. Show this page, the email, or the order number we texted you when you pick it up.</p>
      </article>

      <div className="mt-4 flex justify-center print:hidden">
        <PrintThisButton label="Print or save as PDF" />
      </div>
    </section>
  )
}
