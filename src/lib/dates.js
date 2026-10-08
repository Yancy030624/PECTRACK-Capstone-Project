// The bakery's calendar day. Every date the system reasons about — today's
// orders, a report's range, what is due — is a day in Asia/Manila, the
// same zone the server's reports use (server/lib/reporting.js). Computed
// with Intl so the viewer's own clock zone never shifts the day.
const manilaDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' })

// 'YYYY-MM-DD' for an instant (default now), on the Manila calendar.
export const manilaDate = (instant = new Date()) => manilaDay.format(instant)

// 'YYYY-MM-DD' a number of days from today (negative for the past).
export const manilaDateFromToday = (days) => manilaDate(new Date(Date.now() + days * 86400000))
