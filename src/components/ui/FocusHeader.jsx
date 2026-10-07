// The heading of a focused view — a module opened from a Dashboard tile to
// show just the problem the tile counted (deliveries waiting for a driver,
// orders with money still owed), not the whole module. Says what the list
// is, how many, and offers the two ways out: back to the Dashboard, or the
// full module.
export function FocusHeader({ title, description, count, tone = 'attention', onBack, onShowAll, showAllLabel }) {
  const dot = { attention: 'bg-red-500', okay: 'bg-amber-400', good: 'bg-emerald-500' }[tone]
  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        {onBack && <button type="button" onClick={onBack} className="font-semibold text-brand-700 hover:underline">← Dashboard</button>}
        {onShowAll && <button type="button" onClick={onShowAll} className="text-ink-500 hover:text-ink-900 hover:underline">{showAllLabel}</button>}
      </div>
      <h1 className="mt-3 flex items-center gap-2.5 text-2xl font-semibold text-ink-900">
        <span className={`h-3 w-3 rounded-full ${dot}`} aria-hidden="true" />
        {title}
        {count != null && <span className="rounded-full bg-surface-sunk px-2.5 py-0.5 text-base font-semibold text-ink-700 tabular-nums">{count}</span>}
      </h1>
      {description && <p className="mt-2 text-sm text-ink-500">{description}</p>}
    </div>
  )
}
