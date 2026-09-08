import { useEffect, useState } from 'react'
import { apiGet, apiPatch, apiUpload } from '../../api/client.js'
import { Alert } from '../../components/ui/Alert.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Card } from '../../components/ui/Card.jsx'
import { EmptyState } from '../../components/ui/EmptyState.jsx'
import { Input } from '../../components/ui/Input.jsx'
import { StatusBadge } from '../../components/ui/StatusBadge.jsx'

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
export function MyDeliveries({ user }) {
  const [deliveries, setDeliveries] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [messageFailed, setMessageFailed] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [failNotes, setFailNotes] = useState({})
  const [proofFiles, setProofFiles] = useState({})

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
      <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-600">{user.role} PORTAL</p>
      <h1 className="mt-1 text-2xl font-semibold text-ink-900">My Deliveries</h1>
      <p className="mt-2 text-sm text-ink-500">Deliveries currently assigned to you. No GPS tracking — this is a workflow checklist, not a map.</p>

      {message && (
        <div className="mt-4">
          <Alert variant={messageFailed ? 'error' : 'success'}>{message}</Alert>
        </div>
      )}

      <h2 className="mt-6 text-lg font-semibold text-ink-900">Assigned to you</h2>

      {loading ? (
        <p className="mt-4 text-sm text-ink-500">Loading…</p>
      ) : deliveries.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="Nothing assigned right now." />
        </div>
      ) : (
        <ul className="mt-4 space-y-4">
          {deliveries.map((delivery) => (
            <li key={delivery.id}>
              <Card className="p-4 text-sm sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-ink-900">Order #{delivery.orderId} · {delivery.customerName ?? 'Customer'}</p>
                    <p className="mt-1 text-ink-600">{delivery.address.recipientName} · {delivery.address.contactNumber}</p>
                    <p className="mt-0.5 text-xs text-ink-500">
                      {delivery.address.addressLine1}{delivery.address.addressLine2 && `, ${delivery.address.addressLine2}`}
                      {delivery.address.barangay && `, ${delivery.address.barangay}`}, {delivery.address.municipality}, {delivery.address.province}
                      {delivery.address.postalCode && ` ${delivery.address.postalCode}`}
                    </p>
                    {delivery.address.deliveryNotes && <p className="mt-0.5 text-xs text-ink-500">Note: "{delivery.address.deliveryNotes}"</p>}
                    <p className="mt-1 text-xs text-ink-500">Order total: <span className="tabular-nums">₱{delivery.totalAmount}</span></p>
                  </div>
                  <StatusBadge status={delivery.status} />
                </div>

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
                        className="block w-full text-xs text-ink-600 file:mr-3 file:h-11 file:cursor-pointer file:rounded-control file:border-0 file:bg-brand-50 file:px-4 file:text-sm file:font-semibold file:text-brand-700 hover:file:bg-brand-100"
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
                        aria-label={`Reason order #${delivery.orderId}'s delivery failed`}
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
      )}
    </section>
  )
}
