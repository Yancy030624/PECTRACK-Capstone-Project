// When an order can be for, on the order forms (the adviser, 2026-10-16):
// today or a later day, Asia/Manila. A pickup or delivery time is 6:00 AM
// to 10:00 PM inclusive (the user, 2026-10-29: the hour after the 5:00 AM
// bake is for the breads to cool); a walk-in for now is served from
// 5:00 AM. server/lib/orderHours.js holds the same rules and is the one
// that counts; these only keep the pickers from offering what the server
// would refuse.
//
// Dates and times are handled as Manila wall-clock strings ('YYYY-MM-DD',
// 'HH:mm') and sent with an explicit +08:00, so a browser set to another
// time zone still sends the time the person picked.
export const openingTime = '05:00'
export const readyTime = '06:00'
export const closingTime = '22:00'
export const maxLeadDays = 30

const manilaFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

// The Manila date and time right now.
export function manilaNow(now = new Date()) {
  const parts = Object.fromEntries(manilaFormat.formatToParts(now).map((part) => [part.type, part.value]))
  return { day: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` }
}

const addDays = (day, count) => {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + count)
  return date.toISOString().slice(0, 10)
}

// 'HH:mm' one minute later, so "now" is never offered as already past.
const nextMinute = (time) => {
  const [hours, minutes] = time.split(':').map(Number)
  const total = hours * 60 + minutes + 1
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

// Today is still open for a named time until 10:00 PM.
const todayOpen = (now) => manilaNow(now).time < closingTime

// The date picker's bounds: today (tomorrow once 10:00 PM has passed) to
// 30 days ahead.
export function dateLimits(now = new Date()) {
  const { day } = manilaNow(now)
  return { min: todayOpen(now) ? day : addDays(day, 1), max: addDays(day, maxLeadDays) }
}

// The time picker's bounds for a chosen day: 6:00 AM to 10:00 PM, and not
// earlier than the next minute when the day is today.
export function timeLimits(day, now = new Date()) {
  const current = manilaNow(now)
  const earliest = day === current.day && nextMinute(current.time) > readyTime ? nextMinute(current.time) : readyTime
  return { min: earliest, max: closingTime }
}

// The times the picker offers for a chosen day (the seniors, 2026-10-24):
// every 30 minutes from 6:00 AM to 10:00 PM, and only those still ahead
// when the day is today. A time outside the hours is never listed, the
// way the date picker never offers a day outside its range.
export const slotMinutes = 30
export function timeSlots(day, now = new Date()) {
  if (!day) return []
  const { min, max } = timeLimits(day, now)
  const toMinutes = (time) => { const [hours, minutes] = time.split(':').map(Number); return hours * 60 + minutes }
  const slots = []
  for (let total = toMinutes(readyTime); total <= toMinutes(max); total += slotMinutes) {
    const value = `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
    if (value < min) continue
    const hours = Math.floor(total / 60)
    const label = `${hours % 12 === 0 ? 12 : hours % 12}:${String(total % 60).padStart(2, '0')} ${hours < 12 ? 'AM' : 'PM'}`
    slots.push({ value, label })
  }
  return slots
}

// What the server is sent for a picked date and time.
export const toRequestedTime = (day, time) => `${day}T${time}:00+08:00`

// An error to show before sending, or null. Both blank means "for now",
// which is only taken within the hours: from 6:00 AM online, from 5:00 AM
// for a walk-in at the counter.
export function checkPicked(day, time, now = new Date(), { walkIn = false } = {}) {
  if (!day && !time) {
    const { time: current } = manilaNow(now)
    if (walkIn && current < openingTime) return 'We open for orders at 5:00 AM. Choose a time from 6:00 AM today.'
    if (!walkIn && current < readyTime) return 'Pickup and delivery start at 6:00 AM, once the morning breads have cooled. Choose a time from 6:00 AM today.'
    if (current > closingTime) return 'Orders for today close at 10:00 PM. Choose a date and time on a later day.'
    return null
  }
  if (!day) return 'Choose a date.'
  if (!time) return 'Choose a time.'
  const dates = dateLimits(now)
  if (day < dates.min) return 'Choose today or a later date.'
  if (day > dates.max) return `Orders can be placed up to ${maxLeadDays} days ahead.`
  if (time < readyTime || time > closingTime) return 'Pickup and delivery times are 6:00 AM to 10:00 PM only. Choose a time between 6:00 AM and 10:00 PM.'
  if (time < timeLimits(day, now).min) return 'That time has already passed. Choose a later time.'
  return null
}

// Whether an order "for now" can be placed at this moment.
export const openForNow = (now = new Date()) => checkPicked('', '', now) == null
