// Import state management for the flat payment ledger.
import { useEffect, useState } from 'react'
import { apiGet } from '../../api/client.js'

const statusStyles = {
  PAID: 'bg-green-50 text-green-800',
  REFUNDED: 'bg-red-50 text-red-700',
  PENDING: 'bg-amber-50 text-amber-800',
  FAILED: 'bg-slate-100 text-slate-600',
}

// The second half of Payment & Billing's "a receipt view per order and a
// payments list are two components, not one" split (PHASE6_PLAN.md) — kept
// separate from PaymentBilling.jsx the same way InventoryRequests.jsx is
// split out of InventoryManagement.jsx. Where the receipt view in
// PaymentBilling.jsx is scoped to ONE order at a time, this is a flat,
// chronological ledger across every order — GET /api/payments, not
// GET /api/orders/:id.
//
// Read-only for every role: recording money changing hands only happens
// from the receipt view (staff only), never here.
export function PaymentLog({ user }) {
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const loadPayments = async () => {
      try {
        const data = await apiGet('/api/payments')
        setPayments(data.payments)
      } catch (error) {
        setMessage(error.message)
      } finally {
        setLoading(false)
      }
    }
    loadPayments()
  }, [])

  return (
    <div className="mt-6 rounded-2xl border border-green-100 bg-white p-6">
      <h2 className="text-lg font-bold">{user.role === 'CUSTOMER' ? 'Your payments' : 'All payments'}</h2>

      {message && <p role="status" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-[10px] font-semibold text-red-700">{message}</p>}

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Loading…</p>
      ) : payments.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No payments recorded yet.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-175 text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-slate-400">
                <th className="py-2 pr-4 font-bold">Order</th>
                {user.role !== 'CUSTOMER' && <th className="py-2 pr-4 font-bold">Customer</th>}
                <th className="py-2 pr-4 font-bold">Method</th>
                <th className="py-2 pr-4 font-bold">Amount</th>
                <th className="py-2 pr-4 font-bold">Reference</th>
                <th className="py-2 pr-4 font-bold">Status</th>
                <th className="py-2 pr-4 font-bold">Recorded by</th>
                <th className="py-2 pr-4 font-bold">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payments.map((payment) => (
                <tr key={payment.id}>
                  <td className="py-3 pr-4 font-semibold text-slate-800">#{payment.orderId}</td>
                  {user.role !== 'CUSTOMER' && <td className="py-3 pr-4 text-slate-600">{payment.customerName ?? 'Walk-in'}</td>}
                  <td className="py-3 pr-4 text-slate-600">{payment.method}</td>
                  <td className="py-3 pr-4 text-slate-600">₱{payment.amount}</td>
                  <td className="py-3 pr-4 text-slate-500">{payment.gatewayReference ?? '—'}</td>
                  <td className="py-3 pr-4">
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${statusStyles[payment.status] ?? 'bg-slate-100 text-slate-700'}`}>{payment.status}</span>
                    {payment.status === 'REFUNDED' && payment.refundReason && <p className="mt-1 text-[10px] text-slate-400">"{payment.refundReason}"</p>}
                  </td>
                  <td className="py-3 pr-4 text-slate-600">{payment.status === 'REFUNDED' ? payment.refundedByName : payment.recordedByName}</td>
                  <td className="py-3 pr-4 text-slate-500">{new Date(payment.status === 'REFUNDED' ? payment.refundedAt : payment.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
