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
import { Textarea } from '../../components/ui/Textarea.jsx'
import { formatDateTime, formatPeso } from '../../lib/format.js'

// Phase 9A (RULES-PLANS/PHASE9A_DATA_FOUNDATION_PLAN.md, Decisions 5–7).
// A production batch is the one event that ties the two ledgers
// together: ingredients leave (ingredient_movements PRODUCTION_USE),
// finished goods arrive (inventory_movements PRODUCTION), and the cost of
// what left becomes the cost of what arrived. None of that happens until
// the batch is APPROVED — an admin's own batch applies as it is recorded;
// a cashier's waits as PENDING for an admin to approve or reject, and the
// cashier can withdraw it while it waits.
//
// The form asks for what actually happened, not what should have: the
// recipe's quantities are scaled to the planned size as a starting point
// and every line stays editable, because the baker who used a little
// more flour is the only one who knows.

const statusOptions = ['', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']

const formatQuantity = (value) => {
  const number = Number(value)
  if (!Number.isFinite(number)) return '—'
  return number.toLocaleString(undefined, { maximumFractionDigits: 3 })
}

// <input type="datetime-local"> wants local wall time without a zone.
const localDateTimeValue = (date) => {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const emptyForm = () => ({ recipeId: '', plannedQuantity: '', producedQuantity: '', lossQuantity: '0', producedAt: localDateTimeValue(new Date()), note: '', ingredients: [], outputs: {} })

export function ProductionManagement({ user }) {
  const isAdmin = user.role === 'ADMIN'
  const [activeTab, setActiveTab] = useState('batches')
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')

  // ---- Batch list ------------------------------------------------------
  const [statusFilter, setStatusFilter] = useState('')
  const [batches, setBatches] = useState(null)
  const [listLoading, setListLoading] = useState(true)
  const [openBatchId, setOpenBatchId] = useState(null)
  const [openBatch, setOpenBatch] = useState(null)
  const [reviewNote, setReviewNote] = useState('')
  const [reviewing, setReviewing] = useState(false)

  const loadBatches = async () => {
    setListLoading(true)
    try {
      const params = new URLSearchParams({ limit: '50' })
      if (statusFilter) params.set('status', statusFilter)
      const data = await apiGet(`/api/production?${params}`)
      setBatches(data)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setListLoading(false)
    }
  }

  useEffect(() => {
    loadBatches()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter])

  const toggleBatch = async (batchId) => {
    if (openBatchId === batchId) {
      setOpenBatchId(null)
      setOpenBatch(null)
      return
    }
    setOpenBatchId(batchId)
    setOpenBatch(null)
    setReviewNote('')
    try {
      const data = await apiGet(`/api/production/${batchId}`)
      setOpenBatch(data.batch)
    } catch (error) {
      setMessage(error.message)
    }
  }

  const review = async (batch, decision) => {
    const prompts = {
      APPROVED: `Approve batch #${batch.id}? Ingredients are deducted and ${formatQuantity(batch.producedQuantity)} ${batch.baseUnit} of finished stock is added now.`,
      REJECTED: `Reject batch #${batch.id}? Nothing moves; the record stays for reference.`,
      CANCELLED: `Withdraw batch #${batch.id}? It will not be reviewed.`,
    }
    if (!window.confirm(prompts[decision])) return
    setReviewing(true)
    setMessage('')
    try {
      const data = await apiPatch(`/api/production/${batch.id}`, { status: decision, reviewerNote: reviewNote || undefined })
      setOpenBatch(data.batch)
      setNotice(`Batch #${batch.id} ${decision.toLowerCase()}.`)
      await loadBatches()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setReviewing(false)
    }
  }

  // ---- Record form -----------------------------------------------------
  const [recipes, setRecipes] = useState([])
  const [recipeDetail, setRecipeDetail] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    apiGet('/api/recipes').then((data) => setRecipes(data.recipes)).catch((error) => setMessage(error.message))
  }, [])

  const updateField = (field, value) => setForm((current) => ({ ...current, [field]: value }))

  // Scales every recipe line to the planned size — three decimals, the
  // same rounding routes/production.js applies server-side when no lines
  // are sent. The baker then edits whichever lines differed.
  const scaleLines = (detail, planned) => {
    const ratio = Number(planned) > 0 && Number(detail.yieldQuantity) > 0 ? Number(planned) / Number(detail.yieldQuantity) : 0
    return detail.ingredients.map((line) => ({
      ingredientId: line.ingredientId,
      name: line.name,
      unit: line.unit,
      stockQuantity: line.stockQuantity,
      quantityUsed: ratio > 0 ? (Math.round(Number(line.quantity) * ratio * 1000) / 1000).toString() : '',
    }))
  }

  const chooseRecipe = async (recipeId) => {
    setErrors({})
    if (!recipeId) {
      setRecipeDetail(null)
      setForm((current) => ({ ...current, recipeId: '', ingredients: [], outputs: {} }))
      return
    }
    try {
      const data = await apiGet(`/api/recipes/${recipeId}`)
      setRecipeDetail(data.recipe)
      const planned = String(data.recipe.yieldQuantity)
      setForm((current) => ({
        ...current,
        recipeId,
        plannedQuantity: planned,
        producedQuantity: '',
        lossQuantity: '0',
        ingredients: scaleLines(data.recipe, planned),
        outputs: Object.fromEntries(data.recipe.products.map((product) => [product.productId, ''])),
      }))
    } catch (error) {
      setMessage(error.message)
    }
  }

  const changePlanned = (value) => {
    setForm((current) => ({ ...current, plannedQuantity: value, ingredients: recipeDetail ? scaleLines(recipeDetail, value) : current.ingredients }))
  }
  const updateLine = (ingredientId, value) => setForm((current) => ({ ...current, ingredients: current.ingredients.map((line) => (line.ingredientId === ingredientId ? { ...line, quantityUsed: value } : line)) }))
  const updateOutput = (productId, value) => setForm((current) => ({ ...current, outputs: { ...current.outputs, [productId]: value } }))

  const packedBaseUnits = recipeDetail
    ? recipeDetail.products.reduce((sum, product) => sum + (Number(form.outputs[product.productId]) || 0) * Number(product.unitsPerItem), 0)
    : 0
  const producedNumber = Number(form.producedQuantity)
  const packedMatches = Number.isFinite(producedNumber) && Math.abs(packedBaseUnits - producedNumber) < 0.0005
  const shortLines = form.ingredients.filter((line) => Number(line.quantityUsed) > Number(line.stockQuantity))

  const submit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setErrors({})
    setMessage('')
    const body = {
      recipeId: Number(form.recipeId),
      plannedQuantity: form.plannedQuantity,
      producedQuantity: form.producedQuantity,
      lossQuantity: form.lossQuantity === '' ? '0' : form.lossQuantity,
      producedAt: form.producedAt ? new Date(form.producedAt).toISOString() : undefined,
      note: form.note || undefined,
      ingredients: form.ingredients.map((line) => ({ ingredientId: line.ingredientId, quantityUsed: line.quantityUsed })),
      outputs: Object.entries(form.outputs).filter(([, quantity]) => quantity !== '' && Number(quantity) > 0).map(([productId, quantity]) => ({ productId: Number(productId), quantity: Number(quantity) })),
    }
    try {
      const data = await apiPost('/api/production', body)
      setNotice(data.batch.status === 'APPROVED' ? `Batch #${data.batch.id} recorded and applied — ingredients deducted, finished stock added.` : `Batch #${data.batch.id} submitted for approval.`)
      setForm(emptyForm())
      setRecipeDetail(null)
      setActiveTab('batches')
      await loadBatches()
    } catch (error) {
      setErrors(error.errors ?? {})
      setMessage(error.message)
    } finally {
      setSubmitting(false)
    }
  }

  const tabs = [
    { key: 'batches', label: 'Batches' },
    { key: 'record', label: 'Record a batch' },
  ]

  return (
    <section className="min-w-0 flex-1 px-4 pb-10 sm:px-7">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-600">{user.role} PORTAL</p>
      <h1 className="mt-1 text-2xl font-semibold text-ink-900">Production</h1>
      <p className="mt-2 text-sm text-ink-500">{isAdmin ? 'Record what was baked. Approving a batch deducts its ingredients, adds the finished stock, and fixes its cost.' : 'Record what was baked. An admin approves each batch before stock moves.'}</p>

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

      <div className="mt-6 flex gap-2">
        {tabs.map((tab) => (
          <Button type="button" key={tab.key} size="sm" variant={activeTab === tab.key ? 'primary' : 'secondary'} onClick={() => { setActiveTab(tab.key); setMessage('') }}>
            {tab.label}
          </Button>
        ))}
      </div>

      {activeTab === 'batches' && (
        <Card className="mt-6 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-ink-900">Batches</h2>
            <Field label="Status">
              <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="w-auto">
                {statusOptions.map((status) => <option key={status} value={status}>{status ? status.charAt(0) + status.slice(1).toLowerCase() : 'All'}</option>)}
              </Select>
            </Field>
          </div>
          {listLoading && !batches ? (
            <LoadingRows className="mt-4" />
          ) : !batches || batches.batches.length === 0 ? (
            <EmptyState title="No batches yet" description="Record the first one from the tab above." />
          ) : (
            <div className="mt-4">
              <Table caption="Production batches">
                <Thead>
                  <Tr className="hover:bg-transparent">
                    <Th>Batch</Th>
                    <Th priority="md">Produced</Th>
                    <Th align="right">Good</Th>
                    <Th align="right" priority="lg">Loss</Th>
                    <Th align="right" priority="md">Cost</Th>
                    <Th>Status</Th>
                    <Th>Actions</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {batches.batches.map((batch) => (
                    <BatchRows
                      key={batch.id}
                      batch={batch}
                      user={user}
                      open={openBatchId === batch.id}
                      detail={openBatchId === batch.id ? openBatch : null}
                      reviewNote={reviewNote}
                      reviewing={reviewing}
                      onToggle={toggleBatch}
                      onReviewNote={setReviewNote}
                      onReview={review}
                    />
                  ))}
                </Tbody>
              </Table>
              {batches.hasMore && <p className="mt-2 text-xs text-ink-500">Showing the latest {batches.batches.length} of {batches.total}.</p>}
            </div>
          )}
        </Card>
      )}

      {activeTab === 'record' && (
        <Card className="mt-6 p-6">
          <h2 className="text-lg font-semibold text-ink-900">Record a batch</h2>
          {recipes.length === 0 && <p className="mt-2 text-xs text-status-wait-fg">No active recipe yet — an admin creates them in Recipes.</p>}
          <form className="mt-4 space-y-5" onSubmit={submit} noValidate>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Recipe" error={errors.recipeId}>
                <Select value={form.recipeId} onChange={(event) => chooseRecipe(event.target.value)}>
                  <option value="">Select a recipe</option>
                  {recipes.map((recipe) => <option key={recipe.id} value={recipe.id}>{recipe.name}</option>)}
                </Select>
              </Field>
              <Field label={`Planned (${recipeDetail?.baseUnit ?? 'base units'})`} error={errors.plannedQuantity} help={recipeDetail ? `One recipe batch yields ${formatQuantity(recipeDetail.yieldQuantity)} ${recipeDetail.baseUnit}.` : undefined}>
                <Input value={form.plannedQuantity} onChange={(event) => changePlanned(event.target.value)} inputMode="decimal" disabled={!recipeDetail} />
              </Field>
              <Field label="Baked at" error={errors.producedAt}>
                <Input type="datetime-local" value={form.producedAt} onChange={(event) => updateField('producedAt', event.target.value)} />
              </Field>
            </div>

            {recipeDetail && (
              <>
                <div>
                  <p className="text-xs font-semibold text-ink-700">Ingredients used</p>
                  <p className="mt-1 text-xs text-ink-500">Pre-filled from the recipe, scaled to the planned size. Change any line to what was actually used.</p>
                  {errors.ingredients && <p className="mt-1 text-xs text-red-700">{errors.ingredients}</p>}
                  <div className="mt-2">
                    <Table caption="Ingredients used in this batch">
                      <Thead>
                        <Tr className="hover:bg-transparent">
                          <Th>Ingredient</Th>
                          <Th align="right">Used</Th>
                          <Th align="right" priority="md">On hand</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {form.ingredients.map((line) => {
                          const short = Number(line.quantityUsed) > Number(line.stockQuantity)
                          return (
                            <Tr key={line.ingredientId}>
                              <Td className="font-semibold text-ink-900">{line.name}</Td>
                              <Td numeric>
                                <div className="flex items-center justify-end gap-2">
                                  <Input value={line.quantityUsed} onChange={(event) => updateLine(line.ingredientId, event.target.value)} inputMode="decimal" className="w-28 text-right" aria-label={`${line.name} used`} />
                                  <span className="text-xs text-ink-500">{line.unit}</span>
                                </div>
                              </Td>
                              <Td numeric priority="md" className={short ? 'font-semibold text-status-fail-fg' : ''}>{formatQuantity(line.stockQuantity)} {line.unit}</Td>
                            </Tr>
                          )
                        })}
                      </Tbody>
                    </Table>
                  </div>
                  {shortLines.length > 0 && (
                    <p className="mt-2 text-xs font-medium text-status-wait-fg">
                      Not enough {shortLines.map((line) => line.name).join(', ')} on hand — {isAdmin ? 'record the purchase in Ingredients first, or this batch will be refused.' : 'the batch can be submitted, but approval will be refused until the purchase is recorded.'}
                    </p>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={`Came out good (${recipeDetail.baseUnit})`} error={errors.producedQuantity}>
                    <Input value={form.producedQuantity} onChange={(event) => updateField('producedQuantity', event.target.value)} inputMode="decimal" />
                  </Field>
                  <Field label={`Lost (${recipeDetail.baseUnit})`} error={errors.lossQuantity} help="Burned, dropped, failed to rise — base units that never became product.">
                    <Input value={form.lossQuantity} onChange={(event) => updateField('lossQuantity', event.target.value)} inputMode="decimal" />
                  </Field>
                </div>

                <div>
                  <p className="text-xs font-semibold text-ink-700">Packed into</p>
                  {errors.outputs && <p className="mt-1 text-xs text-red-700">{errors.outputs}</p>}
                  {recipeDetail.products.length === 0 ? (
                    <p className="mt-1 text-xs text-status-wait-fg">No product is mapped to this recipe. An admin maps one in Product Management (Edit → Recipe) before a batch can be packed.</p>
                  ) : (
                    <>
                      <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {recipeDetail.products.map((product) => (
                          <Field key={product.productId} label={`${product.name}${product.variant ? ` (${product.variant})` : ''}`} help={`${formatQuantity(product.unitsPerItem)} ${recipeDetail.baseUnit} each`}>
                            <Input value={form.outputs[product.productId] ?? ''} onChange={(event) => updateOutput(product.productId, event.target.value)} inputMode="numeric" placeholder="items" />
                          </Field>
                        ))}
                      </div>
                      <p className={`mt-2 text-xs ${form.producedQuantity === '' ? 'text-ink-500' : packedMatches ? 'text-status-done-fg' : 'font-medium text-status-wait-fg'}`}>
                        Packed {formatQuantity(packedBaseUnits)} {recipeDetail.baseUnit}
                        {form.producedQuantity !== '' && <> of {formatQuantity(form.producedQuantity)} good{packedMatches ? ' — matches.' : ' — must match exactly before the batch can be saved.'}</>}
                      </p>
                    </>
                  )}
                </div>

                <Field label="Note (optional)">
                  <Textarea value={form.note} onChange={(event) => updateField('note', event.target.value)} rows={2} />
                </Field>
              </>
            )}

            <div className="flex gap-2">
              <Button type="submit" disabled={submitting || !recipeDetail}>{submitting ? 'Saving…' : isAdmin ? 'Record and apply' : 'Submit for approval'}</Button>
              <Button type="button" variant="secondary" onClick={() => { setForm(emptyForm()); setRecipeDetail(null); setErrors({}) }}>Clear</Button>
            </div>
          </form>
        </Card>
      )}
    </section>
  )
}

function BatchRows({ batch, user, open, detail, reviewNote, reviewing, onToggle, onReviewNote, onReview }) {
  const isAdmin = user.role === 'ADMIN'
  const canReview = isAdmin && batch.status === 'PENDING'
  const canWithdraw = !isAdmin && batch.status === 'PENDING' && batch.recordedById === user.id
  return (
    <>
      <Tr>
        <Td className="font-semibold text-ink-900">
          #{batch.id} · {batch.recipeName}
          <span className="block text-xs font-normal text-ink-500 md:hidden">{formatDateTime(batch.producedAt)}</span>
          <span className="block text-xs font-normal text-ink-500">by {batch.recordedByName ?? '—'}{batch.dataSource !== 'RECORDED' ? ` · ${batch.dataSource}` : ''}</span>
        </Td>
        <Td priority="md" className="whitespace-nowrap">{formatDateTime(batch.producedAt)}</Td>
        <Td numeric>{formatQuantity(batch.producedQuantity)} {batch.baseUnit}</Td>
        <Td numeric priority="lg">{formatQuantity(batch.lossQuantity)}</Td>
        <Td numeric priority="md">{batch.status === 'APPROVED' ? formatPeso(batch.totalCost) : '—'}</Td>
        <Td><StatusBadge status={batch.status} /></Td>
        <Td>
          <Button type="button" size="sm" variant="secondary" onClick={() => onToggle(batch.id)}>{open ? 'Close' : 'Details'}</Button>
        </Td>
      </Tr>
      {open && (
        <Tr className="hover:bg-transparent">
          <td colSpan={7} className="bg-surface-sunk px-3 py-4 text-sm text-ink-700">
            {!detail ? (
              <LoadingRows />
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Ingredients</p>
                  <Table caption={`Ingredients used in batch ${detail.id}`}>
                    <Thead>
                      <Tr className="hover:bg-transparent">
                        <Th>Ingredient</Th>
                        <Th align="right">Used</Th>
                        <Th align="right">Unit cost</Th>
                        <Th align="right">Cost</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {detail.ingredients.map((line) => (
                        <Tr key={line.ingredientId}>
                          <Td>{line.name}</Td>
                          <Td numeric>{formatQuantity(line.quantityUsed)} {line.unit}</Td>
                          <Td numeric>{line.unitCost == null ? '—' : formatPeso(line.unitCost)}</Td>
                          <Td numeric>{line.lineCost == null ? '—' : formatPeso(line.lineCost)}</Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                  <p className="mt-2 text-xs text-ink-500">
                    {detail.status === 'APPROVED'
                      ? <>Total {formatPeso(detail.totalCost)} — {formatPeso(detail.costPerBaseUnit)} per {detail.baseUnit}. Costs were fixed at approval from each ingredient's average cost then.</>
                      : 'Costs are fixed when the batch is approved.'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Packed into</p>
                  {detail.outputs.length === 0 ? <p className="mt-2 text-xs text-ink-500">Nothing packed (zero good output).</p> : (
                    <Table caption={`Outputs of batch ${detail.id}`}>
                      <Thead>
                        <Tr className="hover:bg-transparent">
                          <Th>Product</Th>
                          <Th align="right">Items</Th>
                          <Th align="right">{detail.baseUnit} each</Th>
                          <Th align="right">Unit cost</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {detail.outputs.map((output) => (
                          <Tr key={output.productId}>
                            <Td>{output.name}{output.variant ? ` (${output.variant})` : ''}</Td>
                            <Td numeric>{output.quantity}</Td>
                            <Td numeric>{formatQuantity(output.unitsPerItem)}</Td>
                            <Td numeric>{output.unitCost == null ? '—' : formatPeso(output.unitCost)}</Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                  )}
                  <div className="mt-3 space-y-1 text-xs text-ink-500">
                    <p>Planned {formatQuantity(detail.plannedQuantity)} · good {formatQuantity(detail.producedQuantity)} · lost {formatQuantity(detail.lossQuantity)} {detail.baseUnit}</p>
                    {detail.note && <p>Note: {detail.note}</p>}
                    {detail.reviewedAt && <p>{detail.status === 'CANCELLED' ? 'Withdrawn' : `${detail.status.charAt(0)}${detail.status.slice(1).toLowerCase()} by ${detail.reviewedByName ?? '—'}`} · {formatDateTime(detail.reviewedAt)}{detail.reviewerNote ? ` — ${detail.reviewerNote}` : ''}</p>}
                  </div>
                  {(canReview || canWithdraw) && (
                    <div className="mt-4">
                      {canReview && (
                        <Field label="Reviewer note (optional)">
                          <Input value={reviewNote} onChange={(event) => onReviewNote(event.target.value)} />
                        </Field>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {canReview && <Button type="button" size="sm" onClick={() => onReview(detail, 'APPROVED')} disabled={reviewing}>Approve</Button>}
                        {canReview && <Button type="button" size="sm" variant="destructive" onClick={() => onReview(detail, 'REJECTED')} disabled={reviewing}>Reject</Button>}
                        {canWithdraw && <Button type="button" size="sm" variant="destructive" onClick={() => onReview(detail, 'CANCELLED')} disabled={reviewing}>Withdraw</Button>}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </td>
        </Tr>
      )}
    </>
  )
}
