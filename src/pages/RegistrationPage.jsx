// Import state management for form controls.
import { useState } from 'react'
import { apiPost } from '../api/client.js'
import { Brand } from '../components/Brand.jsx'
import { MarketingHeader } from '../components/MarketingHeader.jsx'
import { WelcomePanel } from '../components/WelcomePanel.jsx'

// Render the registration page with visual parity to the login page.
export function RegistrationPage({ onLogin, onRegister }) {
  // Store registration form values in one convenient state object.
  const [form, setForm] = useState({ name: '', username: '', email: '', contactNumber: '', password: '', confirmPassword: '', agree: false })
  // Store feedback after a registration attempt.
  const [message, setMessage] = useState('')
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  // Update a single registration field without losing the others.
  const updateField = (field, value) => setForm({ ...form, [field]: value })

  const passwordHint = form.password.length < 12 ? 'Use at least 12 characters.' : !/[A-Z]/.test(form.password) || !/[a-z]/.test(form.password) || !/\d/.test(form.password) || !/[^A-Za-z0-9]/.test(form.password) ? 'Add uppercase, lowercase, number, and symbol.' : 'Strong password format.'

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
      setMessage('Account created. You can now sign in with your username or email.')
    } catch (error) {
      setErrors(error.errors ?? {})
      setMessage(error.message)
    } finally {
      setSubmitting(false)
    }
  }

  // Return the full registration experience.
  return (
    <main className="min-h-screen bg-[#202120] p-0 text-stone-900">
      {/* Use the same full-screen public shell as login for a seamless page transition. */}
      <section className="min-h-screen w-full overflow-hidden bg-white shadow-2xl">
        {/* The shared header keeps the centered desktop navigation and mobile shortcuts. */}
        <MarketingHeader onLogin={onLogin} onRegister={onRegister} />
        {/* Reuse the crisp decorative background so it remains sharp at every resolution. */}
        <div className="relative flex min-h-[calc(100vh-86px)] items-center justify-center overflow-hidden bg-[#edf2ea] px-4 py-10 sm:px-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_8%_18%,rgba(76,154,79,.22)_0,rgba(76,154,79,.22)_90px,transparent_91px),radial-gradient(circle_at_92%_13%,rgba(234,164,171,.35)_0,rgba(234,164,171,.35)_120px,transparent_121px),radial-gradient(circle_at_90%_88%,rgba(70,158,190,.25)_0,rgba(70,158,190,.25)_170px,transparent_171px)]" />
          <div className="absolute -left-40 top-0 hidden h-[72%] w-[48%] skew-x-[-38deg] bg-linear-to-br from-[#9ab2a0] to-[#d8e4d4] md:block" />
          <div className="absolute -bottom-64 left-[16%] h-96 w-96 rounded-full border-36 border-[#f6e86c]/35" />
          <div className="absolute right-[8%] top-[32%] hidden h-56 w-56 rotate-45 rounded-[45px] border-26 border-white/50 xl:block" />
          {/* Pair the illustrated brand panel with the customer account form. */}
          <div className="relative grid w-full max-w-190 overflow-hidden rounded-[26px] bg-[#fffedc] shadow-2xl shadow-[#102d71]/25 md:grid-cols-[340px_420px] xl:max-w-207.5 xl:grid-cols-[370px_460px]">
            <WelcomePanel register />
            {/* Keep registration fields spacious while avoiding excessive scrolling. */}
            <div className="bg-[#fffedc] p-7 sm:p-10 md:p-11"><div className="md:hidden"><Brand compact /></div><div className="mt-6 flex items-start justify-between gap-4 md:mt-2"><div><span className="rounded-full bg-lime-200 px-3 py-1.5 text-[10px] font-bold text-green-800">Customer Registration</span><h2 className="mt-3 text-3xl font-extrabold leading-[1.05] text-[#271dc8]">Create your<br />account.</h2></div><span className="rounded-full border border-green-200 bg-white px-2.5 py-1 text-[10px] font-bold text-green-800">Step 1 of 2</span></div><p className="mt-2 text-[11px] font-medium leading-5 text-stone-500">Create your Pectrack profile to place orders and keep your details in one place.</p>
              {/* Collect only the information needed to create a customer profile. */}
              <form className="mt-5 space-y-3" onSubmit={handleSubmit} noValidate>
                <div><label htmlFor="full-name" className="mb-1.5 block text-[11px] font-extrabold">Full name</label><input id="full-name" value={form.name} onChange={(event) => updateField('name', event.target.value)} autoComplete="name" placeholder="Your full name" className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-xs shadow-sm outline-none transition focus:border-green-700 focus:ring-4 focus:ring-green-100" />{errors.name && <p className="mt-1 text-[10px] font-medium text-red-700">{errors.name}</p>}</div>
                <div className="grid gap-3 sm:grid-cols-2"><div><label htmlFor="register-username" className="mb-1.5 block text-[11px] font-extrabold">Username</label><input id="register-username" value={form.username} onChange={(event) => updateField('username', event.target.value)} autoComplete="username" placeholder="e.g. maria.santos" className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-xs shadow-sm outline-none transition focus:border-green-700 focus:ring-4 focus:ring-green-100" />{errors.username && <p className="mt-1 text-[10px] font-medium text-red-700">{errors.username}</p>}</div><div><label htmlFor="contact-number" className="mb-1.5 block text-[11px] font-extrabold">Contact number</label><input id="contact-number" maxlength="11" value={form.contactNumber} onChange={(event) => updateField('contactNumber', event.target.value)} autoComplete="tel" inputMode="tel" placeholder="09XXXXXXXXX" className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-xs shadow-sm outline-none transition focus:border-green-700 focus:ring-4 focus:ring-green-100" />{errors.contactNumber && <p className="mt-1 text-[10px] font-medium text-red-700">{errors.contactNumber}</p>}</div></div>
                <div><label htmlFor="register-email" className="mb-1.5 block text-[11px] font-extrabold">Email</label><input id="register-email" type="email" value={form.email} onChange={(event) => updateField('email', event.target.value)} autoComplete="email" placeholder="you@example.com" className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-xs shadow-sm outline-none transition focus:border-green-700 focus:ring-4 focus:ring-green-100" />{errors.email && <p className="mt-1 text-[10px] font-medium text-red-700">{errors.email}</p>}</div>
                <div className="grid gap-3 sm:grid-cols-2"><div><label htmlFor="register-password" className="mb-1.5 block text-[11px] font-extrabold">Password</label><input id="register-password" type="password" value={form.password} onChange={(event) => updateField('password', event.target.value)} autoComplete="new-password" placeholder="Create password" className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-xs shadow-sm outline-none transition focus:border-green-700 focus:ring-4 focus:ring-green-100" />{errors.password && <p className="mt-1 text-[10px] font-medium text-red-700">{errors.password}</p>}</div><div><label htmlFor="confirm-password" className="mb-1.5 block text-[11px] font-extrabold">Confirm password</label><input id="confirm-password" type="password" value={form.confirmPassword} onChange={(event) => updateField('confirmPassword', event.target.value)} autoComplete="new-password" placeholder="Repeat password" className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-xs shadow-sm outline-none transition focus:border-green-700 focus:ring-4 focus:ring-green-100" />{errors.confirmPassword && <p className="mt-1 text-[10px] font-medium text-red-700">{errors.confirmPassword}</p>}</div></div>
                <p className={`text-[10px] ${form.password && passwordHint === 'Strong password format.' ? 'text-green-700' : 'text-stone-500'}`}>{passwordHint}</p>
                <label className="flex cursor-pointer items-start gap-2 rounded-xl bg-white/70 p-2.5 text-[10px] leading-4 shadow-sm"><input type="checkbox" checked={form.agree} onChange={(event) => updateField('agree', event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-green-700" />I agree to the <a href="#terms" className="font-bold text-green-700 underline">Terms of Service</a> and <a href="#privacy" className="font-bold text-green-700 underline">Privacy Policy</a>.</label>
                {message && <p role="status" className={`rounded-lg px-3 py-2 text-[10px] font-semibold ${Object.keys(errors).length ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-800'}`}>{message}</p>}
                <button type="submit" disabled={submitting} className="w-full rounded-2xl bg-lime-500 py-2.5 text-xs font-bold text-green-950 shadow-lg shadow-lime-500/30 transition hover:bg-lime-400 focus:outline-none focus:ring-4 focus:ring-lime-200 disabled:cursor-not-allowed disabled:opacity-60">{submitting ? 'Creating account…' : 'Create account'}</button>
              </form>
              <p className="mt-5 border-t border-stone-200 pt-4 text-center text-[10px] text-stone-500">Already have an account? <button type="button" onClick={onLogin} className="font-bold text-green-700 hover:underline">Back to login</button></p>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
