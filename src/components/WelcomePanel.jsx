import { Link } from 'react-router-dom'
import logoCircle from '../assets/logo-circle.png'

export function WelcomePanel({ register }) {
  const copy = register
    ? { tag: 'Customer Registration', title: 'New Account Registration', body: 'Create a PECTRACK account to start ordering with ease.' }
    : { tag: 'Bakery Access', title: 'Welcome back to Pectrack Bakery.', body: 'Sign in to continue ordering, checking pickup details, and managing your customer account.' }
  return (
    <aside className="relative hidden min-h-155 overflow-hidden rounded-l-[26px] bg-linear-to-b from-[#449947] via-[#17564e] to-[#112c78] p-7 text-white md:flex md:flex-col">
      <div className="absolute -left-24 -top-12 h-64 w-[150%] rotate-[-42deg] bg-white/13" />
      <div className="absolute left-8 top-8 h-12 w-12 rounded-full bg-amber-50/35" />
      <div className="relative mt-8 flex justify-center"><div className="grid h-44 w-44 place-items-center rounded-full bg-white shadow-xl"><img src={logoCircle} alt="Pectos Bakery" className="h-40 w-40 scale-125 object-contain" /></div></div>
      <div className="relative mt-auto max-w-xs">
        <span className="inline-flex rounded-full bg-yellow-200 px-3 py-1 text-[10px] font-bold text-green-800">{copy.tag}</span>
        <h1 className="mt-3 text-3xl font-extrabold leading-tight">{copy.title}</h1>
        <p className="mt-2 text-[11px] leading-5 text-green-50">{copy.body}</p>
        <Link to="/menu" className="mt-5 inline-block rounded-full border border-white px-5 py-2 text-xs font-bold transition hover:bg-white hover:text-green-900">Continue browsing</Link>
      </div>
    </aside>
  )
}
