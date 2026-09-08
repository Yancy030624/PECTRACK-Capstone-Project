import { LoginForm } from '../components/LoginForm.jsx'
import { MarketingHeader } from '../components/MarketingHeader.jsx'
import { WelcomePanel } from '../components/WelcomePanel.jsx'

// The full-page sign-in screen — reachable directly at /login (bookmarks,
// a returnTo redirect, a fresh tab) even though most visitors now reach
// the same form through the header's pop-up (LoginModal.jsx). Both render
// LoginForm, so there is exactly one copy of the auth logic to maintain.
export function LoginPage({ onRegister, onLogin }) {
  return (
    <main className="min-h-screen bg-[#202120] p-0 text-stone-900">
      <section className="min-h-screen w-full overflow-hidden bg-white shadow-2xl">
        <MarketingHeader />
        <div className="relative flex min-h-[calc(100vh-86px)] items-center justify-center overflow-hidden bg-[#edf2ea] px-4 py-10 sm:px-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_8%_18%,rgba(76,154,79,.22)_0,rgba(76,154,79,.22)_90px,transparent_91px),radial-gradient(circle_at_92%_13%,rgba(234,164,171,.35)_0,rgba(234,164,171,.35)_120px,transparent_121px),radial-gradient(circle_at_90%_88%,rgba(70,158,190,.25)_0,rgba(70,158,190,.25)_170px,transparent_171px)]" />
          <div className="absolute -left-40 top-0 hidden h-[72%] w-[48%] skew-x-[-38deg] bg-linear-to-br from-[#9ab2a0] to-[#d8e4d4] md:block" />
          <div className="absolute -bottom-64 left-[16%] h-96 w-96 rounded-full border-36 border-[#f6e86c]/35" />
          <div className="absolute right-[8%] top-[32%] hidden h-56 w-56 rotate-45 rounded-[45px] border-26 border-white/50 xl:block" />
          <div className="relative grid w-full max-w-179 overflow-hidden rounded-[26px] bg-[#fffedc] shadow-2xl shadow-[#102d71]/25 md:grid-cols-[340px_376px] xl:max-w-200 xl:grid-cols-[370px_430px]">
            <WelcomePanel />
            <LoginForm onLogin={onLogin} onRegister={onRegister} />
          </div>
        </div>
      </section>
    </main>
  )
}
