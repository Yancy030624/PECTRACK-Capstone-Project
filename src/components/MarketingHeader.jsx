import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useCart } from '../cart/CartContext.jsx'
import logoMark from '../assets/logo-mark.png'
import { WheatSprig } from './storefront/Decor.jsx'
import { HeaderIcon } from './HeaderIcon.jsx'

// The storefront header. A thin cocoa announcement strip, then a cream bar
// with the logo, the four pages in the display serif, and the visitor's
// own controls. Below `md` the four links become a scrolling pill row, so
// a phone visitor can still reach every page.
const links = [['/', 'Home', true], ['/menu', 'Menu'], ['/about', 'Our Story'], ['/contact', 'Visit Us']]
const navLinkClass = ({ isActive }) => `relative inline-flex min-h-10 items-center font-display text-[1.05rem] font-semibold transition hover:text-crust-600 ${isActive ? 'text-crust-600 after:absolute after:inset-x-0 after:bottom-0.5 after:h-0.5 after:rounded-full after:bg-crust-500' : 'text-cocoa-900'}`
const mobileLinkClass = ({ isActive }) => `whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold transition ${isActive ? 'bg-crust-600 text-white' : 'bg-white text-cocoa-700 ring-1 ring-cream-300 hover:bg-cream-100'}`

const userIcon = <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="8" r="3.2" /><path d="M5 20c.8-3.4 3.1-5.1 7-5.1s6.2 1.7 7 5.1" /></svg>
const iconCircle = 'grid h-10 w-10 place-items-center rounded-full bg-white text-cocoa-900 ring-1 ring-cream-300 transition hover:-translate-y-0.5 hover:bg-cream-100 hover:text-crust-600'

// The three callbacks default to no-ops because this header also renders
// bare (no props) on the password-recovery pages, where there is no auth
// pop-up to open and no session to end.
export function MarketingHeader({ user, onOpenLogin = () => {}, onOpenRegister = () => {}, onLogout = () => {} }) {
  const navigate = useNavigate()
  const { itemCount } = useCart()
  // Search and cart mean something only for a signed-in customer — a guest
  // has no cart (Decision 7), and search filters the customer's own Menu
  // (Decision 9). Staff order from the dashboard, not the storefront.
  const isCustomer = user?.role === 'CUSTOMER'

  return (
    <header className="font-body">
      <div className="bg-cocoa-900 px-4 py-2 text-center text-xs font-semibold text-cream-100 sm:text-[13px]">
        <span className="inline-flex items-center gap-2">
          <WheatSprig className="h-4 w-4 text-butter-400" />
          Baked fresh every morning in Lucban · Pickup at the bakery or delivery within Lucban
        </span>
      </div>
      <div className="border-b border-cream-200 bg-cream-50/95 backdrop-blur">
        <div className="mx-auto grid min-h-20 max-w-7xl grid-cols-[1fr_auto] items-center gap-4 px-4 py-3 sm:px-7 md:grid-cols-[1fr_auto_1fr]">
          <Link to="/" aria-label="Pecto's Bakery — home" className="flex items-center gap-3">
            <span className="grid h-13 w-13 overflow-hidden rounded-full bg-white shadow-md ring-2 ring-butter-300 sm:h-14 sm:w-14">
              <img src={logoMark} alt="" className="h-full w-full rounded-full object-contain" />
            </span>
            <span className="leading-tight">
              <span className="block font-display text-xl font-bold text-cocoa-900 sm:text-2xl">Pecto&apos;s Bakery</span>
              <span className="hidden text-[11px] font-bold uppercase tracking-[0.16em] text-crust-600 min-[420px]:block">Lucban&apos;s Best Delicacies</span>
            </span>
          </Link>
          <nav aria-label="Site" className="hidden items-center gap-8 md:flex">
            {links.map(([to, label, end]) => <NavLink key={to} to={to} end={end} className={navLinkClass}>{label}</NavLink>)}
          </nav>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            {isCustomer && <HeaderIcon type="search" onClick={() => navigate('/menu?focus=search')} label="Search the menu" />}
            {user ? (
              <>
                <Link to={isCustomer ? '/account' : '/dashboard'} aria-label="My account" className={iconCircle}>{userIcon}</Link>
                <button type="button" onClick={onLogout} className="hidden min-h-10 items-center rounded-full px-3 text-sm font-bold text-cocoa-700 transition hover:bg-cream-100 hover:text-crust-600 lg:inline-flex">Sign out</button>
              </>
            ) : (
              <>
                <button type="button" onClick={onOpenLogin} aria-label="Sign in" className={`${iconCircle} sm:hidden`}>{userIcon}</button>
                <button type="button" onClick={onOpenLogin} className="hidden min-h-10 items-center rounded-full px-4 text-sm font-bold text-cocoa-700 transition hover:bg-cream-100 hover:text-crust-600 sm:inline-flex">Sign in</button>
              </>
            )}
            {isCustomer && <HeaderIcon type="cart" onClick={() => navigate('/cart')} badge={itemCount} label={`Cart, ${itemCount} item${itemCount === 1 ? '' : 's'}`} />}
            {!user && (
              <button type="button" onClick={onOpenRegister} className="inline-flex min-h-10 items-center rounded-full bg-crust-600 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-crust-700 sm:px-5">
                <span className="sm:hidden">Join</span><span className="hidden sm:inline">Create account</span>
              </button>
            )}
            {isCustomer && (
              <Link to="/menu" className="hidden min-h-10 items-center rounded-full bg-crust-600 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-crust-700 lg:inline-flex">Order now</Link>
            )}
          </div>
        </div>
        <nav aria-label="Site" className="flex gap-2 overflow-x-auto px-4 pb-3 sm:px-7 md:hidden">
          {links.map(([to, label, end]) => <NavLink key={to} to={to} end={end} className={mobileLinkClass}>{label}</NavLink>)}
        </nav>
      </div>
    </header>
  )
}
