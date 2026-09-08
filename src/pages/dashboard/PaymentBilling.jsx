import { useEffect, useState } from 'react'
import { apiGet, apiPost } from '../../api/client.js'
import { Alert } from '../../components/ui/Alert.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Card } from '../../components/ui/Card.jsx'
import { EmptyState } from '../../components/ui/EmptyState.jsx'
import { Field } from '../../components/ui/Field.jsx'
import { Input } from '../../components/ui/Input.jsx'
import { Select } from '../../components/ui/Select.jsx'
import { StatusBadge } from '../../components/ui/StatusBadge.jsx'
import { Table, Tbody, Td, Th, Thead, Tr } from '../../components/ui/Table.jsx'
import { PaymentLog } from './PaymentLog.jsx'

const emptyPaymentForm = { method: 'CASH', amount: '', gatewayReference: '' }

// Stage 4 (RULES-PLANS/UI_AUDIT.md) — the money screen. paymentStatusStyles
// (byte-identical to PaymentLog.jsx's own copy — H7) is gone in favour of
// the shared <StatusBadge>; the role="status" error paragraph at 10px
// (C3) is <Alert variant="error">; the three input shapes (H3) are
// Input/Select/Field; the rounded-full tab pills are Button. Peso columns
// in the orders table now use <Td numeric> — the audit's specific
// complaint that currency didn't line up.
//
// Nothing about payment recording, the cash/GCash split, or refund rules
// changed (RULES-PLANS/PHASE6_PLAN.md) — this is presentation only.
// handlePaymentSubmit still builds its request body the same way it did
// before: gatewayReference is only added when the method is GCASH, never
// spread unconditionally from state (see RULES-PLANS/UI_AUDIT.md's note
// on DB-default fields — sending '' for an omitted optional field fails
// validation even though the field itself is fine to leave out).
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
  const handlePayWithGCash = async () => {
    setGcashSubmitting(true)
    setMessage('')
    try {
      const data = await apiPost('/api/payments/intent', { orderId: selectedOrderId })
      window.location.href = data.checkoutUrl
    } catch (error) {
      setMessage(error.message)
      setGcashSubmitting(false)
    }
  }

  const handlePaymentSubmit = async (event) => {
    event.preventDefault()
    setPaymentSubmitting(true)
    setPaymentErrors({})
    try {
      // Unchanged: gatewayReference only goes in the body for GCASH — a
      // DB-default field left in the body as '' for CASH would fail
      // validation even though omitting it is fine.
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

  const canRecordPayment = isStaff && orderDetail && orderDetail.status !== 'CANCELLED' && !orderDetail.payment.isFullyPaid
  const canPayOnline = canRecordPayment || (orderDetail && orderDetail.status !== 'CANCELLED' && !orderDetail.payment.isFullyPaid && user.role === 'CUSTOMER')

  const tabs = [
    { key: 'billing', label: 'Billing' },
    { key: 'log', label: 'Payment log' },
  ]

  return (
    <section className="min-w-0 flex-1 px-4 pb-10 sm:px-7">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-600">{user.role} PORTAL</p>
      <h1 className="mt-1 text-2xl font-semibold text-ink-900">Payment & Billing</h1>
      <p className="mt-2 text-sm text-ink-500">{isStaff ? 'Record payments and review what each order still owes.' : "Your orders, what you've paid, and what you still owe."}</p>

      {message && (
        <div className="mt-4">
          <Alert variant="error">{message}</Alert>
        </div>
      )}

      <div className="mt-6 flex gap-2">
        {tabs.map((tab) => (
          <Button type="button" key={tab.key} size="sm" variant={activeTab === tab.key ? 'primary' : 'secondary'} onClick={() => setActiveTab(tab.key)}>
            {tab.label}
          </Button>
        ))}
      </div>

      {activeTab === 'log' && <PaymentLog user={user} />}

      {activeTab === 'billing' && (
        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <Card className="p-6">
            <h2 className="text-lg font-semibold text-ink-900">{isStaff ? 'All orders' : 'Your orders'}</h2>
            {loading ? (
              <p className="mt-4 text-sm text-ink-500">Loading…</p>
            ) : orders.length === 0 ? (
              <EmptyState title="No orders yet" />
            ) : (
              <div className="mt-4">
                <Table caption={isStaff ? 'All orders' : 'Your orders'}>
                  <Thead>
                    <Tr className="hover:bg-transparent">
                      <Th>Order</Th>
                      {isStaff && <Th>Customer</Th>}
                      <Th align="right">Total</Th>
                      <Th align="right">Owed</Th>
                      <Th>Status</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {orders.map((order) => (
                      // C2 fix carried over from Stage 3: the row's onClick
                      // stays a mouse convenience, the first cell also
                      // carries a real <button> so the row is reachable and
                      // operable by keyboard.
                      <Tr key={order.id} onClick={() => openOrder(order.id)} className={`cursor-pointer ${selectedOrderId === order.id ? 'bg-brand-50' : ''}`}>
                        <Td>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              openOrder(order.id)
                            }}
                            aria-label={`Open order #${order.id}`}
                            className="font-semibold text-ink-900 hover:underline focus-visible:underline"
                          >
                            #{order.id}
                          </button>
                        </Td>
                        {isStaff && <Td>{order.customerName ?? 'Walk-in'}</Td>}
                        <Td numeric>₱{order.totalAmount}</Td>
                        <Td numeric>
                          {order.status === 'CANCELLED' ? (
                            <span className="text-ink-400">—</span>
                          ) : order.isFullyPaid ? (
                            <StatusBadge status="PAID" label="Paid" />
                          ) : (
                            <span className="font-semibold text-status-fail-fg">₱{order.balanceDue}</span>
                          )}
                        </Td>
                        <Td>
                          <StatusBadge status={order.status} />
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </div>
            )}
          </Card>

          <Card className="p-6">
            <h2 className="text-lg font-semibold text-ink-900">Receipt</h2>
            {!selectedOrderId ? (
              <p className="mt-4 text-sm text-ink-500">Select an order to view its receipt.</p>
            ) : detailLoading ? (
              <p className="mt-4 text-sm text-ink-500">Loading…</p>
            ) : orderDetail ? (
              <div className="mt-4 space-y-4">
                <div className="text-xs text-ink-600">
                  <p>
                    <strong className="text-ink-900">Order #{orderDetail.id}</strong> · {orderDetail.status.replaceAll('_', ' ')}
                  </p>
                  <p className="mt-1">Customer: {orderDetail.customerName ?? 'Walk-in'}</p>
                </div>

                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">Items</p>
                  <ul className="mt-1.5 divide-y divide-line-100 text-sm">
                    {orderDetail.items.map((item) => (
                      <li key={item.productId} className="flex items-center justify-between py-1.5">
                        <span>
                          {item.productName} × {item.quantity}
                        </span>
                        <span className="text-ink-500 tabular-nums">₱{item.unitPrice}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-panel border border-line-200 bg-surface-warm p-4 text-sm text-ink-900">
                  <div className="flex items-center justify-between">
                    <span>Total</span>
                    <span className="font-semibold tabular-nums">₱{orderDetail.payment.totalAmount}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between">
                    <span>Paid</span>
                    <span className="font-semibold tabular-nums">₱{orderDetail.payment.amountPaid}</span>
                  </div>

                  {orderDetail.status === 'CANCELLED' ? (
                    <p className="mt-2 rounded-full bg-status-fail-bg px-2.5 py-1 text-center text-[10px] font-semibold uppercase tracking-wide text-status-fail-fg">
                      {orderDetail.payment.payments.some((payment) => payment.status === 'REFUNDED') ? 'Cancelled — payment refunded' : 'Cancelled — nothing was paid'}
                    </p>
                  ) : (
                    <>
                      <div className="mt-1 flex items-center justify-between border-t border-line-200 pt-1">
                        <span>Balance due</span>
                        <span className="font-semibold tabular-nums">₱{orderDetail.payment.balanceDue}</span>
                      </div>
                      {orderDetail.payment.isFullyPaid && (
                        <p className="mt-2 rounded-full bg-status-done-bg px-2.5 py-1 text-center text-[10px] font-semibold uppercase tracking-wide text-status-done-fg">Fully paid</p>
                      )}
                    </>
                  )}
                </div>

                {orderDetail.payment.payments.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">Payments</p>
                    <ul className="mt-1.5 space-y-1.5 text-sm text-ink-600">
                      {orderDetail.payment.payments.map((payment) => (
                        <li key={payment.id} className="flex items-center justify-between gap-2">
                          <span>
                            {payment.method} · <span className="tabular-nums">₱{payment.amount}</span> {payment.gatewayReference && <span className="text-ink-400">({payment.gatewayReference})</span>}
                          </span>
                          <StatusBadge status={payment.status} />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {canPayOnline && (
                  <div className="border-t border-line-100 pt-3">
                    {/* GCash's own brand blue, not one of the four Button
                        variants — kept as a plain button on our tokens
                        (radius, weight, disabled state, the global focus
                        ring) rather than forcing a fifth colour into the
                        Button primitive for one call site. */}
                    <button
                      type="button"
                      onClick={handlePayWithGCash}
                      disabled={gcashSubmitting}
                      className="w-full rounded-control bg-[#0074E4] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#005bb5] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {gcashSubmitting ? 'Redirecting to GCash…' : 'Pay with GCash'}
                    </button>
                    <p className="mt-1.5 text-xs text-ink-500">You'll be taken to PayMongo's secure checkout page. If you just paid and this still shows a balance, refresh in a moment — confirmation can take a few seconds.</p>
                  </div>
                )}

                {canRecordPayment && (
                  <form className="space-y-3 border-t border-line-100 pt-3" onSubmit={handlePaymentSubmit}>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">Record a payment</p>
                    <Field label="Method" error={paymentErrors.method}>
                      <Select value={paymentForm.method} onChange={(event) => setPaymentForm({ ...paymentForm, method: event.target.value })}>
                        <option value="CASH">Cash</option>
                        <option value="GCASH">GCash</option>
                      </Select>
                    </Field>
                    <Field label="Amount" error={paymentErrors.amount}>
                      <Input value={paymentForm.amount} onChange={(event) => setPaymentForm({ ...paymentForm, amount: event.target.value })} inputMode="decimal" placeholder="Amount" />
                    </Field>
                    {paymentForm.method === 'GCASH' && (
                      <Field label="GCash reference number" error={paymentErrors.gatewayReference}>
                        <Input value={paymentForm.gatewayReference} onChange={(event) => setPaymentForm({ ...paymentForm, gatewayReference: event.target.value })} placeholder="GCash reference number" />
                      </Field>
                    )}
                    <Button type="submit" size="sm" disabled={paymentSubmitting}>
                      {paymentSubmitting ? 'Recording…' : 'Record payment'}
                    </Button>
                  </form>
                )}
              </div>
            ) : null}
          </Card>
        </div>
      )}
    </section>
  )
}
