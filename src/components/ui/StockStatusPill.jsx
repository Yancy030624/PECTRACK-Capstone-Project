import { STOCK_STATUSES, TONES } from '../../lib/stockHealth.js'

// A product's stock status as a coloured pill (lib/stockHealth.js).
export function StockStatusPill({ status }) {
  const { label, tone } = STOCK_STATUSES[status]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${TONES[tone].pill}`}>
      <span className={`h-2 w-2 rounded-full ${TONES[tone].dot}`} aria-hidden="true" />
      {label}
    </span>
  )
}
