import { useState } from 'react'
import { Link } from 'react-router-dom'
import { apiPost } from '../api/client.js'
import { CodeTimer, codeTimes } from '../components/CodeTimer.jsx'
import { PasswordToggle } from '../components/PasswordToggle.jsx'
import { passwordHint as describePassword, strongPasswordHint } from '../lib/password.js'
import { noCopy, noPaste } from '../lib/inputFilters.js'
import { AuthShell, authButtonClass, authErrorClass, authInputClass, authLinkClass, authSuccessClass } from './AuthShell.jsx'

// Password recovery by emailed code (the panel, final defense 2026-11-18;
// RULES-PLANS/FINAL_DEFENSE_REVISIONS_PLAN.md C3). Step one asks for the
// email; step two takes the six-digit code, valid for 5 minutes, and the
// new password. It replaced the emailed reset link.
//
// The server answers step one the same way whether or not the address is on
// file (routes/auth.js /forgot-password), so this page never says "not found".
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [step, setStep] = useState('email') // email | code | done
  const [times, setTimes] = useState({ expiresAt: null, resendAt: null })
  const [form, setForm] = useState({ code: '', newPassword: '', confirmPassword: '' })
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [shown, setShown] = useState(false)

  const passwordHint = describePassword(form.newPassword)

  const sendCode = async () => {
    setError('')
    setSubmitting(true)
    try {
      const data = await apiPost('/api/auth/forgot-password', { email })
      setMessage(data.message)
      setTimes(codeTimes(data))
      setStep('code')
    } catch (requestError) {
      setError(requestError.errors?.email ?? requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleEmail = async (event) => {
    event.preventDefault()
    await sendCode()
  }

  const handleReset = async (event) => {
    event.preventDefault()
    setErrors({})
    setError('')
    if (form.code.length !== 6) {
      setErrors({ code: 'Enter the 6-digit code from the email.' })
      return
    }
    setSubmitting(true)
    try {
      const data = await apiPost('/api/auth/reset-password', { email, ...form })
      setMessage(data.message)
      setStep('done')
    } catch (requestError) {
      setErrors(requestError.errors ?? {})
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (step === 'done') {
    return (
      <AuthShell title="Password changed" subtitle="You can log in with it now.">
        <div className="mt-6 space-y-4">
          <p role="status" className={authSuccessClass}>{message}</p>
          <Link to="/login" className={`${authButtonClass} block text-center`}>Log in</Link>
        </div>
      </AuthShell>
    )
  }

  if (step === 'code') {
    return (
      <AuthShell title="Check your email" subtitle={`Enter the 6-digit code we sent to ${email}, then choose a new password.`}>
        <form className="mt-6 space-y-4" onSubmit={handleReset} noValidate>
          <p role="status" className={authSuccessClass}>{message}</p>
          <div>
            <label htmlFor="reset-code" className="mb-1.5 block text-xs font-bold">Code from the email</label>
            <input id="reset-code" value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.replace(/\D/g, '').slice(0, 6) })} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" autoFocus className={`${authInputClass} text-center text-2xl font-bold tracking-[0.5em]`} aria-invalid={Boolean(errors.code)} />
            {errors.code && <p className="mt-1 text-xs font-medium text-red-700">{errors.code}</p>}
            <CodeTimer className="mt-1.5" expiresAt={times.expiresAt} resendAt={times.resendAt} onResend={sendCode} busy={submitting} />
          </div>
          <div>
            <label htmlFor="reset-password" className="mb-1.5 block text-xs font-bold">New password</label>
            <div className="relative">
              <input {...noCopy} id="reset-password" type={shown ? 'text' : 'password'} value={form.newPassword} onChange={(event) => setForm({ ...form, newPassword: event.target.value })} autoComplete="new-password" className={`${authInputClass} pr-11`} aria-invalid={Boolean(errors.newPassword)} />
              <PasswordToggle shown={shown} onToggle={() => setShown(!shown)} />
            </div>
            {errors.newPassword && <p className="mt-1 text-xs font-medium text-red-700">{errors.newPassword}</p>}
          </div>
          <div>
            <label htmlFor="reset-confirm" className="mb-1.5 block text-xs font-bold">Confirm new password</label>
            <div className="relative">
              <input {...noCopy} {...noPaste} id="reset-confirm" type={shown ? 'text' : 'password'} value={form.confirmPassword} onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })} autoComplete="new-password" className={`${authInputClass} pr-11`} aria-invalid={Boolean(errors.confirmPassword)} />
              <PasswordToggle shown={shown} onToggle={() => setShown(!shown)} />
            </div>
            {errors.confirmPassword && <p className="mt-1 text-xs font-medium text-red-700">{errors.confirmPassword}</p>}
          </div>
          <p className={`text-xs ${form.newPassword && passwordHint === strongPasswordHint ? 'font-semibold text-green-700' : 'text-stone-500'}`}>{passwordHint}</p>
          {error && <p role="alert" className={authErrorClass}>{error}</p>}
          <button type="submit" disabled={submitting} className={authButtonClass}>{submitting ? 'Saving…' : 'Set new password'}</button>
          <button type="button" onClick={() => { setStep('email'); setError(''); setErrors({}) }} className={`${authLinkClass} w-full`}>← Use a different email</button>
        </form>
      </AuthShell>
    )
  }

  return (
    <AuthShell title="Forgot your password?" subtitle="Enter the email on your account and we'll send you a 6-digit code.">
      <form className="mt-6 space-y-4" onSubmit={handleEmail} noValidate>
        <div>
          <label htmlFor="forgot-email" className="mb-1.5 block text-xs font-bold">Email</label>
          <input id="forgot-email" type="email" value={email} onChange={(event) => { setEmail(event.target.value); setError('') }} autoComplete="email" autoFocus placeholder="you@example.com" className={authInputClass} />
        </div>
        {error && <p role="alert" className={authErrorClass}>{error}</p>}
        <button type="submit" disabled={submitting || !email} className={authButtonClass}>{submitting ? 'Sending…' : 'Send code'}</button>
        <Link to="/login" className={authLinkClass}>← Back to log in</Link>
      </form>
    </AuthShell>
  )
}
