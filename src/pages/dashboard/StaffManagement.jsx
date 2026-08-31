// Import state management for the staff list, create-account form, and
// per-row editing.
import { useEffect, useState } from 'react'
import { apiGet, apiPatch, apiPost } from '../../api/client.js'

const emptyForm = { role: 'CASHIER', name: '', username: '', email: '', contactNumber: '', password: '', confirmPassword: '' }
const roleLabels = { CASHIER: 'Cashier', DELIVERY_PERSONNEL: 'Delivery Personnel' }

// Admin-only screen: list existing cashier/delivery-personnel accounts and
// create new ones. Backed by GET/POST /api/staff (requireAuth + requireRole('ADMIN')).
export function StaffManagement() {
  // Hold the staff list fetched from the server.
  const [staff, setStaff] = useState([])
  // Track whether the initial list is still loading.
  const [loading, setLoading] = useState(true)
  // Store the create-staff form values in one convenient object.
  const [form, setForm] = useState(emptyForm)
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // Which row is currently being edited (a staff id), or null when none is.
  const [editingId, setEditingId] = useState(null)
  // The in-progress edits for that row — separate from the create form above.
  const [editForm, setEditForm] = useState({ name: '', email: '', contactNumber: '' })
  const [editErrors, setEditErrors] = useState({})
  const [editMessage, setEditMessage] = useState('')
  const [editSubmitting, setEditSubmitting] = useState(false)
  // Tracks which row's activate/deactivate request is in flight, so only
  // that row's button shows a disabled/pending state.
  const [togglingId, setTogglingId] = useState(null)

  // Update a single form field without losing the others.
  const updateField = (field, value) => setForm({ ...form, [field]: value })
  const updateEditField = (field, value) => setEditForm({ ...editForm, [field]: value })

  // Load the current staff list — reused after a successful creation too,
  // so the list always reflects what's actually in the database.
  const loadStaff = async () => {
    try {
      const data = await apiGet('/api/staff')
      setStaff(data.staff)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadStaff()
  }, [])

  // Create the account, then refresh the list so the new row appears.
  const handleSubmit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setMessage('')
    setErrors({})
    try {
      await apiPost('/api/staff', form)
      setForm(emptyForm)
      setMessage('Staff account created.')
      await loadStaff()
    } catch (error) {
      setErrors(error.errors ?? {})
      setMessage(error.message)
    } finally {
      setSubmitting(false)
    }
  }

  // Switch a row into edit mode, seeded with its current values.
  const startEdit = (person) => {
    setEditingId(person.id)
    setEditForm({ name: person.name, email: person.email, contactNumber: person.contactNumber })
    setEditErrors({})
    setEditMessage('')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditErrors({})
    setEditMessage('')
  }

  // Save the edited row, then refresh the list so it reflects the saved values.
  const saveEdit = async (event, personId) => {
    event.preventDefault()
    setEditSubmitting(true)
    setEditErrors({})
    setEditMessage('')
    try {
      await apiPatch(`/api/staff/${personId}`, editForm)
      setEditingId(null)
      await loadStaff()
    } catch (error) {
      setEditErrors(error.errors ?? {})
      setEditMessage(error.message)
    } finally {
      setEditSubmitting(false)
    }
  }

  // Flip a staff account's active status. Deactivating cuts off access
  // immediately (requireAuth re-checks is_active on every request), so
  // confirm before doing it — reactivating is safe to do without asking.
  const toggleActive = async (person) => {
    if (person.isActive && !window.confirm(`Deactivate ${person.name}? They will be signed out immediately and unable to log in until reactivated.`)) return
    setTogglingId(person.id)
    try {
      await apiPatch(`/api/staff/${person.id}`, { isActive: !person.isActive })
      await loadStaff()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setTogglingId(null)
    }
  }

  return (
    <section className="min-w-0 flex-1 px-4 pb-10 pt-24 sm:px-7 md:pt-9">
      <p className="text-sm font-semibold text-green-700">ADMIN PORTAL</p>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">Staff Management</h1>
      <p className="mt-2 text-sm text-slate-500">Create and review cashier and delivery-personnel accounts.</p>

      {/* Create a new cashier or delivery-personnel account. */}
      <div className="mt-7 rounded-2xl border border-green-100 bg-white p-6">
        <h2 className="text-lg font-bold">New staff account</h2>
        <form className="mt-4 space-y-3" onSubmit={handleSubmit} noValidate>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="staff-role" className="mb-1.5 block text-[11px] font-extrabold">Role</label>
              <select id="staff-role" value={form.role} onChange={(event) => updateField('role', event.target.value)} className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-xs shadow-sm outline-none transition focus:border-green-700 focus:ring-4 focus:ring-green-100">
                <option value="CASHIER">Cashier</option>
                <option value="DELIVERY_PERSONNEL">Delivery Personnel</option>
              </select>
              {errors.role && <p className="mt-1 text-[10px] font-medium text-red-700">{errors.role}</p>}
            </div>
            <div>
              <label htmlFor="staff-name" className="mb-1.5 block text-[11px] font-extrabold">Full name</label>
              <input id="staff-name" value={form.name} onChange={(event) => updateField('name', event.target.value)} autoComplete="name" placeholder="Full name" className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-xs shadow-sm outline-none transition focus:border-green-700 focus:ring-4 focus:ring-green-100" />
              {errors.name && <p className="mt-1 text-[10px] font-medium text-red-700">{errors.name}</p>}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="staff-username" className="mb-1.5 block text-[11px] font-extrabold">Username</label>
              <input id="staff-username" value={form.username} onChange={(event) => updateField('username', event.target.value)} autoComplete="off" placeholder="e.g. juan.delacruz" className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-xs shadow-sm outline-none transition focus:border-green-700 focus:ring-4 focus:ring-green-100" />
              {errors.username && <p className="mt-1 text-[10px] font-medium text-red-700">{errors.username}</p>}
            </div>
            <div>
              <label htmlFor="staff-contact" className="mb-1.5 block text-[11px] font-extrabold">Contact number</label>
              <input id="staff-contact" value={form.contactNumber} onChange={(event) => updateField('contactNumber', event.target.value)} autoComplete="tel" inputMode="tel" placeholder="09XXXXXXXXX" className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-xs shadow-sm outline-none transition focus:border-green-700 focus:ring-4 focus:ring-green-100" />
              {errors.contactNumber && <p className="mt-1 text-[10px] font-medium text-red-700">{errors.contactNumber}</p>}
            </div>
          </div>
          <div>
            <label htmlFor="staff-email" className="mb-1.5 block text-[11px] font-extrabold">Email</label>
            <input id="staff-email" type="email" value={form.email} onChange={(event) => updateField('email', event.target.value)} autoComplete="off" placeholder="name@example.com" className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-xs shadow-sm outline-none transition focus:border-green-700 focus:ring-4 focus:ring-green-100" />
            {errors.email && <p className="mt-1 text-[10px] font-medium text-red-700">{errors.email}</p>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="staff-password" className="mb-1.5 block text-[11px] font-extrabold">Password</label>
              <input id="staff-password" type="password" value={form.password} onChange={(event) => updateField('password', event.target.value)} autoComplete="new-password" placeholder="Set an initial password" className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-xs shadow-sm outline-none transition focus:border-green-700 focus:ring-4 focus:ring-green-100" />
              {errors.password && <p className="mt-1 text-[10px] font-medium text-red-700">{errors.password}</p>}
            </div>
            <div>
              <label htmlFor="staff-confirm-password" className="mb-1.5 block text-[11px] font-extrabold">Confirm password</label>
              <input id="staff-confirm-password" type="password" value={form.confirmPassword} onChange={(event) => updateField('confirmPassword', event.target.value)} autoComplete="new-password" placeholder="Repeat password" className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-xs shadow-sm outline-none transition focus:border-green-700 focus:ring-4 focus:ring-green-100" />
              {errors.confirmPassword && <p className="mt-1 text-[10px] font-medium text-red-700">{errors.confirmPassword}</p>}
            </div>
          </div>
          {message && <p role="status" className={`rounded-lg px-3 py-2 text-[10px] font-semibold ${Object.keys(errors).length ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-800'}`}>{message}</p>}
          <button type="submit" disabled={submitting} className="rounded-2xl bg-green-700 px-5 py-2.5 text-xs font-bold text-white shadow-md transition hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-60">{submitting ? 'Creating account…' : 'Create account'}</button>
        </form>
      </div>

      {/* Existing cashier and delivery-personnel accounts. */}
      <div className="mt-6 rounded-2xl border border-green-100 bg-white p-6">
        <h2 className="text-lg font-bold">Current staff</h2>
        {loading ? (
          <p className="mt-4 text-sm text-slate-500">Loading…</p>
        ) : staff.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No staff accounts yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            {editMessage && <p role="status" className={`mb-3 rounded-lg px-3 py-2 text-[10px] font-semibold ${Object.keys(editErrors).length ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-800'}`}>{editMessage}</p>}
            <table className="w-full min-w-150 text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400">
                  <th className="py-2 pr-4 font-bold">Name</th>
                  <th className="py-2 pr-4 font-bold">Username</th>
                  <th className="py-2 pr-4 font-bold">Role</th>
                  <th className="py-2 pr-4 font-bold">Contact</th>
                  <th className="py-2 pr-4 font-bold">Email</th>
                  <th className="py-2 pr-4 font-bold">Status</th>
                  <th className="py-2 pr-4 font-bold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {staff.map((person) =>
                  editingId === person.id ? (
                    <tr key={person.id}>
                      <td className="py-3 pr-4"><input value={editForm.name} onChange={(event) => updateEditField('name', event.target.value)} className="w-full rounded-lg border border-stone-200 px-2 py-1.5 text-xs outline-none focus:border-green-700" />{editErrors.name && <p className="mt-1 text-[10px] font-medium text-red-700">{editErrors.name}</p>}</td>
                      <td className="py-3 pr-4 text-slate-400">{person.username}</td>
                      <td className="py-3 pr-4 text-slate-400">{roleLabels[person.role] ?? person.role}</td>
                      <td className="py-3 pr-4"><input value={editForm.contactNumber} onChange={(event) => updateEditField('contactNumber', event.target.value)} className="w-full rounded-lg border border-stone-200 px-2 py-1.5 text-xs outline-none focus:border-green-700" />{editErrors.contactNumber && <p className="mt-1 text-[10px] font-medium text-red-700">{editErrors.contactNumber}</p>}</td>
                      <td className="py-3 pr-4"><input value={editForm.email} onChange={(event) => updateEditField('email', event.target.value)} className="w-full rounded-lg border border-stone-200 px-2 py-1.5 text-xs outline-none focus:border-green-700" />{editErrors.email && <p className="mt-1 text-[10px] font-medium text-red-700">{editErrors.email}</p>}</td>
                      <td className="py-3 pr-4"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${person.isActive ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>{person.isActive ? 'Active' : 'Inactive'}</span></td>
                      <td className="py-3 pr-4">
                        <div className="flex gap-2">
                          <button type="button" onClick={(event) => saveEdit(event, person.id)} disabled={editSubmitting} className="rounded-lg bg-green-700 px-2.5 py-1.5 text-[10px] font-bold text-white transition hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-60">{editSubmitting ? 'Saving…' : 'Save'}</button>
                          <button type="button" onClick={cancelEdit} className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[10px] font-bold text-slate-600 transition hover:bg-slate-200">Cancel</button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={person.id}>
                      <td className="py-3 pr-4 font-semibold text-slate-800">{person.name}</td>
                      <td className="py-3 pr-4 text-slate-600">{person.username}</td>
                      <td className="py-3 pr-4 text-slate-600">{roleLabels[person.role] ?? person.role}</td>
                      <td className="py-3 pr-4 text-slate-600">{person.contactNumber}</td>
                      <td className="py-3 pr-4 text-slate-600">{person.email}</td>
                      <td className="py-3 pr-4"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${person.isActive ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>{person.isActive ? 'Active' : 'Inactive'}</span></td>
                      <td className="py-3 pr-4">
                        <div className="flex gap-2">
                          <button type="button" onClick={() => startEdit(person)} className="rounded-lg bg-green-50 px-2.5 py-1.5 text-[10px] font-bold text-green-800 transition hover:bg-green-100">Edit</button>
                          <button type="button" onClick={() => toggleActive(person)} disabled={togglingId === person.id} className={`rounded-lg px-2.5 py-1.5 text-[10px] font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${person.isActive ? 'bg-red-50 text-red-700 hover:bg-red-100' : 'bg-green-50 text-green-800 hover:bg-green-100'}`}>{togglingId === person.id ? 'Working…' : person.isActive ? 'Deactivate' : 'Activate'}</button>
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
