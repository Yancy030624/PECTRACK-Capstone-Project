import { useState } from 'react'
import { LoginForm } from './LoginForm.jsx'
import { Modal } from './Modal.jsx'
import { RegisterForm } from './RegisterForm.jsx'
import { WelcomePanel } from './WelcomePanel.jsx'

// The one place anyone signs in or registers. Replaces the /login,
// /staff-login and /register PAGES, which are gone: signing in is
// something you do on top of the page you are already on, not somewhere
// you navigate to and have to find your way back from. Those three URLs
// still resolve (bookmarks, the links inside the password-recovery pages)
// — App.jsx turns each into "open this pop-up over the home page".
//
// Rendered once, at the App level rather than inside StorefrontLayout, so
// the same dialog can be opened from the storefront header, from a guest
// hitting a customer-only page, and from an expired staff session. Modal
// renders nothing while closed, so every field and error inside resets on
// each open instead of lingering.
//
// `request` is null when closed, otherwise { view, mode } — which of the
// two forms to show, and for the login form which door it opens on.
export function AuthModal({ request, onClose, onLogin, onView }) {
  const view = request?.view ?? 'login'
  const isRegister = view === 'register'

  return (
    <Modal open={Boolean(request)} onClose={onClose} labelledBy={isRegister ? 'auth-heading' : 'login-heading'}>
      {/* Keyed by the request, so a new one (another door, or register)
          starts on that request's door instead of the last one shown. */}
      <AuthDialog key={`${view}:${request?.mode ?? 'customer'}`} request={request} isRegister={isRegister} onClose={onClose} onLogin={onLogin} onView={onView} />
    </Modal>
  )
}

// The dialog's contents, split out so the open door (customer or staff)
// is state both columns read: the welcome panel and the form change
// colour together, which is what tells the two doors apart at a glance.
function AuthDialog({ request, isRegister, onClose, onLogin, onView }) {
  const [mode, setMode] = useState(request?.mode === 'staff' ? 'staff' : 'customer')

  return (
    <>
      {/* Columns are minmax(0,…), not fixed pixels. The register dialog's
          old 340px + 420px demanded 760px of track at the md breakpoint
          itself — wider than the 736px an iPad in portrait actually has
          once the overlay's padding is taken out — so it overflowed at
          exactly the width the two-column layout switched on. Flexible
          tracks let the panel take whatever the viewport allows, and
          max-w still caps it on a desktop. */}
      <div className={`relative grid w-full overflow-hidden rounded-[26px] bg-[#fffedc] shadow-2xl shadow-[#102d71]/25 md:grid-cols-[minmax(0,300px)_minmax(0,1fr)] xl:grid-cols-[minmax(0,370px)_minmax(0,1fr)] ${isRegister ? 'max-w-190 xl:max-w-207.5' : 'max-w-179 xl:max-w-200'}`}>
        <button type="button" onClick={onClose} aria-label="Close" className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full bg-white/90 text-lg leading-none text-stone-500 shadow-md transition hover:text-stone-900">✕</button>
        <WelcomePanel register={isRegister} staff={!isRegister && mode === 'staff'} onNavigateAway={onClose} />
        {isRegister ? (
          <RegisterForm onSwitchToLogin={() => onView({ view: 'login', mode: 'customer' })} />
        ) : (
          <LoginForm
            mode={mode}
            onModeChange={setMode}
            notice={request?.notice}
            onLogin={onLogin}
            onRegister={() => onView({ view: 'register' })}
            onNavigateAway={onClose}
          />
        )}
      </div>
    </>
  )
}
