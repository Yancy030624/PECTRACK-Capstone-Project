import { useState } from 'react'
import { apiPost } from '../api/client.js'
import { Brand } from './Brand.jsx'
import { passwordHint as describePassword, strongPasswordHint } from '../lib/password.js'

// The registration form itself, lifted out of the old RegistrationPage so
// it can live inside the auth pop-up — the same move LoginForm already
// made. Knows nothing about routing or about being in a dialog; it only
// reports success and offers a way back to sign-in.
//
// Registration is CUSTOMER-only and always has been (auth.js hard-codes
// the role), so there is no mode switch here the way LoginForm has one.
// Staff accounts are created by an admin in Staff Management.
export function RegisterForm({ onSwitchToLogin }) {
  // Store registration form values in one convenient state object.
  const [form, setForm] = useState({ name: '', username: '', email: '', contactNumber: '', password: '', confirmPassword: '', agree: false })
  // Store feedback after a registration attempt.
  const [message, setMessage] = useState('')
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  // Set once the account exists, so the panel can replace the form with a
  // single obvious next step instead of leaving an empty form under a
  // success line the way the old page did.
  const [created, setCreated] = useState(false)

  // Update a single registration field without losing the others.
  const updateField = (field, value) => setForm({ ...form, [field]: value })

  const passwordHint = describePassword(form.password)

  // Submit to the API, which repeats all validation and hashes the password with bcrypt.
  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!form.agree) return setMessage('Please agree to the Terms of Service and Privacy Policy.')
    setSubmitting(true)
    setMessage('')
    setErrors({})
    try {
      await apiPost('/api/auth/register', form)
      setForm({ name: '', username: '', email: '', contactNumber: '', password: '', confirmPassword: '', agree: false })
      setCreated(true)
      setMessage('Account created. You can now sign in with your username or email.')
    } catch (error) {
      setErrors(error.errors ?? {})
      setMessage(error.message)
    } finally {
      setSubmitting(false)
    }
  }

  const fieldClass = 'w-full rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-sm shadow-sm outline-none transition focus:border-green-700 focus:ring-4 focus:ring-green-100'

  return (
    <div className="bg-[#fffedc] p-5 sm:p-8 md:p-11">
      <div className="md:hidden"><Brand compact /></div>
      <div className="mt-6 flex items-start justify-between gap-4 md:mt-2">
        <div>
          <span className="rounded-full bg-lime-200 px-3 py-1.5 text-[10px] font-bold text-green-800">Customer Registration</span>
          <h2 id="auth-heading" className="mt-3 text-3xl font-extrabold leading-[1.05] text-brand-700">Create your<br />account.</h2>
        </div>
      </div>
      <p className="mt-2 text-[11px] font-medium leading-5 text-stone-500">Create your Pectrack profile to place orders and keep your details in one place. Staff accounts are created by an admin.</p>

      {created ? (
        // One clear next step, rather than a blank form sitting under a
        // success message with nothing to do.
        <div className="mt-6">
          <p role="status" className="rounded-lg bg-green-50 px-3 py-2 text-xs font-semibold text-green-800">{message}</p>
          <button type="button" onClick={onSwitchToLogin} className="mt-5 w-full rounded-2xl bg-brand-600 py-2.5 text-xs font-bold text-white shadow-md transition hover:bg-brand-700">Sign in now</button>
        </div>
      ) : (
        <>
          <form className="mt-5 space-y-3" onSubmit={handleSubmit} noValidate>
            <div>
              <label htmlFor="full-name" className="mb-1.5 block text-xs font-bold">Full name</label>
              <input id="full-name" value={form.name} onChange={(event) => updateField('name', event.target.value)} autoComplete="name" placeholder="Your full name" className={fieldClass} />
              {errors.name && <p className="mt-1 text-xs font-medium text-red-700">{errors.name}</p>}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="register-username" className="mb-1.5 block text-xs font-bold">Username</label>
                <input id="register-username" value={form.username} onChange={(event) => updateField('username', event.target.value)} autoComplete="username" placeholder="e.g. Yancy Ymata" className={fieldClass} />
                {errors.username && <p className="mt-1 text-xs font-medium text-red-700">{errors.username}</p>}
              </div>
              <div>
                <label htmlFor="contact-number" className="mb-1.5 block text-xs font-bold">Contact number</label>
                <input id="contact-number" maxLength={11} value={form.contactNumber} onChange={(event) => updateField('contactNumber', event.target.value)} autoComplete="tel" inputMode="tel" placeholder="09XXXXXXXXX" className={fieldClass} />
                {errors.contactNumber && <p className="mt-1 text-xs font-medium text-red-700">{errors.contactNumber}</p>}
              </div>
            </div>
            <div>
              <label htmlFor="register-email" className="mb-1.5 block text-xs font-bold">Email</label>
              <input id="register-email" type="email" value={form.email} onChange={(event) => updateField('email', event.target.value)} autoComplete="email" placeholder="you@example.com" className={fieldClass} />
              {errors.email && <p className="mt-1 text-xs font-medium text-red-700">{errors.email}</p>}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="register-password" className="mb-1.5 block text-xs font-bold">Password</label>
                <input id="register-password" type="password" value={form.password} onChange={(event) => updateField('password', event.target.value)} autoComplete="new-password" className={fieldClass} />
                {errors.password && <p className="mt-1 text-xs font-medium text-red-700">{errors.password}</p>}
              </div>
              <div>
                <label htmlFor="confirm-password" className="mb-1.5 block text-xs font-bold">Confirm password</label>
                <input id="confirm-password" type="password" value={form.confirmPassword} onChange={(event) => updateField('confirmPassword', event.target.value)} autoComplete="new-password" className={fieldClass} />
                {errors.confirmPassword && <p className="mt-1 text-xs font-medium text-red-700">{errors.confirmPassword}</p>}
              </div>
            </div>
            <p className={`text-xs ${form.password && passwordHint === strongPasswordHint ? 'text-green-700' : 'text-stone-500'}`}>{passwordHint}</p>
            <label className="flex cursor-pointer items-start gap-2 rounded-xl bg-white/70 p-2.5 text-xs leading-5 shadow-sm">
              <input type="checkbox" checked={form.agree} onChange={(event) => updateField('agree', event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-green-700" />
              I agree to the <a href="#terms" className="font-bold text-green-700 underline">Terms of Service</a> and <a href="#privacy" className="font-bold text-green-700 underline">Privacy Policy</a>.
            </label>
            {message && <p role="status" className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{message}</p>}
            <button type="submit" disabled={submitting} className="w-full rounded-2xl bg-lime-500 py-2.5 text-xs font-bold text-green-950 shadow-lg shadow-lime-500/30 transition hover:bg-lime-400 focus:ring-4 focus:ring-lime-200 disabled:cursor-not-allowed disabled:opacity-60">{submitting ? 'Creating account…' : 'Create account'}</button>
          </form>
          <p className="mt-5 border-t border-stone-200 pt-4 text-center text-xs text-stone-500">
            Already have an account? <button type="button" onClick={onSwitchToLogin} className="font-bold text-green-700 hover:underline">Back to sign in</button>
          </p>
        </>
      )}
    </div>
  )
}
