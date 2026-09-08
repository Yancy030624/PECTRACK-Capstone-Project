// A single container shape — radius-panel + a subtle shadow — so panels
// stop drawing from the four border-radii and six shadow levels
// UI_AUDIT.md found in use app-wide with no strategy behind them (H4, M5).
export function Card({ className = '', children, ...props }) {
  return (
    <div className={`rounded-panel border border-line-200 bg-surface shadow-raised ${className}`} {...props}>
      {children}
    </div>
  )
}
