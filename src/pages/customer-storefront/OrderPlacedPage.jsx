import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiGet, apiPost } from '../../api/client.js'
import { formatPeso } from '../../lib/format.js'
import { orderLabel } from '../../lib/orderNumber.js'

export function OrderPlacedPage() {
  const { orderId } = useParams()
  const [order, setOrder] = useState(null)
  const [message, setMessage] = useState('')
  const [paying, setPaying] = useState(false)
  const [payError, setPayError] = useState('')

  // Pay now goes straight to GCash, and PayMongo brings the customer back
  // to the receipt (ReceiptPage.jsx) — no list to pick the order from
  // first (the adviser, 2026-10-16). A second click while one is opening
  // is ignored, and the server allows one open attempt per order.
  const payNow = async () => {
    if (paying) return
    setPaying(true)
    setPayError('')
    try {
      const data = await apiPost('/api/payments/intent', { orderId: Number(orderId) })
      window.location.href = data.checkoutUrl
    } catch (error) {
      setPayError(error.message)
      setPaying(false)
    }
  }

  useEffect(() => {
    apiGet(`/api/orders/${orderId}`)
      .then((data) => setOrder(data.order))
      .catch((error) => setMessage(error.message))
  }, [orderId])

  if (message) {
    return (
      <section className="mx-auto max-w-2xl px-4 py-14 text-center sm:px-7">
        <p className="text-sm font-semibold text-red-700">{message}</p>
        <Link to="/menu" className="mt-6 inline-block rounded-full bg-crust-600 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-crust-700">Back to the menu</Link>
      </section>
    )
  }

  if (!order) {
    return (
      <section className="mx-auto max-w-2xl px-4 py-14 sm:px-7">
        <div className="h-64 animate-pulse rounded-2xl bg-cream-200" />
      </section>
    )
  }

  const isDelivery = order.orderType === 'DELIVERY'

  return (
    <section className="mx-auto max-w-2xl px-4 py-14 sm:px-7">
      <div className="rounded-2xl border border-cream-200 bg-white p-8 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-butter-100 text-2xl text-crust-700">✓</span>
        <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-cocoa-900">Order placed!</h1>
        <p className="mt-2 text-sm text-cocoa-500">Order {orderLabel(order)} — {order.orderType === 'DELIVERY' ? 'we\'ll deliver this to you' : 'ready for pickup at the bakery'} once it's prepared.</p>

        <div className="mt-6 rounded-xl bg-butter-100 p-5 text-left text-sm">
          <div className="flex items-center justify-between"><span className="text-cocoa-700">Status</span><span className="font-bold text-cocoa-900">{order.status.replaceAll('_', ' ').toLowerCase().replace(/^./, (letter) => letter.toUpperCase())}</span></div>
          <div className="mt-2 flex items-center justify-between"><span className="text-cocoa-700">Order type</span><span className="font-bold text-cocoa-900">{order.orderType}</span></div>
          <div className="mt-2 flex items-center justify-between border-t border-cream-300 pt-2 text-crust-700"><span className="font-bold">Total</span><span className="text-lg font-extrabold">{formatPeso(order.totalAmount)}</span></div>
        </div>

        {/* NO_COD_PLAN — a delivery order is baked only once paid, so for
            one, paying is the main next step. */}
        {isDelivery ? (
          <p className="mt-5 rounded-xl bg-butter-100 p-3 text-xs font-semibold text-cocoa-700">Pay now with GCash so we can start on your order — delivery orders are baked only once paid in full.</p>
        ) : (
          <p className="mt-5 text-xs text-cocoa-500">We have started on your order. Pay at pickup, or pay online now with GCash.</p>
        )}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
          {isDelivery ? (
            <>
              <button type="button" onClick={payNow} disabled={paying} className="rounded-full bg-crust-600 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-crust-700 disabled:opacity-60">{paying ? 'Opening GCash…' : 'Pay now with GCash'}</button>
              <Link to="/account?tab=orders" className="rounded-full border border-crust-600 px-5 py-2.5 text-xs font-bold text-crust-700 transition hover:bg-cream-100">View My Orders</Link>
            </>
          ) : (
            <>
              <Link to="/account?tab=orders" className="rounded-full bg-crust-600 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-crust-700">View My Orders</Link>
              <button type="button" onClick={payNow} disabled={paying} className="rounded-full border border-crust-600 px-5 py-2.5 text-xs font-bold text-crust-700 transition hover:bg-cream-100 disabled:opacity-60">{paying ? 'Opening GCash…' : 'Pay now with GCash'}</button>
            </>
          )}
        </div>
        {payError && (
          <p role="alert" className="mt-4 text-xs font-semibold text-red-700">
            {payError} <Link to={`/account?tab=payments&order=${order.id}`} className="underline">Open it in My Payments</Link>
          </p>
        )}
      </div>
    </section>
  )
}
