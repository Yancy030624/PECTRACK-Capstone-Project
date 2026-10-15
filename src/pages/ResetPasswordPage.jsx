import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { apiPost } from '../api/client.js'
import { passwordHint as describePassword, strongPasswordHint } from '../lib/password.js'
import { PasswordInput } from '../components/ui/PasswordInput.jsx'
import { AuthShell, authButtonClass, authInputClass } from './AuthShell.jsx'

// Step two of email password recovery — reached only from the link in the
// email. The same strength rules as registration apply (routes/auth.js
// reuses validatePasswordField), so the hint below matches the
// registration form's.
//
// The token arrives in the URL FRAGMENT (#token=...), which the browser
// never transmits — not in a Referer header, not to the server hosting
// this page. ?token= is still accepted so that any link already sitting
// in someone's inbox keeps working; new links use the fragment.
function readResetToken() {
  if (typeof window === 'undefined') return ''
  const fromFragment = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('token')
  return fromFragment ?? ''
}

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  // Read once, into state: the fragment is cleared immediately below, so
  // re-reading the URL on a later render would find nothing.
  const [token] = useState(() => readResetToken() || searchParams.get('token') || '')

  // Take the token out of the address bar as soon as it has been read.
  // It stays in memory for this page's lifetime, which is all the form
  // needs, and stops the browser keeping it in history or showing it to
  // whoever is looking at the screen.
  useEffect(() => {
    if (!window.location.hash && !window.location.search) return
    window.history.replaceState(null, '', window.location.pathname)
  }, [])
  const [form, setForm] = useState({ newPassword: '', confirmPassword: '' })
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState('')
  const [done, setDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const passwordHint = describePassword(form.newPassword)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setErrors({})
    setMessage('')
    setSubmitting(true)
    try {
      const data = await apiPost('/api/auth/reset-password', { token, ...form })
      setMessage(data.message)
      setDone(true)
    } catch (error) {
      setErrors(error.errors ?? {})
      setMessage(error.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (!token) {
    return (
      <AuthShell badge="Password Reset" title={<>This link is<br />incomplete</>}>
        <p className="mt-6 text-xs text-stone-500">Open the reset link from your email, or request a new one.</p>
        <Link to="/forgot-password" className="mt-4 block text-center py-2 text-xs font-bold text-green-700 hover:underline">Request a new link</Link>
      </AuthShell>
    )
  }

  return (
    <AuthShell badge="Password Reset" title={<>Choose a new<br />password</>}>
      {done ? (
        <div className="mt-6 space-y-4">
          <p role="status" className="rounded-lg bg-green-50 px-3 py-2 text-xs font-semibold text-green-800">{message}</p>
          <Link to="/login" className={`${authButtonClass} block text-center`}>Sign in</Link>
        </div>
      ) : (
        <form className="mt-6 space-y-3" onSubmit={handleSubmit} noValidate>
          <div>
            <label htmlFor="reset-password" className="mb-1.5 block text-xs font-bold">New password</label>
            <PasswordInput id="reset-password" value={form.newPassword} onChange={(event) => setForm({ ...form, newPassword: event.target.value })} autoComplete="new-password" inputClassName={authInputClass} toggleClassName="text-green-800" aria-invalid={Boolean(errors.newPassword)} />
            {errors.newPassword && <p className="mt-1 text-xs font-medium text-red-700">{errors.newPassword}</p>}
          </div>
          <div>
            <label htmlFor="reset-confirm" className="mb-1.5 block text-xs font-bold">Confirm password</label>
            <PasswordInput id="reset-confirm" value={form.confirmPassword} onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })} autoComplete="new-password" inputClassName={authInputClass} toggleClassName="text-green-800" aria-invalid={Boolean(errors.confirmPassword)} />
            {errors.confirmPassword && <p className="mt-1 text-xs font-medium text-red-700">{errors.confirmPassword}</p>}
          </div>
          <p className={`text-xs ${form.newPassword && passwordHint === strongPasswordHint ? 'text-green-700' : 'text-stone-500'}`}>{passwordHint}</p>
          {message && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{message}</p>}
          <button type="submit" disabled={submitting} className={authButtonClass}>{submitting ? 'Saving…' : 'Set new password'}</button>
          <Link to="/forgot-password" className="block text-center py-2 text-xs font-bold text-green-700 hover:underline">Link expired? Request a new one</Link>
        </form>
      )}
    </AuthShell>
  )
}
