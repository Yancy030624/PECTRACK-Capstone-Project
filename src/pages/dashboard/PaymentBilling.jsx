// The money screen — Payment & Billing for staff, My Payments for a
// customer (Dashboard.jsx maps both names here; the component dispatches
// on role). Same responsive shape as OrderManagement.jsx: list beside the
// receipt on `lg`, the receipt as an overlay below that, and a card list in
// place of the table below `md` so "Owed" and Status are never scrolled
// out of view.
//
// Nothing about payment recording, the cash/GCash split, or refund rules
// changed (RULES-PLANS/PHASE6_PLAN.md). handlePaymentSubmit still builds
// its request body the same way: gatewayReference is only added when the
// method is GCASH, never spread unconditionally from state (sending '' for
// an omitted optional field fails validation even though the field itself
// is fine to leave out).
import { useEffect, useMemo, useState } from 'react'
import { apiGet, apiPatch, apiPost } from '../../api/client.js'
import { Modal } from '../../components/Modal.jsx'
import { Alert } from '../../components/ui/Alert.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Card } from '../../components/ui/Card.jsx'
import { EmptyState } from '../../components/ui/EmptyState.jsx'
import { Field } from '../../components/ui/Field.jsx'
import { Input } from '../../components/ui/Input.jsx'
import { Select } from '../../components/ui/Select.jsx'
import { StatusBadge } from '../../components/ui/StatusBadge.jsx'
import { Table, Tbody, Td, Th, Thead, Tr } from '../../components/ui/Table.jsx'
import { formatDate, formatDateTime, formatPeso } from '../../lib/format.js'
import { useIsLargeScreen } from '../../lib/useMediaQuery.js'
import { PaymentLog } from './PaymentLog.jsx'

const emptyPaymentForm = { method: 'CASH', amount: '', gatewayReference: '' }

function DetailPanel({ open, onClose, labelledBy, children }) {
  const isLarge = useIsLargeScreen()
  if (isLarge) return children
  return (
    <Modal open={open} onClose={onClose} labelledBy={labelledBy}>
      <div className="w-[min(100vw-2rem,40rem)]">{children}</div>
    </Modal>
  )
}

// One cell's worth of "what this order still owes": a PAID badge, a red
// figure, or a dash for a cancelled order. Shared by the table and the
// card list so the two can never phrase it differently.
function OwedCell({ order }) {
  if (order.status === 'CANCELLED') return <span className="text-ink-500">—</span>
  if (order.isFullyPaid) return <StatusBadge status="PAID" label="Paid" />
  return <span className="font-semibold text-status-fail-fg tabular-nums">{formatPeso(order.balanceDue)}</span>
}

export function PaymentBilling({ user }) {
  const isStaff = user.role === 'ADMIN' || user.role === 'CASHIER'

  const [activeTab, setActiveTab] = useState('billing')

  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')
  const [owedOnly, setOwedOnly] = useState(true)

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

  // "Still owes" is the question this screen exists to answer, so it is
  // the default view; everything else is one toggle away.
  const visibleOrders = useMemo(
    () => (owedOnly ? orders.filter((order) => order.status !== 'CANCELLED' && !order.isFullyPaid) : orders),
    [orders, owedOnly],
  )

  const openOrder = async (orderId) => {
    setSelectedOrderId(orderId)
    setDetailLoading(true)
    setOrderDetail(null)
    setPaymentForm(emptyPaymentForm)
    setPaymentErrors({})
    setNotice('')
    try {
      const data = await apiGet(`/api/orders/${orderId}`)
      setOrderDetail(data.order)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setDetailLoading(false)
    }
  }
  const closeDetail = () => {
    setSelectedOrderId(null)
    setOrderDetail(null)
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

  // An abandoned GCash attempt blocks every new one for the order until
  // it is closed (PATCH /api/payments/:id). Staff may close any; the
  // customer their own.
  const handleCancelAttempt = async (paymentId) => {
    if (!window.confirm('Cancel this online payment attempt? If it was actually paid, the payment is still recorded when PayMongo confirms it.')) return
    setMessage('')
    try {
      await apiPatch(`/api/payments/${paymentId}`, { status: 'CANCELLED' })
      await openOrder(selectedOrderId)
      setNotice('Payment attempt cancelled.')
    } catch (error) {
      setMessage(error.message)
    }
  }

  // ADMIN only — resends a refund the ledger already records to PayMongo,
  // for a row whose gateway refund failed or ran before credentials
  // existed (POST /api/payments/:id/refund).
  const handleRetryRefund = async (paymentId) => {
    setMessage('')
    try {
      const data = await apiPost(`/api/payments/${paymentId}/refund`)
      await openOrder(selectedOrderId)
      setNotice(data.message ?? 'Refund sent to PayMongo.')
    } catch (error) {
      setMessage(error.message)
    }
  }

  const handlePaymentSubmit = async (event) => {
    event.preventDefault()
    setPaymentSubmitting(true)
    setPaymentErrors({})
    setMessage('')
    try {
      const body = { orderId: selectedOrderId, method: paymentForm.method, amount: Number(paymentForm.amount) }
      if (paymentForm.method === 'GCASH') body.gatewayReference = paymentForm.gatewayReference
      const data = await apiPost('/api/payments', body)
      setPaymentForm(emptyPaymentForm)
      await openOrder(selectedOrderId)
      await loadOrders()
      setNotice(data.isFullyPaid ? `Payment recorded — order #${selectedOrderId} is now fully paid.` : `Payment recorded — ${formatPeso(data.balanceDue)} still owed.`)
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

  const receiptCard = (
    <Card className="min-w-0 p-6">
      <div className="flex items-start justify-between gap-3">
        <h2 id="receipt-heading" className="text-lg font-semibold text-ink-900">Receipt</h2>
        <Button type="button" size="sm" variant="ghost" className="lg:hidden" onClick={closeDetail}>Close</Button>
      </div>
      {!selectedOrderId ? (
        <p className="mt-4 text-sm text-ink-500">Select an order to view its receipt.</p>
      ) : detailLoading ? (
        <p className="mt-4 text-sm text-ink-500">Loading…</p>
      ) : orderDetail ? (
        <div className="mt-4 space-y-4">
          {notice && <Alert variant="success">{notice}</Alert>}
          <div className="text-xs text-ink-500">
            <p>
              <strong className="text-ink-900">Order #{orderDetail.id}</strong> · {orderDetail.orderType} · <StatusBadge status={orderDetail.status} />
            </p>
            <p className="mt-1">Customer: {orderDetail.customerName ?? 'Walk-in'} · placed {formatDate(orderDetail.orderDate)}</p>
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">Items</p>
            <ul className="mt-1.5 divide-y divide-line-100 text-sm">
              {orderDetail.items.map((item) => (
                <li key={item.productId} className="flex items-center justify-between gap-3 py-1.5">
                  <span>
                    {item.productName} × {item.quantity}
                    <span className="block text-xs text-ink-500">{formatPeso(item.unitPrice)} each</span>
                  </span>
                  <span className="font-medium text-ink-900 tabular-nums">{formatPeso(Number(item.unitPrice) * item.quantity)}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-panel border border-line-200 bg-surface-warm p-4 text-sm text-ink-900">
            <div className="flex items-center justify-between">
              <span>Total</span>
              <span className="font-semibold tabular-nums">{formatPeso(orderDetail.payment.totalAmount)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span>Paid</span>
              <span className="font-semibold tabular-nums">{formatPeso(orderDetail.payment.amountPaid)}</span>
            </div>

            {orderDetail.status === 'CANCELLED' ? (
              <p className="mt-2 rounded-full bg-status-fail-bg px-2.5 py-1 text-center text-[10px] font-semibold uppercase tracking-wide text-status-fail-fg">
                {orderDetail.payment.payments.some((payment) => payment.status === 'REFUNDED') ? 'Cancelled — payment refunded' : 'Cancelled — nothing was paid'}
              </p>
            ) : (
              <>
                <div className="mt-1 flex items-center justify-between border-t border-line-200 pt-1">
                  <span>Balance due</span>
                  <span className="font-semibold tabular-nums">{formatPeso(orderDetail.payment.balanceDue)}</span>
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
              <ul className="mt-1.5 space-y-2 text-sm text-ink-500">
                {orderDetail.payment.payments.map((payment) => (
                  <li key={payment.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      {payment.method} · <span className="tabular-nums">{formatPeso(payment.amount)}</span> {payment.gatewayReference && <span className="text-ink-500">({payment.gatewayReference})</span>}
                      <span className="block text-xs text-ink-500">{formatDateTime(payment.paymentDate ?? payment.createdAt)}{payment.recordedByName ? ` · ${payment.recordedByName}` : ''}</span>
                      {payment.status === 'REFUNDED' && payment.gatewayPaymentId && (
                        <span className={`block text-xs ${payment.refundReference ? 'text-ink-500' : 'font-semibold text-status-fail-fg'}`}>
                          {payment.refundReference ? `Refunded through PayMongo (${payment.refundReference})` : 'Gateway refund not yet sent'}
                        </span>
                      )}
                    </span>
                    <span className="flex items-center gap-2">
                      <StatusBadge status={payment.status} />
                      {payment.status === 'PENDING' && orderDetail.status !== 'CANCELLED' && (
                        <Button type="button" size="sm" variant="secondary" onClick={() => handleCancelAttempt(payment.id)}>Cancel attempt</Button>
                      )}
                      {user.role === 'ADMIN' && payment.status === 'REFUNDED' && payment.gatewayPaymentId && !payment.refundReference && (
                        <Button type="button" size="sm" variant="secondary" onClick={() => handleRetryRefund(payment.id)}>Retry refund</Button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {canPayOnline && (
            <div className="border-t border-line-100 pt-3">
              {/* GCash's own brand blue, not one of the four Button
                  variants — kept as a plain button on our tokens rather
                  than forcing a fifth colour into the primitive for one
                  call site. */}
              <button
                type="button"
                onClick={handlePayWithGCash}
                disabled={gcashSubmitting}
                className="h-11 w-full rounded-control bg-[#0074E4] px-4 text-sm font-medium text-white transition hover:bg-[#005bb5] disabled:cursor-not-allowed disabled:opacity-60"
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
              <Field label="Amount" error={paymentErrors.amount} help={`${formatPeso(orderDetail.payment.balanceDue)} still owed`}>
                <Input value={paymentForm.amount} onChange={(event) => setPaymentForm({ ...paymentForm, amount: event.target.value })} inputMode="decimal" placeholder="0.00" />
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
  )

  return (
    <section className="min-w-0 flex-1 px-4 pb-10 sm:px-7">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-600">{user.role} PORTAL</p>
      <h1 className="mt-1 text-2xl font-semibold text-ink-900">{isStaff ? 'Payment & Billing' : 'My Payments'}</h1>
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
          <Card className="min-w-0 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-ink-900">{isStaff ? 'Orders' : 'Your orders'}</h2>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant={owedOnly ? 'primary' : 'secondary'} onClick={() => setOwedOnly(true)}>Still owed</Button>
                <Button type="button" size="sm" variant={owedOnly ? 'secondary' : 'primary'} onClick={() => setOwedOnly(false)}>All</Button>
              </div>
            </div>
            {loading ? (
              <p className="mt-4 text-sm text-ink-500">Loading…</p>
            ) : visibleOrders.length === 0 ? (
              <EmptyState title={orders.length === 0 ? 'No orders yet' : 'Nothing is owed right now'} description={orders.length === 0 || !owedOnly ? undefined : 'Switch to All to see paid and cancelled orders.'} />
            ) : (
              <>
                <ul className="mt-4 divide-y divide-line-100 md:hidden">
                  {visibleOrders.map((order) => (
                    <li key={order.id}>
                      <button type="button" onClick={() => openOrder(order.id)} aria-label={`Open order #${order.id}`} className={`w-full rounded-control px-3 py-3 text-left transition hover:bg-surface-sunk ${selectedOrderId === order.id ? 'bg-brand-50' : ''}`}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-ink-900">
                            Order #{order.id}
                            {isStaff && <span className="font-normal text-ink-500"> · {order.customerName ?? 'Walk-in'}</span>}
                          </span>
                          <StatusBadge status={order.status} />
                        </div>
                        <div className="mt-1 flex items-center justify-between text-xs text-ink-500">
                          <span>{formatDate(order.orderDate)} · total {formatPeso(order.totalAmount)}</span>
                          <OwedCell order={order} />
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 hidden md:block">
                  <Table caption={isStaff ? 'Orders' : 'Your orders'}>
                    <Thead>
                      <Tr className="hover:bg-transparent">
                        <Th>Order</Th>
                        {isStaff && <Th>Customer</Th>}
                        <Th priority="xl">Placed</Th>
                        <Th align="right" priority="xl">Total</Th>
                        <Th align="right">Owed</Th>
                        <Th>Status</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {visibleOrders.map((order) => (
                        <Tr key={order.id} onClick={() => openOrder(order.id)} className={`cursor-pointer ${selectedOrderId === order.id ? 'bg-brand-50' : ''}`}>
                          <Td>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation()
                                openOrder(order.id)
                              }}
                              aria-label={`Open order #${order.id}`}
                              className="-my-2 inline-flex min-h-9 items-center font-semibold text-ink-900 hover:underline focus-visible:underline"
                            >
                              #{order.id}
                            </button>
                          </Td>
                          {isStaff && <Td>{order.customerName ?? 'Walk-in'}</Td>}
                          <Td priority="xl">{formatDate(order.orderDate)}</Td>
                          <Td numeric priority="xl">{formatPeso(order.totalAmount)}</Td>
                          <Td numeric><OwedCell order={order} /></Td>
                          <Td>
                            <StatusBadge status={order.status} />
                          </Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </div>
              </>
            )}
          </Card>

          <DetailPanel open={selectedOrderId !== null} onClose={closeDetail} labelledBy="receipt-heading">
            {receiptCard}
          </DetailPanel>
        </div>
      )}
    </section>
  )
}
