import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { apiPost } from '../api/client.js'
import { passwordHint as describePassword, strongPasswordHint } from '../lib/password.js'
import { AuthShell, authButtonClass, authInputClass } from './AuthShell.jsx'

// Step two of email password recovery — reached only from the link in the
// email, which carries the token as ?token=. The same strength rules as
// registration apply (routes/auth.js reuses validatePasswordField), so
// the hint below matches RegistrationPage's.
export function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
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
        <p className="mt-6 text-[11px] text-stone-500">Open the reset link from your email, or request a new one.</p>
        <Link to="/forgot-password" className="mt-4 block text-center text-[10px] font-bold text-green-700 hover:underline">Request a new link</Link>
      </AuthShell>
    )
  }

  return (
    <AuthShell badge="Password Reset" title={<>Choose a new<br />password</>}>
      {done ? (
        <div className="mt-6 space-y-4">
          <p role="status" className="rounded-lg bg-green-50 px-3 py-2 text-[11px] font-semibold text-green-800">{message}</p>
          <Link to="/login" className={`${authButtonClass} block text-center`}>Sign in</Link>
        </div>
      ) : (
        <form className="mt-6 space-y-3" onSubmit={handleSubmit} noValidate>
          <div>
            <label htmlFor="reset-password" className="mb-1.5 block text-[11px] font-extrabold">New password</label>
            <input id="reset-password" type="password" value={form.newPassword} onChange={(event) => setForm({ ...form, newPassword: event.target.value })} autoComplete="new-password" className={authInputClass} aria-invalid={Boolean(errors.newPassword)} />
            {errors.newPassword && <p className="mt-1 text-[10px] font-medium text-red-700">{errors.newPassword}</p>}
          </div>
          <div>
            <label htmlFor="reset-confirm" className="mb-1.5 block text-[11px] font-extrabold">Confirm password</label>
            <input id="reset-confirm" type="password" value={form.confirmPassword} onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })} autoComplete="new-password" className={authInputClass} aria-invalid={Boolean(errors.confirmPassword)} />
            {errors.confirmPassword && <p className="mt-1 text-[10px] font-medium text-red-700">{errors.confirmPassword}</p>}
          </div>
          <p className={`text-[10px] ${form.newPassword && passwordHint === strongPasswordHint ? 'text-green-700' : 'text-stone-500'}`}>{passwordHint}</p>
          {message && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-[10px] font-semibold text-red-700">{message}</p>}
          <button type="submit" disabled={submitting} className={authButtonClass}>{submitting ? 'Saving…' : 'Set new password'}</button>
          <Link to="/forgot-password" className="block text-center text-[10px] font-bold text-green-700 hover:underline">Link expired? Request a new one</Link>
        </form>
      )}
    </AuthShell>
  )
}
