// The Ingredients tab of Inventory Management (CLIENT_REVISIONS_PLAN.md,
// R5). Flour, sugar, eggs and the rest — stock only: no recipes, and
// nothing is deducted automatically. Staff record what came in (Restock),
// what was baked with (Usage), what was thrown out (Reject), and a recount
// (Correct). Every change is in the history with who made it.
//
// Admin and cashier both record; adding an ingredient and changing its
// name, unit or minimum is the admin's, as product details are.
import { useEffect, useState } from 'react'
import { apiGet, apiPatch, apiPost } from '../../api/client.js'
import { StockStatusPill } from '../../components/ui/StockStatusPill.jsx'
import { Alert } from '../../components/ui/Alert.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Card } from '../../components/ui/Card.jsx'
import { EmptyState } from '../../components/ui/EmptyState.jsx'
import { Field } from '../../components/ui/Field.jsx'
import { Input } from '../../components/ui/Input.jsx'
import { Select } from '../../components/ui/Select.jsx'
import { Table, Tbody, Td, Th, Thead, Tr } from '../../components/ui/Table.jsx'
import { LoadingRows } from '../../components/ui/Skeleton.jsx'
import { formatDateTime, formatQuantity } from '../../lib/format.js'
import { STOCK_STATUSES, TONES, stockStatus } from '../../lib/stockHealth.js'

// "Add" (the adviser, 2026-10-23), the same as product stock: the amount
// typed is ADDED to what is on hand and saved as a restock, after a
// confirmation showing on hand + added = new total. No reason or note.
// The history below still names older usage, reject and recount rows.
const reasonLabels = { RESTOCK: 'Restock', USAGE: 'Usage', REJECT: 'Reject', CORRECTION: 'Recount' }
const filters = [
  { key: 'ALL', label: 'All' },
  { key: 'GOOD', label: STOCK_STATUSES.GOOD.label, tone: 'good' },
  { key: 'LOW', label: STOCK_STATUSES.LOW.label, tone: 'attention' },
]
const historyPage = 15
const emptyNewForm = { name: '', unit: 'kg', minStockLevel: '', stockQuantity: '' }
// stockStatus() reads product field names; an ingredient has the same two.
const statusOf = (ingredient) => stockStatus(ingredient)

export function IngredientsPanel({ user, initialFilter }) {
  const isAdmin = user.role === 'ADMIN'
  const [ingredients, setIngredients] = useState(null)
  const [units, setUnits] = useState([])
  const [filter, setFilter] = useState(filters.some((option) => option.key === initialFilter) ? initialFilter : 'ALL')
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')

  // The open form on one row: { id, mode: 'move' | 'edit' }.
  const [openRow, setOpenRow] = useState(null)
  const [moveForm, setMoveForm] = useState({ quantity: '' })
  const [confirming, setConfirming] = useState(false)
  const [editForm, setEditForm] = useState({ name: '', unit: '', minStockLevel: '', isActive: true })
  const [rowErrors, setRowErrors] = useState({})
  const [saving, setSaving] = useState(false)

  const [newForm, setNewForm] = useState(emptyNewForm)
  const [newErrors, setNewErrors] = useState({})
  const [adding, setAdding] = useState(false)
  const [showAdd, setShowAdd] = useState(false)

  const [history, setHistory] = useState(null)
  const [historyMore, setHistoryMore] = useState(false)

  const load = async () => {
    try {
      const data = await apiGet('/api/ingredients')
      setIngredients(data.ingredients)
      setUnits(data.units)
    } catch (error) {
      setMessage(error.message)
    }
  }
  const loadHistory = async (count = historyPage) => {
    try {
      const data = await apiGet(`/api/ingredients/movements?limit=${count}`)
      setHistory(data.movements)
      setHistoryMore(data.hasMore)
    } catch (error) {
      setMessage(error.message)
    }
  }
  useEffect(() => {
    load()
    loadHistory()
  }, [])

  // One "Edit" button per ingredient (the user, 2026-10-23), the same as
  // product stock: it opens on Add stock; the admin also has Correct count
  // (the real amount after a stock check) and Details (name, unit,
  // minimum, hide).
  const openCount = (ingredient) => {
    setOpenRow({ id: ingredient.id, mode: 'count' })
    setMoveForm({ quantity: String(Number(ingredient.stockQuantity)) })
    setConfirming(false)
    setRowErrors({})
    setNotice('')
  }
  const reviewCount = (event, ingredient) => {
    event.preventDefault()
    if (!/^\d+(\.\d{1,3})?$/.test(moveForm.quantity.trim())) {
      setRowErrors({ quantity: 'Enter the amount on hand (up to 3 decimals).' })
      return
    }
    if (Number(moveForm.quantity) === Number(ingredient.stockQuantity)) {
      setRowErrors({ quantity: 'That is already the amount on hand.' })
      return
    }
    setRowErrors({})
    setConfirming(true)
  }
  const saveCount = async (ingredient) => {
    setSaving(true)
    setMessage('')
    try {
      const data = await apiPost(`/api/ingredients/${ingredient.id}/movements`, { reason: 'CORRECTION', quantity: moveForm.quantity.trim() })
      setNotice(`${ingredient.name}: count corrected to ${formatQuantity(data.ingredient.stockQuantity, data.ingredient.unit)}.`)
      setConfirming(false)
      close()
      await Promise.all([load(), loadHistory()])
    } catch (error) {
      setRowErrors(error.errors ?? { quantity: error.message })
      setConfirming(false)
    } finally {
      setSaving(false)
    }
  }
  const openMove = (ingredient) => {
    setOpenRow({ id: ingredient.id, mode: 'move' })
    setMoveForm({ quantity: '' })
    setConfirming(false)
    setRowErrors({})
    setNotice('')
  }
  const openEdit = (ingredient) => {
    setOpenRow({ id: ingredient.id, mode: 'edit' })
    setConfirming(false)
    setEditForm({ name: ingredient.name, unit: ingredient.unit, minStockLevel: String(Number(ingredient.minStockLevel)), isActive: ingredient.isActive })
    setRowErrors({})
    setNotice('')
  }
  const close = () => setOpenRow(null)

  const amountToAdd = Number(moveForm.quantity) || 0
  // First press: check the amount, then ask to confirm.
  const reviewMove = (event) => {
    event.preventDefault()
    if (!(amountToAdd > 0) || !/^\d+(\.\d{1,3})?$/.test(moveForm.quantity.trim())) {
      setRowErrors({ quantity: 'Enter the amount to add, more than zero (up to 3 decimals).' })
      return
    }
    setRowErrors({})
    setConfirming(true)
  }
  const saveMove = async (ingredient) => {
    setSaving(true)
    setRowErrors({})
    setMessage('')
    try {
      const data = await apiPost(`/api/ingredients/${ingredient.id}/movements`, { reason: 'RESTOCK', quantity: moveForm.quantity.trim() })
      setNotice(`${ingredient.name}: added ${formatQuantity(amountToAdd, ingredient.unit)} — ${formatQuantity(data.ingredient.stockQuantity, data.ingredient.unit)} on hand.`)
      setConfirming(false)
      close()
      await Promise.all([load(), loadHistory()])
    } catch (error) {
      setRowErrors(error.errors ?? {})
      if (!error.errors) setMessage(error.message)
      setConfirming(false)
    } finally {
      setSaving(false)
    }
  }
  const saveEdit = async (event, ingredient) => {
    event.preventDefault()
    setSaving(true)
    setRowErrors({})
    setMessage('')
    try {
      const body = {}
      if (editForm.name.trim() !== ingredient.name) body.name = editForm.name.trim()
      if (editForm.unit !== ingredient.unit) body.unit = editForm.unit
      if (Number(editForm.minStockLevel) !== Number(ingredient.minStockLevel)) body.minStockLevel = editForm.minStockLevel.trim()
      if (editForm.isActive !== ingredient.isActive) body.isActive = editForm.isActive
      if (Object.keys(body).length) await apiPatch(`/api/ingredients/${ingredient.id}`, body)
      close()
      await load()
    } catch (error) {
      setRowErrors(error.errors ?? {})
      if (!error.errors) setMessage(error.message)
    } finally {
      setSaving(false)
    }
  }
  const addIngredient = async (event) => {
    event.preventDefault()
    setAdding(true)
    setNewErrors({})
    setMessage('')
    try {
      const body = { name: newForm.name.trim(), unit: newForm.unit }
      if (newForm.minStockLevel.trim()) body.minStockLevel = newForm.minStockLevel.trim()
      if (newForm.stockQuantity.trim()) body.stockQuantity = newForm.stockQuantity.trim()
      const data = await apiPost('/api/ingredients', body)
      setNotice(`${data.ingredient.name} added.`)
      setNewForm(emptyNewForm)
      setShowAdd(false)
      await Promise.all([load(), loadHistory()])
    } catch (error) {
      setNewErrors(error.errors ?? {})
      if (!error.errors) setMessage(error.message)
    } finally {
      setAdding(false)
    }
  }

  const statusRank = { LOW: 0, GOOD: 1 }
  const visible = (ingredients ?? [])
    .filter((ingredient) => filter === 'ALL' || statusOf(ingredient) === filter)
    .sort((a, b) => (filter === 'ALL' ? 0 : statusRank[statusOf(a)] - statusRank[statusOf(b)]))

  return (
    <div>
      {message && <div className="mt-4"><Alert variant="error">{message}</Alert></div>}
      {notice && <div className="mt-4"><Alert variant="success">{notice}</Alert></div>}

      {isAdmin && (
        <Card className="mt-6 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-ink-900">Add an ingredient</h2>
            {!showAdd && <Button type="button" size="sm" variant="secondary" onClick={() => setShowAdd(true)}>Add ingredient</Button>}
          </div>
          {showAdd && (
            <form onSubmit={addIngredient} className="mt-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Name" error={newErrors.name}>
                  <Input value={newForm.name} onChange={(event) => setNewForm({ ...newForm, name: event.target.value })} placeholder="e.g. Bread flour" />
                </Field>
                <Field label="Unit" error={newErrors.unit}>
                  <Select value={newForm.unit} onChange={(event) => setNewForm({ ...newForm, unit: event.target.value })}>
                    {units.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                  </Select>
                </Field>
                <Field label="Minimum (optional)" error={newErrors.minStockLevel}>
                  <Input value={newForm.minStockLevel} onChange={(event) => setNewForm({ ...newForm, minStockLevel: event.target.value })} inputMode="decimal" />
                </Field>
                <Field label="On hand now (optional)" error={newErrors.stockQuantity}>
                  <Input value={newForm.stockQuantity} onChange={(event) => setNewForm({ ...newForm, stockQuantity: event.target.value })} inputMode="decimal" />
                </Field>
              </div>
              <div className="mt-3 flex gap-2">
                <Button type="submit" size="sm" disabled={adding}>{adding ? 'Adding…' : 'Add'}</Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => { setShowAdd(false); setNewErrors({}) }}>Cancel</Button>
              </div>
            </form>
          )}
        </Card>
      )}

      <Card className="mt-6 p-6">
        {ingredients && ingredients.length > 0 && (
          <div className="mb-5">
            <p id="ingredient-filter-label" className="text-xs font-semibold uppercase tracking-wide text-ink-500">Status</p>
            <div role="group" aria-labelledby="ingredient-filter-label" className="mt-2 flex flex-wrap gap-2">
              {filters.map((option) => {
                const count = ingredients.filter((ingredient) => option.key === 'ALL' || statusOf(ingredient) === option.key).length
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

        {ingredients === null ? (
          <LoadingRows className="mt-4" />
        ) : ingredients.length === 0 ? (
          <EmptyState title="No ingredients yet" description={isAdmin ? 'Add the first one above.' : 'An admin adds the ingredients the bakery counts.'} />
        ) : visible.length === 0 ? (
          <EmptyState title={`No ingredients are ${filters.find((option) => option.key === filter).label.toLowerCase()} right now`} description="Pick another status, or All." />
        ) : (
          <Table caption="Ingredient stock">
            <Thead>
              <Tr className="hover:bg-transparent">
                <Th>Ingredient</Th>
                <Th align="right">On hand</Th>
                <Th align="right" priority="md">Minimum</Th>
                <Th priority="md">Status</Th>
                <Th>Record</Th>
              </Tr>
            </Thead>
            <Tbody>
              {visible.map((ingredient) => (
                openRow?.id === ingredient.id ? (
                  <Tr key={ingredient.id}>
                    <td colSpan={5} className="px-3 py-3 text-sm text-ink-700"><div className="row-form">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold text-ink-900">{ingredient.name} <span className="font-normal text-ink-500">· {formatQuantity(ingredient.stockQuantity, ingredient.unit)} on hand</span></p>
                        {isAdmin && !confirming && (
                          <div role="tablist" aria-label="What to change" className="inline-flex rounded-full bg-surface-sunk p-0.5">
                            {[['move', 'Add stock', openMove], ['count', 'Correct count', openCount], ['edit', 'Details', openEdit]].map(([key, label, open]) => (
                              <button key={key} type="button" role="tab" aria-selected={openRow.mode === key} onClick={() => open(ingredient)}
                                className={`min-h-8 rounded-full px-3 text-xs font-semibold transition ${openRow.mode === key ? 'bg-surface text-ink-900 shadow-raised' : 'text-ink-500 hover:text-ink-900'}`}>
                                {label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      {openRow.mode === 'count' ? (
                        confirming ? (
                          <div className="mt-2 rounded-panel bg-amber-50 p-3">
                            <p className="font-semibold text-ink-900">Are you sure you want to confirm these changes?</p>
                            <p className="mt-1.5 text-sm">Count: {formatQuantity(ingredient.stockQuantity, ingredient.unit)} → <strong>{formatQuantity(Number(moveForm.quantity), ingredient.unit)}</strong></p>
                            <div className="mt-3 flex gap-2">
                              <Button type="button" size="sm" onClick={() => saveCount(ingredient)} disabled={saving}>{saving ? 'Saving…' : 'Confirm'}</Button>
                              <Button type="button" size="sm" variant="secondary" onClick={() => setConfirming(false)} disabled={saving}>Back</Button>
                            </div>
                          </div>
                        ) : (
                          <form onSubmit={(event) => reviewCount(event, ingredient)} noValidate className="mt-2">
                            <div className="grid gap-3 sm:grid-cols-3">
                              <Field label={`Amount on hand now (${ingredient.unit})`} error={rowErrors.quantity}>
                                <Input value={moveForm.quantity} onChange={(event) => setMoveForm({ quantity: event.target.value.replace(/[^\d.]/g, '').slice(0, 12) })} inputMode="decimal" autoFocus />
                              </Field>
                            </div>
                            <p className="mt-2 text-xs text-ink-500">The system has {formatQuantity(ingredient.stockQuantity, ingredient.unit)}. Enter what is really in the storeroom, for example after a stock check.</p>
                            <div className="mt-3 flex gap-2">
                              <Button type="submit" size="sm">Correct count</Button>
                              <Button type="button" size="sm" variant="secondary" onClick={close}>Cancel</Button>
                            </div>
                          </form>
                        )
                      ) : openRow.mode === 'move' ? (
                        confirming ? (
                          <div className="mt-2 rounded-panel bg-amber-50 p-3">
                            <p className="font-semibold text-ink-900">Are you sure you want to confirm these changes?</p>
                            <p className="mt-1.5 text-sm">
                              {formatQuantity(ingredient.stockQuantity, ingredient.unit)} on hand + {formatQuantity(amountToAdd, ingredient.unit)} added = <strong>{formatQuantity(Number(ingredient.stockQuantity) + amountToAdd, ingredient.unit)}</strong>
                            </p>
                            <div className="mt-3 flex gap-2">
                              <Button type="button" size="sm" onClick={() => saveMove(ingredient)} disabled={saving}>{saving ? 'Saving…' : 'Confirm'}</Button>
                              <Button type="button" size="sm" variant="secondary" onClick={() => setConfirming(false)} disabled={saving}>Back</Button>
                            </div>
                          </div>
                        ) : (
                          <form onSubmit={reviewMove} noValidate className="mt-2">
                            <div className="grid gap-3 sm:grid-cols-3">
                              <Field label={`Amount to add (${ingredient.unit})`} error={rowErrors.quantity ?? rowErrors.reason}>
                                <Input value={moveForm.quantity} onChange={(event) => setMoveForm({ quantity: event.target.value.replace(/[^\d.]/g, '').slice(0, 12) })} inputMode="decimal" placeholder="e.g. 25" autoFocus />
                              </Field>
                            </div>
                            {amountToAdd > 0 && <p className="mt-2 text-xs text-ink-500">{formatQuantity(ingredient.stockQuantity, ingredient.unit)} on hand + {formatQuantity(amountToAdd, ingredient.unit)} = <strong className="text-ink-900">{formatQuantity(Number(ingredient.stockQuantity) + amountToAdd, ingredient.unit)}</strong> after adding</p>}
                            <div className="mt-3 flex gap-2">
                              <Button type="submit" size="sm">Add</Button>
                              <Button type="button" size="sm" variant="secondary" onClick={close}>Cancel</Button>
                            </div>
                          </form>
                        )
                      ) : (
                        <form onSubmit={(event) => saveEdit(event, ingredient)} className="mt-2">
                          <div className="grid gap-3 sm:grid-cols-3">
                            <Field label="Name" error={rowErrors.name}>
                              <Input value={editForm.name} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} />
                            </Field>
                            <Field label="Unit" error={rowErrors.unit}>
                              <Select value={editForm.unit} onChange={(event) => setEditForm({ ...editForm, unit: event.target.value })}>
                                {units.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                              </Select>
                            </Field>
                            <Field label="Minimum" error={rowErrors.minStockLevel}>
                              <Input value={editForm.minStockLevel} onChange={(event) => setEditForm({ ...editForm, minStockLevel: event.target.value })} inputMode="decimal" />
                            </Field>
                          </div>
                          <label className="mt-3 flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={!editForm.isActive} onChange={(event) => setEditForm({ ...editForm, isActive: !event.target.checked })} />
                            No longer used (hide it from this list)
                          </label>
                          <div className="mt-3 flex gap-2">
                            <Button type="submit" size="sm" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
                            <Button type="button" size="sm" variant="secondary" onClick={close}>Cancel</Button>
                          </div>
                        </form>
                      )}
                    </div></td>
                  </Tr>
                ) : (
                  <Tr key={ingredient.id}>
                    <Td className="font-semibold text-ink-900">
                      {ingredient.name}
                      {/* On a phone the Status column is hidden; the pill sits here. */}
                      <span className="mt-1 block md:hidden"><StockStatusPill status={statusOf(ingredient)} /></span>
                    </Td>
                    <Td numeric>{formatQuantity(ingredient.stockQuantity, ingredient.unit)}</Td>
                    <Td numeric priority="md">{formatQuantity(ingredient.minStockLevel, ingredient.unit)}</Td>
                    <Td priority="md"><StockStatusPill status={statusOf(ingredient)} /></Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        <Button type="button" size="sm" variant="ghost" onClick={() => openMove(ingredient)} aria-label={`Edit ${ingredient.name}`}>Edit</Button>
                      </div>
                    </Td>
                  </Tr>
                )
              ))}
            </Tbody>
          </Table>
        )}
      </Card>

      <Card className="mt-6 p-6">
        <h2 className="text-lg font-semibold text-ink-900">History</h2>
        <p className="mt-1 text-sm text-ink-500">Every ingredient change, newest first, with who made it.</p>
        {history === null ? (
          <LoadingRows className="mt-4" />
        ) : history.length === 0 ? (
          <p className="mt-4 text-sm text-ink-500">Nothing recorded yet.</p>
        ) : (
          <>
            <ul className="mt-4 divide-y divide-line-100">
              {history.map((movement) => (
                <li key={movement.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5 text-sm">
                  <span className="min-w-0">
                    <span className="font-semibold text-ink-900">{movement.ingredientName}</span>
                    <span className="text-ink-500"> · {reasonLabels[movement.reason]}{movement.note ? ` — ${movement.note}` : ''}</span>
                    <span className="block text-xs text-ink-500">{formatDateTime(movement.createdAt)}{movement.changedByName ? ` · ${movement.changedByName}` : ''}</span>
                  </span>
                  <span className={`font-semibold tabular-nums ${Number(movement.quantityChange) < 0 ? 'text-status-fail-fg' : 'text-status-done-fg'}`}>
                    {Number(movement.quantityChange) > 0 ? '+' : '−'}{formatQuantity(Math.abs(Number(movement.quantityChange)), movement.unit)}
                  </span>
                </li>
              ))}
            </ul>
            {historyMore && (
              <Button type="button" size="sm" variant="secondary" className="mt-3" onClick={() => loadHistory(history.length + historyPage)}>Show more</Button>
            )}
          </>
        )}
      </Card>
    </div>
  )
}
