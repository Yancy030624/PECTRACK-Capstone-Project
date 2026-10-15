// When an order can be for (the adviser, 2026-10-16): today or a later day,
// between 5:00 AM and 10:00 PM inclusive, Asia/Manila time — for pickup,
// delivery and walk-in orders alike. src/lib/orderHours.js is the form's
// copy of the same rules; this one is the one that counts.
//
// An order either names the time it is needed (requestedFulfillmentTime),
// or it is for now. So:
// - a named time must not have passed, and must fall within the hours on
//   its own Manila day (22:00 exactly is allowed, 22:01 is not);
// - an order for now can only be placed within the hours. After 10:00 PM
//   today is closed, and before 5:00 AM the earliest time is 5:00 AM, so
//   either way the customer or cashier names a later time instead.
//
// Every comparison is made on the Manila wall clock, never on UTC: 7:00 AM
// in Manila is 23:00 the day before in UTC, and a UTC check would call it
// the wrong day.
export const openingTime = '05:00'
export const closingTime = '22:00'
const openingSeconds = 5 * 3600
const closingSeconds = 22 * 3600
// A time picked to the minute reaches the server a few seconds later.
const pastGraceMs = 60 * 1000

const manilaFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

// { day: 'YYYY-MM-DD', seconds: seconds since Manila midnight }.
export function manilaClock(date) {
  const parts = Object.fromEntries(manilaFormat.formatToParts(date).map((part) => [part.type, part.value]))
  return { day: `${parts.year}-${parts.month}-${parts.day}`, seconds: Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second) }
}

const withinHours = (seconds) => seconds >= openingSeconds && seconds <= closingSeconds

export const hoursMessage = 'Orders can be for 5:00 AM to 10:00 PM only.'

// Returns an error message, or null when the order may be placed.
// `requested` is a Date or null (an order for now); `now` is injectable so
// the rules can be tested at any hour.
export function checkOrderTime(requested, { now = new Date(), enforceNowHours = true } = {}) {
  if (requested == null) {
    if (!enforceNowHours) return null
    const { seconds } = manilaClock(now)
    if (seconds < openingSeconds) return 'We open for orders at 5:00 AM. Choose a time from 5:00 AM today.'
    if (seconds > closingSeconds) return 'Orders for today close at 10:00 PM. Choose a time on a later day.'
    return null
  }
  const today = manilaClock(now).day
  const wanted = manilaClock(requested)
  if (wanted.day < today) return 'Choose today or a later date.'
  if (requested.getTime() < now.getTime() - pastGraceMs) return 'That time has already passed. Choose a later time.'
  if (!withinHours(wanted.seconds)) return `${hoursMessage} Choose a time between 5:00 AM and 10:00 PM.`
  return null
}
