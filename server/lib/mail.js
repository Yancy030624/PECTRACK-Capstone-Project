// Outgoing email. One caller today — the password-reset link in
// routes/auth.js — so this stays a single function over nodemailer rather
// than a templating layer.
//
// Unconfigured is a supported state, not an error: with no SMTP_HOST the
// message is written to the server console (outside production), the same
// way the admin OTP code used to be readable there before an SMS gateway
// existed. That keeps the reset flow testable on a developer machine, and
// keeps the route's own behaviour identical either way — it never learns
// whether the email really went anywhere, which is also what stops the
// response from leaking whether an address is on file.
import nodemailer from 'nodemailer'
import { config } from '../config.js'

let transporter = null

function getTransporter() {
  if (!config.mail.host) return null
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.mail.host,
      port: config.mail.port,
      // 465 is implicit TLS; anything else (587, 25) negotiates STARTTLS.
      secure: config.mail.port === 465,
      auth: config.mail.user ? { user: config.mail.user, pass: config.mail.password } : undefined,
    })
  }
  return transporter
}

export async function sendMail({ to, subject, text }) {
  const transport = getTransporter()
  if (!transport) {
    if (!config.isProduction) console.log(`[mail not configured] To: ${to}\nSubject: ${subject}\n\n${text}`)
    return { delivered: false }
  }
  await transport.sendMail({ from: config.mail.from, to, subject, text })
  return { delivered: true }
}
