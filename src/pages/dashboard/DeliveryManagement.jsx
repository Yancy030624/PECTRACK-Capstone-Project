import { useEffect, useState } from 'react'
import { apiGet, apiPatch } from '../../api/client.js'
import { FocusHeader } from '../../components/ui/FocusHeader.jsx'
import { Alert } from '../../components/ui/Alert.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Card } from '../../components/ui/Card.jsx'
import { EmptyState } from '../../components/ui/EmptyState.jsx'
import { Input } from '../../components/ui/Input.jsx'
import { Select } from '../../components/ui/Select.jsx'
import { StatusBadge } from '../../components/ui/StatusBadge.jsx'
import { LoadingRows } from '../../components/ui/Skeleton.jsx'
import { formatPeso } from '../../lib/format.js'
import { MyDeliveries } from './MyDeliveries.jsx'

const statusOptions = ['PENDING_ASSIGNMENT', 'ASSIGNED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED']

export function DeliveryManagement({ user, params, onNavigate }) {
  if (user.role === 'DELIVERY PERSONNEL') return <MyDeliveries user={user} />
  return <StaffDeliveryView user={user} params={params} onNavigate={onNavigate} />
}

// The Dashboard's "Deliveries to assign" tile — the same rule as its
// count in /api/reports/summary: waiting for a driver, on an order that
// is not already finished.
const waitingForDriver = (delivery) => delivery.status === 'PENDING_ASSIGNMENT' && delivery.orderStatus !== 'COMPLETED' && delivery.orderStatus !== 'CANCELLED'

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
function StaffDeliveryView({ user, params, onNavigate }) {
  const isAdmin = user.role === 'ADMIN'
  // Opened from the Dashboard tile: only the deliveries waiting for a
  // driver, without the rest of the module around them.
  const toAssignOnly = params?.focus === 'toAssign'

  const [deliveries, setDeliveries] = useState([])
  const [personnel, setPersonnel] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState(toAssignOnly ? 'PENDING_ASSIGNMENT' : '')
  const [message, setMessage] = useState('')
  const [messageFailed, setMessageFailed] = useState(false)

  const [assignChoice, setAssignChoice] = useState({})
  const [retryNotes, setRetryNotes] = useState({})
  const [busyId, setBusyId] = useState(null)

  const [expandedProofsId, setExpandedProofsId] = useState(null)
  const [proofsById, setProofsById] = useState({})

  const visibleDeliveries = toAssignOnly ? deliveries.filter(waitingForDriver) : deliveries

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
      {toAssignOnly ? (
        <FocusHeader
          title="Deliveries to assign"
          count={loading ? null : visibleDeliveries.length}
          tone={visibleDeliveries.length > 0 ? 'attention' : 'good'}
          description="Delivery orders waiting for a driver. Pick a driver for each one; an order still PLACED needs confirming in Order Management first."
          onBack={() => onNavigate?.('Dashboard')}
          onShowAll={() => onNavigate?.('Delivery Management')}
          showAllLabel="Show all deliveries"
        />
      ) : (
        <>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-600">{user.role} PORTAL</p>
          <h1 className="mt-1 text-2xl font-semibold text-ink-900">Delivery Management</h1>
          <p className="mt-2 text-sm text-ink-500">Assign drivers to delivery orders and track each one through to delivered. No GPS tracking — this is a status workflow, not a live map.</p>
        </>
      )}

      {message && (
        <div className="mt-4">
          <Alert variant={messageFailed ? 'error' : 'success'}>{message}</Alert>
        </div>
      )}

      <Card className="mt-6 p-6">
        <div className={`flex-wrap items-center justify-between gap-3 ${toAssignOnly ? 'hidden' : 'flex'}`}>
          <h2 className="text-lg font-semibold text-ink-900">Deliveries</h2>
          <div className="w-full sm:w-56">
            <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by status">
              <option value="">All statuses</option>
              {statusOptions.map((status) => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}
            </Select>
          </div>
        </div>

        {loading ? (
          <LoadingRows className="mt-4" />
        ) : visibleDeliveries.length === 0 ? (
          <EmptyState title={toAssignOnly ? 'Every delivery has a driver.' : 'No deliveries match this filter.'} />
        ) : (
          <ul className={`space-y-4 ${toAssignOnly ? '' : 'mt-4'}`}>
            {visibleDeliveries.map((delivery) => (
              <li key={delivery.id} className="rounded-panel border border-line-200 p-4 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-ink-900">Order #{delivery.orderId} · {delivery.customerName ?? 'Customer'} · <span className="tabular-nums">{formatPeso(delivery.totalAmount)}</span></p>
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

                {/* routes/deliveries.js refuses assignment while the order is
                    still PLACED — the kitchen has not accepted it yet. Say so
                    here instead of offering a button that can only 409. */}
                {delivery.status === 'PENDING_ASSIGNMENT' && delivery.orderStatus === 'PLACED' && (
                  <p className="mt-3 border-t border-line-100 pt-3 text-xs text-ink-500">Confirm the order in Order Management before assigning a driver.</p>
                )}
                {delivery.status === 'PENDING_ASSIGNMENT' && (delivery.orderStatus === 'COMPLETED' || delivery.orderStatus === 'CANCELLED') && (
                  <p className="mt-3 border-t border-line-100 pt-3 text-xs text-ink-500">This order is already {delivery.orderStatus.toLowerCase()} — nothing left to deliver.</p>
                )}
                {/* NO_COD_PLAN D2 — and refuses it while the order still owes
                    money (only possible for orders confirmed before the rule,
                    or reopened by a refund). */}
                {delivery.status === 'PENDING_ASSIGNMENT' && !['PLACED', 'COMPLETED', 'CANCELLED'].includes(delivery.orderStatus) && !delivery.isFullyPaid && (
                  <p className="mt-3 border-t border-line-100 pt-3 text-xs font-semibold text-status-fail-fg">Not fully paid (balance {formatPeso(delivery.balanceDue)}) — record the payment in Payment &amp; Billing before assigning a driver.</p>
                )}
                {delivery.status === 'PENDING_ASSIGNMENT' && !['PLACED', 'COMPLETED', 'CANCELLED'].includes(delivery.orderStatus) && delivery.isFullyPaid && (
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
