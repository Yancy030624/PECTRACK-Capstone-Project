// Sidebar/module icons as inline SVG, one path set per module key. The
// previous icons were Unicode glyphs (▦ ☺ □ ♙ ▤ ⛁ ◫ ⛟ ⌁ ◉) whose width,
// weight, and even presence vary by font and platform — a chess pawn for
// Customers, a smiley for Staff. Same stroke style as HeaderIcon.jsx so
// the two shells read as one family.
const PATHS = {
  dashboard: <><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="5" rx="1.5" /><rect x="13" y="10" width="8" height="11" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /></>,
  staff: <><circle cx="9" cy="8" r="3" /><path d="M3 20c.6-3.2 2.7-5 6-5s5.4 1.8 6 5" /><circle cx="17" cy="9" r="2.5" /><path d="M16 15c3 0 4.6 1.6 5 5" /></>,
  orders: <><path d="M6 3h12a1 1 0 0 1 1 1v17l-3-2-2 2-2-2-2 2-2-2-3 2V4a1 1 0 0 1 1-1Z" /><path d="M9 8h6M9 12h6" /></>,
  customers: <><circle cx="12" cy="8" r="3.2" /><path d="M5 20c.8-3.4 3.1-5.1 7-5.1s6.2 1.7 7 5.1" /></>,
  products: <><path d="M4 8l8-4 8 4-8 4-8-4Z" /><path d="M4 8v8l8 4 8-4V8" /><path d="M12 12v8" /></>,
  inventory: <><rect x="3" y="4" width="18" height="6" rx="1.5" /><rect x="3" y="14" width="18" height="6" rx="1.5" /><path d="M7 7h.01M7 17h.01" /></>,
  // An oven with a tray (production).
  production: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18" /><rect x="7" y="12" width="10" height="4" rx="1" /><path d="M7 6.5h.01M10 6.5h.01" /></>,
  payments: <><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M3 10h18" /><path d="M7 14h4" /></>,
  deliveries: <><path d="M3 7h11v9H3z" /><path d="M14 10h4l3 3v3h-7" /><circle cx="7" cy="18" r="1.8" /><circle cx="17" cy="18" r="1.8" /></>,
  reports: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
  profile: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="10" r="3" /><path d="M6.5 18.5c1.2-2.5 3.1-3.7 5.5-3.7s4.3 1.2 5.5 3.7" /></>,
}

export function ModuleIcon({ name, className = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 24 24" className={`shrink-0 ${className}`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name] ?? PATHS.dashboard}
    </svg>
  )
}
