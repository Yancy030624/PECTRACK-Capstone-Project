// Import state management for the address list and the add/edit form.
import { useEffect, useState } from 'react'
import { apiGet, apiPatch, apiPost } from '../../api/client.js'

const emptyForm = { label: 'Home', recipientName: '', contactNumber: '', addressLine1: '', addressLine2: '', barangay: '', municipality: '', province: '', postalCode: '', deliveryNotes: '' }

// Customer-facing address CRUD (Phase 7 — see PHASE7_PLAN.md, Decision 1).
// The hard prerequisite for placing a DELIVERY order, which needs an
// addressId nothing in this app could supply before this screen existed.
// CUSTOMER-only: this is a self-service screen for a customer's OWN
// addresses, the same shape MyProfile.jsx uses for a customer's own
// account details. Backed by /api/addresses, which also admits staff
// acting on a customer's behalf — that side of the router has no screen
// of its own yet, matching how phone orders aren't taken through the
// dashboard either.
export function AddressBook({ user }) {
  const [addresses, setAddresses] = useState([])
  const [loading, setLoading] = useState(true)
  const [includeInactive, setIncludeInactive] = useState(false)
  const [message, setMessage] = useState('')
  const [messageFailed, setMessageFailed] = useState(false)

  const [form, setForm] = useState(emptyForm)
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [showForm, setShowForm] = useState(false)

  // Which address (by id) is currently being saved via a quick action
  // (set default / deactivate / reactivate) — disables just that
  // address's own buttons rather than the whole list while it's in flight.
  const [actingOnId, setActingOnId] = useState(null)

  const loadAddresses = async () => {
    setLoading(true)
    try {
      const data = await apiGet(`/api/addresses${includeInactive ? '?includeInactive=true' : ''}`)
      setAddresses(data.addresses)
    } catch (error) {
      setMessage(error.message)
      setMessageFailed(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAddresses()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeInactive])

  const updateField = (field, value) => setForm({ ...form, [field]: value })

  const handleAddSubmit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setErrors({})
    try {
      // The backend (routes/addresses.js) treats an OMITTED municipality/
      // province as "use the database default" but an explicitly EMPTY
      // one as a mistake worth flagging — so a blank optional field here
      // must be left out of the request entirely, not sent as ''. Applies
      // to every optional field for the same reason, even where the
      // backend would have been lenient (addressLine2/barangay/postalCode
      // coerce '' to null): a clean payload is one fewer failure mode to
      // reason about, in either direction.
      const body = { label: form.label, recipientName: form.recipientName, contactNumber: form.contactNumber, addressLine1: form.addressLine1 }
      for (const field of ['addressLine2', 'barangay', 'municipality', 'province', 'postalCode', 'deliveryNotes']) {
        if (form[field]) body[field] = form[field]
      }
      await apiPost('/api/addresses', body)
      setForm(emptyForm)
      setShowForm(false)
      setMessage('Address saved.')
      setMessageFailed(false)
      await loadAddresses()
    } catch (error) {
      setErrors(error.errors ?? {})
      setMessage(error.message)
      setMessageFailed(true)
    } finally {
      setSubmitting(false)
    }
  }

  const handleSetDefault = async (addressId) => {
    setActingOnId(addressId)
    setMessage('')
    try {
      await apiPatch(`/api/addresses/${addressId}`, { isDefault: true })
      await loadAddresses()
    } catch (error) {
      setMessage(error.message)
      setMessageFailed(true)
    } finally {
      setActingOnId(null)
    }
  }

  const handleToggleActive = async (addressId, nextActive) => {
    setActingOnId(addressId)
    setMessage('')
    try {
      await apiPatch(`/api/addresses/${addressId}`, { isActive: nextActive })
      await loadAddresses()
    } catch (error) {
      setMessage(error.message)
      setMessageFailed(true)
    } finally {
      setActingOnId(null)
    }
  }

  return (
    <section className="min-w-0 flex-1 px-4 pb-10 pt-24 sm:px-7 md:pt-9">
      <p className="text-sm font-semibold text-green-700">{user.role} PORTAL</p>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">Address Book</h1>
      <p className="mt-2 text-sm text-slate-500">Saved delivery addresses for your account. Your first address becomes the default automatically.</p>

      {message && <p role="status" className={`mt-4 rounded-lg px-3 py-2 text-[10px] font-semibold ${messageFailed ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-800'}`}>{message}</p>}

      <div className="mt-7 rounded-2xl border border-green-100 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Your addresses</h2>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
              <input type="checkbox" checked={includeInactive} onChange={(event) => setIncludeInactive(event.target.checked)} />
              Show deactivated
            </label>
            <button type="button" onClick={() => setShowForm(!showForm)} className="rounded-xl bg-green-700 px-4 py-2 text-xs font-bold text-white transition hover:bg-green-800">{showForm ? 'Cancel' : 'Add address'}</button>
          </div>
        </div>

        {showForm && (
          <form className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2" onSubmit={handleAddSubmit} noValidate>
            <div>
              <label htmlFor="addr-label" className="mb-1.5 block text-[11px] font-extrabold">Label</label>
              <input id="addr-label" value={form.label} onChange={(event) => updateField('label', event.target.value)} placeholder="e.g. Home, Office" className="w-full rounded-xl border border-stone-200 px-3 py-2 text-xs outline-none focus:border-green-700" />
              {errors.label && <p className="mt-1 text-[10px] font-medium text-red-700">{errors.label}</p>}
            </div>
            <div>
              <label htmlFor="addr-recipient" className="mb-1.5 block text-[11px] font-extrabold">Recipient name</label>
              <input id="addr-recipient" value={form.recipientName} onChange={(event) => updateField('recipientName', event.target.value)} className="w-full rounded-xl border border-stone-200 px-3 py-2 text-xs outline-none focus:border-green-700" />
              {errors.recipientName && <p className="mt-1 text-[10px] font-medium text-red-700">{errors.recipientName}</p>}
            </div>
            <div>
              <label htmlFor="addr-contact" className="mb-1.5 block text-[11px] font-extrabold">Contact number</label>
              <input id="addr-contact" value={form.contactNumber} onChange={(event) => updateField('contactNumber', event.target.value)} inputMode="tel" className="w-full rounded-xl border border-stone-200 px-3 py-2 text-xs outline-none focus:border-green-700" />
              {errors.contactNumber && <p className="mt-1 text-[10px] font-medium text-red-700">{errors.contactNumber}</p>}
            </div>
            <div>
              <label htmlFor="addr-line1" className="mb-1.5 block text-[11px] font-extrabold">Street address</label>
              <input id="addr-line1" value={form.addressLine1} onChange={(event) => updateField('addressLine1', event.target.value)} className="w-full rounded-xl border border-stone-200 px-3 py-2 text-xs outline-none focus:border-green-700" />
              {errors.addressLine1 && <p className="mt-1 text-[10px] font-medium text-red-700">{errors.addressLine1}</p>}
            </div>
            <div>
              <label htmlFor="addr-line2" className="mb-1.5 block text-[11px] font-extrabold">Address line 2 (optional)</label>
              <input id="addr-line2" value={form.addressLine2} onChange={(event) => updateField('addressLine2', event.target.value)} className="w-full rounded-xl border border-stone-200 px-3 py-2 text-xs outline-none focus:border-green-700" />
              {errors.addressLine2 && <p className="mt-1 text-[10px] font-medium text-red-700">{errors.addressLine2}</p>}
            </div>
            <div>
              <label htmlFor="addr-barangay" className="mb-1.5 block text-[11px] font-extrabold">Barangay</label>
              <input id="addr-barangay" value={form.barangay} onChange={(event) => updateField('barangay', event.target.value)} className="w-full rounded-xl border border-stone-200 px-3 py-2 text-xs outline-none focus:border-green-700" />
              {errors.barangay && <p className="mt-1 text-[10px] font-medium text-red-700">{errors.barangay}</p>}
            </div>
            <div>
              <label htmlFor="addr-municipality" className="mb-1.5 block text-[11px] font-extrabold">Municipality / City</label>
              <input id="addr-municipality" value={form.municipality} onChange={(event) => updateField('municipality', event.target.value)} placeholder="Lucban" className="w-full rounded-xl border border-stone-200 px-3 py-2 text-xs outline-none focus:border-green-700" />
              {errors.municipality && <p className="mt-1 text-[10px] font-medium text-red-700">{errors.municipality}</p>}
            </div>
            <div>
              <label htmlFor="addr-province" className="mb-1.5 block text-[11px] font-extrabold">Province</label>
              <input id="addr-province" value={form.province} onChange={(event) => updateField('province', event.target.value)} placeholder="Quezon" className="w-full rounded-xl border border-stone-200 px-3 py-2 text-xs outline-none focus:border-green-700" />
              {errors.province && <p className="mt-1 text-[10px] font-medium text-red-700">{errors.province}</p>}
            </div>
            <div>
              <label htmlFor="addr-postal" className="mb-1.5 block text-[11px] font-extrabold">Postal code (optional)</label>
              <input id="addr-postal" value={form.postalCode} onChange={(event) => updateField('postalCode', event.target.value)} inputMode="numeric" className="w-full rounded-xl border border-stone-200 px-3 py-2 text-xs outline-none focus:border-green-700" />
              {errors.postalCode && <p className="mt-1 text-[10px] font-medium text-red-700">{errors.postalCode}</p>}
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="addr-notes" className="mb-1.5 block text-[11px] font-extrabold">Delivery notes (optional)</label>
              <input id="addr-notes" value={form.deliveryNotes} onChange={(event) => updateField('deliveryNotes', event.target.value)} placeholder="e.g. Gate code, landmark" className="w-full rounded-xl border border-stone-200 px-3 py-2 text-xs outline-none focus:border-green-700" />
            </div>
            <div className="sm:col-span-2">
              <button type="submit" disabled={submitting} className="rounded-xl bg-green-700 px-4 py-2 text-xs font-bold text-white transition hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-60">{submitting ? 'Saving…' : 'Save address'}</button>
            </div>
          </form>
        )}

        <div className="mt-4 border-t border-slate-100 pt-4">
          {loading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : addresses.length === 0 ? (
            <p className="text-sm text-slate-500">No addresses saved yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {addresses.map((address) => (
                <li key={address.id} className="py-3 text-xs">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-800">
                        {address.label}
                        {address.isDefault && <span className="ml-2 rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-bold text-green-800">DEFAULT</span>}
                        {!address.isActive && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">DEACTIVATED</span>}
                      </p>
                      <p className="mt-1 text-slate-600">{address.recipientName} · {address.contactNumber}</p>
                      <p className="mt-0.5 text-slate-500">
                        {address.addressLine1}{address.addressLine2 && `, ${address.addressLine2}`}
                        {address.barangay && `, ${address.barangay}`}, {address.municipality}, {address.province}
                        {address.postalCode && ` ${address.postalCode}`}
                      </p>
                      {address.deliveryNotes && <p className="mt-0.5 text-slate-500">"{address.deliveryNotes}"</p>}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {address.isActive && !address.isDefault && (
                        <button type="button" onClick={() => handleSetDefault(address.id)} disabled={actingOnId === address.id} className="rounded-lg border border-green-700 px-2.5 py-1.5 text-[10px] font-bold text-green-800 transition hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-60">Set as default</button>
                      )}
                      {address.isActive ? (
                        <button type="button" onClick={() => handleToggleActive(address.id, false)} disabled={actingOnId === address.id} className="rounded-lg bg-red-50 px-2.5 py-1.5 text-[10px] font-bold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60">Deactivate</button>
                      ) : (
                        <button type="button" onClick={() => handleToggleActive(address.id, true)} disabled={actingOnId === address.id} className="rounded-lg bg-green-50 px-2.5 py-1.5 text-[10px] font-bold text-green-800 transition hover:bg-green-100 disabled:cursor-not-allowed disabled:opacity-60">Reactivate</button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}
