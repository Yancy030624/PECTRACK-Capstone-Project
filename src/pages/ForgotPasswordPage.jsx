import { useState } from 'react'
import { Link } from 'react-router-dom'
import { apiPost } from '../api/client.js'
import { AuthShell, authButtonClass, authInputClass } from './AuthShell.jsx'

// Step one of email password recovery. The server answers the same way
// whether or not the address is on file (routes/auth.js /forgot-password),
// so this page has exactly one success state and never says "not found".
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const data = await apiPost('/api/auth/forgot-password', { email })
      setMessage(data.message)
    } catch (requestError) {
      setError(requestError.errors?.email ?? requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthShell badge="Password Reset" title={<>Forgot your<br />password?</>}>
      {message ? (
        <div className="mt-6 space-y-4">
          <p role="status" className="rounded-lg bg-green-50 px-3 py-2 text-xs font-semibold text-green-800">{message}</p>
          <p className="text-xs text-stone-500">The link in the email works for 30 minutes. If nothing arrives, check your spam folder or try again.</p>
          <Link to="/login" className="block text-center py-2 text-xs font-bold text-green-700 hover:underline">← Back to sign in</Link>
        </div>
      ) : (
        <form className="mt-6 space-y-3" onSubmit={handleSubmit} noValidate>
          <p className="text-xs font-medium text-stone-500">Enter the email on your account and we'll send you a link to choose a new password.</p>
          <div>
            <label htmlFor="forgot-email" className="mb-1.5 block text-xs font-bold">Email</label>
            <input id="forgot-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="you@example.com" className={authInputClass} />
          </div>
          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</p>}
          <button type="submit" disabled={submitting || !email} className={authButtonClass}>{submitting ? 'Sending…' : 'Send reset link'}</button>
          <Link to="/login" className="block text-center py-2 text-xs font-bold text-green-700 hover:underline">← Back to sign in</Link>
        </form>
      )}
    </AuthShell>
  )
}
