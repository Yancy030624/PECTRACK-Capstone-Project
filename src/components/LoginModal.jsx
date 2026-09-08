import { LoginForm } from './LoginForm.jsx'
import { Modal } from './Modal.jsx'
import { WelcomePanel } from './WelcomePanel.jsx'

// The header's sign-in pop-up — same card, same form, as /login
// (LoginPage.jsx), just lifted into a dialog. See UI_REVISIONS_PLAN.md
// Decisions 1-2 for why /login still exists as its own route alongside this.
export function LoginModal({ open, onClose, onLogin, onRegister }) {
  return (
    <Modal open={open} onClose={onClose} labelledBy="login-heading">
      <div className="relative grid w-full max-w-179 overflow-hidden rounded-[26px] bg-[#fffedc] shadow-2xl shadow-[#102d71]/25 md:grid-cols-[340px_376px] xl:max-w-200 xl:grid-cols-[370px_430px]">
        <button type="button" onClick={onClose} aria-label="Close" className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full bg-white/90 text-lg leading-none text-stone-500 shadow-md transition hover:text-stone-900">✕</button>
        <WelcomePanel />
        <LoginForm onLogin={(user) => { onLogin(user); onClose() }} onRegister={onRegister} />
      </div>
    </Modal>
  )
}
