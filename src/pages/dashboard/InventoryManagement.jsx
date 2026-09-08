import { useEffect, useState } from 'react'
import { apiGet, apiPatch } from '../../api/client.js'
import { InventoryRequests } from './InventoryRequests.jsx'

const emptyEditForm = { stockQuantity: '', minStockLevel: '', expirationDate: '', reason: '', note: '' }
const reasonOptions = [
  { value: 'RESTOCK', label: 'Restock (delivery received)' },
  { value: 'SPOILAGE', label: 'Spoilage / waste' },
  { value: 'CORRECTION', label: 'Correction (recount)' },
]
export function InventoryManagement({ user }) {
  const isAdmin = user.role === 'ADMIN'
  const [activeTab, setActiveTab] = useState('levels')

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

  return (
    <section className="min-w-0 flex-1 px-4 pb-10 sm:px-7">
      <p className="text-sm font-semibold text-green-700">{user.role} PORTAL</p>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">Inventory Management</h1>
      <p className="mt-2 text-sm text-slate-500">{isAdmin ? 'View and adjust current stock levels.' : 'Current stock levels across the catalog.'}</p>

      {message && <p role="status" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-[10px] font-semibold text-red-700">{message}</p>}

      <div className="mt-6 flex gap-2">
        <button type="button" onClick={() => setActiveTab('levels')} className={`rounded-full px-4 py-2 text-xs font-bold transition ${activeTab === 'levels' ? 'bg-green-700 text-white' : 'bg-green-50 text-green-800 hover:bg-green-100'}`}>Stock levels</button>
        <button type="button" onClick={() => setActiveTab('requests')} className={`rounded-full px-4 py-2 text-xs font-bold transition ${activeTab === 'requests' ? 'bg-green-700 text-white' : 'bg-green-50 text-green-800 hover:bg-green-100'}`}>{isAdmin ? 'Change requests' : 'Propose a change'}</button>
      </div>

      {activeTab === 'requests' && <InventoryRequests user={user} inventory={inventory} />}

      {activeTab === 'levels' && <div className="mt-6 rounded-2xl border border-green-100 bg-white p-6">
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : inventory.length === 0 ? (
          <p className="text-sm text-slate-500">No products yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-150 text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400">
                  <th className="py-2 pr-4 font-bold">Product</th>
                  <th className="py-2 pr-4 font-bold">Category</th>
                  <th className="py-2 pr-4 font-bold">Stock</th>
                  <th className="py-2 pr-4 font-bold">Min level</th>
                  <th className="py-2 pr-4 font-bold">Expiry</th>
                  <th className="py-2 pr-4 font-bold">Status</th>
                  {isAdmin && <th className="py-2 pr-4 font-bold">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {inventory.map((item) =>
                  editingProductId === item.productId ? (
                    <tr key={item.productId}>
                      <td className="py-3 pr-4 font-semibold text-slate-800">{item.productName}</td>
                      <td className="py-3 pr-4 text-slate-600">{item.categoryName}</td>
                      <td className="py-3 pr-4">
                        <input value={editForm.stockQuantity} onChange={(event) => setEditForm({ ...editForm, stockQuantity: event.target.value })} inputMode="numeric" className="w-20 rounded-lg border border-stone-200 px-2 py-1.5 text-xs outline-none focus:border-green-700" />
                        {editErrors.stockQuantity && <p className="mt-1 text-[10px] font-medium text-red-700">{editErrors.stockQuantity}</p>}
                      </td>
                      <td className="py-3 pr-4">
                        <input value={editForm.minStockLevel} onChange={(event) => setEditForm({ ...editForm, minStockLevel: event.target.value })} inputMode="numeric" className="w-20 rounded-lg border border-stone-200 px-2 py-1.5 text-xs outline-none focus:border-green-700" />
                        {editErrors.minStockLevel && <p className="mt-1 text-[10px] font-medium text-red-700">{editErrors.minStockLevel}</p>}
                      </td>
                      <td className="py-3 pr-4">
                        <input type="date" value={editForm.expirationDate} onChange={(event) => setEditForm({ ...editForm, expirationDate: event.target.value })} className="rounded-lg border border-stone-200 px-2 py-1.5 text-xs outline-none focus:border-green-700" />
                        {editErrors.expirationDate && <p className="mt-1 text-[10px] font-medium text-red-700">{editErrors.expirationDate}</p>}
                      </td>
                      <td className="py-3 pr-4" colSpan={2}>
                        {stockQuantityChanged && (
                          <div className="space-y-1.5">
                            <select value={editForm.reason} onChange={(event) => setEditForm({ ...editForm, reason: event.target.value })} className="w-full rounded-lg border border-stone-200 px-2 py-1.5 text-xs outline-none focus:border-green-700">
                              <option value="">Why is stock changing?</option>
                              {reasonOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                            {editErrors.reason && <p className="text-[10px] font-medium text-red-700">{editErrors.reason}</p>}
                            <input value={editForm.note} onChange={(event) => setEditForm({ ...editForm, note: event.target.value })} placeholder="Optional note" className="w-full rounded-lg border border-stone-200 px-2 py-1.5 text-xs outline-none focus:border-green-700" />
                          </div>
                        )}
                        <div className="mt-2 flex gap-2">
                          <button type="button" onClick={(event) => saveEdit(event, item)} disabled={editSubmitting} className="rounded-lg bg-green-700 px-2.5 py-1.5 text-[10px] font-bold text-white transition hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-60">{editSubmitting ? 'Saving…' : 'Save'}</button>
                          <button type="button" onClick={cancelEdit} className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[10px] font-bold text-slate-600 transition hover:bg-slate-200">Cancel</button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={item.productId}>
                      <td className="py-3 pr-4 font-semibold text-slate-800">{item.productName}</td>
                      <td className="py-3 pr-4 text-slate-600">{item.categoryName}</td>
                      <td className="py-3 pr-4 text-slate-600">{item.stockQuantity}</td>
                      <td className="py-3 pr-4 text-slate-600">{item.minStockLevel}</td>
                      <td className="py-3 pr-4 text-slate-600">{item.expirationDate ?? '—'}</td>
                      <td className="py-3 pr-4">
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${item.lowStock ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-800'}`}>
                          {item.lowStock ? 'Low stock' : 'OK'}
                        </span>
                      </td>
                      {isAdmin && (
                        <td className="py-3 pr-4">
                          <button type="button" onClick={() => startEdit(item)} className="rounded-lg bg-green-50 px-2.5 py-1.5 text-[10px] font-bold text-green-800 transition hover:bg-green-100">Edit</button>
                        </td>
                      )}
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>}
    </section>
  )
}
