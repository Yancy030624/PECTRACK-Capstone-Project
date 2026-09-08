import { useEffect, useRef, useState } from 'react'
import { apiDelete, apiGet, apiPatch, apiPost, apiUpload } from '../../api/client.js'
import { Alert } from '../../components/ui/Alert.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Card } from '../../components/ui/Card.jsx'
import { EmptyState } from '../../components/ui/EmptyState.jsx'
import { Field } from '../../components/ui/Field.jsx'
import { Input } from '../../components/ui/Input.jsx'
import { Select } from '../../components/ui/Select.jsx'
import { StatusBadge } from '../../components/ui/StatusBadge.jsx'
import { Table, Tbody, Td, Th, Thead, Tr } from '../../components/ui/Table.jsx'
import { Textarea } from '../../components/ui/Textarea.jsx'

const emptyProductForm = { categoryId: '', name: '', description: '', price: '', variant: '', availabilityStatus: true }

// Stage 5.5 (RULES-PLANS/UI_AUDIT.md) — admin-only writes, converted onto
// the same primitive kit as the rest of Stage 5.5: Field/Input/Select/
// Textarea replace the three hand-rolled input shapes (H3), <Alert>
// replaces the 10px role="status" paragraph (C3), Available/Unavailable is
// <StatusBadge status="ACTIVE"|"INACTIVE"> (its map already covers both —
// H7), the products table is <Table>/<Th>/<Td> (scope="col" + caption,
// M6) with the peso column right-aligned via <Td numeric> (the audit's
// specific tabular-nums complaint), and the page title drops to 24px/600
// (H1/H2). The category chip list stays a plain <ul> of pills — it isn't
// tabular data.
//
// Untouched: the product-image upload contract. triggerPhotoUpload/
// handlePhotoSelected still drive one shared hidden <input type="file">
// and still call apiUpload(`/api/products/${id}/image`, file) — raw bytes,
// not JSON — exactly as before. handleAddProduct/saveProduct's request
// bodies are unchanged. This is presentation only.
export function ProductManagement({ user }) {
  const isAdmin = user.role === 'ADMIN'

  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  // Category add form.
  const [newCategoryName, setNewCategoryName] = useState('')
  const [categorySubmitting, setCategorySubmitting] = useState(false)
  // Category inline rename.
  const [editingCategoryId, setEditingCategoryId] = useState(null)
  const [editingCategoryName, setEditingCategoryName] = useState('')

  // Product add form.
  const [productForm, setProductForm] = useState(emptyProductForm)
  const [productErrors, setProductErrors] = useState({})
  const [productSubmitting, setProductSubmitting] = useState(false)
  // Product inline edit.
  const [editingProductId, setEditingProductId] = useState(null)
  const [editingProduct, setEditingProduct] = useState(emptyProductForm)
  const [editingProductErrors, setEditingProductErrors] = useState({})
  const [editingProductSubmitting, setEditingProductSubmitting] = useState(false)

  const loadAll = async () => {
    try {
      const [categoriesData, productsData] = await Promise.all([apiGet('/api/categories'), apiGet('/api/products')])
      setCategories(categoriesData.categories)
      setProducts(productsData.products)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
  }, [])

  // --- Categories ---------------------------------------------------------

  const handleAddCategory = async (event) => {
    event.preventDefault()
    setCategorySubmitting(true)
    setMessage('')
    try {
      await apiPost('/api/categories', { name: newCategoryName })
      setNewCategoryName('')
      await loadAll()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setCategorySubmitting(false)
    }
  }

  const startEditCategory = (category) => {
    setEditingCategoryId(category.id)
    setEditingCategoryName(category.name)
  }

  const saveCategory = async (event, categoryId) => {
    event.preventDefault()
    try {
      await apiPatch(`/api/categories/${categoryId}`, { name: editingCategoryName })
      setEditingCategoryId(null)
      await loadAll()
    } catch (error) {
      setMessage(error.message)
    }
  }

  const deleteCategory = async (category) => {
    if (!window.confirm(`Delete category "${category.name}"? This only works if no products use it.`)) return
    try {
      await apiDelete(`/api/categories/${category.id}`)
      await loadAll()
    } catch (error) {
      setMessage(error.message)
    }
  }

  // --- Products -------------------------------------------------------------

  const updateProductField = (field, value) => setProductForm({ ...productForm, [field]: value })
  const updateEditingProductField = (field, value) => setEditingProduct({ ...editingProduct, [field]: value })

  const handleAddProduct = async (event) => {
    event.preventDefault()
    setProductSubmitting(true)
    setMessage('')
    setProductErrors({})
    try {
      await apiPost('/api/products', { ...productForm, price: Number(productForm.price) })
      setProductForm(emptyProductForm)
      await loadAll()
    } catch (error) {
      setProductErrors(error.errors ?? {})
      setMessage(error.message)
    } finally {
      setProductSubmitting(false)
    }
  }

  const startEditProduct = (product) => {
    setEditingProductId(product.id)
    setEditingProduct({ categoryId: product.categoryId, name: product.name, description: product.description ?? '', price: product.price, variant: product.variant ?? '', availabilityStatus: product.availabilityStatus })
    setEditingProductErrors({})
  }

  const cancelEditProduct = () => {
    setEditingProductId(null)
    setEditingProductErrors({})
  }

  const saveProduct = async (event, productId) => {
    event.preventDefault()
    setEditingProductSubmitting(true)
    setEditingProductErrors({})
    try {
      await apiPatch(`/api/products/${productId}`, { ...editingProduct, price: Number(editingProduct.price) })
      setEditingProductId(null)
      await loadAll()
    } catch (error) {
      setEditingProductErrors(error.errors ?? {})
      setMessage(error.message)
    } finally {
      setEditingProductSubmitting(false)
    }
  }

  const deleteProduct = async (product) => {
    if (!window.confirm(`Delete "${product.name}"? This only works if it has no order history — use "Mark unavailable" instead to hide it while keeping records.`)) return
    try {
      await apiDelete(`/api/products/${product.id}`)
      await loadAll()
    } catch (error) {
      setMessage(error.message)
    }
  }

  const toggleAvailability = async (product) => {
    try {
      await apiPatch(`/api/products/${product.id}`, { availabilityStatus: !product.availabilityStatus })
      await loadAll()
    } catch (error) {
      setMessage(error.message)
    }
  }

  // --- Product photos (STOREFRONT_PLAN.md, Decision 5) --------------------
  // One shared hidden file input rather than one per row: a native
  // <input type="file"> can't be styled into the small icon-button this
  // table wants, so each row's "Photo" button just remembers ITS product
  // id and clicks the one hidden input — the standard way to put a custom
  // trigger in front of a file picker.
  const fileInputRef = useRef(null)
  const [pendingImageProductId, setPendingImageProductId] = useState(null)
  const [uploadingImageProductId, setUploadingImageProductId] = useState(null)

  const triggerPhotoUpload = (productId) => {
    setPendingImageProductId(productId)
    fileInputRef.current?.click()
  }

  const handlePhotoSelected = async (event) => {
    const file = event.target.files?.[0]
    // Always reset the input's own value, success or not — selecting the
    // SAME file twice in a row otherwise fires no change event the second
    // time, since the input's value never actually changed.
    event.target.value = ''
    const productId = pendingImageProductId
    setPendingImageProductId(null)
    if (!file || !productId) return

    setUploadingImageProductId(productId)
    setMessage('')
    try {
      await apiUpload(`/api/products/${productId}/image`, file)
      await loadAll()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setUploadingImageProductId(null)
    }
  }

  const removePhoto = async (product) => {
    if (!window.confirm(`Remove the photo for "${product.name}"? The Menu will show a placeholder until a new one is uploaded.`)) return
    try {
      await apiDelete(`/api/products/${product.id}/image`)
      await loadAll()
    } catch (error) {
      setMessage(error.message)
    }
  }

  return (
    <section className="min-w-0 flex-1 px-4 pb-10 sm:px-7">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-600">{user.role} PORTAL</p>
      <h1 className="mt-1 text-2xl font-semibold text-ink-900">Product Management</h1>
      <p className="mt-2 text-sm text-ink-500">{isAdmin ? 'Manage the product catalog and its categories.' : 'Browse the current product catalog.'}</p>

      {message && (
        <div className="mt-4">
          <Alert variant="error">{message}</Alert>
        </div>
      )}

      {/* Categories */}
      <Card className="mt-6 p-6">
        <h2 className="text-lg font-semibold text-ink-900">Categories</h2>
        {isAdmin && (
          <form className="mt-3 flex flex-wrap gap-2" onSubmit={handleAddCategory}>
            <Input value={newCategoryName} onChange={(event) => setNewCategoryName(event.target.value)} placeholder="New category name" className="flex-1" />
            <Button type="submit" size="sm" disabled={categorySubmitting}>{categorySubmitting ? 'Adding…' : 'Add category'}</Button>
          </form>
        )}
        {loading ? (
          <p className="mt-4 text-sm text-ink-500">Loading…</p>
        ) : categories.length === 0 ? (
          <EmptyState title="No categories yet" />
        ) : (
          <ul className="mt-4 flex flex-wrap gap-2">
            {categories.map((category) =>
              editingCategoryId === category.id ? (
                <li key={category.id} className="flex items-center gap-1.5 rounded-full border border-brand-100 bg-surface px-2 py-1">
                  <Input value={editingCategoryName} onChange={(event) => setEditingCategoryName(event.target.value)} aria-label="Category name" className="h-8 w-28 text-xs" />
                  <Button type="button" size="sm" onClick={(event) => saveCategory(event, category.id)}>Save</Button>
                  <Button type="button" size="sm" variant="secondary" onClick={() => setEditingCategoryId(null)}>Cancel</Button>
                </li>
              ) : (
                <li key={category.id} className="flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-700">
                  {category.name}
                  {isAdmin && (
                    <span className="flex gap-1.5 text-xs">
                      <button type="button" onClick={() => startEditCategory(category)} className="text-brand-700 hover:underline">Edit</button>
                      <button type="button" onClick={() => deleteCategory(category)} className="text-red-700 hover:underline">Delete</button>
                    </span>
                  )}
                </li>
              ),
            )}
          </ul>
        )}
      </Card>

      {/* Add a product — admin only */}
      {isAdmin && (
        <Card className="mt-6 p-6">
          <h2 className="text-lg font-semibold text-ink-900">New product</h2>
          <form className="mt-4 space-y-3" onSubmit={handleAddProduct} noValidate>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Category" error={productErrors.categoryId}>
                <Select value={productForm.categoryId} onChange={(event) => updateProductField('categoryId', event.target.value)}>
                  <option value="">Select a category</option>
                  {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </Select>
              </Field>
              <Field label="Product name" error={productErrors.name}>
                <Input value={productForm.name} onChange={(event) => updateProductField('name', event.target.value)} placeholder="e.g. Pandesal" />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Price (₱)" error={productErrors.price}>
                <Input type="number" min="0" step="0.01" value={productForm.price} onChange={(event) => updateProductField('price', event.target.value)} placeholder="0.00" />
              </Field>
              <Field label="Variant (optional)">
                <Input value={productForm.variant} onChange={(event) => updateProductField('variant', event.target.value)} placeholder="e.g. 10-pack" />
              </Field>
            </div>
            <Field label="Description">
              <Textarea value={productForm.description} onChange={(event) => updateProductField('description', event.target.value)} rows={2} />
            </Field>
            <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-ink-700">
              <input type="checkbox" checked={productForm.availabilityStatus} onChange={(event) => updateProductField('availabilityStatus', event.target.checked)} className="h-4 w-4 accent-brand-600" />
              Available for ordering
            </label>
            <Button type="submit" size="sm" disabled={productSubmitting}>{productSubmitting ? 'Creating…' : 'Create product'}</Button>
          </form>
        </Card>
      )}

      {/* Product list */}
      <Card className="mt-6 p-6">
        <h2 className="text-lg font-semibold text-ink-900">Products</h2>
        {/* One shared, invisible file input for every row's photo button —
            see triggerPhotoUpload above for why one input, not one per row. */}
        <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhotoSelected} className="hidden" />
        {loading ? (
          <p className="mt-4 text-sm text-ink-500">Loading…</p>
        ) : products.length === 0 ? (
          <EmptyState title="No products yet" />
        ) : (
          <div className="mt-4">
            <Table caption="Products">
              <Thead>
                <Tr className="hover:bg-transparent">
                  <Th>Photo</Th>
                  <Th>Name</Th>
                  <Th>Category</Th>
                  <Th>Variant</Th>
                  <Th align="right">Price</Th>
                  <Th>Status</Th>
                  {isAdmin && <Th>Actions</Th>}
                </Tr>
              </Thead>
              <Tbody>
                {products.map((product) =>
                  editingProductId === product.id ? (
                    <Tr key={product.id}>
                      <Td>
                        {product.imageUrl ? <img src={product.imageUrl} alt="" className="h-12 w-12 rounded-control object-cover" /> : <div className="grid h-12 w-12 place-items-center rounded-control bg-surface-sunk text-lg">🥐</div>}
                      </Td>
                      <Td>
                        <Input value={editingProduct.name} onChange={(event) => updateEditingProductField('name', event.target.value)} aria-label="Product name" className="h-8 text-xs" />
                        {editingProductErrors.name && <p className="mt-1 text-xs text-red-700">{editingProductErrors.name}</p>}
                      </Td>
                      <Td>
                        <Select value={editingProduct.categoryId} onChange={(event) => updateEditingProductField('categoryId', event.target.value)} aria-label="Category" className="h-8 text-xs">
                          {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                        </Select>
                      </Td>
                      <Td>
                        <Input value={editingProduct.variant} onChange={(event) => updateEditingProductField('variant', event.target.value)} aria-label="Variant" className="h-8 text-xs" />
                      </Td>
                      <Td numeric>
                        <Input type="number" min="0" step="0.01" value={editingProduct.price} onChange={(event) => updateEditingProductField('price', event.target.value)} aria-label="Price" className="h-8 w-24 text-right text-xs" />
                        {editingProductErrors.price && <p className="mt-1 text-xs text-red-700">{editingProductErrors.price}</p>}
                      </Td>
                      <Td><StatusBadge status={product.availabilityStatus ? 'ACTIVE' : 'INACTIVE'} label={product.availabilityStatus ? 'Available' : 'Unavailable'} /></Td>
                      <Td>
                        <div className="flex gap-2">
                          <Button type="button" size="sm" onClick={(event) => saveProduct(event, product.id)} disabled={editingProductSubmitting}>{editingProductSubmitting ? 'Saving…' : 'Save'}</Button>
                          <Button type="button" size="sm" variant="secondary" onClick={cancelEditProduct}>Cancel</Button>
                        </div>
                      </Td>
                    </Tr>
                  ) : (
                    <Tr key={product.id}>
                      <Td>
                        {product.imageUrl ? <img src={product.imageUrl} alt="" className="h-12 w-12 rounded-control object-cover" /> : <div className="grid h-12 w-12 place-items-center rounded-control bg-surface-sunk text-lg">🥐</div>}
                        {isAdmin && (
                          <div className="mt-1 flex flex-col items-start gap-0.5">
                            <button type="button" onClick={() => triggerPhotoUpload(product.id)} disabled={uploadingImageProductId === product.id} className="text-xs font-semibold text-brand-700 hover:underline disabled:cursor-not-allowed disabled:opacity-60">
                              {uploadingImageProductId === product.id ? 'Uploading…' : product.imageUrl ? 'Change' : 'Upload'}
                            </button>
                            {product.imageUrl && <button type="button" onClick={() => removePhoto(product)} className="text-xs font-semibold text-red-700 hover:underline">Remove</button>}
                          </div>
                        )}
                      </Td>
                      <Td className="font-semibold text-ink-900">{product.name}</Td>
                      <Td>{product.categoryName}</Td>
                      <Td>{product.variant ?? '—'}</Td>
                      <Td numeric>₱{product.price}</Td>
                      <Td><StatusBadge status={product.availabilityStatus ? 'ACTIVE' : 'INACTIVE'} label={product.availabilityStatus ? 'Available' : 'Unavailable'} /></Td>
                      {isAdmin && (
                        <Td>
                          <div className="flex flex-wrap gap-2">
                            <Button type="button" size="sm" variant="secondary" onClick={() => startEditProduct(product)}>Edit</Button>
                            <Button type="button" size="sm" variant="secondary" onClick={() => toggleAvailability(product)}>{product.availabilityStatus ? 'Mark unavailable' : 'Mark available'}</Button>
                            <Button type="button" size="sm" variant="destructive" onClick={() => deleteProduct(product)}>Delete</Button>
                          </div>
                        </Td>
                      )}
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
