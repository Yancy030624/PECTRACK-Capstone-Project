import { useState } from 'react'
import { MarketingHeader } from '../../components/MarketingHeader.jsx'
import { VerifyEmailBanner } from '../../components/VerifyEmailBanner.jsx'
import { SiteFooter } from '../customer-storefront/StorefrontLayout.jsx'
import { MyProfile } from '../dashboard/MyProfile.jsx'
import { OrderManagement } from '../dashboard/OrderManagement.jsx'

// The customer's own account page — NOT the staff dashboard. The storefront
// header and footer, cream and crust, so signing in feels like staying on
// the shop's site; the panels take the bakery colours from the
// `storefront-skin` wrapper (index.css).
//
// Simplified (the user, 2026-10-28): a compact profile header — who is
// signed in, with Sign out — and two tabs, Profile and Orders. The My
// Payments tab and the "Orders placed" / "Total ordered" cards are gone: a
// customer pays at checkout or at the counter, and every order's receipt,
// payment included, opens from My Orders.
//
// The panels are the EXISTING components (MyProfile, OrderManagement),
// which already have a customer branch; only the chrome is drawn here.
const tabs = [
  {
    key: 'profile',
    label: 'Profile',
    Component: MyProfile,
    icon: <><circle cx="12" cy="8" r="3.4" /><path d="M5 20c.9-3.6 3.3-5.4 7-5.4s6.1 1.8 7 5.4" /></>,
  },
  {
    key: 'orders',
    label: 'Orders',
    Component: OrderManagement,
    icon: <><path d="M6 3h12a1 1 0 0 1 1 1v17l-3-2-2 2-2-2-2 2-2-2-3 2V4a1 1 0 0 1 1-1Z" /><path d="M9 8h6M9 12h6" /></>,
  },
]

export function CustomerAccount({ user, onLogout, onUserUpdated }) {
  // ?tab=orders — the receipt page's "View My Orders" opens this tab.
  const [activeTab, setActiveTab] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get('tab')
    return tabs.some((tab) => tab.key === requested) ? requested : 'profile'
  })
  const ActivePanel = tabs.find((tab) => tab.key === activeTab).Component

  // OrderManagement reaches other screens by the staff shell's module
  // names; the two this page has are mapped to its tabs.
  const moduleToTab = { 'My Orders': 'orders', 'My Profile': 'profile' }
  const navigateToModule = (moduleName) => {
    const target = moduleToTab[moduleName]
    if (target) setActiveTab(target)
  }

  return (
    <div className="storefront-skin flex min-h-screen flex-col bg-cream-100 text-cocoa-700">
      <MarketingHeader user={user} onLogout={onLogout} />
      <VerifyEmailBanner user={user} />

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 pb-10 pt-8 sm:px-7 sm:pt-10">
        {/* Who is signed in, in one compact card. */}
        <div className="flex flex-wrap items-center gap-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-cream-200 sm:p-6">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-crust-600 font-display text-2xl font-bold text-white" aria-hidden="true">{user.name[0]}</div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-2xl font-bold text-cocoa-900">{user.name}</h1>
            <p className="truncate text-sm text-cocoa-500">{[user.email, user.contactNumber].filter(Boolean).join(' · ')}</p>
          </div>
          <button type="button" onClick={onLogout} className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-cocoa-700 ring-1 ring-cream-300 transition hover:bg-cream-50 hover:text-red-700">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4" /></svg>
            Sign out
          </button>
        </div>

        {/* Two tabs, as an underlined bar. */}
        <nav aria-label="Account sections" className="mt-6 flex gap-1 border-b border-cream-300">
          {tabs.map((tab) => {
            const active = tab.key === activeTab
            return (
              <button
                type="button"
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                aria-current={active ? 'page' : undefined}
                className={`-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition ${active ? 'border-crust-600 text-crust-700' : 'border-transparent text-cocoa-500 hover:text-cocoa-900'}`}
              >
                <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{tab.icon}</svg>
                {tab.label}
              </button>
            )
          })}
        </nav>

        {/* The panels keep their own inner layout; the page gives them the
            width. No onLogout here: Sign out is in the card above. */}
        <div className="-mx-4 pt-2 sm:-mx-7">
          <ActivePanel user={user} onUserUpdated={onUserUpdated} onNavigate={navigateToModule} />
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
