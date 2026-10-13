// Sending through the Gmail API (DEPLOY_PLAN.md, D5) — the HTTPS path used
// online, where hosts block SMTP. Google is never called: globalThis.fetch
// is replaced for the two Google endpoints only, the same way
// routes/payments.test.js stands in for PayMongo.
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { config } from '../config.js'
import { sendMail } from './mail.js'

const originalFetch = globalThis.fetch
const originalGmail = config.mail.gmail
const calls = []
globalThis.fetch = async (url, options) => {
  const href = String(url)
  if (href === 'https://oauth2.googleapis.com/token') {
    calls.push({ kind: 'token', body: Object.fromEntries(new URLSearchParams(String(options.body))) })
    return { ok: true, json: async () => ({ access_token: 'ya29.test-token', expires_in: 3600 }) }
  }
  if (href === 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send') {
    calls.push({ kind: 'send', authorization: options.headers.Authorization, raw: JSON.parse(options.body).raw })
    return { ok: true, json: async () => ({ id: 'msg-1' }) }
  }
  return originalFetch(url, options)
}
after(() => {
  globalThis.fetch = originalFetch
  config.mail.gmail = originalGmail
})

const decode = (raw) => Buffer.from(raw, 'base64url').toString('utf8')

test('with Gmail API settings, mail is sent over HTTPS as a well-formed UTF-8 message', async () => {
  config.mail.gmail = { clientId: 'client-id', clientSecret: 'client-secret', refreshToken: 'refresh-token' }
  const result = await sendMail({ to: 'customer@example.com', subject: 'Your code — PECTRACK', text: 'Hello Señora,\nyour code is 123456.' })
  assert.deepEqual(result, { delivered: true })

  const token = calls.find((call) => call.kind === 'token')
  assert.equal(token.body.grant_type, 'refresh_token')
  assert.equal(token.body.refresh_token, 'refresh-token')

  const send = calls.find((call) => call.kind === 'send')
  assert.equal(send.authorization, 'Bearer ya29.test-token')
  const message = decode(send.raw)
  const [headers, body] = message.split('\r\n\r\n')
  assert.match(headers, /^To: customer@example\.com$/m)
  assert.match(headers, /^Subject: =\?UTF-8\?B\?/m, 'a non-ASCII subject is RFC 2047 encoded')
  assert.equal(Buffer.from(headers.match(/^Subject: =\?UTF-8\?B\?(.+)\?=$/m)[1], 'base64').toString('utf8'), 'Your code — PECTRACK')
  assert.equal(Buffer.from(body.replace(/\r\n/g, ''), 'base64').toString('utf8'), 'Hello Señora,\nyour code is 123456.')
})

test('the access token is reused until it nears expiry, and a line break cannot add a header', async () => {
  calls.length = 0
  await sendMail({ to: 'a@example.com\r\nBcc: attacker@example.com', subject: 'Plain subject', text: 'x' })
  assert.equal(calls.filter((call) => call.kind === 'token').length, 0, 'the cached token is used')
  const headers = decode(calls.find((call) => call.kind === 'send').raw).split('\r\n\r\n')[0]
  assert.doesNotMatch(headers, /^Bcc:/m)
  assert.match(headers, /^Subject: Plain subject$/m)
})
