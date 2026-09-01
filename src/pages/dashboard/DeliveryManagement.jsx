// Import state management for the staff delivery queue, assignment, and
// the admin-only retry action.
import { useEffect, useState } from 'react'
import { apiGet, apiPatch } from '../../api/client.js'
import { MyDeliveries } from './MyDeliveries.jsx'

const statusOptions = ['PENDING_ASSIGNMENT', 'ASSIGNED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED']
const statusStyles = {
  PENDING_ASSIGNMENT: 'bg-amber-50 text-amber-800',
  ASSIGNED: 'bg-blue-50 text-blue-800',
  OUT_FOR_DELIVERY: 'bg-teal-50 text-teal-800',
  DELIVERED: 'bg-green-50 text-green-800',
  FAILED: 'bg-red-50 text-red-700',
}

// Dispatches Phase 7's single 'Delivery Management' nav entry (see
// modules.js) to one of two completely different screens depending on
// role, the same "one module, role decides the content" shape
// Dashboard.jsx already uses for OrderManagement's customer/staff split.
// A DELIVERY_PERSONNEL gets their own workflow — MyDeliveries.jsx — while
// ADMIN/CASHIER get StaffDeliveryView below. Kept as a plain dispatcher
// with NO hooks of its own: StaffDeliveryView holds all of the staff
// view's state instead, so each rendered component has its own fixed,
// unconditional hook order — an early return ahead of a useState call in
// ONE component, switched by a prop that can change, is exactly the shape
// React's rules of hooks exist to rule out.
export function DeliveryManagement({ user }) {
  if (user.role === 'DELIVERY PERSONNEL') return <MyDeliveries user={user} />
  return <StaffDeliveryView user={user} />
}

// The staff side of Phase 7's Delivery Management module (see
// PHASE7_PLAN.md) — the assignment queue and every delivery's state, for
// ADMIN and CASHIER.
function StaffDeliveryView({ user }) {
  const isAdmin = user.role === 'ADMIN'

  const [deliveries, setDeliveries] = useState([])
  const [personnel, setPersonnel] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [message, setMessage] = useState('')
  const [messageFailed, setMessageFailed] = useState(false)

  const [assignChoice, setAssignChoice] = useState({})
  const [retryNotes, setRetryNotes] = useState({})
  const [busyId, setBusyId] = useState(null)

  const [expandedProofsId, setExpandedProofsId] = useState(null)
  const [proofsById, setProofsById] = useState({})

  const loadDeliveries = async () => {
    setLoading(true)
    try {
      const data = await apiGet(`/api/deliveries${statusFilter ? `?status=${statusFilter}` : ''}`)
      setDeliveries(data.deliveries)
    } catch (error) {
      setMessage(error.message)
      setMessageFailed(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDeliveries()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter])

  useEffect(() => {
    apiGet('/api/deliveries/personnel').then((data) => setPersonnel(data.personnel)).catch((error) => setMessage(error.message))
  }, [])

  const handleAssign = async (deliveryId) => {
    const deliveryPersonnelId = assignChoice[deliveryId]
    if (!deliveryPersonnelId) return
    setBusyId(deliveryId)
    setMessage('')
    try {
      await apiPatch(`/api/deliveries/${deliveryId}/assign`, { deliveryPersonnelId })
      setMessage('Delivery assigned.')
      setMessageFailed(false)
      await loadDeliveries()
    } catch (error) {
      setMessage(error.message)
      setMessageFailed(true)
    } finally {
      setBusyId(null)
    }
  }

  // Both admin recovery transitions share one handler, because from the
  // screen's point of view they are one workflow in two steps: RECALL a
  // delivery its driver can no longer finish (-> FAILED), then RETRY it
  // back into the queue (-> PENDING_ASSIGNMENT) for someone else. Each
  // has to say why; the backend refuses either without a note.
  const handleAdminTransition = async (deliveryId, status) => {
    const note = retryNotes[deliveryId]
    if (!note) {
      setMessage(status === 'FAILED' ? 'Explain why this delivery is being recalled.' : 'Explain why this delivery is being retried.')
      setMessageFailed(true)
      return
    }
    setBusyId(deliveryId)
    setMessage('')
    try {
      await apiPatch(`/api/deliveries/${deliveryId}/status`, { status, note })
      setRetryNotes({ ...retryNotes, [deliveryId]: '' })
      setMessage(status === 'FAILED' ? 'Delivery recalled from its driver.' : 'Delivery sent back to the assignment queue.')
      setMessageFailed(false)
      await loadDeliveries()
    } catch (error) {
      setMessage(error.message)
      setMessageFailed(true)
    } finally {
      setBusyId(null)
    }
  }

  const toggleProofs = async (deliveryId) => {
    if (expandedProofsId === deliveryId) {
      setExpandedProofsId(null)
      return
    }
    setExpandedProofsId(deliveryId)
    if (!proofsById[deliveryId]) {
      try {
        const data = await apiGet(`/api/deliveries/${deliveryId}/proof`)
        setProofsById({ ...proofsById, [deliveryId]: data.proofs })
      } catch (error) {
        setMessage(error.message)
        setMessageFailed(true)
      }
    }
  }

  return (
    <section className="min-w-0 flex-1 px-4 pb-10 pt-24 sm:px-7 md:pt-9">
      <p className="text-sm font-semibold text-green-700">{user.role} PORTAL</p>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">Delivery Management</h1>
      <p className="mt-2 text-sm text-slate-500">Assign drivers to delivery orders and track each one through to delivered. No GPS tracking — this is a status workflow, not a live map.</p>

      {message && <p role="status" className={`mt-4 rounded-lg px-3 py-2 text-[10px] font-semibold ${messageFailed ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-800'}`}>{message}</p>}

      <div className="mt-7 rounded-2xl border border-green-100 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Deliveries</h2>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-xl border border-stone-200 px-3 py-2 text-xs outline-none focus:border-green-700">
            <option value="">All statuses</option>
            {statusOptions.map((status) => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}
          </select>
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-slate-500">Loading…</p>
        ) : deliveries.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No deliveries match this filter.</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {deliveries.map((delivery) => (
              <li key={delivery.id} className="rounded-xl border border-slate-100 p-4 text-xs">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-800">Order #{delivery.orderId} · {delivery.customerName ?? 'Customer'} · ₱{delivery.totalAmount}</p>
                    <p className="mt-1 text-slate-600">{delivery.address.recipientName} · {delivery.address.contactNumber}</p>
                    <p className="mt-0.5 text-slate-500">
                      {delivery.address.addressLine1}{delivery.address.addressLine2 && `, ${delivery.address.addressLine2}`}
                      {delivery.address.barangay && `, ${delivery.address.barangay}`}, {delivery.address.municipality}, {delivery.address.province}
                    </p>
                    <p className="mt-1 text-slate-500">
                      Order status: {delivery.orderStatus.replaceAll('_', ' ')}
                      {delivery.deliveryPersonnelName && ` · Driver: ${delivery.deliveryPersonnelName}`}
                    </p>
                    {delivery.note && <p className="mt-0.5 text-slate-500">Note: "{delivery.note}"</p>}
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${statusStyles[delivery.status] ?? 'bg-slate-100 text-slate-700'}`}>{delivery.status.replaceAll('_', ' ')}</span>
                </div>

                {delivery.status === 'PENDING_ASSIGNMENT' && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                    <select value={assignChoice[delivery.id] ?? ''} onChange={(event) => setAssignChoice({ ...assignChoice, [delivery.id]: event.target.value })} className="rounded-lg border border-stone-200 px-2 py-1.5 text-[11px] outline-none focus:border-green-700">
                      <option value="">Select a driver…</option>
                      {personnel.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
                    </select>
                    <button type="button" onClick={() => handleAssign(delivery.id)} disabled={busyId === delivery.id || !assignChoice[delivery.id]} className="rounded-lg bg-green-700 px-2.5 py-1.5 text-[10px] font-bold text-white transition hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-60">Assign</button>
                  </div>
                )}

                {delivery.status === 'FAILED' && isAdmin && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                    <input value={retryNotes[delivery.id] ?? ''} onChange={(event) => setRetryNotes({ ...retryNotes, [delivery.id]: event.target.value })} placeholder="Why is this being retried?" className="flex-1 rounded-lg border border-stone-200 px-2 py-1.5 text-[11px] outline-none focus:border-green-700" />
                    <button type="button" onClick={() => handleAdminTransition(delivery.id, 'PENDING_ASSIGNMENT')} disabled={busyId === delivery.id} className="rounded-lg border border-green-700 px-2.5 py-1.5 text-[10px] font-bold text-green-800 transition hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-60">Retry</button>
                  </div>
                )}

                {/* Every forward transition belongs to the ONE driver holding
                    the delivery, so a driver who can no longer act — account
                    deactivated, phone lost, left the job — used to strand it
                    with no way for anyone to move or reassign it. Recalling
                    it here fails the attempt, which puts it back in reach of
                    the Retry control above. */}
                {(delivery.status === 'ASSIGNED' || delivery.status === 'OUT_FOR_DELIVERY') && isAdmin && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                    <input value={retryNotes[delivery.id] ?? ''} onChange={(event) => setRetryNotes({ ...retryNotes, [delivery.id]: event.target.value })} placeholder="Why is this being recalled from its driver?" className="flex-1 rounded-lg border border-stone-200 px-2 py-1.5 text-[11px] outline-none focus:border-green-700" />
                    <button type="button" onClick={() => handleAdminTransition(delivery.id, 'FAILED')} disabled={busyId === delivery.id} className="rounded-lg bg-red-50 px-2.5 py-1.5 text-[10px] font-bold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60">Recall from driver</button>
                  </div>
                )}

                {delivery.proofCount > 0 && (
                  <div className="mt-3 border-t border-slate-100 pt-3">
                    <button type="button" onClick={() => toggleProofs(delivery.id)} className="text-[11px] font-bold text-green-800 hover:underline">{expandedProofsId === delivery.id ? 'Hide' : 'View'} proof of delivery ({delivery.proofCount})</button>
                    {expandedProofsId === delivery.id && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {(proofsById[delivery.id] ?? []).map((proof) => (
                          <a key={proof.id} href={`/api/deliveries/${delivery.id}/proof/${proof.id}`} target="_blank" rel="noreferrer">
                            <img src={`/api/deliveries/${delivery.id}/proof/${proof.id}`} alt={proof.fileName} className="h-20 w-20 rounded-lg border border-slate-200 object-cover" />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
