import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiGet } from '../../api/client.js'
import { Brand } from '../../components/Brand.jsx'
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
// three screens in the storefront's own clothes — bakery green, cream,
// rounded cards — so signing in feels like staying on the shop's site
// rather than being handed the staff console.
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

// Orders a customer might still act on. Everything else is history.
const openStatuses = new Set(['PLACED', 'CONFIRMED', 'IN_PRODUCTION', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY'])

export function CustomerAccount({ user, onLogout, onUserUpdated }) {
  const [activeTab, setActiveTab] = useState('profile')
  // Three real numbers, read from the customer's own orders — the same
  // endpoint the Orders panel below already calls. Deliberately not
  // invented or estimated: if the request fails the strip simply shows
  // nothing rather than a plausible-looking zero.
  const [stats, setStats] = useState(null)

  useEffect(() => {
    apiGet('/api/orders')
      .then((data) => {
        const orders = data.orders ?? []
        const active = orders.filter((order) => openStatuses.has(order.status))
        const spent = orders
          .filter((order) => order.status !== 'CANCELLED')
          .reduce((total, order) => total + Number(order.totalAmount ?? 0), 0)
        setStats({ total: orders.length, active: active.length, spent })
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
    <div className="flex min-h-screen flex-col bg-[#f5f7f2] text-stone-900">
      {/* A slim bar, not the staff header: the brand goes home, because a
          customer's way back to shopping should never be more than one
          click from anywhere in their account. */}
      <header className="border-t-[7px] border-[#26752a] bg-[#fffedc]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-7">
          <Link to="/" aria-label="Go to home"><Brand compact /></Link>
          <div className="flex items-center gap-2">
            <Link to="/menu" className="inline-flex min-h-9 items-center rounded-full bg-green-700 px-4 text-xs font-bold text-white shadow-sm transition hover:bg-green-800">Order now</Link>
            <button type="button" onClick={onLogout} className="inline-flex min-h-9 items-center rounded-full border border-green-200 bg-white px-4 text-xs font-bold text-green-800 shadow-sm transition hover:bg-green-50">Sign out</button>
          </div>
        </div>
      </header>

      {/* The hero carries identity and the three figures worth knowing at a
          glance. It is the one saturated block on the page; everything
          below it is quiet cards, so the eye starts here and moves down. */}
      <div className="bg-linear-to-br from-[#449947] via-[#17564e] to-[#112c78] text-white">
        <div className="mx-auto max-w-5xl px-4 py-9 sm:px-7 sm:py-11">
          <div className="flex flex-wrap items-center gap-4">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-white/15 text-xl font-extrabold ring-2 ring-white/30">{user.name[0]}</div>
            <div className="min-w-0">
              <p className="text-xs font-semibold tracking-wide text-lime-200 uppercase">My account</p>
              <h1 className="mt-0.5 text-2xl font-extrabold sm:text-3xl">Hi, {firstName}</h1>
            </div>
          </div>

          <div className="mt-6 grid gap-2 sm:mt-7 sm:grid-cols-3 sm:gap-4">
            <Stat label="Orders placed" value={stats ? stats.total : '—'} />
            <Stat label="In progress" value={stats ? stats.active : '—'} />
            <Stat label="Total ordered" value={stats ? formatPeso(stats.spent) : '—'} />
          </div>
        </div>
      </div>

      {/* The tab rail sticks to the top of the viewport, so switching
          section never means scrolling back up through a long order list.
          Three tabs with a caption each, not a sidebar: a customer has
          three places to be, and naming what each one holds is cheaper
          than making them guess from a one-word label. */}
      <nav aria-label="Account sections" className="sticky top-0 z-30 border-b border-green-100 bg-[#f5f7f2]/95 backdrop-blur">
        <div className="mx-auto grid max-w-5xl grid-cols-3 gap-2 px-4 py-3 sm:flex sm:px-7">
          {tabs.map((tab) => {
            const active = tab.key === activeTab
            return (
              <button
                type="button"
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                aria-current={active ? 'page' : undefined}
                className={`flex min-w-0 flex-col items-center gap-1 rounded-2xl px-2 py-2.5 text-center transition sm:flex-row sm:items-center sm:gap-2.5 sm:px-4 sm:text-left ${active ? 'bg-green-700 text-white shadow-md shadow-green-900/20' : 'bg-white text-green-900 ring-1 ring-green-100 hover:bg-green-50'}`}
              >
                <svg viewBox="0 0 24 24" className={`h-5 w-5 shrink-0 ${active ? 'text-lime-200' : 'text-green-700'}`} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{tab.icon}</svg>
                <span className="min-w-0">
                  {/* The label drops "My " on a phone: three tabs share
                      the width there, and the word is already implied by
                      the page it sits on. */}
                  <span className="block text-xs font-bold sm:hidden">{tab.label.replace('My ', '')}</span>
                  <span className="hidden text-sm font-bold whitespace-nowrap sm:block">{tab.label}</span>
                  <span className={`hidden text-[11px] whitespace-nowrap sm:block ${active ? 'text-green-50/80' : 'text-stone-500'}`}>{tab.caption}</span>
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
        <ActivePanel user={user} onUserUpdated={onUserUpdated} onNavigate={navigateToModule} />
      </main>

      <footer className="border-t border-green-100 bg-[#fffedc] px-4 py-6 sm:px-7">
        <p className="mx-auto max-w-5xl text-xs text-stone-500">
          Need help with an order? Call <a href="tel:0425404366" className="font-bold text-green-800 hover:underline">(042) 540-4366</a> or visit us at 93 Quezon Avenue, Lucban, Quezon.
        </p>
      </footer>
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-3 rounded-2xl bg-white/10 px-4 py-2.5 ring-1 ring-white/15 sm:block sm:px-4 sm:py-4">
      <p className="text-[11px] font-semibold tracking-wide text-green-50/70 uppercase">{label}</p>
      <p className="text-lg font-extrabold tabular-nums sm:mt-1 sm:text-2xl">{value}</p>
    </div>
  )
}
