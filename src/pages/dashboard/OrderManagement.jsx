import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiGet, apiPatch } from '../../api/client.js'
import { NewOrderForm } from './NewOrderForm.jsx'

const statusOptions = ['PLACED', 'CONFIRMED', 'IN_PRODUCTION', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED']
const statusStyles = {
  PLACED: 'bg-amber-50 text-amber-800',
  CONFIRMED: 'bg-blue-50 text-blue-800',
  IN_PRODUCTION: 'bg-indigo-50 text-indigo-800',
  READY_FOR_PICKUP: 'bg-teal-50 text-teal-800',
  OUT_FOR_DELIVERY: 'bg-teal-50 text-teal-800',
  COMPLETED: 'bg-green-50 text-green-800',
  CANCELLED: 'bg-red-50 text-red-700',
}
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
      <p className="text-sm font-semibold text-green-700">{user.role} PORTAL</p>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">Order Management</h1>
      <p className="mt-2 text-sm text-slate-500">{isCashier ? 'Take an order at the counter, or manage every order already placed.' : 'Every order placed, pickup and delivery.'}</p>

      {isCashier && (
        <div className="mt-6 flex gap-2">
          {['Orders', 'New order'].map((tab) => (
            <button type="button" key={tab} onClick={() => setActiveTab(tab)} className={`rounded-full px-4 py-2 text-xs font-bold transition ${activeTab === tab ? 'bg-green-700 text-white' : 'bg-green-50 text-green-800 hover:bg-green-100'}`}>{tab}</button>
          ))}
        </div>
      )}

      {message && <p role="status" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-[10px] font-semibold text-red-700">{message}</p>}

      <div hidden={activeTab !== 'Orders'} className="mt-7 grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        {/* Order list */}
        <div className="rounded-2xl border border-green-100 bg-white p-6">
          <h2 className="text-lg font-bold">All orders</h2>
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
                    <th className="py-2 pr-4 font-bold">Customer</th>
                    <th className="py-2 pr-4 font-bold">Total</th>
                    <th className="py-2 pr-4 font-bold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orders.map((order) => (
                    <tr key={order.id} onClick={() => openOrder(order.id)} className={`cursor-pointer transition hover:bg-green-50 ${selectedOrderId === order.id ? 'bg-green-50' : ''}`}>
                      <td className="py-3 pr-4 font-semibold text-slate-800">#{order.id}</td>
                      <td className="py-3 pr-4 text-slate-600">{order.customerName ?? 'Walk-in'}</td>
                      <td className="py-3 pr-4 text-slate-600">₱{order.totalAmount}</td>
                      <td className="py-3 pr-4"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${statusStyles[order.status] ?? 'bg-slate-100 text-slate-700'}`}>{order.status.replaceAll('_', ' ')}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Selected order detail */}
        <div className="rounded-2xl border border-green-100 bg-white p-6">
          <h2 className="text-lg font-bold">Order detail</h2>
          {!selectedOrderId ? (
            <p className="mt-4 text-sm text-slate-500">Select an order to view its details.</p>
          ) : detailLoading ? (
            <p className="mt-4 text-sm text-slate-500">Loading…</p>
          ) : orderDetail ? (
            <div className="mt-4 space-y-4">
              <div className="text-xs text-slate-600">
                <p><strong className="text-slate-800">Order #{orderDetail.id}</strong> · {orderDetail.orderType}</p>
                <p className="mt-1">Customer: {orderDetail.customerName ?? 'Walk-in'}{orderDetail.cashierName ? ` · Processed by ${orderDetail.cashierName}` : ''}</p>
                {orderDetail.instructions && <p className="mt-1">Instructions: {orderDetail.instructions}</p>}
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
                <p className="mt-1.5 text-right text-xs font-bold text-slate-800">Total: ₱{orderDetail.totalAmount}</p>
              </div>

              {orderDetail.status === 'CANCELLED' || orderDetail.status === 'COMPLETED' ? (
                <p className="border-t border-slate-100 pt-3 text-xs text-slate-500">This order is {orderDetail.status.toLowerCase()} and can no longer be changed.</p>
              ) : (
                <form className="space-y-2 border-t border-slate-100 pt-3" onSubmit={handleStatusSubmit}>
                  <label htmlFor="order-status" className="block text-[11px] font-extrabold">Update status</label>
                  <select id="order-status" value={statusChoice} onChange={(event) => setStatusChoice(event.target.value)} className="w-full rounded-xl border border-stone-200 px-3 py-2 text-xs outline-none focus:border-green-700">
                    {statusOptions.map((status) => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}
                  </select>
                  <input value={statusNote} onChange={(event) => setStatusNote(event.target.value)} placeholder="Optional note" className="w-full rounded-xl border border-stone-200 px-3 py-2 text-xs outline-none focus:border-green-700" />
                  <button type="submit" disabled={statusSubmitting} className="rounded-xl bg-green-700 px-4 py-2 text-xs font-bold text-white transition hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-60">{statusSubmitting ? 'Saving…' : 'Save status'}</button>
                </form>
              )}

              <div>
                <p className="text-[11px] font-extrabold text-slate-500">Status history</p>
                <ul className="mt-1.5 space-y-1 text-xs text-slate-600">
                  {orderDetail.statusHistory.map((entry, index) => (
                    <li key={index}>
                      <span className="font-semibold text-slate-800">{entry.status.replaceAll('_', ' ')}</span> by {entry.updatedByName} — {new Date(entry.updatedAt).toLocaleString()}
                      {entry.note && <span className="block text-slate-500">"{entry.note}"</span>}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}
        </div>
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
      <p className="text-sm font-semibold text-green-700">{user.role} PORTAL</p>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">My Orders</h1>
      <p className="mt-2 text-sm text-slate-500">Everything you've ordered, and where it stands right now.</p>

      {message && <p role="status" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-[10px] font-semibold text-red-700">{message}</p>}

      <div className="mt-7 grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="rounded-2xl border border-green-100 bg-white p-6">
          <h2 className="text-lg font-bold">Your orders</h2>
          {loading ? (
            <p className="mt-4 text-sm text-slate-500">Loading…</p>
          ) : orders.length === 0 ? (
            <div className="mt-4 rounded-xl bg-[#fbfbdc] p-5 text-center">
              <p className="text-sm text-slate-600">You haven't placed an order yet.</p>
              <Link to="/menu" className="mt-3 inline-block rounded-full bg-green-700 px-4 py-2 text-xs font-bold text-white transition hover:bg-green-800">Browse the menu</Link>
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-slate-100">
              {orders.map((order) => (
                <li key={order.id}>
                  <button
                    type="button"
                    onClick={() => openOrder(order.id)}
                    className={`w-full rounded-xl px-3 py-3 text-left transition hover:bg-green-50 ${selectedOrderId === order.id ? 'bg-green-50' : ''}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-bold text-slate-800">Order #{order.id}</span>
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${statusStyles[order.status] ?? 'bg-slate-100 text-slate-700'}`}>{order.status.replaceAll('_', ' ')}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                      <span>{new Date(order.orderDate).toLocaleDateString()}</span>
                      <span className="font-semibold text-slate-700">₱{order.totalAmount}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Selected order detail */}
        <div className="rounded-2xl border border-green-100 bg-white p-6">
          <h2 className="text-lg font-bold">Order detail</h2>
          {!selectedOrderId ? (
            <p className="mt-4 text-sm text-slate-500">Select an order to see its items and status.</p>
          ) : detailLoading ? (
            <p className="mt-4 text-sm text-slate-500">Loading…</p>
          ) : orderDetail ? (
            <div className="mt-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-600"><strong className="text-slate-800">Order #{orderDetail.id}</strong> · {orderDetail.orderType}</p>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${statusStyles[orderDetail.status] ?? 'bg-slate-100 text-slate-700'}`}>{orderDetail.status.replaceAll('_', ' ')}</span>
              </div>
              {orderDetail.instructions && <p className="text-xs text-slate-600">Instructions: {orderDetail.instructions}</p>}

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
                <p className="mt-1.5 text-right text-xs font-bold text-slate-800">Total: ₱{orderDetail.totalAmount}</p>
              </div>

              {orderDetail.status === 'PLACED' && (
                <div className="border-t border-slate-100 pt-3">
                  <button type="button" onClick={cancelOrder} disabled={cancelling} className="rounded-xl bg-red-50 px-4 py-2 text-xs font-bold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60">{cancelling ? 'Cancelling…' : 'Cancel this order'}</button>
                  <p className="mt-1.5 text-[10px] text-slate-400">You can cancel while your order is still PLACED — once we start on it, ask staff directly.</p>
                </div>
              )}

              <div>
                <p className="text-[11px] font-extrabold text-slate-500">Status history</p>
                <ul className="mt-1.5 space-y-1 text-xs text-slate-600">
                  {orderDetail.statusHistory.map((entry, index) => (
                    <li key={index}>
                      <span className="font-semibold text-slate-800">{entry.status.replaceAll('_', ' ')}</span> — {new Date(entry.updatedAt).toLocaleString()}
                      {entry.note && <span className="block text-slate-500">"{entry.note}"</span>}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}
