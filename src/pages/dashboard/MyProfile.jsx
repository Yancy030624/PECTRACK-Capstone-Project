// Import state management for the profile form.
import { useState } from 'react'
import { apiPatch } from '../../api/client.js'

// Self-service profile editing — available to every role. Backed by
// PATCH /api/auth/me, which edits whichever role table the logged-in user
// actually belongs to. Username, role, and password are deliberately not
// editable here.
const emptyPasswordForm = { currentPassword: '', newPassword: '', confirmPassword: '' }

export function MyProfile({ user, onUserUpdated }) {
  const [form, setForm] = useState({ name: user.name, email: user.email ?? '', contactNumber: user.contactNumber ?? '' })
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // The password form is kept entirely separate from the profile form —
  // separate state, separate errors, separate request — because they're
  // separate endpoints with different rules. Mixing them would mean a
  // rejected password blocking a perfectly valid name change.
  const [passwordForm, setPasswordForm] = useState(emptyPasswordForm)
  const [passwordErrors, setPasswordErrors] = useState({})
  const [passwordMessage, setPasswordMessage] = useState('')
  const [passwordFailed, setPasswordFailed] = useState(false)
  const [passwordSubmitting, setPasswordSubmitting] = useState(false)

  const updateField = (field, value) => setForm({ ...form, [field]: value })
  const updatePasswordField = (field, value) => setPasswordForm({ ...passwordForm, [field]: value })

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

  const handlePasswordSubmit = async (event) => {
    event.preventDefault()
    setPasswordSubmitting(true)
    setPasswordErrors({})
    setPasswordMessage('')
    setPasswordFailed(false)
    try {
      const data = await apiPatch('/api/auth/password', passwordForm)
      // Clear the fields on success so the new password isn't left sitting
      // in the form for the next person at this screen.
      setPasswordForm(emptyPasswordForm)
      setPasswordMessage(data.otherSessionsEnded > 0
        ? `Password updated. You were signed out on ${data.otherSessionsEnded} other device${data.otherSessionsEnded === 1 ? '' : 's'}.`
        : 'Password updated.')
    } catch (error) {
      setPasswordErrors(error.errors ?? {})
      setPasswordMessage(error.message)
      setPasswordFailed(true)
    } finally {
      setPasswordSubmitting(false)
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

      <h2 className="mt-9 text-xl font-extrabold tracking-tight text-slate-900">Change password</h2>
      <p className="mt-1 text-sm text-slate-500">You'll stay signed in here, but any other device using your account will be signed out.</p>

      <div className="mt-4 max-w-lg rounded-2xl border border-green-100 bg-white p-6">
        <form className="space-y-3" onSubmit={handlePasswordSubmit} noValidate>
          <div>
            <label htmlFor="current-password" className="mb-1.5 block text-[11px] font-extrabold">Current password</label>
            <input id="current-password" type="password" value={passwordForm.currentPassword} onChange={(event) => updatePasswordField('currentPassword', event.target.value)} autoComplete="current-password" className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-xs shadow-sm outline-none focus:border-green-700" />
            {passwordErrors.currentPassword && <p className="mt-1 text-[10px] font-medium text-red-700">{passwordErrors.currentPassword}</p>}
          </div>
          <div>
            <label htmlFor="new-password" className="mb-1.5 block text-[11px] font-extrabold">New password</label>
            <input id="new-password" type="password" value={passwordForm.newPassword} onChange={(event) => updatePasswordField('newPassword', event.target.value)} autoComplete="new-password" className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-xs shadow-sm outline-none focus:border-green-700" />
            {passwordErrors.newPassword && <p className="mt-1 text-[10px] font-medium text-red-700">{passwordErrors.newPassword}</p>}
          </div>
          <div>
            <label htmlFor="confirm-password" className="mb-1.5 block text-[11px] font-extrabold">Confirm new password</label>
            <input id="confirm-password" type="password" value={passwordForm.confirmPassword} onChange={(event) => updatePasswordField('confirmPassword', event.target.value)} autoComplete="new-password" className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-xs shadow-sm outline-none focus:border-green-700" />
            {passwordErrors.confirmPassword && <p className="mt-1 text-[10px] font-medium text-red-700">{passwordErrors.confirmPassword}</p>}
          </div>
          <p className="text-[10px] text-slate-500">At least 12 characters, with an uppercase letter, a lowercase letter, a number, and a symbol.</p>
          {passwordMessage && <p role="status" className={`rounded-lg px-3 py-2 text-[10px] font-semibold ${passwordFailed ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-800'}`}>{passwordMessage}</p>}
          <button type="submit" disabled={passwordSubmitting} className="rounded-2xl bg-green-700 px-5 py-2.5 text-xs font-bold text-white shadow-md transition hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-60">{passwordSubmitting ? 'Updating…' : 'Update password'}</button>
        </form>
      </div>
    </section>
  )
}
