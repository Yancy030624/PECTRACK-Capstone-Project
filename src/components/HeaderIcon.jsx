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
      className={`relative grid h-9 w-9 place-items-center rounded-full bg-white shadow-md transition focus:outline-none focus:ring-2 focus:ring-green-700 ${disabled ? 'cursor-not-allowed text-stone-300' : 'text-stone-900 hover:-translate-y-0.5 hover:text-green-800'}`}
      aria-label={label ?? type}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4">{paths[type]}</svg>
      {!disabled && !!badge && (
        <span className="absolute -right-1 -top-1 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-green-700 px-1 text-[9px] font-bold text-white">{badge}</span>
      )}
    </button>
  )
}
