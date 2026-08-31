// Import state management for the stock list.
import { useEffect, useState } from 'react'
import { apiGet } from '../../api/client.js'

// Admin/cashier screen: current stock levels. Phase 5, Step 1 (see
// PHASE5_PLAN.md) — read-only for now. Editing stock directly, deducting on
// order placement, low-stock alerts, and the cashier-propose/admin-approve
// workflow are later steps in that same plan, not yet built.
//
// Deliberately a SEPARATE screen from ProductManagement.jsx (categories +
// product details) even though both ultimately describe a product: stock
// numbers change constantly and for different reasons than a product's
// name or price, and change history/alerts belong with the stock side, not
// the catalog side.
export function InventoryManagement({ user }) {
  const [inventory, setInventory] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let cancelled = false
    apiGet('/api/inventory')
      .then((data) => { if (!cancelled) setInventory(data.inventory) })
      .catch((error) => { if (!cancelled) setMessage(error.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  return (
    <section className="min-w-0 flex-1 px-4 pb-10 pt-24 sm:px-7 md:pt-9">
      <p className="text-sm font-semibold text-green-700">{user.role} PORTAL</p>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">Inventory Management</h1>
      <p className="mt-2 text-sm text-slate-500">Current stock levels across the catalog.</p>

      {message && <p role="status" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-[10px] font-semibold text-red-700">{message}</p>}

      <div className="mt-6 rounded-2xl border border-green-100 bg-white p-6">
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
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {inventory.map((item) => (
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}
