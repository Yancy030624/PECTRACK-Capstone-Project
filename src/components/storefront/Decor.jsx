// Small drawn pieces that make the storefront read as a bakery rather than
// an app: a scalloped edge like a cake doily, a wheat sprig, and line icons
// for the services. Plain inline SVG, coloured with currentColor, so each
// takes its colour from the section it sits in.

// A scalloped edge between two sections. `fill` is the colour of the
// section BELOW; place it at the bottom of the section above.
export function ScallopEdge({ className = 'text-cream-100', flip = false }) {
  return (
    <svg viewBox="0 0 1200 24" preserveAspectRatio="none" aria-hidden="true" className={`block h-4 w-full sm:h-6 ${flip ? 'rotate-180' : ''} ${className}`}>
      <path
        fill="currentColor"
        d={`M0 24 ${Array.from({ length: 40 }, (_, index) => `Q${index * 30 + 15} 0 ${index * 30 + 30} 24`).join(' ')} Z`}
      />
    </svg>
  )
}

export function WheatSprig({ className = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M12 22V8" />
      <path d="M12 8c0-2.5 1.5-4.5 3.5-5.5C15.5 5 14 7 12 8Z" />
      <path d="M12 8c0-2.5-1.5-4.5-3.5-5.5C8.5 5 10 7 12 8Z" />
      <path d="M12 13c0-2.2 1.6-4 3.8-4.6-.2 2.3-1.6 4-3.8 4.6Z" />
      <path d="M12 13c0-2.2-1.6-4-3.8-4.6.2 2.3 1.6 4 3.8 4.6Z" />
      <path d="M12 18c0-2.2 1.6-4 3.8-4.6-.2 2.3-1.6 4-3.8 4.6Z" />
      <path d="M12 18c0-2.2-1.6-4-3.8-4.6.2 2.3 1.6 4 3.8 4.6Z" />
    </svg>
  )
}

// A small label above a section heading: wheat sprig + uppercase text.
export function Eyebrow({ children, className = 'text-crust-600' }) {
  return (
    <p className={`flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.18em] ${className}`}>
      <WheatSprig className="h-4 w-4" />
      {children}
    </p>
  )
}

const icons = {
  pickup: <><path d="M4 10h16l-1.2 9.2a2 2 0 0 1-2 1.8H7.2a2 2 0 0 1-2-1.8L4 10Z" /><path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10" /></>,
  delivery: <><path d="M3 7h11v9H3z" /><path d="M14 10h4l3 3v3h-7z" /><circle cx="7" cy="17.5" r="1.8" /><circle cx="17.5" cy="17.5" r="1.8" /></>,
  bulk: <><path d="M5 9h14v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V9Z" /><path d="M3 6h18v3H3z" /><path d="M12 6v15" /><path d="M12 6c-1.5-3-5-3-5-1s3 1 5 1Zm0 0c1.5-3 5-3 5-1s-3 1-5 1Z" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  oven: <><rect x="3.5" y="4" width="17" height="16" rx="2" /><path d="M3.5 9h17" /><rect x="7" y="12" width="10" height="5" rx="1" /><path d="M7 6.5h.01M10 6.5h.01" /></>,
  pin: <><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" /><circle cx="12" cy="10" r="2.4" /></>,
  heart: <path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.1a4.3 4.3 0 0 1 7.5 2.7C19.5 15.4 12 20 12 20Z" />,
  tag: <><path d="M3.5 12.6V4.5a1 1 0 0 1 1-1h8.1l7.9 7.9a1.4 1.4 0 0 1 0 2l-6.1 6.1a1.4 1.4 0 0 1-2 0Z" /><circle cx="8.3" cy="8.3" r="1.6" /></>,
  phone: <path d="M5 4h3.5l1.5 4.5-2 1.3a11 11 0 0 0 6.2 6.2l1.3-2L20 15.5V19a1.5 1.5 0 0 1-1.6 1.5A16 16 0 0 1 3.5 5.6 1.5 1.5 0 0 1 5 4Z" />,
}

export function LineIcon({ name, className = 'h-6 w-6' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      {icons[name]}
    </svg>
  )
}
