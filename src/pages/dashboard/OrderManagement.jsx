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
import { apiGet, apiPatch } from '../../api/client.js'
import { Modal } from '../../components/Modal.jsx'
import { Alert } from '../../components/ui/Alert.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Card } from '../../components/ui/Card.jsx'
import { EmptyState } from '../../components/ui/EmptyState.jsx'
import { Input } from '../../components/ui/Input.jsx'
import { Select } from '../../components/ui/Select.jsx'
import { StatusBadge } from '../../components/ui/StatusBadge.jsx'
import { Table, Tbody, Td, Th, Thead, Tr } from '../../components/ui/Table.jsx'
import { LoadingRows } from '../../components/ui/Skeleton.jsx'
import { formatDate, formatDateTime, formatPeso } from '../../lib/format.js'
import { matchesOrderSearch, orderLabel } from '../../lib/orderNumber.js'
import { useIsLargeScreen } from '../../lib/useMediaQuery.js'
import { WalkInOrderForm } from './WalkInOrderForm.jsx'

// Payment first (RULES-PLANS/PAYMENT_FIRST_PLAN.md, the adviser 2026-10-16):
// every order shown here is paid. A pickup or walk-in order is Ready for
// pickup, then Completed when it is handed over; a delivery order is Ready
// for delivery, then Out for delivery and Completed from the driver's
// phone. No Placed, In production or Cancelled step any more (older orders
// may still carry one).
const statusRank = { PLACED: 0, CONFIRMED: 1, IN_PRODUCTION: 2, READY_FOR_PICKUP: 3, READY_FOR_DELIVERY: 3, OUT_FOR_DELIVERY: 3.5, COMPLETED: 4 }
const openStatuses = new Set(['PLACED', 'CONFIRMED', 'IN_PRODUCTION', 'READY_FOR_PICKUP', 'READY_FOR_DELIVERY', 'OUT_FOR_DELIVERY'])

// Status filter buttons, one click each.
const statusFilters = [
  { key: 'OPEN', label: 'Open' },
  { key: 'READY_FOR_PICKUP', label: 'Ready for pickup' },
  { key: 'READY_FOR_DELIVERY', label: 'Ready for delivery' },
  { key: 'OUT_FOR_DELIVERY', label: 'Out for delivery' },
  { key: 'COMPLETED', label: 'Completed' },
  { key: 'ALL', label: 'All' },
]
const matchesFilter = (order, filter) => {
  if (filter === 'ALL') return true
  if (filter === 'OPEN') return openStatuses.has(order.status)
  return order.status === filter
}

// The date filter (A16): by the order's own day — the Manila date it is
// picked up or delivered (its requested time), or the day it was placed
// when it named none. A reserved order shows under Upcoming until its day,
// then under Today. A date picker looks up one day. There is no "Past":
// finished days are history, kept in Payment & Billing and the reports.
const manilaDay = (value) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date(value))
const orderDay = (order) => manilaDay(order.requestedFulfillmentTime ?? order.orderDate)
const dayFilters = [
  { key: 'TODAY', label: 'Today' },
  { key: 'UPCOMING', label: 'Upcoming' },
]
// `filter` is TODAY, UPCOMING, ALL (an order opened from elsewhere), or a
// picked date ('YYYY-MM-DD').
const matchesDay = (order, filter, today) => {
  const day = orderDay(order)
  if (filter === 'ALL') return true
  if (filter === 'TODAY') return day === today
  if (filter === 'UPCOMING') return day > today
  return day === filter
}
const isPickedDate = (filter) => /^\d{4}-\d{2}-\d{2}$/.test(filter)

// No refunds (CLIENT_REVISIONS_PLAN.md, R2): an order with any payment
// cannot be cancelled.
const hasPaid = (order) => Number(order.payment?.amountPaid ?? 0) > 0
// The one thing staff still do by hand: hand a pickup order over. Older
// orders from before payment first may also need marking ready, or
// cancelling if nothing was paid (the system does that within a minute).
function statusActions(order) {
  if (order.status === 'COMPLETED' || order.status === 'CANCELLED') return []
  const actions = []
  if (order.orderType === 'PICKUP') {
    if (statusRank[order.status] < statusRank.READY_FOR_PICKUP) actions.push({ status: 'READY_FOR_PICKUP', label: 'Ready for pickup' })
    actions.push({ status: 'COMPLETED', label: 'Picked up — complete', needsPayment: !order.payment?.isFullyPaid })
  }
  if (!hasPaid(order)) actions.push({ status: 'CANCELLED', label: 'Cancel order' })
  return actions
}
const humanize = (status) => status.replaceAll('_', ' ')

export function OrderManagement({ user, params }) {
  return user.role === 'ADMIN' || user.role === 'CASHIER' ? <StaffOrderManagement user={user} params={params} /> : <CustomerOrders user={user} />
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
                {order.isReservation && <span className="ml-1.5 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">Advanced order</span>}
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

// `params.orderId` opens that order at once — from the bell, a toast, or
// the Dashboard's Recent orders (CLIENT_REVISIONS_PLAN.md, R4).
function StaffOrderManagement({ user, params }) {
  const isCashier = user.role === 'CASHIER'
  const [activeTab, setActiveTab] = useState('Orders')

  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')

  // An order opened from elsewhere may be closed already; show every
  // status so it is in the list beside its detail.
  const [statusFilter, setStatusFilter] = useState(params?.orderId ? 'ALL' : (params?.status ?? 'OPEN'))
  // An order opened from elsewhere may be on another day; show every day
  // until a day button is pressed.
  const [dayFilter, setDayFilter] = useState(params?.orderId ? 'ALL' : (params?.day ?? 'TODAY'))
  const today = manilaDay(new Date())
  const [search, setSearch] = useState('')

  const [selectedOrderId, setSelectedOrderId] = useState(null)
  const [orderDetail, setOrderDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  // Cancelling asks for a reason first; every other action is one click.
  const [cancelling, setCancelling] = useState(false)
  const [statusNote, setStatusNote] = useState('')
  const [statusSubmitting, setStatusSubmitting] = useState(false)

  // Assign rider (the user, 2026-10-16): a delivery order waiting for a
  // driver is assigned right here, the same call Delivery Management makes.
  const [riders, setRiders] = useState([])
  const [riderChoice, setRiderChoice] = useState('')
  const [assigning, setAssigning] = useState(false)
  useEffect(() => {
    apiGet('/api/deliveries/personnel').then((data) => setRiders(data.personnel)).catch(() => setRiders([]))
  }, [])

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
      if (!matchesFilter(order, statusFilter)) return false
      if (!matchesDay(order, dayFilter, today)) return false
      if (!term) return true
      return matchesOrderSearch(order, term) || (order.customerName ?? 'walk-in').toLowerCase().includes(term)
    })
  }, [orders, statusFilter, dayFilter, today, search])

  const openOrder = async (orderId) => {
    setSelectedOrderId(orderId)
    setDetailLoading(true)
    setOrderDetail(null)
    setNotice('')
    try {
      const data = await apiGet(`/api/orders/${orderId}`)
      setOrderDetail(data.order)
      setCancelling(false)
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

  const assignRider = async () => {
    if (!riderChoice || !orderDetail?.delivery?.id) return
    setAssigning(true)
    setMessage('')
    try {
      await apiPatch(`/api/deliveries/${orderDetail.delivery.id}/assign`, { deliveryPersonnelId: riderChoice })
      const rider = riders.find((person) => String(person.id) === String(riderChoice))
      setRiderChoice('')
      await openOrder(selectedOrderId)
      await loadOrders()
      setNotice(`Order ${orderLabel(orderDetail)} assigned to ${rider?.name ?? 'the rider'}.`)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setAssigning(false)
    }
  }

  const changeStatus = async (status) => {
    setStatusSubmitting(true)
    setMessage('')
    try {
      await apiPatch(`/api/orders/${selectedOrderId}`, { status, note: status === 'CANCELLED' ? statusNote.trim() : null })
      await openOrder(selectedOrderId)
      await loadOrders()
      setNotice(`Order ${orderLabel(orderDetail)} is now ${humanize(status).toLowerCase()}.`)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setStatusSubmitting(false)
    }
  }
  const handleOrderCreated = async (orderId, createdMessage, pickupDay) => {
    setActiveTab('Orders')
    setStatusFilter('OPEN')
    // Open the list on the order's own day, so a reservation for a later
    // date is in view right after it is placed.
    setDayFilter(pickupDay && pickupDay !== today ? pickupDay : 'TODAY')
    await loadOrders()
    await openOrder(orderId)
    if (createdMessage) setNotice(createdMessage)
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
            {orderDetail.isReservation && (
              <p className="mt-1">
                <span className="font-semibold text-brand-700">Advanced order</span> · {orderDetail.guestContact}{orderDetail.guestContactVerified ? ' (verified)' : ''}{orderDetail.guestEmail ? ` · ${orderDetail.guestEmail}` : ''}
              </p>
            )}
            <p className="mt-1">Placed {formatDateTime(orderDetail.orderDate)}</p>
            {orderDetail.instructions && <p className="mt-1">Instructions: {orderDetail.instructions}</p>}
            {orderDetail.requestedFulfillmentTime && <p className="mt-1 font-semibold text-ink-900">Needed by: {formatDateTime(orderDetail.requestedFulfillmentTime)}</p>}
          </div>
          <DeliveryProgress delivery={orderDetail.delivery} />
          {orderDetail.orderType === 'DELIVERY' && orderDetail.delivery?.id && orderDetail.delivery.status === 'PENDING_ASSIGNMENT' && orderDetail.status === 'READY_FOR_DELIVERY' && (
            <div className="rounded-panel border border-line-200 p-3">
              <p className="text-xs font-semibold text-ink-700">Assign rider</p>
              {riders.length === 0 ? (
                <p className="mt-1 text-xs text-ink-500">No active riders. Add one in User Management, Staff.</p>
              ) : (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <div className="min-w-40 flex-1">
                    <Select value={riderChoice} onChange={(event) => setRiderChoice(event.target.value)} aria-label={`Rider for order ${orderLabel(orderDetail)}`}>
                      <option value="">Select a rider…</option>
                      {riders.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
                    </Select>
                  </div>
                  <Button type="button" size="sm" onClick={assignRider} disabled={assigning || !riderChoice}>{assigning ? 'Assigning…' : 'Assign rider'}</Button>
                </div>
              )}
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
            <div className="space-y-3 border-t border-line-100 pt-3">
              {statusActions(orderDetail).length === 0 ? (
                <p className="text-xs text-ink-500">
                  {orderDetail.orderType === 'DELIVERY'
                    ? 'Nothing to do by hand: it goes into production once paid, the driver marks it out for delivery and delivered, and delivered completes it.'
                    : 'Paid orders cannot be cancelled. Nothing else to do by hand.'}
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {statusActions(orderDetail).filter((action) => action.status !== 'CANCELLED').map((action) => (
                    <Button key={action.status} type="button" size="sm" onClick={() => changeStatus(action.status)} disabled={statusSubmitting || action.needsPayment}>
                      {statusSubmitting ? 'Saving…' : action.label}
                    </Button>
                  ))}
                  {statusActions(orderDetail).some((action) => action.status === 'CANCELLED') && !cancelling && (
                    <Button type="button" size="sm" variant="destructive" onClick={() => setCancelling(true)} disabled={statusSubmitting}>Cancel order</Button>
                  )}
                </div>
              )}
              {statusActions(orderDetail).some((action) => action.needsPayment) && (
                <p className="text-xs text-status-fail-fg">Record the payment in Payment &amp; Billing first — an order is completed only once fully paid.</p>
              )}
              {cancelling && (
                // A cancellation needs a reason (PHASE10 B7); it is kept in
                // the status history below. Unpaid orders only: the
                // bakery gives no refunds.
                <div className="space-y-2 rounded-panel border border-line-200 p-3">
                  <Input value={statusNote} onChange={(event) => setStatusNote(event.target.value)} placeholder="Reason for cancelling (required)" aria-label="Reason for cancelling" />
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="destructive" onClick={() => changeStatus('CANCELLED')} disabled={statusSubmitting || statusNote.trim().length < 5}>
                      {statusSubmitting ? 'Cancelling…' : 'Confirm cancel'}
                    </Button>
                    <Button type="button" size="sm" variant="secondary" onClick={() => { setCancelling(false); setStatusNote('') }}>Keep the order</Button>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      ) : null}
    </Card>
  )

  return (
    <section className="min-w-0 flex-1 px-4 pb-10 sm:px-7">
      {/* The account page already says whose it is; the portal label is for staff. */}
      {user.role !== 'CUSTOMER' && <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-600">{user.role} PORTAL</p>}
      <h1 className="mt-1 text-2xl font-semibold text-ink-900">Order Management</h1>
      <p className="mt-2 text-sm text-ink-500">{isCashier ? 'Ring up a walk-in customer, or manage every order already placed.' : 'Every order placed, pickup and delivery.'}</p>

      {isCashier && (
        <div className="mt-6 flex gap-2">
          {['Orders', 'Walk-in'].map((tab) => (
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
            </div>
          </div>
          <div role="group" aria-label="Filter by day" className="mt-3 flex flex-wrap gap-1.5">
            {dayFilters.map((filter) => {
              const count = orders.filter((order) => matchesDay(order, filter.key, today) && matchesFilter(order, statusFilter)).length
              return (
                <Button key={filter.key} type="button" size="sm" variant={dayFilter === filter.key ? 'primary' : 'secondary'} aria-pressed={dayFilter === filter.key} onClick={() => setDayFilter(filter.key)}>
                  {filter.label} <span className="tabular-nums opacity-70">{count}</span>
                </Button>
              )
            })}
            <label className="flex items-center gap-1.5 text-xs text-ink-500">
              Date
              <Input type="date" value={isPickedDate(dayFilter) ? dayFilter : ''} min={today} onChange={(event) => setDayFilter(event.target.value || 'TODAY')} aria-label="Show the orders for one date" className="w-40" />
            </label>
          </div>
          <div role="group" aria-label="Filter by status" className="mt-2 flex flex-wrap gap-1.5">
            {statusFilters.map((filter) => {
              const count = orders.filter((order) => matchesDay(order, dayFilter, today) && matchesFilter(order, filter.key)).length
              return (
                <Button key={filter.key} type="button" size="sm" variant={statusFilter === filter.key ? 'primary' : 'secondary'} aria-pressed={statusFilter === filter.key} onClick={() => setStatusFilter(filter.key)}>
                  {filter.label} <span className="tabular-nums opacity-70">{count}</span>
                </Button>
              )
            })}
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
                        <Td>{order.customerName ?? 'Walk-in'}{order.isReservation && <span className="ml-1.5 text-xs font-semibold text-brand-700">Advanced order</span>}</Td>
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
        <div hidden={activeTab !== 'Walk-in'}>
          <WalkInOrderForm onCreated={handleOrderCreated} />
        </div>
      )}
    </section>
  )
}

function CustomerOrders({ user }) {
  const [orders, setOrders] = useState(null)
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')

  const [selectedOrderId, setSelectedOrderId] = useState(null)
  const [orderDetail, setOrderDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
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
            <StatusBadge status={orderDetail.status} />
          </div>
          {orderDetail.instructions && <p className="text-xs text-ink-500">Instructions: {orderDetail.instructions}</p>}
          {orderDetail.requestedFulfillmentTime && <p className="text-xs text-ink-500">Needed by: <span className="font-semibold text-ink-900">{formatDateTime(orderDetail.requestedFulfillmentTime)}</span></p>}
          {/* Where a delivery order actually stands — deliveries.status,
              which orders.status stops short of (it never reaches
              DELIVERED; staff mark COMPLETED separately once paid). */}
          <DeliveryProgress delivery={orderDetail.delivery} />

          <OrderItems order={orderDetail} />

          {orderDetail.payment && orderDetail.status !== 'CANCELLED' && orderDetail.payment.isFullyPaid && (
            <p className="rounded-panel border border-line-200 bg-surface-warm p-3 text-sm font-semibold text-status-done-fg">Paid</p>
          )}

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
