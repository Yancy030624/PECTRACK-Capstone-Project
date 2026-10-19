// /api/phone-verification — texted codes that prove a phone number
// (lib/phoneVerification.js, RULES-PLANS/RESERVE_SMS_PLAN.md).
import express from 'express'
import { config } from '../config.js'
import { pool } from '../db.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { PhoneVerificationError, checkPhoneCode, codeMinutes, startPhoneVerification } from '../lib/phoneVerification.js'
import { authLimiter, smsCodeLimiter } from '../lib/security.js'
import { normalizePhone } from '../lib/sms.js'

const router = express.Router()
const purposes = new Set(['REGISTER', 'RESERVE'])

// Whether sign-up and Reserve ask for a code right now (config.js).
router.get('/status', (_request, response) => response.json({ required: config.sms.verifyPhones }))

// A reservation's code is the cashier's to send; a sign-up's is public.
const staffForReserve = (request, response, next) => {
  if (request.body?.purpose !== 'RESERVE') return next()
  return requireAuth(request, response, () => requireRole('ADMIN', 'CASHIER')(request, response, next))
}

// POST /api/phone-verification/send { phone, purpose }
router.post('/send', smsCodeLimiter, staffForReserve, async (request, response) => {
  const purpose = String(request.body?.purpose ?? '')
  if (!purposes.has(purpose)) return response.status(422).json({ message: 'Unknown purpose.' })
  const phone = normalizePhone(request.body?.phone)
  if (!phone) return response.status(422).json({ message: 'Enter a Philippine mobile number, like 0917 123 4567.', errors: { contactNumber: 'Enter a Philippine mobile number, like 0917 123 4567.' } })

  // Do not spend a text on a number another account already has; sign-up
  // would refuse it anyway (lib/accounts.js findDuplicateAccount).
  if (purpose === 'REGISTER') {
    const taken = await pool.query(`SELECT 1 FROM customers WHERE RIGHT(regexp_replace(contact_num, '\\D', '', 'g'), 10) = RIGHT($1, 10) LIMIT 1`, [phone])
    if (taken.rowCount > 0) return response.status(409).json({ message: 'An account already uses this contact number.', errors: { contactNumber: 'An account already uses this contact number.' } })
  }

  try {
    const { verificationToken, sent } = await startPhoneVerification({ phone, purpose })
    return response.json({
      verificationToken,
      phone,
      minutes: codeMinutes,
      message: sent ? `We texted a code to ${phone}.` : `Code created for ${phone}. Texting is not set up here, so the code is in the server log.`,
    })
  } catch (error) {
    if (error instanceof PhoneVerificationError) return response.status(error.status).json({ message: error.message })
    console.error('Could not send a phone code:', error)
    return response.status(502).json({ message: 'The code could not be texted right now. Try again in a moment.' })
  }
})

// POST /api/phone-verification/check { verificationToken, code }
router.post('/check', authLimiter, async (request, response) => {
  const verificationToken = String(request.body?.verificationToken ?? '')
  if (!verificationToken) return response.status(400).json({ message: 'Send a code first.' })
  try {
    const { phone } = await checkPhoneCode({ verificationToken, code: request.body?.code })
    return response.json({ verified: true, phone })
  } catch (error) {
    if (error instanceof PhoneVerificationError) return response.status(error.status).json({ message: error.message, errors: { code: error.message } })
    throw error
  }
})

export default router
