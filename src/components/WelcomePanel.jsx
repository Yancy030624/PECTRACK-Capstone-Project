import { Link } from 'react-router-dom'
import logoMark from '../assets/logo-mark.png'

// `onNavigateAway` closes the dialog this panel sits in — "Continue
// browsing" is a real link to /menu, and the pop-up must not stay floating
// over the page it just sent someone to.
export function WelcomePanel({ register, onNavigateAway = () => {} }) {
  const copy = register
    ? { tag: 'Customer Registration', title: 'New Account Registration', body: 'Create a PECTRACK account to start ordering with ease.' }
    // Deliberately role-neutral. This panel sits beside a form that now
    // has a customer mode and a staff mode (LOGIN_SPLIT_PLAN.md
    // Decision 2), but it renders outside that form — LoginPage and
    // LoginModal place the two as siblings, so it cannot see the mode
    // without lifting state into both shells. Copy that is true for
    // whoever is signing in costs nothing and avoids telling a cashier
    // they are here to manage "your customer account", which is exactly
    // the kind of lie the split was made to remove.
    : { tag: 'Bakery Access', title: 'Welcome back to Pectrack Bakery.', body: 'Sign in to pick up where you left off.' }
  return (
    <aside className="relative hidden min-h-155 overflow-hidden rounded-l-[26px] bg-linear-to-b from-crust-500 via-crust-700 to-cocoa-900 p-7 text-white md:flex md:flex-col">
      <div className="absolute -left-24 -top-12 h-64 w-[150%] rotate-[-42deg] bg-butter-300/15" />
      <div className="absolute left-8 top-8 h-12 w-12 rounded-full bg-butter-300/40" />
      <div className="relative mt-8 flex justify-center"><div className="grid h-44 w-44 place-items-center rounded-full bg-white shadow-xl"><img src={logoMark} alt="Pecto's Bakery" className="h-40 w-40 object-contain" /></div></div>
      <div className="relative mt-auto max-w-xs">
        <span className="inline-flex rounded-full bg-butter-300 px-3 py-1 text-[11px] font-bold text-cocoa-900">{copy.tag}</span>
        <h1 className="mt-3 font-display text-3xl font-bold leading-tight">{copy.title}</h1>
        <p className="mt-2 text-sm leading-6 text-cream-100">{copy.body}</p>
        <Link to="/menu" onClick={onNavigateAway} className="mt-5 inline-block rounded-full border border-white px-5 py-2 text-xs font-bold transition hover:bg-white hover:text-cocoa-900">Continue browsing</Link>
      </div>
    </aside>
  )
}
