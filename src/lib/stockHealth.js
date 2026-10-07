// One rule for "how is this product's stock doing", shared by the
// Dashboard tiles and the Inventory status filter, so the two can never
// disagree about what counts as low.
//
//   GOOD     comfortably stocked — more than twice the minimum level
//   OKAY     running low — above the minimum, at most twice it
//   LOW      needs attention — at or under the minimum (incl. sold out)
//   EXPIRED  needs attention — past its date with stock still on hand;
//            hidden from the menu and refused at checkout until handled
//
// LOW matches the server's own `lowStock` (stock_quantity <=
// min_stock_level, routes/inventory.js) exactly; OKAY is the early
// warning above it. A product with no minimum set (0) is GOOD while any
// stock is left.
export function stockStatus(item) {
  const stock = Number(item.stockQuantity)
  const minimum = Number(item.minStockLevel)
  if (item.expired && stock > 0) return 'EXPIRED'
  if (stock <= minimum) return 'LOW'
  if (minimum > 0 && stock <= minimum * 2) return 'OKAY'
  return 'GOOD'
}

export const STOCK_STATUSES = {
  GOOD: { label: 'Good', tone: 'good' },
  OKAY: { label: 'Running low', tone: 'okay' },
  LOW: { label: 'Low stock', tone: 'attention' },
  EXPIRED: { label: 'Expired', tone: 'attention' },
}

// The three indicator colours, by meaning. `neutral` is for a plain
// figure that is neither good nor bad (money collected today).
export const TONES = {
  good: { label: 'Good', short: 'Good', dot: 'bg-emerald-500', pill: 'bg-status-done-bg text-status-done-fg', edge: 'border-l-emerald-500', text: 'text-status-done-fg', soft: 'bg-emerald-50' },
  okay: { label: 'Okay', short: 'Okay', dot: 'bg-amber-400', pill: 'bg-status-wait-bg text-status-wait-fg', edge: 'border-l-amber-400', text: 'text-status-wait-fg', soft: 'bg-amber-50' },
  attention: { label: 'Needs attention', short: 'Attention', dot: 'bg-red-500', pill: 'bg-status-fail-bg text-status-fail-fg', edge: 'border-l-red-500', text: 'text-status-fail-fg', soft: 'bg-red-50' },
  neutral: { label: '', short: '', dot: 'bg-ink-400', pill: 'bg-status-idle-bg text-status-idle-fg', edge: 'border-l-line-200', text: 'text-ink-500', soft: 'bg-surface-sunk' },
}
