// How an order is paid for, and whether it is (SENIOR_CONSULT_PLAN.md, S3).
// A cash pickup is placed unpaid and shown Ready for pickup, so its status
// alone no longer says whether money came in; these say it next to it.
//
// Works on both shapes: an order detail (payment.isFullyPaid) and a list
// row (isFullyPaid, from lib/billing.js's list columns).
// GCASH is the order's "paid before release" mode; online that is now
// QR Ph (QRPH_PLAN.md, Q14).
const paymentModeName = (mode) => ({ CASH: 'Cash', GCASH: 'GCash' })[mode] ?? null
const isPaid = (order) => Boolean(order.payment?.isFullyPaid ?? order.isFullyPaid)
const owes = (order) => order.status !== 'CANCELLED' && order.status !== 'AWAITING_PAYMENT' && !isPaid(order)

// A small red tag for list rows; nothing when the order is paid.
export function NotPaidTag({ order, className = '' }) {
  if (!owes(order)) return null
  return <span className={`inline-flex rounded-full bg-status-fail-bg px-2 py-0.5 text-[11px] font-semibold text-status-fail-fg ${className}`}>Not paid</span>
}

// "Payment method: Cash · Not paid" for an order's details.
export function PaymentModeLine({ order, className = 'text-xs text-ink-500' }) {
  const mode = paymentModeName(order.paymentMode)
  if (!mode && order.status === 'CANCELLED') return null
  return (
    <p className={className}>
      Payment method: <span className="font-semibold text-ink-900">{mode ?? '—'}</span>
      {order.status !== 'CANCELLED' && (
        isPaid(order)
          ? <span className="ml-2 inline-flex rounded-full bg-status-done-bg px-2 py-0.5 text-[11px] font-semibold text-status-done-fg">Paid</span>
          : <span className="ml-2 inline-flex rounded-full bg-status-fail-bg px-2 py-0.5 text-[11px] font-semibold text-status-fail-fg">Not paid</span>
      )}
    </p>
  )
}
