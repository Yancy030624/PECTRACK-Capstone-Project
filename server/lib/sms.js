// Outgoing SMS over Semaphore, a Philippine gateway
// (RULES-PLANS/RESERVE_SMS_PLAN.md). Two kinds of text: a sign-in-style
// code to prove a phone number, and the order number of a reservation,
// for a customer with no internet to open the emailed receipt.
//
// Unconfigured is a supported state, the same as lib/mail.js: with no
// SEMAPHORE_API_KEY nothing is sent, and outside production the text is
// printed to the server console so the flow can be tried on a developer
// machine. Under the test runner nothing is ever sent either; each text
// goes to `smsOutbox`, which the tests read.
import { config } from '../config.js'

export const smsOutbox = []

// A Philippine mobile number as Semaphore takes it, 09XXXXXXXXX, from
// "0917 123 4567", "+63 917 123 4567" or "639171234567". Anything else is
// null: a landline or a foreign number cannot receive these texts.
export function normalizePhone(raw) {
  const digits = String(raw ?? '').replace(/[^\d+]/g, '')
  let local = null
  if (/^09\d{9}$/.test(digits)) local = digits
  else if (/^\+?639\d{9}$/.test(digits)) local = `0${digits.replace(/^\+?63/, '')}`
  return local
}

// `priority` uses Semaphore's priority route — codes must arrive in
// seconds, not wait behind a bulk queue. It costs 2 credits a text.
// Returns whether a text really went out. Throws on a gateway error; the
// callers decide whether that matters.
export async function sendSms({ to, message, priority = false }) {
  if (process.env.NODE_TEST_CONTEXT) {
    smsOutbox.push({ to, message, priority })
    return { sent: false }
  }
  if (!config.sms.apiKey) {
    if (!config.isProduction) console.log(`[sms] to ${to}: ${message}`)
    else console.warn('SMS is not set up (SEMAPHORE_API_KEY); a text was not sent.')
    return { sent: false }
  }
  const body = new URLSearchParams({ apikey: config.sms.apiKey, number: to, message })
  if (config.sms.senderName) body.set('sendername', config.sms.senderName)
  const reply = await fetch(`https://api.semaphore.co/api/v4/${priority ? 'priority' : 'messages'}`, { method: 'POST', body })
  if (!reply.ok) throw new Error(`Semaphore answered ${reply.status}: ${(await reply.text()).slice(0, 300)}`)
  return { sent: true }
}
