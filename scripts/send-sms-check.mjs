// Sends one text through whichever SMS provider .env sets up (lib/sms.js),
// to check textbee (or Semaphore) end to end before relying on it:
//
//   node scripts/send-sms-check.mjs 09171234567
//
// The phone number is the one to receive the check text — your own.
import { config } from '../server/config.js'
import { normalizePhone, sendSms } from '../server/lib/sms.js'

const phone = normalizePhone(process.argv[2])
if (!phone) {
  console.error('Give a Philippine mobile number, like: node scripts/send-sms-check.mjs 09171234567')
  process.exit(1)
}
console.log(`Provider: ${config.sms.provider ?? 'none (the text is only printed below)'}`)
try {
  const { sent } = await sendSms({ to: phone, message: `PECTRACK: SMS is working. Sent ${new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}.` })
  console.log(sent ? `Sent to ${phone}. It should arrive within a minute.` : 'Not sent: no provider is set up in .env.')
} catch (error) {
  console.error('The provider refused the text:', error.message)
  process.exit(1)
}
