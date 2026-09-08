import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Brand } from '../../components/Brand.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { CustomerManagement } from './CustomerManagement.jsx'
import { DashboardHome } from './DashboardHome.jsx'
import { DeliveryManagement } from './DeliveryManagement.jsx'
import { InventoryManagement } from './InventoryManagement.jsx'
import { modules } from './modules.js'
import { MyProfile } from './MyProfile.jsx'
import { OrderManagement } from './OrderManagement.jsx'
import { PaymentBilling } from './PaymentBilling.jsx'
import { ProductManagement } from './ProductManagement.jsx'
import { ReportingAnalytics } from './ReportingAnalytics.jsx'
import { StaffManagement } from './StaffManagement.jsx'

const moduleComponents = {
  ...Object.fromEntries(modules.map((module) => [module.name, DashboardHome])),
  'Staff Management': StaffManagement,
  'Product Management': ProductManagement,
  'Inventory Management': InventoryManagement,
  'Customer Management': CustomerManagement,
  'My Profile': MyProfile,
  'Order Management': OrderManagement,
  'My Orders': OrderManagement,
  'Payment & Billing': PaymentBilling,
  'Delivery Management': DeliveryManagement,
  'Reporting & Analytics': ReportingAnalytics,
}
const defaultModuleFor = (role) => {
  if (role === 'CUSTOMER') return 'My Orders'
  if (role === 'DELIVERY PERSONNEL') return 'Delivery Management'
  return 'Dashboard'
}
export function Dashboard({ user, onLogout, onUserUpdated }) {
  // Track which permitted module is currently active.
  const [activeModule, setActiveModule] = useState(() => defaultModuleFor(user.role))
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
    <div className="flex min-h-screen flex-col bg-surface-sunk text-ink-700 md:h-screen md:overflow-hidden">
      <header className="flex shrink-0 items-center justify-between border-b border-line-200 bg-surface px-4 py-3 shadow-raised sm:px-7">
        <Link to="/" aria-label="Go to home">
          <Brand compact />
        </Link>
        <div className="flex items-center gap-3">
          <span className="hidden text-right text-xs text-ink-500 sm:block">
            <strong className="block font-semibold text-ink-900">{user.name}</strong>
            {user.role}
          </span>
          <div className="grid h-9 w-9 place-items-center rounded-full bg-brand-100 font-semibold text-brand-700">{user.name[0]}</div>
          {/* Stage 1 primitive (per the audit's Stage 2 scope note) — this
              is a generic secondary action, not navigation, so it's the
              one control in this shell that goes through <Button>. */}
          <Button type="button" variant="secondary" size="sm" onClick={onLogout}>
            Log out
          </Button>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl min-h-0 flex-1 flex-col md:flex-row">
        {/* Desktop sidebar. No explicit height anywhere — it stretches to
            fill the row (see the layout note above) and scrolls its own
            content with `overflow-y-auto` if a role ever has enough
            modules to exceed the viewport. */}
        <aside className="hidden w-64 shrink-0 overflow-y-auto border-r border-line-200 bg-surface p-5 md:block">
          {/* Micro-label per DESIGN SYSTEM's typography table: 10px/600,
              uppercase, tracking-wide — not the old font-bold/tracking-widest
              pairing (H2: weight should carry meaning, not be maxed out
              everywhere). */}
          <p className="mb-4 px-3 text-[10px] font-semibold tracking-wide text-ink-500 uppercase">MAIN MENU</p>
          <nav className="space-y-1">
            {allowedModules.map((module) => (
              <button
                type="button"
                key={module.name}
                onClick={() => setActiveModule(module.name)}
                // Nav items are navigation, not generic buttons (see the
                // audit's Stage 2 note), so they're styled directly
                // instead of forced through <Button>. Weight now
                // distinguishes state instead of every item being bold
                // (H2): the active module is 600, everything else is 500.
                className={`flex w-full items-center gap-3 rounded-control px-3 py-3 text-left text-sm transition ${
                  activeModule === module.name
                    ? 'bg-brand-600 font-semibold text-white shadow-raised'
                    : 'font-medium text-ink-500 hover:bg-brand-50 hover:text-brand-700'
                }`}
              >
                <span className="text-lg">{module.icon}</span>
                {module.name}
              </button>
            ))}
          </nav>
          <div className="mt-8 rounded-panel bg-surface-warm p-4 text-xs leading-5 text-brand-900">
            <strong className="block font-semibold">{user.role} access</strong>
            You can use {allowedModules.length} permitted module{allowedModules.length === 1 ? '' : 's'}.
          </div>
        </aside>

        {/* Mobile module nav. Previously `absolute top-16.25` floating
            free of the header's actual height (H6) — now an ordinary flex
            child that sits between the header and the content in normal
            flow, so it can never overlap anything regardless of header
            height. */}
        <div className="flex gap-2 overflow-x-auto border-b border-line-200 bg-surface p-3 md:hidden">
          {allowedModules.map((module) => (
            <button
              type="button"
              key={module.name}
              onClick={() => setActiveModule(module.name)}
              className={`shrink-0 rounded-full px-3 py-2 text-xs whitespace-nowrap ${
                activeModule === module.name ? 'bg-brand-600 font-semibold text-white' : 'bg-brand-50 font-medium text-brand-700'
              }`}
            >
              {module.name}
            </button>
          ))}
        </div>

        {/* <main> wraps the module content, not the whole shell — the
            header/sidebar/nav around it are chrome, not the page's main
            landmark. The shell owns the top spacing that used to live in
            every module page as `pt-24`/`md:pt-9`; each module's own
            <section> keeps only its ordinary side/bottom padding. */}
        <main className="min-w-0 flex-1 pt-6 sm:pt-8 md:overflow-y-auto">
          {/* onNavigate === setActiveModule, so a module page (currently
              only DashboardHome — see its M2 fix, UI_AUDIT.md) can switch
              to another permitted module the same way the sidebar/mobile
              nav above does, instead of faking a link that goes nowhere. */}
          <ActiveModuleComponent user={user} activeModule={activeModule} onUserUpdated={onUserUpdated} onNavigate={setActiveModule} />
        </main>
      </div>
    </div>
  )
}
