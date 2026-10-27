import { useEffect, useState } from 'react'
import { apiGet, apiPatch } from '../../api/client.js'
import { StockStatusPill } from '../../components/ui/StockStatusPill.jsx'
import { STOCK_STATUSES, TONES, stockStatus } from '../../lib/stockHealth.js'
import { useLiveStock } from '../../lib/useLiveStock.js'
import { ProductionPanel } from './ProductionPanel.jsx'
import { Alert } from '../../components/ui/Alert.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Card } from '../../components/ui/Card.jsx'
import { EmptyState } from '../../components/ui/EmptyState.jsx'
import { Field } from '../../components/ui/Field.jsx'
import { Input } from '../../components/ui/Input.jsx'
import { Table, Tbody, Td, Th, Thead, Tr } from '../../components/ui/Table.jsx'
import { LoadingRows } from '../../components/ui/Skeleton.jsx'
import { IngredientsPanel } from './IngredientsPanel.jsx'
import { ProductManagement } from './ProductManagement.jsx'

// "Add" stock (the adviser, 2026-10-23): the pieces typed are ADDED to
// what is on the shelf — 7 camachile plus 50 is 57, never 50 — and saved
// as a restock. No reason or note to fill in, and a confirmation shows the
// new totals before anything is saved.
const emptyAddForm = { addQuantity: '', minStockLevel: '' }

// Admin and cashier both add stock here, with no approval step
// (CLIENT_REVISIONS_PLAN.md, R1): cashiers encode stock, and every change
// is in the movement ledger with who made it. The minimum level is
// admin-only. Each row's status (Good / Low stock) comes from
// lib/stockHealth.js — the same rule the Dashboard counts with — and the
// Status filter above the table narrows the list to one of them.
// The status filter's choices.
//
// Soft breads and hard breads are listed apart (the user, 2026-10-23),
// each with its own statuses: a soft bread is "About to be sold out" or
// "Sold out today", never "Low stock"; a hard bread keeps "Low stock".
// No rejects list: the bakery does not record rejects (the client,
// 2026-10-23). When bread is thrown away the admin corrects the count
// instead ("Correct count", below), so the shelf figure stays true.
// One list since the panel's revisions (2026-10-26; MINOR_REVISIONS_PLAN.md
// M11): soft and hard breads together, each row still labelled Soft or
// Hard, and the status filter offers every status.
const stockFilters = [
  { key: 'ALL', label: 'All' },
  { key: 'GOOD', label: STOCK_STATUSES.GOOD.label, tone: 'good' },
  { key: 'SELLING_OUT', label: STOCK_STATUSES.SELLING_OUT.label, tone: 'okay' },
  { key: 'SOLD_OUT', label: STOCK_STATUSES.SOLD_OUT.label, tone: 'attention' },
  { key: 'LOW', label: STOCK_STATUSES.LOW.label, tone: 'attention' },
]
const matchesFilter = (item, filter) => {
  if (filter === 'ALL') return true
  return stockStatus(item) === filter
}

// Two tabs (CLIENT_REVISIONS_PLAN.md, R5): Products, the finished goods for
// sale, and Ingredients, what they are baked from. `params.tab` picks one
// and `params.stockFilter` opens it already filtered — the Dashboard's Low
// stock tile sends 'LOW', so it shows only what is low.
//
// A third tab, Edit Products (the user, 2026-10-16), is what used to be
// the Product Management module: adding products, prices, photos,
// categories, on sale or not. Admin only, as that module was.
export function InventoryManagement({ user, params }) {
  // Production (RULES-PLANS/DAILY_STOCK_PLAN.md): what to bake tomorrow.
  const tabs = user.role === 'ADMIN' ? ['Products', 'Production', 'Ingredients', 'Edit Products'] : ['Products', 'Production', 'Ingredients']
  const [tab, setTab] = useState(tabs.includes(params?.tab) ? params.tab : 'Products')
  return (
    <section className="min-w-0 flex-1 px-4 pb-10 sm:px-7">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-600">{user.role} PORTAL</p>
      <h1 className="mt-1 text-2xl font-semibold text-ink-900">Inventory Management</h1>
      <div className="mt-4 flex flex-wrap gap-2" role="tablist">
        {tabs.map((name) => (
          <Button key={name} type="button" size="sm" role="tab" aria-selected={tab === name} variant={tab === name ? 'primary' : 'secondary'} onClick={() => setTab(name)}>
            {name}
          </Button>
        ))}
      </div>
      {tab === 'Products' && <ProductStock user={user} params={params} />}
      {tab === 'Production' && <ProductionPanel user={user} />}
      {tab === 'Ingredients' && <IngredientsPanel user={user} initialFilter={params?.tab === 'Ingredients' ? params.stockFilter : undefined} />}
      {tab === 'Edit Products' && <ProductManagement />}
    </section>
  )
}

function ProductStock({ user, params }) {
  const isAdmin = user.role === 'ADMIN'
  const [stockFilter, setStockFilter] = useState(() => (stockFilters.some((filter) => filter.key === params?.stockFilter) ? params.stockFilter : 'ALL'))

  // Category filter (the user, 2026-10-16): one more row of buttons under
  // the statuses, built from the categories the stock list actually has.
  const [categoryFilter, setCategoryFilter] = useState('ALL')

  const [inventory, setInventory] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  const [editingProductId, setEditingProductId] = useState(null)
  const [addForm, setAddForm] = useState(emptyAddForm)
  const [editOriginal, setEditOriginal] = useState(null)
  const [editErrors, setEditErrors] = useState({})
  const [editSubmitting, setEditSubmitting] = useState(false)
  // Set once Add is pressed: "Are you sure…?" with the totals, then Confirm.
  const [confirming, setConfirming] = useState(false)
  const [notice, setNotice] = useState('')
  // 'add' or 'count' — "Correct count" is the admin's way to make the
  // shelf figure true again when bread is thrown away (the client keeps
  // no rejects list). Logged as a CORRECTION.
  const [formMode, setFormMode] = useState('add')
  const [countedQuantity, setCountedQuantity] = useState('')


  // `quiet`: a live update (below) re-reads in place, without the loading
  // skeleton, and as a background request that does not count as activity.
  const loadInventory = async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true)
    try {
      const data = await apiGet('/api/inventory', { background: quiet })
      setInventory(data.inventory)
    } catch (error) {
      setMessage(error.message)
    } finally {
      if (!quiet) setLoading(false)
    }
  }

  useEffect(() => {
    loadInventory()
  }, [])

  // Live stock (RULES-PLANS/LIVE_STOCK_PLAN.md): an order, a cancellation,
  // the 5:00 AM top-up or another person's Add changes the counts here
  // without a refresh.
  useLiveStock('inventory', () => loadInventory({ quiet: true }))

  // Deduct (MINOR_REVISIONS_PLAN.md M12): the pieces to take off, never
  // the total — the server subtracts, so a sale at the same moment is not
  // overwritten.
  const startCount = (item) => {
    setEditingProductId(item.productId)
    setFormMode('count')
    setCountedQuantity('')
    setEditOriginal(item)
    setEditErrors({})
    setConfirming(false)
    setNotice('')
  }
  const reviewCount = (event) => {
    event.preventDefault()
    const pieces = Number(countedQuantity)
    if (!(pieces >= 1) || pieces > editOriginal.stockQuantity) {
      setEditErrors({ counted: pieces > editOriginal.stockQuantity ? `Only ${editOriginal.stockQuantity} on hand.` : 'Enter how many pieces to deduct, 1 or more.' })
      return
    }
    setEditErrors({})
    setConfirming(true)
  }
  const confirmCount = async (item) => {
    setEditSubmitting(true)
    try {
      const data = await apiPatch(`/api/inventory/${item.productId}`, { deductQuantity: Number(countedQuantity) })
      setNotice(`${item.productName}: deducted ${countedQuantity} — ${data.item?.stockQuantity ?? item.stockQuantity - Number(countedQuantity)} in stock now.`)
      setEditingProductId(null)
      setConfirming(false)
      await loadInventory()
    } catch (error) {
      setEditErrors({ counted: error.errors?.deductQuantity ?? error.errors?.stockQuantity ?? error.message })
      setConfirming(false)
    } finally {
      setEditSubmitting(false)
    }
  }

  const startEdit = (item) => {
    setFormMode('add')
    setEditingProductId(item.productId)
    setAddForm({ addQuantity: '', minStockLevel: String(item.minStockLevel), standardStock: String(item.standardStock), targetStock: String(item.targetStock) })
    setEditOriginal(item)
    setEditErrors({})
    setConfirming(false)
    setNotice('')
  }

  const cancelEdit = () => {
    setEditingProductId(null)
    setEditOriginal(null)
    setConfirming(false)
  }

  const piecesToAdd = Number(addForm.addQuantity) || 0
  // The levels an admin sets, by bread type (RULES-PLANS/DAILY_STOCK_PLAN.md):
  // a soft bread's daily standard; a hard bread's minimum and stop level.
  const levelFields = editOriginal?.stockType === 'HARD'
    ? [['minStockLevel', 'Produce at (minimum)'], ['targetStock', 'Stop at']]
    : editOriginal?.stockType === 'SOFT' ? [['standardStock', 'Daily standard']] : [['minStockLevel', 'Min level']]
  const changedLevels = isAdmin && editOriginal ? levelFields.filter(([field]) => addForm[field] !== '' && String(editOriginal[field]) !== addForm[field]) : []
  const minChanged = changedLevels.length > 0

  // First press: check, then ask to confirm.
  const reviewAdd = (event) => {
    event.preventDefault()
    const errors = {}
    if (addForm.addQuantity !== '' && !(piecesToAdd >= 1)) errors.addQuantity = 'Enter how many pieces to add, 1 or more.'
    if (editOriginal?.stockType === 'HARD' && Number(addForm.targetStock) > 0 && Number(addForm.targetStock) <= Number(addForm.minStockLevel)) errors.targetStock = 'Stop at must be above the minimum.'
    if (!piecesToAdd && !minChanged) errors.addQuantity = 'Enter how many pieces to add.'
    setEditErrors(errors)
    if (Object.keys(errors).length === 0) setConfirming(true)
  }

  const confirmAdd = async (item) => {
    setEditSubmitting(true)
    setEditErrors({})
    const body = {}
    if (piecesToAdd) body.addQuantity = piecesToAdd
    for (const [field] of changedLevels) body[field] = Number(addForm[field])
    try {
      await apiPatch(`/api/inventory/${item.productId}`, body)
      setNotice(piecesToAdd ? `${item.productName}: added ${piecesToAdd} — ${item.stockQuantity + piecesToAdd} in stock now.` : `${item.productName}: levels saved.`)
      setEditingProductId(null)
      setConfirming(false)
      await loadInventory()
    } catch (error) {
      setEditErrors(error.errors ?? {})
      setMessage(error.message)
      setConfirming(false)
    } finally {
      setEditSubmitting(false)
    }
  }

  // Worst first under a filter that mixes statuses, so what needs
  // attention is never below the fold of what is fine.
  const statusRank = { SOLD_OUT: 0, LOW: 1, SELLING_OUT: 2, GOOD: 3 }
  const ofType = inventory
  const categories = [...new Set(ofType.map((item) => item.categoryName).filter(Boolean))].sort((a, b) => a.localeCompare(b))
  const inCategory = (item) => categoryFilter === 'ALL' || item.categoryName === categoryFilter
  const visibleInventory = inventory
    .filter((item) => matchesFilter(item, stockFilter) && inCategory(item))
    .sort((a, b) => (stockFilter === 'ALL' ? 0 : statusRank[stockStatus(a)] - statusRank[stockStatus(b)]))

  return (
    <div>
      <p className="mt-4 text-sm text-ink-500">Current stock levels. Press Add to put newly baked or delivered pieces on the shelf; every change is logged with who made it.</p>
      {notice && (
        <div className="mt-4">
          <Alert variant="success">{notice}</Alert>
        </div>
      )}

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
                const count = inventory.filter((item) => matchesFilter(item, filter.key) && inCategory(item)).length
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
            {categories.length > 1 && (
              <>
                <p id="category-filter-label" className="mt-4 text-xs font-semibold uppercase tracking-wide text-ink-500">Category</p>
                <div role="group" aria-labelledby="category-filter-label" className="mt-2 flex flex-wrap gap-2">
                  {['ALL', ...categories].map((category) => {
                    const active = categoryFilter === category
                    const count = ofType.filter((item) => matchesFilter(item, stockFilter) && (category === 'ALL' || item.categoryName === category)).length
                    return (
                      <button
                        type="button"
                        key={category}
                        onClick={() => setCategoryFilter(category)}
                        aria-pressed={active}
                        className={`inline-flex min-h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition ${active ? 'border-brand-700 bg-brand-700 text-white' : 'border-line-200 bg-surface text-ink-700 hover:bg-surface-sunk'}`}
                      >
                        {category === 'ALL' ? 'All categories' : category}
                        <span className={`rounded-full px-1.5 text-xs tabular-nums ${active ? 'bg-white/20' : 'bg-surface-sunk text-ink-500'}`}>{count}</span>
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        )}
        {loading ? (
          <LoadingRows className="mt-4" />
        ) : ofType.length === 0 ? (
          <EmptyState title="No products yet" description="Add products in Edit Products." />
        ) : visibleInventory.length === 0 ? (
          <EmptyState title={`No products are ${stockFilters.find((filter) => filter.key === stockFilter).label.toLowerCase()} right now${categoryFilter === 'ALL' ? '' : ` in ${categoryFilter}`}`} description="Pick another status or category, or All." />
        ) : (
          <div>
            <Table caption="Inventory stock levels">
              <Thead>
                <Tr className="hover:bg-transparent">
                  <Th>Product</Th>
                  <Th priority="lg">Category</Th>
                  <Th align="right">Stock</Th>
                  <Th align="right" priority="md">Level</Th>
                  <Th priority="md">Status</Th>
                  <Th>Actions</Th>
                </Tr>
              </Thead>
              <Tbody>
                {visibleInventory.map((item) =>
                  editingProductId === item.productId ? (
                    // The edit form spans the whole row as one cell. It
                    // used to put one input per column, which broke the
                    // moment a column was hidden on a narrow screen: the
                    // "Min level" input vanished with its column. One cell, one stacked form, every size.
                    <Tr key={item.productId}>
                      <td colSpan={6} className="px-3 py-3 text-sm text-ink-700"><div className="row-form">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-semibold text-ink-900">{item.productName}{item.variant ? ` (${item.variant})` : ''}</p>
                          {isAdmin && !confirming && (
                            <div role="tablist" aria-label="What to change" className="inline-flex rounded-full bg-surface-sunk p-0.5">
                              {[['add', 'Add'], ['count', 'Deduct']].map(([key, label]) => (
                                <button
                                  key={key}
                                  type="button"
                                  role="tab"
                                  aria-selected={formMode === key}
                                  onClick={() => (key === 'count' ? startCount(item) : startEdit(item))}
                                  className={`min-h-8 rounded-full px-3 text-xs font-semibold transition ${formMode === key ? 'bg-surface text-ink-900 shadow-raised' : 'text-ink-500 hover:text-ink-900'}`}
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        {formMode === 'count' ? (
                          confirming ? (
                            <div className="mt-2 rounded-panel bg-amber-50 p-3">
                              <p className="font-semibold text-ink-900">Are you sure you want to confirm these changes?</p>
                              <p className="mt-1.5 text-sm">Stock: <span className="tabular-nums">{item.stockQuantity}</span> on hand − <span className="tabular-nums">{countedQuantity}</span> deducted = <strong className="tabular-nums">{item.stockQuantity - Number(countedQuantity)}</strong> pieces</p>
                              <div className="mt-3 flex gap-2">
                                <Button size="sm" onClick={() => confirmCount(item)} disabled={editSubmitting}>{editSubmitting ? 'Saving…' : 'Confirm'}</Button>
                                <Button size="sm" variant="secondary" onClick={() => setConfirming(false)} disabled={editSubmitting}>Back</Button>
                              </div>
                            </div>
                          ) : (
                            <form onSubmit={reviewCount} noValidate>
                              <div className="mt-2 grid gap-3 sm:grid-cols-3">
                                <Field label="Pieces to deduct" error={editErrors.counted}>
                                  <Input value={countedQuantity} onChange={(event) => setCountedQuantity(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" placeholder="e.g. 5" autoFocus />
                                </Field>
                              </div>
                              <p className="mt-2 text-xs text-ink-500">{item.stockQuantity} on hand{Number(countedQuantity) > 0 ? <> − {countedQuantity} = <strong className="text-ink-900">{item.stockQuantity - Number(countedQuantity)}</strong> after deducting</> : ''}. For bread thrown away or found missing at a stock check.</p>
                              <div className="mt-3 flex gap-2">
                                <Button type="submit" size="sm">Deduct</Button>
                                <Button type="button" size="sm" variant="secondary" onClick={cancelEdit}>Cancel</Button>
                              </div>
                            </form>
                          )
                        ) : confirming ? (
                          <div className="mt-2 rounded-panel border border-amber-300 bg-amber-50 p-3">
                            <p className="font-semibold text-ink-900">Are you sure you want to confirm these changes?</p>
                            <ul className="mt-1.5 space-y-0.5 text-sm">
                              {piecesToAdd > 0 && (
                                <li>Stock: <span className="tabular-nums">{item.stockQuantity}</span> on hand + <span className="tabular-nums">{piecesToAdd}</span> added = <strong className="tabular-nums">{item.stockQuantity + piecesToAdd}</strong> pieces</li>
                              )}
                              {changedLevels.map(([field, label]) => (
                                <li key={field}>{label}: <span className="tabular-nums">{item[field]}</span> → <strong className="tabular-nums">{addForm[field]}</strong></li>
                              ))}
                            </ul>
                            <div className="mt-3 flex gap-2">
                              <Button size="sm" onClick={() => confirmAdd(item)} disabled={editSubmitting}>{editSubmitting ? 'Saving…' : 'Confirm'}</Button>
                              <Button size="sm" variant="secondary" onClick={() => setConfirming(false)} disabled={editSubmitting}>Back</Button>
                            </div>
                          </div>
                        ) : (
                          <form onSubmit={reviewAdd} noValidate>
                            <div className="mt-2 grid gap-3 sm:grid-cols-3">
                              <Field label="Pieces to add" error={editErrors.addQuantity}>
                                <Input value={addForm.addQuantity} onChange={(event) => setAddForm({ ...addForm, addQuantity: event.target.value.replace(/\D/g, '').slice(0, 6) })} inputMode="numeric" placeholder="e.g. 50" autoFocus />
                              </Field>
                              {/* Settings, not counts: admin only (routes/inventory.js). */}
                              {isAdmin && levelFields.map(([field, label]) => (
                                <Field key={field} label={label} error={editErrors[field]}>
                                  <Input value={addForm[field]} onChange={(event) => setAddForm({ ...addForm, [field]: event.target.value.replace(/\D/g, '').slice(0, 6) })} inputMode="numeric" />
                                </Field>
                              ))}
                            </div>
                            <p className="mt-2 text-xs text-ink-500">
                              {item.stockQuantity} on hand{piecesToAdd > 0 ? <> + {piecesToAdd} = <strong className="text-ink-900">{item.stockQuantity + piecesToAdd}</strong> after adding</> : ''}
                            </p>
                            <div className="mt-3 flex gap-2">
                              <Button type="submit" size="sm">Add</Button>
                              <Button type="button" size="sm" variant="secondary" onClick={cancelEdit}>Cancel</Button>
                            </div>
                          </form>
                        )}
                      </div></td>
                    </Tr>
                  ) : (
                    <Tr key={item.productId}>
                      <Td className="font-semibold text-ink-900">
                        {item.productName}
                        {item.variant && <span className="block text-xs font-normal text-ink-500">{item.variant}</span>}
                        <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${item.stockType === 'HARD' ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-800'}`}>{item.stockType === 'HARD' ? 'Hard bread' : 'Soft bread'}</span>
                        {/* On a phone the Status column is hidden, so the
                            table fits the screen; the pill sits here. */}
                        <span className="mt-1 block md:hidden"><StockStatusPill status={stockStatus(item)} /></span>
                      </Td>
                      <Td priority="lg">{item.categoryName}</Td>
                      <Td numeric>{item.stockQuantity}</Td>
                      <Td numeric priority="md">
                        {item.stockType === 'HARD'
                          ? <span title="Produce at the minimum, stop at the stop level">{item.minStockLevel} → {item.targetStock || '—'}</span>
                          : <span title="Daily standard (5:00 AM top-up)">{item.standardStock ? `${item.standardStock}/day` : '—'}</span>}
                      </Td>
                      <Td priority="md">
                        <StockStatusPill status={stockStatus(item)} />
                      </Td>
                      <Td>
                        {/* Add and, for the admin, Deduct (the panel, 2026-10-26;
                            MINOR_REVISIONS_PLAN.md M12). */}
                        <div className="flex flex-wrap gap-1">
                          <Button size="sm" variant="ghost" onClick={() => startEdit(item)} aria-label={`Add stock to ${item.productName}`}>Add</Button>
                          {isAdmin && <Button size="sm" variant="ghost" onClick={() => startCount(item)} aria-label={`Deduct stock from ${item.productName}`}>Deduct</Button>}
                        </div>
                      </Td>
                    </Tr>
                  ),
                )}
              </Tbody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  )
}
