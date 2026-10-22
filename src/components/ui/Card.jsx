// A single container shape — radius-panel + a subtle shadow — so panels
// stop drawing from the four border-radii and six shadow levels
// UI_AUDIT.md found in use app-wide with no strategy behind them (H4, M5).
export function Card({ className = '', children, ...props }) {
  return (
    // No outline (the adviser, 2026-10-23): a soft shadow sets the card
    // off the page instead.
    <div className={`rounded-panel bg-surface shadow-raised ${className}`} {...props}>
      {children}
    </div>
  )
}
