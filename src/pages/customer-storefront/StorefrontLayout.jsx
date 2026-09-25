import { useCallback } from 'react'
import { Link, Outlet } from 'react-router-dom'
import { Brand } from '../../components/Brand.jsx'
import { MarketingHeader } from '../../components/MarketingHeader.jsx'
import { VerifyEmailBanner } from '../../components/VerifyEmailBanner.jsx'

// The sign-in pop-up itself lives in App.jsx now — a guest hitting
// /dashboard or /checkout needs the same dialog, and those are outside
// this layout. What stays here is the storefront's ways INTO it: the
// header's account icon and JOIN button, and `openLogin` passed down
// through Outlet context (read with useOutletContext()) so the Menu's
// "Sign in to order" button opens it without a prop drilled through every
// storefront route.
export function StorefrontLayout({ user, onOpenAuth, onLogout }) {
  const openLogin = useCallback(() => onOpenAuth({ view: 'login', mode: 'customer' }), [onOpenAuth])
  const openRegister = useCallback(() => onOpenAuth({ view: 'register' }), [onOpenAuth])

  return (
    <div className="flex min-h-screen flex-col bg-[#f5f7f2] text-stone-900">
      <MarketingHeader user={user} onOpenLogin={openLogin} onOpenRegister={openRegister} onLogout={onLogout} />
      <VerifyEmailBanner user={user} />
      <main className="flex-1">
        <Outlet context={{ openLogin }} />
      </main>
      <footer className="border-t border-green-100 bg-[#fffedc] px-4 py-10 sm:px-7">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Brand compact />
            <nav aria-label="Footer" className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs font-bold text-green-800">
              <Link to="/" className="py-2 hover:underline">Home</Link>
              <Link to="/menu" className="py-2 hover:underline">Menu</Link>
              <Link to="/about" className="py-2 hover:underline">About</Link>
              <Link to="/contact" className="py-2 hover:underline">Contact</Link>
            </nav>
          </div>
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
              <a href="tel:0425404366" className="inline-block py-2 hover:text-green-800 hover:underline">(042) 540-4366</a>
              <br />
              <a href="tel:0425408838" className="inline-block py-2 hover:text-green-800 hover:underline">(042) 540-8838</a>
            </div>
          </div>
        </div>
        <p className="mx-auto mt-8 max-w-6xl text-xs text-stone-500">© {new Date().getFullYear()} Pecto's Bakery — PECTRACK Order Management System.</p>
      </footer>
    </div>
  )
}
