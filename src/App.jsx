import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { apiGet, apiPost } from './api/client.js'
import { CartProvider } from './cart/CartContext.jsx'
import { Dashboard } from './pages/dashboard/Dashboard.jsx'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage.jsx'
import { LoginPage } from './pages/LoginPage.jsx'
import { RegistrationPage } from './pages/RegistrationPage.jsx'
import { ResetPasswordPage } from './pages/ResetPasswordPage.jsx'
import { AboutPage } from './pages/customer-storefront/AboutPage.jsx'
import { CartPage } from './pages/customer-storefront/CartPage.jsx'
import { CheckoutPage } from './pages/customer-storefront/CheckoutPage.jsx'
import { ContactPage } from './pages/customer-storefront/ContactPage.jsx'
import { HomePage } from './pages/customer-storefront/HomePage.jsx'
import { MenuPage } from './pages/customer-storefront/MenuPage.jsx'
import { OrderPlacedPage } from './pages/customer-storefront/OrderPlacedPage.jsx'
import { StorefrontLayout } from './pages/customer-storefront/StorefrontLayout.jsx'

const staffRoles = new Set(['ADMIN', 'CASHIER', 'DELIVERY PERSONNEL'])
function landingPathFor(user) {
  if (staffRoles.has(user?.role)) return '/dashboard'
  if (user?.role === 'CUSTOMER') return '/menu'
  return '/'
}
// /dashboard is staff territory, so an expired or missing session goes to
// the STAFF door — sending a cashier to the customer one would now refuse
// their correct password (routes/auth.js's audience check) for no reason.
function RequireAuth({ user, children }) {
  if (!user) return <Navigate to="/staff-login" replace />
  return children
}

function RequireCustomer({ user, children }) {
  const location = useLocation()
  if (!user) return <Navigate to={`/login?returnTo=${encodeURIComponent(location.pathname)}`} replace />
  if (user.role !== 'CUSTOMER') return <Navigate to="/dashboard" replace />
  return children
}

function safeReturnTo(raw) {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return null
  return raw
}

// `initialMode` is the door this route opens on — /login the customer one,
// /staff-login the staff one. Everything else about the two is identical,
// including the returnTo handling, so they share one component.
function LoginRoute({ user, onLogin, initialMode = 'customer' }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const returnTo = safeReturnTo(searchParams.get('returnTo'))
  if (user) return <Navigate to={returnTo ?? landingPathFor(user)} replace />
  return (
    <LoginPage
      initialMode={initialMode}
      onRegister={() => navigate('/register')}
      onLogin={(loggedInUser) => {
        onLogin(loggedInUser)
        navigate(returnTo ?? landingPathFor(loggedInUser), { replace: true })
      }}
    />
  )
}

function RegisterRoute({ user }) {
  const navigate = useNavigate()
  if (user) return <Navigate to={landingPathFor(user)} replace />
  return <RegistrationPage onLogin={() => navigate('/login')} />
}


function App() {
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

  return (
    <BrowserRouter>
      <CartProvider user={user}>
        <Routes>
          <Route path="/login" element={<LoginRoute user={user} onLogin={setUser} />} />
          <Route path="/staff-login" element={<LoginRoute user={user} onLogin={setUser} initialMode="staff" />} />
          <Route path="/register" element={<RegisterRoute user={user} />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/dashboard" element={<RequireAuth user={user}><Dashboard user={user} onLogout={handleLogout} onUserUpdated={setUser} /></RequireAuth>} />
          <Route element={<StorefrontLayout user={user} onLogin={setUser} />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/menu" element={<MenuPage user={user} />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="/cart" element={<RequireCustomer user={user}><CartPage /></RequireCustomer>} />
            <Route path="/checkout" element={<RequireCustomer user={user}><CheckoutPage /></RequireCustomer>} />
            <Route path="/order-placed/:orderId" element={<RequireCustomer user={user}><OrderPlacedPage /></RequireCustomer>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </CartProvider>
    </BrowserRouter>
  )
}
export default App
