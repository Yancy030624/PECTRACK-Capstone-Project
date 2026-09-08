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
export function Table({ caption, children, className = '' }) {
  return (
    <div className="overflow-x-auto rounded-panel border border-line-200 bg-surface">
      <table className={`w-full text-left text-sm ${className}`}>
        {caption && <caption className="sr-only">{caption}</caption>}
        {children}
      </table>
    </div>
  )
}

export function Thead({ children }) {
  return <thead>{children}</thead>
}

// `scope="col"` is the fix for M6: without it, a screen reader reads a
// row as a bare list of values with no header association at all.
export function Th({ children, align = 'left', className = '' }) {
  return (
    <th
      scope="col"
      className={`border-b border-line-200 py-3 px-3 text-[10px] font-semibold uppercase tracking-wide text-ink-500 ${align === 'right' ? 'text-right' : 'text-left'} ${className}`}
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
export function Td({ children, align = 'left', numeric = false, className = '' }) {
  return (
    <td className={`py-3 px-3 text-sm text-ink-700 ${align === 'right' || numeric ? 'text-right tabular-nums' : 'text-left'} ${className}`}>
      {children}
    </td>
  )
}
