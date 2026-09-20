import { useEffect, useState } from 'react'
import { apiGet, apiPatch, apiPost, apiPut } from '../../api/client.js'
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
import { formatPeso } from '../../lib/format.js'

// Phase 9A (RULES-PLANS/PHASE9A_DATA_FOUNDATION_PLAN.md, Decisions 4 and
// 8). A recipe is a dough: ingredient quantities for ONE batch and how
// many base units (pieces, grams, trays) that batch yields. Products are
// mapped onto a recipe from Product Management ("Broas Pack holds 12
// pieces of the Broas dough") — that mapping is shown here read-only so
// an admin sees, next to each product's price, what it costs to make at
// today's average ingredient prices.
//
// The theoretical costs on this screen are computed from CURRENT average
// costs and the recipe's default quantities. They are a preview, not a
// record: the real cost of a product comes from approved production
// batches (Production module, Reporting's Production tab).
//
// ADMIN only, matching routes/recipes.js's write gates and modules.js.

const emptyRecipeForm = { name: '', baseUnit: 'piece', yieldQuantity: '', note: '', ingredients: [{ ingredientId: '', quantity: '' }] }

const formatQuantity = (value) => {
  const number = Number(value)
  if (!Number.isFinite(number)) return '—'
  return number.toLocaleString(undefined, { maximumFractionDigits: 3 })
}

export function RecipeManagement({ user }) {
  const [recipes, setRecipes] = useState([])
  const [ingredients, setIngredients] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')
  const [showInactive, setShowInactive] = useState(false)

  // null = list view; 'new' = the create form; a number = that recipe's
  // detail (view + edit form).
  const [selectedId, setSelectedId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const [form, setForm] = useState(emptyRecipeForm)
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  const loadAll = async () => {
    setLoading(true)
    try {
      const [recipesData, ingredientsData] = await Promise.all([
        apiGet(`/api/recipes${showInactive ? '?includeInactive=true' : ''}`),
        apiGet('/api/ingredients'),
      ])
      setRecipes(recipesData.recipes)
      setIngredients(ingredientsData.ingredients)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showInactive])

  const openRecipe = async (recipeId) => {
    setSelectedId(recipeId)
    setDetail(null)
    setDetailLoading(true)
    setErrors({})
    setMessage('')
    try {
      const data = await apiGet(`/api/recipes/${recipeId}`)
      setDetail(data.recipe)
      setForm({
        name: data.recipe.name,
        baseUnit: data.recipe.baseUnit,
        yieldQuantity: String(data.recipe.yieldQuantity),
        note: data.recipe.note ?? '',
        ingredients: data.recipe.ingredients.map((line) => ({ ingredientId: String(line.ingredientId), quantity: String(line.quantity) })),
      })
    } catch (error) {
      setMessage(error.message)
    } finally {
      setDetailLoading(false)
    }
  }

  const startNew = () => {
    setSelectedId('new')
    setDetail(null)
    setForm(emptyRecipeForm)
    setErrors({})
    setMessage('')
  }

  const backToList = () => {
    setSelectedId(null)
    setDetail(null)
    setErrors({})
  }

  const updateField = (field, value) => setForm((current) => ({ ...current, [field]: value }))
  const updateLine = (index, field, value) => setForm((current) => ({ ...current, ingredients: current.ingredients.map((line, i) => (i === index ? { ...line, [field]: value } : line)) }))
  const addLine = () => setForm((current) => ({ ...current, ingredients: [...current.ingredients, { ingredientId: '', quantity: '' }] }))
  const removeLine = (index) => setForm((current) => ({ ...current, ingredients: current.ingredients.filter((_, i) => i !== index) }))

  const submit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setErrors({})
    setMessage('')
    const body = {
      name: form.name,
      baseUnit: form.baseUnit,
      yieldQuantity: form.yieldQuantity,
      note: form.note || null,
      ingredients: form.ingredients.filter((line) => line.ingredientId || line.quantity).map((line) => ({ ingredientId: Number(line.ingredientId), quantity: line.quantity })),
    }
    try {
      if (selectedId === 'new') {
        const data = await apiPost('/api/recipes', body)
        setNotice(`Created ${data.recipe.name}.`)
        await loadAll()
        await openRecipe(data.recipe.id)
      } else {
        const data = await apiPut(`/api/recipes/${selectedId}`, body)
        setDetail(data.recipe)
        setNotice(`Saved ${data.recipe.name}.`)
        await loadAll()
      }
    } catch (error) {
      setErrors(error.errors ?? {})
      setMessage(error.message)
    } finally {
      setSubmitting(false)
    }
  }

  const toggleActive = async (recipe) => {
    const verb = recipe.isActive ? 'Deactivate' : 'Reactivate'
    if (!window.confirm(`${verb} ${recipe.name}?${recipe.isActive ? ' No new batches can be recorded against it until it is reactivated; past batches keep their record.' : ''}`)) return
    setMessage('')
    try {
      await apiPatch(`/api/recipes/${recipe.id}`, { isActive: !recipe.isActive })
      await loadAll()
      if (selectedId === recipe.id) await openRecipe(recipe.id)
    } catch (error) {
      setMessage(error.message)
    }
  }

  // Ingredients already on another line are still selectable (the server
  // rejects duplicates with a clear message) — hiding them would make a
  // typo-swap between two lines impossible to do in place.
  const ingredientById = new Map(ingredients.map((ingredient) => [String(ingredient.id), ingredient]))
  const previewBatchCost = form.ingredients.reduce((sum, line) => {
    const ingredient = ingredientById.get(line.ingredientId)
    const quantity = Number(line.quantity)
    if (!ingredient || !Number.isFinite(quantity)) return sum
    return sum + quantity * Number(ingredient.averageUnitCost)
  }, 0)
  const previewYield = Number(form.yieldQuantity)
  const previewPerUnit = previewYield > 0 ? previewBatchCost / previewYield : null

  return (
    <section className="min-w-0 flex-1 px-4 pb-10 sm:px-7">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-600">{user.role} PORTAL</p>
      <h1 className="mt-1 text-2xl font-semibold text-ink-900">Recipes</h1>
      <p className="mt-2 text-sm text-ink-500">What goes into one batch of each dough, and what a batch yields. Products are mapped onto a recipe from Product Management.</p>

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

      {selectedId === null ? (
        <Card className="mt-6 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-ink-900">All recipes</h2>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-ink-700">
                <input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} className="h-4 w-4 accent-brand-600" />
                Show deactivated
              </label>
              <Button type="button" size="sm" onClick={startNew} disabled={ingredients.length === 0}>New recipe</Button>
            </div>
          </div>
          {ingredients.length === 0 && !loading && <p className="mt-2 text-xs text-status-wait-fg">Add ingredients first — a recipe is a list of them.</p>}
          {loading ? (
            <LoadingRows className="mt-4" />
          ) : recipes.length === 0 ? (
            <EmptyState title="No recipes yet" description="Start with the doughs you bake most: name, what a batch yields, and the ingredients that go in." />
          ) : (
            <div className="mt-4">
              <Table caption="Recipes">
                <Thead>
                  <Tr className="hover:bg-transparent">
                    <Th>Recipe</Th>
                    <Th align="right">Yield / batch</Th>
                    <Th align="right" priority="md">Ingredients</Th>
                    <Th align="right" priority="md">Products</Th>
                    <Th align="right" priority="lg">Batch cost (today)</Th>
                    <Th>Status</Th>
                    <Th>Actions</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {recipes.map((recipe) => (
                    <Tr key={recipe.id}>
                      <Td className="font-semibold text-ink-900">{recipe.name}</Td>
                      <Td numeric>{formatQuantity(recipe.yieldQuantity)} {recipe.baseUnit}</Td>
                      <Td numeric priority="md">{recipe.ingredientCount}</Td>
                      <Td numeric priority="md">{recipe.productCount}</Td>
                      <Td numeric priority="lg">{formatPeso(recipe.theoreticalBatchCost)}</Td>
                      <Td><StatusBadge status={recipe.isActive ? 'ACTIVE' : 'INACTIVE'} label={recipe.isActive ? 'Active' : 'Deactivated'} /></Td>
                      <Td>
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" size="sm" variant="secondary" onClick={() => openRecipe(recipe.id)}>Open</Button>
                          <Button type="button" size="sm" variant={recipe.isActive ? 'destructive' : 'secondary'} onClick={() => toggleActive(recipe)}>{recipe.isActive ? 'Deactivate' : 'Reactivate'}</Button>
                        </div>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </div>
          )}
        </Card>
      ) : (
        <>
          <div className="mt-6">
            <Button type="button" size="sm" variant="ghost" onClick={backToList}>← All recipes</Button>
          </div>

          {detailLoading ? (
            <Card className="mt-4 p-6"><LoadingRows /></Card>
          ) : (
            <Card className="mt-4 p-6">
              <h2 className="text-lg font-semibold text-ink-900">{selectedId === 'new' ? 'New recipe' : `Edit ${detail?.name ?? 'recipe'}`}</h2>
              {detail && !detail.isActive && <p className="mt-1 text-xs text-status-wait-fg">This recipe is deactivated. Edits are saved, but no batch can be recorded against it.</p>}
              <form className="mt-4 space-y-4" onSubmit={submit} noValidate>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Recipe name" error={errors.name}>
                    <Input value={form.name} onChange={(event) => updateField('name', event.target.value)} placeholder="e.g. Pandesal dough" />
                  </Field>
                  <Field label="Batch counted in" error={errors.baseUnit} help="The unit a batch is measured in — piece, gram, tray.">
                    <Input value={form.baseUnit} onChange={(event) => updateField('baseUnit', event.target.value)} placeholder="piece" />
                  </Field>
                  <Field label={`Yield per batch (${form.baseUnit || 'base units'})`} error={errors.yieldQuantity}>
                    <Input value={form.yieldQuantity} onChange={(event) => updateField('yieldQuantity', event.target.value)} inputMode="decimal" placeholder="e.g. 200" />
                  </Field>
                </div>

                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-ink-700">Ingredients for one batch</p>
                    <Button type="button" size="sm" variant="secondary" onClick={addLine}>Add line</Button>
                  </div>
                  {errors.ingredients && <p className="mt-1 text-xs text-red-700">{errors.ingredients}</p>}
                  <div className="mt-2 space-y-2">
                    {form.ingredients.map((line, index) => {
                      const ingredient = ingredientById.get(line.ingredientId)
                      const lineCost = ingredient && Number.isFinite(Number(line.quantity)) ? Number(line.quantity) * Number(ingredient.averageUnitCost) : null
                      return (
                        <div key={index} className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-center">
                          <Select value={line.ingredientId} onChange={(event) => updateLine(index, 'ingredientId', event.target.value)} aria-label="Ingredient">
                            <option value="">Select an ingredient</option>
                            {ingredients.map((option) => <option key={option.id} value={option.id}>{option.name} ({option.unit})</option>)}
                          </Select>
                          <Input value={line.quantity} onChange={(event) => updateLine(index, 'quantity', event.target.value)} inputMode="decimal" placeholder={ingredient ? `Quantity in ${ingredient.unit}` : 'Quantity'} aria-label="Quantity" />
                          <p className="text-right text-xs text-ink-500 tabular-nums">{lineCost == null ? '' : formatPeso(lineCost)}</p>
                          <Button type="button" size="sm" variant="ghost" onClick={() => removeLine(index)} disabled={form.ingredients.length === 1}>Remove</Button>
                        </div>
                      )
                    })}
                  </div>
                  <p className="mt-2 text-xs text-ink-500">
                    At today's average costs one batch is about <span className="font-semibold text-ink-900">{formatPeso(previewBatchCost)}</span>
                    {previewPerUnit != null && <> — {formatPeso(previewPerUnit)} per {form.baseUnit || 'base unit'}</>}. The real cost is recorded per batch when it is approved.
                  </p>
                </div>

                <Field label="Note (optional)">
                  <Textarea value={form.note} onChange={(event) => updateField('note', event.target.value)} rows={2} placeholder="Proofing time, oven temperature, anything the baker should know." />
                </Field>

                <div className="flex gap-2">
                  <Button type="submit" disabled={submitting}>{submitting ? 'Saving…' : selectedId === 'new' ? 'Create recipe' : 'Save recipe'}</Button>
                  <Button type="button" variant="secondary" onClick={backToList}>Cancel</Button>
                </div>
              </form>
            </Card>
          )}

          {detail && (
            <Card className="mt-6 p-6">
              <h2 className="text-lg font-semibold text-ink-900">Products packed from this recipe</h2>
              <p className="mt-1 text-xs text-ink-500">Set in Product Management (Edit → Recipe and Units per item). Unit cost here uses today's average ingredient prices.</p>
              {detail.products.length === 0 ? (
                <p className="mt-4 text-sm text-ink-500">No product is mapped to this recipe yet, so a batch of it cannot be packed into anything. Map one in Product Management.</p>
              ) : (
                <div className="mt-4">
                  <Table caption={`Products packed from ${detail.name}`}>
                    <Thead>
                      <Tr className="hover:bg-transparent">
                        <Th>Product</Th>
                        <Th align="right">{detail.baseUnit} per item</Th>
                        <Th align="right">Price</Th>
                        <Th align="right">Unit cost (today)</Th>
                        <Th align="right" priority="md">Margin</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {detail.products.map((product) => {
                        const margin = product.theoreticalUnitCost == null ? null : Number(product.price) - Number(product.theoreticalUnitCost)
                        return (
                          <Tr key={product.productId}>
                            <Td className="font-semibold text-ink-900">{product.name}{product.variant ? <span className="block text-xs font-normal text-ink-500">{product.variant}</span> : null}</Td>
                            <Td numeric>{formatQuantity(product.unitsPerItem)}</Td>
                            <Td numeric>{formatPeso(product.price)}</Td>
                            <Td numeric>{product.theoreticalUnitCost == null ? '—' : formatPeso(product.theoreticalUnitCost)}</Td>
                            <Td numeric priority="md" className={margin != null && margin < 0 ? 'font-semibold text-status-fail-fg' : ''}>{margin == null ? '—' : formatPeso(margin)}</Td>
                          </Tr>
                        )
                      })}
                    </Tbody>
                  </Table>
                </div>
              )}
            </Card>
          )}
        </>
      )}
    </section>
  )
}
