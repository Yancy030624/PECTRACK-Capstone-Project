import { useEffect, useMemo, useRef, useState } from 'react'
import { apiDelete, apiGet, apiPatch, apiPost, apiUpload } from '../../api/client.js'
import { Alert } from '../../components/ui/Alert.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Card } from '../../components/ui/Card.jsx'
import { EmptyState } from '../../components/ui/EmptyState.jsx'
import { Field } from '../../components/ui/Field.jsx'
import { Input } from '../../components/ui/Input.jsx'
import { Select } from '../../components/ui/Select.jsx'
import { Textarea } from '../../components/ui/Textarea.jsx'
import { LoadingRows } from '../../components/ui/Skeleton.jsx'
import { formatPeso } from '../../lib/format.js'

const emptyForm = { categoryId: '', name: '', description: '', price: '', variant: '', availabilityStatus: true }

const pill = (active) => `inline-flex min-h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition ${active ? 'border-ink-900 bg-ink-900 text-white' : 'border-line-200 bg-surface text-ink-700 hover:bg-surface-sunk'}`
const countChip = (active) => `rounded-full px-1.5 text-xs tabular-nums ${active ? 'bg-white/20' : 'bg-surface-sunk text-ink-500'}`

// Edit Products — the Edit Products tab of Inventory Management (the user,
// 2026-10-16), what used to be the Product Management module. Admin only:
// every write in routes/products.js is admin-gated.
//
// Made minimal by request: a search box and "Add product" on top, category
// buttons like the stock tab's, and one plain row per product — photo,
// name, price, an On sale switch, Edit. Adding and editing share one form
// that opens above the list; the photo and Delete live inside it, and the
// categories are managed behind their own button, so the list itself
// carries nothing else.
//
// The API calls are the old screen's: POST/PATCH /api/products (price as a
// number), PATCH availabilityStatus for the switch, and the photo upload's
// raw bytes to /api/products/:id/image.
export function ProductManagement() {
  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [messageFailed, setMessageFailed] = useState(false)

  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('ALL')

  // The one form: null (closed), 'new', or the product being edited.
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  // A photo picked while adding a product goes up right after it is created.
  const [newPhoto, setNewPhoto] = useState(null)
  const newPhotoUrl = useMemo(() => (newPhoto ? URL.createObjectURL(newPhoto) : null), [newPhoto])
  useEffect(() => () => { if (newPhotoUrl) URL.revokeObjectURL(newPhotoUrl) }, [newPhotoUrl])
  // Bring the form into view when it opens from a row far down the list.
  const formRef = useRef(null)
  const editingKey = editing === 'new' ? 'new' : editing?.id
  useEffect(() => {
    if (editingKey) formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [editingKey])

  const [showCategories, setShowCategories] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [editingCategoryId, setEditingCategoryId] = useState(null)
  const [editingCategoryName, setEditingCategoryName] = useState('')

  const [busyId, setBusyId] = useState(null)
  const fileInputRef = useRef(null)
  const newPhotoInputRef = useRef(null)

  const say = (text, failed = false) => { setMessage(text); setMessageFailed(failed) }

  const loadAll = async () => {
    try {
      const [categoriesData, productsData] = await Promise.all([apiGet('/api/categories'), apiGet('/api/products')])
      setCategories(categoriesData.categories)
      setProducts(productsData.products)
      return productsData.products
    } catch (error) {
      say(error.message, true)
      return null
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
  }, [])

  // --- The product form ----------------------------------------------------

  const openNew = () => {
    setEditing('new')
    setForm({ ...emptyForm, categoryId: categoryFilter === 'ALL' ? '' : String(categories.find((category) => category.name === categoryFilter)?.id ?? '') })
    setErrors({})
    setNewPhoto(null)
    setMessage('')
  }

  const openEdit = (product) => {
    setEditing(product)
    setForm({ categoryId: product.categoryId, name: product.name, description: product.description ?? '', price: product.price, variant: product.variant ?? '', availabilityStatus: product.availabilityStatus })
    setErrors({})
    setMessage('')
  }

  const closeForm = () => {
    setEditing(null)
    setErrors({})
    setNewPhoto(null)
  }

  const setField = (field, value) => setForm({ ...form, [field]: value })

  const saveForm = async (event) => {
    event.preventDefault()
    setSaving(true)
    setErrors({})
    setMessage('')
    const body = { ...form, price: Number(form.price) }
    try {
      if (editing === 'new') {
        const created = await apiPost('/api/products', body)
        if (newPhoto) await apiUpload(`/api/products/${created.product.id}/image`, newPhoto)
        say(`${form.name} added.`)
      } else {
        await apiPatch(`/api/products/${editing.id}`, body)
        say(`${form.name} saved.`)
      }
      closeForm()
      await loadAll()
    } catch (error) {
      setErrors(error.errors ?? {})
      say(error.message, true)
    } finally {
      setSaving(false)
    }
  }

  const deleteProduct = async (product) => {
    if (!window.confirm(`Delete "${product.name}"? This only works if it was never ordered. To stop selling it but keep its records, turn "On sale" off instead.`)) return
    try {
      await apiDelete(`/api/products/${product.id}`)
      closeForm()
      say(`${product.name} deleted.`)
      await loadAll()
    } catch (error) {
      say(error.message, true)
    }
  }

  const toggleAvailability = async (product) => {
    setBusyId(product.id)
    try {
      await apiPatch(`/api/products/${product.id}`, { availabilityStatus: !product.availabilityStatus })
      await loadAll()
    } catch (error) {
      say(error.message, true)
    } finally {
      setBusyId(null)
    }
  }

  // --- Photo of a product being edited --------------------------------------

  const handlePhotoSelected = async (event) => {
    const file = event.target.files?.[0]
    // Reset so picking the same file again still fires a change.
    event.target.value = ''
    if (!file || !editing || editing === 'new') return
    setBusyId(editing.id)
    setMessage('')
    try {
      await apiUpload(`/api/products/${editing.id}/image`, file)
      const fresh = await loadAll()
      const updated = fresh?.find((product) => product.id === editing.id)
      if (updated) setEditing(updated)
    } catch (error) {
      say(error.message, true)
    } finally {
      setBusyId(null)
    }
  }

  const removePhoto = async () => {
    if (!window.confirm(`Remove the photo of "${editing.name}"? The Menu shows a placeholder until a new one is added.`)) return
    try {
      await apiDelete(`/api/products/${editing.id}/image`)
      const fresh = await loadAll()
      const updated = fresh?.find((product) => product.id === editing.id)
      if (updated) setEditing(updated)
    } catch (error) {
      say(error.message, true)
    }
  }

  // --- Categories -------------------------------------------------------------

  const addCategory = async (event) => {
    event.preventDefault()
    if (!newCategoryName.trim()) return
    try {
      await apiPost('/api/categories', { name: newCategoryName })
      setNewCategoryName('')
      await loadAll()
    } catch (error) {
      say(error.message, true)
    }
  }

  const saveCategory = async (event, categoryId) => {
    event.preventDefault()
    try {
      await apiPatch(`/api/categories/${categoryId}`, { name: editingCategoryName })
      setEditingCategoryId(null)
      await loadAll()
    } catch (error) {
      say(error.message, true)
    }
  }

  const deleteCategory = async (category) => {
    if (!window.confirm(`Delete the category "${category.name}"? This only works if no product uses it.`)) return
    try {
      await apiDelete(`/api/categories/${category.id}`)
      if (categoryFilter === category.name) setCategoryFilter('ALL')
      await loadAll()
    } catch (error) {
      say(error.message, true)
    }
  }

  // --- The list -----------------------------------------------------------

  const term = search.trim().toLowerCase()
  const matchesSearch = (product) => !term || `${product.name} ${product.variant ?? ''}`.toLowerCase().includes(term)
  const visibleProducts = products.filter((product) => matchesSearch(product) && (categoryFilter === 'ALL' || product.categoryName === categoryFilter))

  const productForm = editing && (
    <div ref={formRef} className="scroll-mt-4">
      <Card className="mt-4 p-5">
        <form onSubmit={saveForm} noValidate>
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-base font-semibold text-ink-900">{editing === 'new' ? 'New product' : `Edit ${editing.name}`}</h2>
            <button type="button" onClick={closeForm} className="text-sm font-medium text-ink-500 hover:text-ink-900">Close</button>
          </div>

          <div className="mt-4 flex flex-col gap-5 sm:flex-row">
            {/* Photo */}
            <div className="flex shrink-0 flex-row items-center gap-3 sm:w-32 sm:flex-col sm:items-start">
              {editing === 'new' ? (
                <>
                  {newPhotoUrl ? <img src={newPhotoUrl} alt="" className="h-24 w-24 rounded-control object-cover" /> : <div className="grid h-24 w-24 place-items-center rounded-control bg-surface-sunk text-3xl" aria-hidden="true">🥐</div>}
                  <input ref={newPhotoInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { setNewPhoto(event.target.files?.[0] ?? null); event.target.value = '' }} className="hidden" />
                  <button type="button" onClick={() => newPhotoInputRef.current?.click()} className="text-xs font-semibold text-brand-700 hover:underline">{newPhoto ? 'Change photo' : 'Add photo'}</button>
                </>
              ) : (
                <>
                  {editing.imageUrl ? <img src={editing.imageUrl} alt="" className="h-24 w-24 rounded-control object-cover" /> : <div className="grid h-24 w-24 place-items-center rounded-control bg-surface-sunk text-3xl" aria-hidden="true">🥐</div>}
                  <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhotoSelected} className="hidden" />
                  <div className="flex flex-col items-start gap-1">
                    <button type="button" onClick={() => fileInputRef.current?.click()} disabled={busyId === editing.id} className="text-xs font-semibold text-brand-700 hover:underline disabled:opacity-60">
                      {busyId === editing.id ? 'Uploading…' : editing.imageUrl ? 'Change photo' : 'Add photo'}
                    </button>
                    {editing.imageUrl && <button type="button" onClick={removePhoto} className="text-xs font-semibold text-ink-500 hover:text-red-700 hover:underline">Remove photo</button>}
                  </div>
                </>
              )}
            </div>

            {/* Details */}
            <div className="min-w-0 flex-1 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Name" error={errors.name}>
                  <Input value={form.name} onChange={(event) => setField('name', event.target.value)} placeholder="e.g. Pandesal" />
                </Field>
                <Field label="Price (₱)" error={errors.price}>
                  <Input type="number" min="0" step="0.01" inputMode="decimal" value={form.price} onChange={(event) => setField('price', event.target.value)} placeholder="0.00" />
                </Field>
                <Field label="Category" error={errors.categoryId}>
                  <Select value={form.categoryId} onChange={(event) => setField('categoryId', event.target.value)}>
                    <option value="">Select a category</option>
                    {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                  </Select>
                </Field>
                <Field label="Size or pack (optional)">
                  <Input value={form.variant} onChange={(event) => setField('variant', event.target.value)} placeholder="e.g. 10 pieces" />
                </Field>
              </div>
              <Field label="Description (optional)">
                <Textarea value={form.description} onChange={(event) => setField('description', event.target.value)} rows={2} placeholder="What the customer sees on the Menu" />
              </Field>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-700">
                <input type="checkbox" checked={form.availabilityStatus} onChange={(event) => setField('availabilityStatus', event.target.checked)} className="h-4 w-4 accent-brand-600" />
                On sale (shown on the Menu)
              </label>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line-100 pt-4">
            <Button type="submit" size="sm" disabled={saving}>{saving ? 'Saving…' : editing === 'new' ? 'Add product' : 'Save changes'}</Button>
            <Button type="button" size="sm" variant="secondary" onClick={closeForm}>Cancel</Button>
            {editing !== 'new' && (
              <button type="button" onClick={() => deleteProduct(editing)} className="ml-auto text-sm font-medium text-ink-500 hover:text-red-700 hover:underline">Delete product</button>
            )}
          </div>
        </form>
      </Card>
    </div>
  )

  return (
    <div>
      <p className="mt-4 text-sm text-ink-500">Add, change, or take off sale what the bakery sells. Customers see these on the Menu.</p>

      {message && (
        <div className="mt-4">
          <Alert variant={messageFailed ? 'error' : 'success'}>{message}</Alert>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search products" aria-label="Search products" className="min-w-48 flex-1 sm:max-w-80" />
        <Button type="button" variant="secondary" onClick={() => setShowCategories(!showCategories)} aria-expanded={showCategories}>Categories</Button>
        <Button type="button" onClick={openNew}>Add product</Button>
      </div>

      {showCategories && (
        <Card className="mt-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-base font-semibold text-ink-900">Categories</h2>
            <button type="button" onClick={() => setShowCategories(false)} className="text-sm font-medium text-ink-500 hover:text-ink-900">Close</button>
          </div>
          <ul className="mt-3 divide-y divide-line-100">
            {categories.map((category) => (
              <li key={category.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                {editingCategoryId === category.id ? (
                  <form className="flex flex-1 flex-wrap items-center gap-2" onSubmit={(event) => saveCategory(event, category.id)}>
                    <Input value={editingCategoryName} onChange={(event) => setEditingCategoryName(event.target.value)} aria-label="Category name" className="min-w-40 flex-1 sm:max-w-64" />
                    <Button type="submit" size="sm">Save</Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setEditingCategoryId(null)}>Cancel</Button>
                  </form>
                ) : (
                  <>
                    <span className="flex-1 font-medium text-ink-900">{category.name}</span>
                    <span className="text-xs text-ink-500">{products.filter((product) => product.categoryId === category.id).length} products</span>
                    <button type="button" onClick={() => { setEditingCategoryId(category.id); setEditingCategoryName(category.name) }} className="min-h-8 px-2 text-xs font-semibold text-brand-700 hover:underline">Rename</button>
                    <button type="button" onClick={() => deleteCategory(category)} className="min-h-8 px-2 text-xs font-semibold text-ink-500 hover:text-red-700 hover:underline">Delete</button>
                  </>
                )}
              </li>
            ))}
          </ul>
          <form className="mt-3 flex flex-wrap gap-2" onSubmit={addCategory}>
            <Input value={newCategoryName} onChange={(event) => setNewCategoryName(event.target.value)} placeholder="New category" aria-label="New category name" className="min-w-40 flex-1 sm:max-w-64" />
            <Button type="submit" size="sm" variant="secondary" disabled={!newCategoryName.trim()}>Add category</Button>
          </form>
        </Card>
      )}

      {productForm}

      <Card className="mt-4 p-5">
        {!loading && categories.length > 1 && (
          <div role="group" aria-label="Category" className="mb-4 flex flex-wrap gap-2">
            {['ALL', ...categories.map((category) => category.name)].map((name) => {
              const active = categoryFilter === name
              const count = products.filter((product) => matchesSearch(product) && (name === 'ALL' || product.categoryName === name)).length
              return (
                <button type="button" key={name} onClick={() => setCategoryFilter(name)} aria-pressed={active} className={pill(active)}>
                  {name === 'ALL' ? 'All' : name}
                  <span className={countChip(active)}>{count}</span>
                </button>
              )
            })}
          </div>
        )}

        {loading ? (
          <LoadingRows />
        ) : products.length === 0 ? (
          <EmptyState title="No products yet" description="Add the first one with Add product." />
        ) : visibleProducts.length === 0 ? (
          <EmptyState title="No products match" description="Try another search or category." />
        ) : (
          <ul className="divide-y divide-line-100">
            {visibleProducts.map((product) => (
              <li key={product.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                {product.imageUrl
                  ? <img src={product.imageUrl} alt="" className={`h-12 w-12 shrink-0 rounded-control object-cover ${product.availabilityStatus ? '' : 'opacity-50'}`} />
                  : <div className="grid h-12 w-12 shrink-0 place-items-center rounded-control bg-surface-sunk text-lg" aria-hidden="true">🥐</div>}
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm font-semibold ${product.availabilityStatus ? 'text-ink-900' : 'text-ink-500'}`}>
                    {product.name}{product.variant && <span className="font-normal text-ink-500"> · {product.variant}</span>}
                  </p>
                  <p className="text-xs text-ink-500">{product.categoryName} · <span className="tabular-nums">{formatPeso(product.price)}</span></p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={product.availabilityStatus}
                  aria-label={`${product.name} on sale`}
                  onClick={() => toggleAvailability(product)}
                  disabled={busyId === product.id}
                  className="flex shrink-0 items-center gap-2 text-xs font-medium text-ink-700 disabled:opacity-60"
                >
                  <span className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${product.availabilityStatus ? 'bg-brand-600' : 'bg-line-200'}`}>
                    <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition ${product.availabilityStatus ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </span>
                  <span className="hidden w-14 text-left sm:inline">{product.availabilityStatus ? 'On sale' : 'Off sale'}</span>
                </button>
                <Button type="button" size="sm" variant="ghost" onClick={() => openEdit(product)} aria-label={`Edit ${product.name}`}>Edit</Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
