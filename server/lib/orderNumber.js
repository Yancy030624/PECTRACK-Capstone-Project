// How an order is named to people (CLIENT_REVISIONS_PLAN.md, R4): its
// daily number, which starts again at #1 each Asia/Manila day, plus the day
// where the day is not obvious. order_id stays the key in the database and
// the API; it is never shown. src/lib/orderNumber.js is the screen version.
//
// `day` is the orders.order_day DATE, which db.js returns as 'YYYY-MM-DD'.
const dayFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

export const formatOrderDay = (day) => dayFormat.format(new Date(`${day}T00:00:00Z`))

// "#7 (Oct 15)" — for messages and the PayMongo description, read outside
// the day the order was placed.
export const orderLabel = (number, day) => `#${number} (${formatOrderDay(day)})`
