import { useNavigate } from 'react-router-dom'
import logoMark from '../assets/logo-mark.png'
import { MarketingHeader } from '../components/MarketingHeader.jsx'
import { bakery, telHref } from '../lib/bakery.js'

// The frame of the pages reached from an email link — Forgot password,
// Reset password, Confirm email. They are real pages (a link opens them in
// a fresh browser), but they look like the log-in pop-up they lead back to
// (LoginForm.jsx, customer door, the user 2026-10-25): the storefront
// header on a cream page, and the same cream card — the logo in a circle,
// one heading in the display face, crust-brown buttons and links, and the
// bakery's number at the foot. The old frame was the green-and-lime design
// the log-in had before 2026-10-23.
//
// The header's Sign in and Create account go to /login and /register,
// which open the pop-up over the home page (App.jsx).
export function AuthShell({ title, subtitle, children }) {
  const navigate = useNavigate()
  return (
    <div className="flex min-h-screen flex-col bg-cream-100 font-body text-cocoa-700">
      <MarketingHeader onOpenLogin={() => navigate('/login')} onOpenRegister={() => navigate('/register')} />
      <main className="flex flex-1 items-start justify-center px-4 py-10 sm:items-center sm:py-14">
        <div className="w-full max-w-110 overflow-hidden rounded-[26px] bg-[#fffedc] shadow-2xl shadow-[#102d71]/25">
          <div className="px-6 pb-6 pt-8 sm:px-9 sm:pb-8">
            <div className="flex flex-col items-center text-center">
              <img src={logoMark} alt="Pecto's Bakery" className="h-20 w-20 rounded-full bg-white object-contain shadow-md ring-1 ring-black/5" />
              <h1 className="mt-3 font-display text-2xl font-bold text-crust-700">{title}</h1>
              {subtitle && <p className="mt-1 text-xs text-stone-500">{subtitle}</p>}
            </div>
            {children}
            <p className="mt-6 border-t border-stone-200 pt-4 text-center text-[11px] text-stone-500">
              Need help? Call <a href={telHref(bakery.phones[0])} className="font-bold text-crust-600 hover:underline">{bakery.phones[0]}</a>
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}

// The log-in form's own field, button, link and message looks (customer door).
export const authInputClass = 'w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-crust-500 focus:ring-4 focus:ring-cream-200'
export const authButtonClass = 'w-full rounded-2xl bg-crust-600 py-3 text-sm font-bold text-white shadow-md transition hover:bg-crust-700 disabled:cursor-not-allowed disabled:opacity-70'
export const authLinkClass = 'block py-1 text-center text-xs font-bold text-crust-600 hover:underline'
export const authSuccessClass = 'rounded-xl bg-green-50 px-3 py-2.5 text-xs font-semibold text-green-800'
export const authErrorClass = 'rounded-xl bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-700'
