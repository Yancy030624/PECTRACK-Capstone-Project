import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiGet } from '../../api/client.js'
import { formatPeso, formatTime } from '../../lib/format.js'
import { orderLabel } from '../../lib/orderNumber.js'

// The customer's own checkout holds that still wait for their GCash payment.
// Placing an order empties the cart, so pressing Back on the payment page
// used to land on an empty cart and the order seemed to be gone. The panel
// asked that the order be kept (final defense, 2026-11-18;
// RULES-PLANS/FINAL_DEFENSE_REVISIONS_PLAN.md C1). The hold is still there
// for 15 minutes, so this card leads back to its payment page.
export function UnpaidOrderNotice({ className = '' }) {
  const [holds, setHolds] = useState([])

  useEffect(() => {
    let cancelled = false
    apiGet('/api/orders', { background: true })
      .then((data) => {
        if (cancelled) return
        const now = Date.now()
        setHolds(data.orders.filter((order) => order.status === 'AWAITING_PAYMENT' && !order.referenceSent && new Date(order.holdExpiresAt).getTime() > now))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  if (holds.length === 0) return null
  return (
    <div className={`space-y-3 ${className}`}>
      {holds.map((order) => (
        <div key={order.id} role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-butter-300 bg-butter-100 p-4">
          <div className="min-w-0 text-sm text-cocoa-900">
            <p className="font-bold">Order {orderLabel(order)} is waiting for your payment.</p>
            <p className="mt-0.5 text-xs text-cocoa-700">{formatPeso(order.totalAmount)} by GCash. We hold it until {formatTime(order.holdExpiresAt)}; after that it is released.</p>
          </div>
          <Link to={`/receipt/${order.id}`} className="inline-flex min-h-11 items-center rounded-full bg-crust-600 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-crust-700">Continue to payment</Link>
        </div>
      ))}
    </div>
  )
}
