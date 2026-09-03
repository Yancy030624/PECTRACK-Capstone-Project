import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiGet } from '../../api/client.js'

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
        <Link to="/menu" className="mt-6 inline-block rounded-full bg-green-700 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-green-800">Back to the menu</Link>
      </section>
    )
  }

  if (!order) {
    return (
      <section className="mx-auto max-w-2xl px-4 py-14 sm:px-7">
        <div className="h-64 animate-pulse rounded-2xl bg-white/70" />
      </section>
    )
  }

  return (
    <section className="mx-auto max-w-2xl px-4 py-14 sm:px-7">
      <div className="rounded-2xl border border-green-100 bg-white p-8 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-green-100 text-2xl text-green-800">✓</span>
        <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-stone-900">Order placed!</h1>
        <p className="mt-2 text-sm text-stone-500">Order #{order.id} — {order.orderType === 'DELIVERY' ? 'we\'ll deliver this to you' : 'ready for pickup at the bakery'} once it's prepared.</p>

        <div className="mt-6 rounded-xl bg-[#fbfbdc] p-5 text-left text-sm">
          <div className="flex items-center justify-between"><span className="text-stone-600">Status</span><span className="font-bold text-stone-900">{order.status}</span></div>
          <div className="mt-2 flex items-center justify-between"><span className="text-stone-600">Order type</span><span className="font-bold text-stone-900">{order.orderType}</span></div>
          <div className="mt-2 flex items-center justify-between border-t border-green-200 pt-2 text-green-800"><span className="font-bold">Total</span><span className="text-lg font-extrabold">₱{order.totalAmount}</span></div>
        </div>

        <p className="mt-5 text-xs text-stone-500">Pay at pickup or on delivery, or pay online now from Payment &amp; Billing.</p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link to="/dashboard" className="rounded-full bg-green-700 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-green-800">View My Orders</Link>
          <Link to="/dashboard" className="rounded-full border border-green-700 px-5 py-2.5 text-xs font-bold text-green-800 transition hover:bg-green-50">Pay now</Link>
        </div>
      </div>
    </section>
  )
}
