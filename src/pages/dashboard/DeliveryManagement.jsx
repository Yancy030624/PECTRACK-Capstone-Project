import { useEffect, useState } from 'react'
import { useNotificationRefresh } from '../../lib/useNotificationRefresh.js'
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
import { telHref } from '../../lib/bakery.js'
import { TONES } from '../../lib/stockHealth.js'
import { formatPeso } from '../../lib/format.js'
import { orderLabel } from '../../lib/orderNumber.js'
import { MyDeliveries } from './MyDeliveries.jsx'

// The status filter, as buttons like Inventory Management's (the user,
// 2026-10-16). No "Failed": a delivery the driver could not hand over goes
// straight back to To assign (routes/deliveries.js).
const deliveryFilters = [
  { key: 'PENDING_ASSIGNMENT', label: 'To assign', tone: 'attention' },
  { key: 'ASSIGNED', label: 'Assigned', tone: 'okay' },
  { key: 'OUT_FOR_DELIVERY', label: 'Out for delivery', tone: 'okay' },
  { key: 'DELIVERED', label: 'Delivered', tone: 'good' },
  { key: 'ALL', label: 'All' },
]

export function DeliveryManagement({ user, params, onNavigate }) {
  if (user.role === 'DELIVERY PERSONNEL') return <MyDeliveries user={user} />
  return <StaffDeliveryView user={user} params={params} onNavigate={onNavigate} />
}

// A delivery staff still work with: not the record of a cancelled order's
// delivery (FAILED), and not one whose order is already finished.
const isLive = (delivery) => delivery.status !== 'FAILED' && !(delivery.status === 'PENDING_ASSIGNMENT' && ['COMPLETED', 'CANCELLED'].includes(delivery.orderStatus))
const matchesFilter = (delivery, filter) => isLive(delivery) && (filter === 'ALL' || delivery.status === filter)

const dayTime = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' })

// Delivery Management, staff side (MyDeliveries.jsx is the driver's).
// Minimal by request (the user, 2026-10-16): filter buttons, one compact
// card per delivery — who, where, when, the driver — and one action: assign
// a driver while it waits, or, for an admin, take it back from its driver
// (it returns to To assign). Deliveries move on from the driver's phone.
function StaffDeliveryView({ user, params, onNavigate }) {
  const isAdmin = user.role === 'ADMIN'
  // Opened from the Dashboard's "Deliveries to assign" tile.
  const toAssignOnly = params?.focus === 'toAssign'

  const [deliveries, setDeliveries] = useState([])
  const [personnel, setPersonnel] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('PENDING_ASSIGNMENT')
  const [message, setMessage] = useState('')
  const [messageFailed, setMessageFailed] = useState(false)

  const [assignChoice, setAssignChoice] = useState({})
  const [takingBack, setTakingBack] = useState(null)
  const [takeBackNote, setTakeBackNote] = useState('')
  const [busyId, setBusyId] = useState(null)

  const [expandedProofsId, setExpandedProofsId] = useState(null)
  const [proofsById, setProofsById] = useState({})

  // `quiet` reloads without the loading rows, for the refresh the bell
  // asks for when a delivery moves.
  const loadDeliveries = async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true)
    try {
      const data = await apiGet('/api/deliveries')
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
    apiGet('/api/deliveries/personnel').then((data) => setPersonnel(data.personnel)).catch((error) => setMessage(error.message))
  }, [])
  useNotificationRefresh(() => loadDeliveries({ quiet: true }))

  const visibleDeliveries = deliveries.filter((delivery) => matchesFilter(delivery, toAssignOnly ? 'PENDING_ASSIGNMENT' : filter))

  const say = (text, failed = false) => { setMessage(text); setMessageFailed(failed) }

  const handleAssign = async (deliveryId) => {
    const deliveryPersonnelId = assignChoice[deliveryId]
    if (!deliveryPersonnelId) return
    setBusyId(deliveryId)
    setMessage('')
    try {
      await apiPatch(`/api/deliveries/${deliveryId}/assign`, { deliveryPersonnelId })
      say('Driver assigned.')
      await loadDeliveries({ quiet: true })
    } catch (error) {
      say(error.message, true)
    } finally {
      setBusyId(null)
    }
  }

  // An admin takes a delivery back from its driver (a lost phone, a driver
  // who cannot go on): it returns to To assign, with the reason kept.
  const handleTakeBack = async (deliveryId) => {
    if (takeBackNote.trim().length === 0) return
    setBusyId(deliveryId)
    setMessage('')
    try {
      await apiPatch(`/api/deliveries/${deliveryId}/status`, { status: 'FAILED', note: takeBackNote.trim() })
      setTakingBack(null)
      setTakeBackNote('')
      say('Taken back from the driver — it is in To assign again.')
      await loadDeliveries({ quiet: true })
    } catch (error) {
      say(error.message, true)
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
        say(error.message, true)
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
          description="Paid delivery orders waiting for a driver."
          onBack={() => onNavigate?.('Dashboard')}
          onShowAll={() => onNavigate?.('Delivery Management')}
          showAllLabel="Show all deliveries"
        />
      ) : (
        <>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-600">{user.role} PORTAL</p>
          <h1 className="mt-1 text-2xl font-semibold text-ink-900">Delivery Management</h1>
          <p className="mt-2 text-sm text-ink-500">Assign a driver; the driver moves each delivery on from their phone.</p>
        </>
      )}

      {message && (
        <div className="mt-4">
          <Alert variant={messageFailed ? 'error' : 'success'}>{message}</Alert>
        </div>
      )}

      <Card className="mt-6 p-6">
        {!toAssignOnly && !loading && (
          <div className="mb-5">
            <p id="delivery-filter-label" className="text-xs font-semibold uppercase tracking-wide text-ink-500">Status</p>
            <div role="group" aria-labelledby="delivery-filter-label" className="mt-2 flex flex-wrap gap-2">
              {deliveryFilters.map((option) => {
                const count = deliveries.filter((delivery) => matchesFilter(delivery, option.key)).length
                const active = filter === option.key
                return (
                  <button
                    type="button"
                    key={option.key}
                    onClick={() => setFilter(option.key)}
                    aria-pressed={active}
                    className={`inline-flex min-h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition ${active ? 'border-ink-900 bg-ink-900 text-white' : 'border-line-200 bg-surface text-ink-700 hover:bg-surface-sunk'}`}
                  >
                    {option.tone && <span className={`h-2.5 w-2.5 rounded-full ${TONES[option.tone].dot}`} aria-hidden="true" />}
                    {option.label}
                    <span className={`rounded-full px-1.5 text-xs tabular-nums ${active ? 'bg-white/20' : 'bg-surface-sunk text-ink-500'}`}>{count}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {loading ? (
          <LoadingRows />
        ) : visibleDeliveries.length === 0 ? (
          <EmptyState title={filter === 'PENDING_ASSIGNMENT' || toAssignOnly ? 'Every delivery has a driver.' : 'No deliveries here.'} />
        ) : (
          <ul className="divide-y divide-line-100">
            {visibleDeliveries.map((delivery) => (
              <li key={delivery.id} className="py-3.5 text-sm first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink-900">
                      {orderLabel(delivery)} · {delivery.customerName ?? 'Customer'} <span className="font-normal text-ink-500">· <span className="tabular-nums">{formatPeso(delivery.totalAmount)}</span></span>
                    </p>
                    <p className="mt-0.5 text-xs text-ink-500">
                      {delivery.address.recipientName}
                      {delivery.address.contactNumber && <> · <a href={telHref(delivery.address.contactNumber)} className="font-medium text-brand-700 hover:underline">{delivery.address.contactNumber}</a></>}
                      {' · '}{[delivery.address.barangay, delivery.address.municipality].filter(Boolean).join(', ')}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-500">
                      {delivery.requestedFulfillmentTime ? `Needed by ${dayTime.format(new Date(delivery.requestedFulfillmentTime))}` : 'As soon as ready'}
                      {delivery.deliveryPersonnelName && ` · Driver: ${delivery.deliveryPersonnelName}`}
                    </p>
                  </div>
                  <StatusBadge status={delivery.status} label={delivery.status === 'PENDING_ASSIGNMENT' ? 'To assign' : undefined} />
                </div>

                {delivery.status === 'PENDING_ASSIGNMENT' && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <div className="min-w-40 flex-1 sm:max-w-64">
                      <Select value={assignChoice[delivery.id] ?? ''} onChange={(event) => setAssignChoice({ ...assignChoice, [delivery.id]: event.target.value })} aria-label={`Driver for order ${orderLabel(delivery)}`}>
                        <option value="">Select a driver…</option>
                        {personnel.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
                      </Select>
                    </div>
                    <Button type="button" size="sm" onClick={() => handleAssign(delivery.id)} disabled={busyId === delivery.id || !assignChoice[delivery.id]}>Assign</Button>
                  </div>
                )}

                {isAdmin && (delivery.status === 'ASSIGNED' || delivery.status === 'OUT_FOR_DELIVERY') && (
                  takingBack === delivery.id ? (
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      <Input value={takeBackNote} onChange={(event) => setTakeBackNote(event.target.value)} placeholder="Why take it back from the driver?" aria-label={`Reason for taking back order ${orderLabel(delivery)}`} className="flex-1 sm:max-w-80" />
                      <Button type="button" size="sm" variant="destructive" onClick={() => handleTakeBack(delivery.id)} disabled={busyId === delivery.id || !takeBackNote.trim()}>Take back</Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => { setTakingBack(null); setTakeBackNote('') }}>Keep</Button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => { setTakingBack(delivery.id); setTakeBackNote('') }} className="mt-2 text-xs font-semibold text-ink-500 hover:text-red-700 hover:underline">Take back from driver</button>
                  )
                )}

                {delivery.proofCount > 0 && (
                  <div className="mt-2">
                    <button type="button" onClick={() => toggleProofs(delivery.id)} className="text-xs font-semibold text-brand-700 hover:underline">
                      {expandedProofsId === delivery.id ? 'Hide' : 'View'} proof of delivery ({delivery.proofCount})
                    </button>
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
