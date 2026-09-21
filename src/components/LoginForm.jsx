import { useState } from 'react'
import { Link } from 'react-router-dom'
import { apiPost } from '../api/client.js'
import { Brand } from './Brand.jsx'

// The credential form itself, extracted so /login (a full page) and the
// header's sign-in pop-up can share one copy — a bug fixed here is fixed
// in both places. Knows nothing about routing or being inside a modal;
// it only calls back with the signed-in user or a request to register.
//
// LOGIN_SPLIT_PLAN.md Decision 2 — one component with a `mode` prop/state,
// not a separate CustomerLoginForm/StaffLoginForm pair, so there stays
// exactly one copy of the submit handler to keep in sync.
//
// CHANGED 2026-09-21: the two modes are now two real doors. `mode` is sent
// as `audience` with the credentials, and routes/auth.js refuses a staff
// account at the customer door and a customer account at the staff door —
// after checking the password, before creating any session. See that
// route's own comment for why the objection recorded in Decision 1 no
// longer applies. A refusal is not a dead end here: the reply names the
// right door, and the button below the error switches to it with what was
// typed still in the fields.
// `onNavigateAway` lets the shell close itself when a link inside the form
// leaves for a real page — the pop-up must not float over /forgot-password.
export function LoginForm({ onLogin, onRegister, onNavigateAway = () => {}, initialMode = 'customer' }) {
  // Which door is open. Defaults to 'customer' — who lands on /login and
  // opens the header pop-up far more often — and /staff-login passes
  // 'staff' instead. Sent to the server as `audience`, which is what makes
  // these two doors rather than two skins.
  const [mode, setMode] = useState(initialMode === 'staff' ? 'staff' : 'customer')
  const isStaffMode = mode === 'staff'
  // Set when the server says the credentials are valid but belong to the
  // other door. Holds the audience to switch to, so the error can carry a
  // button that gets there in one click.
  const [wrongDoor, setWrongDoor] = useState(null)
  // Store what the person entered in the username field.
  const [username, setUsername] = useState('')
  // Store the password so the form feels like a real sign-in flow.
  const [password, setPassword] = useState('')
  // Control the password visibility toggle.
  const [showPassword, setShowPassword] = useState(false)
  // Ticked by default — the 7-day session every login has always had.
  // Unticked asks the server for a browser-session cookie instead.
  const [rememberMe, setRememberMe] = useState(true)
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
      const data = await apiPost('/api/auth/login', { identifier: username, password, rememberMe, audience: mode })
      setError('')
      setWrongDoor(null)
      // Admin accounts don't get a session yet — the server wants a
      // verification code first. Everyone else is signed in immediately.
      if (data.otpRequired) setPendingOtp({ username: data.username, challengeToken: data.challengeToken })
      else onLogin(data.user)
    } catch (error) {
      // 403 with an `audience` is the wrong-door refusal: right password,
      // wrong front page. Everything typed stays put.
      setWrongDoor(error.status === 403 && error.audience ? error.audience : null)
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

  // Flip between the two doors. Still component state, not navigation —
  // the URL never moves and nothing typed is cleared, since neither field's
  // meaning depends on the door. The stale error goes, because the reason
  // for it (wrong door) is exactly what this button fixes.
  const switchTo = (next) => {
    setMode(next)
    setWrongDoor(null)
    setError('')
  }
  const toggleMode = () => switchTo(isStaffMode ? 'customer' : 'staff')

  return (
    <div className="bg-[#fffedc] p-5 sm:p-8 md:min-h-142.5 md:p-12">
      <div className="md:hidden"><Brand compact /></div>
      {pendingOtp ? (
        <>
          <div className="mt-6 md:mt-8"><span className="rounded-full bg-lime-200 px-3 py-1.5 text-[10px] font-bold text-green-800">Verification Required</span><h2 id="login-heading" className="mt-3 text-3xl font-extrabold leading-[1.05] text-brand-700">Enter your<br />code</h2><p className="mt-2 text-xs font-medium text-stone-500">We sent a verification code to the phone on file for {pendingOtp.username}.</p></div>
          <form className="mt-6 space-y-3" onSubmit={handleOtpSubmit} noValidate>
            <div><label htmlFor="otp-code" className="mb-1.5 block text-xs font-bold">Verification code</label><input id="otp-code" value={otpCode} onChange={(event) => setOtpCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" placeholder="123456" maxLength={6} className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-center text-lg font-bold tracking-[0.4em] shadow-sm outline-none transition focus:border-green-700 focus:ring-4 focus:ring-green-100" /></div>
            {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</p>}
            <button type="submit" className="mt-5 w-full rounded-2xl bg-brand-600 py-2.5 text-xs font-bold text-white shadow-md transition hover:bg-brand-700 ">Verify</button>
            <button type="button" onClick={cancelOtp} className="w-full rounded-2xl bg-white py-2.5 py-2 text-xs font-bold text-brand-700 shadow-md ring-1 ring-stone-100 transition hover:bg-stone-50">Back to login</button>
          </form>
        </>
      ) : (
        <>
          {/* The badge, heading and subtitle all name the door, because a
              door that turns the wrong account away has to say which
              accounts it is for BEFORE the password is typed. */}
          <div className="mt-6 md:mt-8">
            <span className={`rounded-full px-3 py-1.5 text-[10px] font-bold ${isStaffMode ? 'bg-brand-700 text-white' : 'bg-lime-200 text-green-800'}`}>{isStaffMode ? 'Staff Login' : 'Customer Login'}</span>
            <h2 id="login-heading" className="mt-3 text-3xl font-extrabold leading-[1.05] text-brand-700">{isStaffMode ? <>Staff sign in</> : <>Sign in to your<br />account</>}</h2>
            <p className="mt-2 text-xs font-medium text-stone-500">{isStaffMode ? 'For admin, cashier, and delivery personnel accounts.' : 'For customer accounts. Use your username or email to continue.'}</p>
          </div>
          <form className="mt-6 space-y-3" onSubmit={handleSubmit} noValidate>
            <div><label htmlFor="username" className="mb-1.5 block text-xs font-bold">Username or Email</label><div className="relative"><svg viewBox="0 0 24 24" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="3" /><path d="M5.5 20c.8-3.3 2.9-5 6.5-5s5.7 1.7 6.5 5" /></svg><input id="username" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" placeholder="Email" className="w-full rounded-2xl border border-stone-200 bg-white py-2.5 pl-9 pr-3 text-sm shadow-sm outline-none transition focus:border-green-700 focus:ring-4 focus:ring-green-100" /></div></div>
            <div><label htmlFor="password" className="mb-1.5 block text-xs font-bold">Password</label><div className="relative"><svg viewBox="0 0 24 24" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg><input id="password" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" placeholder="Password" className="w-full rounded-2xl border border-stone-200 bg-white py-2.5 pl-9 pr-14 text-sm shadow-sm outline-none transition focus:border-green-700 focus:ring-4 focus:ring-green-100" /><button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 px-3 py-2 text-xs font-bold text-green-800">{showPassword ? 'Hide' : 'Show'}</button></div></div>
            {/* Email password recovery (routes/auth.js /forgot-password)
                works for every role, so the link is the same in both
                modes; staff can also still ask an admin. */}
            <div className="flex items-center justify-between gap-2 py-2 text-xs font-bold"><label className="flex cursor-pointer items-center gap-1.5"><input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} className="h-5 w-5 accent-green-700" />Remember me</label><Link to="/forgot-password" onClick={onNavigateAway} className="inline-block py-2 text-green-700 hover:underline">Forgot password?</Link></div>
            {error && (
              <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                {error}
                {/* A refusal that names the right door has to be able to
                    open it — one click, nothing retyped. */}
                {wrongDoor && (
                  <button type="button" onClick={() => switchTo(wrongDoor)} className="mt-2 block w-full rounded-xl bg-red-700 py-2 text-xs font-bold text-white transition hover:bg-red-800">
                    {wrongDoor === 'staff' ? 'Go to staff sign in →' : 'Go to customer sign in →'}
                  </button>
                )}
              </div>
            )}
            <button type="submit" className="mt-5 w-full rounded-2xl bg-brand-600 py-2.5 text-xs font-bold text-white shadow-md transition hover:bg-brand-700 ">Log In</button>
            {/* Hidden in staff mode (Decision 2's table) — self-registration
                only ever creates CUSTOMER accounts (auth.js hard-codes it),
                so this button could never do anything useful for a cashier
                or driver standing at this form. */}
            {mode === 'customer' && (
              <button type="button" onClick={onRegister} className="w-full rounded-2xl bg-white py-2.5 py-2 text-xs font-bold text-brand-700 shadow-md ring-1 ring-stone-100 transition hover:bg-stone-50">Create account</button>
            )}
          </form>
          {/* The door switch. It used to be a plain text link, which read
              as fine print next to two solid buttons — and now that the
              doors actually turn the wrong account away, a cashier who
              cannot find it is stuck. It is a full-width control with its
              own icon, label and sub-label, styled deliberately UNLIKE the
              two buttons above it (outlined, not filled) so it reads as
              "somewhere else to go", not as a third thing to submit. */}
          <button
            type="button"
            onClick={toggleMode}
            className="group mt-4 flex w-full items-center gap-3 rounded-2xl border-2 border-brand-600/30 bg-white/70 px-4 py-3 text-left transition hover:border-brand-600 hover:bg-white hover:shadow-md"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-600/10 text-brand-700 transition group-hover:bg-brand-600 group-hover:text-white">
              {isStaffMode ? (
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 10.5 12 4l9 6.5" /><path d="M5 10v9h14v-9" /><path d="M10 19v-5h4v5" /></svg>
              ) : (
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="7" width="16" height="13" rx="2" /><path d="M9 7V5a3 3 0 0 1 6 0v2" /><path d="M9 13h6" /></svg>
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-extrabold text-brand-700">{isStaffMode ? 'Customer sign in' : 'Staff sign in'}</span>
              <span className="block text-[11px] font-medium text-stone-500">{isStaffMode ? 'Shopping as a customer? Sign in here.' : 'Admin, cashier, and delivery personnel'}</span>
            </span>
            <span aria-hidden="true" className="shrink-0 text-lg font-bold text-brand-600 transition group-hover:translate-x-0.5">→</span>
          </button>
        </>
      )}
      <div className="mt-7 border-t border-stone-200 pt-4 text-center text-xs text-stone-500">Need help? Contact <a href="mailto:hello@pectrack.example" className="font-bold text-green-700 hover:underline">Pectos Bakery Lucban Quezon</a></div>
    </div>
  )
}
