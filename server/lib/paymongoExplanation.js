// ============================================================================
// PECTRACK API — lib/paymongo.js (annotated for learning)
// Phase 6.5 — see PHASE6.5_PLAN.md. Everything PayMongo-specific lives
// here: the base URL, the auth header construction, the exact webhook HMAC
// recipe. routes/payments.js stays as free of gateway-specific knowledge
// as lib/billing.js already keeps it free of raw SUM queries — same
// separation, same reason.
//
// WHY THIS IS RAW fetch() AND crypto, NOT PAYMONGO'S OWN NODE SDK.
// PHASES-RULES-PLANNING.md: "Do not add technologies, frameworks,
// libraries, or architectural patterns unless there is a clear reason."
// The entire surface this phase needs is two HTTP calls and one signature
// check — Node's built-in crypto and fetch cover both completely. Adding
// paymongo-node as a dependency for that little surface would be exactly
// the unnecessary library the rule warns against, and it would sit oddly
// against a codebase that otherwise reaches for raw SQL over an ORM
// everywhere else.
//
// WHY EVERY MECHANIC BELOW WAS VERIFIED, NOT RECALLED. PayMongo's own
// documentation site returned mostly dead links and redirect loops when
// fetched directly during planning. Given this is signature-verification
// code — get one byte of the recipe wrong and either every legitimate
// webhook silently stops being accepted, or worse, nothing is actually
// being verified at all — nothing here is taken from memory. The exact
// header format and HMAC construction come from reading PayMongo's own
// official Node SDK source directly: github.com/paymongo/paymongo-node,
// src/services/Webhook.js, WebhookService.prototype.constructEvent, quoted
// in full in PHASE6.5_PLAN.md's "Sourcing" section. The event envelope
// shape comes from that same SDK's src/entities/Event.js and
// src/ApiResource.js. Auth scheme, amount units (centavos, PHP 100.00
// minimum), and the Idempotency-Key header come from docs.paymongo.com
// pages that DID return content when fetched by their exact URL.
// ============================================================================
import crypto from 'node:crypto'

const paymongoApiBase = 'https://api.paymongo.com/v1'

// PayMongo's own reference SDK (the constructEvent function quoted above)
// does not check the signed timestamp's age AT ALL — a captured,
// genuinely-signed webhook payload could be replayed by an attacker at any
// point in the future and would still pass their own reference
// verification unmodified. This implementation adds a tolerance window
// PayMongo's docs do not specify a value for; 5 minutes is this
// implementation's own judgment call, chosen to match the widely-used
// precedent for this exact HMAC-with-timestamp scheme (the same shape
// Stripe's webhook signing uses, where 5 minutes is the documented
// default). See PHASE6.5_PLAN.md, Decision 4.
const webhookReplayToleranceSeconds = 300

// WHY AN EXPLICIT TIMEOUT IS NOT OPTIONAL HERE.
// Node's fetch has NO default overall request timeout. A PayMongo endpoint
// that accepts the TCP connection and then simply never answers would
// leave the promise below pending forever, and every caller awaiting it
// stuck with it. There is no ambient safety net that eventually gives up.
//
// This was found in review: before the timeout existed, the /intent route
// ALSO held a database row lock and a pooled connection for the duration
// of this call, so a stalled PayMongo would have frozen the whole API
// indefinitely rather than merely slowly. The lock problem was fixed
// separately (see routes/paymentsExplanation.js's three-phase structure);
// this bounds the wait itself, so the worst case is a clear failure after
// 15 seconds rather than a request that never resolves at all.
//
// 15s is generous for a single JSON round trip and short enough that a
// customer waiting on a checkout redirect gets an answer rather than a
// spinner.
const paymongoRequestTimeoutMs = 15000

// PayMongo's own stated minimum for any amount field: PHP 100.00, which in
// their smallest-currency-unit convention (integers, centavos — PHP 100.00
// literally IS the integer 10000) is 10000. Enforced here as well as
// wherever it's actually checked (routes/payments.js's intent-creation
// route), rather than left for PayMongo's own API to reject, so a balance
// under the floor fails with a clean, specific message from THIS
// application instead of whatever PayMongo's own validation error happens
// to say.
export const paymongoMinimumAmountCentavos = 10000

// Two narrow error types rather than one generic Error, so a catch site
// can distinguish "this webhook wasn't really from PayMongo" (a security
// event, always a 400, never retried the same way) from "PayMongo's API
// itself rejected our request" (an operational failure, worth a 502) —
// the same reasoning behind PaymongoWebhookVerificationError's use in
// routes/payments.js's webhook handler.
export class PaymongoWebhookVerificationError extends Error {}
export class PaymongoApiError extends Error {
  constructor(message, { status, body }) {
    super(message)
    this.status = status
    this.body = body
  }
}

// Creates a PayMongo Checkout Session — a hosted, PayMongo-run payment
// page — for the given amount, and returns its id plus the checkout_url to
// redirect the customer to. PayMongo's page handles the ENTIRE GCash
// redirect flow itself; no card number, no GCash credential, ever touches
// this server. That is the whole reason PHASE6.5_PLAN.md, Decision 2,
// chose Checkout Sessions over the older, more manual Sources API or the
// card-oriented Payment Intents API.
//
// WHY payment_method_types IS HARDCODED TO ['gcash']. PROJECT_CONTEXT.md
// names "PayMongo / GCash" specifically as the payment stack, and
// PHASE6_PLAN.md's own Decision 6 frames this entire feature around
// GCash. Widening this array to add cards or other e-wallets later is a
// one-line change — the point of naming it explicitly here, rather than
// accepting it as a parameter nobody currently passes, is that today it
// is a DECISION, not an oversight waiting to be noticed.
//
// WHY reference_number IS PASSED THROUGH BUT NOT RELIED ON. PayMongo
// echoes it back on the Checkout Session's own attributes, but NOT onto
// the nested Payment resource a webhook event carries (confirmed from
// PayMongo's Checkout Session Resource schema during planning) — so it is
// sent for PayMongo's own dashboard/support usefulness, while this
// application's actual correlation key back to its own payments row is
// the Checkout Session's id itself (see verifyPaymongoWebhook's caller in
// routes/payments.js, and PHASE6.5_PLAN.md, Decision 7).
//
// WHY Idempotency-Key IS A FRESH UUID PER CALL. PayMongo's own docs
// recommend one on every resource-creation request, specifically to
// protect against THIS SERVER's own retry of a request whose response
// never arrived (a network timeout after PayMongo already created the
// session, say) from creating a SECOND, duplicate checkout session at
// their end. This is a different failure mode from the one migration
// 006's partial unique index guards against: that index stops two
// DIFFERENT requests (a customer's double-click) from producing two
// PENDING rows in THIS database; Idempotency-Key stops ONE logical
// request, retried, from becoming two sessions at PayMongo's end. Both
// are needed; neither substitutes for the other.
export async function createCheckoutSession({ secretKey, amountCentavos, referenceNumber, description, successUrl, cancelUrl }) {
  let response
  try {
    response = await fetch(`${paymongoApiBase}/checkout_sessions`, {
    // See paymongoRequestTimeoutMs above for why this is mandatory rather
    // than defensive. AbortSignal.timeout() is Node's own built-in for
    // this — no library, no manual setTimeout/clearTimeout dance.
    signal: AbortSignal.timeout(paymongoRequestTimeoutMs),
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // HTTP Basic authentication, with the secret key as the username and
      // a BLANK password — this is PayMongo's actual documented scheme
      // (docs.paymongo.com/docs/account-settings-api-keys: "Authorization:
      // Basic base64(YOUR_SECRET_KEY:)"), not a guess at a REST API
      // convention. The trailing colon before base64-encoding is the
      // blank-password separator; omitting it would encode a different,
      // wrong string.
      Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`,
      'Idempotency-Key': crypto.randomUUID(),
    },
    body: JSON.stringify({
      data: {
        attributes: {
          // amount is in CENTAVOS — PHP 100.00 is written as the integer
          // 10000, not 100 and not 100.00. Getting this wrong by a factor
          // of 100 either direction is exactly the kind of silent
          // financial bug this comment exists to prevent a future editor
          // from reintroducing; the caller (routes/payments.js) is
          // responsible for the conversion before this function is ever
          // reached.
          line_items: [{ amount: amountCentavos, currency: 'PHP', name: description, quantity: 1 }],
          payment_method_types: ['gcash'],
          reference_number: referenceNumber,
          description,
          success_url: successUrl,
          cancel_url: cancelUrl,
          // Deliberately off: this application already has its own
          // receipt view (Payment & Billing's per-order screen from Phase
          // 6), and turning on PayMongo's own separate receipt email is a
          // distinct feature this phase does not enable.
          send_email_receipt: false,
        },
      },
    }),
  })

  } catch (error) {
    // Everything that means "no response ever arrived": the timeout above
    // firing, a DNS failure, a refused connection, a dropped socket.
    //
    // Converted into the SAME PaymongoApiError a non-2xx response
    // produces, deliberately — the caller then has exactly ONE error type
    // to handle and maps all of them to the same 502. Left as a raw
    // AbortError or TypeError, these would sail past the caller's
    // `instanceof PaymongoApiError` check, reach app.js's generic error
    // handler, and become a 500 — which tells the customer THIS
    // application is broken when the truth is that the payment provider
    // did not answer. The distinction matters: a 500 invites a bug
    // report, a 502 invites a retry.
    throw new PaymongoApiError('Could not reach PayMongo.', { status: null, body: { cause: error.name } })
  }

  const body = await response.json().catch(() => null)
  if (!response.ok) {
    // Deliberately one error type for every non-2xx response, rather than
    // branching on the specific status code here. The caller
    // (routes/payments.js) turns ANY of these into the same 502 "payment
    // provider unavailable, try again" — from a cashier's or customer's
    // seat, a 4xx validation complaint from PayMongo and a genuine 5xx
    // outage are equally "something went wrong with the payment provider,
    // not with you," and this application's own validation (balance,
    // minimum amount, order status) already runs before this call, so a
    // well-formed request reaching PayMongo should not normally 4xx in the
    // first place.
    throw new PaymongoApiError('PayMongo rejected the checkout session request.', { status: response.status, body })
  }

  return { id: body.data.id, checkoutUrl: body.data.attributes.checkout_url }
}

// Verifies a webhook request genuinely originated from PayMongo, and
// returns the parsed event object if so. Throws
// PaymongoWebhookVerificationError for EVERY kind of failure — a malformed
// header, a signature that doesn't match, a timestamp outside the replay
// window — and the calling route turns all of them into the identical 400
// response. That collapsing is deliberate: it means a forged request
// cannot be iteratively refined by an attacker probing which SPECIFIC
// check it failed (a different error message per failure mode would leak
// exactly that).
export function verifyPaymongoWebhook({ rawBody, signatureHeader, webhookSecret }) {
  // rawBody MUST be the EXACT bytes PayMongo computed its own HMAC over —
  // not a value reconstructed from the already-parsed request.body via
  // JSON.stringify(JSON.parse(...)), which is not guaranteed to round-trip
  // byte-for-byte (key order, whitespace, and number formatting can all
  // differ). See PHASE6.5_PLAN.md, Decision 5, for exactly how the caller
  // (server/app.js) captures this via express.json()'s own `verify`
  // option — the only place in this request's lifecycle where the
  // original bytes are still available before they're consumed.
  if (!rawBody || !signatureHeader) throw new PaymongoWebhookVerificationError('Missing signature or body.')

  // ---------------------------------------------------------------------
  // THE EXACT RECIPE, READ FROM PAYMONGO'S OWN SDK SOURCE
  // (WebhookService.prototype.constructEvent, paymongo-node):
  //
  //   const arrSignature = signatureHeader.split(',')
  //   const timestamp = arrSignature[0].split('=')[1]          // "t=..."
  //   const testModeSignature = arrSignature[1].split('=')[1]   // "te=..."
  //   const liveModeSignature = arrSignature[2].split('=')[1]   // "li=..."
  //
  // Read literally here rather than re-derived from first principles or
  // recalled from memory — this is exactly the kind of low-entropy-looking
  // detail (three comma-separated key=value pairs) that is easy to
  // misremember in a way that LOOKS plausible and verifies nothing.
  // ---------------------------------------------------------------------
  const parts = signatureHeader.split(',').map((part) => part.split('='))
  if (parts.length < 3 || parts.some((part) => part.length !== 2)) {
    throw new PaymongoWebhookVerificationError('Malformed Paymongo-Signature header.')
  }
  const [, timestamp] = parts[0]
  const [, testModeSignature] = parts[1]
  const [, liveModeSignature] = parts[2]

  // PayMongo populates exactly ONE of te/li per event, depending on
  // whether it was generated in test or live mode — this implementation
  // never trusts a caller to say which mode to expect; it decides from
  // whichever slot is actually non-empty, the same way PayMongo's own
  // reference implementation does (its version overwrites a
  // `comparisonSignature` variable with whichever of the two is set,
  // which has the identical effect to the `||` below when — as is always
  // true in practice — only one is ever populated).
  const providedSignature = testModeSignature || liveModeSignature
  if (!providedSignature || !timestamp) throw new PaymongoWebhookVerificationError('Malformed Paymongo-Signature header.')

  // THE REPLAY WINDOW — see the module-level comment on
  // webhookReplayToleranceSeconds for why this exists at all when
  // PayMongo's own SDK has no equivalent check.
  const timestampSeconds = Number(timestamp)
  if (!Number.isFinite(timestampSeconds) || Math.abs(Date.now() / 1000 - timestampSeconds) > webhookReplayToleranceSeconds) {
    throw new PaymongoWebhookVerificationError('Webhook timestamp is outside the allowed window.')
  }

  // THE SIGNED STRING ITSELF: `${timestamp}.${payload}`, HMAC-SHA256, hex
  // digest — read directly off PayMongo's own source, not guessed at
  // (it could just as plausibly have been `timestamp,payload`, or the raw
  // bytes with no separator, or something else entirely — there is no way
  // to have gotten this right by reasoning about it in the abstract).
  //
  // rawBody arrives as a Buffer and is converted to a UTF-8 STRING before
  // hashing, rather than hashed as raw bytes directly, specifically to
  // match PayMongo's own reference implementation: their hmac.update()
  // call concatenates the timestamp with a STRING payload (and later
  // JSON.parses that same string), which only produces the correct digest
  // if the same string-based concatenation happens on this end too.
  const bodyString = rawBody.toString('utf8')
  const expectedSignature = crypto.createHmac('sha256', webhookSecret).update(`${timestamp}.${bodyString}`).digest('hex')

  // ---------------------------------------------------------------------
  // TWO DELIBERATE IMPROVEMENTS OVER PAYMONGO'S OWN REFERENCE SDK
  // (PHASE6.5_PLAN.md, Decision 4) — worth being explicit that these are
  // improvements, not "fixing a bug" in someone else's code that this
  // application has no visibility into or responsibility for:
  //
  // 1. CONSTANT-TIME COMPARISON. PayMongo's own reference compares with a
  //    plain `!=` — an ordinary string comparison that returns as soon as
  //    it finds the first differing character, which is a textbook timing
  //    side-channel: an attacker who can measure response latency with
  //    enough precision can, in principle, recover a correct signature one
  //    byte at a time by observing which guesses take marginally longer to
  //    reject. crypto.timingSafeEqual always compares every byte, so the
  //    time taken does not depend on WHERE the first mismatch is.
  //
  // 2. THE LENGTH CHECK BEFORE IT. timingSafeEqual REQUIRES its two
  //    buffers to be the same length and THROWS a RangeError otherwise —
  //    so an attacker (or simply a malformed request) sending a
  //    wrong-length signature would crash this function with an unhandled
  //    exception rather than being cleanly refused, unless the length is
  //    checked first. A length mismatch is not ambiguous — it can never be
  //    a match — so treating it as "not verified" up front, rather than
  //    letting timingSafeEqual reject it AND risk it rejecting via an
  //    exception, is both correct and safer.
  // ---------------------------------------------------------------------
  const expected = Buffer.from(expectedSignature, 'hex')
  const provided = Buffer.from(providedSignature, 'hex')
  if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
    throw new PaymongoWebhookVerificationError('Signature does not match.')
  }

  // Only NOW — after the signature has been proven to match — is the body
  // actually parsed and handed back to the caller. Everything above this
  // line touches only the RAW bytes and the header; nothing branches on
  // the CONTENTS of an unverified payload, which is the entire point of a
  // signature check existing at all on an endpoint any anonymous caller on
  // the internet can reach.
  try {
    return JSON.parse(bodyString)
  } catch {
    throw new PaymongoWebhookVerificationError('Signed payload is not valid JSON.')
  }
}
