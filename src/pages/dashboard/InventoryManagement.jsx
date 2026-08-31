// Import state management for the category/product lists and their forms.
import { useEffect, useState } from 'react'
import { apiDelete, apiGet, apiPatch, apiPost } from '../../api/client.js'

const emptyProductForm = { categoryId: '', name: '', description: '', price: '', variant: '', availabilityStatus: true }

// Phase 4 scope: the product catalog itself (categories + products), admin
// full CRUD, everyone else read-only. Stock quantity, min stock level, and
// the cashier-proposes/admin-approves workflow are Phase 5 — not here yet.
export function InventoryManagement({ user }) {
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

  return (
    <section className="min-w-0 flex-1 px-4 pb-10 pt-24 sm:px-7 md:pt-9">
      <p className="text-sm font-semibold text-green-700">{user.role} PORTAL</p>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">Inventory Management</h1>
      <p className="mt-2 text-sm text-slate-500">{isAdmin ? 'Manage the product catalog and its categories.' : 'Browse the current product catalog.'}</p>

      {message && <p role="status" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-[10px] font-semibold text-red-700">{message}</p>}

      {/* Categories */}
      <div className="mt-7 rounded-2xl border border-green-100 bg-white p-6">
        <h2 className="text-lg font-bold">Categories</h2>
        {isAdmin && (
          <form className="mt-3 flex flex-wrap gap-2" onSubmit={handleAddCategory}>
            <input value={newCategoryName} onChange={(event) => setNewCategoryName(event.target.value)} placeholder="New category name" className="flex-1 rounded-xl border border-stone-200 px-3 py-2 text-xs outline-none focus:border-green-700" />
            <button type="submit" disabled={categorySubmitting} className="rounded-xl bg-green-700 px-4 py-2 text-xs font-bold text-white transition hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-60">{categorySubmitting ? 'Adding…' : 'Add category'}</button>
          </form>
        )}
        {loading ? (
          <p className="mt-4 text-sm text-slate-500">Loading…</p>
        ) : categories.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No categories yet.</p>
        ) : (
          <ul className="mt-4 flex flex-wrap gap-2">
            {categories.map((category) =>
              editingCategoryId === category.id ? (
                <li key={category.id} className="flex items-center gap-1.5 rounded-full border border-green-200 bg-white px-2 py-1">
                  <input value={editingCategoryName} onChange={(event) => setEditingCategoryName(event.target.value)} className="w-28 rounded-lg border border-stone-200 px-2 py-1 text-xs outline-none focus:border-green-700" />
                  <button type="button" onClick={(event) => saveCategory(event, category.id)} className="rounded-lg bg-green-700 px-2 py-1 text-[10px] font-bold text-white">Save</button>
                  <button type="button" onClick={() => setEditingCategoryId(null)} className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">Cancel</button>
                </li>
              ) : (
                <li key={category.id} className="flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-800">
                  {category.name}
                  {isAdmin && (
                    <span className="flex gap-1">
                      <button type="button" onClick={() => startEditCategory(category)} className="text-green-700 hover:underline">Edit</button>
                      <button type="button" onClick={() => deleteCategory(category)} className="text-red-700 hover:underline">Delete</button>
                    </span>
                  )}
                </li>
              ),
            )}
          </ul>
        )}
      </div>

      {/* Add a product — admin only */}
      {isAdmin && (
        <div className="mt-6 rounded-2xl border border-green-100 bg-white p-6">
          <h2 className="text-lg font-bold">New product</h2>
          <form className="mt-4 space-y-3" onSubmit={handleAddProduct} noValidate>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="product-category" className="mb-1.5 block text-[11px] font-extrabold">Category</label>
                <select id="product-category" value={productForm.categoryId} onChange={(event) => updateProductField('categoryId', event.target.value)} className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-xs shadow-sm outline-none focus:border-green-700">
                  <option value="">Select a category</option>
                  {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
                {productErrors.categoryId && <p className="mt-1 text-[10px] font-medium text-red-700">{productErrors.categoryId}</p>}
              </div>
              <div>
                <label htmlFor="product-name" className="mb-1.5 block text-[11px] font-extrabold">Product name</label>
                <input id="product-name" value={productForm.name} onChange={(event) => updateProductField('name', event.target.value)} placeholder="e.g. Pandesal" className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-xs shadow-sm outline-none focus:border-green-700" />
                {productErrors.name && <p className="mt-1 text-[10px] font-medium text-red-700">{productErrors.name}</p>}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="product-price" className="mb-1.5 block text-[11px] font-extrabold">Price (₱)</label>
                <input id="product-price" type="number" min="0" step="0.01" value={productForm.price} onChange={(event) => updateProductField('price', event.target.value)} placeholder="0.00" className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-xs shadow-sm outline-none focus:border-green-700" />
                {productErrors.price && <p className="mt-1 text-[10px] font-medium text-red-700">{productErrors.price}</p>}
              </div>
              <div>
                <label htmlFor="product-variant" className="mb-1.5 block text-[11px] font-extrabold">Variant (optional)</label>
                <input id="product-variant" value={productForm.variant} onChange={(event) => updateProductField('variant', event.target.value)} placeholder="e.g. 10-pack" className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-xs shadow-sm outline-none focus:border-green-700" />
              </div>
            </div>
            <div>
              <label htmlFor="product-description" className="mb-1.5 block text-[11px] font-extrabold">Description</label>
              <textarea id="product-description" value={productForm.description} onChange={(event) => updateProductField('description', event.target.value)} rows={2} className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-xs shadow-sm outline-none focus:border-green-700" />
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-[11px] font-bold"><input type="checkbox" checked={productForm.availabilityStatus} onChange={(event) => updateProductField('availabilityStatus', event.target.checked)} className="h-4 w-4 accent-green-700" />Available for ordering</label>
            <button type="submit" disabled={productSubmitting} className="rounded-2xl bg-green-700 px-5 py-2.5 text-xs font-bold text-white shadow-md transition hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-60">{productSubmitting ? 'Creating…' : 'Create product'}</button>
          </form>
        </div>
      )}

      {/* Product list */}
      <div className="mt-6 rounded-2xl border border-green-100 bg-white p-6">
        <h2 className="text-lg font-bold">Products</h2>
        {loading ? (
          <p className="mt-4 text-sm text-slate-500">Loading…</p>
        ) : products.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No products yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-175 text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400">
                  <th className="py-2 pr-4 font-bold">Name</th>
                  <th className="py-2 pr-4 font-bold">Category</th>
                  <th className="py-2 pr-4 font-bold">Variant</th>
                  <th className="py-2 pr-4 font-bold">Price</th>
                  <th className="py-2 pr-4 font-bold">Status</th>
                  {isAdmin && <th className="py-2 pr-4 font-bold">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {products.map((product) =>
                  editingProductId === product.id ? (
                    <tr key={product.id}>
                      <td className="py-3 pr-4"><input value={editingProduct.name} onChange={(event) => updateEditingProductField('name', event.target.value)} className="w-full rounded-lg border border-stone-200 px-2 py-1.5 text-xs outline-none focus:border-green-700" />{editingProductErrors.name && <p className="mt-1 text-[10px] font-medium text-red-700">{editingProductErrors.name}</p>}</td>
                      <td className="py-3 pr-4">
                        <select value={editingProduct.categoryId} onChange={(event) => updateEditingProductField('categoryId', event.target.value)} className="w-full rounded-lg border border-stone-200 px-2 py-1.5 text-xs outline-none focus:border-green-700">
                          {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                        </select>
                      </td>
                      <td className="py-3 pr-4"><input value={editingProduct.variant} onChange={(event) => updateEditingProductField('variant', event.target.value)} className="w-full rounded-lg border border-stone-200 px-2 py-1.5 text-xs outline-none focus:border-green-700" /></td>
                      <td className="py-3 pr-4"><input type="number" min="0" step="0.01" value={editingProduct.price} onChange={(event) => updateEditingProductField('price', event.target.value)} className="w-24 rounded-lg border border-stone-200 px-2 py-1.5 text-xs outline-none focus:border-green-700" />{editingProductErrors.price && <p className="mt-1 text-[10px] font-medium text-red-700">{editingProductErrors.price}</p>}</td>
                      <td className="py-3 pr-4"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${product.availabilityStatus ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>{product.availabilityStatus ? 'Available' : 'Unavailable'}</span></td>
                      <td className="py-3 pr-4">
                        <div className="flex gap-2">
                          <button type="button" onClick={(event) => saveProduct(event, product.id)} disabled={editingProductSubmitting} className="rounded-lg bg-green-700 px-2.5 py-1.5 text-[10px] font-bold text-white transition hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-60">{editingProductSubmitting ? 'Saving…' : 'Save'}</button>
                          <button type="button" onClick={cancelEditProduct} className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[10px] font-bold text-slate-600 transition hover:bg-slate-200">Cancel</button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={product.id}>
                      <td className="py-3 pr-4 font-semibold text-slate-800">{product.name}</td>
                      <td className="py-3 pr-4 text-slate-600">{product.categoryName}</td>
                      <td className="py-3 pr-4 text-slate-600">{product.variant ?? '—'}</td>
                      <td className="py-3 pr-4 text-slate-600">₱{product.price}</td>
                      <td className="py-3 pr-4"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${product.availabilityStatus ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>{product.availabilityStatus ? 'Available' : 'Unavailable'}</span></td>
                      {isAdmin && (
                        <td className="py-3 pr-4">
                          <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={() => startEditProduct(product)} className="rounded-lg bg-green-50 px-2.5 py-1.5 text-[10px] font-bold text-green-800 transition hover:bg-green-100">Edit</button>
                            <button type="button" onClick={() => toggleAvailability(product)} className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-[10px] font-bold text-amber-800 transition hover:bg-amber-100">{product.availabilityStatus ? 'Mark unavailable' : 'Mark available'}</button>
                            <button type="button" onClick={() => deleteProduct(product)} className="rounded-lg bg-red-50 px-2.5 py-1.5 text-[10px] font-bold text-red-700 transition hover:bg-red-100">Delete</button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}
