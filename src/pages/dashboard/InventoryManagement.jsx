import { useEffect, useState } from 'react'
import { apiGet, apiPatch } from '../../api/client.js'
import { StockStatusPill } from '../../components/ui/StockStatusPill.jsx'
import { STOCK_STATUSES, TONES, stockStatus } from '../../lib/stockHealth.js'
import { Alert } from '../../components/ui/Alert.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Card } from '../../components/ui/Card.jsx'
import { EmptyState } from '../../components/ui/EmptyState.jsx'
import { Field } from '../../components/ui/Field.jsx'
import { Input } from '../../components/ui/Input.jsx'
import { Select } from '../../components/ui/Select.jsx'
import { Table, Tbody, Td, Th, Thead, Tr } from '../../components/ui/Table.jsx'
import { LoadingRows } from '../../components/ui/Skeleton.jsx'

const emptyEditForm = { stockQuantity: '', minStockLevel: '', expirationDate: '', reason: '', note: '' }
// PRODUCTION_LOSS/EXPIRED/DAMAGED added by migration 008
// (RULES-PLANS/INVENTORY_REVIEW.md) — matches server/routes/inventory.js's
// widened manualMovementReasons exactly. Before this, every one of these
// had to be filed as SPOILAGE, the only "something went wrong" option
// available, which is why an admin editing stock directly could never say
// whether a loss was a burned batch, an expired one, or genuine spoilage —
// three situations with three different remedies (Section 8 of that
// review).
const reasonOptions = [
  { value: 'RESTOCK', label: 'Restock (delivery received)' },
  { value: 'PRODUCTION_LOSS', label: 'Production loss (burned, defective)' },
  { value: 'EXPIRED', label: 'Expired (past shelf life)' },
  { value: 'DAMAGED', label: 'Damaged (handling or storage)' },
  { value: 'SPOILAGE', label: 'Spoilage / waste' },
  { value: 'CORRECTION', label: 'Correction (recount)' },
]

// Admin and cashier both edit stock here, with no approval step
// (CLIENT_REVISIONS_PLAN.md, R1): cashiers encode stock, and every change
// is in the movement ledger with who made it. The minimum level and expiry
// fields are admin-only. The role="status" 10px error (C3) is
// <Alert variant="error">; the inputs are Input/Select/Field
// (H3); Stock and Min level are <Td numeric> per the audit's "numeric and
// currency columns right-aligned with tabular-nums" rule. Each row's
// status (Good / Running low / Low stock / Expired) comes from
// lib/stockHealth.jsx — the same rule the Dashboard counts with — and the
// Status filter above the table narrows the list to one of them.
//
// saveEdit's request-body construction is untouched: it still only adds
// stockQuantity/reason/note/minStockLevel/expirationDate keys when that
// field actually changed from editOriginal, same as before.
// The status filter's choices. ATTENTION is "everything red" — low and
// expired together — which is what the Dashboard's "View all" opens.
const stockFilters = [
  { key: 'ALL', label: 'All' },
  { key: 'GOOD', label: STOCK_STATUSES.GOOD.label, tone: 'good' },
  { key: 'OKAY', label: STOCK_STATUSES.OKAY.label, tone: 'okay' },
  { key: 'LOW', label: STOCK_STATUSES.LOW.label, tone: 'attention' },
  { key: 'EXPIRED', label: STOCK_STATUSES.EXPIRED.label, tone: 'attention' },
  { key: 'ATTENTION', label: 'Needs attention', tone: 'attention' },
]
const matchesFilter = (item, filter) => {
  if (filter === 'ALL') return true
  const status = stockStatus(item)
  return filter === 'ATTENTION' ? status === 'LOW' || status === 'EXPIRED' : status === filter
}

// `params.stockFilter` opens the page already filtered — the Dashboard's
// Low stock tile sends 'LOW', so it shows only what is low.
export function InventoryManagement({ user, params }) {
  const isAdmin = user.role === 'ADMIN'
  const [stockFilter, setStockFilter] = useState(() => (stockFilters.some((filter) => filter.key === params?.stockFilter) ? params.stockFilter : 'ALL'))

  const [inventory, setInventory] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  const [editingProductId, setEditingProductId] = useState(null)
  const [editForm, setEditForm] = useState(emptyEditForm)
  const [editOriginal, setEditOriginal] = useState(null)
  const [editErrors, setEditErrors] = useState({})
  const [editSubmitting, setEditSubmitting] = useState(false)

  const loadInventory = async () => {
    setLoading(true)
    try {
      const data = await apiGet('/api/inventory')
      setInventory(data.inventory)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadInventory()
  }, [])

  const startEdit = (item) => {
    setEditingProductId(item.productId)
    setEditForm({ stockQuantity: String(item.stockQuantity), minStockLevel: String(item.minStockLevel), expirationDate: item.expirationDate ?? '', reason: '', note: '' })
    setEditOriginal(item)
    setEditErrors({})
  }

  const cancelEdit = () => {
    setEditingProductId(null)
    setEditOriginal(null)
  }
  const stockQuantityChanged = editOriginal && String(editOriginal.stockQuantity) !== editForm.stockQuantity

  const saveEdit = async (event, item) => {
    event.preventDefault()
    setEditSubmitting(true)
    setEditErrors({})
    const body = {}
    if (stockQuantityChanged) {
      body.stockQuantity = Number(editForm.stockQuantity)
      body.reason = editForm.reason
      if (editForm.note.trim()) body.note = editForm.note.trim()
    }
    if (String(editOriginal.minStockLevel) !== editForm.minStockLevel) body.minStockLevel = Number(editForm.minStockLevel)
    const normalizedExpiration = editForm.expirationDate === '' ? null : editForm.expirationDate
    if ((editOriginal.expirationDate ?? null) !== normalizedExpiration) body.expirationDate = normalizedExpiration

    if (Object.keys(body).length === 0) {
      // Nothing was actually changed — close the form without a wasted request.
      setEditingProductId(null)
      setEditSubmitting(false)
      return
    }

    try {
      await apiPatch(`/api/inventory/${item.productId}`, body)
      setEditingProductId(null)
      await loadInventory()
    } catch (error) {
      setEditErrors(error.errors ?? {})
      setMessage(error.message)
    } finally {
      setEditSubmitting(false)
    }
  }

  // Worst first under a filter that mixes statuses, so what needs
  // attention is never below the fold of what is fine.
  const statusRank = { EXPIRED: 0, LOW: 1, OKAY: 2, GOOD: 3 }
  const visibleInventory = inventory
    .filter((item) => matchesFilter(item, stockFilter))
    .sort((a, b) => (stockFilter === 'ALL' ? 0 : statusRank[stockStatus(a)] - statusRank[stockStatus(b)]))

  return (
    <section className="min-w-0 flex-1 px-4 pb-10 sm:px-7">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-600">{user.role} PORTAL</p>
      <h1 className="mt-1 text-2xl font-semibold text-ink-900">Inventory Management</h1>
      <p className="mt-2 text-sm text-ink-500">Current stock levels. Edit a product to record a restock, a loss, or a recount; every change is logged with who made it.</p>

      {message && (
        <div className="mt-4">
          <Alert variant="error">{message}</Alert>
        </div>
      )}

      <Card className="mt-6 p-6">
        {!loading && inventory.length > 0 && (
          <div className="mb-5">
            <p id="stock-filter-label" className="text-xs font-semibold uppercase tracking-wide text-ink-500">Status</p>
            <div role="group" aria-labelledby="stock-filter-label" className="mt-2 flex flex-wrap gap-2">
              {stockFilters.map((filter) => {
                const count = inventory.filter((item) => matchesFilter(item, filter.key)).length
                const active = stockFilter === filter.key
                return (
                  <button
                    type="button"
                    key={filter.key}
                    onClick={() => setStockFilter(filter.key)}
                    aria-pressed={active}
                    className={`inline-flex min-h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition ${active ? 'border-ink-900 bg-ink-900 text-white' : 'border-line-200 bg-surface text-ink-700 hover:bg-surface-sunk'}`}
                  >
                    {filter.tone && <span className={`h-2.5 w-2.5 rounded-full ${TONES[filter.tone].dot}`} aria-hidden="true" />}
                    {filter.label}
                    <span className={`rounded-full px-1.5 text-xs tabular-nums ${active ? 'bg-white/20' : 'bg-surface-sunk text-ink-500'}`}>{count}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
        {loading ? (
          <LoadingRows className="mt-4" />
        ) : inventory.length === 0 ? (
          <EmptyState title="No products yet" />
        ) : visibleInventory.length === 0 ? (
          <EmptyState title={`No products are ${stockFilters.find((filter) => filter.key === stockFilter).label.toLowerCase()} right now`} description="Pick another status, or All." />
        ) : (
          <div>
            <Table caption="Inventory stock levels">
              <Thead>
                <Tr className="hover:bg-transparent">
                  <Th>Product</Th>
                  <Th priority="lg">Category</Th>
                  <Th align="right">Stock</Th>
                  <Th align="right" priority="md">Min level</Th>
                  <Th priority="lg">Expiry</Th>
                  <Th>Status</Th>
                  <Th>Actions</Th>
                </Tr>
              </Thead>
              <Tbody>
                {visibleInventory.map((item) =>
                  editingProductId === item.productId ? (
                    // The edit form spans the whole row as one cell. It
                    // used to put one input per column, which broke the
                    // moment a column was hidden on a narrow screen: the
                    // "Min level" and "Expiry" inputs vanished with their
                    // columns. One cell, one stacked form, every size.
                    <Tr key={item.productId}>
                      <td colSpan={7} className="px-3 py-3 text-sm text-ink-700">
                        <p className="font-semibold text-ink-900">{item.productName}{item.variant ? ` (${item.variant})` : ''}</p>
                        <div className="mt-2 grid gap-3 sm:grid-cols-3">
                          <Field label="Stock" error={editErrors.stockQuantity}>
                            <Input value={editForm.stockQuantity} onChange={(event) => setEditForm({ ...editForm, stockQuantity: event.target.value })} inputMode="numeric" />
                          </Field>
                          {/* Settings, not counts: admin only (routes/inventory.js). */}
                          {isAdmin && (
                            <>
                              <Field label="Min level" error={editErrors.minStockLevel}>
                                <Input value={editForm.minStockLevel} onChange={(event) => setEditForm({ ...editForm, minStockLevel: event.target.value })} inputMode="numeric" />
                              </Field>
                              <Field label="Expiry" error={editErrors.expirationDate}>
                                <Input type="date" value={editForm.expirationDate} onChange={(event) => setEditForm({ ...editForm, expirationDate: event.target.value })} />
                              </Field>
                            </>
                          )}
                        </div>
                        {stockQuantityChanged && (
                          <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            <Field label="Why is stock changing?" error={editErrors.reason}>
                              <Select value={editForm.reason} onChange={(event) => setEditForm({ ...editForm, reason: event.target.value })}>
                                <option value="">Select a reason</option>
                                {reasonOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </Select>
                            </Field>
                            <Field label="Note (optional)">
                              <Input value={editForm.note} onChange={(event) => setEditForm({ ...editForm, note: event.target.value })} />
                            </Field>
                          </div>
                        )}
                        <div className="mt-3 flex gap-2">
                          <Button size="sm" onClick={(event) => saveEdit(event, item)} disabled={editSubmitting}>
                            {editSubmitting ? 'Saving…' : 'Save'}
                          </Button>
                          <Button size="sm" variant="secondary" onClick={cancelEdit}>
                            Cancel
                          </Button>
                        </div>
                      </td>
                    </Tr>
                  ) : (
                    <Tr key={item.productId}>
                      <Td className="font-semibold text-ink-900">
                        {item.productName}
                        {item.variant && <span className="block text-xs font-normal text-ink-500">{item.variant}</span>}
                      </Td>
                      <Td priority="lg">{item.categoryName}</Td>
                      <Td numeric>{item.stockQuantity}</Td>
                      <Td numeric priority="md">{item.minStockLevel}</Td>
                      <Td priority="lg">{item.expirationDate ?? '—'}{item.expired && <span className="ml-2 rounded-full bg-status-fail-bg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-status-fail-fg">Expired</span>}</Td>
                      <Td>
                        <StockStatusPill status={stockStatus(item)} />
                      </Td>
                      <Td>
                        <Button size="sm" variant="ghost" onClick={() => startEdit(item)}>
                          Edit
                        </Button>
                      </Td>
                    </Tr>
                  ),
                )}
              </Tbody>
            </Table>
          </div>
        )}
      </Card>
    </section>
  )
}
