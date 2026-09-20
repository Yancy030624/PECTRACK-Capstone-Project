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
import { Table, Tbody, Td, Th, Thead, Tr } from '../../components/ui/Table.jsx'
import { LoadingRows } from '../../components/ui/Skeleton.jsx'
import { formatDateTime, formatPeso } from '../../lib/format.js'

// Phase 9A (RULES-PLANS/PHASE9A_DATA_FOUNDATION_PLAN.md, Decisions 1–3).
// Raw materials — flour, sugar, eggs — are a second stock ledger beside
// the finished goods one in Inventory Management, and this screen is its
// front. Three writes exist and each is its own button, never a free
// stock edit: Purchase (adds stock AND folds the price paid into the
// moving-average cost), Waste (removes), Correction (either way). Every
// one lands as a signed ingredient_movements row; the Movements view is
// that ledger read back.
//
// CASHIER can read everything here (a low-stock ingredient is something
// the counter needs to know) but every write is ADMIN, matching
// routes/ingredients.js's own requireRole gates.

// Must match routes/ingredients.js's `units` set exactly.
const unitOptions = ['kg', 'g', 'L', 'mL', 'pc', 'pack', 'sack', 'dozen']

const emptyNewForm = { name: '', unit: 'kg', minStockLevel: '0' }
const emptyPurchaseForm = { quantity: '', unitCost: '', note: '' }
const emptyAdjustForm = { reason: 'WASTE', quantityChange: '', note: '' }

const reasonLabels = {
  PURCHASE: 'Purchase',
  PRODUCTION_USE: 'Used in production',
  WASTE: 'Waste',
  CORRECTION: 'Correction',
}

// Quantities are NUMERIC(12,3) strings from the API; trim the zeros a
// bakery never types ("25.000 kg" reads as "25 kg").
const formatQuantity = (value) => {
  const number = Number(value)
  if (!Number.isFinite(number)) return '—'
  return number.toLocaleString(undefined, { maximumFractionDigits: 3 })
}

export function IngredientManagement({ user }) {
  const isAdmin = user.role === 'ADMIN'

  const [ingredients, setIngredients] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')
  const [showInactive, setShowInactive] = useState(false)

  const [newForm, setNewForm] = useState(emptyNewForm)
  const [newErrors, setNewErrors] = useState({})
  const [newSubmitting, setNewSubmitting] = useState(false)

  // One open panel at a time, keyed by ingredient id and kind — a row
  // opens as Purchase, Adjust, Edit, or Movements, never two at once.
  const [panel, setPanel] = useState(null)
  const [panelForm, setPanelForm] = useState({})
  const [panelErrors, setPanelErrors] = useState({})
  const [panelSubmitting, setPanelSubmitting] = useState(false)
  const [movements, setMovements] = useState(null)

  const loadIngredients = async () => {
    setLoading(true)
    try {
      const data = await apiGet(`/api/ingredients${showInactive ? '?includeInactive=true' : ''}`)
      setIngredients(data.ingredients)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadIngredients()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showInactive])

  const openPanel = async (ingredient, kind) => {
    setPanel({ id: ingredient.id, kind })
    setPanelErrors({})
    setMessage('')
    if (kind === 'purchase') setPanelForm(emptyPurchaseForm)
    if (kind === 'adjust') setPanelForm(emptyAdjustForm)
    if (kind === 'edit') setPanelForm({ name: ingredient.name, unit: ingredient.unit, minStockLevel: String(ingredient.minStockLevel) })
    if (kind === 'movements') {
      setMovements(null)
      try {
        const data = await apiGet(`/api/ingredients/${ingredient.id}/movements?limit=50`)
        setMovements(data)
      } catch (error) {
        setMessage(error.message)
      }
    }
  }
  const closePanel = () => {
    setPanel(null)
    setPanelForm({})
    setPanelErrors({})
  }
  const updatePanelField = (field, value) => setPanelForm((form) => ({ ...form, [field]: value }))

  const submitNew = async (event) => {
    event.preventDefault()
    setNewSubmitting(true)
    setNewErrors({})
    setMessage('')
    try {
      await apiPost('/api/ingredients', { name: newForm.name, unit: newForm.unit, minStockLevel: newForm.minStockLevel })
      setNewForm(emptyNewForm)
      setNotice(`Added ${newForm.name.trim()}.`)
      await loadIngredients()
    } catch (error) {
      setNewErrors(error.errors ?? {})
      setMessage(error.message)
    } finally {
      setNewSubmitting(false)
    }
  }

  const submitPanel = async (event, ingredient) => {
    event.preventDefault()
    setPanelSubmitting(true)
    setPanelErrors({})
    setMessage('')
    try {
      if (panel.kind === 'purchase') {
        await apiPost(`/api/ingredients/${ingredient.id}/purchase`, { quantity: panelForm.quantity, unitCost: panelForm.unitCost, note: panelForm.note || undefined })
        setNotice(`Recorded a purchase of ${panelForm.quantity} ${ingredient.unit} ${ingredient.name}.`)
      } else if (panel.kind === 'adjust') {
        await apiPost(`/api/ingredients/${ingredient.id}/adjust`, { reason: panelForm.reason, quantityChange: panelForm.quantityChange, note: panelForm.note || undefined })
        setNotice(`Recorded a ${reasonLabels[panelForm.reason].toLowerCase()} on ${ingredient.name}.`)
      } else if (panel.kind === 'edit') {
        const body = {}
        if (panelForm.name !== ingredient.name) body.name = panelForm.name
        if (panelForm.unit !== ingredient.unit) body.unit = panelForm.unit
        if (panelForm.minStockLevel !== String(ingredient.minStockLevel)) body.minStockLevel = panelForm.minStockLevel
        if (Object.keys(body).length > 0) await apiPatch(`/api/ingredients/${ingredient.id}`, body)
      }
      closePanel()
      await loadIngredients()
    } catch (error) {
      setPanelErrors(error.errors ?? {})
      setMessage(error.message)
    } finally {
      setPanelSubmitting(false)
    }
  }

  const toggleActive = async (ingredient) => {
    const verb = ingredient.isActive ? 'Deactivate' : 'Reactivate'
    if (!window.confirm(`${verb} ${ingredient.name}?${ingredient.isActive ? ' Recipes that use it cannot be produced until it is reactivated.' : ''}`)) return
    setMessage('')
    try {
      await apiPatch(`/api/ingredients/${ingredient.id}`, { isActive: !ingredient.isActive })
      await loadIngredients()
    } catch (error) {
      setMessage(error.message)
    }
  }

  const columnCount = 7

  return (
    <section className="min-w-0 flex-1 px-4 pb-10 sm:px-7">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-600">{user.role} PORTAL</p>
      <h1 className="mt-1 text-2xl font-semibold text-ink-900">Ingredients</h1>
      <p className="mt-2 text-sm text-ink-500">{isAdmin ? 'Raw materials on hand, what they cost, and every purchase, waste, and correction recorded against them.' : 'Raw materials on hand and their movement history.'}</p>

      {message && (
        <div className="mt-4">
          <Alert variant="error">{message}</Alert>
        </div>
      )}
      {notice && !message && (
        <div className="mt-4">
          <Alert variant="success">{notice}</Alert>
        </div>
      )}

      {isAdmin && (
        <Card className="mt-6 p-6">
          <h2 className="text-lg font-semibold text-ink-900">New ingredient</h2>
          <p className="mt-1 text-xs text-ink-500">Stock starts at zero — record the first purchase after creating it so the cost is real, not typed.</p>
          <form className="mt-4 grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end" onSubmit={submitNew} noValidate>
            <Field label="Name" error={newErrors.name}>
              <Input value={newForm.name} onChange={(event) => setNewForm({ ...newForm, name: event.target.value })} placeholder="e.g. All-purpose flour" />
            </Field>
            <Field label="Unit" error={newErrors.unit}>
              <Select value={newForm.unit} onChange={(event) => setNewForm({ ...newForm, unit: event.target.value })}>
                {unitOptions.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
              </Select>
            </Field>
            <Field label="Min level" error={newErrors.minStockLevel}>
              <Input value={newForm.minStockLevel} onChange={(event) => setNewForm({ ...newForm, minStockLevel: event.target.value })} inputMode="decimal" />
            </Field>
            <Button type="submit" disabled={newSubmitting}>{newSubmitting ? 'Adding…' : 'Add ingredient'}</Button>
          </form>
        </Card>
      )}

      <Card className="mt-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-ink-900">Stock on hand</h2>
          <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-ink-700">
            <input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} className="h-4 w-4 accent-brand-600" />
            Show deactivated
          </label>
        </div>
        {loading ? (
          <LoadingRows className="mt-4" />
        ) : ingredients.length === 0 ? (
          <EmptyState title="No ingredients yet" description={isAdmin ? 'Add the raw materials your recipes use, then record purchases as they arrive.' : 'An admin has not added any ingredients yet.'} />
        ) : (
          <div className="mt-4">
            <Table caption="Ingredient stock levels">
              <Thead>
                <Tr className="hover:bg-transparent">
                  <Th>Ingredient</Th>
                  <Th align="right">Stock</Th>
                  <Th align="right" priority="md">Min level</Th>
                  <Th align="right" priority="lg">Avg cost / unit</Th>
                  <Th align="right" priority="xl">Stock value</Th>
                  <Th>Status</Th>
                  <Th>Actions</Th>
                </Tr>
              </Thead>
              <Tbody>
                {ingredients.map((ingredient) => (
                  <IngredientRow
                    key={ingredient.id}
                    ingredient={ingredient}
                    isAdmin={isAdmin}
                    columnCount={columnCount}
                    panel={panel?.id === ingredient.id ? panel : null}
                    panelForm={panelForm}
                    panelErrors={panelErrors}
                    panelSubmitting={panelSubmitting}
                    movements={movements}
                    onOpen={openPanel}
                    onClose={closePanel}
                    onField={updatePanelField}
                    onSubmit={submitPanel}
                    onToggleActive={toggleActive}
                  />
                ))}
              </Tbody>
            </Table>
          </div>
        )}
      </Card>
    </section>
  )
}

function IngredientRow({ ingredient, isAdmin, columnCount, panel, panelForm, panelErrors, panelSubmitting, movements, onOpen, onClose, onField, onSubmit, onToggleActive }) {
  const stockValue = Number(ingredient.stockQuantity) * Number(ingredient.averageUnitCost)
  return (
    <>
      <Tr>
        <Td className="font-semibold text-ink-900">
          {ingredient.name}
          <span className="block text-xs font-normal text-ink-500">per {ingredient.unit}</span>
        </Td>
        <Td numeric>{formatQuantity(ingredient.stockQuantity)} {ingredient.unit}</Td>
        <Td numeric priority="md">{formatQuantity(ingredient.minStockLevel)}</Td>
        <Td numeric priority="lg">{formatPeso(ingredient.averageUnitCost)}</Td>
        <Td numeric priority="xl">{formatPeso(stockValue)}</Td>
        <Td>
          {!ingredient.isActive ? (
            <StatusBadge status="INACTIVE" label="Deactivated" />
          ) : (
            <StatusBadge status={ingredient.lowStock ? 'INACTIVE' : 'ACTIVE'} label={ingredient.lowStock ? 'Low stock' : 'OK'} />
          )}
        </Td>
        <Td>
          {/* Cashiers get the ledger read-only: Movements is the one
              button every role has; the writes are admin's. */}
          <div className="flex flex-wrap gap-2">
            {isAdmin && ingredient.isActive && <Button type="button" size="sm" variant="secondary" onClick={() => onOpen(ingredient, 'purchase')}>Purchase</Button>}
            {isAdmin && ingredient.isActive && <Button type="button" size="sm" variant="secondary" onClick={() => onOpen(ingredient, 'adjust')}>Adjust</Button>}
            {isAdmin && <Button type="button" size="sm" variant="secondary" onClick={() => onOpen(ingredient, 'edit')}>Edit</Button>}
            <Button type="button" size="sm" variant="ghost" onClick={() => onOpen(ingredient, 'movements')}>Movements</Button>
            {isAdmin && <Button type="button" size="sm" variant={ingredient.isActive ? 'destructive' : 'secondary'} onClick={() => onToggleActive(ingredient)}>{ingredient.isActive ? 'Deactivate' : 'Reactivate'}</Button>}
          </div>
        </Td>
      </Tr>
      {panel && (
        <Tr className="hover:bg-transparent">
          <td colSpan={columnCount} className="bg-surface-sunk px-3 py-4 text-sm text-ink-700">
            {panel.kind === 'purchase' && (
              <form onSubmit={(event) => onSubmit(event, ingredient)} noValidate>
                <p className="font-semibold text-ink-900">Record a purchase of {ingredient.name}</p>
                <p className="mt-1 text-xs text-ink-500">Stock goes up by the quantity; the price paid is folded into the average cost (now {formatPeso(ingredient.averageUnitCost)} per {ingredient.unit}).</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <Field label={`Quantity (${ingredient.unit})`} error={panelErrors.quantity}>
                    <Input value={panelForm.quantity ?? ''} onChange={(event) => onField('quantity', event.target.value)} inputMode="decimal" autoFocus />
                  </Field>
                  <Field label={`Price paid per ${ingredient.unit} (₱)`} error={panelErrors.unitCost}>
                    <Input value={panelForm.unitCost ?? ''} onChange={(event) => onField('unitCost', event.target.value)} inputMode="decimal" />
                  </Field>
                  <Field label="Note (optional)">
                    <Input value={panelForm.note ?? ''} onChange={(event) => onField('note', event.target.value)} placeholder="Supplier, receipt no." />
                  </Field>
                </div>
                <PanelButtons submitting={panelSubmitting} label="Record purchase" onClose={onClose} />
              </form>
            )}
            {panel.kind === 'adjust' && (
              <form onSubmit={(event) => onSubmit(event, ingredient)} noValidate>
                <p className="font-semibold text-ink-900">Adjust {ingredient.name}</p>
                <p className="mt-1 text-xs text-ink-500">Waste always removes stock (enter a negative number). A correction can go either way — it is a recount, not a purchase, so it never changes the average cost.</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <Field label="Reason" error={panelErrors.reason}>
                    <Select value={panelForm.reason ?? 'WASTE'} onChange={(event) => onField('reason', event.target.value)}>
                      <option value="WASTE">Waste (spoiled, spilled, expired)</option>
                      <option value="CORRECTION">Correction (recount)</option>
                    </Select>
                  </Field>
                  <Field label={`Change (${ingredient.unit}, signed)`} error={panelErrors.quantityChange}>
                    <Input value={panelForm.quantityChange ?? ''} onChange={(event) => onField('quantityChange', event.target.value)} inputMode="decimal" placeholder="e.g. -2.5" autoFocus />
                  </Field>
                  <Field label="Note (optional)">
                    <Input value={panelForm.note ?? ''} onChange={(event) => onField('note', event.target.value)} />
                  </Field>
                </div>
                <PanelButtons submitting={panelSubmitting} label="Record adjustment" onClose={onClose} />
              </form>
            )}
            {panel.kind === 'edit' && (
              <form onSubmit={(event) => onSubmit(event, ingredient)} noValidate>
                <p className="font-semibold text-ink-900">Edit {ingredient.name}</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <Field label="Name" error={panelErrors.name}>
                    <Input value={panelForm.name ?? ''} onChange={(event) => onField('name', event.target.value)} />
                  </Field>
                  <Field label="Unit" error={panelErrors.unit} help="Changing the unit does not convert existing stock.">
                    <Select value={panelForm.unit ?? ''} onChange={(event) => onField('unit', event.target.value)}>
                      {unitOptions.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                    </Select>
                  </Field>
                  <Field label="Min level" error={panelErrors.minStockLevel}>
                    <Input value={panelForm.minStockLevel ?? ''} onChange={(event) => onField('minStockLevel', event.target.value)} inputMode="decimal" />
                  </Field>
                </div>
                <PanelButtons submitting={panelSubmitting} label="Save" onClose={onClose} />
              </form>
            )}
            {panel.kind === 'movements' && (
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-ink-900">Movements — {ingredient.name}</p>
                  <Button type="button" size="sm" variant="ghost" onClick={onClose}>Close</Button>
                </div>
                {movements === null ? (
                  <LoadingRows className="mt-3" />
                ) : movements.movements.length === 0 ? (
                  <p className="mt-3 text-xs text-ink-500">No movements recorded yet.</p>
                ) : (
                  <div className="mt-3">
                    <Table caption={`Movements for ${ingredient.name}`}>
                      <Thead>
                        <Tr className="hover:bg-transparent">
                          <Th>When</Th>
                          <Th>Reason</Th>
                          <Th align="right">Change</Th>
                          <Th align="right" priority="md">Unit cost</Th>
                          <Th priority="lg">By</Th>
                          <Th priority="lg">Note</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {movements.movements.map((movement) => (
                          <Tr key={movement.id}>
                            <Td className="whitespace-nowrap">{formatDateTime(movement.createdAt)}</Td>
                            <Td>
                              {reasonLabels[movement.reason] ?? movement.reason}
                              {movement.batchId && <span className="block text-xs text-ink-500">Batch #{movement.batchId}</span>}
                              {movement.dataSource !== 'RECORDED' && <span className="ml-2 rounded-full bg-status-wait-bg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-status-wait-fg">{movement.dataSource}</span>}
                            </Td>
                            <Td numeric className={`font-semibold ${Number(movement.quantityChange) < 0 ? 'text-status-fail-fg' : 'text-status-done-fg'}`}>{Number(movement.quantityChange) > 0 ? '+' : ''}{formatQuantity(movement.quantityChange)}</Td>
                            <Td numeric priority="md">{movement.unitCost == null ? '—' : formatPeso(movement.unitCost)}</Td>
                            <Td priority="lg">{movement.changedByName ?? '—'}</Td>
                            <Td priority="lg">{movement.note ?? '—'}</Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                    {movements.hasMore && <p className="mt-2 text-xs text-ink-500">Showing the latest {movements.movements.length} of {movements.total}.</p>}
                  </div>
                )}
              </div>
            )}
          </td>
        </Tr>
      )}
    </>
  )
}

function PanelButtons({ submitting, label, onClose }) {
  return (
    <div className="mt-3 flex gap-2">
      <Button type="submit" size="sm" disabled={submitting}>{submitting ? 'Saving…' : label}</Button>
      <Button type="button" size="sm" variant="secondary" onClick={onClose}>Cancel</Button>
    </div>
  )
}
