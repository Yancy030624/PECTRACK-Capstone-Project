import { useState } from 'react'
import { apiPost } from '../api/client.js'
import { Brand } from './Brand.jsx'
import { PasswordToggle } from './PasswordToggle.jsx'
import { passwordHint as describePassword, strongPasswordHint } from '../lib/password.js'
import { usePhoneVerification } from '../lib/usePhoneVerification.js'
import { digitsOnly } from '../lib/phone.js'

// The registration form itself, lifted out of the old RegistrationPage so
// it can live inside the auth pop-up — the same move LoginForm already
// made. Knows nothing about routing or about being in a dialog; it only
// reports success and offers a way back to sign-in.
//
// Registration is CUSTOMER-only and always has been (auth.js hard-codes
// the role), so there is no mode switch here the way LoginForm has one.
// Staff accounts are created by an admin in Staff Management.
// Every field on this form is required (the adviser, 2026-10-16): each
// label carries a red asterisk, a legend says what it means, and an empty
// field is named under itself before anything is sent. The server checks
// the same fields again (lib/validation.js validateCustomerRegistration),
// so a request sent straight to it cannot skip one.
const emptyForm = { firstName: '', lastName: '', username: '', email: '', contactNumber: '', password: '', confirmPassword: '', agree: false }
const requiredMessages = {
  firstName: 'Enter your first name.',
  lastName: 'Enter your last name.',
  username: 'Enter a username.',
  contactNumber: 'Enter your contact number.',
  email: 'Enter your email address.',
  password: 'Enter a password.',
  confirmPassword: 'Enter your password again.',
}

// What is still missing, before the form is sent.
function missingFields(form) {
  const errors = {}
  for (const [field, message] of Object.entries(requiredMessages)) {
    if (!String(form[field]).trim()) errors[field] = message
  }
  if (!errors.confirmPassword && form.password !== form.confirmPassword) errors.confirmPassword = 'Passwords do not match.'
  if (!form.agree) errors.agree = 'Agree to the Terms of Service and Privacy Policy to create an account.'
  return errors
}

// A field label with the required mark. The asterisk is hidden from screen
// readers, which hear the input's own `required` instead.
function RequiredLabel({ htmlFor, children }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-bold">
      {children} <span aria-hidden="true" className="text-red-600">*</span>
    </label>
  )
}

function FieldError({ id, message }) {
  return message ? <p id={id} className="mt-1 text-xs font-medium text-red-700">{message}</p> : null
}

export function RegisterForm({ onSwitchToLogin }) {
  // Store registration form values in one convenient state object.
  const [form, setForm] = useState(emptyForm)
  // Store feedback after a registration attempt.
  const [message, setMessage] = useState('')
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  // Each password field has its own eye button.
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  // Set once the account exists, so the panel can replace the form with a
  // single obvious next step instead of leaving an empty form under a
  // success line the way the old page did.
  const [created, setCreated] = useState(false)
  // The contact number is proven with a texted code when codes are on
  // (the adviser, 2026-10-19; RULES-PLANS/RESERVE_SMS_PLAN.md).
  const phone = usePhoneVerification('REGISTER')

  // Update a single registration field without losing the others. Typing
  // into a field clears its own error, so the message goes as it is fixed.
  const updateField = (field, value) => {
    setForm({ ...form, [field]: value })
    if (field === 'contactNumber') phone.reset()
    if (errors[field]) setErrors({ ...errors, [field]: undefined })
  }
  // The props every required input shares: its error is announced with it.
  const fieldProps = (field) => ({
    required: true,
    'aria-invalid': errors[field] ? true : undefined,
    'aria-describedby': errors[field] ? `${field}-error` : undefined,
  })

  const passwordHint = describePassword(form.password)

  // Submit to the API, which repeats all validation and hashes the password with bcrypt.
  const handleSubmit = async (event) => {
    event.preventDefault()
    const missing = missingFields(form)
    if (!missing.contactNumber && phone.required && !phone.verified) missing.contactNumber = 'Verify your contact number with the code we text you.'
    if (Object.keys(missing).length) {
      setErrors(missing)
      setMessage('Please fill in the fields marked below.')
      return
    }
    setSubmitting(true)
    setMessage('')
    setErrors({})
    try {
      const data = await apiPost('/api/auth/register', { ...form, phoneVerificationToken: phone.token ?? undefined })
      setForm(emptyForm)
      setCreated(true)
      // The server's own wording — it says a confirmation link went out,
      // which is the one thing the customer has to act on next.
      setMessage(data.message)
    } catch (error) {
      setErrors(error.errors ?? {})
      setMessage(error.message)
    } finally {
      setSubmitting(false)
    }
  }

  const fieldClass = 'w-full rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-sm shadow-sm outline-none transition focus:border-crust-500 focus:ring-4 focus:ring-cream-200'
  // Same field with room on the right for the eye button. pl-4 pr-11, not
  // px-4 plus pr-11: two padding classes on one element are decided by
  // stylesheet order, not by which is written last.
  const passwordFieldClass = 'w-full rounded-2xl border border-stone-200 bg-white py-2.5 pl-4 pr-11 text-sm shadow-sm outline-none transition focus:border-crust-500 focus:ring-4 focus:ring-cream-200'

  return (
    <div className="bg-[#fffedc] p-5 sm:p-8 md:p-11">
      <Brand compact />
      <div className="mt-6 flex items-start justify-between gap-4 md:mt-2">
        <div>
          <span className="rounded-full bg-butter-300 px-3 py-1.5 text-[10px] font-bold text-crust-700">Customer Registration</span>
          <h2 id="auth-heading" className="mt-3 text-3xl font-extrabold leading-[1.05] text-crust-700">Create your<br />account.</h2>
        </div>
      </div>
      {!created && <p className="mt-1 text-[11px] font-medium text-stone-500"><span aria-hidden="true" className="text-red-600">*</span> Required field</p>}

      {created ? (
        // One clear next step, rather than a blank form sitting under a
        // success message with nothing to do.
        <div className="mt-6">
          <p role="status" className="rounded-lg bg-cream-100 px-3 py-2 text-xs font-semibold text-crust-700">{message}</p>
          <button type="button" onClick={onSwitchToLogin} className="mt-5 w-full rounded-2xl bg-crust-600 py-2.5 text-sm font-bold text-white shadow-md transition hover:bg-crust-700">Sign in now</button>
        </div>
      ) : (
        <>
          <form className="mt-5 space-y-3" onSubmit={handleSubmit} noValidate>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <RequiredLabel htmlFor="first-name">First name</RequiredLabel>
                <input id="first-name" value={form.firstName} onChange={(event) => updateField('firstName', event.target.value)} autoComplete="given-name" placeholder="e.g. Maria" className={fieldClass} {...fieldProps('firstName')} />
                <FieldError id="firstName-error" message={errors.firstName} />
              </div>
              <div>
                <RequiredLabel htmlFor="last-name">Last name</RequiredLabel>
                <input id="last-name" value={form.lastName} onChange={(event) => updateField('lastName', event.target.value)} autoComplete="family-name" placeholder="e.g. Dela Cruz" className={fieldClass} {...fieldProps('lastName')} />
                <FieldError id="lastName-error" message={errors.lastName} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <RequiredLabel htmlFor="register-username">Username</RequiredLabel>
                <input id="register-username" value={form.username} onChange={(event) => updateField('username', event.target.value)} autoComplete="username" placeholder="e.g. maria.delacruz" className={fieldClass} {...fieldProps('username')} />
                <FieldError id="username-error" message={errors.username} />
              </div>
              <div>
                <RequiredLabel htmlFor="contact-number">Contact number</RequiredLabel>
                <input id="contact-number" maxLength={11} value={form.contactNumber} onChange={(event) => updateField('contactNumber', digitsOnly(event.target.value))} autoComplete="tel" inputMode="tel" placeholder="09XXXXXXXXX" className={fieldClass} {...fieldProps('contactNumber')} />
                <FieldError id="contactNumber-error" message={errors.contactNumber} />
                {phone.required && (phone.verified ? (
                  <p className="mt-1 text-xs font-bold text-emerald-700">✓ Number verified</p>
                ) : (
                  <div className="mt-2 space-y-2">
                    <button type="button" onClick={() => phone.send(form.contactNumber)} disabled={phone.busy || !form.contactNumber.trim()} className="w-full rounded-2xl border border-crust-500 py-2 text-xs font-bold text-crust-700 transition hover:bg-cream-100 disabled:cursor-not-allowed disabled:opacity-60">
                      {phone.token ? 'Send the code again' : 'Text me a code'}
                    </button>
                    {phone.token && (
                      <div className="flex gap-2">
                        <input value={phone.code} onChange={(event) => phone.setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" aria-label="Code from the text" className={fieldClass} />
                        <button type="button" onClick={phone.check} disabled={phone.busy || phone.code.length !== 6} className="shrink-0 rounded-2xl bg-crust-600 px-4 text-xs font-bold text-white transition hover:bg-crust-700 disabled:cursor-not-allowed disabled:opacity-60">Verify</button>
                      </div>
                    )}
                    {phone.info && <p className="text-xs text-stone-500">{phone.info}</p>}
                    {phone.error && <p className="text-xs font-medium text-red-700">{phone.error}</p>}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <RequiredLabel htmlFor="register-email">Email address</RequiredLabel>
              <input id="register-email" type="email" value={form.email} onChange={(event) => updateField('email', event.target.value)} autoComplete="email" placeholder="you@example.com" className={fieldClass} {...fieldProps('email')} />
              <FieldError id="email-error" message={errors.email} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <RequiredLabel htmlFor="register-password">Password</RequiredLabel>
                <div className="relative"><input id="register-password" type={showPassword ? 'text' : 'password'} value={form.password} onChange={(event) => updateField('password', event.target.value)} autoComplete="new-password" placeholder="Create password" className={passwordFieldClass} {...fieldProps('password')} /><PasswordToggle shown={showPassword} onToggle={() => setShowPassword(!showPassword)} /></div>
                <FieldError id="password-error" message={errors.password} />
              </div>
              <div>
                <RequiredLabel htmlFor="confirm-password">Confirm password</RequiredLabel>
                <div className="relative"><input id="confirm-password" type={showConfirm ? 'text' : 'password'} value={form.confirmPassword} onChange={(event) => updateField('confirmPassword', event.target.value)} autoComplete="new-password" placeholder="Repeat password" className={passwordFieldClass} {...fieldProps('confirmPassword')} /><PasswordToggle shown={showConfirm} onToggle={() => setShowConfirm(!showConfirm)} /></div>
                <FieldError id="confirmPassword-error" message={errors.confirmPassword} />
              </div>
            </div>
            <p className={`text-xs ${form.password && passwordHint === strongPasswordHint ? 'text-crust-600' : 'text-stone-500'}`}>{passwordHint}</p>
            <div>
              <label className="flex cursor-pointer items-start gap-2 rounded-xl bg-white/70 p-2.5 text-xs leading-5 shadow-sm">
                <input type="checkbox" checked={form.agree} onChange={(event) => updateField('agree', event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-crust-600" {...fieldProps('agree')} />
                <span>I agree to the <a href="/terms" target="_blank" rel="noopener" className="font-bold text-crust-600 underline">Terms of Service</a> and <a href="/privacy" target="_blank" rel="noopener" className="font-bold text-crust-600 underline">Privacy Policy</a>. <span aria-hidden="true" className="text-red-600">*</span></span>
              </label>
              <FieldError id="agree-error" message={errors.agree} />
            </div>
            {message && <p role="status" className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{message}</p>}
            <button type="submit" disabled={submitting} className="w-full rounded-2xl bg-crust-600 py-2.5 text-sm font-bold text-white shadow-lg shadow-crust-600/25 transition hover:bg-crust-700 focus:ring-4 focus:ring-cream-200 disabled:cursor-not-allowed disabled:opacity-60">{submitting ? 'Creating account…' : 'Create account'}</button>
          </form>
          <p className="mt-5 border-t border-stone-200 pt-4 text-center text-xs text-stone-500">
            Already have an account? <button type="button" onClick={onSwitchToLogin} className="font-bold text-crust-600 hover:underline">Back to sign in</button>
          </p>
        </>
      )}
    </div>
  )
}
