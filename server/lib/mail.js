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

// ---------------------------------------------------------------------------
// Gmail API over HTTPS (DEPLOY_PLAN.md, D5). Railway and Render block SMTP
// on their free and cheap plans, so online the same Gmail account sends
// through Google's HTTPS API instead: exchange the refresh token for a
// short-lived access token, then post the message. No new dependency.
// ---------------------------------------------------------------------------
let gmailAccessToken = null
let gmailAccessTokenExpiresAt = 0
const gmailTimeoutMs = 15000

async function getGmailAccessToken() {
  if (gmailAccessToken && Date.now() < gmailAccessTokenExpiresAt - 60000) return gmailAccessToken
  const { clientId, clientSecret, refreshToken } = config.mail.gmail
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    signal: AbortSignal.timeout(gmailTimeoutMs),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
  })
  const body = await response.json().catch(() => null)
  if (!response.ok || !body?.access_token) throw new Error(`Gmail token request failed (${response.status}): ${body?.error ?? 'no body'}`)
  gmailAccessToken = body.access_token
  gmailAccessTokenExpiresAt = Date.now() + (body.expires_in ?? 3600) * 1000
  return gmailAccessToken
}

// Header values come from this server (addresses on file, fixed subjects),
// but a stray line break would still let one header become two, so they
// are stripped. Non-ASCII subjects (an em dash) are RFC 2047 encoded; the
// body is base64, so any UTF-8 text survives.
const headerSafe = (value) => String(value).replace(/[\r\n]+/g, ' ')
const encodeHeader = (value) => (/^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`)

async function sendViaGmailApi({ to, subject, text }) {
  const message = [
    `From: ${headerSafe(config.mail.from)}`,
    `To: ${headerSafe(to)}`,
    `Subject: ${encodeHeader(headerSafe(subject))}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(text, 'utf8').toString('base64').replace(/.{76}/g, '$&\r\n'),
  ].join('\r\n')
  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    signal: AbortSignal.timeout(gmailTimeoutMs),
    headers: { Authorization: `Bearer ${await getGmailAccessToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: Buffer.from(message, 'utf8').toString('base64url') }),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(`Gmail send failed (${response.status}): ${body?.error?.message ?? 'no body'}`)
  }
}

export async function sendMail({ to, subject, text }) {
  if (config.mail.gmail) {
    await sendViaGmailApi({ to, subject, text })
    return { delivered: true }
  }
  const transport = getTransporter()
  if (!transport) {
    if (!config.isProduction) console.log(`[mail not configured] To: ${to}\nSubject: ${subject}\n\n${text}`)
    return { delivered: false }
  }
  await transport.sendMail({ from: config.mail.from, to, subject, text })
  return { delivered: true }
}
