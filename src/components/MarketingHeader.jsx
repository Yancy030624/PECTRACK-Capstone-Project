import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useCart } from '../cart/CartContext.jsx'
import { Brand } from './Brand.jsx'
import { HeaderIcon } from './HeaderIcon.jsx'

const navLinkClass = ({ isActive }) => `inline-flex min-h-9 items-center font-serif text-sm transition hover:text-green-800 ${isActive ? 'border-b-2 border-green-700 text-green-800' : 'text-stone-800'}`
// The same four links as pills, for screens too narrow for the inline row.
// Below `md` the header used to show only the account icon and JOIN, so a
// phone visitor had no way to reach Menu, About, or Contact except the
// Home hero — the pill row mirrors the "Jump to category" strip the Menu
// page already uses, so it is not a new pattern.
const mobileLinkClass = ({ isActive }) => `whitespace-nowrap rounded-full px-4 py-2 text-xs font-bold shadow-sm ring-1 ring-green-100 transition ${isActive ? 'bg-green-700 text-white' : 'bg-white text-green-800 hover:bg-green-50'}`
const links = [['/', 'Home', true], ['/menu', 'Menu'], ['/about', 'About'], ['/contact', 'Contact']]

// `onOpenLogin` defaults to a no-op because this header also renders bare
// (no props) on /login and /register themselves — clicking the sign-in
// icon while already on the login page should just do nothing, not throw.
export function MarketingHeader({ user, onOpenLogin = () => {} }) {
  const navigate = useNavigate()
  const { itemCount } = useCart()
  // Search and cart only ever meant something for a signed-in customer —
  // a guest has no cart to view (Decision 7), and search only filters the
  // customer's own Menu (Decision 9). Staff get neither: their ordering
  // happens in the dashboard's counter-order screen, not the storefront.
  const isCustomer = user?.role === 'CUSTOMER'

  return (
    <header className="border-t-[7px] border-[#26752a] bg-[#fffedc]">
      <div className="grid min-h-21.5 grid-cols-[1fr_auto] items-center px-4 py-3 sm:px-7 md:grid-cols-[1fr_auto_1fr]">
      <Link to="/" aria-label="Go to home"><Brand compact /></Link>
      <nav aria-label="Site" className="hidden items-center gap-6 text-xs font-bold md:flex">
        {links.map(([to, label, end]) => <NavLink key={to} to={to} end={end} className={navLinkClass}>{label.toUpperCase()}</NavLink>)}
      </nav>
      <div className="ml-auto flex items-center gap-3">
        {isCustomer && <HeaderIcon type="search" onClick={() => navigate('/menu?focus=search')} label="Search the menu" />}
        {user ? (
          <Link to="/dashboard" aria-label="My account">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-white text-stone-900 shadow-md transition hover:-translate-y-0.5 hover:text-green-800">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4"><circle cx="12" cy="8" r="3.2" /><path d="M5 20c.8-3.4 3.1-5.1 7-5.1s6.2 1.7 7 5.1" /></svg>
            </span>
          </Link>
        ) : (
          <button type="button" onClick={onOpenLogin} aria-label="Sign in">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-white text-stone-900 shadow-md transition hover:-translate-y-0.5 hover:text-green-800">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4"><circle cx="12" cy="8" r="3.2" /><path d="M5 20c.8-3.4 3.1-5.1 7-5.1s6.2 1.7 7 5.1" /></svg>
            </span>
          </button>
        )}
        {isCustomer && <HeaderIcon type="cart" onClick={() => navigate('/cart')} badge={itemCount} label={`Cart, ${itemCount} item${itemCount === 1 ? '' : 's'}`} />}
        {!user && <Link to="/register" className="inline-flex min-h-9 items-center rounded-full bg-green-700 px-3 text-xs font-bold text-white shadow-sm transition hover:bg-green-800 md:hidden">JOIN</Link>}
      </div>
      </div>
      <nav aria-label="Site" className="flex gap-2 overflow-x-auto px-4 pb-3 sm:px-7 md:hidden">
        {links.map(([to, label, end]) => <NavLink key={to} to={to} end={end} className={mobileLinkClass}>{label}</NavLink>)}
      </nav>
    </header>
  )
}
