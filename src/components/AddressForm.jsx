import { useState } from 'react'
import { apiPost } from '../api/client.js'

const emptyAddressForm = { label: 'Home', recipientName: '', contactNumber: '', addressLine1: '', addressLine2: '', barangay: '', municipality: '', province: '', postalCode: '', deliveryNotes: '' }

export function AddressForm({ onSaved, onCancel, submitLabel = 'Save address', customerId }) {
  const [form, setForm] = useState(emptyAddressForm)
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  const updateField = (field, value) => setForm({ ...form, [field]: value })

  const handleSubmit = async (event) => {
    event.preventDefault()
    event.stopPropagation()
    setSubmitting(true)
    setErrors({})
    try {
      const body = { label: form.label, recipientName: form.recipientName, contactNumber: form.contactNumber, addressLine1: form.addressLine1 }
      for (const field of ['addressLine2', 'barangay', 'municipality', 'province', 'postalCode', 'deliveryNotes']) {
        if (form[field]) body[field] = form[field]
      }
      if (customerId) body.customerId = customerId
      const data = await apiPost('/api/addresses', body)
      setForm(emptyAddressForm)
      onSaved?.(data.address)
    } catch (error) {
      setErrors(error.errors ?? {})
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={handleSubmit} noValidate>
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
      <div className="flex items-center gap-2 sm:col-span-2">
        <button type="submit" disabled={submitting} className="rounded-xl bg-green-700 px-4 py-2 text-xs font-bold text-white transition hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-60">{submitting ? 'Saving…' : submitLabel}</button>
        {onCancel && <button type="button" onClick={onCancel} className="rounded-xl px-4 py-2 text-xs font-bold text-slate-500 transition hover:bg-slate-50">Cancel</button>}
      </div>
    </form>
  )
}
