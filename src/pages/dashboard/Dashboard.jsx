import { useEffect, useRef, useState } from 'react'
import './dashboard.css'
import { Link, matchPath, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Brand } from '../../components/Brand.jsx'
import { NotificationBell } from '../../components/NotificationBell.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { ModuleIcon } from '../../components/ui/ModuleIcon.jsx'
import { DashboardHome } from './DashboardHome.jsx'
import { DeliveryManagement } from './DeliveryManagement.jsx'
import { InventoryManagement } from './InventoryManagement.jsx'
import { modules } from './modules.js'
import { MyProfile } from './MyProfile.jsx'
import { OrderManagement } from './OrderManagement.jsx'
import { PaymentBilling } from './PaymentBilling.jsx'
import { ReportingAnalytics } from './ReportingAnalytics.jsx'
import { UserManagement } from './UserManagement.jsx'

const moduleComponents = {
  ...Object.fromEntries(modules.map((module) => [module.name, DashboardHome])),
  'Inventory Management': InventoryManagement,
  'User Management': UserManagement,
  'My Profile': MyProfile,
  'Order Management': OrderManagement,
  'Payment & Billing': PaymentBilling,
  'Delivery Management': DeliveryManagement,
  'My Deliveries': DeliveryManagement,
  'Reporting & Analytics': ReportingAnalytics,
}
// Staff only — a customer never reaches this shell (App.jsx routes them
// to /account instead), so there is no CUSTOMER case to answer here.
const navigationGroupFor = (name) => name === 'My Profile' ? 'Account' : ['Reporting & Analytics', 'User Management'].includes(name) ? 'Business' : 'Daily operations'

const defaultPathFor = (role) => {
  if (role === 'DELIVERY PERSONNEL') return '/my-deliveries'
  return '/dashboard'
}
export function Dashboard({ user, onLogout, onUserUpdated }) {
  const navigate = useNavigate()
  const { pathname, state: locationState } = useLocation()
  // The address names the open module, limited to what this role may open.
  const allowedModules = modules.filter((module) => module.roles.includes(user.role))
  const activeModule = allowedModules.find((module) => matchPath(module.path, pathname))?.name
  // The bakery palette and type for staff screens (index.css .staff-skin).
  // Set on <html>, not this component's root, so modals rendered in
  // portals and charts that read the colour tokens from the document
  // (lib/theme.js) follow it too. Added during the first render rather
  // than in an effect: child effects run before a parent's, so a chart
  // drawn on mount would otherwise read the old colours. The effect adds
  // it again because React's development double-mount runs the cleanup
  // once in between.
  useState(() => document.documentElement.classList.add('staff-skin'))
  useEffect(() => {
    document.documentElement.classList.add('staff-skin')
    return () => document.documentElement.classList.remove('staff-skin')
  }, [])
  // Optional hints for the module being opened — the Dashboard's Low stock
  // tile opens Inventory with { stockFilter: 'LOW' }. The sidebar opens a
  // module plain, so a hint never lingers into the next visit. The hint
  // travels in the history entry, so Back returns to the same view.
  const moduleParams = locationState?.moduleParams ?? null
  const openModule = (name, params = null) => {
    const path = modules.find((module) => module.name === name)?.path ?? defaultPathFor(user.role)
    navigate(path, { state: params && { moduleParams: params }, replace: path === pathname })
    setMenuOpen(false)
  }
  // Phones and tablets (the user, 2026-10-24): every module in a drawer
  // behind a Menu button, instead of a sideways-scrolling strip where most
  // modules sat off the screen and nobody knew to swipe for them.
  const [menuOpen, setMenuOpen] = useState(false)
  const drawerRef = useRef(null)
  // The Back button changes module too, and must not leave the drawer open.
  useEffect(() => { setMenuOpen(false) }, [pathname])
  useEffect(() => {
    if (!menuOpen) return
    const opener = document.activeElement
    const previousOverflow = document.body.style.overflow
    const desktop = window.matchMedia('(min-width: 1024px)')
    const closeOnDesktop = () => { if (desktop.matches) setMenuOpen(false) }
    document.body.style.overflow = 'hidden'
    drawerRef.current?.focus()
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); setMenuOpen(false) }
      if (event.key !== 'Tab' || !drawerRef.current) return
      const focusable = [...drawerRef.current.querySelectorAll('button:not([disabled]), a[href]')].filter((element) => element.getClientRects().length > 0)
      if (!focusable.length) { event.preventDefault(); return }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && (document.activeElement === first || document.activeElement === drawerRef.current)) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === drawerRef.current)) { event.preventDefault(); first.focus() }
    }
    closeOnDesktop()
    desktop.addEventListener('change', closeOnDesktop)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      desktop.removeEventListener('change', closeOnDesktop)
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      if (opener?.isConnected) opener.focus({ preventScroll: true })
    }
  }, [menuOpen])
  // The bell (NOTIFICATIONS_PLAN.md, N3): order news, delivery news
  // included, opens the order in Order Management (no Delivery Management
  // module since MINOR_REVISIONS_PLAN.md M13). `at` makes a second click on
  // the same order open it again.
  const openNotified = (item) => {
    if (item.type === 'assigned') openModule('My Deliveries')
    // A product running low (SENIOR_CONSULT_PLAN.md, S4): its stock.
    else if (item.type === 'low_stock') openModule('Inventory Management')
    // Due within the hour: the order's receipt, where Needed by lives.
    else if (item.type === 'due_soon') openModule('Payment & Billing', { orderId: item.orderId, at: Date.now() })
    // A QR Ph reference to check (QRPH_PLAN.md, Q11).
    else if (item.type === 'payment_to_confirm') openModule('Payment & Billing', { tab: 'confirm', at: Date.now() })
    else openModule('Order Management', { orderId: item.orderId, at: Date.now() })
  }
  // A module this role may not open, typed or bookmarked: their first screen.
  if (!activeModule) return <Navigate to={defaultPathFor(user.role)} replace />
  const ActiveModuleComponent = moduleComponents[activeModule]

  const navigation = allowedModules.map((module, index) => (
    <div key={module.name}>
      {(index === 0 || navigationGroupFor(allowedModules[index - 1].name) !== navigationGroupFor(module.name)) && (
        <p className="staff-nav-label">{navigationGroupFor(module.name)}</p>
      )}
      <button type="button" onClick={() => openModule(module.name)}
        aria-current={activeModule === module.name ? 'page' : undefined}
        className={`staff-nav-item ${activeModule === module.name ? 'is-active' : ''}`}>
        <ModuleIcon name={module.icon} />
        <span>{module.name}</span>
        {activeModule === module.name && <span className="staff-nav-indicator" aria-hidden="true" />}
      </button>
    </div>
  ))

  return (
    <div className="staff-workspace flex min-h-screen flex-col text-ink-700 lg:h-screen lg:overflow-hidden print:block print:h-auto print:min-h-0 print:overflow-visible print:bg-white">
      <header className="staff-topbar sticky top-0 z-40 flex shrink-0 items-center justify-between lg:relative lg:z-10 print:hidden">
        <div className="staff-brand flex min-w-0 shrink-0 items-center gap-2">
          <button type="button" onClick={() => setMenuOpen(true)} aria-label="Open the menu" aria-expanded={menuOpen} aria-controls={menuOpen ? 'staff-mobile-menu' : undefined} className="grid h-11 w-11 shrink-0 place-items-center rounded-control text-ink-700 hover:bg-surface-sunk lg:hidden">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          </button>
          <Link to="/" aria-label="Go to home" className="min-w-0"><Brand compact /></Link>
        </div>
        <div className="hidden min-w-0 flex-1 items-center gap-3 px-8 text-sm lg:flex">
          <span className="text-ink-500">Workspace</span>
          <span className="text-ink-500" aria-hidden="true">/</span>
          <span className="truncate font-semibold text-ink-900">{activeModule}</span>
        </div>
        <div className="staff-topbar-actions flex shrink-0 items-center gap-2 sm:gap-4">
          <NotificationBell user={user} onOpen={openNotified} />
          <div className="hidden items-center gap-2.5 border-l border-line-100 pl-4 sm:flex">
            <div className="staff-avatar" aria-hidden="true">{user.name[0]}</div>
            <span className="text-xs text-ink-500"><strong className="block text-sm font-semibold text-ink-900">{user.name}</strong>{user.role}</span>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onLogout}>Log out</Button>
        </div>
      </header>

      <div className="flex w-full min-h-0 flex-1 flex-col lg:flex-row print:block">
        <aside className="staff-sidebar hidden w-64 shrink-0 flex-col lg:flex print:hidden" aria-label="Workspace navigation">
          <div className="staff-workspace-label"><span className="staff-bakery-dot" aria-hidden="true" />Pecto's Bakery<span className="staff-workspace-caption">Operations workspace</span></div>
          <nav aria-label="Main menu" className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">{navigation}</nav>
          <div className="staff-sidebar-footer">
            <Link to="/" className="staff-store-link">View storefront <span aria-hidden="true">&#8599;</span></Link>
          </div>
        </aside>

        {menuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden print:hidden" role="dialog" aria-modal="true" aria-label="Menu">
            <button type="button" aria-label="Close the menu" onClick={() => setMenuOpen(false)} className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
            <nav id="staff-mobile-menu" ref={drawerRef} tabIndex={-1} aria-label="Main menu" className="staff-sidebar absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto p-4 shadow-2xl">
              <div className="mb-3 flex shrink-0 items-center justify-between">
                <span className="staff-drawer-title">PECTRACK <span>Workspace</span></span>
                <button type="button" onClick={() => setMenuOpen(false)} aria-label="Close the menu" className="staff-close-menu grid h-11 w-11 place-items-center rounded-control">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
                </button>
              </div>
              <div className="space-y-1">{navigation}</div>
              <p className="staff-mobile-account mt-auto pt-6 text-xs">Signed in as <strong>{user.name}</strong> &middot; {user.role}</p>
            </nav>
          </div>
        )}

        <main id="staff-main" className="min-w-0 flex-1 pt-6 sm:pt-8 lg:overflow-y-auto print:overflow-visible print:pt-0">
          <ActiveModuleComponent key={`${activeModule}:${JSON.stringify(moduleParams)}`} user={user} activeModule={activeModule} params={moduleParams} onUserUpdated={onUserUpdated} onNavigate={openModule} onLogout={onLogout} />
        </main>
      </div>
    </div>
  )
}
