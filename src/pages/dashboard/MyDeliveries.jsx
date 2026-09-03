import { useEffect, useState } from 'react'
import { apiGet, apiPatch, apiUpload } from '../../api/client.js'

const statusStyles = {
  ASSIGNED: 'bg-blue-50 text-blue-800',
  OUT_FOR_DELIVERY: 'bg-teal-50 text-teal-800',
}

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
    <section className="min-w-0 flex-1 px-4 pb-10 pt-24 sm:px-7 md:pt-9">
      <p className="text-sm font-semibold text-green-700">{user.role} PORTAL</p>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">My Deliveries</h1>
      <p className="mt-2 text-sm text-slate-500">Deliveries currently assigned to you. No GPS tracking — this is a workflow checklist, not a map.</p>

      {message && <p role="status" className={`mt-4 rounded-lg px-3 py-2 text-[10px] font-semibold ${messageFailed ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-800'}`}>{message}</p>}

      <div className="mt-7 rounded-2xl border border-green-100 bg-white p-6">
        <h2 className="text-lg font-bold">Assigned to you</h2>
        {loading ? (
          <p className="mt-4 text-sm text-slate-500">Loading…</p>
        ) : deliveries.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">Nothing assigned right now.</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {deliveries.map((delivery) => (
              <li key={delivery.id} className="rounded-xl border border-slate-100 p-4 text-xs">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-800">Order #{delivery.orderId} · {delivery.customerName ?? 'Customer'}</p>
                    <p className="mt-1 text-slate-600">{delivery.address.recipientName} · {delivery.address.contactNumber}</p>
                    <p className="mt-0.5 text-slate-500">
                      {delivery.address.addressLine1}{delivery.address.addressLine2 && `, ${delivery.address.addressLine2}`}
                      {delivery.address.barangay && `, ${delivery.address.barangay}`}, {delivery.address.municipality}, {delivery.address.province}
                      {delivery.address.postalCode && ` ${delivery.address.postalCode}`}
                    </p>
                    {delivery.address.deliveryNotes && <p className="mt-0.5 text-slate-500">Note: "{delivery.address.deliveryNotes}"</p>}
                    <p className="mt-1 text-slate-500">Order total: ₱{delivery.totalAmount}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${statusStyles[delivery.status] ?? 'bg-slate-100 text-slate-700'}`}>{delivery.status.replaceAll('_', ' ')}</span>
                </div>

                {delivery.status === 'ASSIGNED' && (
                  <div className="mt-3 border-t border-slate-100 pt-3">
                    <button type="button" onClick={() => setStatus(delivery.id, 'OUT_FOR_DELIVERY')} disabled={busyId === delivery.id} className="rounded-lg bg-green-700 px-3 py-1.5 text-[10px] font-bold text-white transition hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-60">Start delivery</button>
                  </div>
                )}

                {delivery.status === 'OUT_FOR_DELIVERY' && (
                  <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
                    <div>
                      <label htmlFor={`proof-${delivery.id}`} className="mb-1.5 block text-[11px] font-extrabold">Proof of delivery photo{delivery.proofCount > 0 ? ` (${delivery.proofCount} uploaded)` : ''}</label>
                      <div className="flex flex-wrap items-center gap-2">
                        <input id={`proof-${delivery.id}`} type="file" accept="image/jpeg,image/png" onChange={(event) => setProofFiles({ ...proofFiles, [delivery.id]: event.target.files[0] ?? null })} className="text-[11px]" />
                        <button type="button" onClick={() => handleUploadProof(delivery.id)} disabled={busyId === delivery.id || !proofFiles[delivery.id]} className="rounded-lg border border-green-700 px-2.5 py-1.5 text-[10px] font-bold text-green-800 transition hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-60">Upload photo</button>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" onClick={() => setStatus(delivery.id, 'DELIVERED')} disabled={busyId === delivery.id} className="rounded-lg bg-green-700 px-3 py-1.5 text-[10px] font-bold text-white transition hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-60">Mark delivered</button>
                      <input value={failNotes[delivery.id] ?? ''} onChange={(event) => setFailNotes({ ...failNotes, [delivery.id]: event.target.value })} placeholder="Reason, if it failed" className="flex-1 rounded-lg border border-stone-200 px-2 py-1.5 text-[11px] outline-none focus:border-green-700" />
                      <button type="button" onClick={() => setStatus(delivery.id, 'FAILED', failNotes[delivery.id])} disabled={busyId === delivery.id} className="rounded-lg bg-red-50 px-2.5 py-1.5 text-[10px] font-bold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60">Mark failed</button>
                    </div>
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
