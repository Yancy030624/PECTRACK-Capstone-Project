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
      <div className={`relative grid w-full overflow-hidden rounded-[26px] bg-[#fffedc] shadow-2xl shadow-[#102d71]/25 ${isRegister ? 'max-w-190 md:grid-cols-[340px_420px] xl:max-w-207.5 xl:grid-cols-[370px_460px]' : 'max-w-179 md:grid-cols-[340px_376px] xl:max-w-200 xl:grid-cols-[370px_430px]'}`}>
        <button type="button" onClick={onClose} aria-label="Close" className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full bg-white/90 text-lg leading-none text-stone-500 shadow-md transition hover:text-stone-900">✕</button>
        <WelcomePanel register={isRegister} onNavigateAway={onClose} />
        {isRegister ? (
          <RegisterForm onSwitchToLogin={() => onView({ view: 'login', mode: 'customer' })} />
        ) : (
          <LoginForm
            initialMode={request?.mode ?? 'customer'}
            onLogin={onLogin}
            onRegister={() => onView({ view: 'register' })}
            onNavigateAway={onClose}
          />
        )}
      </div>
    </Modal>
  )
}
