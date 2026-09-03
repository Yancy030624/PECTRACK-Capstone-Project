import { useEffect, useState } from 'react'
import { apiGet, apiPatch } from '../../api/client.js'

export function CustomerManagement({ user }) {
  const isAdmin = user.role === 'ADMIN'

  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')

  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({ name: '', email: '', contactNumber: '' })
  const [editErrors, setEditErrors] = useState({})
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [togglingId, setTogglingId] = useState(null)

  const loadCustomers = async (searchTerm) => {
    setLoading(true)
    try {
      const query = searchTerm ? `?search=${encodeURIComponent(searchTerm)}` : ''
      const data = await apiGet(`/api/customers${query}`)
      setCustomers(data.customers)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCustomers('')
  }, [])

  const handleSearchSubmit = (event) => {
    event.preventDefault()
    loadCustomers(search)
  }

  const startEdit = (customer) => {
    setEditingId(customer.id)
    setEditForm({ name: customer.name, email: customer.email, contactNumber: customer.contactNumber })
    setEditErrors({})
  }

  const cancelEdit = () => setEditingId(null)

  const saveEdit = async (event, customerId) => {
    event.preventDefault()
    setEditSubmitting(true)
    setEditErrors({})
    try {
      await apiPatch(`/api/customers/${customerId}`, editForm)
      setEditingId(null)
      await loadCustomers(search)
    } catch (error) {
      setEditErrors(error.errors ?? {})
      setMessage(error.message)
    } finally {
      setEditSubmitting(false)
    }
  }

  const toggleActive = async (customer) => {
    if (customer.isActive && !window.confirm(`Deactivate ${customer.name}? They will be signed out immediately and unable to log in until reactivated.`)) return
    setTogglingId(customer.id)
    try {
      await apiPatch(`/api/customers/${customer.id}`, { isActive: !customer.isActive })
      await loadCustomers(search)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setTogglingId(null)
    }
  }

  return (
    <section className="min-w-0 flex-1 px-4 pb-10 pt-24 sm:px-7 md:pt-9">
      <p className="text-sm font-semibold text-green-700">{user.role} PORTAL</p>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">Customer Management</h1>
      <p className="mt-2 text-sm text-slate-500">Search and manage customer records.</p>

      {message && <p role="status" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-[10px] font-semibold text-red-700">{message}</p>}

      <form className="mt-6 flex flex-wrap gap-2" onSubmit={handleSearchSubmit}>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name, email, or contact number" className="flex-1 rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-xs shadow-sm outline-none focus:border-green-700" />
        <button type="submit" className="rounded-2xl bg-green-700 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-green-800">Search</button>
      </form>

      <div className="mt-4 rounded-2xl border border-green-100 bg-white p-6">
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : customers.length === 0 ? (
          <p className="text-sm text-slate-500">No customers found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-150 text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400">
                  <th className="py-2 pr-4 font-bold">Name</th>
                  <th className="py-2 pr-4 font-bold">Username</th>
                  <th className="py-2 pr-4 font-bold">Contact</th>
                  <th className="py-2 pr-4 font-bold">Email</th>
                  <th className="py-2 pr-4 font-bold">Status</th>
                  <th className="py-2 pr-4 font-bold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {customers.map((customer) =>
                  editingId === customer.id ? (
                    <tr key={customer.id}>
                      <td className="py-3 pr-4"><input value={editForm.name} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} className="w-full rounded-lg border border-stone-200 px-2 py-1.5 text-xs outline-none focus:border-green-700" />{editErrors.name && <p className="mt-1 text-[10px] font-medium text-red-700">{editErrors.name}</p>}</td>
                      <td className="py-3 pr-4 text-slate-400">{customer.username}</td>
                      <td className="py-3 pr-4"><input value={editForm.contactNumber} onChange={(event) => setEditForm({ ...editForm, contactNumber: event.target.value })} className="w-full rounded-lg border border-stone-200 px-2 py-1.5 text-xs outline-none focus:border-green-700" />{editErrors.contactNumber && <p className="mt-1 text-[10px] font-medium text-red-700">{editErrors.contactNumber}</p>}</td>
                      <td className="py-3 pr-4"><input value={editForm.email} onChange={(event) => setEditForm({ ...editForm, email: event.target.value })} className="w-full rounded-lg border border-stone-200 px-2 py-1.5 text-xs outline-none focus:border-green-700" />{editErrors.email && <p className="mt-1 text-[10px] font-medium text-red-700">{editErrors.email}</p>}</td>
                      <td className="py-3 pr-4"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${customer.isActive ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>{customer.isActive ? 'Active' : 'Inactive'}</span></td>
                      <td className="py-3 pr-4">
                        <div className="flex gap-2">
                          <button type="button" onClick={(event) => saveEdit(event, customer.id)} disabled={editSubmitting} className="rounded-lg bg-green-700 px-2.5 py-1.5 text-[10px] font-bold text-white transition hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-60">{editSubmitting ? 'Saving…' : 'Save'}</button>
                          <button type="button" onClick={cancelEdit} className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[10px] font-bold text-slate-600 transition hover:bg-slate-200">Cancel</button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={customer.id}>
                      <td className="py-3 pr-4 font-semibold text-slate-800">{customer.name}</td>
                      <td className="py-3 pr-4 text-slate-600">{customer.username}</td>
                      <td className="py-3 pr-4 text-slate-600">{customer.contactNumber}</td>
                      <td className="py-3 pr-4 text-slate-600">{customer.email}</td>
                      <td className="py-3 pr-4"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${customer.isActive ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>{customer.isActive ? 'Active' : 'Inactive'}</span></td>
                      <td className="py-3 pr-4">
                        <div className="flex gap-2">
                          <button type="button" onClick={() => startEdit(customer)} className="rounded-lg bg-green-50 px-2.5 py-1.5 text-[10px] font-bold text-green-800 transition hover:bg-green-100">Edit</button>
                          {isAdmin && (
                            <button type="button" onClick={() => toggleActive(customer)} disabled={togglingId === customer.id} className={`rounded-lg px-2.5 py-1.5 text-[10px] font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${customer.isActive ? 'bg-red-50 text-red-700 hover:bg-red-100' : 'bg-green-50 text-green-800 hover:bg-green-100'}`}>{togglingId === customer.id ? 'Working…' : customer.isActive ? 'Deactivate' : 'Activate'}</button>
                          )}
                        </div>
                      </td>
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
