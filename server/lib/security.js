// Transport-level protections that sit in front of every route —
// RULES-PLANS/SECURITY_REVIEW.md, findings H (no rate limiting), K (no
// trust proxy) and N (no security headers).
//
// Hand-written rather than `helmet` + `express-rate-limit`, for two
// reasons. The header set below is five lines and every one of them has
// a reason this application can point at; helmet would set fifteen, most
// irrelevant here, and the paper would have to defend choices nobody
// made. And the limiter has to be explainable in a defence — a Map with
// a fixed window is something a panelist can read in thirty seconds.
//
// The limiter's honest limitation, which belongs in the paper: counters
// live in THIS process's memory. One server, one set of counts. Run two
// instances behind a load balancer and each keeps its own, so the
// effective limit doubles. Fixing that means a shared store (Redis),
// which is a deployment decision, not a code one.
import { config } from '../config.js'

// ---------------------------------------------------------------------------
// Security headers
// ---------------------------------------------------------------------------
// Five headers, each answering a finding in the review:
//
//   X-Content-Type-Options   Finding N.2 — /api/products/:id/image and the
//     proof-of-delivery download serve bytes an ordinary user uploaded.
//     The upload validates the MIME type, but without `nosniff` a browser
//     may still sniff a crafted file as HTML and run it ON THIS ORIGIN,
//     which is stored XSS with access to the session cookie. This is the
//     single most valuable header here.
//
//   X-Frame-Options          Finding N.1 — without it any site can iframe
//     the dashboard and overlay invisible buttons over real ones. A
//     cashier could be made to click Approve on a production batch or
//     Delete on a product. DENY, not SAMEORIGIN: nothing in this app
//     frames itself.
//
//   Referrer-Policy          Finding N.3 — the password-reset link carries
//     its token in the URL. Under the browser default, navigating away
//     from /reset-password can hand that token to a third-party host.
//     no-referrer sends nothing, ever.
//
//   Content-Security-Policy  Only frame-ancestors, deliberately. It is the
//     modern replacement for X-Frame-Options (both are sent: older
//     browsers read one, newer the other). A full CSP would have to
//     enumerate script and style sources for a Vite bundle that inlines
//     both, which is a maintenance burden for a page that loads no
//     third-party script at all — the marginal gain does not pay for it.
//     Recorded as optional item 10 in the review rather than pretended.
//
//   Strict-Transport-Security  Production only. Telling a browser "never
//     use plain HTTP for this host again" is close to irreversible for
//     the max-age duration, so sending it from a development server on
//     localhost would poison the developer's own browser for every other
//     localhost project. Two years, subdomains included, which is what
//     the HSTS preload list requires.
export function securityHeaders(_request, response, next) {
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('X-Frame-Options', 'DENY')
  response.setHeader('Referrer-Policy', 'no-referrer')
  response.setHeader('Content-Security-Policy', "frame-ancestors 'none'")
  if (config.isProduction) response.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains')
  next()
}

// ---------------------------------------------------------------------------
// HTTP -> HTTPS redirect
// ---------------------------------------------------------------------------
// The application's half of finding K. TLS itself is terminated by
// whatever hosts this; what the app owes is refusing to serve anything
// over plain HTTP once it is in production.
//
// `request.secure` is only trustworthy when app.js has set `trust proxy`
// — behind a load balancer the connection to Express really is plain
// HTTP, and only the X-Forwarded-Proto header says otherwise. That is
// why the two settings are introduced together.
//
// 308, not 302: it preserves the method and body, so a POST that arrives
// over HTTP is replayed as a POST. A 302 would silently turn it into a
// GET and the caller would see a confusing failure instead of a redirect.
export function httpsRedirect(request, response, next) {
  if (!config.isProduction || request.secure) return next()
  return response.redirect(308, `https://${request.headers.host}${request.originalUrl}`)
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------
// A fixed window per key. Each bucket records when its window opened and
// how many requests have landed in it; once the window has passed, the
// bucket resets rather than sliding. A fixed window can let through up to
// 2x the limit across a window boundary — accepted deliberately: the
// point here is to stop automated flooding, not to meter an API, and a
// sliding window costs a sorted structure per key for no gain at this
// scale.
const buckets = new Map()

// Without this the Map is an unbounded memory leak: every distinct IP
// that ever calls gets an entry and nothing removes it. Sweeping on a
// timer rather than on every request keeps the hot path O(1).
const sweepIntervalMs = 10 * 60 * 1000
setInterval(() => {
  const now = Date.now()
  for (const [key, bucket] of buckets) {
    if (now - bucket.openedAt > bucket.windowMs) buckets.delete(key)
  }
}, sweepIntervalMs).unref()

// Exported for the tests, which need a clean slate between cases.
export function resetRateLimits() {
  buckets.clear()
}

// `name` namespaces the counters so a limiter on /login and a limiter on
// /register never share a bucket for the same IP.
//
// The key is the client IP. That is the only identifier available before
// authentication, which is exactly where these limits matter, and it is
// why `trust proxy` has to be right: behind a proxy without it, every
// request looks like it came from the proxy and ALL users share one
// bucket.
export function rateLimit({ name, windowMs, max, message }) {
  return (request, response, next) => {
    const key = `${name}:${request.ip}`
    const now = Date.now()
    const bucket = buckets.get(key)

    if (!bucket || now - bucket.openedAt > windowMs) {
      buckets.set(key, { openedAt: now, count: 1, windowMs })
      return next()
    }

    bucket.count += 1
    if (bucket.count > max) {
      const retryAfterSeconds = Math.ceil((bucket.openedAt + windowMs - now) / 1000)
      response.setHeader('Retry-After', String(retryAfterSeconds))
      return response.status(429).json({ message: message ?? 'Too many requests. Please wait a moment and try again.' })
    }
    return next()
  }
}

// The four limits the review asked for. Numbers chosen against how a real
// person uses each route, not against a round number:
//
//   auth    — signing in, verifying a code, or resetting a password.
//             A person mistyping a password does so three or four times,
//             not twenty. Ten in fifteen minutes leaves room for genuine
//             confusion and still makes spraying one common password
//             across many usernames pointless. Note this complements
//             account lockout rather than replacing it: lockout defends
//             ONE account against many guesses, this defends MANY
//             accounts against one guess each.
//   register — nobody creates two accounts a minute. Five an hour stops a
//             script filling the users table without ever inconveniencing
//             a family sharing a connection.
//   password reset — the review's sharpest finding, because the victim is
//             the CUSTOMER: every request sends real mail to an address
//             the attacker does not control. Three an hour.
//   api     — a blanket ceiling so a signed-in account cannot flood any
//             endpoint. 300 a minute is far above what the heaviest
//             screen in this app generates (the reporting page fires five
//             requests) and far below what a script does.
export const authLimiter = rateLimit({
  name: 'auth',
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many sign-in attempts. Please wait a few minutes and try again.',
})

export const registerLimiter = rateLimit({
  name: 'register',
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'Too many accounts created from this connection. Please try again later.',
})

export const passwordResetLimiter = rateLimit({
  name: 'password-reset',
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: 'Too many password reset requests. Please check your email, or try again later.',
})

export const apiLimiter = rateLimit({
  name: 'api',
  windowMs: 60 * 1000,
  max: 300,
})
