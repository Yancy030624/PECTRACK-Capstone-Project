import { useEffect, useRef, useState } from 'react'
// Table parts, not one monolithic component — each screen still decides
// its own columns and content, but stops re-deriving the wrapper, header,
// row, and cell styles that UI_AUDIT.md found duplicated across all 12
// tables in the app (M6: 75 <th> elements, zero with `scope`; no table
// had a caption naming it for a screen reader).
//
// `<Table caption="...">` renders that caption as `sr-only` — sighted
// users already see the page heading above the table, but a screen
// reader jumping directly into table navigation mode has nothing else
// that names what the table is.
// Keep every column available inside the local horizontal scroller.
// Accept existing priority props for compatibility; small screens must
// still be able to reach reporting, payment, and inventory information.
const PRIORITY_CLASSES = {
  md: 'table-cell',
  lg: 'table-cell',
  xl: 'table-cell',
}
const priorityClass = (priority) => (priority ? PRIORITY_CLASSES[priority] ?? '' : '')

// A table wider than the screen slides sideways (the user, 2026-10-24).
// When it does, a small "Slide sideways to see more" line shows under it,
// and a soft fade on the right edge hints there is more — until the end is
// reached.
export function Table({ caption, children, className = '', stickyFirstColumn = false }) {
  const scrollerRef = useRef(null)
  const [more, setMore] = useState(false)
  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return undefined
    const check = () => setMore(scroller.scrollWidth - scroller.clientWidth - scroller.scrollLeft > 4)
    check()
    scroller.addEventListener('scroll', check, { passive: true })
    const observer = new ResizeObserver(check)
    observer.observe(scroller)
    if (scroller.firstElementChild) observer.observe(scroller.firstElementChild)
    return () => {
      scroller.removeEventListener('scroll', check)
      observer.disconnect()
    }
  }, [])
  return (
    <div>
      <div className="relative">
        <div ref={scrollerRef} tabIndex={0} role="region" aria-label={caption ? `${caption}, scroll horizontally for more columns` : 'Table, scroll horizontally for more columns'} className="overflow-x-auto overscroll-x-contain rounded-panel bg-surface">
          <table className={`w-full text-left text-sm ${stickyFirstColumn ? 'md:[&_tr>:first-child:not([colspan])]:sticky md:[&_tr>:first-child:not([colspan])]:left-0 md:[&_tr>:first-child:not([colspan])]:z-10 md:[&_tr>:first-child:not([colspan])]:max-w-48 md:[&_tr>:first-child:not([colspan])]:break-words md:[&_tr>:first-child:not([colspan])]:bg-surface md:[&_tr.bg-brand-50>:first-child:not([colspan])]:bg-brand-50 md:[&_tr:hover>:first-child:not([colspan])]:bg-surface-sunk md:[&_tr>:first-child:not([colspan])]:shadow-[1px_0_0_var(--color-line-200)] print:[&_tr>:first-child]:static print:[&_tr>:first-child]:shadow-none' : ''} ${className}`}>
            {caption && <caption className="sr-only">{caption}</caption>}
            {children}
          </table>
        </div>
        {more && <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-8 rounded-r-panel bg-linear-to-l from-surface to-transparent print:hidden" />}
      </div>
      {more && <p className="mt-1.5 text-right text-[11px] font-medium text-ink-500 print:hidden">Slide sideways to see more →</p>}
    </div>
  )
}

export function Thead({ children }) {
  return <thead>{children}</thead>
}

// `scope="col"` is the fix for M6: without it, a screen reader reads a
// row as a bare list of values with no header association at all.
export function Th({ children, align = 'left', priority, className = '' }) {
  return (
    <th
      scope="col"
      className={`whitespace-nowrap border-b border-line-200 py-3 px-3 text-[10px] font-semibold uppercase tracking-wide text-ink-500 ${align === 'right' ? 'text-right' : 'text-left'} ${priorityClass(priority)} ${className}`}
    >
      {children}
    </th>
  )
}

export function Tbody({ children }) {
  return <tbody className="divide-y divide-line-100">{children}</tbody>
}

// Hover state lives on the row, not the cells, so a whole clickable row
// highlights as one object — see UI_AUDIT.md's Table styles: "Row hover
// surface-sunk; selected row brand-50".
export function Tr({ className = '', ...props }) {
  return <tr className={`hover:bg-surface-sunk ${className}`} {...props} />
}

// `numeric` right-aligns and applies tabular-nums, per the audit's
// specific complaint that peso columns currently left-align and don't
// line up ("Numeric and currency columns right-aligned with
// tabular-nums").
export function Td({ children, align = 'left', numeric = false, priority, className = '' }) {
  return (
    <td className={`py-3 px-3 text-sm text-ink-700 ${align === 'right' || numeric ? 'text-right tabular-nums' : 'text-left'} ${priorityClass(priority)} ${className}`}>
      {children}
    </td>
  )
}
