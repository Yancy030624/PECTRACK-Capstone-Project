import { useState } from 'react'
import { apiPost } from '../api/client.js'
import { noCopy, noPaste } from '../lib/inputFilters.js'
import { authInputClass } from '../pages/AuthShell.jsx'
import { PasswordInput } from './ui/PasswordInput.jsx'

const emptyForm = { username: '', newPassword: '', confirmPassword: '' }

function FieldError({ message }) {
  return message ? <p className="mt-1 text-xs font-medium text-red-700">{message}</p> : null
}

// Shown in place of the whole app until an account handed to someone by
// another person has its own username and password. There is no way to close
// it except logging out. The server refuses everything else in the meantime.
export function CredentialSetup({ user, onDone, onLogout }) {
  const [form, setForm] = useState(emptyForm)
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  const setField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
    setMessage('')
  }

  const submit = async (event) => {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    try {
      await apiPost('/api/auth/setup-credentials', form)
      onDone()
    } catch (error) {
      setErrors(error.errors ?? {})
      if (!error.errors) setMessage(error.message)
      setSaving(false)
    }
  }

  return (
    <div className="flex min-h-screen items-start justify-center bg-cream-100 px-4 py-10 font-body text-cocoa-700 sm:items-center">
      <form onSubmit={submit} noValidate className="w-full max-w-110 space-y-4 rounded-[26px] bg-[#fffedc] px-6 py-8 shadow-2xl sm:px-9">
        <div className="text-center">
          <h1 className="font-display text-2xl font-bold text-crust-700">Set up your account</h1>
          <p className="mt-2 text-xs text-stone-500">Hi {user.name}. Choose your own username and password. You will then sign in again with them.</p>
        </div>
        {message && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{message}</p>}
        <div>
          <label htmlFor="setup-username" className="mb-1 block text-xs font-bold">New username</label>
          <input id="setup-username" value={form.username} onChange={(event) => setField('username', event.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))} maxLength={30} autoComplete="username" autoFocus className={authInputClass} aria-invalid={Boolean(errors.username)} />
          <FieldError message={errors.username} />
        </div>
        <div>
          <label htmlFor="setup-password" className="mb-1 block text-xs font-bold">New password</label>
          <PasswordInput id="setup-password" value={form.newPassword} onChange={(event) => setField('newPassword', event.target.value)} autoComplete="new-password" inputClassName={authInputClass} toggleClassName="text-crust-700" aria-invalid={Boolean(errors.newPassword)} {...noCopy} />
          <FieldError message={errors.newPassword} />
          <p className="mt-1 text-xs text-stone-500">At least 12 characters, with uppercase, lowercase, a number and a symbol.</p>
        </div>
        <div>
          <label htmlFor="setup-confirm" className="mb-1 block text-xs font-bold">Confirm new password</label>
          <PasswordInput id="setup-confirm" value={form.confirmPassword} onChange={(event) => setField('confirmPassword', event.target.value)} autoComplete="new-password" inputClassName={authInputClass} toggleClassName="text-crust-700" aria-invalid={Boolean(errors.confirmPassword)} {...noCopy} {...noPaste} />
          <FieldError message={errors.confirmPassword} />
        </div>
        <button type="submit" disabled={saving} className="min-h-12 w-full rounded-full bg-crust-600 px-6 text-sm font-bold text-white hover:bg-crust-700 disabled:opacity-60">{saving ? 'Saving…' : 'Save and sign in again'}</button>
        <button type="button" onClick={onLogout} className="min-h-11 w-full text-xs font-semibold text-stone-500 underline">Log out</button>
      </form>
    </div>
  )
}
