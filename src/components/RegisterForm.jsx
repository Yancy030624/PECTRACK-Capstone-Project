import { useEffect, useRef, useState } from 'react'
import { apiPost } from '../api/client.js'
import logoMark from '../assets/logo-mark.png'
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
  // Red only for a real problem (the panel, 2026-10-26; MINOR_REVISIONS_PLAN.md
  // M2): a password that breaks a rule, a confirmation that does not match,
  // or an error the form or server named. Otherwise the outline is blue.
  const passwordWeak = Boolean(form.password) && passwordHint !== strongPasswordHint
  const confirmMismatch = Boolean(form.confirmPassword) && form.password !== form.confirmPassword
  const isWrong = (field) => Boolean(errors[field]) || (field === 'password' && passwordWeak) || (field === 'confirmPassword' && confirmMismatch)

  // The texted code (MINOR_REVISIONS_PLAN.md M4): asked for in a pop-up
  // after Create account, not with buttons of its own on the form.
  const [codeOpen, setCodeOpen] = useState(false)

  const register = async (phoneVerificationToken) => {
    setSubmitting(true)
    try {
      const data = await apiPost('/api/auth/register', { ...form, phoneVerificationToken })
      setForm(emptyForm)
      setCodeOpen(false)
      setCreated(true)
      setMessage(data.message)
    } catch (error) {
      setCodeOpen(false)
      setErrors(error.errors ?? {})
      setMessage(error.message)
    } finally {
      setSubmitting(false)
    }
  }

  // One press: check everything, then text the code and ask for it in the
  // pop-up; a correct code creates the account (below). With codes off, the
  // account is created at once.
  const handleSubmit = async (event) => {
    event.preventDefault()
    const missing = missingFields(form)
    if (!missing.password && passwordWeak) missing.password = passwordHint
    if (Object.keys(missing).length) {
      setErrors(missing)
      setMessage('Please fix the fields marked below.')
      return
    }
    setMessage('')
    setErrors({})
    if (!phone.required) {
      await register(undefined)
      return
    }
    setSubmitting(true)
    try {
      // Taken username, email or number, or any other field the server
      // refuses, is said now — before a code is texted.
      await apiPost('/api/auth/register', { ...form, checkOnly: true })
    } catch (error) {
      setErrors(error.errors ?? {})
      setMessage(error.message)
      setSubmitting(false)
      return
    }
    setSubmitting(false)
    phone.reset()
    setCodeOpen(true)
    await phone.send(form.contactNumber)
  }

  // A correct code creates the account straight away.
  useEffect(() => {
    if (codeOpen && phone.verified && !submitting && !created) register(phone.token)
    // register reads the form as it is now; this runs once, on verification.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codeOpen, phone.verified])

  // Blue while typing or when fine; red only when the field is wrong.
  const outline = (field) => (isWrong(field)
    ? 'border-red-500 focus:border-red-500 focus:ring-red-100'
    : 'border-stone-200 focus:border-sky-500 focus:ring-sky-100')
  const fieldClass = (field) => `w-full min-w-0 rounded-2xl border bg-white px-4 py-2.5 text-sm shadow-sm outline-none transition focus:ring-4 ${outline(field)}`
  // Same field with room on the right for the eye button. pl-4 pr-11, not
  // px-4 plus pr-11: two padding classes on one element are decided by
  // stylesheet order, not by which is written last.
  const passwordFieldClass = (field) => `w-full min-w-0 rounded-2xl border bg-white py-2.5 pl-4 pr-11 text-sm shadow-sm outline-none transition focus:ring-4 ${outline(field)}`

  return (
    // The same top as the log-in form (the user, 2026-10-23): the logo
    // centred, one heading, nothing else.
    <div className="bg-[#fffedc] px-6 pb-6 pt-8 sm:px-9 sm:pb-8">
      <div className="flex flex-col items-center text-center">
        <img src={logoMark} alt="Pecto's Bakery" className="h-20 w-20 rounded-full bg-white object-contain shadow-md ring-1 ring-black/5" />
        <h2 id="auth-heading" className="mt-3 font-display text-2xl font-bold text-crust-700">Create your account</h2>
        {!created && <p className="mt-1 text-[11px] font-medium text-stone-500"><span aria-hidden="true" className="text-red-600">*</span> Required field</p>}
      </div>

      {created ? (
        // One clear next step, rather than a blank form sitting under a
        // success message with nothing to do.
        <div className="mt-6">
          <p role="status" className="rounded-lg bg-cream-100 px-3 py-2 text-xs font-semibold text-crust-700">{message}</p>
          <button type="button" onClick={onSwitchToLogin} className="mt-5 w-full rounded-2xl bg-crust-600 py-2.5 text-sm font-bold text-white shadow-md transition hover:bg-crust-700">Log in now</button>
        </div>
      ) : (
        <>
          <form className="mt-5 space-y-3" onSubmit={handleSubmit} noValidate>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <RequiredLabel htmlFor="first-name">First name</RequiredLabel>
                <input id="first-name" value={form.firstName} onChange={(event) => updateField('firstName', event.target.value)} autoComplete="given-name" placeholder="e.g. Maria" className={fieldClass('firstName')} {...fieldProps('firstName')} />
                <FieldError id="firstName-error" message={errors.firstName} />
              </div>
              <div>
                <RequiredLabel htmlFor="last-name">Last name</RequiredLabel>
                <input id="last-name" value={form.lastName} onChange={(event) => updateField('lastName', event.target.value)} autoComplete="family-name" placeholder="e.g. Dela Cruz" className={fieldClass('lastName')} {...fieldProps('lastName')} />
                <FieldError id="lastName-error" message={errors.lastName} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <RequiredLabel htmlFor="register-username">Username</RequiredLabel>
                <input id="register-username" value={form.username} onChange={(event) => updateField('username', event.target.value)} autoComplete="username" placeholder="e.g. maria.delacruz" className={fieldClass('username')} {...fieldProps('username')} />
                <FieldError id="username-error" message={errors.username} />
              </div>
              <div>
                <RequiredLabel htmlFor="contact-number">Contact number</RequiredLabel>
                <input id="contact-number" maxLength={11} value={form.contactNumber} onChange={(event) => updateField('contactNumber', digitsOnly(event.target.value))} autoComplete="tel" inputMode="tel" placeholder="09XXXXXXXXX" className={fieldClass('contactNumber')} {...fieldProps('contactNumber')} />
                <FieldError id="contactNumber-error" message={errors.contactNumber} />
              </div>
            </div>
            <div>
              <RequiredLabel htmlFor="register-email">Email address</RequiredLabel>
              <input id="register-email" type="email" value={form.email} onChange={(event) => updateField('email', event.target.value)} autoComplete="email" placeholder="you@example.com" className={fieldClass('email')} {...fieldProps('email')} />
              <FieldError id="email-error" message={errors.email} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <RequiredLabel htmlFor="register-password">Password</RequiredLabel>
                <div className="relative"><input id="register-password" type={showPassword ? 'text' : 'password'} value={form.password} onChange={(event) => updateField('password', event.target.value)} autoComplete="new-password" placeholder="Create password" className={passwordFieldClass('password')} {...fieldProps('password')} aria-invalid={isWrong('password') || undefined} /><PasswordToggle shown={showPassword} onToggle={() => setShowPassword(!showPassword)} /></div>
                <FieldError id="password-error" message={errors.password} />
              </div>
              <div>
                <RequiredLabel htmlFor="confirm-password">Confirm password</RequiredLabel>
                <div className="relative"><input id="confirm-password" type={showConfirm ? 'text' : 'password'} value={form.confirmPassword} onChange={(event) => updateField('confirmPassword', event.target.value)} autoComplete="new-password" placeholder="Repeat password" className={passwordFieldClass('confirmPassword')} {...fieldProps('confirmPassword')} aria-invalid={isWrong('confirmPassword') || undefined} /><PasswordToggle shown={showConfirm} onToggle={() => setShowConfirm(!showConfirm)} /></div>
                <FieldError id="confirmPassword-error" message={errors.confirmPassword} />
              </div>
            </div>
            <p className={`text-xs ${!form.password ? 'text-stone-500' : passwordWeak ? 'font-medium text-red-700' : 'text-sky-700'}`}>{passwordHint}</p>
            {confirmMismatch && !errors.confirmPassword && <p className="text-xs font-medium text-red-700">Passwords do not match.</p>}
            <div>
              <label className="flex cursor-pointer items-start gap-2 rounded-xl bg-white/70 p-2.5 text-xs leading-5 shadow-sm">
                <input type="checkbox" checked={form.agree} onChange={(event) => updateField('agree', event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-crust-600" {...fieldProps('agree')} />
                <span>I agree to the <a href="/terms" target="_blank" rel="noopener" className="font-bold text-crust-600 underline">Terms of Service</a> and <a href="/privacy" target="_blank" rel="noopener" className="font-bold text-crust-600 underline">Privacy Policy</a>. <span aria-hidden="true" className="text-red-600">*</span></span>
              </label>
              <FieldError id="agree-error" message={errors.agree} />
            </div>
            {message && <p role="status" className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{message}</p>}
            <button type="submit" disabled={submitting || codeOpen} className="w-full rounded-2xl bg-crust-600 py-2.5 text-sm font-bold text-white shadow-lg shadow-crust-600/25 transition hover:bg-crust-700 focus:ring-4 focus:ring-cream-200 disabled:cursor-not-allowed disabled:opacity-60">{submitting ? 'Checking…' : 'Create account'}</button>
          </form>
          {codeOpen && (
            <VerifyCodeDialog
              phone={phone}
              number={form.contactNumber}
              creating={submitting}
              onResend={() => phone.send(form.contactNumber)}
              onCancel={() => { setCodeOpen(false); phone.reset() }}
            />
          )}
          <p className="mt-5 border-t border-stone-200 pt-4 text-center text-xs text-stone-500">
            Already have an account? <button type="button" onClick={onSwitchToLogin} className="font-bold text-crust-600 hover:underline">Log in</button>
          </p>
        </>
      )}
    </div>
  )
}

// "0917 ••• 4567": enough to recognise the number, not to read it out.
const maskNumber = (number) => (number.length >= 7 ? `${number.slice(0, 4)} ••• ${number.slice(-4)}` : number)
const codeLength = 6
const resendAfterSeconds = 30

// The texted code (MINOR_REVISIONS_PLAN.md M4, restyled 2026-10-28): six
// boxes, one digit each, as sign-ups usually ask. Typing moves to the next
// box, Backspace to the previous, and a pasted code fills them all. The
// code is checked as soon as the sixth digit is in, and a correct one
// creates the account. "Resend" waits 30 seconds after each text.
function VerifyCodeDialog({ phone, number, creating, onResend, onCancel }) {
  const boxes = useRef([])
  const [secondsLeft, setSecondsLeft] = useState(resendAfterSeconds)
  const triedCode = useRef('')
  const digits = Array.from({ length: codeLength }, (_, index) => phone.code[index] ?? '')

  useEffect(() => {
    boxes.current[Math.min(phone.code.length, codeLength - 1)]?.focus()
    // Focus once, on open; later moves are made by the handlers below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (secondsLeft <= 0) return undefined
    const timer = window.setTimeout(() => setSecondsLeft((left) => left - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [secondsLeft])

  // A full code is checked at once — but the same wrong code only once, so
  // a mistake waits for the customer to change it.
  useEffect(() => {
    if (phone.code.length === codeLength && !phone.busy && !phone.verified && triedCode.current !== phone.code) {
      triedCode.current = phone.code
      phone.check()
    }
  }, [phone])

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape' && !creating) onCancel() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [creating, onCancel])

  const setDigits = (next) => phone.setCode(next.join('').replace(/\D/g, '').slice(0, codeLength))
  const typeAt = (index, value) => {
    const typed = value.replace(/\D/g, '')
    if (!typed) return
    // A paste or an autofilled code arrives as several digits at once.
    const next = [...digits]
    typed.slice(0, codeLength - index).split('').forEach((digit, offset) => { next[index + offset] = digit })
    setDigits(next)
    boxes.current[Math.min(index + typed.length, codeLength - 1)]?.focus()
  }
  const onKeyDown = (index, event) => {
    if (event.key === 'Backspace') {
      event.preventDefault()
      const next = [...digits]
      if (next[index]) next[index] = ''
      else if (index > 0) { next[index - 1] = ''; boxes.current[index - 1]?.focus() }
      setDigits(next)
    } else if (event.key === 'ArrowLeft' && index > 0) boxes.current[index - 1]?.focus()
    else if (event.key === 'ArrowRight' && index < codeLength - 1) boxes.current[index + 1]?.focus()
  }
  const resend = () => {
    triedCode.current = ''
    setSecondsLeft(resendAfterSeconds)
    onResend()
    boxes.current[0]?.focus()
  }

  const wrong = Boolean(phone.error)
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-cocoa-900/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="code-heading" aria-describedby="code-help">
      <div className="relative w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl ring-1 ring-black/5 sm:p-7">
        <button type="button" onClick={onCancel} disabled={creating} aria-label="Close" className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full text-stone-400 transition hover:bg-stone-100 hover:text-stone-700 disabled:opacity-40">✕</button>
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-cream-100 text-crust-600">
          <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="6" y="2" width="12" height="20" rx="2.5" />
            <path d="M10 18h4" />
          </svg>
        </div>
        <h3 id="code-heading" className="mt-4 font-display text-2xl font-bold text-cocoa-900">Verify your number</h3>
        <p id="code-help" className="mt-1.5 text-sm text-stone-500">
          Enter the 6-digit code we sent to <span className="font-semibold text-cocoa-900">{maskNumber(number)}</span>
        </p>

        <div className={`mt-6 flex justify-center gap-2 ${wrong ? 'animate-[shake_0.3s_ease-in-out]' : ''}`}>
          {digits.map((digit, index) => (
            <input
              key={index}
              ref={(element) => { boxes.current[index] = element }}
              value={digit}
              onChange={(event) => typeAt(index, event.target.value)}
              onKeyDown={(event) => onKeyDown(index, event)}
              onFocus={(event) => event.target.select()}
              inputMode="numeric"
              autoComplete={index === 0 ? 'one-time-code' : 'off'}
              maxLength={codeLength}
              disabled={creating || phone.verified}
              aria-label={`Digit ${index + 1} of ${codeLength}`}
              className={`h-12 w-10 rounded-xl border-2 bg-white text-center text-xl font-bold text-cocoa-900 outline-none transition sm:h-14 sm:w-12 ${
                wrong ? 'border-red-500 focus:ring-4 focus:ring-red-100' : digit ? 'border-sky-500' : 'border-stone-200 focus:border-sky-500 focus:ring-4 focus:ring-sky-100'
              }`}
            />
          ))}
        </div>

        <div className="mt-3 min-h-5 text-xs" aria-live="polite">
          {phone.error ? <p className="font-medium text-red-700">{phone.error}</p>
            : creating || phone.verified ? <p className="font-medium text-leaf-600">Number verified — creating your account…</p>
              : phone.busy ? <p className="text-stone-500">Checking…</p>
                : phone.info ? <p className="text-stone-500">{phone.info}</p> : null}
        </div>

        <button type="button" onClick={phone.check} disabled={phone.busy || creating || phone.code.length !== codeLength} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-crust-600 py-3 text-sm font-bold text-white shadow-lg shadow-crust-600/25 transition hover:bg-crust-700 disabled:cursor-not-allowed disabled:opacity-60">
          {(phone.busy || creating) && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />}
          {creating ? 'Creating account…' : 'Verify'}
        </button>

        <p className="mt-4 text-xs text-stone-500">
          Didn't get a code?{' '}
          {secondsLeft > 0
            ? <span className="font-semibold tabular-nums text-stone-400">Resend in 0:{String(secondsLeft).padStart(2, '0')}</span>
            : <button type="button" onClick={resend} disabled={phone.busy || creating} className="font-bold text-crust-600 hover:underline disabled:opacity-60">Resend code</button>}
        </p>
        <button type="button" onClick={onCancel} disabled={creating} className="mt-2 text-xs font-semibold text-stone-500 hover:text-stone-800 hover:underline disabled:opacity-40">Change number</button>
      </div>
    </div>
  )
}
