// How an order is named on screen (CLIENT_REVISIONS_PLAN.md, R4): its daily
// number — #1, #2… starting again each Asia/Manila day — with the day added
// whenever it is not today. The internal id is never shown; it stays the
// key for every request. server/lib/orderNumber.js is the server version.
//
// Takes anything carrying `orderNumber` and `orderDay` ('YYYY-MM-DD'): an
// order, a delivery, a payment, a production slot entry.
const manilaToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date())
const dayFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

export const formatOrderDay = (day) => dayFormat.format(new Date(`${day}T00:00:00Z`))

// "#7" today, "#7 · Oct 15" on any other day. `withDay` forces the day,
// for a receipt or anything read later; `numberOnly` leaves it out, for a
// row that already shows the date beside it.
export function orderLabel(item, { withDay = false, numberOnly = false } = {}) {
  if (!item || item.orderNumber == null) return '#—'
  const number = `#${item.orderNumber}`
  if (numberOnly) return number
  return withDay || item.orderDay !== manilaToday() ? `${number} · ${formatOrderDay(item.orderDay)}` : number
}

// Order search: "7" or "#7" matches order #7 of any day; anything else is
// matched against the label with its day ("oct 15", "#7 · oct 15").
export function matchesOrderSearch(item, term) {
  const number = /^#?(\d+)$/.exec(term)
  if (number) return item.orderNumber === Number(number[1])
  return orderLabel(item, { withDay: true }).toLowerCase().includes(term)
}
