// One-time: lets PECTRACK send email through the Gmail API as the bakery's
// Gmail account (DEPLOY_PLAN.md, D5). Hosts like Railway block SMTP, so
// online the server sends over HTTPS with a refresh token instead.
//
// Before running, put the OAuth client from Google Cloud in .env:
//   GMAIL_CLIENT_ID=...apps.googleusercontent.com
//   GMAIL_CLIENT_SECRET=...
// Then:
//   npm run gmail:auth
// Open the printed link, sign in with the Gmail account that should send the
// emails, and allow "Send email on your behalf". The script prints the
// refresh token: put it in .env (and the host's settings) as
// GMAIL_REFRESH_TOKEN. Treat it like a password.
//
// Uses Google's loopback flow for desktop apps (a temporary server on
// 127.0.0.1 receives the answer) with PKCE. Only the gmail.send scope is
// asked for: the token can send mail, not read it.
import 'dotenv/config'
import crypto from 'node:crypto'
import http from 'node:http'

const clientId = process.env.GMAIL_CLIENT_ID
const clientSecret = process.env.GMAIL_CLIENT_SECRET
if (!clientId || !clientSecret) {
  console.error('Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in .env first (see DEPLOY_PLAN.md, Step 1).')
  process.exit(1)
}

const verifier = crypto.randomBytes(48).toString('base64url')
const challenge = crypto.createHash('sha256').update(verifier).digest('base64url')
const state = crypto.randomBytes(16).toString('hex')

const server = http.createServer()
server.listen(0, '127.0.0.1', () => {
  const redirectUri = `http://127.0.0.1:${server.address().port}`
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/gmail.send',
    access_type: 'offline',
    prompt: 'consent',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  }).toString()
  console.log('\nOpen this link in your browser and sign in with the Gmail account that sends PECTRACK emails:\n')
  console.log(url.toString())
  console.log('\nWaiting for Google…')

  server.on('request', async (request, response) => {
    const query = new URL(request.url, redirectUri).searchParams
    if (!query.get('code') && !query.get('error')) {
      response.writeHead(404).end()
      return
    }
    if (query.get('state') !== state || query.get('error')) {
      response.writeHead(400, { 'Content-Type': 'text/plain' }).end('Sign-in was cancelled or did not match. Run the script again.')
      console.error(`\nStopped: ${query.get('error') ?? 'state mismatch'}`)
      server.close()
      process.exitCode = 1
      return
    }
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code: query.get('code'), code_verifier: verifier, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
    })
    const tokens = await tokenResponse.json().catch(() => ({}))
    if (!tokens.refresh_token) {
      response.writeHead(500, { 'Content-Type': 'text/plain' }).end('Google did not return a refresh token. See the terminal.')
      console.error('\nNo refresh token returned:', tokens.error_description ?? tokens.error ?? tokenResponse.status)
      server.close()
      process.exitCode = 1
      return
    }
    response.writeHead(200, { 'Content-Type': 'text/plain' }).end('Done. You can close this tab and go back to the terminal.')
    console.log('\nAdd this line to .env (and to the host\'s environment settings). Keep it secret:\n')
    console.log(`GMAIL_REFRESH_TOKEN=${tokens.refresh_token}\n`)
    server.close()
  })
})
