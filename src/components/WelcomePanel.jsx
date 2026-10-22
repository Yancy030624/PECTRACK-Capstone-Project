import { Link } from 'react-router-dom'
import logoMark from '../assets/logo-mark.png'

// `onNavigateAway` closes the dialog this panel sits in — "Continue
// browsing" is a real link to /menu, and the pop-up must not stay floating
// over the page it just sent someone to.
export function WelcomePanel({ register, staff = false, onNavigateAway = () => {} }) {
  const copy = register
    ? { tag: 'Customer Registration', title: 'New Account Registration', body: 'Create a PECTRACK account to start ordering with ease.' }
    // CHANGED 2026-10-16: no longer role-neutral. AuthModal now holds the
    // door the form used to keep to itself, so this panel can match it:
    // the staff door gets its own colour and the system's full name, and
    // nobody mistakes it for the customer one. Pages that do not pass
    // `staff` (the password-recovery pages) get the customer copy, which
    // is still true for anyone signing in.
    : staff
      ? { tag: 'Admin Portal', title: "Welcome back to Pecto's Bakery", body: <>A Web-Based Order Management System<br />With Predictive Analytics and Automated Inventory</> }
      : { tag: 'Bakery Access', title: "Welcome back to Pecto's Bakery", body: 'Sign in to pick up where you left off.' }
  return (
    <aside className={`relative hidden min-h-155 overflow-hidden rounded-l-[26px] bg-linear-to-b p-7 text-white md:flex md:flex-col ${staff ? 'from-leaf-600 via-leaf-700 to-[#0f2e12]' : 'from-crust-500 via-crust-700 to-cocoa-900'}`}>
      <div className={`absolute -left-24 -top-12 h-64 w-[150%] rotate-[-42deg] ${staff ? 'bg-white/10' : 'bg-butter-300/15'}`} />
      <div className="absolute left-8 top-8 h-12 w-12 rounded-full bg-butter-300/40" />
      <div className="relative mt-8 flex justify-center"><div className="grid h-44 w-44 place-items-center rounded-full bg-white shadow-xl"><img src={logoMark} alt="Pecto's Bakery" className="h-40 w-40 object-contain" /></div></div>
      <div className="relative mt-auto max-w-xs">
        <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-bold ${staff ? 'bg-white text-leaf-700' : 'bg-butter-300 text-cocoa-900'}`}>{copy.tag}</span>
        <h1 className="mt-3 font-display text-3xl font-bold leading-tight">{copy.title}</h1>
        <p className={`mt-2 text-sm leading-6 ${staff ? 'text-leaf-50' : 'text-cream-100'}`}>{copy.body}</p>
        <Link to="/menu" onClick={onNavigateAway} className="mt-5 inline-block rounded-full border border-white px-5 py-2 text-xs font-bold transition hover:bg-white hover:text-cocoa-900">Continue browsing</Link>
      </div>
    </aside>
  )
}
