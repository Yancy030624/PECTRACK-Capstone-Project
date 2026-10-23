// One rule for "how is this product's stock doing", shared by the
// Dashboard tiles and the Inventory status filter, so the two can never
// disagree about what counts as low.
//
//   GOOD     above the minimum level
//   LOW      needs attention — at or under the minimum (incl. sold out)
//
// There is no "Running low" (OKAY) step any more (the adviser,
// 2026-10-23): Low stock is enough to draw attention.
//
// There is no "expired" status: the bakery does not track expiry
// (CLIENT_REVISIONS_PLAN.md, R3).
//
// LOW matches the server's own `lowStock` (stock_quantity <=
// min_stock_level, routes/inventory.js) exactly. A product with no
// minimum set (0) is GOOD while any stock is left.
//
// Soft breads (RULES-PLANS/DAILY_STOCK_PLAN.md) are never restocked during
// the day, so for them "low" is not "go restock" but "selling out today":
//   SOLD_OUT     soft bread at 0 — off sale until the 5:00 AM top-up
//   SELLING_OUT  soft bread under a fifth of its daily standard
// A hard bread (and an ingredient, which has no stockType) keeps the
// minimum rule: LOW means "produce".
export function stockStatus(item) {
  const stock = Number(item.stockQuantity)
  if (item.stockType === 'SOFT' && Number(item.standardStock) > 0) {
    if (stock <= 0) return 'SOLD_OUT'
    if (stock < Number(item.standardStock) / 5) return 'SELLING_OUT'
    return 'GOOD'
  }
  const minimum = Number(item.minStockLevel)
  if (stock <= minimum) return 'LOW'
  return 'GOOD'
}

// The statuses that need someone's eye: the "Low stock" filter and tile.
export const needsAttention = (status) => status === 'LOW' || status === 'SELLING_OUT' || status === 'SOLD_OUT'

export const STOCK_STATUSES = {
  GOOD: { label: 'Good', tone: 'good' },
  LOW: { label: 'Low stock', tone: 'attention' },
  SELLING_OUT: { label: 'Selling out', tone: 'okay' },
  SOLD_OUT: { label: 'Sold out today', tone: 'attention' },
}

// The three indicator colours, by meaning. `neutral` is for a plain
// figure that is neither good nor bad (money collected today).
export const TONES = {
  good: { label: 'Good', short: 'Good', dot: 'bg-emerald-500', pill: 'bg-status-done-bg text-status-done-fg', edge: 'border-l-emerald-500', text: 'text-status-done-fg', soft: 'bg-emerald-50' },
  okay: { label: 'Okay', short: 'Okay', dot: 'bg-amber-400', pill: 'bg-status-wait-bg text-status-wait-fg', edge: 'border-l-amber-400', text: 'text-status-wait-fg', soft: 'bg-amber-50' },
  attention: { label: 'Needs attention', short: 'Attention', dot: 'bg-red-500', pill: 'bg-status-fail-bg text-status-fail-fg', edge: 'border-l-red-500', text: 'text-status-fail-fg', soft: 'bg-red-50' },
  neutral: { label: '', short: '', dot: 'bg-ink-400', pill: 'bg-status-idle-bg text-status-idle-fg', edge: 'border-l-line-200', text: 'text-ink-500', soft: 'bg-surface-sunk' },
}
