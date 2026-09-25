// Outgoing email. Two callers, both in routes/auth.js — the
// password-reset link and the admin sign-in code — so this stays a
// couple of small functions over nodemailer rather than a templating
// layer.
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

// The admin second factor (RULES-PLANS/SECURITY_REVIEW.md item 5).
// Phrased so the message itself is a security control: an admin who did
// not just try to sign in learns from this email that someone else has
// their password, and is told what to do about it. The code is the only
// secret here and it appears exactly once — never in a subject line,
// which mail clients show in notifications and previews.
export async function sendOtpEmail({ to, code, minutes }) {
  return sendMail({
    to,
    subject: 'Your PECTRACK sign-in code',
    text: [
      'Someone signed in to PECTRACK with your admin password and needs a code to finish.',
      '',
      `Your code is ${code}. It expires in ${minutes} minutes and can be used once.`,
      '',
      'If this was not you, your password is no longer private — change it as soon as you can.',
    ].join('\n'),
  })
}

// Customer email verification (migration 016). A link rather than a
// code: the customer clicks once in their inbox instead of copying six
// digits between tabs. It carries the token in the URL fragment, for the
// same reason the password-reset link does.
export async function sendVerificationEmail({ to, name, url, hours }) {
  return sendMail({
    to,
    subject: 'Confirm your email for PECTRACK',
    text: [
      `Hello ${name},`,
      '',
      "Thanks for creating a PECTRACK account at Pecto's Bakery. Confirm this is your email by opening the link below:",
      '',
      url,
      '',
      `The link works once and expires in ${hours} hours. You need a confirmed email to place an order.`,
      '',
      'If you did not create this account, you can ignore this email.',
    ].join('\n'),
  })
}

// Sent to the PREVIOUS address after an email change. It is the one
// warning that reaches the real owner if someone else made the change:
// after it, sign-in codes and reset links go to the new address, so the
// old one will hear nothing further.
export async function sendEmailChangedNotice({ to, name, newEmail }) {
  return sendMail({
    to,
    subject: 'Your PECTRACK email address was changed',
    text: [
      `Hello ${name},`,
      '',
      `The email address on your PECTRACK account was just changed to ${newEmail}.`,
      '',
      'If you made this change, there is nothing to do.',
      '',
      "If you did NOT, someone has access to your account. Contact Pecto's Bakery at (042) 540-4366 so an administrator can secure it.",
    ].join('\n'),
  })
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
