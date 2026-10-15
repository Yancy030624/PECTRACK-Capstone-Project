// The busiest staff screen, and the customer's "My Orders" — one file,
// two components, dispatched on role below.
//
// Responsive shape (UI audit, C2/C3): on `lg` and up the list and the
// detail sit side by side. Below that the detail used to render UNDER the
// whole list — with fifty-odd orders that is thousands of pixels down, so
// tapping a row on a phone appeared to do nothing. Now the detail opens as
// an overlay (<Modal>) on small screens, and the staff table gives way to
// the same card list the customer view already used, so Status is never
// hidden behind a horizontal scroller.
import { useEffect, useMemo, useState } from 'react'
import { useNotificationRefresh } from '../../lib/useNotificationRefresh.js'
import { Link } from 'react-router-dom'
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
import { matchesOrderSearch, orderLabel } from '../../lib/orderNumber.js'
import { useIsLargeScreen } from '../../lib/useMediaQuery.js'
import { NewOrderForm } from './NewOrderForm.jsx'

// Mirrors routes/orders.js's statusRank: a status change may only move
// FORWARD, READY_FOR_PICKUP belongs to PICKUP orders and OUT_FOR_DELIVERY
// to DELIVERY orders (and is set through Delivery Management, never here),
// and CANCELLED is reachable from anywhere. The dropdown offers only what
// the server would accept, so a cashier is never handed a list where most
// choices are a guaranteed 409.
const statusRank = { PLACED: 0, CONFIRMED: 1, IN_PRODUCTION: 2, READY_FOR_PICKUP: 3, OUT_FOR_DELIVERY: 3, COMPLETED: 4 }
const allStatuses = ['PLACED', 'CONFIRMED', 'IN_PRODUCTION', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED']
const openStatuses = new Set(['PLACED', 'CONFIRMED', 'IN_PRODUCTION', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY'])
const customerCancelReasons = ['Ordered by mistake', 'Changed my mind', 'Need to change the items', 'Pickup or delivery time no longer works', 'Other reason']

// PHASE10 D3 — a bulk order moves past PLACED only by an admin's
// approval; anyone else can only cancel (reject) it.
// NO_COD_PLAN — a delivery order moves forward only once fully paid; the
// server refuses it anyway, this just doesn't offer what would fail.
const awaitingDeliveryPayment = (order) => order.orderType === 'DELIVERY' && order.payment && !order.payment.isFullyPaid
// No refunds (CLIENT_REVISIONS_PLAN.md, R2): an order with any payment
// cannot be cancelled, so Cancel is not offered for one.
const hasPaid = (order) => Number(order.payment?.amountPaid ?? 0) > 0
function nextStatusOptions(order, role) {
  const cancel = hasPaid(order) ? [] : ['CANCELLED']
  if (order.awaitingApproval && role !== 'ADMIN') return cancel
  if (awaitingDeliveryPayment(order)) return cancel
  const forward = Object.keys(statusRank).filter((status) => statusRank[status] > statusRank[order.status])
  return forward
    .filter((status) => status !== 'OUT_FOR_DELIVERY')
    .filter((status) => status !== 'READY_FOR_PICKUP' || order.orderType === 'PICKUP')
    .concat(cancel)
}
const humanize = (status) => status.replaceAll('_', ' ')
const itemCount = (order) => order.items.reduce((sum, item) => sum + item.quantity, 0)

function ApprovalPill() {
  return <span className="rounded-full bg-status-wait-bg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-status-wait-fg">Needs approval</span>
}

// Admin only — the item count above which an order needs approval.
function BulkThresholdSetting() {
  const [value, setValue] = useState('')
  const [saved, setSaved] = useState(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    apiGet('/api/settings').then((data) => { setValue(String(data.settings.bulkOrderThreshold)); setSaved(data.settings.bulkOrderThreshold) }).catch(() => {})
  }, [])
  const save = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const data = await apiPatch('/api/settings', { bulkOrderThreshold: value })
      setSaved(data.settings.bulkOrderThreshold)
    } catch (caught) {
      setError(caught.errors?.bulkOrderThreshold ?? caught.message)
    } finally {
      setSaving(false)
    }
  }
  if (saved == null) return null
  return (
    <form onSubmit={save} className="flex flex-wrap items-center gap-2 text-sm text-ink-700">
      <span>Orders over</span>
      <div className="w-24"><Input value={value} onChange={(event) => setValue(event.target.value)} inputMode="numeric" aria-label="Bulk order threshold, in items" /></div>
      <span>items need an admin&apos;s approval.</span>
      <Button type="submit" size="sm" variant="secondary" disabled={saving || value === String(saved)}>{saving ? 'Saving…' : 'Save'}</Button>
      {error && <span className="w-full text-xs text-status-fail-fg">{error}</span>}
    </form>
  )
}

export function OrderManagement({ user, params, onNavigate }) {
  return user.role === 'ADMIN' || user.role === 'CASHIER' ? <StaffOrderManagement user={user} params={params} /> : <CustomerOrders user={user} onNavigate={onNavigate} />
}

// Wraps the detail card: a sibling column on large screens, an overlay
// below. `open` is whether an order is selected at all.
function DetailPanel({ open, onClose, labelledBy, children }) {
  const isLarge = useIsLargeScreen()
  if (isLarge) return children
  return (
    <Modal open={open} onClose={onClose} labelledBy={labelledBy}>
      <div className="w-[min(100vw-2rem,40rem)]">{children}</div>
    </Modal>
  )
}

// The compact per-order row used by the customer list, and by the staff
// list below `md` where a five-column table cannot fit.
function OrderCardList({ orders, selectedOrderId, onOpen, showCustomer }) {
  return (
    <ul className="divide-y divide-line-100">
      {orders.map((order) => (
        <li key={order.id}>
          <button
            type="button"
            onClick={() => onOpen(order.id)}
            aria-label={`Open order ${orderLabel(order)}`}
            className={`w-full rounded-control px-3 py-3 text-left transition hover:bg-surface-sunk ${selectedOrderId === order.id ? 'bg-brand-50' : ''}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold text-ink-900">
                Order {orderLabel(order, { numberOnly: true })}
                {showCustomer && <span className="font-normal text-ink-500"> · {order.customerName ?? 'Walk-in'}</span>}
              </span>
              <span className="flex items-center gap-1.5">{order.awaitingApproval && <ApprovalPill />}<StatusBadge status={order.status} /></span>
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-ink-500">
              <span>
                {formatDate(order.orderDate)}
                {order.requestedFulfillmentTime && <span className="font-semibold text-ink-700"> · needed {formatDateTime(order.requestedFulfillmentTime)}</span>}
              </span>
              <span className="font-medium text-ink-700 tabular-nums">{formatPeso(order.totalAmount)}</span>
            </div>
          </button>
        </li>
      ))}
    </ul>
  )
}

function OrderItems({ order }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">Items</p>
      <ul className="mt-1.5 divide-y divide-line-100 text-sm">
        {order.items.map((item) => (
          <li key={item.productId} className="flex items-center justify-between gap-3 py-1.5">
            <span>
              {item.productName} × {item.quantity}
              <span className="block text-xs text-ink-500">{formatPeso(item.unitPrice)} each</span>
            </span>
            {/* The line total, not the unit price — "Buns × 2 … ₱35.00"
                next to "Total ₱70.00" read like a mismatch. */}
            <span className="font-medium text-ink-900 tabular-nums">{formatPeso(Number(item.unitPrice) * item.quantity)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-right text-sm font-semibold text-ink-900 tabular-nums">Total: {formatPeso(order.totalAmount)}</p>
    </div>
  )
}

function DeliveryProgress({ delivery }) {
  if (!delivery) return null
  return (
    <div className="rounded-panel border border-line-200 bg-surface-warm p-3 text-xs text-ink-700">
      <p className="font-semibold text-ink-900">Delivery: {humanize(delivery.status)}</p>
      {delivery.deliveryPersonnelName && <p className="mt-0.5">Driver: {delivery.deliveryPersonnelName}</p>}
      {delivery.deliveredAt && <p className="mt-0.5">Delivered {formatDateTime(delivery.deliveredAt)}</p>}
    </div>
  )
}

// `params.orderId` opens that order at once — from the bell, a toast, or
// the Dashboard's Recent orders (CLIENT_REVISIONS_PLAN.md, R4).
function StaffOrderManagement({ user, params }) {
  const isCashier = user.role === 'CASHIER'
  const isAdmin = user.role === 'ADMIN'
  const [activeTab, setActiveTab] = useState('Orders')

  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')

  // An order opened from elsewhere may be closed already; show every
  // status so it is in the list beside its detail.
  const [statusFilter, setStatusFilter] = useState(params?.orderId ? 'ALL' : 'OPEN')
  const [search, setSearch] = useState('')

  const [selectedOrderId, setSelectedOrderId] = useState(null)
  const [orderDetail, setOrderDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [statusChoice, setStatusChoice] = useState('')
  const [statusNote, setStatusNote] = useState('')
  const [statusSubmitting, setStatusSubmitting] = useState(false)

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
    if (params?.orderId) openOrder(params.orderId)
  }, [])
  useNotificationRefresh(() => loadOrders())

  // Filtering is client-side: the list is already fully loaded (GET
  // /api/orders returns everything for staff), so a status pick or a
  // typed id/name narrows instantly without a round trip. "Open" is the
  // default because a cashier's working set is what still needs doing.
  const visibleOrders = useMemo(() => {
    const term = search.trim().toLowerCase()
    return orders.filter((order) => {
      if (statusFilter === 'OPEN' && !openStatuses.has(order.status)) return false
      if (statusFilter !== 'OPEN' && statusFilter !== 'ALL' && order.status !== statusFilter) return false
      if (!term) return true
      return matchesOrderSearch(order, term) || (order.customerName ?? 'walk-in').toLowerCase().includes(term)
    })
  }, [orders, statusFilter, search])

  const openOrder = async (orderId) => {
    setSelectedOrderId(orderId)
    setDetailLoading(true)
    setOrderDetail(null)
    setNotice('')
    try {
      const data = await apiGet(`/api/orders/${orderId}`)
      setOrderDetail(data.order)
      setStatusChoice('')
      setStatusNote('')
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

  const handleStatusSubmit = async (event) => {
    event.preventDefault()
    if (!statusChoice) return
    // Cancelling restores stock — which cannot be
    // which can be undone. The customer's own cancel button already asks;
    // the staff path, with broader powers, asked nothing.
    if (statusChoice === 'CANCELLED' && !window.confirm(`Cancel order ${orderLabel(orderDetail)}? Its stock goes back on the shelf. This cannot be undone.`)) return
    setStatusSubmitting(true)
    setMessage('')
    try {
      const data = await apiPatch(`/api/orders/${selectedOrderId}`, { status: statusChoice, note: statusNote || null })
      await openOrder(selectedOrderId)
      await loadOrders()
      setNotice(data.message ?? `Order ${orderLabel(orderDetail)} is now ${humanize(statusChoice).toLowerCase()}.`)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setStatusSubmitting(false)
    }
  }
  // PHASE10 D3 — approving a bulk order is confirming it, by an admin.
  // An unpaid DELIVERY order cannot be confirmed (NO_COD_PLAN), so for one
  // the admin approves only: payment opens, and it is confirmed once paid.
  const approveBulkOrder = async () => {
    const approveOnly = awaitingDeliveryPayment(orderDetail)
    if (!window.confirm(approveOnly
      ? `Approve bulk order ${orderLabel(orderDetail)}? Payment opens; it is confirmed once fully paid.`
      : `Approve bulk order ${orderLabel(orderDetail)}? It is confirmed and payment opens.`)) return
    setStatusSubmitting(true)
    setMessage('')
    try {
      if (approveOnly) {
        const data = await apiPost(`/api/orders/${selectedOrderId}/approve`, {})
        setNotice(data.message)
      } else {
        await apiPatch(`/api/orders/${selectedOrderId}`, { status: 'CONFIRMED', note: 'Bulk order approved.' })
        setNotice(`Bulk order ${orderLabel(orderDetail)} approved and confirmed.`)
      }
      await openOrder(selectedOrderId)
      await loadOrders()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setStatusSubmitting(false)
    }
  }
  const handleOrderCreated = async (orderId) => {
    setActiveTab('Orders')
    setStatusFilter('OPEN')
    await loadOrders()
    await openOrder(orderId)
  }

  const detailCard = (
    <Card className="min-w-0 p-6">
      <div className="flex items-start justify-between gap-3">
        <h2 id="order-detail-heading" className="text-lg font-semibold text-ink-900">Order detail</h2>
        <Button type="button" size="sm" variant="ghost" className="lg:hidden" onClick={closeDetail}>Close</Button>
      </div>
      {!selectedOrderId ? (
        <p className="mt-4 text-sm text-ink-500">Select an order to view its details.</p>
      ) : detailLoading ? (
        <LoadingRows className="mt-4" />
      ) : orderDetail ? (
        <div className="mt-4 space-y-4">
          {notice && <Alert variant="success">{notice}</Alert>}
          <div className="text-xs text-ink-500">
            <p>
              <strong className="text-ink-900">Order {orderLabel(orderDetail)}</strong> · {orderDetail.orderType} · <StatusBadge status={orderDetail.status} />
            </p>
            <p className="mt-1">
              Customer: {orderDetail.customerName ?? 'Walk-in'}
              {orderDetail.cashierName ? ` · Processed by ${orderDetail.cashierName}` : ''}
            </p>
            <p className="mt-1">Placed {formatDateTime(orderDetail.orderDate)}</p>
            {orderDetail.instructions && <p className="mt-1">Instructions: {orderDetail.instructions}</p>}
            {orderDetail.requestedFulfillmentTime && <p className="mt-1 font-semibold text-ink-900">Needed by: {formatDateTime(orderDetail.requestedFulfillmentTime)}</p>}
          </div>
          <DeliveryProgress delivery={orderDetail.delivery} />

          {orderDetail.awaitingApproval && (
            <div className="rounded-panel border border-line-200 bg-status-wait-bg p-3 text-sm">
              <p className="font-semibold text-status-wait-fg">Bulk order — needs an admin&apos;s approval</p>
              <p className="mt-1 text-xs text-ink-700">{itemCount(orderDetail)} items. It cannot be confirmed or paid until an admin approves it. To turn it down, cancel it with a reason; its stock goes back on the shelf.</p>
              {isAdmin && (
                <Button type="button" size="sm" className="mt-2" onClick={approveBulkOrder} disabled={statusSubmitting}>
                  {statusSubmitting ? 'Approving…' : awaitingDeliveryPayment(orderDetail) ? 'Approve' : 'Approve and confirm'}
                </Button>
              )}
            </div>
          )}

          {!orderDetail.awaitingApproval && orderDetail.status === 'PLACED' && awaitingDeliveryPayment(orderDetail) && (
            <div className="rounded-panel border border-line-200 bg-status-wait-bg p-3 text-sm">
              <p className="font-semibold text-status-wait-fg">Not paid yet — don&apos;t bake it</p>
              <p className="mt-1 text-xs text-ink-700">Delivery orders are confirmed only once fully paid: the customer pays with GCash online, or pays at the counter in Payment &amp; Billing. There is no cash on delivery.</p>
            </div>
          )}

          <OrderItems order={orderDetail} />

          {orderDetail.payment && (
            <p className="text-xs text-ink-500">
              Paid {formatPeso(orderDetail.payment.amountPaid)} · {orderDetail.payment.isFullyPaid ? <span className="font-semibold text-status-done-fg">Fully paid</span> : <span className="font-semibold text-status-fail-fg">Owes {formatPeso(orderDetail.payment.balanceDue)}</span>}
            </p>
          )}
          {orderDetail.status === 'CANCELLED' && hasPaid(orderDetail) && (
            <p className="rounded-panel bg-status-wait-bg p-3 text-xs font-semibold text-status-wait-fg">
              Paid after cancellation ({formatPeso(orderDetail.payment.amountPaid)}) — the bakery gives no refunds, so settle this with the customer.
            </p>
          )}

          {orderDetail.status === 'CANCELLED' || orderDetail.status === 'COMPLETED' ? (
            <p className="border-t border-line-100 pt-3 text-sm text-ink-500">This order is {orderDetail.status.toLowerCase()} and can no longer be changed.</p>
          ) : (
            <form className="space-y-3 border-t border-line-100 pt-3" onSubmit={handleStatusSubmit}>
              <Field label="Update status" help={orderDetail.orderType === 'DELIVERY' ? 'Out for delivery is set from Delivery Management. Completed needs the delivery marked delivered and the order fully paid.' : undefined}>
                <Select value={statusChoice} onChange={(event) => setStatusChoice(event.target.value)}>
                  <option value="">Select a new status</option>
                  {nextStatusOptions(orderDetail, user.role).map((status) => (
                    <option key={status} value={status}>
                      {humanize(status)}
                    </option>
                  ))}
                </Select>
              </Field>
              {/* A cancellation needs a reason (PHASE10 B7); it is kept in
                  the status history below. */}
              <Input value={statusNote} onChange={(event) => setStatusNote(event.target.value)} placeholder={statusChoice === 'CANCELLED' ? 'Reason for cancelling (required)' : 'Optional note'} aria-label={statusChoice === 'CANCELLED' ? 'Reason for cancelling' : 'Status note'} required={statusChoice === 'CANCELLED'} minLength={statusChoice === 'CANCELLED' ? 5 : undefined} />
              <Button type="submit" size="sm" disabled={statusSubmitting || !statusChoice || (statusChoice === 'CANCELLED' && statusNote.trim().length < 5)}>
                {statusSubmitting ? 'Saving…' : 'Save status'}
              </Button>
            </form>
          )}

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">Status history</p>
            <ul className="mt-1.5 space-y-1 text-sm text-ink-500">
              {orderDetail.statusHistory.map((entry, index) => (
                <li key={index}>
                  <span className="font-semibold text-ink-900">{humanize(entry.status)}</span> by {entry.updatedByName} — {formatDateTime(entry.updatedAt)}
                  {entry.note && <span className="block text-ink-500">"{entry.note}"</span>}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </Card>
  )

  return (
    <section className="min-w-0 flex-1 px-4 pb-10 sm:px-7">
      {/* The account page already says whose it is; the portal label is for staff. */}
      {user.role !== 'CUSTOMER' && <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-600">{user.role} PORTAL</p>}
      <h1 className="mt-1 text-2xl font-semibold text-ink-900">Order Management</h1>
      <p className="mt-2 text-sm text-ink-500">{isCashier ? 'Take an order at the counter, or manage every order already placed.' : 'Every order placed, pickup and delivery.'}</p>

      {isCashier && (
        <div className="mt-6 flex gap-2">
          {['Orders', 'New order'].map((tab) => (
            <Button type="button" key={tab} size="sm" variant={activeTab === tab ? 'primary' : 'secondary'} onClick={() => setActiveTab(tab)}>
              {tab}
            </Button>
          ))}
        </div>
      )}

      {isAdmin && (
        <Card className="mt-6 px-5 py-3">
          <BulkThresholdSetting />
        </Card>
      )}

      {message && (
        <div className="mt-4">
          <Alert variant="error">{message}</Alert>
        </div>
      )}

      {/* min-w-0 on both Cards is load-bearing: below lg the single
          implicit column gives each grid item min-width:auto, so a Card
          holding a table refuses to shrink and the page grows sideways. */}
      <div hidden={activeTab !== 'Orders'} className="mt-7 grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card className="min-w-0 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-ink-900">Orders</h2>
            <div className="flex flex-wrap gap-2">
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Order # or customer" aria-label="Search orders" className="w-44" />
              <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by status" className="w-40">
                <option value="OPEN">Open orders</option>
                <option value="ALL">All orders</option>
                {allStatuses.map((status) => <option key={status} value={status}>{humanize(status)}</option>)}
              </Select>
            </div>
          </div>
          {loading ? (
            <LoadingRows className="mt-4" />
          ) : visibleOrders.length === 0 ? (
            <EmptyState title={orders.length === 0 ? 'No orders yet' : 'No orders match'} description={orders.length === 0 ? undefined : 'Try another status or clear the search.'} />
          ) : (
            <>
              <div className="mt-4 md:hidden">
                <OrderCardList orders={visibleOrders} selectedOrderId={selectedOrderId} onOpen={openOrder} showCustomer />
              </div>
              <div className="mt-4 hidden md:block">
                <Table caption="Orders">
                  <Thead>
                    <Tr className="hover:bg-transparent">
                      <Th>Order</Th>
                      <Th>Customer</Th>
                      <Th priority="xl">Placed</Th>
                      <Th priority="xl">Needed by</Th>
                      <Th align="right">Total</Th>
                      <Th>Status</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {visibleOrders.map((order) => (
                      // The row's onClick is a mouse convenience; the first
                      // cell also carries a real <button> so the row is
                      // reachable and operable by keyboard.
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
                        <Td>{order.customerName ?? 'Walk-in'}</Td>
                        <Td priority="xl">{formatDate(order.orderDate)}</Td>
                        <Td priority="xl">{order.requestedFulfillmentTime ? formatDateTime(order.requestedFulfillmentTime) : <span className="text-ink-500">—</span>}</Td>
                        <Td numeric>{formatPeso(order.totalAmount)}</Td>
                        <Td>
                          <span className="flex flex-wrap items-center gap-1.5"><StatusBadge status={order.status} />{order.awaitingApproval && <ApprovalPill />}</span>
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </div>
            </>
          )}
        </Card>

        <DetailPanel open={selectedOrderId !== null} onClose={closeDetail} labelledBy="order-detail-heading">
          {detailCard}
        </DetailPanel>
      </div>

      {isCashier && (
        <div hidden={activeTab !== 'New order'}>
          <NewOrderForm onCreated={handleOrderCreated} />
        </div>
      )}
    </section>
  )
}

function CustomerOrders({ user, onNavigate }) {
  const [orders, setOrders] = useState(null)
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')

  const [selectedOrderId, setSelectedOrderId] = useState(null)
  const [orderDetail, setOrderDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelReason, setCancelReason] = useState('')

  const loadOrders = async () => {
    try {
      const data = await apiGet('/api/orders')
      setOrders(data.orders)
    } catch (error) {
      setMessage(error.message)
    }
  }

  useEffect(() => {
    loadOrders()
  }, [])

  const openOrder = async (orderId) => {
    setSelectedOrderId(orderId)
    setDetailLoading(true)
    setOrderDetail(null)
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

  const cancelOrder = async () => {
    if (!cancelReason) return
    if (!window.confirm(`Cancel order ${orderLabel(orderDetail)}? This cannot be undone.`)) return
    setCancelling(true)
    setMessage('')
    try {
      await apiPatch(`/api/orders/${selectedOrderId}`, { status: 'CANCELLED', note: `Cancelled by customer: ${cancelReason}` })
      setCancelReason('')
      const label = orderLabel(orderDetail)
      await openOrder(selectedOrderId)
      await loadOrders()
      setNotice(`Order ${label} was cancelled.`)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setCancelling(false)
    }
  }

  const loading = orders === null

  const detailCard = (
    <Card className="min-w-0 p-6">
      <div className="flex items-start justify-between gap-3">
        <h2 id="order-detail-heading" className="text-lg font-semibold text-ink-900">Order detail</h2>
        <Button type="button" size="sm" variant="ghost" className="lg:hidden" onClick={closeDetail}>Close</Button>
      </div>
      {!selectedOrderId ? (
        <p className="mt-4 text-sm text-ink-500">Select an order to see its items and status.</p>
      ) : detailLoading ? (
        <LoadingRows className="mt-4" />
      ) : orderDetail ? (
        <div className="mt-4 space-y-4">
          {notice && <Alert variant="success">{notice}</Alert>}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-ink-500">
              <strong className="text-ink-900">Order {orderLabel(orderDetail)}</strong> · {orderDetail.orderType} · placed {formatDate(orderDetail.orderDate)}
            </p>
            <span className="flex items-center gap-1.5">{orderDetail.awaitingApproval && <ApprovalPill />}<StatusBadge status={orderDetail.status} /></span>
          </div>
          {orderDetail.awaitingApproval && (
            <p className="rounded-panel bg-status-wait-bg p-3 text-xs text-status-wait-fg">
              This is a large order ({itemCount(orderDetail)} items), so the bakery reviews it before confirming. You can pay once it is approved.
            </p>
          )}
          {!orderDetail.awaitingApproval && orderDetail.status === 'PLACED' && awaitingDeliveryPayment(orderDetail) && (
            <p className="rounded-panel bg-status-wait-bg p-3 text-xs text-status-wait-fg">
              Waiting for payment — we start baking your order once it is paid in full. Delivery orders are paid ahead; there is no cash on delivery.
            </p>
          )}
          {orderDetail.instructions && <p className="text-xs text-ink-500">Instructions: {orderDetail.instructions}</p>}
          {orderDetail.requestedFulfillmentTime && <p className="text-xs text-ink-500">Needed by: <span className="font-semibold text-ink-900">{formatDateTime(orderDetail.requestedFulfillmentTime)}</span></p>}
          {/* Where a delivery order actually stands — deliveries.status,
              which orders.status stops short of (it never reaches
              DELIVERED; staff mark COMPLETED separately once paid). */}
          <DeliveryProgress delivery={orderDetail.delivery} />

          <OrderItems order={orderDetail} />

          {/* What is owed, and the way to pay it, from the order itself —
              the customer used to have to know that "My Payments" was
              where that lived. */}
          {orderDetail.payment && orderDetail.status !== 'CANCELLED' && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-line-200 bg-surface-warm p-3 text-sm">
              {orderDetail.payment.isFullyPaid ? (
                <span className="font-semibold text-status-done-fg">Fully paid</span>
              ) : (
                <>
                  <span>Balance due: <span className="font-semibold text-ink-900">{formatPeso(orderDetail.payment.balanceDue)}</span></span>
                  {onNavigate && !orderDetail.awaitingApproval && <Button type="button" size="sm" onClick={() => onNavigate('My Payments')}>Pay now</Button>}
                </>
              )}
            </div>
          )}

          {orderDetail.status === 'PLACED' && hasPaid(orderDetail) && (
            <p className="border-t border-line-100 pt-3 text-xs text-ink-500">This order has been paid, so it can&apos;t be cancelled here. For any problem with it, please contact the bakery.</p>
          )}
          {orderDetail.status === 'PLACED' && !hasPaid(orderDetail) && (
            <div className="border-t border-line-100 pt-3">
              {/* PHASE10 B7 — a cancellation carries a reason; a customer
                  picks one rather than typing it. */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="w-56">
                  <Select value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} aria-label="Reason for cancelling">
                    <option value="">Why are you cancelling?</option>
                    {customerCancelReasons.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
                  </Select>
                </div>
                <Button type="button" variant="destructive" size="sm" onClick={cancelOrder} disabled={cancelling || !cancelReason}>
                  {cancelling ? 'Cancelling…' : 'Cancel this order'}
                </Button>
              </div>
              <p className="mt-1.5 text-xs text-ink-500">You can cancel while your order is still PLACED — once we start on it, ask staff directly.</p>
            </div>
          )}

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">Status history</p>
            <ul className="mt-1.5 space-y-1 text-sm text-ink-500">
              {orderDetail.statusHistory.map((entry, index) => (
                <li key={index}>
                  <span className="font-semibold text-ink-900">{humanize(entry.status)}</span> — {formatDateTime(entry.updatedAt)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </Card>
  )

  return (
    <section className="min-w-0 flex-1 px-4 pb-10 sm:px-7">
      {/* The account page already says whose it is; the portal label is for staff. */}
      {user.role !== 'CUSTOMER' && <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-600">{user.role} PORTAL</p>}
      <h1 className="mt-1 text-2xl font-semibold text-ink-900">My Orders</h1>
      <p className="mt-2 text-sm text-ink-500">Everything you've ordered, and where it stands right now.</p>

      {message && (
        <div className="mt-4">
          <Alert variant="error">{message}</Alert>
        </div>
      )}

      <div className="mt-7 grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Card className="min-w-0 p-6">
          <h2 className="text-lg font-semibold text-ink-900">Your orders</h2>
          {loading ? (
            <LoadingRows className="mt-4" />
          ) : orders.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                title="You haven't placed an order yet."
                action={
                  <Link to="/menu" className="inline-flex h-9 items-center justify-center rounded-control bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700">
                    Browse the menu
                  </Link>
                }
              />
            </div>
          ) : (
            <div className="mt-4">
              <OrderCardList orders={orders} selectedOrderId={selectedOrderId} onOpen={openOrder} />
            </div>
          )}
        </Card>

        <DetailPanel open={selectedOrderId !== null} onClose={closeDetail} labelledBy="order-detail-heading">
          {detailCard}
        </DetailPanel>
      </div>
    </section>
  )
}
