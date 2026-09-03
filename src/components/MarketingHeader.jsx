import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useCart } from '../cart/CartContext.jsx'
import { Brand } from './Brand.jsx'
import { HeaderIcon } from './HeaderIcon.jsx'

const navLinkClass = ({ isActive }) => `font-serif text-sm transition hover:text-green-800 ${isActive ? 'border-b-2 border-green-700 text-green-800' : 'text-stone-800'}`

export function MarketingHeader({ user }) {
  const navigate = useNavigate()
  const { itemCount } = useCart()

  return (
    <header className="grid min-h-21.5 grid-cols-[1fr_auto] items-center border-t-[7px] border-[#26752a] bg-[#fffedc] px-4 py-3 sm:px-7 md:grid-cols-[1fr_auto_1fr]">
      <Link to="/" aria-label="Go to home"><Brand compact /></Link>
      <nav className="hidden items-center gap-6 text-xs font-bold md:flex">
        <NavLink to="/" end className={navLinkClass}>HOME</NavLink>
        <NavLink to="/menu" className={navLinkClass}>MENU</NavLink>
        <NavLink to="/about" className={navLinkClass}>ABOUT</NavLink>
        <NavLink to="/contact" className={navLinkClass}>CONTACT</NavLink>
        {!user && <NavLink to="/login" className={navLinkClass}>LOGIN</NavLink>}
      </nav>
      <div className="ml-auto flex items-center gap-3">
        <HeaderIcon type="search" disabled />
        <Link to={user ? '/dashboard' : '/login'} aria-label={user ? 'My account' : 'Sign in'}>
          <span className="grid h-9 w-9 place-items-center rounded-full bg-white text-stone-900 shadow-md transition hover:-translate-y-0.5 hover:text-green-800">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4"><circle cx="12" cy="8" r="3.2" /><path d="M5 20c.8-3.4 3.1-5.1 7-5.1s6.2 1.7 7 5.1" /></svg>
          </span>
        </Link>
        <HeaderIcon type="cart" onClick={() => navigate('/cart')} badge={itemCount} label={`Cart, ${itemCount} item${itemCount === 1 ? '' : 's'}`} />
        {!user && <Link to="/register" className="rounded-full bg-green-700 px-3 py-2 text-[11px] text-white shadow-sm transition hover:bg-green-800 md:hidden">JOIN</Link>}
      </div>
    </header>
  )
}
