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
