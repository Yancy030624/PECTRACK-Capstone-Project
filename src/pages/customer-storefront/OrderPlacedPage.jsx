import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiGet } from '../../api/client.js'
import { formatPeso } from '../../lib/format.js'

export function OrderPlacedPage() {
  const { orderId } = useParams()
  const [order, setOrder] = useState(null)
  const [message, setMessage] = useState('')

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
        <p className="mt-2 text-sm text-cocoa-500">Order #{order.id} — {order.orderType === 'DELIVERY' ? 'we\'ll deliver this to you' : 'ready for pickup at the bakery'} once it's prepared.</p>

        <div className="mt-6 rounded-xl bg-butter-100 p-5 text-left text-sm">
          <div className="flex items-center justify-between"><span className="text-cocoa-700">Status</span><span className="font-bold text-cocoa-900">{order.status}</span></div>
          <div className="mt-2 flex items-center justify-between"><span className="text-cocoa-700">Order type</span><span className="font-bold text-cocoa-900">{order.orderType}</span></div>
          <div className="mt-2 flex items-center justify-between border-t border-cream-300 pt-2 text-crust-700"><span className="font-bold">Total</span><span className="text-lg font-extrabold">{formatPeso(order.totalAmount)}</span></div>
        </div>

        {/* PHASE10 D3 — a bulk order is reviewed before it can be paid.
            NO_COD_PLAN — a delivery order is baked only once paid, so for
            one, paying is the main next step. */}
        {order.awaitingApproval ? (
          <p className="mt-5 rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-800">This is a large order, so the bakery reviews it before confirming. You can pay once it is approved — check My Orders.{isDelivery && ' Delivery orders are paid in full before we start baking.'}</p>
        ) : isDelivery ? (
          <p className="mt-5 rounded-xl bg-butter-100 p-3 text-xs font-semibold text-cocoa-700">Pay now with GCash so we can start on your order — delivery orders are baked only once paid in full.</p>
        ) : (
          <p className="mt-5 text-xs text-cocoa-500">Pay at pickup, or pay online now from My Payments.</p>
        )}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
          {isDelivery && !order.awaitingApproval ? (
            <>
              <Link to="/account?tab=payments" className="rounded-full bg-crust-600 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-crust-700">Pay now</Link>
              <Link to="/account?tab=orders" className="rounded-full border border-crust-600 px-5 py-2.5 text-xs font-bold text-crust-700 transition hover:bg-cream-100">View My Orders</Link>
            </>
          ) : (
            <>
              <Link to="/account?tab=orders" className="rounded-full bg-crust-600 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-crust-700">View My Orders</Link>
              {!order.awaitingApproval && <Link to="/account?tab=payments" className="rounded-full border border-crust-600 px-5 py-2.5 text-xs font-bold text-crust-700 transition hover:bg-cream-100">Pay now</Link>}
            </>
          )}
        </div>
      </div>
    </section>
  )
}
