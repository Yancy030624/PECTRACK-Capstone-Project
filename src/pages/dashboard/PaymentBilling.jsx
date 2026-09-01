// Import state management for the order list, selected receipt, and the
// record-payment form.
import { useEffect, useState } from 'react'
import { apiGet, apiPost } from '../../api/client.js'
import { PaymentLog } from './PaymentLog.jsx'

const emptyPaymentForm = { method: 'CASH', amount: '', gatewayReference: '' }
const paymentStatusStyles = {
  PAID: 'bg-green-50 text-green-800',
  REFUNDED: 'bg-red-50 text-red-700',
  PENDING: 'bg-amber-50 text-amber-800',
  FAILED: 'bg-slate-100 text-slate-600',
}

// Payment & Billing (Phase 6, Step 5 — see PHASE6_PLAN.md). 'Billing' vs
// 'Payment log' is the same simple-tab shape InventoryManagement.jsx uses
// for 'Stock levels' vs 'Change requests': one screen, two views of
// related data, split into separate files (this one plus PaymentLog.jsx)
// purely to keep either from growing unmanageable — not because they are
// separate modules a user navigates to independently.
//
// The Billing tab reuses the SAME order list every role already sees in
// Order Management (GET /api/orders is already scoped: a customer gets
// only their own), then opens a receipt for whichever order is selected
// (GET /api/orders/:id, which now carries a `payment` object). Recording a
// payment is admin/cashier only — a customer's view is read-only, exactly
// like their relationship to order status itself.
export function PaymentBilling({ user }) {
  const isStaff = user.role === 'ADMIN' || user.role === 'CASHIER'

  const [activeTab, setActiveTab] = useState('billing')

  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  const [selectedOrderId, setSelectedOrderId] = useState(null)
  const [orderDetail, setOrderDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const [paymentForm, setPaymentForm] = useState(emptyPaymentForm)
  const [paymentErrors, setPaymentErrors] = useState({})
  const [paymentSubmitting, setPaymentSubmitting] = useState(false)

  const loadOrders = async () => {
    try {
      const data = await apiGet('/api/orders')
      setOrders(data.orders)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadOrders()
  }, [])

  const openOrder = async (orderId) => {
    setSelectedOrderId(orderId)
    setDetailLoading(true)
    setOrderDetail(null)
    setPaymentForm(emptyPaymentForm)
    setPaymentErrors({})
    try {
      const data = await apiGet(`/api/orders/${orderId}`)
      setOrderDetail(data.order)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setDetailLoading(false)
    }
  }

  const [gcashSubmitting, setGcashSubmitting] = useState(false)

  // Phase 6.5 (see PHASE6.5_PLAN.md) — the live-gateway counterpart to the
  // manual "Record a payment" form below. Redirects the WHOLE page rather
  // than opening PayMongo's checkout in a fresh tab or an iframe: the
  // checkout_url is a page PayMongo itself serves and fully controls (this
  // app never sees the customer's GCash credentials), so there is nothing
  // for an iframe to add except a confusing nested-page experience, and a
  // new tab risks the customer never returning to this one at all.
  const handlePayWithGCash = async () => {
    setGcashSubmitting(true)
    setMessage('')
    try {
      const data = await apiPost('/api/payments/intent', { orderId: selectedOrderId })
      window.location.href = data.checkoutUrl
    } catch (error) {
      // 503 ("not configured yet") reads fine as-is — the backend's own
      // message already says what to do instead (pay by cash or a GCash
      // reference at the counter). No special-casing needed here.
      setMessage(error.message)
      setGcashSubmitting(false)
    }
    // No `finally` resetting gcashSubmitting to false on the success path
    // — the page is about to navigate away entirely, so there is no button
    // left to re-enable.
  }

  const handlePaymentSubmit = async (event) => {
    event.preventDefault()
    setPaymentSubmitting(true)
    setPaymentErrors({})
    try {
      const body = { orderId: selectedOrderId, method: paymentForm.method, amount: Number(paymentForm.amount) }
      if (paymentForm.method === 'GCASH') body.gatewayReference = paymentForm.gatewayReference
      await apiPost('/api/payments', body)
      setPaymentForm(emptyPaymentForm)
      await openOrder(selectedOrderId)
    } catch (error) {
      setPaymentErrors(error.errors ?? {})
      setMessage(error.message)
    } finally {
      setPaymentSubmitting(false)
    }
  }

  // Staff may keep recording payments right up until the balance is
  // fully cleared, and never against a cancelled order — matching
  // routes/payments.js's own CANCELLED guard exactly, so the form simply
  // never appears for a state the backend would refuse anyway.
  const canRecordPayment = isStaff && orderDetail && orderDetail.status !== 'CANCELLED' && !orderDetail.payment.isFullyPaid
  // A customer may pay their OWN order online, same condition as staff
  // recording one manually — this app has no separate "is this a walk-in
  // order with no online account" concept the backend enforces here (a
  // customer viewing this screen at all already implies they're signed
  // in), so the shared canRecordPayment condition covers both roles.
  const canPayOnline = canRecordPayment || (orderDetail && orderDetail.status !== 'CANCELLED' && !orderDetail.payment.isFullyPaid && user.role === 'CUSTOMER')

  return (
    <section className="min-w-0 flex-1 px-4 pb-10 pt-24 sm:px-7 md:pt-9">
      <p className="text-sm font-semibold text-green-700">{user.role} PORTAL</p>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">Payment & Billing</h1>
      <p className="mt-2 text-sm text-slate-500">{isStaff ? 'Record payments and review what each order still owes.' : 'Your orders, what you\'ve paid, and what you still owe.'}</p>

      {message && <p role="status" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-[10px] font-semibold text-red-700">{message}</p>}

      <div className="mt-6 flex gap-2">
        <button type="button" onClick={() => setActiveTab('billing')} className={`rounded-full px-4 py-2 text-xs font-bold transition ${activeTab === 'billing' ? 'bg-green-700 text-white' : 'bg-green-50 text-green-800 hover:bg-green-100'}`}>Billing</button>
        <button type="button" onClick={() => setActiveTab('log')} className={`rounded-full px-4 py-2 text-xs font-bold transition ${activeTab === 'log' ? 'bg-green-700 text-white' : 'bg-green-50 text-green-800 hover:bg-green-100'}`}>Payment log</button>
      </div>

      {activeTab === 'log' && <PaymentLog user={user} />}

      {activeTab === 'billing' && <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        {/* Order list */}
        <div className="rounded-2xl border border-green-100 bg-white p-6">
          <h2 className="text-lg font-bold">{isStaff ? 'All orders' : 'Your orders'}</h2>
          {loading ? (
            <p className="mt-4 text-sm text-slate-500">Loading…</p>
          ) : orders.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">No orders yet.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-125 text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400">
                    <th className="py-2 pr-4 font-bold">Order</th>
                    {isStaff && <th className="py-2 pr-4 font-bold">Customer</th>}
                    <th className="py-2 pr-4 font-bold">Total</th>
                    <th className="py-2 pr-4 font-bold">Owed</th>
                    <th className="py-2 pr-4 font-bold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orders.map((order) => (
                    <tr key={order.id} onClick={() => openOrder(order.id)} className={`cursor-pointer transition hover:bg-green-50 ${selectedOrderId === order.id ? 'bg-green-50' : ''}`}>
                      <td className="py-3 pr-4 font-semibold text-slate-800">#{order.id}</td>
                      {isStaff && <td className="py-3 pr-4 text-slate-600">{order.customerName ?? 'Walk-in'}</td>}
                      <td className="py-3 pr-4 text-slate-600">₱{order.totalAmount}</td>
                      {/* The column this screen exists for: which orders
                          still owe money, without opening each one. A
                          cancelled order shows a dash rather than a figure,
                          for the same reason the receipt does — nothing can
                          be paid against it, so a balance there would read
                          as a debt that cannot be settled. */}
                      <td className="py-3 pr-4">
                        {order.status === 'CANCELLED'
                          ? <span className="text-slate-400">—</span>
                          : order.isFullyPaid
                            ? <span className="rounded-full bg-green-50 px-2.5 py-1 text-[10px] font-bold text-green-800">Paid</span>
                            : <span className="font-semibold text-red-700">₱{order.balanceDue}</span>}
                      </td>
                      <td className="py-3 pr-4 text-slate-600">{order.status.replaceAll('_', ' ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Selected order's receipt */}
        <div className="rounded-2xl border border-green-100 bg-white p-6">
          <h2 className="text-lg font-bold">Receipt</h2>
          {!selectedOrderId ? (
            <p className="mt-4 text-sm text-slate-500">Select an order to view its receipt.</p>
          ) : detailLoading ? (
            <p className="mt-4 text-sm text-slate-500">Loading…</p>
          ) : orderDetail ? (
            <div className="mt-4 space-y-4">
              <div className="text-xs text-slate-600">
                <p><strong className="text-slate-800">Order #{orderDetail.id}</strong> · {orderDetail.status.replaceAll('_', ' ')}</p>
                <p className="mt-1">Customer: {orderDetail.customerName ?? 'Walk-in'}</p>
              </div>

              <div>
                <p className="text-[11px] font-extrabold text-slate-500">Items</p>
                <ul className="mt-1.5 divide-y divide-slate-100 text-xs">
                  {orderDetail.items.map((item) => (
                    <li key={item.productId} className="flex items-center justify-between py-1.5">
                      <span>{item.productName} × {item.quantity}</span>
                      <span className="text-slate-500">₱{item.unitPrice}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-xl bg-[#fbfbdc] p-4 text-xs text-green-950">
                <div className="flex items-center justify-between"><span>Total</span><span className="font-bold">₱{orderDetail.payment.totalAmount}</span></div>
                <div className="mt-1 flex items-center justify-between"><span>Paid</span><span className="font-bold">₱{orderDetail.payment.amountPaid}</span></div>
                {/* A cancelled order deliberately does NOT show a balance.
                    The backend figure is factually right — a refund moves
                    its payments to REFUNDED, so nothing counts as paid and
                    the full total reads as outstanding — but presenting
                    that as "Balance due" on a cancelled order tells the
                    customer they still owe money for something nobody can
                    pay for (routes/payments.js refuses payment on a
                    cancelled order outright). The number is correct; the
                    label was the lie. */}
                {orderDetail.status === 'CANCELLED' ? (
                  <p className="mt-2 rounded-full bg-red-50 px-2.5 py-1 text-center text-[10px] font-bold text-red-700">{orderDetail.payment.payments.some((payment) => payment.status === 'REFUNDED') ? 'Cancelled — payment refunded' : 'Cancelled — nothing was paid'}</p>
                ) : (
                  <>
                    <div className="mt-1 flex items-center justify-between border-t border-green-200 pt-1"><span>Balance due</span><span className="font-bold">₱{orderDetail.payment.balanceDue}</span></div>
                    {orderDetail.payment.isFullyPaid && <p className="mt-2 rounded-full bg-green-100 px-2.5 py-1 text-center text-[10px] font-bold text-green-800">Fully paid</p>}
                  </>
                )}
              </div>

              {orderDetail.payment.payments.length > 0 && (
                <div>
                  <p className="text-[11px] font-extrabold text-slate-500">Payments</p>
                  <ul className="mt-1.5 space-y-1.5 text-xs text-slate-600">
                    {orderDetail.payment.payments.map((payment) => (
                      <li key={payment.id} className="flex items-center justify-between">
                        <span>{payment.method} · ₱{payment.amount} {payment.gatewayReference && <span className="text-slate-400">({payment.gatewayReference})</span>}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${paymentStatusStyles[payment.status] ?? 'bg-slate-100 text-slate-700'}`}>{payment.status}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {canPayOnline && (
                <div className="border-t border-slate-100 pt-3">
                  <button type="button" onClick={handlePayWithGCash} disabled={gcashSubmitting} className="w-full rounded-xl bg-[#0074E4] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#005bb5] disabled:cursor-not-allowed disabled:opacity-60">{gcashSubmitting ? 'Redirecting to GCash…' : 'Pay with GCash'}</button>
                  <p className="mt-1.5 text-[10px] text-slate-400">You'll be taken to PayMongo's secure checkout page. If you just paid and this still shows a balance, refresh in a moment — confirmation can take a few seconds.</p>
                </div>
              )}

              {canRecordPayment && (
                <form className="space-y-2 border-t border-slate-100 pt-3" onSubmit={handlePaymentSubmit}>
                  <p className="text-[11px] font-extrabold">Record a payment</p>
                  <select value={paymentForm.method} onChange={(event) => setPaymentForm({ ...paymentForm, method: event.target.value })} className="w-full rounded-xl border border-stone-200 px-3 py-2 text-xs outline-none focus:border-green-700">
                    <option value="CASH">Cash</option>
                    <option value="GCASH">GCash</option>
                  </select>
                  {paymentErrors.method && <p className="text-[10px] font-medium text-red-700">{paymentErrors.method}</p>}
                  <input value={paymentForm.amount} onChange={(event) => setPaymentForm({ ...paymentForm, amount: event.target.value })} inputMode="decimal" placeholder="Amount" className="w-full rounded-xl border border-stone-200 px-3 py-2 text-xs outline-none focus:border-green-700" />
                  {paymentErrors.amount && <p className="text-[10px] font-medium text-red-700">{paymentErrors.amount}</p>}
                  {paymentForm.method === 'GCASH' && (
                    <>
                      <input value={paymentForm.gatewayReference} onChange={(event) => setPaymentForm({ ...paymentForm, gatewayReference: event.target.value })} placeholder="GCash reference number" className="w-full rounded-xl border border-stone-200 px-3 py-2 text-xs outline-none focus:border-green-700" />
                      {paymentErrors.gatewayReference && <p className="text-[10px] font-medium text-red-700">{paymentErrors.gatewayReference}</p>}
                    </>
                  )}
                  <button type="submit" disabled={paymentSubmitting} className="rounded-xl bg-green-700 px-4 py-2 text-xs font-bold text-white transition hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-60">{paymentSubmitting ? 'Recording…' : 'Record payment'}</button>
                </form>
              )}
            </div>
          ) : null}
        </div>
      </div>}
    </section>
  )
}
