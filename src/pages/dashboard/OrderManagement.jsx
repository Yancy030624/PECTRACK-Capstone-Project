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
import { Link } from 'react-router-dom'
import { apiGet, apiPatch } from '../../api/client.js'
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
function nextStatusOptions(order) {
  const forward = Object.keys(statusRank).filter((status) => statusRank[status] > statusRank[order.status])
  return forward
    .filter((status) => status !== 'OUT_FOR_DELIVERY')
    .filter((status) => status !== 'READY_FOR_PICKUP' || order.orderType === 'PICKUP')
    .concat('CANCELLED')
}
const humanize = (status) => status.replaceAll('_', ' ')

export function OrderManagement({ user, onNavigate }) {
  return user.role === 'ADMIN' || user.role === 'CASHIER' ? <StaffOrderManagement user={user} /> : <CustomerOrders user={user} onNavigate={onNavigate} />
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
            aria-label={`Open order #${order.id}`}
            className={`w-full rounded-control px-3 py-3 text-left transition hover:bg-surface-sunk ${selectedOrderId === order.id ? 'bg-brand-50' : ''}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold text-ink-900">
                Order #{order.id}
                {showCustomer && <span className="font-normal text-ink-500"> · {order.customerName ?? 'Walk-in'}</span>}
              </span>
              <StatusBadge status={order.status} />
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

function StaffOrderManagement({ user }) {
  const isCashier = user.role === 'CASHIER'
  const [activeTab, setActiveTab] = useState('Orders')

  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')

  const [statusFilter, setStatusFilter] = useState('OPEN')
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
  }, [])

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
      return `#${order.id}`.includes(term) || String(order.id).includes(term) || (order.customerName ?? 'walk-in').toLowerCase().includes(term)
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
    // Cancelling restores stock and, on a paid order, refunds it — none of
    // which can be undone. The customer's own cancel button already asks;
    // the staff path, with broader powers, asked nothing.
    if (statusChoice === 'CANCELLED' && !window.confirm(`Cancel order #${selectedOrderId}? Stock is restored and any payment is refunded. This cannot be undone.`)) return
    setStatusSubmitting(true)
    setMessage('')
    try {
      const data = await apiPatch(`/api/orders/${selectedOrderId}`, { status: statusChoice, note: statusNote || null })
      await openOrder(selectedOrderId)
      await loadOrders()
      setNotice(data.message ?? `Order #${selectedOrderId} is now ${humanize(statusChoice).toLowerCase()}.`)
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
              <strong className="text-ink-900">Order #{orderDetail.id}</strong> · {orderDetail.orderType} · <StatusBadge status={orderDetail.status} />
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

          <OrderItems order={orderDetail} />

          {orderDetail.payment && (
            <p className="text-xs text-ink-500">
              Paid {formatPeso(orderDetail.payment.amountPaid)} · {orderDetail.payment.isFullyPaid ? <span className="font-semibold text-status-done-fg">Fully paid</span> : <span className="font-semibold text-status-fail-fg">Owes {formatPeso(orderDetail.payment.balanceDue)}</span>}
            </p>
          )}

          {orderDetail.status === 'CANCELLED' || orderDetail.status === 'COMPLETED' ? (
            <p className="border-t border-line-100 pt-3 text-sm text-ink-500">This order is {orderDetail.status.toLowerCase()} and can no longer be changed.</p>
          ) : (
            <form className="space-y-3 border-t border-line-100 pt-3" onSubmit={handleStatusSubmit}>
              <Field label="Update status" help={orderDetail.orderType === 'DELIVERY' ? 'Out for delivery is set from Delivery Management. Completed needs the delivery marked delivered and the order fully paid.' : undefined}>
                <Select value={statusChoice} onChange={(event) => setStatusChoice(event.target.value)}>
                  <option value="">Select a new status</option>
                  {nextStatusOptions(orderDetail).map((status) => (
                    <option key={status} value={status}>
                      {humanize(status)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Input value={statusNote} onChange={(event) => setStatusNote(event.target.value)} placeholder="Optional note" aria-label="Status note" />
              <Button type="submit" size="sm" disabled={statusSubmitting || !statusChoice}>
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
      <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-600">{user.role} PORTAL</p>
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
                            aria-label={`Open order #${order.id}`}
                            className="-my-2 inline-flex min-h-9 items-center font-semibold text-ink-900 hover:underline focus-visible:underline"
                          >
                            #{order.id}
                          </button>
                        </Td>
                        <Td>{order.customerName ?? 'Walk-in'}</Td>
                        <Td priority="xl">{formatDate(order.orderDate)}</Td>
                        <Td priority="xl">{order.requestedFulfillmentTime ? formatDateTime(order.requestedFulfillmentTime) : <span className="text-ink-500">—</span>}</Td>
                        <Td numeric>{formatPeso(order.totalAmount)}</Td>
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
    if (!window.confirm(`Cancel order #${selectedOrderId}? This cannot be undone.`)) return
    setCancelling(true)
    setMessage('')
    try {
      await apiPatch(`/api/orders/${selectedOrderId}`, { status: 'CANCELLED' })
      await openOrder(selectedOrderId)
      await loadOrders()
      setNotice(`Order #${selectedOrderId} was cancelled.`)
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
              <strong className="text-ink-900">Order #{orderDetail.id}</strong> · {orderDetail.orderType} · placed {formatDate(orderDetail.orderDate)}
            </p>
            <StatusBadge status={orderDetail.status} />
          </div>
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
                  {onNavigate && <Button type="button" size="sm" onClick={() => onNavigate('My Payments')}>Pay now</Button>}
                </>
              )}
            </div>
          )}

          {orderDetail.status === 'PLACED' && (
            <div className="border-t border-line-100 pt-3">
              <Button type="button" variant="destructive" size="sm" onClick={cancelOrder} disabled={cancelling}>
                {cancelling ? 'Cancelling…' : 'Cancel this order'}
              </Button>
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
      <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-600">{user.role} PORTAL</p>
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
