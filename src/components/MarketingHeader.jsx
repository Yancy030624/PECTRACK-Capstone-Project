import { Brand } from './Brand.jsx'
import { HeaderIcon } from './HeaderIcon.jsx'

// Render a simple header shared by login and registration screens.
export function MarketingHeader({ onLogin, onRegister }) {
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
