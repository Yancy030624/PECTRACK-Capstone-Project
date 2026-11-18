import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { AuthShell, authButtonClass } from './AuthShell.jsx'

// Reset links were replaced by six-digit codes (the panel, final defense
// 2026-11-18; migration 045). An old link from an inbox lands here and is
// sent to the code page. The fragment that held the old token is cleared
// from the address bar.
export function ResetPasswordPage() {
  useEffect(() => {
    if (window.location.hash || window.location.search) window.history.replaceState(null, '', window.location.pathname)
  }, [])

  return (
    <AuthShell title="Reset links no longer work" subtitle="We now send a 6-digit code to your email instead of a link.">
      <div className="mt-6">
        <Link to="/forgot-password" className={`${authButtonClass} block text-center`}>Get a code</Link>
      </div>
    </AuthShell>
  )
}
