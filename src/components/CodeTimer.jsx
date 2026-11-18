import { useEffect, useState } from 'react'

// The countdown under every code box (the panel, final defense 2026-11-18;
// RULES-PLANS/FINAL_DEFENSE_REVISIONS_PLAN.md C3): how long the code still
// works, then "expired", and a Resend button that waits out the server's
// one-minute cooldown. Used for the sign-up and advanced-order SMS codes,
// the admin sign-in code, and the forgot-password and change-password codes.
//
// expiresAt and resendAt are times in milliseconds (Date.now() based), or
// null before a code was sent.
const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

export function codeTimes(data, now = Date.now()) {
  return {
    expiresAt: data?.expiresInSeconds ? now + data.expiresInSeconds * 1000 : null,
    resendAt: now + (data?.resendInSeconds ?? 60) * 1000,
  }
}

export function CodeTimer({ expiresAt, resendAt, onResend, busy = false, className = '', linkClass = 'font-bold text-crust-600 hover:underline' }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const secondsLeft = expiresAt ? Math.max(0, Math.ceil((expiresAt - now) / 1000)) : null
  const resendIn = resendAt ? Math.max(0, Math.ceil((resendAt - now) / 1000)) : 0
  const expired = secondsLeft === 0

  return (
    <div className={`text-xs ${className}`}>
      {secondsLeft !== null && (
        <p aria-live={expired ? 'assertive' : 'off'} className={expired ? 'font-semibold text-red-700' : 'text-stone-500'}>
          {expired ? 'This code has expired. Send a new one.' : <>Code expires in <span className="font-semibold tabular-nums">{clock(secondsLeft)}</span></>}
        </p>
      )}
      {onResend && (
        <p className="mt-1 text-stone-500">
          Didn't get a code?{' '}
          {resendIn > 0
            ? <span className="font-semibold tabular-nums text-stone-400">Resend in {clock(resendIn)}</span>
            : <button type="button" onClick={onResend} disabled={busy} className={`${linkClass} disabled:opacity-60`}>Resend code</button>}
        </p>
      )}
    </div>
  )
}
