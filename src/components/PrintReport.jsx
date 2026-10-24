import { formatDateTime } from '../lib/format.js'

// Reports as PDF — PHASE10_PAPER_ALIGNMENT_PLAN.md, B3. The paper promises
// PDF export for the admin, cashier and delivery reports (p.16, p.41, p.43).
//
// The browser makes the PDF: "Print / Save as PDF" opens the print dialog,
// where every current browser offers Save as PDF. No PDF library, nothing
// server-side, and the charts come out exactly as they look on screen —
// a generated PDF would have had to redraw them. What this file adds is
// what a printout needs and a screen does not: a heading that says whose
// report it is, for what dates, printed by whom and when. The shell's
// navigation and every control are hidden by `print:hidden` classes.

// `onPrint` runs before the dialog opens: the export history
// (lib/exportLog.js) records the print.
export function PrintButton({ label = 'Print / Save as PDF', onPrint }) {
  return (
    <button
      type="button"
      onClick={() => { onPrint?.(); window.print() }}
      className="inline-flex h-8 items-center gap-1.5 rounded-control border border-line-200 bg-surface px-3 text-xs font-medium text-ink-700 transition hover:bg-surface-sunk print:hidden"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M7 9V3h10v6" />
        <rect x="3" y="9" width="18" height="8" rx="2" />
        <path d="M7 14h10v7H7z" />
      </svg>
      {label}
    </button>
  )
}

// Invisible on screen; the first thing on the printed page.
export function PrintHeader({ title, subtitle, user }) {
  return (
    <div className="mb-4 hidden border-b border-ink-900 pb-3 print:block">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-700">PECTRACK · Pecto&apos;s Bakery, Lucban, Quezon</p>
      <h1 className="mt-1 text-xl font-semibold text-ink-900">{title}</h1>
      {subtitle && <p className="text-sm text-ink-700">{subtitle}</p>}
      <p className="mt-1 text-xs text-ink-500">Printed {formatDateTime(new Date())}{user ? ` by ${user.name} (${user.role})` : ''}. Generated from recorded data; not editable.</p>
    </div>
  )
}

// Print only one part of the page — the receipt, which on a phone sits in
// a pop-up over the page. The button marks <body>; index.css then shows
// only the element with class "print-only-target" (and what is inside it)
// for that print, and the mark is removed afterwards.
export function PrintThisButton({ label = 'Print / Save as PDF', onPrint }) {
  const printThis = () => {
    onPrint?.()
    document.body.classList.add('printing-one')
    const done = () => {
      document.body.classList.remove('printing-one')
      window.removeEventListener('afterprint', done)
    }
    window.addEventListener('afterprint', done)
    window.print()
  }
  return (
    <button
      type="button"
      onClick={printThis}
      className="inline-flex h-8 items-center gap-1.5 rounded-control border border-line-200 bg-surface px-3 text-xs font-medium text-ink-700 transition hover:bg-surface-sunk print:hidden"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M7 9V3h10v6" />
        <rect x="3" y="9" width="18" height="8" rx="2" />
        <path d="M7 14h10v7H7z" />
      </svg>
      {label}
    </button>
  )
}
