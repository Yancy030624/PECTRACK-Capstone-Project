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
import { LoadingRows } from '../../components/ui/Skeleton.jsx'
import { formatDate, formatDateTime, formatPeso } from '../../lib/format.js'
import { orderLabel } from '../../lib/orderNumber.js'
import { useIsLargeScreen } from '../../lib/useMediaQuery.js'
import { PaymentLog } from './PaymentLog.jsx'
import { PrintHeader, PrintThisButton } from '../../components/PrintReport.jsx'

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

// The Billing tab's filter (the user, 2026-10-16): every order is paid
// first, so there is nothing owed to show — the list is the orders waiting
// to be picked up, or the ones already completed. No status column and no
// cancelled orders.
const billingFilters = [
  { key: 'READY_FOR_PICKUP', label: 'Ready for pickup' },
  { key: 'COMPLETED', label: 'Completed' },
]

export function PaymentBilling({ user }) {
  const isStaff = user.role === 'ADMIN' || user.role === 'CASHIER'
  // Payment first (RULES-PLANS/PAYMENT_FIRST_PLAN.md, the adviser
  // 2026-10-16): every order is paid before it is placed, so there are no
  // unpaid balances to chase and no "Still owed" view. This screen is the
  // receipts and the payment log.

  const [activeTab, setActiveTab] = useState('billing')

  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')

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
    // Back from PayMongo: the return link names the order
    // (?order=<id>, routes/payments.js POST /intent), so its receipt opens
    // at once — and opening it confirms the payment (below).
    const returnedOrderId = Number(new URLSearchParams(window.location.search).get('order'))
    if (Number.isInteger(returnedOrderId) && returnedOrderId > 0) openOrder(returnedOrderId)
  }, [])

  const [billingFilter, setBillingFilter] = useState('READY_FOR_PICKUP')
  const showNeededBy = billingFilter === 'READY_FOR_PICKUP'
  const visibleOrders = useMemo(
    () => orders.filter((order) => order.status === billingFilter),
    [orders, billingFilter],
  )

  const openOrder = async (orderId) => {
    setSelectedOrderId(orderId)
    setDetailLoading(true)
    setOrderDetail(null)
    setPaymentForm(emptyPaymentForm)
    setPaymentErrors({})
    setNotice('')
    try {
      let data = await apiGet(`/api/orders/${orderId}`)
      // Confirm-on-return: ask the server to check each pending GCash
      // attempt with PayMongo (POST /api/payments/:id/confirm), so a payer
      // back from GCash sees the order paid without waiting for PayMongo's
      // webhook. A failed check is not an error here — the payment stays
      // pending and the webhook can still settle it.
      const pending = data.order.status === 'CANCELLED' ? [] : data.order.payment.payments.filter((payment) => payment.status === 'PENDING')
      if (pending.length) {
        const results = await Promise.all(pending.map((payment) => apiPost(`/api/payments/${payment.id}/confirm`, {}).catch(() => null)))
        if (results.some((result) => result && result.status !== 'PENDING')) {
          data = await apiGet(`/api/orders/${orderId}`)
          if (results.some((result) => result?.status === 'PAID')) setNotice('GCash payment confirmed.')
          loadOrders()
        }
      }
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
      setNotice(data.isFullyPaid ? `Payment recorded — order ${orderLabel(orderDetail)} is now fully paid.` : `Payment recorded — ${formatPeso(data.balanceDue)} still owed.`)
    } catch (error) {
      setPaymentErrors(error.errors ?? {})
      setMessage(error.message)
    } finally {
      setPaymentSubmitting(false)
    }
  }

  const canRecordPayment = isStaff && orderDetail && orderDetail.status !== 'CANCELLED' && !orderDetail.payment.isFullyPaid
  // Customers only (CLIENT_REVISIONS_PLAN.md, R1); staff record payments
  // taken at the counter with the form below.

  const tabs = [
    { key: 'billing', label: 'Billing' },
    { key: 'log', label: 'Payment log' },
  ]

  const receiptCard = (
    <Card className="print-only-target min-w-0 p-6">
      {orderDetail && <PrintHeader title={`Receipt — Order ${orderLabel(orderDetail, { withDay: true })}`} user={isStaff ? user : null} />}
      <div className="flex items-start justify-between gap-3">
        <h2 id="receipt-heading" className="text-lg font-semibold text-ink-900 print:hidden">Receipt</h2>
        <div className="flex items-center gap-2">
          {/* PAPER_VS_SYSTEM.md H9 — the paper promises a receipt the
              customer can keep as a PDF. */}
          {orderDetail && <PrintThisButton />}
          <Button type="button" size="sm" variant="ghost" className="lg:hidden print:hidden" onClick={closeDetail}>Close</Button>
        </div>
      </div>
      {!selectedOrderId ? (
        <p className="mt-4 text-sm text-ink-500">Select an order to view its receipt.</p>
      ) : detailLoading ? (
        <LoadingRows className="mt-4" />
      ) : orderDetail ? (
        <div className="mt-4 space-y-4">
          {notice && <div className="print:hidden"><Alert variant="success">{notice}</Alert></div>}
          <div className="text-xs text-ink-500">
            <p>
              <strong className="text-ink-900">Order {orderLabel(orderDetail)}</strong> · {orderDetail.orderType} · <StatusBadge status={orderDetail.status} />
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
                {Number(orderDetail.payment.amountPaid) > 0
                  ? 'Cancelled, but paid after cancellation — settle with the customer'
                  : orderDetail.payment.payments.some((payment) => payment.status === 'REFUNDED') ? 'Cancelled — payment refunded' : 'Cancelled — nothing was paid'}
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
                    </span>
                    <span className="flex items-center gap-2">
                      <StatusBadge status={payment.status} />
                      {payment.status === 'PENDING' && orderDetail.status !== 'CANCELLED' && (
                        <Button type="button" size="sm" variant="secondary" onClick={() => handleCancelAttempt(payment.id)}>Cancel attempt</Button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {canRecordPayment && (
            <form className="space-y-3 border-t border-line-100 pt-3 print:hidden" onSubmit={handlePaymentSubmit}>
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
      {/* The account page already says whose it is; the portal label is for staff. */}
      {user.role !== 'CUSTOMER' && <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-600">{user.role} PORTAL</p>}
      <h1 className="mt-1 text-2xl font-semibold text-ink-900">{isStaff ? 'Payment & Billing' : 'My Payments'}</h1>
      <p className="mt-2 text-sm text-ink-500">{isStaff ? 'Every payment is taken when the order is placed. Receipts and the payment log.' : 'Your orders and their receipts.'}</p>

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
              <div role="group" aria-label="Filter orders" className="flex flex-wrap gap-2">
                {billingFilters.map((filter) => (
                  <Button key={filter.key} type="button" size="sm" variant={billingFilter === filter.key ? 'primary' : 'secondary'} aria-pressed={billingFilter === filter.key} onClick={() => setBillingFilter(filter.key)}>
                    {filter.label} <span className="tabular-nums opacity-70">{orders.filter((order) => order.status === filter.key).length}</span>
                  </Button>
                ))}
              </div>
            </div>
            {loading ? (
              <LoadingRows className="mt-4" />
            ) : visibleOrders.length === 0 ? (
              <EmptyState title={billingFilter === 'READY_FOR_PICKUP' ? 'Nothing waiting to be picked up' : 'No completed orders yet'} />
            ) : (
              <>
                <ul className="mt-4 divide-y divide-line-100 md:hidden">
                  {visibleOrders.map((order) => (
                    <li key={order.id}>
                      <button type="button" onClick={() => openOrder(order.id)} aria-label={`Open order ${orderLabel(order)}`} className={`w-full rounded-control px-3 py-3 text-left transition hover:bg-surface-sunk ${selectedOrderId === order.id ? 'bg-brand-50' : ''}`}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-ink-900">
                            Order {orderLabel(order, { numberOnly: true })}
                            {isStaff && <span className="font-normal text-ink-500"> · {order.customerName ?? 'Walk-in'}</span>}
                          </span>
                          <span className="text-sm font-medium text-ink-900 tabular-nums">{formatPeso(order.totalAmount)}</span>
                        </div>
                        <div className="mt-1 text-xs text-ink-500">
                          {showNeededBy
                            ? <>Needed by {order.requestedFulfillmentTime ? formatDateTime(order.requestedFulfillmentTime) : 'as soon as ready'}</>
                            : <>Placed {formatDate(order.orderDate)}</>}
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
                        {showNeededBy && <Th>Needed by</Th>}
                        <Th align="right">Total</Th>
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
                              aria-label={`Open order ${orderLabel(order)}`}
                              className="-my-2 inline-flex min-h-9 items-center font-semibold text-ink-900 hover:underline focus-visible:underline"
                            >
                              {orderLabel(order, { numberOnly: true })}
                            </button>
                          </Td>
                          {isStaff && <Td>{order.customerName ?? 'Walk-in'}</Td>}
                          <Td priority="xl">{formatDate(order.orderDate)}</Td>
                          {showNeededBy && <Td>{order.requestedFulfillmentTime ? formatDateTime(order.requestedFulfillmentTime) : <span className="text-ink-500">As soon as ready</span>}</Td>}
                          <Td numeric>{formatPeso(order.totalAmount)}</Td>
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
