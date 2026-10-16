// How an order is named on screen. The adviser (2026-10-16) brought back
// the order's own permanent id as its number ("#21170"): unique for good,
// so it never needs a date beside it to tell two orders apart. The daily
// number of CLIENT_REVISIONS_PLAN.md R4 is still kept in the database but
// no longer shown. server/lib/orderNumber.js is the server version.
//
// Takes anything carrying `orderNumber` (the server sends the order id
// there): an order, a delivery, a payment, a production slot entry.
const dayFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

export const formatOrderDay = (day) => dayFormat.format(new Date(`${day}T00:00:00Z`))

// "#21170". The options of the daily-number days (withDay, numberOnly) are
// still accepted from older call sites and change nothing: a permanent
// number needs no day.
export function orderLabel(item) {
  if (!item || item.orderNumber == null) return '#—'
  return `#${item.orderNumber}`
}

// Order search: "21170" or "#21170" matches that order; a partial number
// ("211") matches every order whose number contains it.
export function matchesOrderSearch(item, term) {
  const digits = /^#?(\d+)$/.exec(term)
  if (!digits) return false
  return String(item.orderNumber ?? '').includes(digits[1])
}
