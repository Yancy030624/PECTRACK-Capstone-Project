// One loading primitive so loading states stop differing by area
// (UI_AUDIT.md M7 — the storefront already animates skeleton cards while
// the dashboard just renders the bare string "Loading…"; same app, two
// conventions). Use a Skeleton wherever the eventual layout is already
// known (a table row, a card) so the page doesn't jump when real content
// arrives; a spinner is still the right call for a genuinely
// indeterminate wait, but no screen is being converted to use either in
// this stage — this is the primitive for Stage 3+ to reach for.
export function Skeleton({ className = '' }) {
  return <div className={`animate-pulse rounded-control bg-line-100 ${className}`} />
}

// Three placeholder rows, the shape a table or card list will take once
// its request answers. The dashboard used a bare "Loading…" line while the
// storefront already used pulsing blocks; one primitive for both.
export function LoadingRows({ rows = 3, className = '' }) {
  return (
    <div role="status" aria-live="polite" aria-label="Loading" className={`space-y-2 ${className}`}>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center gap-3">
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  )
}
