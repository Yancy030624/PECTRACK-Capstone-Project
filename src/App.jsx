// Import state management for page changes, form controls, and the demo session.
import { useState } from 'react'

// Define the available modules and the roles that can open each one.
const modules = [
  { name: 'Dashboard', icon: '▦', roles: ['ADMIN', 'CUSTOMER', 'CASHIER', 'DELIVERY PERSONNEL'] },
  { name: 'Order Management', icon: '□', roles: ['ADMIN', 'CUSTOMER', 'CASHIER', 'DELIVERY PERSONNEL'] },
  { name: 'Customer Management', icon: '♙', roles: ['ADMIN', 'CASHIER'] },
  { name: 'Inventory Management', icon: '▤', roles: ['ADMIN', 'CASHIER'] },
  { name: 'Payment & Billing', icon: '◫', roles: ['ADMIN', 'CUSTOMER', 'CASHIER'] },
  { name: 'Reporting & Analytics', icon: '⌁', roles: ['ADMIN', 'CASHIER'] },
]

// Render the supplied bakery logo consistently wherever the product is named.
function Brand({ compact = false }) {
  // Return the logo image and the Pectrack wordmark.
  return (
    <div className="flex items-center gap-2.5">
      {/* Keep the original logo crisp inside a round, elevated seal. */}
      <span className={`grid overflow-hidden rounded-full bg-white shadow-md ring-1 ring-black/5 ${compact ? 'h-12 w-12' : 'h-24 w-24 sm:h-28 sm:w-28'}`}>
        <img src="/src/assets/logo-circle.png" alt="Pectos Bakery logo" className="h-full w-full rounded-full scale-125 object-cover" />
      </span>
      {/* Use the warm gold from the supplied brand mark. */}
      <span className={`${compact ? 'text-xl' : 'text-2xl'} font-serif font-black tracking-tight text-[#b97600] [text-shadow:1px_1px_0_#f6d66b]`}>PECTRACK</span>
    </div>
  )
}

// Render compact, dependency-free icons in the public navigation.
function HeaderIcon({ type }) {
  // Select an SVG shape based on the requested icon type.
  const paths = {
    search: <path d="m21 21-4.35-4.35m1.35-5.15a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z" />,
    user: <><circle cx="12" cy="8" r="3.2" /><path d="M5 20c.8-3.4 3.1-5.1 7-5.1s6.2 1.7 7 5.1" /></>,
    cart: <><path d="M3 4h2l2.1 10.1h10.8L21 7H6" /><circle cx="9" cy="19" r="1" /><circle cx="18" cy="19" r="1" /></>,
  }
  // Return a circular, keyboard-focusable visual control.
  return <button type="button" className="grid h-9 w-9 place-items-center rounded-full bg-white text-stone-900 shadow-md transition hover:-translate-y-0.5 hover:text-green-800 focus:outline-none focus:ring-2 focus:ring-green-700" aria-label={type}><svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4">{paths[type]}</svg></button>
}

// Render a simple header shared by login and registration screens.
function MarketingHeader({ onLogin, onRegister }) {
  // Return the responsive navigation bar.
  return (
    <header className="grid min-h-21.5 grid-cols-[1fr_auto] items-center border-t-[7px] border-[#26752a] bg-[#fffedc] px-4 py-3 sm:px-7 md:grid-cols-[1fr_auto_1fr]">
      {/* Link the brand back to the login view. */}
      <button type="button" onClick={onLogin} aria-label="Go to login"><Brand compact /></button>
      {/* Keep HOME, PRODUCTS, and LOGIN exactly centered on desktop. */}
      <nav className="hidden items-center gap-7 text-xs font-bold text-stone-800 md:flex">
        <a href="#home" className="font-serif text-sm transition hover:text-green-800">HOME</a>
        <a href="#products" className="font-serif text-sm transition hover:text-green-800">PRODUCTS</a>
        <button type="button" onClick={onLogin} className="border-b-2 border-green-700 font-serif text-sm text-green-800">LOGIN</button>
      </nav>
      {/* Keep visual shortcuts aligned to the far right. */}
      <div className="ml-auto flex items-center gap-3">
        <HeaderIcon type="search" />
        <HeaderIcon type="user" />
        <HeaderIcon type="cart" />
        <button type="button" onClick={onRegister} className="rounded-full bg-green-700 px-3 py-2 text-[11px] text-white shadow-sm transition hover:bg-green-800 md:hidden">JOIN</button>
      </div>
    </header>
  )
}

// Show the illustration and introductory message used by both authentication pages.
function WelcomePanel({ register }) {
  // Select page-specific copy for login or registration.
  const copy = register
    ? { tag: 'Customer Registration', title: 'New Account Registration', body: 'Create a PECTRACK account to start ordering with ease.' }
    : { tag: 'Bakery Access', title: 'Welcome back to Pectrack Bakery.', body: 'Sign in to continue ordering, checking pickup details, and managing your customer account.' }

  // Return the branded visual panel.
  return (
    <aside className="relative hidden min-h-155 overflow-hidden rounded-l-[26px] bg-linear-to-b from-[#449947] via-[#17564e] to-[#112c78] p-7 text-white md:flex md:flex-col">
      {/* Add the diagonal shape and light spots from the supplied reference. */}
      <div className="absolute -left-24 -top-12 h-64 w-[150%] rotate-[-42deg] bg-white/13" />
      <div className="absolute left-8 top-8 h-12 w-12 rounded-full bg-amber-50/35" />
      {/* Put the real bakery mark in the large white logo circle. */}
      <div className="relative mt-8 flex justify-center"><div className="grid h-44 w-44 place-items-center rounded-full bg-white shadow-xl"><img src="/src/assets/logo-circle.png" alt="Pectos Bakery" className="h-40 w-40 scale-125 object-contain" /></div></div>
      {/* Present the page purpose at the lower edge of the panel. */}
      <div className="relative mt-auto max-w-xs">
        <span className="inline-flex rounded-full bg-yellow-200 px-3 py-1 text-[10px] font-bold text-green-800">{copy.tag}</span>
        <h1 className="mt-3 text-3xl font-extrabold leading-tight">{copy.title}</h1>
        <p className="mt-2 text-[11px] leading-5 text-green-50">{copy.body}</p>
        <button type="button" className="mt-5 rounded-full border border-white px-5 py-2 text-xs font-bold transition hover:bg-white hover:text-green-900">Continue browsing</button>
      </div>
    </aside>
  )
}

// Render the sign-in page and translate demo usernames into role sessions.
function LoginPage({ onRegister, onLogin }) {
  // Store what the person entered in the username field.
  const [username, setUsername] = useState('')
  // Store the password so the form feels like a real sign-in flow.
  const [password, setPassword] = useState('')
  // Control the password visibility toggle.
  const [showPassword, setShowPassword] = useState(false)
  // Store a validation error that can be announced to screen readers.
  const [error, setError] = useState('')

  // Send credentials to the server, which verifies the bcrypt hash.
  const handleSubmit = async (event) => {
    // Prevent the default page refresh from a form submission.
    event.preventDefault()
    // Explain how to proceed if either field is incomplete.
    if (!username || !password) {
      setError('Enter a username and password to sign in.')
      return
    }
    try {
      const apiResponse = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: username, password }) })
      const data = await apiResponse.json()
      if (!apiResponse.ok) return setError(data.message ?? 'Unable to sign in.')
      setError('')
      onLogin(data.user)
    } catch {
      setError('Unable to reach the sign-in service. Please try again later.')
    }
  }

  // Return the complete login page.
  return (
    <main className="min-h-screen bg-[#202120] p-0 text-stone-900">
      {/* Fill every screen size instead of constraining the page to a fixed desktop canvas. */}
      <section className="min-h-screen w-full overflow-hidden bg-white shadow-2xl">
        {/* Keep the supplied cream navigation bar above the photo. */}
        <MarketingHeader onLogin={() => {}} onRegister={onRegister} />
        {/* Use a crisp scalable background system instead of stretching the small photo on 2K displays. */}
        <div className="relative flex min-h-[calc(100vh-86px)] items-center justify-center overflow-hidden bg-[#edf2ea] px-4 py-10 sm:px-8">
          {/* Layer palette-matched shapes to give large screens visual depth. */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_8%_18%,rgba(76,154,79,.22)_0,rgba(76,154,79,.22)_90px,transparent_91px),radial-gradient(circle_at_92%_13%,rgba(234,164,171,.35)_0,rgba(234,164,171,.35)_120px,transparent_121px),radial-gradient(circle_at_90%_88%,rgba(70,158,190,.25)_0,rgba(70,158,190,.25)_170px,transparent_171px)]" />
          <div className="absolute -left-40 top-0 hidden h-[72%] w-[48%] skew-x-[-38deg] bg-linear-to-br from-[#9ab2a0] to-[#d8e4d4] md:block" />
          <div className="absolute -bottom-64 left-[16%] h-96 w-96 rounded-full border-36 border-[#f6e86c]/35" />
          <div className="absolute right-[8%] top-[32%] hidden h-56 w-56 rotate-45 rounded-[45px] border-26 border-white/50 xl:block" />
          {/* Join the brand story and the sign-in card into the central feature. */}
          <div className="relative grid w-full max-w-179 overflow-hidden rounded-[26px] bg-[#fffedc] shadow-2xl shadow-[#102d71]/25 md:grid-cols-[340px_376px] xl:max-w-200 xl:grid-cols-[370px_430px]">
            <WelcomePanel />
            {/* Keep the credentials area bright and calm for easy scanning. */}
            <div className="min-h-142.5 bg-[#fffedc] p-7 sm:p-10 md:p-12">
              <div className="md:hidden"><Brand compact /></div>
              <div className="mt-6 md:mt-8"><span className="rounded-full bg-lime-200 px-3 py-1.5 text-[10px] font-bold text-green-800">Customer Login</span><h2 className="mt-3 text-3xl font-extrabold leading-[1.05] text-[#271dc8]">Sign in to your<br />account</h2><p className="mt-2 text-[11px] font-medium text-stone-500">Use your username or email to continue</p></div>
              {/* Credentials are validated by the API; passwords never reach the database as plain text. */}
              <form className="mt-6 space-y-3" onSubmit={handleSubmit} noValidate>
                <div><label htmlFor="username" className="mb-1.5 block text-[11px] font-extrabold">Username or Email</label><div className="relative"><svg viewBox="0 0 24 24" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="3" /><path d="M5.5 20c.8-3.3 2.9-5 6.5-5s5.7 1.7 6.5 5" /></svg><input id="username" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" placeholder="Email" className="w-full rounded-2xl border border-stone-200 bg-white py-2.5 pl-9 pr-3 text-xs shadow-sm outline-none transition focus:border-green-700 focus:ring-4 focus:ring-green-100" /></div></div>
                <div><label htmlFor="password" className="mb-1.5 block text-[11px] font-extrabold">Password</label><div className="relative"><svg viewBox="0 0 24 24" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg><input id="password" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" placeholder="Password" className="w-full rounded-2xl border border-stone-200 bg-white py-2.5 pl-9 pr-14 text-xs shadow-sm outline-none transition focus:border-green-700 focus:ring-4 focus:ring-green-100" /><button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 px-3 text-[10px] font-bold text-green-800">{showPassword ? 'Hide' : 'Show'}</button></div></div>
                <div className="flex items-center justify-between gap-2 text-[10px] font-bold"><label className="flex cursor-pointer items-center gap-1.5"><input type="checkbox" className="h-4 w-4 accent-green-700" />Remember me</label><a href="#forgot" className="text-green-700 hover:underline">Forgot password?</a></div>
                {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-[10px] font-semibold text-red-700">{error}</p>}
                <button type="submit" className="mt-5 w-full rounded-2xl bg-[#291dcc] py-2.5 text-xs font-bold text-white shadow-md transition hover:bg-[#1e159b] focus:outline-none focus:ring-4 focus:ring-indigo-200">Log In</button>
                <button type="button" onClick={onRegister} className="w-full rounded-2xl bg-white py-2.5 text-[10px] font-bold text-[#291dcc] shadow-md ring-1 ring-stone-100 transition hover:bg-stone-50">Create account</button>
              </form>
              {/* Keep help visible without exposing demonstration credentials. */}
              <div className="mt-7 border-t border-stone-200 pt-4 text-center text-[10px] text-stone-500">Need help? Contact <a href="mailto:hello@pectrack.example" className="font-bold text-green-700 hover:underline">Pectos Bakery Lucban Quezon</a></div>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

// Render the registration page with visual parity to the login page.
function RegistrationPage({ onLogin, onRegister }) {
  // Store registration form values in one convenient state object.
  const [form, setForm] = useState({ name: '', username: '', email: '', contactNumber: '', password: '', confirmPassword: '', agree: false })
  // Store feedback after a registration attempt.
  const [message, setMessage] = useState('')
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  // Update a single registration field without losing the others.
  const updateField = (field, value) => setForm({ ...form, [field]: value })

  const passwordHint = form.password.length < 12 ? 'Use at least 12 characters.' : !/[A-Z]/.test(form.password) || !/[a-z]/.test(form.password) || !/\d/.test(form.password) || !/[^A-Za-z0-9]/.test(form.password) ? 'Add uppercase, lowercase, number, and symbol.' : 'Strong password format.'

  // Submit to the API, which repeats all validation and hashes the password with bcrypt.
  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!form.agree) return setMessage('Please agree to the Terms of Service and Privacy Policy.')
    setSubmitting(true)
    setMessage('')
    setErrors({})
    try {
      const apiResponse = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const data = await apiResponse.json()
      if (!apiResponse.ok) {
        setErrors(data.errors ?? {})
        setMessage(data.message ?? 'Unable to create the account.')
        return
      }
      setForm({ name: '', username: '', email: '', contactNumber: '', password: '', confirmPassword: '', agree: false })
      setMessage('Account created. You can now sign in with your username or email.')
    } catch {
      setMessage('Unable to reach the registration service. Please try again later.')
    } finally {
      setSubmitting(false)
    }
  }

  // Return the full registration experience.
  return (
    <main className="min-h-screen bg-[#202120] p-0 text-stone-900">
      {/* Use the same full-screen public shell as login for a seamless page transition. */}
      <section className="min-h-screen w-full overflow-hidden bg-white shadow-2xl">
        {/* The shared header keeps the centered desktop navigation and mobile shortcuts. */}
        <MarketingHeader onLogin={onLogin} onRegister={onRegister} />
        {/* Reuse the crisp decorative background so it remains sharp at every resolution. */}
        <div className="relative flex min-h-[calc(100vh-86px)] items-center justify-center overflow-hidden bg-[#edf2ea] px-4 py-10 sm:px-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_8%_18%,rgba(76,154,79,.22)_0,rgba(76,154,79,.22)_90px,transparent_91px),radial-gradient(circle_at_92%_13%,rgba(234,164,171,.35)_0,rgba(234,164,171,.35)_120px,transparent_121px),radial-gradient(circle_at_90%_88%,rgba(70,158,190,.25)_0,rgba(70,158,190,.25)_170px,transparent_171px)]" />
          <div className="absolute -left-40 top-0 hidden h-[72%] w-[48%] skew-x-[-38deg] bg-linear-to-br from-[#9ab2a0] to-[#d8e4d4] md:block" />
          <div className="absolute -bottom-64 left-[16%] h-96 w-96 rounded-full border-36 border-[#f6e86c]/35" />
          <div className="absolute right-[8%] top-[32%] hidden h-56 w-56 rotate-45 rounded-[45px] border-26 border-white/50 xl:block" />
          {/* Pair the illustrated brand panel with the customer account form. */}
          <div className="relative grid w-full max-w-190 overflow-hidden rounded-[26px] bg-[#fffedc] shadow-2xl shadow-[#102d71]/25 md:grid-cols-[340px_420px] xl:max-w-207.5 xl:grid-cols-[370px_460px]">
            <WelcomePanel register />
            {/* Keep registration fields spacious while avoiding excessive scrolling. */}
            <div className="bg-[#fffedc] p-7 sm:p-10 md:p-11"><div className="md:hidden"><Brand compact /></div><div className="mt-6 flex items-start justify-between gap-4 md:mt-2"><div><span className="rounded-full bg-lime-200 px-3 py-1.5 text-[10px] font-bold text-green-800">Customer Registration</span><h2 className="mt-3 text-3xl font-extrabold leading-[1.05] text-[#271dc8]">Create your<br />account.</h2></div><span className="rounded-full border border-green-200 bg-white px-2.5 py-1 text-[10px] font-bold text-green-800">Step 1 of 2</span></div><p className="mt-2 text-[11px] font-medium leading-5 text-stone-500">Create your Pectrack profile to place orders and keep your details in one place.</p>
              {/* Collect only the information needed to create a customer profile. */}
              <form className="mt-5 space-y-3" onSubmit={handleSubmit} noValidate>
                <div><label htmlFor="full-name" className="mb-1.5 block text-[11px] font-extrabold">Full name</label><input id="full-name" value={form.name} onChange={(event) => updateField('name', event.target.value)} autoComplete="name" placeholder="Your full name" className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-xs shadow-sm outline-none transition focus:border-green-700 focus:ring-4 focus:ring-green-100" />{errors.name && <p className="mt-1 text-[10px] font-medium text-red-700">{errors.name}</p>}</div>
                <div className="grid gap-3 sm:grid-cols-2"><div><label htmlFor="register-username" className="mb-1.5 block text-[11px] font-extrabold">Username</label><input id="register-username" value={form.username} onChange={(event) => updateField('username', event.target.value)} autoComplete="username" placeholder="e.g. maria.santos" className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-xs shadow-sm outline-none transition focus:border-green-700 focus:ring-4 focus:ring-green-100" />{errors.username && <p className="mt-1 text-[10px] font-medium text-red-700">{errors.username}</p>}</div><div><label htmlFor="contact-number" className="mb-1.5 block text-[11px] font-extrabold">Contact number</label><input id="contact-number" maxlength="11" value={form.contactNumber} onChange={(event) => updateField('contactNumber', event.target.value)} autoComplete="tel" inputMode="tel" placeholder="09XXXXXXXXX" className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-xs shadow-sm outline-none transition focus:border-green-700 focus:ring-4 focus:ring-green-100" />{errors.contactNumber && <p className="mt-1 text-[10px] font-medium text-red-700">{errors.contactNumber}</p>}</div></div>
                <div><label htmlFor="register-email" className="mb-1.5 block text-[11px] font-extrabold">Email</label><input id="register-email" type="email" value={form.email} onChange={(event) => updateField('email', event.target.value)} autoComplete="email" placeholder="you@example.com" className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-xs shadow-sm outline-none transition focus:border-green-700 focus:ring-4 focus:ring-green-100" />{errors.email && <p className="mt-1 text-[10px] font-medium text-red-700">{errors.email}</p>}</div>
                <div className="grid gap-3 sm:grid-cols-2"><div><label htmlFor="register-password" className="mb-1.5 block text-[11px] font-extrabold">Password</label><input id="register-password" type="password" value={form.password} onChange={(event) => updateField('password', event.target.value)} autoComplete="new-password" placeholder="Create password" className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-xs shadow-sm outline-none transition focus:border-green-700 focus:ring-4 focus:ring-green-100" />{errors.password && <p className="mt-1 text-[10px] font-medium text-red-700">{errors.password}</p>}</div><div><label htmlFor="confirm-password" className="mb-1.5 block text-[11px] font-extrabold">Confirm password</label><input id="confirm-password" type="password" value={form.confirmPassword} onChange={(event) => updateField('confirmPassword', event.target.value)} autoComplete="new-password" placeholder="Repeat password" className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-xs shadow-sm outline-none transition focus:border-green-700 focus:ring-4 focus:ring-green-100" />{errors.confirmPassword && <p className="mt-1 text-[10px] font-medium text-red-700">{errors.confirmPassword}</p>}</div></div>
                <p className={`text-[10px] ${form.password && passwordHint === 'Strong password format.' ? 'text-green-700' : 'text-stone-500'}`}>{passwordHint}</p>
                <label className="flex cursor-pointer items-start gap-2 rounded-xl bg-white/70 p-2.5 text-[10px] leading-4 shadow-sm"><input type="checkbox" checked={form.agree} onChange={(event) => updateField('agree', event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-green-700" />I agree to the <a href="#terms" className="font-bold text-green-700 underline">Terms of Service</a> and <a href="#privacy" className="font-bold text-green-700 underline">Privacy Policy</a>.</label>
                {message && <p role="status" className={`rounded-lg px-3 py-2 text-[10px] font-semibold ${Object.keys(errors).length ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-800'}`}>{message}</p>}
                <button type="submit" disabled={submitting} className="w-full rounded-2xl bg-lime-500 py-2.5 text-xs font-bold text-green-950 shadow-lg shadow-lime-500/30 transition hover:bg-lime-400 focus:outline-none focus:ring-4 focus:ring-lime-200 disabled:cursor-not-allowed disabled:opacity-60">{submitting ? 'Creating account…' : 'Create account'}</button>
              </form>
              <p className="mt-5 border-t border-stone-200 pt-4 text-center text-[10px] text-stone-500">Already have an account? <button type="button" onClick={onLogin} className="font-bold text-green-700 hover:underline">Back to login</button></p>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

// Render the protected shell and expose only modules the signed-in role can access.
function Dashboard({ user, onLogout }) {
  // Track which permitted module is currently active.
  const [activeModule, setActiveModule] = useState('Dashboard')
  // Calculate the navigation items for the signed-in role.
  const allowedModules = modules.filter((module) => module.roles.includes(user.role))
  // Tailor the primary dashboard number to the person’s job.
  const roleMetrics = { ADMIN: ['₱86,420', 'Monthly revenue'], CASHIER: ['24', 'Orders to process'], CUSTOMER: ['3', 'Active orders'], 'DELIVERY PERSONNEL': ['8', 'Deliveries today'] }
  // Return the role-based dashboard page.
  return (
    <main className="min-h-screen bg-[#f5f7f2] text-slate-800">
      {/* Make the top bar useful on mobile and desktop. */}
      <header className="flex items-center justify-between border-b border-green-100 bg-white px-4 py-3 shadow-sm sm:px-7"><Brand /><div className="flex items-center gap-3"><span className="hidden text-right text-xs text-slate-500 sm:block"><strong className="block text-slate-800">{user.name}</strong>{user.role}</span><div className="grid h-9 w-9 place-items-center rounded-full bg-green-100 font-bold text-green-800">{user.name[0]}</div><button type="button" onClick={onLogout} className="rounded-lg border border-green-700 px-3 py-2 text-xs font-bold text-green-800 hover:bg-green-50">Log out</button></div></header>
      <div className="mx-auto flex max-w-7xl">
        {/* Render only the modules authorized for this role. */}
        <aside className="sticky top-0 hidden h-[calc(100vh-65px)] w-64 shrink-0 border-r border-green-100 bg-white p-5 md:block"><p className="mb-4 px-3 text-[10px] font-bold tracking-widest text-slate-400">MAIN MENU</p><nav className="space-y-1">{allowedModules.map((module) => <button type="button" key={module.name} onClick={() => setActiveModule(module.name)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold transition ${activeModule === module.name ? 'bg-green-700 text-white shadow-md shadow-green-700/20' : 'text-slate-600 hover:bg-green-50 hover:text-green-800'}`}><span className="text-lg">{module.icon}</span>{module.name}</button>)}</nav><div className="mt-8 rounded-xl bg-[#fbfbdc] p-4 text-xs leading-5 text-green-950"><strong className="block">{user.role} access</strong>You can use {allowedModules.length} permitted module{allowedModules.length === 1 ? '' : 's'}.</div></aside>
        {/* Provide a horizontally scrollable mobile navigation alternative. */}
        <div className="absolute top-16.25 z-10 flex w-full gap-2 overflow-x-auto border-b border-green-100 bg-white p-3 md:hidden">{allowedModules.map((module) => <button type="button" key={module.name} onClick={() => setActiveModule(module.name)} className={`whitespace-nowrap rounded-full px-3 py-2 text-xs font-bold ${activeModule === module.name ? 'bg-green-700 text-white' : 'bg-green-50 text-green-800'}`}>{module.name}</button>)}</div>
        {/* Change the content heading when a role opens a different allowed module. */}
        <section className="min-w-0 flex-1 px-4 pb-10 pt-24 sm:px-7 md:pt-9"><p className="text-sm font-semibold text-green-700">{user.role} PORTAL</p><h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">{activeModule}</h1><p className="mt-2 text-sm text-slate-500">Welcome back, {user.name}. Here is what needs your attention today.</p>
          <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><article className="rounded-2xl bg-linear-to-br from-green-700 to-blue-900 p-6 text-white shadow-lg"><p className="text-sm text-green-100">{roleMetrics[user.role][1]}</p><p className="mt-3 text-4xl font-extrabold">{roleMetrics[user.role][0]}</p><p className="mt-7 text-xs text-green-100">Updated a few moments ago</p></article><article className="rounded-2xl border border-green-100 bg-white p-6"><p className="text-sm font-semibold text-slate-500">Pending actions</p><p className="mt-3 text-4xl font-extrabold text-slate-900">{user.role === 'CUSTOMER' ? '1' : '12'}</p><p className="mt-7 text-xs font-bold text-green-700">View details →</p></article><article className="rounded-2xl border border-green-100 bg-[#fbfbdc] p-6 sm:col-span-2 xl:col-span-1"><p className="text-sm font-semibold text-green-800">Quick access</p><p className="mt-3 text-sm leading-6 text-slate-600">Use the navigation to move through your permitted Pectrack modules securely.</p></article></div>
          <div className="mt-6 rounded-2xl border border-green-100 bg-white p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">Recent activity</h2><p className="mt-1 text-sm text-slate-500">Latest updates relevant to your role.</p></div><button type="button" className="rounded-lg bg-green-50 px-3 py-2 text-xs font-bold text-green-800">View all</button></div><div className="mt-5 divide-y divide-slate-100">{['Order #PT-2084 was updated', 'Payment status was confirmed', 'New activity was assigned'].map((item, index) => <div key={item} className="flex items-center justify-between gap-4 py-4 text-sm"><span className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-full bg-green-100 text-green-800">✓</span>{item}</span><span className="whitespace-nowrap text-xs text-slate-400">{index + 1}h ago</span></div>)}</div></div>
        </section>
      </div>
    </main>
  )
}

// Coordinate public pages and protected role-based dashboard screens.
function App() {
  // Remember whether the visitor is signing in or registering.
  const [page, setPage] = useState('login')
  // Hold the signed-in account; a missing account means the visitor is logged out.
  const [user, setUser] = useState(null)
  // Show the protected dashboard after a successful demo login.
  if (user) return <Dashboard user={user} onLogout={() => setUser(null)} />
  // Render the requested registration page when selected.
  if (page === 'register') return <RegistrationPage onLogin={() => setPage('login')} onRegister={() => setPage('register')} />
  // Render the login page by default.
  return <LoginPage onRegister={() => setPage('register')} onLogin={setUser} />
}

// Export the application so Vite can mount it.
export default App
