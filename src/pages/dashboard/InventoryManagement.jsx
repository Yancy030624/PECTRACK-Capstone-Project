import { useEffect, useState } from 'react'
import { apiGet, apiPatch } from '../../api/client.js'
import { StockStatusPill } from '../../components/ui/StockStatusPill.jsx'
import { STOCK_STATUSES, TONES, stockStatus } from '../../lib/stockHealth.js'
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
import { formatDateTime, formatPeso } from '../../lib/format.js'

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
// "Rejects" is not a status: every reject recorded (the adviser,
// 2026-10-23), listed in place of the stock table.
const breadTypes = [
  { key: 'SOFT', label: 'Soft breads' },
  { key: 'HARD', label: 'Hard breads' },
]
const stockFiltersFor = (type) => [
  { key: 'ALL', label: 'All' },
  { key: 'GOOD', label: STOCK_STATUSES.GOOD.label, tone: 'good' },
  ...(type === 'SOFT'
    ? [{ key: 'SELLING_OUT', label: STOCK_STATUSES.SELLING_OUT.label, tone: 'okay' }, { key: 'SOLD_OUT', label: STOCK_STATUSES.SOLD_OUT.label, tone: 'attention' }]
    : [{ key: 'LOW', label: STOCK_STATUSES.LOW.label, tone: 'attention' }]),
  { key: 'REJECTS', label: 'Rejects' },
]
const matchesFilter = (item, filter) => {
  if (filter === 'ALL' || filter === 'REJECTS') return true
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
      {tab === 'Production' && <ProductionPanel />}
      {tab === 'Ingredients' && <IngredientsPanel user={user} initialFilter={params?.tab === 'Ingredients' ? params.stockFilter : undefined} />}
      {tab === 'Edit Products' && <ProductManagement />}
    </section>
  )
}

function ProductStock({ user, params }) {
  const isAdmin = user.role === 'ADMIN'
  const [breadType, setBreadType] = useState(params?.breadType === 'HARD' ? 'HARD' : 'SOFT')
  const stockFilters = stockFiltersFor(breadType)
  const [stockFilter, setStockFilter] = useState(() => {
    const asked = params?.stockFilter
    return stockFiltersFor(params?.breadType === 'HARD' ? 'HARD' : 'SOFT').some((filter) => filter.key === asked) ? asked : 'ALL'
  })

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

  // The Rejects list (GET /api/inventory/rejects), loaded with the stock
  // so its button shows a count.
  const [rejects, setRejects] = useState([])
  const loadRejects = () => apiGet('/api/inventory/rejects').then((data) => setRejects(data.rejects)).catch(() => setRejects([]))
  useEffect(() => { loadRejects() }, [])
  const visibleRejects = rejects.filter((reject) => reject.stockType === breadType && (categoryFilter === 'ALL' || reject.categoryName === categoryFilter))

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
  const ofType = inventory.filter((item) => item.stockType === breadType)
  const categories = [...new Set(ofType.map((item) => item.categoryName).filter(Boolean))].sort((a, b) => a.localeCompare(b))
  const inCategory = (item) => item.stockType === breadType && (categoryFilter === 'ALL' || item.categoryName === categoryFilter)
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
            <div role="tablist" aria-label="Bread type" className="mb-4 inline-flex rounded-full bg-surface-sunk p-1">
              {breadTypes.map((type) => (
                <button
                  key={type.key}
                  type="button"
                  role="tab"
                  aria-selected={breadType === type.key}
                  onClick={() => { setBreadType(type.key); setStockFilter('ALL'); setCategoryFilter('ALL') }}
                  className={`min-h-9 rounded-full px-4 text-sm font-semibold transition ${breadType === type.key ? 'bg-surface text-ink-900 shadow-raised' : 'text-ink-500 hover:text-ink-900'}`}
                >
                  {type.label} <span className="tabular-nums text-ink-500">{inventory.filter((item) => item.stockType === type.key).length}</span>
                </button>
              ))}
            </div>
            <p id="stock-filter-label" className="text-xs font-semibold uppercase tracking-wide text-ink-500">Status</p>
            <div role="group" aria-labelledby="stock-filter-label" className="mt-2 flex flex-wrap gap-2">
              {stockFilters.map((filter) => {
                const count = filter.key === 'REJECTS' ? visibleRejects.length : inventory.filter((item) => matchesFilter(item, filter.key) && inCategory(item)).length
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
                    const count = stockFilter === 'REJECTS'
                      ? rejects.filter((reject) => reject.stockType === breadType && (category === 'ALL' || reject.categoryName === category)).length
                      : ofType.filter((item) => matchesFilter(item, stockFilter) && (category === 'ALL' || item.categoryName === category)).length
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
        {stockFilter === 'REJECTS' ? (
          visibleRejects.length === 0 ? (
            <EmptyState title="No rejects recorded" description="Record them in Edit Products → Rejects." />
          ) : (
            <Table caption="Rejected products">
              <Thead>
                <Tr className="hover:bg-transparent">
                  <Th>Product</Th>
                  <Th priority="lg">Category</Th>
                  <Th align="right" priority="md">Price</Th>
                  <Th align="right">Pieces</Th>
                  <Th>Why</Th>
                  <Th priority="lg">When</Th>
                </Tr>
              </Thead>
              <Tbody>
                {visibleRejects.map((reject) => (
                  <Tr key={reject.id}>
                    <Td className="font-semibold text-ink-900">
                      {reject.name}
                      {reject.variant && <span className="block text-xs font-normal text-ink-500">{reject.variant}</span>}
                    </Td>
                    <Td priority="lg">{reject.categoryName}</Td>
                    <Td numeric priority="md">{formatPeso(reject.price)}</Td>
                    <Td numeric>{reject.pieces}</Td>
                    <Td>{reject.reason ?? '—'}</Td>
                    <Td priority="lg">
                      {formatDateTime(reject.at)}
                      {reject.recordedBy && <span className="block text-xs text-ink-500">{reject.recordedBy}</span>}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )
        ) : loading ? (
          <LoadingRows className="mt-4" />
        ) : ofType.length === 0 ? (
          <EmptyState title={`No ${breadType === 'SOFT' ? 'soft' : 'hard'} breads yet`} description="Set a product's bread type in Edit Products." />
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
                    // "Min level" input vanished with its column. One cell, one stacked form, every size.
                    <Tr key={item.productId}>
                      <td colSpan={6} className="px-3 py-3 text-sm text-ink-700">
                        <p className="font-semibold text-ink-900">{item.productName}{item.variant ? ` (${item.variant})` : ''}</p>
                        {confirming ? (
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
                      <Td numeric priority="md">
                        {item.stockType === 'HARD'
                          ? <span title="Produce at the minimum, stop at the stop level">{item.minStockLevel} → {item.targetStock || '—'}</span>
                          : <span title="Daily standard (5:00 AM top-up)">{item.standardStock ? `${item.standardStock}/day` : '—'}</span>}
                      </Td>
                      <Td>
                        <StockStatusPill status={stockStatus(item)} />
                      </Td>
                      <Td>
                        <Button size="sm" variant="ghost" onClick={() => startEdit(item)} aria-label={`Add stock to ${item.productName}`}>
                          Add
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
    </div>
  )
}
