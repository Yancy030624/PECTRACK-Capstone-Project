import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useCart } from '../cart/CartContext.jsx'
import logoMark from '../assets/logo-mark.png'
import { HeaderIcon } from './HeaderIcon.jsx'
import { Modal } from './Modal.jsx'
import './storefront-header.css'

const links = [['/', 'Home', true], ['/menu', 'Menu'], ['/about', 'Our Story'], ['/contact', 'Visit Us']]
const navLinkClass = ({ isActive }) => `bakery-nav-link ${isActive ? 'is-active' : ''}`
const userIcon = <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="8" r="3.2" /><path d="M5 20c.8-3.4 3.1-5.1 7-5.1s6.2 1.8 7 5.1" /></svg>

export function MarketingHeader({ user, onOpenLogin = () => {}, onOpenRegister = () => {}, onLogout = () => {} }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { itemCount } = useCart()
  const isCustomer = user?.role === 'CUSTOMER'
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => { setMenuOpen(false) }, [location.pathname, location.search])
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)')
    const closeOnDesktop = () => { if (desktop.matches) setMenuOpen(false) }
    desktop.addEventListener('change', closeOnDesktop)
    return () => desktop.removeEventListener('change', closeOnDesktop)
  }, [])
  const runFromMenu = (action) => { setMenuOpen(false); action() }

  return (
    <>
      <header className="bakery-header font-body">
        <div className="bakery-header-inner">
          <Link to="/" aria-label="Pecto's Bakery - home" className="bakery-brand">
            <img src={logoMark} alt="" />
            <span className="min-w-0">
              <span className="bakery-brand-name">Pecto&apos;s Bakery</span>
              <span className="bakery-brand-tagline">Lucban&apos;s Best Delicacies</span>
            </span>
          </Link>
          <nav aria-label="Site" className="bakery-desktop-nav">
            {links.map(([to, label, end]) => <NavLink key={to} to={to} end={end} className={navLinkClass}>{label}</NavLink>)}
          </nav>
          <div className="bakery-header-tools">
            {isCustomer && <span className="bakery-desktop-control"><HeaderIcon type="search" onClick={() => navigate('/menu?focus=search')} label="Search the menu" /></span>}
            {user ? (
              <>
                <Link to={isCustomer ? '/account' : '/dashboard'} aria-label={isCustomer ? 'My account' : 'Go to dashboard'} className="bakery-account-control bakery-icon-button">{userIcon}</Link>
                <button type="button" onClick={onLogout} className="bakery-desktop-control bakery-text-button">Sign out</button>
              </>
            ) : (
              <>
                <button type="button" onClick={onOpenLogin} className="bakery-desktop-control bakery-text-button bakery-signin-button">Sign in</button>
                <button type="button" onClick={onOpenRegister} className="bakery-desktop-control bakery-primary-button bakery-register-button">Create account</button>
              </>
            )}
            {isCustomer && <HeaderIcon type="cart" onClick={() => navigate('/cart')} badge={itemCount} label={`Cart, ${itemCount} product${itemCount === 1 ? '' : 's'}`} />}
            {isCustomer && <Link to="/menu" className="bakery-order-button bakery-primary-button">Order now</Link>}
            <button type="button" className="bakery-menu-button bakery-icon-button" onClick={() => setMenuOpen(true)} aria-label="Open navigation menu" aria-expanded={menuOpen} aria-controls={menuOpen ? 'storefront-navigation' : undefined}>
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
          </div>
        </div>
      </header>

      <div className="storefront-menu-dialog font-body">
        <Modal open={menuOpen} onClose={() => setMenuOpen(false)} labelledBy="storefront-menu-title">
          <div className="bakery-menu-panel" id="storefront-navigation">
            <div className="bakery-menu-heading">
              <div><p className="bakery-menu-caption">Pecto&apos;s Bakery</p><h2 id="storefront-menu-title">Browse</h2></div>
              <button type="button" onClick={() => setMenuOpen(false)} aria-label="Close navigation menu" className="bakery-icon-button">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
              </button>
            </div>
            <nav aria-label="Site" className="bakery-drawer-links">
              {links.map(([to, label, end]) => <NavLink key={to} to={to} end={end} onClick={() => setMenuOpen(false)} className={navLinkClass}>{label}<span aria-hidden="true">&#8594;</span></NavLink>)}
            </nav>
            <div className="bakery-menu-account">
              {user ? (
                <>
                  <p className="bakery-menu-caption">Signed in as</p><p className="bakery-menu-name">{user.name}</p>
                  <Link to={isCustomer ? '/account' : '/dashboard'} onClick={() => setMenuOpen(false)} className="bakery-menu-account-link">{isCustomer ? 'My account' : 'Go to dashboard'}<span aria-hidden="true">&#8594;</span></Link>
                  {isCustomer && <>
                    <Link to="/menu?focus=search" onClick={() => setMenuOpen(false)} className="bakery-menu-account-link">Search the menu<span aria-hidden="true">&#8594;</span></Link>
                    <Link to="/cart" onClick={() => setMenuOpen(false)} className="bakery-menu-account-link">View cart<span>{itemCount} product{itemCount === 1 ? '' : 's'}</span></Link>
                  </>}
                  <button type="button" onClick={() => runFromMenu(onLogout)} className="bakery-menu-signout">Sign out</button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => runFromMenu(onOpenLogin)} className="bakery-menu-signin">Sign in</button>
                  <button type="button" onClick={() => runFromMenu(onOpenRegister)} className="bakery-primary-button">Create account</button>
                </>
              )}
            </div>
          </div>
        </Modal>
      </div>
    </>
  )
}
