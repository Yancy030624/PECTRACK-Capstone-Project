// Import state management for the propose form and the request list.
import { useEffect, useState } from 'react'
import { apiGet, apiPatch, apiPost } from '../../api/client.js'

const emptyProposeForm = { productId: '', proposedStockQuantity: '', proposedMinStockLevel: '', reason: '' }
const statusStyles = {
  PENDING: 'bg-amber-50 text-amber-800',
  APPROVED: 'bg-green-50 text-green-800',
  REJECTED: 'bg-red-50 text-red-700',
}

// Phase 5, Step 6 (see PHASE5_PLAN.md): the cashier-proposes/admin-approves
// stock workflow. Kept as its own component rather than folded into
// InventoryManagement.jsx, which the plan itself flagged as already large
// enough to need splitting before adding more to it.
//
// A cashier can only PROPOSE here — never apply a change directly, that's
// InventoryManagement.jsx's admin-only edit. An admin reviews everyone's
// proposals; a cashier sees only their own, matching how the backend
// scopes GET /api/inventory/requests by role.
export function InventoryRequests({ user, inventory }) {
  const isAdmin = user.role === 'ADMIN'

  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  const [proposeForm, setProposeForm] = useState(emptyProposeForm)
  const [proposeErrors, setProposeErrors] = useState({})
  const [proposeSubmitting, setProposeSubmitting] = useState(false)

  const [reviewNotes, setReviewNotes] = useState({})
  const [reviewingId, setReviewingId] = useState(null)

  const loadRequests = async () => {
    setLoading(true)
    try {
      const data = await apiGet('/api/inventory/requests')
      setRequests(data.requests)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRequests()
  }, [])

  const updateProposeField = (field, value) => setProposeForm({ ...proposeForm, [field]: value })

  const handleProposeSubmit = async (event) => {
    event.preventDefault()
    setProposeSubmitting(true)
    setProposeErrors({})
    try {
      const body = { productId: proposeForm.productId, reason: proposeForm.reason }
      // Only send a proposed field if the cashier actually filled it in —
      // the backend requires at least one, but neither is forced.
      if (proposeForm.proposedStockQuantity !== '') body.proposedStockQuantity = Number(proposeForm.proposedStockQuantity)
      if (proposeForm.proposedMinStockLevel !== '') body.proposedMinStockLevel = Number(proposeForm.proposedMinStockLevel)
      await apiPost('/api/inventory/requests', body)
      setProposeForm(emptyProposeForm)
      setMessage('Request submitted.')
      await loadRequests()
    } catch (error) {
      setProposeErrors(error.errors ?? {})
      setMessage(error.message)
    } finally {
      setProposeSubmitting(false)
    }
  }

  const handleReview = async (requestId, status) => {
    setReviewingId(requestId)
    try {
      await apiPatch(`/api/inventory/requests/${requestId}`, { status, reviewerNote: reviewNotes[requestId] || null })
      await loadRequests()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setReviewingId(null)
    }
  }

  return (
    <div className="mt-6 space-y-6">
      {message && <p role="status" className="rounded-lg bg-red-50 px-3 py-2 text-[10px] font-semibold text-red-700">{message}</p>}

      {!isAdmin && (
        <div className="rounded-2xl border border-green-100 bg-white p-6">
          <h2 className="text-lg font-bold">Propose a stock change</h2>
          <p className="mt-1 text-xs text-slate-500">An admin reviews this before anything actually changes.</p>
          <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={handleProposeSubmit}>
            <div className="sm:col-span-2">
              <label htmlFor="propose-product" className="mb-1.5 block text-[11px] font-extrabold">Product</label>
              <select id="propose-product" value={proposeForm.productId} onChange={(event) => updateProposeField('productId', event.target.value)} className="w-full rounded-xl border border-stone-200 px-3 py-2 text-xs outline-none focus:border-green-700">
                <option value="">Select a product…</option>
                {inventory.map((item) => <option key={item.productId} value={item.productId}>{item.productName} (currently {item.stockQuantity})</option>)}
              </select>
              {proposeErrors.productId && <p className="mt-1 text-[10px] font-medium text-red-700">{proposeErrors.productId}</p>}
            </div>
            <div>
              <label htmlFor="propose-stock" className="mb-1.5 block text-[11px] font-extrabold">Proposed stock quantity</label>
              <input id="propose-stock" value={proposeForm.proposedStockQuantity} onChange={(event) => updateProposeField('proposedStockQuantity', event.target.value)} inputMode="numeric" placeholder="Leave blank if unchanged" className="w-full rounded-xl border border-stone-200 px-3 py-2 text-xs outline-none focus:border-green-700" />
              {proposeErrors.proposedStockQuantity && <p className="mt-1 text-[10px] font-medium text-red-700">{proposeErrors.proposedStockQuantity}</p>}
            </div>
            <div>
              <label htmlFor="propose-min" className="mb-1.5 block text-[11px] font-extrabold">Proposed minimum level</label>
              <input id="propose-min" value={proposeForm.proposedMinStockLevel} onChange={(event) => updateProposeField('proposedMinStockLevel', event.target.value)} inputMode="numeric" placeholder="Leave blank if unchanged" className="w-full rounded-xl border border-stone-200 px-3 py-2 text-xs outline-none focus:border-green-700" />
              {proposeErrors.proposedMinStockLevel && <p className="mt-1 text-[10px] font-medium text-red-700">{proposeErrors.proposedMinStockLevel}</p>}
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="propose-reason" className="mb-1.5 block text-[11px] font-extrabold">Reason</label>
              <input id="propose-reason" value={proposeForm.reason} onChange={(event) => updateProposeField('reason', event.target.value)} placeholder="e.g. Delivery received, or shelf recount" className="w-full rounded-xl border border-stone-200 px-3 py-2 text-xs outline-none focus:border-green-700" />
              {proposeErrors.reason && <p className="mt-1 text-[10px] font-medium text-red-700">{proposeErrors.reason}</p>}
            </div>
            <div className="sm:col-span-2">
              <button type="submit" disabled={proposeSubmitting} className="rounded-xl bg-green-700 px-4 py-2 text-xs font-bold text-white transition hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-60">{proposeSubmitting ? 'Submitting…' : 'Submit request'}</button>
            </div>
          </form>
        </div>
      )}

      <div className="rounded-2xl border border-green-100 bg-white p-6">
        <h2 className="text-lg font-bold">{isAdmin ? 'All change requests' : 'My requests'}</h2>
        {loading ? (
          <p className="mt-4 text-sm text-slate-500">Loading…</p>
        ) : requests.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No requests yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
            {requests.map((item) => (
              <li key={item.id} className="py-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-800">{item.productName}{!isAdmin ? '' : ` — ${item.requestedByName}`}</p>
                    <p className="mt-0.5 text-slate-500">
                      {item.proposedStockQuantity != null && <>Stock: {item.observedStockQuantity} → {item.proposedStockQuantity}. </>}
                      {item.proposedMinStockLevel != null && <>Min level → {item.proposedMinStockLevel}. </>}
                    </p>
                    <p className="mt-0.5 text-slate-500">"{item.reason}"</p>
                    {item.reviewerNote && <p className="mt-0.5 text-slate-500">Reviewer: "{item.reviewerNote}"</p>}
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${statusStyles[item.status] ?? 'bg-slate-100 text-slate-700'}`}>{item.status}</span>
                </div>
                {isAdmin && item.status === 'PENDING' && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input value={reviewNotes[item.id] ?? ''} onChange={(event) => setReviewNotes({ ...reviewNotes, [item.id]: event.target.value })} placeholder="Optional note" className="flex-1 rounded-lg border border-stone-200 px-2 py-1.5 text-xs outline-none focus:border-green-700" />
                    <button type="button" onClick={() => handleReview(item.id, 'APPROVED')} disabled={reviewingId === item.id} className="rounded-lg bg-green-700 px-2.5 py-1.5 text-[10px] font-bold text-white transition hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-60">Approve</button>
                    <button type="button" onClick={() => handleReview(item.id, 'REJECTED')} disabled={reviewingId === item.id} className="rounded-lg bg-red-50 px-2.5 py-1.5 text-[10px] font-bold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60">Reject</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
