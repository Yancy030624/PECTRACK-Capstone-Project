import { useState } from 'react'
import { apiPost } from '../api/client.js'

const emptyAddressForm = { label: 'Home', recipientName: '', contactNumber: '', addressLine1: '', addressLine2: '', barangay: '', municipality: '', province: '', postalCode: '', deliveryNotes: '' }

// `variant="dashboard"` swaps the storefront's cream/rounded-xl field
// styling for the dashboard's own Input/Button look. The same form is
// rendered inside the staff New-order screen and My Profile, where the
// storefront styling sat next to the primitive kit and clashed with it.
const storefrontClasses = {
  label: 'mb-1.5 block text-xs font-bold',
  input: 'w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm outline-none focus:border-green-700',
  error: 'mt-1 text-xs font-medium text-red-700',
  submit: 'rounded-xl bg-green-700 px-4 py-2 text-xs font-bold text-white transition hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-60',
  cancel: 'rounded-xl px-4 py-2 text-xs font-bold text-slate-500 transition hover:bg-slate-50',
}
const dashboardClasses = {
  label: 'mb-1 block text-xs font-semibold text-ink-700',
  input: 'h-9 w-full rounded-control border border-line-200 bg-surface px-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-500/25',
  error: 'mt-1 text-xs text-red-700',
  submit: 'inline-flex h-9 items-center rounded-control bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60',
  cancel: 'inline-flex h-9 items-center rounded-control border border-line-200 bg-surface px-4 text-sm font-medium text-ink-700 transition hover:bg-surface-sunk',
}

export function AddressForm({ onSaved, onCancel, submitLabel = 'Save address', customerId, variant = 'storefront' }) {
  const cls = variant === 'dashboard' ? dashboardClasses : storefrontClasses
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
        <label htmlFor="addr-label" className={cls.label}>Label</label>
        <input id="addr-label" value={form.label} onChange={(event) => updateField('label', event.target.value)} placeholder="e.g. Home, Office" className={cls.input} />
        {errors.label && <p className={cls.error}>{errors.label}</p>}
      </div>
      <div>
        <label htmlFor="addr-recipient" className={cls.label}>Recipient name</label>
        <input id="addr-recipient" value={form.recipientName} onChange={(event) => updateField('recipientName', event.target.value)} className={cls.input} />
        {errors.recipientName && <p className={cls.error}>{errors.recipientName}</p>}
      </div>
      <div>
        <label htmlFor="addr-contact" className={cls.label}>Contact number</label>
        <input id="addr-contact" value={form.contactNumber} onChange={(event) => updateField('contactNumber', event.target.value)} inputMode="tel" className={cls.input} />
        {errors.contactNumber && <p className={cls.error}>{errors.contactNumber}</p>}
      </div>
      <div>
        <label htmlFor="addr-line1" className={cls.label}>Street address</label>
        <input id="addr-line1" value={form.addressLine1} onChange={(event) => updateField('addressLine1', event.target.value)} className={cls.input} />
        {errors.addressLine1 && <p className={cls.error}>{errors.addressLine1}</p>}
      </div>
      <div>
        <label htmlFor="addr-line2" className={cls.label}>Address line 2 (optional)</label>
        <input id="addr-line2" value={form.addressLine2} onChange={(event) => updateField('addressLine2', event.target.value)} className={cls.input} />
        {errors.addressLine2 && <p className={cls.error}>{errors.addressLine2}</p>}
      </div>
      <div>
        <label htmlFor="addr-barangay" className={cls.label}>Barangay</label>
        <input id="addr-barangay" value={form.barangay} onChange={(event) => updateField('barangay', event.target.value)} className={cls.input} />
        {errors.barangay && <p className={cls.error}>{errors.barangay}</p>}
      </div>
      <div>
        <label htmlFor="addr-municipality" className={cls.label}>Municipality / City</label>
        <input id="addr-municipality" value={form.municipality} onChange={(event) => updateField('municipality', event.target.value)} placeholder="Lucban" className={cls.input} />
        {errors.municipality && <p className={cls.error}>{errors.municipality}</p>}
      </div>
      <div>
        <label htmlFor="addr-province" className={cls.label}>Province</label>
        <input id="addr-province" value={form.province} onChange={(event) => updateField('province', event.target.value)} placeholder="Quezon" className={cls.input} />
        {errors.province && <p className={cls.error}>{errors.province}</p>}
      </div>
      <div>
        <label htmlFor="addr-postal" className={cls.label}>Postal code (optional)</label>
        <input id="addr-postal" value={form.postalCode} onChange={(event) => updateField('postalCode', event.target.value)} inputMode="numeric" className={cls.input} />
        {errors.postalCode && <p className={cls.error}>{errors.postalCode}</p>}
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="addr-notes" className={cls.label}>Delivery notes (optional)</label>
        <input id="addr-notes" value={form.deliveryNotes} onChange={(event) => updateField('deliveryNotes', event.target.value)} placeholder="e.g. Gate code, landmark" className={cls.input} />
      </div>
      <div className="flex items-center gap-2 sm:col-span-2">
        <button type="submit" disabled={submitting} className={cls.submit}>{submitting ? 'Saving…' : submitLabel}</button>
        {onCancel && <button type="button" onClick={onCancel} className={cls.cancel}>Cancel</button>}
      </div>
    </form>
  )
}
