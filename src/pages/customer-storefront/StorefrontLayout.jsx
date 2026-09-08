import { useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { Brand } from '../../components/Brand.jsx'
import { LoginModal } from '../../components/LoginModal.jsx'
import { MarketingHeader } from '../../components/MarketingHeader.jsx'

// Owns the sign-in pop-up because only the storefront header opens one —
// the dashboard has no use for it. `openLogin` reaches routed pages via
// Outlet context (read with useOutletContext()) so a guest's "Sign in to
// order" button on the Menu can open the same modal without a prop drilled
// through every storefront route.
export function StorefrontLayout({ user, onLogin }) {
  const navigate = useNavigate()
  const [loginOpen, setLoginOpen] = useState(false)
  const openLogin = () => setLoginOpen(true)
  const closeLogin = () => setLoginOpen(false)

  return (
    <div className="flex min-h-screen flex-col bg-[#f5f7f2] text-stone-900">
      <MarketingHeader user={user} onOpenLogin={openLogin} />
      <main className="flex-1">
        <Outlet context={{ openLogin }} />
      </main>
      <footer className="border-t border-green-100 bg-[#fffedc] px-4 py-10 sm:px-7">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <Brand compact />
          <div className="grid gap-6 text-xs text-stone-600 sm:grid-cols-3 sm:gap-10">
            <div>
              <p className="mb-2 font-serif text-sm font-bold text-green-800">Visit</p>
              <p>93 Quezon Avenue, Lucban, Quezon</p>
            </div>
            <div>
              <p className="mb-2 font-serif text-sm font-bold text-green-800">Hours</p>
              <p>Mon–Sat, 6:00 AM – 8:00 PM</p>
            </div>
            <div>
              <p className="mb-2 font-serif text-sm font-bold text-green-800">Reach us</p>
              <a href="tel:0425404366" className="hover:text-green-800 hover:underline">(042) 540-4366</a>
            </div>
          </div>
        </div>
        <p className="mx-auto mt-8 max-w-6xl text-[10px] text-stone-400">© {new Date().getFullYear()} Pecto's Bakery — PECTRACK Order Management System.</p>
      </footer>
      <LoginModal
        open={loginOpen}
        onClose={closeLogin}
        onLogin={onLogin}
        onRegister={() => { closeLogin(); navigate('/register') }}
      />
    </div>
  )
}
