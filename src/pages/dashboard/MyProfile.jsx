// Import state management for the profile form.
import { useState } from 'react'
import { apiPatch } from '../../api/client.js'

// Self-service profile editing — available to every role. Backed by
// PATCH /api/auth/me, which edits whichever role table the logged-in user
// actually belongs to. Username, role, and password are deliberately not
// editable here.
export function MyProfile({ user, onUserUpdated }) {
  const [form, setForm] = useState({ name: user.name, email: user.email ?? '', contactNumber: user.contactNumber ?? '' })
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const updateField = (field, value) => setForm({ ...form, [field]: value })

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setErrors({})
    setMessage('')
    try {
      const data = await apiPatch('/api/auth/me', form)
      setMessage('Profile updated.')
      onUserUpdated?.(data.user)
    } catch (error) {
      setErrors(error.errors ?? {})
      setMessage(error.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="min-w-0 flex-1 px-4 pb-10 pt-24 sm:px-7 md:pt-9">
      <p className="text-sm font-semibold text-green-700">{user.role} PORTAL</p>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">My Profile</h1>
      <p className="mt-2 text-sm text-slate-500">Update your own name, email, and contact number.</p>

      <div className="mt-7 max-w-lg rounded-2xl border border-green-100 bg-white p-6">
        <form className="space-y-3" onSubmit={handleSubmit} noValidate>
          <div>
            <label htmlFor="profile-username" className="mb-1.5 block text-[11px] font-extrabold">Username</label>
            <input id="profile-username" value={user.username} disabled className="w-full cursor-not-allowed rounded-2xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-xs text-stone-500 shadow-sm outline-none" />
          </div>
          <div>
            <label htmlFor="profile-name" className="mb-1.5 block text-[11px] font-extrabold">Full name</label>
            <input id="profile-name" value={form.name} onChange={(event) => updateField('name', event.target.value)} autoComplete="name" className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-xs shadow-sm outline-none focus:border-green-700" />
            {errors.name && <p className="mt-1 text-[10px] font-medium text-red-700">{errors.name}</p>}
          </div>
          <div>
            <label htmlFor="profile-email" className="mb-1.5 block text-[11px] font-extrabold">Email</label>
            <input id="profile-email" type="email" value={form.email} onChange={(event) => updateField('email', event.target.value)} autoComplete="email" className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-xs shadow-sm outline-none focus:border-green-700" />
            {errors.email && <p className="mt-1 text-[10px] font-medium text-red-700">{errors.email}</p>}
          </div>
          <div>
            <label htmlFor="profile-contact" className="mb-1.5 block text-[11px] font-extrabold">Contact number</label>
            <input id="profile-contact" value={form.contactNumber} onChange={(event) => updateField('contactNumber', event.target.value)} autoComplete="tel" inputMode="tel" className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-xs shadow-sm outline-none focus:border-green-700" />
            {errors.contactNumber && <p className="mt-1 text-[10px] font-medium text-red-700">{errors.contactNumber}</p>}
          </div>
          {message && <p role="status" className={`rounded-lg px-3 py-2 text-[10px] font-semibold ${Object.keys(errors).length ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-800'}`}>{message}</p>}
          <button type="submit" disabled={submitting} className="rounded-2xl bg-green-700 px-5 py-2.5 text-xs font-bold text-white shadow-md transition hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-60">{submitting ? 'Saving…' : 'Save changes'}</button>
        </form>
      </div>
    </section>
  )
}
