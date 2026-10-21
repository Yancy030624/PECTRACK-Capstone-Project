import { useEffect, useState } from 'react'
import { apiGet } from '../../api/client.js'
import { MarketingHeader } from '../../components/MarketingHeader.jsx'
import { Eyebrow, ScallopEdge } from '../../components/storefront/Decor.jsx'
import { VerifyEmailBanner } from '../../components/VerifyEmailBanner.jsx'
import { SiteFooter } from '../customer-storefront/StorefrontLayout.jsx'
import { MyProfile } from '../dashboard/MyProfile.jsx'
import { OrderManagement } from '../dashboard/OrderManagement.jsx'
import { PaymentBilling } from '../dashboard/PaymentBilling.jsx'
import { formatPeso } from '../../lib/format.js'

// The customer's own account page — NOT the staff dashboard.
//
// Customers used to land in the same shell an admin uses: a grey sidebar
// of "modules", a "CUSTOMER PORTAL" eyebrow, the same ink-and-slate
// palette as Inventory Management. It worked, but it told a person buying
// pandesal that they were operating an internal tool. This is the same
// three screens in the storefront's own clothes — the storefront header
// and footer, cream and crust, Fraunces headings — so signing in feels
// like staying on the shop's site rather than being handed the staff
// console. The panels take the bakery colours from the `storefront-skin`
// wrapper (index.css), which re-points the dashboard tokens they use.
//
// The three panels themselves are the EXISTING components, unchanged:
// MyProfile, OrderManagement and PaymentBilling each already dispatch on
// role internally and have a customer branch. Rewriting them would have
// meant a second copy of the order-cancel and pay-online logic to keep in
// step, which is the trade the shared-component shape exists to avoid.
// What changed is the chrome around them, and the order they come in.
//
// Profile first, then Orders, then Payments — the order the user asked
// for, and the order that reads as "who I am, what I bought, what I owe".
const tabs = [
  {
    key: 'profile',
    label: 'My Profile',
    caption: 'Details, addresses, password',
    Component: MyProfile,
    icon: <><circle cx="12" cy="8" r="3.4" /><path d="M5 20c.9-3.6 3.3-5.4 7-5.4s6.1 1.8 7 5.4" /></>,
  },
  {
    key: 'orders',
    label: 'My Orders',
    caption: 'Track and review what you ordered',
    Component: OrderManagement,
    icon: <><path d="M6 3h12a1 1 0 0 1 1 1v17l-3-2-2 2-2-2-2 2-2-2-3 2V4a1 1 0 0 1 1-1Z" /><path d="M9 8h6M9 12h6" /></>,
  },
  {
    key: 'payments',
    label: 'My Payments',
    caption: 'Balances, receipts, pay online',
    Component: PaymentBilling,
    icon: <><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M3 10h18" /><path d="M7 14h4" /></>,
  },
]


export function CustomerAccount({ user, onLogout, onUserUpdated }) {
  // ?tab=orders / ?tab=payments — the order-placed page links straight to
  // the tab it means (its "Pay now" lands on My Payments, not My Profile).
  const [activeTab, setActiveTab] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get('tab')
    return tabs.some((tab) => tab.key === requested) ? requested : 'profile'
  })
  // Two real numbers, read from the customer's own orders — the same
  // endpoint the Orders panel below already calls. Deliberately not
  // invented or estimated: if the request fails the strip simply shows
  // nothing rather than a plausible-looking zero.
  const [stats, setStats] = useState(null)

  useEffect(() => {
    apiGet('/api/orders')
      .then((data) => {
        const orders = data.orders ?? []
        const spent = orders
          .filter((order) => order.status !== 'CANCELLED')
          .reduce((total, order) => total + Number(order.totalAmount ?? 0), 0)
        setStats({ total: orders.length, spent })
      })
      .catch(() => setStats(null))
  }, [])

  const ActivePanel = tabs.find((tab) => tab.key === activeTab).Component
  const firstName = user.name.split(' ')[0]

  // OrderManagement's customer branch offers a "Pay now" button on an
  // unpaid order, and reaches its destination through onNavigate with the
  // staff shell's module name. Mapping those names to tabs here keeps that
  // button working without the panel needing to know which shell it is in.
  const moduleToTab = { 'My Payments': 'payments', 'My Orders': 'orders', 'My Profile': 'profile' }
  const navigateToModule = (moduleName) => {
    const target = moduleToTab[moduleName]
    if (target) setActiveTab(target)
  }

  return (
    <div className="storefront-skin flex min-h-screen flex-col bg-cream-100 text-cocoa-700">
      <MarketingHeader user={user} onLogout={onLogout} />
      <VerifyEmailBanner user={user} />

      {/* Identity and the three figures worth knowing at a glance, on the
          same cream banner the storefront pages open with. */}
      <section className="relative overflow-hidden bg-cream-50">
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-butter-100" />
        <div className="relative mx-auto max-w-5xl px-4 pb-9 pt-10 sm:px-7 sm:pt-12">
          <div className="flex flex-wrap items-center gap-4">
            <div className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-crust-600 font-display text-2xl font-bold text-white ring-4 ring-butter-300">{user.name[0]}</div>
            <div className="min-w-0">
              <Eyebrow>My account</Eyebrow>
              <h1 className="mt-1 font-display text-4xl font-bold text-cocoa-900 sm:text-5xl">Hi, {firstName}!</h1>
            </div>
          </div>

          {/* "In progress" (orders not yet picked up) was removed at the
              user's request, 2026-10-22: a count with nothing to do, and
              My Orders already shows each open order. */}
          <div className="mt-7 grid gap-3 sm:grid-cols-2 sm:gap-4">
            <Stat label="Orders placed" value={stats ? stats.total : '—'} />
            <Stat label="Total ordered" value={stats ? formatPeso(stats.spent) : '—'} />
          </div>
        </div>
        <ScallopEdge className="text-cream-100" />
      </section>

      {/* The tab rail sticks to the top of the viewport, so switching
          section never means scrolling back up through a long order list.
          Three tabs with a caption each, not a sidebar: a customer has
          three places to be, and naming what each one holds is cheaper
          than making them guess from a one-word label. */}
      <nav aria-label="Account sections" className="sticky top-0 z-30 border-b border-cream-200 bg-cream-100/95 backdrop-blur">
        <div className="mx-auto grid max-w-5xl grid-cols-3 gap-2 px-4 py-3 sm:flex sm:px-7">
          {tabs.map((tab) => {
            const active = tab.key === activeTab
            return (
              <button
                type="button"
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                aria-current={active ? 'page' : undefined}
                className={`flex min-w-0 flex-col items-center gap-1 rounded-2xl px-2 py-2.5 text-center transition sm:flex-row sm:items-center sm:gap-2.5 sm:px-4 sm:text-left ${active ? 'bg-crust-600 text-white shadow-md shadow-crust-700/25' : 'bg-white text-cocoa-900 ring-1 ring-cream-300 hover:bg-cream-50'}`}
              >
                <svg viewBox="0 0 24 24" className={`h-5 w-5 shrink-0 ${active ? 'text-butter-300' : 'text-crust-600'}`} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{tab.icon}</svg>
                <span className="min-w-0">
                  {/* The label drops "My " on a phone: three tabs share
                      the width there, and the word is already implied by
                      the page it sits on. */}
                  <span className="block text-sm font-bold sm:hidden">{tab.label.replace('My ', '')}</span>
                  <span className="hidden font-display text-base font-semibold whitespace-nowrap sm:block">{tab.label}</span>
                  <span className={`hidden text-xs whitespace-nowrap sm:block ${active ? 'text-cream-100/90' : 'text-cocoa-500'}`}>{tab.caption}</span>
                </span>
              </button>
            )
          })}
        </div>
      </nav>

      {/* The panels keep their own headings and padding — they are the
          same components the staff shell renders, and giving them a second
          set of spacing rules here is how the two drift apart. */}
      <main className="mx-auto w-full max-w-5xl flex-1 pt-6 pb-4 sm:pt-8">
        <ActivePanel user={user} onUserUpdated={onUserUpdated} onNavigate={navigateToModule} onLogout={onLogout} />
      </main>

      <SiteFooter />
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-3 rounded-2xl bg-white px-5 py-3 ring-1 ring-cream-300 sm:block sm:py-4">
      <p className="text-xs font-bold tracking-wide text-cocoa-500 uppercase">{label}</p>
      <p className="font-display text-2xl font-bold text-crust-600 tabular-nums sm:mt-1 sm:text-3xl">{value}</p>
    </div>
  )
}
