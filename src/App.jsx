import { useCallback, useEffect, useRef, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { apiGet, apiPost, sessionEndedEvent } from './api/client.js'
import { AuthModal } from './components/AuthModal.jsx'
import { CartFab } from './components/CartFab.jsx'
import { CartProvider } from './cart/CartContext.jsx'
import { CustomerAccount } from './pages/customer-account/CustomerAccount.jsx'
import { Dashboard } from './pages/dashboard/Dashboard.jsx'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage.jsx'
import { ResetPasswordPage } from './pages/ResetPasswordPage.jsx'
import { VerifyEmailPage } from './pages/VerifyEmailPage.jsx'
import { AboutPage } from './pages/customer-storefront/AboutPage.jsx'
import { CartPage } from './pages/customer-storefront/CartPage.jsx'
import { CheckoutPage } from './pages/customer-storefront/CheckoutPage.jsx'
import { ContactPage } from './pages/customer-storefront/ContactPage.jsx'
import { PrivacyPage, TermsPage } from './pages/customer-storefront/LegalPages.jsx'
import { HomePage } from './pages/customer-storefront/HomePage.jsx'
import { MenuPage } from './pages/customer-storefront/MenuPage.jsx'
import { OrderPlacedPage } from './pages/customer-storefront/OrderPlacedPage.jsx'
import { ReceiptPage } from './pages/customer-storefront/ReceiptPage.jsx'
import { StorefrontLayout } from './pages/customer-storefront/StorefrontLayout.jsx'

const staffRoles = new Set(['ADMIN', 'CASHIER', 'DELIVERY PERSONNEL'])
// Where a person goes the moment they sign in. Staff land on /dashboard,
// which opens each role on its own first screen (Dashboard.jsx's
// defaultModuleFor: an admin or cashier on the overview, a driver on My
// Deliveries). A customer lands on the Menu, which is where ordering
// starts — not on an internal dashboard they have no use for.
function landingPathFor(user) {
  if (staffRoles.has(user?.role)) return '/dashboard'
  if (user?.role === 'CUSTOMER') return '/menu'
  return '/'
}
// Everyone returns to the storefront home page on sign-out, whatever they
// were signed in as — logging out is leaving, and the public home page is
// the front of the shop.
const afterLogoutPath = '/'

// Pages a guest cannot use. Instead of navigating them to a sign-in page
// and stranding them there, both guards send them to a public page and
// open the sign-in pop-up over it, remembering where they were headed.
function RequireStaff({ user, openAuth, children }) {
  const location = useLocation()
  useEffect(() => {
    // /dashboard is staff territory, so the pop-up opens on the staff
    // door — the customer door would refuse a cashier's correct password
    // (routes/auth.js's audience check).
    if (!user) openAuth({ view: 'login', mode: 'staff', returnTo: location.pathname })
  }, [user, openAuth, location.pathname])
  if (!user) return <Navigate to="/" replace />
  // A customer who lands on the staff dashboard URL goes to their own
  // account page instead of being shown a shell full of modules their
  // role cannot open.
  if (user.role === 'CUSTOMER') return <Navigate to="/account" replace />
  return children
}

// /account is the customer's own page — the staff dashboard's counterpart,
// not a page staff have any use for.
function RequireCustomerAccount({ user, openAuth, children }) {
  const location = useLocation()
  useEffect(() => {
    if (!user) openAuth({ view: 'login', mode: 'customer', returnTo: location.pathname })
  }, [user, openAuth, location.pathname])
  if (!user) return <Navigate to="/" replace />
  if (user.role !== 'CUSTOMER') return <Navigate to="/dashboard" replace />
  return children
}

function RequireCustomer({ user, openAuth, children }) {
  const location = useLocation()
  useEffect(() => {
    if (!user) openAuth({ view: 'login', mode: 'customer', returnTo: location.pathname })
  }, [user, openAuth, location.pathname])
  if (!user) return <Navigate to="/menu" replace />
  if (user.role !== 'CUSTOMER') return <Navigate to="/dashboard" replace />
  return children
}

// /login, /staff-login and /register used to be real pages. They are now
// pop-ups, but the URLs stay alive: a bookmark, the "Back to sign in"
// links in the password-recovery pages, and anything already printed on
// paper all land on the home page with the right dialog already open.
function AuthRedirect({ user, openAuth, view, mode }) {
  useEffect(() => {
    if (!user) openAuth({ view, mode })
  }, [user, openAuth, view, mode])
  return <Navigate to={user ? landingPathFor(user) : '/'} replace />
}

function AppRoutes() {
  // Hold the signed-in account; a missing account means the visitor is logged out.
  const [user, setUser] = useState(null)
  // Track whether we're still asking the server if an existing session cookie is valid.
  const [checkingSession, setCheckingSession] = useState(true)
  // The auth pop-up: null when closed, otherwise { view, mode, returnTo }.
  // returnTo is where a successful sign-in should land instead of the
  // role's usual landing page — set when a guard opened the dialog, so
  // someone who clicked Checkout resumes at Checkout rather than the Menu.
  const [authRequest, setAuthRequest] = useState(null)
  const navigate = useNavigate()
  // Signing out clears the user and leaves the page that needed one, and
  // those land in the same commit — but if a guard ever did get a render
  // in between, it would greet the person who just signed out with a
  // sign-in dialog. This swallows exactly one automatic open after a
  // logout; a deliberate click is never affected, because by then the
  // flag is back down.
  const skipNextAutoAuth = useRef(false)

  // Identity is stable, so the guards' effects above don't re-fire on
  // every render of the page they protect.
  const openAuth = useCallback((request) => {
    if (skipNextAutoAuth.current) {
      skipNextAutoAuth.current = false
      return
    }
    setAuthRequest((current) => current ?? { view: 'login', mode: 'customer', returnTo: null, ...request })
  }, [])
  const closeAuth = useCallback(() => setAuthRequest(null), [])
  // Switching between the sign-in and register views keeps returnTo, so a
  // guest who registers mid-checkout still resumes at checkout.
  const setAuthView = useCallback((next) => setAuthRequest((current) => ({ ...current, mode: 'customer', ...next })), [])

  // PHASE10 B6 — the session ended under an open page (timed out after
  // inactivity, or signed out elsewhere). Clear the account and reopen the
  // sign-in pop-up on the right door, over the page they were on, so
  // signing back in returns them there. Ignored while nobody is signed
  // in: the first-load /me check expects a 401 for a guest.
  const userRef = useRef(user)
  userRef.current = user
  useEffect(() => {
    const onSessionEnded = (event) => {
      const current = userRef.current
      if (!current) return
      setUser(null)
      setAuthRequest({
        view: 'login',
        mode: current.role === 'CUSTOMER' ? 'customer' : 'staff',
        returnTo: window.location.pathname,
        notice: event.detail?.message,
      })
    }
    window.addEventListener(sessionEndedEvent, onSessionEnded)
    return () => window.removeEventListener(sessionEndedEvent, onSessionEnded)
  }, [])

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

  const handleLogin = (loggedInUser) => {
    const destination = authRequest?.returnTo ?? landingPathFor(loggedInUser)
    setUser(loggedInUser)
    setAuthRequest(null)
    navigate(destination, { replace: true })
  }

  // Re-reads the signed-in account. Used when something outside this tab
  // may have changed it — the email-confirmation link, most often opened
  // in a different tab or on a phone.
  const refreshUser = useCallback(() => {
    apiGet('/api/auth/me')
      .then((data) => setUser(data.user))
      .catch(() => {})
  }, [])

  // An unconfirmed customer usually confirms in ANOTHER tab — the one the
  // email client opened. When they come back to this one, re-read the
  // account so the banner and the checkout block clear on their own
  // instead of waiting for a reload they would not think to do. Only
  // while unconfirmed: nobody else needs a request on every tab switch.
  const awaitingVerification = user?.role === 'CUSTOMER' && user.emailVerified === false
  useEffect(() => {
    if (!awaitingVerification) return
    const onVisible = () => { if (document.visibilityState === 'visible') refreshUser() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [awaitingVerification, refreshUser])

  // Ask the server to delete the session, then clear it locally either way
  // and return to the public home page.
  const handleLogout = async () => {
    try {
      await apiPost('/api/auth/logout')
    } catch {
      // Ignore — clear the local session regardless of whether the request reached the server.
    } finally {
      skipNextAutoAuth.current = true
      // Leave the guarded page in the same commit as the user is cleared,
      // so nothing ever renders a staff screen with no one signed in.
      navigate(afterLogoutPath, { replace: true })
      setUser(null)
    }
  }

  // Avoid flashing a guarded page while the session check is still in flight.
  if (checkingSession) return null

  return (
    <CartProvider user={user}>
      <Routes>
        <Route path="/login" element={<AuthRedirect user={user} openAuth={openAuth} view="login" mode="customer" />} />
        <Route path="/staff-login" element={<AuthRedirect user={user} openAuth={openAuth} view="login" mode="staff" />} />
        <Route path="/register" element={<AuthRedirect user={user} openAuth={openAuth} view="register" mode="customer" />} />
        {/* Still real pages: /reset-password is reached from an email link
            in a fresh browser with no app state behind it, and its sibling
            belongs with it. */}
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        {/* A real page for the same reason: the confirmation link is opened
            from an email, often on another device, with no session. */}
        <Route path="/verify-email" element={<VerifyEmailPage onVerified={refreshUser} />} />
        <Route path="/dashboard" element={<RequireStaff user={user} openAuth={openAuth}><Dashboard user={user} onLogout={handleLogout} onUserUpdated={setUser} /></RequireStaff>} />
        <Route path="/account" element={<RequireCustomerAccount user={user} openAuth={openAuth}><CustomerAccount user={user} onLogout={handleLogout} onUserUpdated={setUser} /></RequireCustomerAccount>} />
        <Route element={<StorefrontLayout user={user} onOpenAuth={openAuth} onLogout={handleLogout} />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/menu" element={<MenuPage user={user} />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/cart" element={<RequireCustomer user={user} openAuth={openAuth}><CartPage /></RequireCustomer>} />
          <Route path="/checkout" element={<RequireCustomer user={user} openAuth={openAuth}><CheckoutPage user={user} /></RequireCustomer>} />
          <Route path="/order-placed/:orderId" element={<RequireCustomer user={user} openAuth={openAuth}><OrderPlacedPage /></RequireCustomer>} />
          <Route path="/receipt/:orderId" element={<RequireCustomer user={user} openAuth={openAuth}><ReceiptPage user={user} /></RequireCustomer>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {/* Outside <Routes> on purpose: the same dialog covers the storefront,
          the dashboard, and a redirect in progress. */}
      <AuthModal request={authRequest} onClose={closeAuth} onLogin={handleLogin} onView={setAuthView} />
      {/* Likewise: the cart follows a customer across every storefront
          page, so it cannot live inside one route's layout. */}
      <CartFab user={user} />
    </CartProvider>
  )
}

// BrowserRouter wraps AppRoutes rather than sitting inside it, because
// everything above needs useNavigate and useLocation — a sign-in that
// routes by role and a sign-out that returns home both navigate.
function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
export default App
