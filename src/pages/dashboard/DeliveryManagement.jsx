import { useEffect, useState } from 'react'
import { apiGet, apiPatch } from '../../api/client.js'
import { Alert } from '../../components/ui/Alert.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Card } from '../../components/ui/Card.jsx'
import { EmptyState } from '../../components/ui/EmptyState.jsx'
import { Input } from '../../components/ui/Input.jsx'
import { Select } from '../../components/ui/Select.jsx'
import { StatusBadge } from '../../components/ui/StatusBadge.jsx'
import { MyDeliveries } from './MyDeliveries.jsx'

const statusOptions = ['PENDING_ASSIGNMENT', 'ASSIGNED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED']

export function DeliveryManagement({ user }) {
  if (user.role === 'DELIVERY PERSONNEL') return <MyDeliveries user={user} />
  return <StaffDeliveryView user={user} />
}

// Stage 5 (RULES-PLANS/UI_AUDIT.md) — this is the staff half of the
// delivery role (ADMIN/CASHIER's assignment queue); MyDeliveries.jsx is the
// driver's mobile-first half. H7's local statusStyles is gone in favour of
// the shared <StatusBadge>, and the hand-rolled inputs/buttons are now
// Button/Input/Select from the kit, matching PaymentBilling/
// InventoryRequests. This screen stays desktop-oriented (it's a staff
// assignment queue, not a field tool) but the existing flex-wrap layout
// already keeps it from breaking at narrow widths, so nothing structural
// changed there.
//
// Untouched: the status transition rules/order and the one-directional
// deliveries.status -> orders.status sync (PHASE7_PLAN.md). This is
// presentation only.
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
    <section className="min-w-0 flex-1 px-4 pb-10 sm:px-7">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-600">{user.role} PORTAL</p>
      <h1 className="mt-1 text-2xl font-semibold text-ink-900">Delivery Management</h1>
      <p className="mt-2 text-sm text-ink-500">Assign drivers to delivery orders and track each one through to delivered. No GPS tracking — this is a status workflow, not a live map.</p>

      {message && (
        <div className="mt-4">
          <Alert variant={messageFailed ? 'error' : 'success'}>{message}</Alert>
        </div>
      )}

      <Card className="mt-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-ink-900">Deliveries</h2>
          <div className="w-full sm:w-56">
            <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by status">
              <option value="">All statuses</option>
              {statusOptions.map((status) => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}
            </Select>
          </div>
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-ink-500">Loading…</p>
        ) : deliveries.length === 0 ? (
          <EmptyState title="No deliveries match this filter." />
        ) : (
          <ul className="mt-4 space-y-4">
            {deliveries.map((delivery) => (
              <li key={delivery.id} className="rounded-panel border border-line-200 p-4 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-ink-900">Order #{delivery.orderId} · {delivery.customerName ?? 'Customer'} · <span className="tabular-nums">₱{delivery.totalAmount}</span></p>
                    <p className="mt-1 text-ink-500">{delivery.address.recipientName} · {delivery.address.contactNumber}</p>
                    <p className="mt-0.5 text-xs text-ink-500">
                      {delivery.address.addressLine1}{delivery.address.addressLine2 && `, ${delivery.address.addressLine2}`}
                      {delivery.address.barangay && `, ${delivery.address.barangay}`}, {delivery.address.municipality}, {delivery.address.province}
                    </p>
                    <p className="mt-1 text-xs text-ink-500">
                      Order status: {delivery.orderStatus.replaceAll('_', ' ')}
                      {delivery.deliveryPersonnelName && ` · Driver: ${delivery.deliveryPersonnelName}`}
                    </p>
                    {delivery.note && <p className="mt-0.5 text-xs text-ink-500">Note: "{delivery.note}"</p>}
                  </div>
                  <StatusBadge status={delivery.status} />
                </div>

                {delivery.status === 'PENDING_ASSIGNMENT' && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line-100 pt-3">
                    <div className="min-w-40 flex-1">
                      <Select value={assignChoice[delivery.id] ?? ''} onChange={(event) => setAssignChoice({ ...assignChoice, [delivery.id]: event.target.value })} aria-label={`Assign a driver for order #${delivery.orderId}`}>
                        <option value="">Select a driver…</option>
                        {personnel.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
                      </Select>
                    </div>
                    <Button type="button" size="sm" onClick={() => handleAssign(delivery.id)} disabled={busyId === delivery.id || !assignChoice[delivery.id]}>Assign</Button>
                  </div>
                )}

                {delivery.status === 'FAILED' && isAdmin && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line-100 pt-3">
                    <Input value={retryNotes[delivery.id] ?? ''} onChange={(event) => setRetryNotes({ ...retryNotes, [delivery.id]: event.target.value })} placeholder="Why is this being retried?" aria-label={`Retry note for order #${delivery.orderId}`} className="flex-1" />
                    <Button type="button" size="sm" variant="secondary" onClick={() => handleAdminTransition(delivery.id, 'PENDING_ASSIGNMENT')} disabled={busyId === delivery.id}>Retry</Button>
                  </div>
                )}
                {(delivery.status === 'ASSIGNED' || delivery.status === 'OUT_FOR_DELIVERY') && isAdmin && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line-100 pt-3">
                    <Input value={retryNotes[delivery.id] ?? ''} onChange={(event) => setRetryNotes({ ...retryNotes, [delivery.id]: event.target.value })} placeholder="Why is this being recalled from its driver?" aria-label={`Recall note for order #${delivery.orderId}`} className="flex-1" />
                    <Button type="button" size="sm" variant="destructive" onClick={() => handleAdminTransition(delivery.id, 'FAILED')} disabled={busyId === delivery.id}>Recall from driver</Button>
                  </div>
                )}

                {delivery.proofCount > 0 && (
                  <div className="mt-3 border-t border-line-100 pt-3">
                    <Button type="button" size="sm" variant="ghost" className="px-0 text-brand-700" onClick={() => toggleProofs(delivery.id)}>
                      {expandedProofsId === delivery.id ? 'Hide' : 'View'} proof of delivery ({delivery.proofCount})
                    </Button>
                    {expandedProofsId === delivery.id && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {(proofsById[delivery.id] ?? []).map((proof) => (
                          <a key={proof.id} href={`/api/deliveries/${delivery.id}/proof/${proof.id}`} target="_blank" rel="noreferrer">
                            <img src={`/api/deliveries/${delivery.id}/proof/${proof.id}`} alt={proof.fileName} className="h-20 w-20 rounded-control border border-line-200 object-cover" />
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
      </Card>
    </section>
  )
}
