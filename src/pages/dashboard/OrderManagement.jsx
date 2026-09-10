import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiGet, apiPatch } from '../../api/client.js'
import { Alert } from '../../components/ui/Alert.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Card } from '../../components/ui/Card.jsx'
import { EmptyState } from '../../components/ui/EmptyState.jsx'
import { Field } from '../../components/ui/Field.jsx'
import { Input } from '../../components/ui/Input.jsx'
import { Select } from '../../components/ui/Select.jsx'
import { StatusBadge } from '../../components/ui/StatusBadge.jsx'
import { Table, Tbody, Td, Th, Thead, Tr } from '../../components/ui/Table.jsx'
import { NewOrderForm } from './NewOrderForm.jsx'

// Stage 3 (RULES-PLANS/UI_AUDIT.md) — the busiest staff screen. Three
// findings converge here:
//   C2 (CRITICAL) — the order list's <tr onClick=…> and the customer's
//     order list below were, per the audit, mouse-only: a <tr> has no
//     keyboard semantics. See the comments at each row for the fix.
//   C3 — the error banner was `role="status"` at 10px, the least
//     readable text on the page for the moment it matters most. Replaced
//     by <Alert variant="error"> everywhere in this file.
//   H7 — statusStyles was one of six copy-pasted badge maps app-wide.
//     Replaced by the shared <StatusBadge>.
// Behaviour (which orders load, what a status change does, the
// cashier-only "New order" tab, cancellation) is unchanged — this is a
// presentation and accessibility pass, same as CustomerManagement.jsx's
// Stage 1 conversion.
const statusOptions = ['PLACED', 'CONFIRMED', 'IN_PRODUCTION', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED']

export function OrderManagement({ user }) {
  return user.role === 'ADMIN' || user.role === 'CASHIER' ? <StaffOrderManagement user={user} /> : <CustomerOrders user={user} />
}

function StaffOrderManagement({ user }) {
  const isCashier = user.role === 'CASHIER'
  const [activeTab, setActiveTab] = useState('Orders')

  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

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

  const openOrder = async (orderId) => {
    setSelectedOrderId(orderId)
    setDetailLoading(true)
    setOrderDetail(null)
    try {
      const data = await apiGet(`/api/orders/${orderId}`)
      setOrderDetail(data.order)
      setStatusChoice(data.order.status)
      setStatusNote('')
    } catch (error) {
      setMessage(error.message)
    } finally {
      setDetailLoading(false)
    }
  }

  const handleStatusSubmit = async (event) => {
    event.preventDefault()
    setStatusSubmitting(true)
    try {
      await apiPatch(`/api/orders/${selectedOrderId}`, { status: statusChoice, note: statusNote || null })
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
    await loadOrders()
    await openOrder(orderId)
  }

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

      {/* C3: was `role="status"` at text-[10px] — a polite, hard-to-read
          announcement for the most important text on a failed action.
          <Alert variant="error"> is role="alert" (assertive) at 14px. */}
      {message && (
        <div className="mt-4">
          <Alert variant="error">{message}</Alert>
        </div>
      )}

      <div hidden={activeTab !== 'Orders'} className="mt-7 grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        {/* Order list */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-ink-900">All orders</h2>
          {loading ? (
            <p className="mt-4 text-sm text-ink-500">Loading…</p>
          ) : orders.length === 0 ? (
            <EmptyState title="No orders yet" />
          ) : (
            <div className="mt-4">
              <Table caption="All orders">
                <Thead>
                  <Tr className="hover:bg-transparent">
                    <Th>Order</Th>
                    <Th>Customer</Th>
                    <Th align="right">Total</Th>
                    <Th>Status</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {orders.map((order) => (
                    // C2 fix: the row's onClick stays as a mouse
                    // convenience, but the primary action — opening the
                    // order — now also lives on a real <button> in the
                    // first cell (below), carrying an accessible name.
                    // That is what actually gets this row focus,
                    // Enter/Space, and screen-reader semantics; a <tr>
                    // itself has none of those regardless of onClick.
                    <Tr key={order.id} onClick={() => openOrder(order.id)} className={`cursor-pointer ${selectedOrderId === order.id ? 'bg-brand-50' : ''}`}>
                      <Td>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation() // don't also fire the Tr's onClick above
                            openOrder(order.id)
                          }}
                          aria-label={`Open order #${order.id}`}
                          className="font-semibold text-ink-900 hover:underline focus-visible:underline"
                        >
                          #{order.id}
                        </button>
                      </Td>
                      <Td>{order.customerName ?? 'Walk-in'}</Td>
                      <Td numeric>₱{order.totalAmount}</Td>
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

        {/* Selected order detail */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-ink-900">Order detail</h2>
          {!selectedOrderId ? (
            <p className="mt-4 text-sm text-ink-500">Select an order to view its details.</p>
          ) : detailLoading ? (
            <p className="mt-4 text-sm text-ink-500">Loading…</p>
          ) : orderDetail ? (
            <div className="mt-4 space-y-4">
              <div className="text-xs text-ink-500">
                <p>
                  <strong className="text-ink-900">Order #{orderDetail.id}</strong> · {orderDetail.orderType}
                </p>
                <p className="mt-1">
                  Customer: {orderDetail.customerName ?? 'Walk-in'}
                  {orderDetail.cashierName ? ` · Processed by ${orderDetail.cashierName}` : ''}
                </p>
                {orderDetail.instructions && <p className="mt-1">Instructions: {orderDetail.instructions}</p>}
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
                <p className="mt-1.5 text-right text-sm font-semibold text-ink-900 tabular-nums">Total: ₱{orderDetail.totalAmount}</p>
              </div>

              {orderDetail.status === 'CANCELLED' || orderDetail.status === 'COMPLETED' ? (
                <p className="border-t border-line-100 pt-3 text-sm text-ink-500">This order is {orderDetail.status.toLowerCase()} and can no longer be changed.</p>
              ) : (
                <form className="space-y-3 border-t border-line-100 pt-3" onSubmit={handleStatusSubmit}>
                  <Field label="Update status">
                    <Select value={statusChoice} onChange={(event) => setStatusChoice(event.target.value)}>
                      {statusOptions.map((status) => (
                        <option key={status} value={status}>
                          {status.replaceAll('_', ' ')}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Input value={statusNote} onChange={(event) => setStatusNote(event.target.value)} placeholder="Optional note" aria-label="Status note" />
                  <Button type="submit" size="sm" disabled={statusSubmitting}>
                    {statusSubmitting ? 'Saving…' : 'Save status'}
                  </Button>
                </form>
              )}

              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">Status history</p>
                <ul className="mt-1.5 space-y-1 text-sm text-ink-500">
                  {orderDetail.statusHistory.map((entry, index) => (
                    <li key={index}>
                      <span className="font-semibold text-ink-900">{entry.status.replaceAll('_', ' ')}</span> by {entry.updatedByName} — {new Date(entry.updatedAt).toLocaleString()}
                      {entry.note && <span className="block text-ink-500">"{entry.note}"</span>}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}
        </Card>
      </div>

      {isCashier && (
        <div hidden={activeTab !== 'New order'}>
          <NewOrderForm onCreated={handleOrderCreated} />
        </div>
      )}
    </section>
  )
}

function CustomerOrders({ user }) {
  const [orders, setOrders] = useState(null)
  const [message, setMessage] = useState('')

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
    try {
      const data = await apiGet(`/api/orders/${orderId}`)
      setOrderDetail(data.order)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setDetailLoading(false)
    }
  }

  const cancelOrder = async () => {
    if (!window.confirm(`Cancel order #${selectedOrderId}? This cannot be undone.`)) return
    setCancelling(true)
    setMessage('')
    try {
      await apiPatch(`/api/orders/${selectedOrderId}`, { status: 'CANCELLED' })
      await openOrder(selectedOrderId)
      await loadOrders()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setCancelling(false)
    }
  }

  const loading = orders === null

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
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-ink-900">Your orders</h2>
          {loading ? (
            <p className="mt-4 text-sm text-ink-500">Loading…</p>
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
            // C2, second site: this list already rendered each row as a
            // real <button> (not a <tr onClick>), which is already
            // focusable and already fires on Enter/Space — the part of
            // C2 the audit is about. Nothing structural to fix here; the
            // change in this file is only retokening colours/badges to
            // match the rest of the Stage 3 pass.
            <ul className="mt-4 divide-y divide-line-100">
              {orders.map((order) => (
                <li key={order.id}>
                  <button
                    type="button"
                    onClick={() => openOrder(order.id)}
                    aria-label={`Open order #${order.id}`}
                    className={`w-full rounded-control px-3 py-3 text-left transition hover:bg-surface-sunk ${selectedOrderId === order.id ? 'bg-brand-50' : ''}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-ink-900">Order #{order.id}</span>
                      <StatusBadge status={order.status} />
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs text-ink-500">
                      <span>{new Date(order.orderDate).toLocaleDateString()}</span>
                      <span className="font-medium text-ink-700 tabular-nums">₱{order.totalAmount}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Selected order detail */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-ink-900">Order detail</h2>
          {!selectedOrderId ? (
            <p className="mt-4 text-sm text-ink-500">Select an order to see its items and status.</p>
          ) : detailLoading ? (
            <p className="mt-4 text-sm text-ink-500">Loading…</p>
          ) : orderDetail ? (
            <div className="mt-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-ink-500">
                  <strong className="text-ink-900">Order #{orderDetail.id}</strong> · {orderDetail.orderType}
                </p>
                <StatusBadge status={orderDetail.status} />
              </div>
              {orderDetail.instructions && <p className="text-xs text-ink-500">Instructions: {orderDetail.instructions}</p>}

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
                <p className="mt-1.5 text-right text-sm font-semibold text-ink-900 tabular-nums">Total: ₱{orderDetail.totalAmount}</p>
              </div>

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
                      <span className="font-semibold text-ink-900">{entry.status.replaceAll('_', ' ')}</span> — {new Date(entry.updatedAt).toLocaleString()}
                      {entry.note && <span className="block text-ink-500">"{entry.note}"</span>}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}
        </Card>
      </div>
    </section>
  )
}
