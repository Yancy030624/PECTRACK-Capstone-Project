import { useState } from 'react'
import { Link } from 'react-router-dom'
import { apiPost } from '../api/client.js'
import { Brand } from './Brand.jsx'
import { PasswordToggle } from './PasswordToggle.jsx'

// Each door wears its own colours, so nobody has to read a label to know
// which one is open: customer is the storefront's warm crust, staff the
// logo green. Staff uses leaf-*, not brand-*, because the storefront skin
// re-points brand-* at crust — which is why the two doors used to look
// the same.
const doorTheme = {
  customer: { panel: 'bg-[#fffedc]', badge: 'bg-butter-300 text-crust-700', heading: 'text-crust-700', link: 'text-crust-600', button: 'bg-crust-600 hover:bg-crust-700', focus: 'focus:border-crust-500 focus:ring-cream-200', accent: 'accent-crust-600' },
  staff: { panel: 'bg-leaf-50', badge: 'bg-leaf-700 text-white', heading: 'text-leaf-700', link: 'text-leaf-700', button: 'bg-leaf-600 hover:bg-leaf-700', focus: 'focus:border-leaf-600 focus:ring-green-100', accent: 'accent-leaf-600' },
}

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
export function LoginForm({ mode = 'customer', onModeChange = () => {}, onLogin, onRegister, onNavigateAway = () => {}, notice }) {
  // Which door is open. Defaults to 'customer' — who lands on /login and
  // opens the header pop-up far more often — and /staff-login passes
  // 'staff' instead. Sent to the server as `audience`, which is what makes
  // these two doors rather than two skins. Owned by AuthModal since
  // 2026-10-16, so the welcome panel beside this form can match the door.
  const isStaffMode = mode === 'staff'
  const theme = doorTheme[isStaffMode ? 'staff' : 'customer']
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
  // second factor: /verify-otp needs it alongside the code, so an emailed code
  // on its own can't sign anyone in. It deliberately lives in component
  // state and nowhere else, so it disappears the moment this form unmounts.
  const [pendingOtp, setPendingOtp] = useState(null)
  // Store what the person types into the verification-code field.
  const [otpCode, setOtpCode] = useState('')
  // "Trust this device for 30 days" (migration 033, the user 2026-10-20):
  // ticked, this browser skips the emailed code at the next sign-ins.
  const [trustDevice, setTrustDevice] = useState(true)

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
      const data = await apiPost('/api/auth/verify-otp', { challengeToken: pendingOtp.challengeToken, code: otpCode, trustDevice })
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
    onModeChange(next)
    setWrongDoor(null)
    setError('')
  }

  // No text-size class here: the code field is text-lg, and two size
  // classes on one element are decided by stylesheet order, not by which
  // is written last.
  const fieldClass = `w-full rounded-2xl border border-stone-200 bg-white shadow-sm outline-none transition focus:ring-4 ${theme.focus}`

  return (
    <div className={`${theme.panel} p-5 transition-colors sm:p-8`}>
      <Brand compact />
      {pendingOtp ? (
        <>
          <div className="mt-6 md:mt-8"><span className={`rounded-full px-3 py-1.5 text-[10px] font-bold ${theme.badge}`}>Verification Required</span><h2 id="login-heading" className={`mt-3 text-3xl font-extrabold leading-[1.05] ${theme.heading}`}>Enter your<br />code</h2><p className="mt-2 text-xs font-medium text-stone-500">We sent a 6-digit code to the email on file for {pendingOtp.username}. It expires in 5 minutes.</p></div>
          <form className="mt-6 space-y-3" onSubmit={handleOtpSubmit} noValidate>
            <div><label htmlFor="otp-code" className="mb-1.5 block text-xs font-bold">Email verification code</label><input id="otp-code" value={otpCode} onChange={(event) => setOtpCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" placeholder="123456" maxLength={6} className={`${fieldClass} px-4 py-2.5 text-center text-lg font-bold tracking-[0.4em]`} /></div>
            <label className="flex cursor-pointer items-start gap-2 py-1 text-xs font-bold"><input type="checkbox" checked={trustDevice} onChange={(event) => setTrustDevice(event.target.checked)} className={`mt-0.5 h-5 w-5 shrink-0 ${theme.accent}`} /><span>Trust this device for 30 days<span className="block font-medium text-stone-500">No code needed here again until then. Leave it unticked on a shared computer.</span></span></label>
            {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</p>}
            <button type="submit" className={`mt-5 w-full rounded-2xl py-2.5 text-sm font-bold text-white shadow-md transition ${theme.button}`}>Verify</button>
            <button type="button" onClick={cancelOtp} className={`w-full rounded-2xl bg-white py-2.5 text-xs font-bold shadow-md ring-1 ring-stone-100 transition hover:bg-stone-50 ${theme.heading}`}>Back to login</button>
          </form>
        </>
      ) : (
        <>
          {/* The door switch, at the top, before anything is typed. It used
              to be a full-width button under the form, but with both doors
              in the same colours people still could not tell which one
              they were at. Now it is a two-way switch showing both doors
              with the open one filled in that door's colour, and the
              whole form changes colour with it. */}
          <div className="mt-6 grid grid-cols-2 gap-1 rounded-2xl bg-white p-1 shadow-sm ring-1 ring-stone-200 md:mt-0" role="group" aria-label="Who is signing in">
            <button type="button" onClick={() => switchTo('customer')} aria-pressed={!isStaffMode} className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition ${isStaffMode ? 'text-stone-500 hover:bg-cream-100 hover:text-crust-700' : 'bg-crust-600 text-white shadow-sm'}`}>
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 10.5 12 4l9 6.5" /><path d="M5 10v9h14v-9" /><path d="M10 19v-5h4v5" /></svg>
              Customer
            </button>
            <button type="button" onClick={() => switchTo('staff')} aria-pressed={isStaffMode} className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition ${isStaffMode ? 'bg-leaf-700 text-white shadow-sm' : 'text-stone-500 hover:bg-leaf-50 hover:text-leaf-700'}`}>
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="7" width="16" height="13" rx="2" /><path d="M9 7V5a3 3 0 0 1 6 0v2" /><path d="M9 13h6" /></svg>
              Admin
            </button>
          </div>
          {/* Minimal by the adviser's request (2026-10-23): the switch above
              names the door, so the admin door has no badge, heading or
              description, and the customer door keeps only its heading.
              The admin door's heading stays for screen readers. */}
          <div className="mt-6">
            {/* No badge or heading on either door (the adviser, 2026-10-23);
                the switch names the door. Kept for screen readers. */}
            <h2 id="login-heading" className="sr-only">{isStaffMode ? 'Admin log in' : 'Customer log in'}</h2>
            {/* Why the pop-up opened on its own — PHASE10 B6. */}
            {notice && <p role="status" className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">{notice}</p>}
          </div>
          <form className="mt-6 space-y-3" onSubmit={handleSubmit} noValidate>
            <div><label htmlFor="username" className="mb-1.5 block text-xs font-bold">Username or Email</label><div className="relative"><svg viewBox="0 0 24 24" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="3" /><path d="M5.5 20c.8-3.3 2.9-5 6.5-5s5.7 1.7 6.5 5" /></svg><input id="username" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" placeholder="Email" className={`${fieldClass} py-2.5 pl-9 pr-3 text-sm`} /></div></div>
            <div><label htmlFor="password" className="mb-1.5 block text-xs font-bold">Password</label><div className="relative"><svg viewBox="0 0 24 24" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg><input id="password" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" placeholder="Password" className={`${fieldClass} py-2.5 pl-9 pr-11 text-sm`} /><PasswordToggle shown={showPassword} onToggle={() => setShowPassword(!showPassword)} /></div></div>
            {/* Email password recovery (routes/auth.js /forgot-password)
                works for every role, so the link is the same in both
                modes; staff can also still ask an admin. */}
            <div className="flex items-center justify-between gap-2 py-2 text-xs font-bold"><label className="flex cursor-pointer items-center gap-1.5"><input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} className={`h-5 w-5 ${theme.accent}`} />Remember me</label><Link to="/forgot-password" onClick={onNavigateAway} className={`inline-block py-2 hover:underline ${theme.link}`}>Forgot password?</Link></div>
            {error && (
              <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                {error}
                {/* A refusal that names the right door has to be able to
                    open it — one click, nothing retyped. */}
                {wrongDoor && (
                  <button type="button" onClick={() => switchTo(wrongDoor)} className="mt-2 block w-full rounded-xl bg-red-700 py-2 text-xs font-bold text-white transition hover:bg-red-800">
                    {wrongDoor === 'staff' ? 'Go to admin log in →' : 'Go to customer log in →'}
                  </button>
                )}
              </div>
            )}
            <button type="submit" className={`mt-5 w-full rounded-2xl py-2.5 text-sm font-bold text-white shadow-md transition ${theme.button}`}>Log in</button>
            {/* Hidden in staff mode (Decision 2's table) — self-registration
                only ever creates CUSTOMER accounts (auth.js hard-codes it),
                so this button could never do anything useful for a cashier
                or driver standing at this form. */}
            {mode === 'customer' && (
              <button type="button" onClick={onRegister} className="w-full rounded-2xl bg-white py-2.5 py-2 text-xs font-bold text-crust-700 shadow-md ring-1 ring-stone-100 transition hover:bg-stone-50">Create account</button>
            )}
          </form>
        </>
      )}
      <div className="mt-7 border-t border-stone-200 pt-4 text-center text-xs text-stone-500">Need help? Contact <a href="mailto:hello@pectrack.example" className={`font-bold hover:underline ${theme.link}`}>Pectos Bakery Lucban Quezon</a></div>
    </div>
  )
}
