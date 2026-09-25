import { useState } from 'react'
import { apiPost } from '../api/client.js'

// Shown to a signed-in customer whose email is not confirmed yet
// (migration 016). A strip across the top of the page rather than a
// dialog: they can still browse and fill a cart, and a modal that blocked
// the menu would punish them for the one thing they are allowed to do.
//
// Renders nothing for staff, for guests, and for a verified customer.
export function VerifyEmailBanner({ user }) {
  const [status, setStatus] = useState('idle')
  const [message, setMessage] = useState('')

  if (user?.role !== 'CUSTOMER' || user.emailVerified !== false) return null

  const resend = async () => {
    setStatus('sending')
    try {
      const data = await apiPost('/api/auth/resend-verification')
      setMessage(data.message)
      setStatus('sent')
    } catch (error) {
      setMessage(error.message)
      setStatus('failed')
    }
  }

  return (
    <div role="region" aria-label="Email confirmation" className="border-b border-amber-200 bg-amber-50">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2.5 sm:px-7">
        <p className="text-xs text-amber-900">
          <span className="font-bold">Confirm your email to place orders.</span>{' '}
          {status === 'idle' || status === 'sending'
            ? <>We sent a link to <span className="font-semibold">{user.email}</span>.</>
            : <span role={status === 'failed' ? 'alert' : 'status'}>{message}</span>}
        </p>
        {status !== 'sent' && (
          <button
            type="button"
            onClick={resend}
            disabled={status === 'sending'}
            className="inline-flex min-h-8 shrink-0 items-center rounded-full border border-amber-300 bg-white px-3 text-xs font-bold text-amber-900 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status === 'sending' ? 'Sending…' : 'Resend link'}
          </button>
        )}
      </div>
    </div>
  )
}
