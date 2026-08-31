// Import state management for page changes and the session lifecycle.
import { useEffect, useState } from 'react'
import { apiGet, apiPost } from './api/client.js'
import { Dashboard } from './pages/dashboard/Dashboard.jsx'
import { LoginPage } from './pages/LoginPage.jsx'
import { RegistrationPage } from './pages/RegistrationPage.jsx'

// Coordinate public pages and protected role-based dashboard screens.
function App() {
  // Remember whether the visitor is signing in or registering.
  const [page, setPage] = useState('login')
  // Hold the signed-in account; a missing account means the visitor is logged out.
  const [user, setUser] = useState(null)
  // Track whether we're still asking the server if an existing session cookie is valid.
  const [checkingSession, setCheckingSession] = useState(true)

  // On first load, ask the server whether the session cookie (if any) is still
  // valid, so a page refresh doesn't force the user to log in again.
  useEffect(() => {
    let cancelled = false
    apiGet('/api/auth/me')
      .then((data) => { if (!cancelled) setUser(data.user) })
      .catch(() => {
        // Not signed in — expected on first visit, nothing to do.
      })
      .finally(() => { if (!cancelled) setCheckingSession(false) })
    return () => { cancelled = true }
  }, [])

  // Ask the server to delete the session, then clear it locally either way.
  const handleLogout = async () => {
    try {
      await apiPost('/api/auth/logout')
    } catch {
      // Ignore — clear the local session regardless of whether the request reached the server.
    } finally {
      setUser(null)
    }
  }

  // Avoid flashing the login page while the session check is still in flight.
  if (checkingSession) return null
  // Show the protected dashboard once a session is confirmed.
  if (user) return <Dashboard user={user} onLogout={handleLogout} onUserUpdated={setUser} />
  // Render the requested registration page when selected.
  if (page === 'register') return <RegistrationPage onLogin={() => setPage('login')} onRegister={() => setPage('register')} />
  // Render the login page by default.
  return <LoginPage onRegister={() => setPage('register')} onLogin={setUser} />
}

// Export the application so Vite can mount it.
export default App
