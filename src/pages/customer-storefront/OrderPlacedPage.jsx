import { Navigate, useParams } from 'react-router-dom'

// Payment first (RULES-PLANS/PAYMENT_FIRST_PLAN.md, the adviser 2026-10-16):
// checkout opens GCash at once and PayMongo brings the customer back to the
// receipt, so there is no separate "Order placed" step any more. The old
// address forwards to the receipt, which shows the paid order or offers to
// pay or cancel an unpaid one.
export function OrderPlacedPage() {
  const { orderId } = useParams()
  return <Navigate to={`/receipt/${orderId}`} replace />
}
