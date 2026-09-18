import { Brand } from '../components/Brand.jsx'
import { MarketingHeader } from '../components/MarketingHeader.jsx'
import { WelcomePanel } from '../components/WelcomePanel.jsx'

// The marketing-styled frame LoginPage and RegistrationPage both draw
// inline, lifted out once so the two password-recovery pages (Forgot /
// Reset) look like the sign-in they lead back to instead of a third
// design. The login and registration pages keep their own copies —
// their panels take different widths and props, and reshaping working
// screens for symmetry alone is not a reason to touch them.
export function AuthShell({ badge, title, children }) {
  return (
    <main className="min-h-screen bg-[#202120] p-0 text-stone-900">
      <section className="min-h-screen w-full overflow-hidden bg-white shadow-2xl">
        <MarketingHeader />
        <div className="relative flex min-h-[calc(100vh-86px)] items-center justify-center overflow-hidden bg-[#edf2ea] px-4 py-10 sm:px-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_8%_18%,rgba(76,154,79,.22)_0,rgba(76,154,79,.22)_90px,transparent_91px),radial-gradient(circle_at_92%_13%,rgba(234,164,171,.35)_0,rgba(234,164,171,.35)_120px,transparent_121px),radial-gradient(circle_at_90%_88%,rgba(70,158,190,.25)_0,rgba(70,158,190,.25)_170px,transparent_171px)]" />
          <div className="absolute -left-40 top-0 hidden h-[72%] w-[48%] skew-x-[-38deg] bg-linear-to-br from-[#9ab2a0] to-[#d8e4d4] md:block" />
          <div className="absolute -bottom-64 left-[16%] h-96 w-96 rounded-full border-36 border-[#f6e86c]/35" />
          <div className="relative grid w-full max-w-179 overflow-hidden rounded-[26px] bg-[#fffedc] shadow-2xl shadow-[#102d71]/25 md:grid-cols-[340px_376px] xl:max-w-200 xl:grid-cols-[370px_430px]">
            <WelcomePanel />
            <div className="min-h-142.5 bg-[#fffedc] p-7 sm:p-10 md:p-12">
              <div className="md:hidden"><Brand compact /></div>
              <div className="mt-6 md:mt-8">
                <span className="rounded-full bg-lime-200 px-3 py-1.5 text-[10px] font-bold text-green-800">{badge}</span>
                <h2 className="mt-3 text-3xl font-extrabold leading-[1.05] text-brand-700">{title}</h2>
              </div>
              {children}
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

export const authInputClass = 'w-full rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-sm shadow-sm outline-none transition focus:border-green-700 focus:ring-4 focus:ring-green-100'
export const authButtonClass = 'mt-5 w-full rounded-2xl bg-brand-600 py-2.5 text-xs font-bold text-white shadow-md transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60'
