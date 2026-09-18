import { useEffect, useState } from 'react'
import { apiGet, apiPatch, apiPost } from '../../api/client.js'
import { Alert } from '../../components/ui/Alert.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Card } from '../../components/ui/Card.jsx'
import { EmptyState } from '../../components/ui/EmptyState.jsx'
import { Field } from '../../components/ui/Field.jsx'
import { Input } from '../../components/ui/Input.jsx'
import { Select } from '../../components/ui/Select.jsx'
import { StatusBadge } from '../../components/ui/StatusBadge.jsx'

const emptyProposeForm = { productId: '', proposedStockQuantity: '', proposedMinStockLevel: '', movementReason: '', quantityLost: '', reason: '' }
// The reasons selectable for a LOSS report — narrower than
// InventoryManagement.jsx's admin reasonOptions, matching the backend's
// own lossReportReasons Set exactly (RESTOCK and CORRECTION are excluded
// on purpose: see server/routes/inventory.js for why).
const lossReasonOptions = [
  { value: 'PRODUCTION_LOSS', label: 'Production loss (burned, defective)' },
  { value: 'EXPIRED', label: 'Expired (past shelf life)' },
  { value: 'DAMAGED', label: 'Damaged (handling or storage)' },
  { value: 'SPOILAGE', label: 'Spoilage / waste' },
]
const lossReasonLabels = Object.fromEntries(lossReasonOptions.map((option) => [option.value, option.label]))

// Stage 4 (RULES-PLANS/UI_AUDIT.md) — H7's local statusStyles is gone in
// favour of the shared <StatusBadge> (PENDING/APPROVED/REJECTED all
// already map onto its wait/done/fail tokens). C3's role="status" 10px
// error is now <Alert>, and since this screen's `message` state doubles
// as a success confirmation ("Request submitted."), the variant now
// tracks `messageFailed` — error is role="alert" (assertive), success
// stays role="status" (polite), instead of both being flattened into one
// role="status" paragraph as before. This is a card/list layout, not a
// table, so it stays that way — Card wraps each panel, Field/Input/Select
// replace the three old input shapes, Button replaces the hand-rolled
// buttons.
//
// migration 008 (RULES-PLANS/INVENTORY_REVIEW.md) added a second,
// mutually exclusive shape this form can submit: a LOSS REPORT
// (movementReason + quantityLost) alongside the original RECOUNT
// (proposedStockQuantity/proposedMinStockLevel). `proposeMode` selects
// which one is showing; handleProposeSubmit only ever puts ONE shape's
// fields into the request body — never both, and never the other mode's
// fields as blanks. That matters for the same reason the recount fields
// were already careful about it (RULES-PLANS/UI_AUDIT.md's DB-default
// field note): the backend detects a loss report by
// `request.body.movementReason != null`, and an empty string is not
// null, so sending `movementReason: ''` while proposing a recount would
// make the server think a loss report was submitted and reject it for
// an invalid reason — a confusing error for someone who never touched
// that field. handleReview and the one-pending-request-per-product /
// observed-stock-quantity approval semantics are untouched — this pass
// does not change how either shape is approved.
export function InventoryRequests({ user, inventory }) {
  const isAdmin = user.role === 'ADMIN'

  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [messageFailed, setMessageFailed] = useState(false)

  const [proposeMode, setProposeMode] = useState('RECOUNT')
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
      setMessageFailed(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRequests()
  }, [])

  const updateProposeField = (field, value) => setProposeForm({ ...proposeForm, [field]: value })

  // Switching modes clears the form rather than leaving the other shape's
  // half-filled fields sitting invisibly in state — a cashier who types a
  // quantity into "Report a loss" and then clicks back to "Recount" should
  // not have that number silently resurface if they switch again.
  const switchProposeMode = (mode) => {
    setProposeMode(mode)
    setProposeForm(emptyProposeForm)
    setProposeErrors({})
  }

  const handleProposeSubmit = async (event) => {
    event.preventDefault()
    setProposeSubmitting(true)
    setProposeErrors({})
    try {
      const body = { productId: proposeForm.productId, reason: proposeForm.reason }
      // Exactly one shape's fields go in — see the file header comment for
      // why the other mode's fields must never be sent at all, not even as
      // blanks.
      if (proposeMode === 'LOSS') {
        body.movementReason = proposeForm.movementReason
        body.quantityLost = Number(proposeForm.quantityLost)
      } else {
        if (proposeForm.proposedStockQuantity !== '') body.proposedStockQuantity = Number(proposeForm.proposedStockQuantity)
        if (proposeForm.proposedMinStockLevel !== '') body.proposedMinStockLevel = Number(proposeForm.proposedMinStockLevel)
      }
      await apiPost('/api/inventory/requests', body)
      setProposeForm(emptyProposeForm)
      setMessage(proposeMode === 'LOSS' ? 'Loss reported.' : 'Request submitted.')
      setMessageFailed(false)
      await loadRequests()
    } catch (error) {
      setProposeErrors(error.errors ?? {})
      setMessage(error.message)
      setMessageFailed(true)
    } finally {
      setProposeSubmitting(false)
    }
  }

  // The cashier's own escape hatch: a mistyped proposal no longer has to
  // wait for an admin to reject it before the corrected one can be filed.
  const handleWithdraw = async (requestId) => {
    if (!window.confirm('Withdraw this request? You can submit a new one afterwards.')) return
    setReviewingId(requestId)
    setMessage('')
    try {
      await apiPatch(`/api/inventory/requests/${requestId}`, { status: 'CANCELLED' })
      setMessage('Request withdrawn.')
      setMessageFailed(false)
      await loadRequests()
    } catch (error) {
      setMessage(error.message)
      setMessageFailed(true)
    } finally {
      setReviewingId(null)
    }
  }

  const handleReview = async (requestId, status) => {
    setReviewingId(requestId)
    setMessage('')
    try {
      await apiPatch(`/api/inventory/requests/${requestId}`, { status, reviewerNote: reviewNotes[requestId] || null })
      await loadRequests()
    } catch (error) {
      setMessage(error.message)
      setMessageFailed(true)
    } finally {
      setReviewingId(null)
    }
  }

  return (
    <div className="mt-6 space-y-6">
      {message && <Alert variant={messageFailed ? 'error' : 'success'}>{message}</Alert>}

      {!isAdmin && (
        <Card className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-ink-900">{proposeMode === 'LOSS' ? 'Report a loss' : 'Propose a stock change'}</h2>
            {/* A mode toggle, not a second form — same Button-pill pattern
                InventoryManagement.jsx's own Stock levels/Change requests
                tabs use just above this screen. */}
            <div className="flex gap-2">
              <Button type="button" size="sm" variant={proposeMode === 'RECOUNT' ? 'primary' : 'secondary'} onClick={() => switchProposeMode('RECOUNT')}>
                Recount
              </Button>
              <Button type="button" size="sm" variant={proposeMode === 'LOSS' ? 'primary' : 'secondary'} onClick={() => switchProposeMode('LOSS')}>
                Report a loss
              </Button>
            </div>
          </div>
          <p className="mt-1 text-xs text-ink-500">An admin reviews this before anything actually changes.</p>
          <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={handleProposeSubmit}>
            <div className="sm:col-span-2">
              <Field label="Product" error={proposeErrors.productId}>
                <Select value={proposeForm.productId} onChange={(event) => updateProposeField('productId', event.target.value)}>
                  <option value="">Select a product…</option>
                  {inventory.map((item) => (
                    <option key={item.productId} value={item.productId}>
                      {item.productName} (currently {item.stockQuantity})
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            {proposeMode === 'LOSS' ? (
              <>
                <Field label="Reason" error={proposeErrors.movementReason}>
                  <Select value={proposeForm.movementReason} onChange={(event) => updateProposeField('movementReason', event.target.value)}>
                    <option value="">Why was it lost?</option>
                    {lossReasonOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Quantity lost" error={proposeErrors.quantityLost}>
                  <Input value={proposeForm.quantityLost} onChange={(event) => updateProposeField('quantityLost', event.target.value)} inputMode="numeric" placeholder="e.g. 10" />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Details" error={proposeErrors.reason}>
                    <Input value={proposeForm.reason} onChange={(event) => updateProposeField('reason', event.target.value)} placeholder="e.g. Oven timer failed on the morning batch" />
                  </Field>
                </div>
              </>
            ) : (
              <>
                <Field label="Proposed stock quantity" error={proposeErrors.proposedStockQuantity}>
                  <Input value={proposeForm.proposedStockQuantity} onChange={(event) => updateProposeField('proposedStockQuantity', event.target.value)} inputMode="numeric" placeholder="Leave blank if unchanged" />
                </Field>
                <Field label="Proposed minimum level" error={proposeErrors.proposedMinStockLevel}>
                  <Input value={proposeForm.proposedMinStockLevel} onChange={(event) => updateProposeField('proposedMinStockLevel', event.target.value)} inputMode="numeric" placeholder="Leave blank if unchanged" />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Reason" error={proposeErrors.reason}>
                    <Input value={proposeForm.reason} onChange={(event) => updateProposeField('reason', event.target.value)} placeholder="e.g. Delivery received, or shelf recount" />
                  </Field>
                </div>
              </>
            )}

            <div className="sm:col-span-2">
              <Button type="submit" size="sm" disabled={proposeSubmitting}>
                {proposeSubmitting ? 'Submitting…' : proposeMode === 'LOSS' ? 'Submit loss report' : 'Submit request'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card className="p-6">
        <h2 className="text-lg font-semibold text-ink-900">{isAdmin ? 'All change requests' : 'My requests'}</h2>
        {loading ? (
          <p className="mt-4 text-sm text-ink-500">Loading…</p>
        ) : requests.length === 0 ? (
          <EmptyState title="No requests yet" />
        ) : (
          <ul className="mt-4 divide-y divide-line-100">
            {requests.map((item) => (
              <li key={item.id} className="py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-ink-900">
                      {item.productName}
                      {!isAdmin ? '' : ` — ${item.requestedByName}`}
                    </p>
                    <p className="mt-0.5 text-ink-500">
                      {/* quantityChange is set on a LOSS report and null on
                          a RECOUNT — the same pairing the API uses to tell
                          the two shapes apart (see mapChangeRequestRow in
                          server/routes/inventory.js). Math.abs undoes the
                          negative sign the backend stores it with — a
                          cashier reading their own list wants "10 lost",
                          not "-10". */}
                      {item.quantityChange != null ? (
                        <>
                          Lost <span className="tabular-nums">{Math.abs(item.quantityChange)}</span> — {lossReasonLabels[item.movementReason] ?? item.movementReason}.{' '}
                        </>
                      ) : (
                        <>
                          {item.proposedStockQuantity != null && (
                            <>
                              Stock:{' '}
                              <span className="tabular-nums">
                                {item.observedStockQuantity} → {item.proposedStockQuantity}
                              </span>
                              .{' '}
                            </>
                          )}
                          {item.proposedMinStockLevel != null && (
                            <>
                              Min level → <span className="tabular-nums">{item.proposedMinStockLevel}</span>.{' '}
                            </>
                          )}
                        </>
                      )}
                    </p>
                    <p className="mt-0.5 text-ink-500">"{item.reason}"</p>
                    {item.reviewerNote && <p className="mt-0.5 text-ink-500">Reviewer: "{item.reviewerNote}"</p>}
                  </div>
                  <StatusBadge status={item.status} />
                </div>
                {!isAdmin && item.status === 'PENDING' && (
                  <div className="mt-2">
                    <Button size="sm" variant="secondary" onClick={() => handleWithdraw(item.id)} disabled={reviewingId === item.id}>
                      {reviewingId === item.id ? 'Working…' : 'Withdraw'}
                    </Button>
                  </div>
                )}
                {isAdmin && item.status === 'PENDING' && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Input
                      value={reviewNotes[item.id] ?? ''}
                      onChange={(event) => setReviewNotes({ ...reviewNotes, [item.id]: event.target.value })}
                      placeholder="Optional note"
                      aria-label={`Review note for request #${item.id}`}
                      className="flex-1"
                    />
                    <Button size="sm" onClick={() => handleReview(item.id, 'APPROVED')} disabled={reviewingId === item.id}>
                      {reviewingId === item.id ? 'Working…' : 'Approve'}
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => handleReview(item.id, 'REJECTED')} disabled={reviewingId === item.id}>
                      Reject
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
