import { useState } from 'react'
import { apiPost } from '../api/client.js'
import { Brand } from './Brand.jsx'

// The credential form itself, extracted so /login (a full page) and the
// header's sign-in pop-up can share one copy — a bug fixed here is fixed
// in both places. Knows nothing about routing or being inside a modal;
// it only calls back with the signed-in user or a request to register.
//
// LOGIN_SPLIT_PLAN.md Decision 2 — one component with a `mode` prop/state,
// not a separate CustomerLoginForm/StaffLoginForm pair, so there stays
// exactly one copy of the submit handler to keep in sync. `mode` lives
// entirely in this component's own state (nothing above it passes one
// in) and only ever changes four things: the badge, the heading, whether
// "Create account" shows, and the recovery hint below the fields. It is
// NOT sent to the server and does not change which endpoint is called —
// see Decision 1 just below.
export function LoginForm({ onLogin, onRegister }) {
  // Which audience is using the form right now. Defaults to 'customer'
  // because that's who lands on /login and opens the header pop-up far
  // more often; a switch button lets either audience flip it. This is
  // presentation only — LOGIN_SPLIT_PLAN.md Decision 1 is explicit that
  // both modes post to the very same /api/auth/login, and a cashier who
  // signs in through staff mode or a customer who signs in through staff
  // mode both succeed and land wherever their role already routes them.
  // Do NOT wire this into the request body or reject a mismatched role
  // here — that would be enforcement the plan deliberately rejected as
  // both hostile (punishing a valid credential for using "the wrong
  // door") and impossible to do cleanly (the session cookie is already
  // set by the time the client learns the role).
  const [mode, setMode] = useState('customer')
  // Store what the person entered in the username field.
  const [username, setUsername] = useState('')
  // Store the password so the form feels like a real sign-in flow.
  const [password, setPassword] = useState('')
  // Control the password visibility toggle.
  const [showPassword, setShowPassword] = useState(false)
  // Store a validation error that can be announced to screen readers.
  const [error, setError] = useState('')
  // Set once the server asks for a one-time code (admin accounts only), and
  // switches the form below from credentials to a code-entry step. Null
  // means "not in that step."
  //
  // Holds two things: `username`, purely so the screen can say who the code
  // was sent for, and `challengeToken` — the server's proof that the
  // password step just succeeded. The token is what makes this a genuine
  // second factor: /verify-otp needs it alongside the code, so an SMS code
  // on its own can't sign anyone in. It deliberately lives in component
  // state and nowhere else, so it disappears the moment this form unmounts.
  const [pendingOtp, setPendingOtp] = useState(null)
  // Store what the person types into the verification-code field.
  const [otpCode, setOtpCode] = useState('')

  // Send credentials to the server, which verifies the bcrypt hash.
  const handleSubmit = async (event) => {
    // Prevent the default page refresh from a form submission.
    event.preventDefault()
    // Explain how to proceed if either field is incomplete.
    if (!username || !password) {
      setError('Enter a username and password to sign in.')
      return
    }
    try {
      const data = await apiPost('/api/auth/login', { identifier: username, password })
      setError('')
      // Admin accounts don't get a session yet — the server wants a
      // verification code first. Everyone else is signed in immediately.
      if (data.otpRequired) setPendingOtp({ username: data.username, challengeToken: data.challengeToken })
      else onLogin(data.user)
    } catch (error) {
      setError(error.message)
    }
  }

  // Submit the code from the second step; on success this behaves exactly
  // like a normal login (same response shape, same session cookie).
  const handleOtpSubmit = async (event) => {
    event.preventDefault()
    if (!otpCode) {
      setError('Enter the verification code to continue.')
      return
    }
    try {
      const data = await apiPost('/api/auth/verify-otp', { challengeToken: pendingOtp.challengeToken, code: otpCode })
      setError('')
      onLogin(data.user)
    } catch (error) {
      setError(error.message)
    }
  }

  // Let the person back out of the code step and try signing in again.
  const cancelOtp = () => {
    setPendingOtp(null)
    setOtpCode('')
    setError('')
  }

  // Flip between customer and staff mode. Decision 2: this is component
  // state changing, not navigation — the URL never moves, and nothing the
  // person already typed is cleared, since neither field's meaning depends
  // on mode (only which affordances are visible does).
  const toggleMode = () => setMode((current) => (current === 'staff' ? 'customer' : 'staff'))

  return (
    <div className="min-h-142.5 bg-[#fffedc] p-7 sm:p-10 md:p-12">
      <div className="md:hidden"><Brand compact /></div>
      {pendingOtp ? (
        <>
          <div className="mt-6 md:mt-8"><span className="rounded-full bg-lime-200 px-3 py-1.5 text-[10px] font-bold text-green-800">Verification Required</span><h2 id="login-heading" className="mt-3 text-3xl font-extrabold leading-[1.05] text-brand-700">Enter your<br />code</h2><p className="mt-2 text-[11px] font-medium text-stone-500">We sent a verification code to the phone on file for {pendingOtp.username}.</p></div>
          <form className="mt-6 space-y-3" onSubmit={handleOtpSubmit} noValidate>
            <div><label htmlFor="otp-code" className="mb-1.5 block text-[11px] font-extrabold">Verification code</label><input id="otp-code" value={otpCode} onChange={(event) => setOtpCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" placeholder="123456" maxLength={6} className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-center text-lg font-bold tracking-[0.4em] shadow-sm outline-none transition focus:border-green-700 focus:ring-4 focus:ring-green-100" /></div>
            {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-[10px] font-semibold text-red-700">{error}</p>}
            <button type="submit" className="mt-5 w-full rounded-2xl bg-brand-600 py-2.5 text-xs font-bold text-white shadow-md transition hover:bg-brand-700 ">Verify</button>
            <button type="button" onClick={cancelOtp} className="w-full rounded-2xl bg-white py-2.5 text-[10px] font-bold text-brand-700 shadow-md ring-1 ring-stone-100 transition hover:bg-stone-50">Back to login</button>
          </form>
        </>
      ) : (
        <>
          {/* Badge + heading are the two purely-cosmetic differences from
              Decision 2's table — swapped by `mode` and nothing else. */}
          <div className="mt-6 md:mt-8">
            <span className="rounded-full bg-lime-200 px-3 py-1.5 text-[10px] font-bold text-green-800">{mode === 'staff' ? 'Staff Login' : 'Customer Login'}</span>
            <h2 id="login-heading" className="mt-3 text-3xl font-extrabold leading-[1.05] text-brand-700">{mode === 'staff' ? <>Staff sign in</> : <>Sign in to your<br />account</>}</h2>
            <p className="mt-2 text-[11px] font-medium text-stone-500">Use your username or email to continue</p>
          </div>
          <form className="mt-6 space-y-3" onSubmit={handleSubmit} noValidate>
            <div><label htmlFor="username" className="mb-1.5 block text-[11px] font-extrabold">Username or Email</label><div className="relative"><svg viewBox="0 0 24 24" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="3" /><path d="M5.5 20c.8-3.3 2.9-5 6.5-5s5.7 1.7 6.5 5" /></svg><input id="username" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" placeholder="Email" className="w-full rounded-2xl border border-stone-200 bg-white py-2.5 pl-9 pr-3 text-xs shadow-sm outline-none transition focus:border-green-700 focus:ring-4 focus:ring-green-100" /></div></div>
            <div><label htmlFor="password" className="mb-1.5 block text-[11px] font-extrabold">Password</label><div className="relative"><svg viewBox="0 0 24 24" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg><input id="password" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" placeholder="Password" className="w-full rounded-2xl border border-stone-200 bg-white py-2.5 pl-9 pr-14 text-xs shadow-sm outline-none transition focus:border-green-700 focus:ring-4 focus:ring-green-100" /><button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 px-3 text-[10px] font-bold text-green-800">{showPassword ? 'Hide' : 'Show'}</button></div></div>
            {/* "Forgot password?" used to link to #forgot, which went
                nowhere — there was no recovery path behind it to link to
                (Step 0 / the plan's opening paragraph). Plain text now,
                deliberately not a link or a button, and mode-aware because
                the honest answer differs: a customer reset needs email/SMS
                delivery that's out of scope (Decision 6), while a staff
                reset is exactly what Part B adds. */}
            <div className="flex items-center justify-between gap-2 text-[10px] font-bold"><label className="flex cursor-pointer items-center gap-1.5"><input type="checkbox" className="h-4 w-4 accent-green-700" />Remember me</label><span className="text-stone-500">{mode === 'staff' ? 'Forgot password? Ask an admin to reset it.' : 'Forgot password? Contact the bakery.'}</span></div>
            {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-[10px] font-semibold text-red-700">{error}</p>}
            <button type="submit" className="mt-5 w-full rounded-2xl bg-brand-600 py-2.5 text-xs font-bold text-white shadow-md transition hover:bg-brand-700 ">Log In</button>
            {/* Hidden in staff mode (Decision 2's table) — self-registration
                only ever creates CUSTOMER accounts (auth.js hard-codes it),
                so this button could never do anything useful for a cashier
                or driver standing at this form. */}
            {mode === 'customer' && (
              <button type="button" onClick={onRegister} className="w-full rounded-2xl bg-white py-2.5 text-[10px] font-bold text-brand-700 shadow-md ring-1 ring-stone-100 transition hover:bg-stone-50">Create account</button>
            )}
          </form>
          {/* The switch itself. Plain text under the form, not a nav link —
              flipping `mode` is the only effect (Decision 2). */}
          <button type="button" onClick={toggleMode} className="mt-3 w-full text-center text-[10px] font-bold text-green-700 hover:underline">
            {mode === 'staff' ? '← Customer sign in' : 'Staff sign in →'}
          </button>
        </>
      )}
      <div className="mt-7 border-t border-stone-200 pt-4 text-center text-[10px] text-stone-500">Need help? Contact <a href="mailto:hello@pectrack.example" className="font-bold text-green-700 hover:underline">Pectos Bakery Lucban Quezon</a></div>
    </div>
  )
}
