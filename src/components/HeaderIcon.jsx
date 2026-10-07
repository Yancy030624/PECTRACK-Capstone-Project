export function HeaderIcon({ type, disabled = false, onClick, badge, label }) {
  const paths = {
    search: <path d="m21 21-4.35-4.35m1.35-5.15a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z" />,
    user: <><circle cx="12" cy="8" r="3.2" /><path d="M5 20c.8-3.4 3.1-5.1 7-5.1s6.2 1.7 7 5.1" /></>,
    cart: <><path d="M3 4h2l2.1 10.1h10.8L21 7H6" /><circle cx="9" cy="19" r="1" /><circle cx="18" cy="19" r="1" /></>,
  }
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      title={disabled ? 'Coming soon' : undefined}
      className={`relative grid h-10 w-10 place-items-center rounded-full bg-white ring-1 ring-cream-300 transition ${disabled ? 'cursor-not-allowed text-cocoa-500/40' : 'text-cocoa-900 hover:-translate-y-0.5 hover:bg-cream-100 hover:text-crust-600'}`}
      aria-label={label ?? type}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">{paths[type]}</svg>
      {!disabled && !!badge && (
        <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-crust-600 px-1 text-[10px] font-extrabold text-white ring-2 ring-cream-50">{badge}</span>
      )}
    </button>
  )
}
