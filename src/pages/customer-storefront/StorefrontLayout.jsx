import { useCallback } from 'react'
import { Link, Outlet } from 'react-router-dom'
import logoMark from '../../assets/logo-mark.png'
import { MarketingHeader } from '../../components/MarketingHeader.jsx'
import { VerifyEmailBanner } from '../../components/VerifyEmailBanner.jsx'
import { LineIcon, ScallopEdge, WheatSprig } from '../../components/storefront/Decor.jsx'

// The sign-in pop-up itself lives in App.jsx — a guest hitting /dashboard
// or /checkout needs the same dialog, and those are outside this layout.
// What stays here is the storefront's ways INTO it: the header's Sign in
// and Create account buttons, and `openLogin` / `openRegister` passed down
// through Outlet context (read with useOutletContext()).
//
// The storefront has its own look — cream, crust and cocoa, Fraunces and
// Nunito (index.css) — so the customer side reads as a bakery. The staff
// dashboard keeps its working look.
export function StorefrontLayout({ user, onOpenAuth, onLogout }) {
  const openLogin = useCallback(() => onOpenAuth({ view: 'login', mode: 'customer' }), [onOpenAuth])
  const openRegister = useCallback(() => onOpenAuth({ view: 'register' }), [onOpenAuth])

  return (
    <div className="flex min-h-screen flex-col bg-cream-100 font-body text-cocoa-700">
      <MarketingHeader user={user} onOpenLogin={openLogin} onOpenRegister={openRegister} onLogout={onLogout} />
      <VerifyEmailBanner user={user} />
      <main className="flex-1">
        <Outlet context={{ openLogin, openRegister, user }} />
      </main>
      <SiteFooter />
    </div>
  )
}

// Also used by the customer account page (CustomerAccount.jsx).
export function SiteFooter() {
  return (
    <footer className="mt-16 bg-cocoa-900 text-cream-200">
      <ScallopEdge className="-mt-4 text-cocoa-900 sm:-mt-6" flip />
      <div className="mx-auto grid max-w-7xl gap-10 px-4 pb-10 pt-10 sm:px-7 md:grid-cols-[1.3fr_1fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-3">
            <span className="grid h-14 w-14 overflow-hidden rounded-full bg-white ring-2 ring-butter-300">
              <img src={logoMark} alt="" className="h-full w-full rounded-full object-contain" />
            </span>
            <span>
              <span className="block font-display text-2xl font-bold text-cream-50">Pecto&apos;s Bakery</span>
              <span className="block text-[11px] font-bold uppercase tracking-[0.16em] text-butter-300">Lucban&apos;s Best Delicacies</span>
            </span>
          </div>
          <p className="mt-4 max-w-xs text-sm leading-6 text-cream-200/90">Broas, ensaymada, pandesal and pastries, baked fresh every morning in Lucban, Quezon.</p>
          <nav aria-label="Footer" className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm font-bold text-butter-300">
            <Link to="/" className="py-2 hover:text-cream-50">Home</Link>
            <Link to="/menu" className="py-2 hover:text-cream-50">Menu</Link>
            <Link to="/about" className="py-2 hover:text-cream-50">Our Story</Link>
            <Link to="/contact" className="py-2 hover:text-cream-50">Visit Us</Link>
          </nav>
        </div>
        <FooterBlock icon="pin" title="Visit">
          <p>93 Quezon Avenue</p>
          <p>Lucban, Quezon</p>
        </FooterBlock>
        <FooterBlock icon="clock" title="Open">
          <p>Monday – Saturday</p>
          <p>6:00 AM – 8:00 PM</p>
        </FooterBlock>
        <FooterBlock icon="phone" title="Call">
          <a href="tel:0425404366" className="block py-1 hover:text-cream-50 hover:underline">(042) 540-4366</a>
          <a href="tel:0425408838" className="block py-1 hover:text-cream-50 hover:underline">(042) 540-8838</a>
        </FooterBlock>
      </div>
      <div className="border-t border-cream-50/10">
        <p className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-5 text-xs text-cream-200/70 sm:px-7">
          <WheatSprig className="h-4 w-4 text-butter-400" />
          © {new Date().getFullYear()} Pecto&apos;s Bakery · Orders by PECTRACK
        </p>
      </div>
    </footer>
  )
}

function FooterBlock({ icon, title, children }) {
  return (
    <div className="text-sm leading-6">
      <p className="mb-2 flex items-center gap-2 font-display text-lg font-semibold text-cream-50">
        <LineIcon name={icon} className="h-5 w-5 text-butter-400" />
        {title}
      </p>
      {children}
    </div>
  )
}
