import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiPost } from '../api/client.js'
import { AuthShell, authButtonClass, authErrorClass, authSuccessClass } from './AuthShell.jsx'

// Where the link in the confirmation email lands (migration 016).
//
// A real page, not the sign-in pop-up: it is opened from an email, often on
// a different device from the one the customer registered on, with no
// session behind it. It does not need one — the token proves the mailbox,
// which is the only thing being confirmed.
//
// The token arrives in the URL fragment (#token=...), which the browser
// never transmits, and is cleared from the address bar once read — the
// same handling as the password-reset page.
function readToken() {
  if (typeof window === 'undefined') return ''
  return new URLSearchParams(window.location.hash.replace(/^#/, '')).get('token') ?? ''
}

export function VerifyEmailPage({ onVerified }) {
  const [token] = useState(readToken)
  const [state, setState] = useState(token ? 'working' : 'missing')
  const [message, setMessage] = useState('')
  // React's development mode runs effects twice. A verification token is
  // single-use, so the second run would consume nothing and report the
  // link as invalid over the top of a success. This makes the request
  // happen once per page load.
  const sent = useRef(false)

  useEffect(() => {
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname)
    if (!token || sent.current) return
    sent.current = true
    apiPost('/api/auth/verify-email', { token })
      .then((data) => {
        setMessage(data.message)
        setState('done')
        // Lets a signed-in customer's banner disappear without a reload.
        onVerified?.()
      })
      .catch((error) => {
        setMessage(error.message)
        setState('failed')
      })
  }, [token, onVerified])

  if (state === 'missing') {
    return (
      <AuthShell title="This link is incomplete" subtitle="Open the confirmation link from your email exactly as it was sent.">
        <p className="mt-6 text-xs text-stone-500">If it has expired, log in and request a new one from your account.</p>
        <Link to="/menu" className={`${authButtonClass} mt-5 block text-center`}>Go to the menu</Link>
      </AuthShell>
    )
  }

  if (state === 'working') {
    return (
      <AuthShell title="Confirming your email…" subtitle="One moment.">
        <span role="status" className="sr-only">Confirming your email</span>
      </AuthShell>
    )
  }

  if (state === 'failed') {
    return (
      <AuthShell title="This link did not work" subtitle="Links work once and expire after 24 hours.">
        <p role="alert" className={`mt-6 ${authErrorClass}`}>{message}</p>
        <p className="mt-4 text-xs text-stone-500">A newer link also replaces an older one — use the most recent email.</p>
        <Link to="/account" className={`${authButtonClass} mt-5 block text-center`}>Request a new link</Link>
      </AuthShell>
    )
  }

  return (
    <AuthShell title="Email confirmed" subtitle="Thank you — your account is ready.">
      <p role="status" className={`mt-6 ${authSuccessClass}`}>{message}</p>
      <Link to="/menu" className={`${authButtonClass} mt-5 block text-center`}>Start ordering</Link>
    </AuthShell>
  )
}
