import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiPost } from '../api/client.js'
import { AuthShell, authButtonClass } from './AuthShell.jsx'

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
      <AuthShell badge="Email Confirmation" title={<>This link is<br />incomplete</>}>
        <p className="mt-6 text-xs text-stone-500">Open the confirmation link from your email exactly as it was sent. If it has expired, sign in and request a new one from your account.</p>
        <Link to="/menu" className={`${authButtonClass} mt-6 block text-center`}>Go to the menu</Link>
      </AuthShell>
    )
  }

  if (state === 'working') {
    return (
      <AuthShell badge="Email Confirmation" title={<>Confirming your<br />email…</>}>
        <p role="status" className="mt-6 text-xs text-stone-500">One moment.</p>
      </AuthShell>
    )
  }

  if (state === 'failed') {
    return (
      <AuthShell badge="Email Confirmation" title={<>This link did<br />not work</>}>
        <p role="alert" className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{message}</p>
        <p className="mt-4 text-xs text-stone-500">Links work once and expire after 24 hours. A newer link also replaces an older one — use the most recent email.</p>
        <Link to="/account" className={`${authButtonClass} mt-6 block text-center`}>Request a new link</Link>
      </AuthShell>
    )
  }

  return (
    <AuthShell badge="Email Confirmation" title={<>Email<br />confirmed</>}>
      <p role="status" className="mt-6 rounded-lg bg-green-50 px-3 py-2 text-xs font-semibold text-green-800">{message}</p>
      <Link to="/menu" className={`${authButtonClass} mt-6 block text-center`}>Start ordering</Link>
    </AuthShell>
  )
}
