import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
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

const defaultModuleFor = (role) => {
  if (role === 'DELIVERY PERSONNEL') return 'My Deliveries'
  return 'Dashboard'
}
export function Dashboard({ user, onLogout, onUserUpdated }) {
  // Track which permitted module is currently active.
  const [activeModule, setActiveModule] = useState(() => defaultModuleFor(user.role))
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
  // module plain, so a hint never lingers into the next visit.
  const [moduleParams, setModuleParams] = useState(null)
  const openModule = (name, params = null) => {
    setActiveModule(name)
    setModuleParams(params)
    setMenuOpen(false)
  }
  // Phones and tablets (the user, 2026-10-24): every module in a drawer
  // behind a Menu button, instead of a sideways-scrolling strip where most
  // modules sat off the screen and nobody knew to swipe for them.
  const [menuOpen, setMenuOpen] = useState(false)
  const drawerRef = useRef(null)
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
    else openModule('Order Management', { orderId: item.orderId, at: Date.now() })
  }
  // Calculate the navigation items for the signed-in role.
  const allowedModules = modules.filter((module) => module.roles.includes(user.role))
  const ActiveModuleComponent = moduleComponents[activeModule]

  // ---------------------------------------------------------------------
  // Shell layout (UI_AUDIT.md H6 — Stage 2, "the mobile nav is absolutely
  // positioned against a magic offset")
  //
  // The old shell put the mobile module nav at `absolute top-16.25`
  // (65px), a hard-coded copy of the header's rendered height, and every
  // one of the 11 module pages compensated with `pt-24` to avoid being
  // covered by it. Two components silently agreeing on a pixel number is
  // exactly the kind of coupling that breaks the moment either one
  // changes — a longer header (wraps to two lines on a small screen, a
  // banner gets added, a role badge gets added) desyncs the offset and a
  // new module page that forgets `pt-24` renders underneath the nav.
  //
  // Fix: nobody encodes anybody else's height. The mobile nav is now a
  // normal flex child (in document flow, not `absolute`), and the shell
  // owns its own vertical spacing via `<main>`'s own padding instead of
  // each page repeating a magic top offset — see the 11 module files,
  // where the only edit was deleting `pt-24 ... md:pt-9`.
  //
  // Desktop needs to keep the previous look (fixed-width sidebar, pinned
  // in place, content scrolls past it) without measuring anything. The
  // classic app-shell trick does that with plain flexbox, no calc():
  //   - the outermost wrapper is pinned to exactly one viewport
  //     (`md:h-screen md:overflow-hidden`) so the page itself never
  //     scrolls on desktop;
  //   - the header is `shrink-0`, so it keeps whatever height its own
  //     content needs and the row below simply gets what's left;
  //   - the header+sidebar+main row is `flex-1 min-h-0` — `min-h-0` is
  //     the part that's easy to forget: without it a flex child refuses
  //     to shrink below its content size, so its "leftover space" would
  //     never actually be bounded and neither child below could scroll;
  //   - the sidebar and `<main>` each scroll independently
  //     (`overflow-y-auto`) inside that bounded row. The sidebar's height
  //     is never set explicitly at all — flexbox's default
  //     `align-items: stretch` makes it exactly as tall as the row, for
  //     any header height, forever.
  //
  // Mobile intentionally does NOT get this treatment: below `md`, the
  // wrapper is only `min-h-screen` (no fixed height, no overflow lock),
  // so the whole page scrolls normally — header, mobile nav, then
  // content, top to bottom, the way a phone page is supposed to behave.
  // ---------------------------------------------------------------------
  return (
    <div className="flex min-h-screen flex-col bg-surface-sunk text-ink-700 lg:h-screen lg:overflow-hidden print:block print:h-auto print:min-h-0 print:overflow-visible print:bg-white">
      {/* Sticky on phones, so the Menu and the bell are always one tap away. */}
      <header className="sticky top-0 z-40 flex shrink-0 items-center justify-between gap-2 bg-surface px-3 py-2.5 shadow-raised sm:px-7 lg:relative lg:z-10 lg:py-3 print:hidden">
        <div className="flex min-w-0 items-center gap-2">
          <button type="button" onClick={() => setMenuOpen(true)} aria-label="Open the menu" aria-expanded={menuOpen} aria-controls={menuOpen ? 'staff-mobile-menu' : undefined} className="grid h-10 w-10 shrink-0 place-items-center rounded-control text-ink-700 hover:bg-surface-sunk lg:hidden">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          </button>
          <Link to="/" aria-label="Go to home" className="min-w-0">
            <Brand compact />
          </Link>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <NotificationBell user={user} onOpen={openNotified} />
          <span className="hidden text-right text-xs text-ink-500 sm:block">
            <strong className="block font-semibold text-ink-900">{user.name}</strong>
            {user.role}
          </span>
          <div className="hidden h-9 w-9 place-items-center rounded-full bg-brand-100 font-semibold text-brand-700 sm:grid">{user.name[0]}</div>
          {/* Stage 1 primitive (per the audit's Stage 2 scope note) — this
              is a generic secondary action, not navigation, so it's the
              one control in this shell that goes through <Button>. */}
          <Button type="button" variant="secondary" size="sm" onClick={onLogout}>
            Log out
          </Button>
        </div>
      </header>

      {/* The sidebar appears from `lg`, not `md`: at 768–1023px its 256px
          took a third of the screen and squeezed every table into a
          horizontal scroller. Tablets get the same pill row as phones. */}
      {/* Full width (the adviser, 2026-10-23): the sidebar sits at the
          screen's left edge and the content fills the rest, with no empty
          gutters either side on a wide monitor. */}
      <div className="flex w-full min-h-0 flex-1 flex-col lg:flex-row print:block">
        {/* Desktop sidebar. No explicit height anywhere — it stretches to
            fill the row (see the layout note above) and scrolls its own
            content with `overflow-y-auto` if a role ever has enough
            modules to exceed the viewport. */}
        <aside className="hidden w-64 shrink-0 overflow-y-auto bg-surface p-5 shadow-raised lg:block print:hidden">
          {/* Micro-label per DESIGN SYSTEM's typography table: 10px/600,
              uppercase, tracking-wide — not the old font-bold/tracking-widest
              pairing (H2: weight should carry meaning, not be maxed out
              everywhere). */}
          <p className="mb-4 px-3 text-[10px] font-semibold tracking-wide text-ink-500 uppercase">MAIN MENU</p>
          <nav className="space-y-1">
            {allowedModules.map((module, index) => (
              <div key={module.name}>
                {(index === 0 || navigationGroupFor(allowedModules[index - 1].name) !== navigationGroupFor(module.name)) && (
                  <p className="mb-2 mt-4 px-3 text-[10px] font-semibold uppercase tracking-wide text-ink-500">{navigationGroupFor(module.name)}</p>
                )}
                <button
                  type="button"
                  onClick={() => openModule(module.name)}
                  aria-current={activeModule === module.name ? 'page' : undefined}
                  className={`flex w-full items-center gap-3 rounded-control px-3 py-3 text-left text-sm transition ${
                    activeModule === module.name
                      ? 'bg-brand-600 font-semibold text-white shadow-raised'
                      : 'font-medium text-ink-500 hover:bg-brand-50 hover:text-brand-700'
                  }`}
                >
                  <ModuleIcon name={module.icon} />
                  {module.name}
                </button>
              </div>
            ))}
          </nav>
        </aside>

        {/* Phones and tablets: the module drawer, opened from the header's
            Menu button. Tapping a module, the backdrop, or Esc closes it. */}
        {menuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden print:hidden" role="dialog" aria-modal="true" aria-label="Menu">
            <button type="button" aria-label="Close the menu" onClick={() => setMenuOpen(false)} className="absolute inset-0 bg-black/40" />
            <nav id="staff-mobile-menu" ref={drawerRef} tabIndex={-1} className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto bg-surface p-4 shadow-2xl">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[10px] font-semibold tracking-wide text-ink-500 uppercase">Main menu</p>
                <button type="button" onClick={() => setMenuOpen(false)} aria-label="Close the menu" className="grid h-11 w-11 place-items-center rounded-control text-lg text-ink-500 hover:bg-surface-sunk">✕</button>
              </div>
              <div className="space-y-1">
                {allowedModules.map((module, index) => (
                  <div key={module.name}>
                    {(index === 0 || navigationGroupFor(allowedModules[index - 1].name) !== navigationGroupFor(module.name)) && (
                      <p className="mb-2 mt-4 px-3 text-[10px] font-semibold uppercase tracking-wide text-ink-500">{navigationGroupFor(module.name)}</p>
                    )}
                    <button
                      type="button"
                      onClick={() => openModule(module.name)}
                      aria-current={activeModule === module.name ? 'page' : undefined}
                      className={`flex min-h-12 w-full items-center gap-3 rounded-control px-3 text-left text-base transition ${
                        activeModule === module.name ? 'bg-brand-600 font-semibold text-white' : 'font-medium text-ink-700 hover:bg-brand-50'
                      }`}
                    >
                      <ModuleIcon name={module.icon} />
                      {module.name}
                    </button>
                  </div>
                ))}
              </div>
              <p className="mt-auto border-t border-line-200 pt-3 text-xs text-ink-500">
                Signed in as <strong className="font-semibold text-ink-900">{user.name}</strong> · {user.role}
              </p>
            </nav>
          </div>
        )}

        {/* <main> wraps the module content, not the whole shell — the
            header/sidebar/nav around it are chrome, not the page's main
            landmark. The shell owns the top spacing that used to live in
            every module page as `pt-24`/`md:pt-9`; each module's own
            <section> keeps only its ordinary side/bottom padding. */}
        <main className="min-w-0 flex-1 pt-6 sm:pt-8 lg:overflow-y-auto print:overflow-visible print:pt-0">
          {/* onNavigate === setActiveModule, so a module page (currently
              only DashboardHome — see its M2 fix, UI_AUDIT.md) can switch
              to another permitted module the same way the sidebar/mobile
              nav above does, instead of faking a link that goes nowhere. */}
          <ActiveModuleComponent key={`${activeModule}:${JSON.stringify(moduleParams)}`} user={user} activeModule={activeModule} params={moduleParams} onUserUpdated={onUserUpdated} onNavigate={openModule} onLogout={onLogout} />
        </main>
      </div>
    </div>
  )
}
