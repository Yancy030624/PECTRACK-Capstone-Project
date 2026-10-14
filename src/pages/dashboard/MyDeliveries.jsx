import { useEffect, useState } from 'react'
import { apiGet, apiPatch, apiUpload } from '../../api/client.js'
import { Alert } from '../../components/ui/Alert.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Card } from '../../components/ui/Card.jsx'
import { EmptyState } from '../../components/ui/EmptyState.jsx'
import { Input } from '../../components/ui/Input.jsx'
import { StatusBadge } from '../../components/ui/StatusBadge.jsx'
import { LoadingRows } from '../../components/ui/Skeleton.jsx'
import { formatDateTime, formatPeso } from '../../lib/format.js'
import { orderLabel } from '../../lib/orderNumber.js'
import { DeliveryHistory } from './DeliveryHistory.jsx'

// Stage 5 (RULES-PLANS/UI_AUDIT.md) — the delivery role's only screen, and
// the only one in the app worked standing up, on a phone, one-handed. H7's
// local statusStyles here only listed ASSIGNED/OUT_FOR_DELIVERY, so
// DELIVERED/FAILED silently fell back to an unstyled grey pill even though
// a driver can reach both — gone in favour of the shared <StatusBadge>,
// whose map already covers all five delivery statuses.
//
// Everything else is a mobile-first pass: every action a driver taps is
// size="touch" (44px — the DESIGN SYSTEM's touch-critical ramp) and full
// width, the card's main action ("Start delivery" / "Mark delivered") is
// the biggest, first thing below the fold, and the proof-of-delivery file
// input — previously a raw `<input type="file" className="text-[11px]">`
// — now has a properly sized native picker plus an explicit, labelled
// upload button. It intentionally has no `capture="environment"`: that
// attribute opens the camera directly and drops the gallery option on
// Android Chrome, which breaks the (common) case where the driver already
// took the photo before opening this screen.
//
// Untouched: the upload contract (apiUpload still posts the file's raw
// bytes and MIME type to ?proofType=…&fileName=…, per PHASE7_PLAN.md
// Decision 8) and the status transition rules/order (PHASE7_PLAN.md's
// one-directional deliveries.status -> orders.status sync). This is
// presentation only.
// Out for delivery first ("To deliver now"), then the ones still waiting
// at the bakery. An empty group is left out.
const deliveryGroups = (deliveries) => [
  { title: 'To deliver now', items: deliveries.filter((delivery) => delivery.status === 'OUT_FOR_DELIVERY') },
  { title: 'Assigned to you', items: deliveries.filter((delivery) => delivery.status !== 'OUT_FOR_DELIVERY') },
].filter((group) => group.items.length > 0)

export function MyDeliveries({ user }) {
  const [deliveries, setDeliveries] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [messageFailed, setMessageFailed] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [failNotes, setFailNotes] = useState({})
  const [proofFiles, setProofFiles] = useState({})
  const [tab, setTab] = useState('Assigned')

  const loadDeliveries = async () => {
    setLoading(true)
    try {
      const data = await apiGet('/api/deliveries/mine')
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
  }, [])

  const setStatus = async (deliveryId, status, note) => {
    // Failing a delivery is the one driver action that cannot be walked
    // back by the driver; the other destructive actions in the app ask.
    if (status === 'FAILED' && !window.confirm('Mark this delivery as failed? An admin will have to send it back to the queue.')) return
    setBusyId(deliveryId)
    setMessage('')
    try {
      await apiPatch(`/api/deliveries/${deliveryId}/status`, { status, note: note || null })
      setMessage(status === 'DELIVERED' ? 'Delivery marked as delivered.' : status === 'FAILED' ? 'Delivery marked as failed.' : 'Delivery is now out for delivery.')
      setMessageFailed(false)
      await loadDeliveries()
    } catch (error) {
      setMessage(error.message)
      setMessageFailed(true)
    } finally {
      setBusyId(null)
    }
  }

  const handleUploadProof = async (deliveryId) => {
    const file = proofFiles[deliveryId]
    if (!file) return
    setBusyId(deliveryId)
    setMessage('')
    try {
      await apiUpload(`/api/deliveries/${deliveryId}/proof?proofType=PHOTO&fileName=${encodeURIComponent(file.name)}`, file)
      setProofFiles({ ...proofFiles, [deliveryId]: null })
      setMessage('Proof photo uploaded.')
      setMessageFailed(false)
      await loadDeliveries()
    } catch (error) {
      setMessage(error.message)
      setMessageFailed(true)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="min-w-0 flex-1 px-4 pb-10 sm:px-7">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-600 print:hidden">{user.role} PORTAL</p>
      <h1 className="mt-1 text-2xl font-semibold text-ink-900 print:hidden">My Deliveries</h1>
      <p className="mt-2 text-sm text-ink-500 print:hidden">Deliveries assigned to you, and the ones you have finished. No GPS tracking — this is a workflow checklist, not a map.</p>

      {/* PHASE10 B4 — finished deliveries used to vanish from this screen. */}
      <div className="mt-4 flex gap-2 print:hidden" role="tablist">
        {['Assigned', 'History'].map((name) => (
          <Button key={name} type="button" size="sm" role="tab" aria-selected={tab === name} variant={tab === name ? 'primary' : 'secondary'} onClick={() => setTab(name)}>
            {name}
          </Button>
        ))}
      </div>

      {tab === 'History' ? <DeliveryHistory user={user} /> : (
      <>
      {message && (
        <div className="mt-4">
          <Alert variant={messageFailed ? 'error' : 'success'}>{message}</Alert>
        </div>
      )}

      {/* What is on the road first, then what is still to collect
          (CLIENT_REVISIONS_PLAN.md, R4). */}
      {loading ? (
        <LoadingRows className="mt-6" />
      ) : deliveries.length === 0 ? (
        <>
          <h2 className="mt-6 text-lg font-semibold text-ink-900">Assigned to you</h2>
          <div className="mt-4">
            <EmptyState title="Nothing assigned right now." />
          </div>
        </>
      ) : deliveryGroups(deliveries).map((group) => (
        <div key={group.title}>
        <h2 className="mt-6 flex items-center gap-2 text-lg font-semibold text-ink-900">
          {group.title}
          <span className="rounded-full bg-surface px-2 text-sm font-medium text-ink-500 tabular-nums ring-1 ring-line-200">{group.items.length}</span>
        </h2>
        <ul className="mt-4 space-y-4">
          {group.items.map((delivery) => (
            <li key={delivery.id}>
              <Card className="p-4 text-sm sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-ink-900">Order {orderLabel(delivery)} · {delivery.customerName ?? 'Customer'}</p>
                    {/* The number is a tel: link because this screen is
                        used on a phone, at the door — a driver who needs
                        to say "I'm outside" should not have to memorise
                        eleven digits and retype them in another app. The
                        storefront footer already links the bakery's own
                        number the same way. */}
                    <p className="mt-1 text-ink-500">
                      {delivery.address.recipientName} ·{' '}
                      <a href={`tel:${delivery.address.contactNumber}`} className="font-medium text-brand-700 underline underline-offset-2">
                        {delivery.address.contactNumber}
                      </a>
                    </p>
                    <p className="mt-0.5 text-xs text-ink-500">
                      {delivery.address.addressLine1}{delivery.address.addressLine2 && `, ${delivery.address.addressLine2}`}
                      {delivery.address.barangay && `, ${delivery.address.barangay}`}, {delivery.address.municipality}, {delivery.address.province}
                      {delivery.address.postalCode && ` ${delivery.address.postalCode}`}
                    </p>
                    {delivery.address.deliveryNotes && <p className="mt-0.5 text-xs text-ink-500">Note: "{delivery.address.deliveryNotes}"</p>}
                    {delivery.instructions && <p className="mt-0.5 text-xs text-ink-500">Instructions: "{delivery.instructions}"</p>}
                    {delivery.requestedFulfillmentTime && <p className="mt-0.5 text-xs font-semibold text-ink-900">Needed by {formatDateTime(delivery.requestedFulfillmentTime)}</p>}
                    {/* No cash on delivery (NO_COD_PLAN): orders are paid before they are
                        confirmed, so the driver never collects money. An unpaid
                        one can only be old data — the driver checks with the
                        bakery instead of handing it over. */}
                    <p className="mt-1 text-xs text-ink-500">Order total: <span className="tabular-nums">{formatPeso(delivery.totalAmount)}</span>{delivery.isFullyPaid ? ' · paid' : <> · <span className="font-semibold text-status-fail-fg">not paid — call the bakery before handing it over</span></>}</p>
                  </div>
                  <StatusBadge status={delivery.status} />
                </div>

                {/* What to hand over (CLIENT_REVISIONS_PLAN.md, R1), checked
                    against the bag before leaving and at the door. */}
                {delivery.items?.length > 0 && (
                  <div className="mt-3 rounded-panel bg-surface-sunk p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">Order items</p>
                    <ul className="mt-1.5 space-y-1 text-sm text-ink-900">
                      {delivery.items.map((item, index) => (
                        <li key={index} className="flex justify-between gap-3">
                          <span>{item.name}{item.variant && <span className="text-ink-500"> · {item.variant}</span>}</span>
                          <span className="font-semibold tabular-nums">× {item.quantity}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {delivery.status === 'ASSIGNED' && (
                  <div className="mt-4 border-t border-line-100 pt-4">
                    <Button type="button" size="touch" className="w-full" onClick={() => setStatus(delivery.id, 'OUT_FOR_DELIVERY')} disabled={busyId === delivery.id}>
                      {busyId === delivery.id ? 'Starting…' : 'Start delivery'}
                    </Button>
                  </div>
                )}

                {delivery.status === 'OUT_FOR_DELIVERY' && (
                  <div className="mt-4 space-y-4 border-t border-line-100 pt-4">
                    <div>
                      <label htmlFor={`proof-${delivery.id}`} className="mb-1.5 block text-xs font-semibold text-ink-700">
                        Proof of delivery photo{delivery.proofCount > 0 ? ` (${delivery.proofCount} uploaded)` : ''}
                      </label>
                      <input
                        id={`proof-${delivery.id}`}
                        type="file"
                        accept="image/jpeg,image/png"
                        onChange={(event) => setProofFiles({ ...proofFiles, [delivery.id]: event.target.files[0] ?? null })}
                        className="block w-full text-xs text-ink-500 file:mr-3 file:h-11 file:cursor-pointer file:rounded-control file:border-0 file:bg-brand-50 file:px-4 file:text-sm file:font-semibold file:text-brand-700 hover:file:bg-brand-100"
                      />
                      <Button
                        type="button"
                        size="touch"
                        variant="secondary"
                        className="mt-2 w-full"
                        onClick={() => handleUploadProof(delivery.id)}
                        disabled={busyId === delivery.id || !proofFiles[delivery.id]}
                      >
                        {proofFiles[delivery.id] ? `Upload "${proofFiles[delivery.id].name}"` : 'Upload photo'}
                      </Button>
                    </div>

                    <Button type="button" size="touch" className="w-full" onClick={() => setStatus(delivery.id, 'DELIVERED')} disabled={busyId === delivery.id}>
                      {busyId === delivery.id ? 'Marking delivered…' : 'Mark delivered'}
                    </Button>

                    <div>
                      <Input
                        value={failNotes[delivery.id] ?? ''}
                        onChange={(event) => setFailNotes({ ...failNotes, [delivery.id]: event.target.value })}
                        placeholder="Reason, if it failed"
                        aria-label={`Reason order ${orderLabel(delivery)}'s delivery failed`}
                      />
                      <Button
                        type="button"
                        size="touch"
                        variant="destructive"
                        className="mt-2 w-full"
                        onClick={() => setStatus(delivery.id, 'FAILED', failNotes[delivery.id])}
                        disabled={busyId === delivery.id}
                      >
                        Mark failed
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
        </div>
      ))}
      </>
      )}
    </section>
  )
}
