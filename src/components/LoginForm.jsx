import { useState } from 'react'
import { apiPost } from '../api/client.js'
import { Brand } from './Brand.jsx'

// The credential form itself, extracted so /login (a full page) and the
// header's sign-in pop-up can share one copy — a bug fixed here is fixed
// in both places. Knows nothing about routing or being inside a modal;
// it only calls back with the signed-in user or a request to register.
export function LoginForm({ onLogin, onRegister }) {
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

  return (
    <div className="min-h-142.5 bg-[#fffedc] p-7 sm:p-10 md:p-12">
      <div className="md:hidden"><Brand compact /></div>
      {pendingOtp ? (
        <>
          <div className="mt-6 md:mt-8"><span className="rounded-full bg-lime-200 px-3 py-1.5 text-[10px] font-bold text-green-800">Verification Required</span><h2 id="login-heading" className="mt-3 text-3xl font-extrabold leading-[1.05] text-[#271dc8]">Enter your<br />code</h2><p className="mt-2 text-[11px] font-medium text-stone-500">We sent a verification code to the phone on file for {pendingOtp.username}.</p></div>
          <form className="mt-6 space-y-3" onSubmit={handleOtpSubmit} noValidate>
            <div><label htmlFor="otp-code" className="mb-1.5 block text-[11px] font-extrabold">Verification code</label><input id="otp-code" value={otpCode} onChange={(event) => setOtpCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" placeholder="123456" maxLength={6} className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-center text-lg font-bold tracking-[0.4em] shadow-sm outline-none transition focus:border-green-700 focus:ring-4 focus:ring-green-100" /></div>
            {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-[10px] font-semibold text-red-700">{error}</p>}
            <button type="submit" className="mt-5 w-full rounded-2xl bg-[#291dcc] py-2.5 text-xs font-bold text-white shadow-md transition hover:bg-[#1e159b] focus:outline-none focus:ring-4 focus:ring-indigo-200">Verify</button>
            <button type="button" onClick={cancelOtp} className="w-full rounded-2xl bg-white py-2.5 text-[10px] font-bold text-[#291dcc] shadow-md ring-1 ring-stone-100 transition hover:bg-stone-50">Back to login</button>
          </form>
        </>
      ) : (
        <>
          <div className="mt-6 md:mt-8"><span className="rounded-full bg-lime-200 px-3 py-1.5 text-[10px] font-bold text-green-800">Customer Login</span><h2 id="login-heading" className="mt-3 text-3xl font-extrabold leading-[1.05] text-[#271dc8]">Sign in to your<br />account</h2><p className="mt-2 text-[11px] font-medium text-stone-500">Use your username or email to continue</p></div>
          <form className="mt-6 space-y-3" onSubmit={handleSubmit} noValidate>
            <div><label htmlFor="username" className="mb-1.5 block text-[11px] font-extrabold">Username or Email</label><div className="relative"><svg viewBox="0 0 24 24" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="3" /><path d="M5.5 20c.8-3.3 2.9-5 6.5-5s5.7 1.7 6.5 5" /></svg><input id="username" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" placeholder="Email" className="w-full rounded-2xl border border-stone-200 bg-white py-2.5 pl-9 pr-3 text-xs shadow-sm outline-none transition focus:border-green-700 focus:ring-4 focus:ring-green-100" /></div></div>
            <div><label htmlFor="password" className="mb-1.5 block text-[11px] font-extrabold">Password</label><div className="relative"><svg viewBox="0 0 24 24" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg><input id="password" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" placeholder="Password" className="w-full rounded-2xl border border-stone-200 bg-white py-2.5 pl-9 pr-14 text-xs shadow-sm outline-none transition focus:border-green-700 focus:ring-4 focus:ring-green-100" /><button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 px-3 text-[10px] font-bold text-green-800">{showPassword ? 'Hide' : 'Show'}</button></div></div>
            <div className="flex items-center justify-between gap-2 text-[10px] font-bold"><label className="flex cursor-pointer items-center gap-1.5"><input type="checkbox" className="h-4 w-4 accent-green-700" />Remember me</label><a href="#forgot" className="text-green-700 hover:underline">Forgot password?</a></div>
            {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-[10px] font-semibold text-red-700">{error}</p>}
            <button type="submit" className="mt-5 w-full rounded-2xl bg-[#291dcc] py-2.5 text-xs font-bold text-white shadow-md transition hover:bg-[#1e159b] focus:outline-none focus:ring-4 focus:ring-indigo-200">Log In</button>
            <button type="button" onClick={onRegister} className="w-full rounded-2xl bg-white py-2.5 text-[10px] font-bold text-[#291dcc] shadow-md ring-1 ring-stone-100 transition hover:bg-stone-50">Create account</button>
          </form>
        </>
      )}
      <div className="mt-7 border-t border-stone-200 pt-4 text-center text-[10px] text-stone-500">Need help? Contact <a href="mailto:hello@pectrack.example" className="font-bold text-green-700 hover:underline">Pectos Bakery Lucban Quezon</a></div>
    </div>
  )
}
