// Everything PayMongo-specific lives here — the base URL, the auth header,
// the exact webhook HMAC recipe — so routes/payments.js stays as free of
// gateway-specific knowledge as lib/billing.js keeps it free of raw SUM
// queries. Phase 6.5 — see PHASE6.5_PLAN.md.
//
// Every mechanic below (the signature header format, the HMAC
// construction, the event envelope shape, the auth scheme, amount units)
// was read directly from PayMongo's own official Node SDK source
// (github.com/paymongo/paymongo-node, src/services/Webhook.js) and current
// docs.paymongo.com pages during planning — not recalled from training
// data. See PHASE6.5_PLAN.md's "Sourcing" section for exactly what was
// verified and where. This matters here specifically because getting the
// signature recipe even one byte wrong means either every legitimate
// webhook is silently rejected, or — far worse — nothing is actually being
// verified at all.
import crypto from 'node:crypto'

const paymongoApiBase = 'https://api.paymongo.com/v1'
// PayMongo's own reference SDK does not check this at all — a captured,
// genuinely-signed payload could be replayed indefinitely. 5 minutes is
// this implementation's own judgment call (PHASE6.5_PLAN.md, Decision 4),
// matching the widely-used precedent for this exact HMAC-with-timestamp
// scheme.
const webhookReplayToleranceSeconds = 300
// Node's fetch has no default overall request timeout, so without an
// explicit one a PayMongo endpoint that stalls would hang the caller
// forever. 15s is generous for a single JSON round trip and short enough
// that a customer waiting on a checkout redirect gets a clear failure
// rather than a spinner that never resolves.
const paymongoRequestTimeoutMs = 15000
// PayMongo's own stated minimum for any amount field, in centavos
// (PHP 100.00). Enforced here, not just left for PayMongo's API to reject,
// so a too-small balance fails with OUR clean error message rather than
// whatever PayMongo's own validation error happens to say.
export const paymongoMinimumAmountCentavos = 10000

export class PaymongoWebhookVerificationError extends Error {}
export class PaymongoApiError extends Error {
  constructor(message, { status, body }) {
    super(message)
    this.status = status
    this.body = body
  }
}

// Creates a PayMongo Checkout Session for the given amount and returns its
// id (used as payments.gateway_reference — see PHASE6.5_PLAN.md, Decision
// 7) and the hosted checkout_url to redirect the customer to.
//
// payment_method_types is deliberately just ['gcash'] — PROJECT_CONTEXT.md
// names "PayMongo / GCash" specifically, and widening this to cards or
// other e-wallets later is a one-line change, not a redesign.
//
// Idempotency-Key is a fresh UUID per call: PayMongo's own docs recommend
// it for every resource-creation request specifically to protect against
// OUR OWN retry of a request whose response never arrived (a timeout after
// PayMongo already created the session, say) from creating a SECOND,
// duplicate checkout session at their end. It is not a substitute for
// Decision 3's database-level guard — that stops two DIFFERENT requests
// (a double-click) from creating two intents; this stops ONE logical
// request, retried, from becoming two.
export async function createCheckoutSession({ secretKey, amountCentavos, referenceNumber, description, successUrl, cancelUrl }) {
  let response
  try {
    response = await fetch(`${paymongoApiBase}/checkout_sessions`, {
    // Node's fetch has NO default overall request timeout — without this,
    // a PayMongo endpoint that accepts the connection and then never
    // answers would leave this promise pending indefinitely, and the
    // caller waiting on it forever. A bounded wait turns "hangs forever"
    // into "fails in 15 seconds with a 502 the customer can retry."
    signal: AbortSignal.timeout(paymongoRequestTimeoutMs),
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // HTTP Basic, secret key as the username, blank password — PayMongo's
      // documented auth scheme (docs.paymongo.com/docs/account-settings-api-keys).
      // Buffer.from(...).toString('base64') rather than btoa(), since the
      // secret key is plain ASCII either way but this is the Node-idiomatic
      // form already used nowhere else in this codebase only because
      // nothing else here needed Basic auth before now.
      Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`,
      'Idempotency-Key': crypto.randomUUID(),
    },
    body: JSON.stringify({
      data: {
        attributes: {
          line_items: [{ amount: amountCentavos, currency: 'PHP', name: description, quantity: 1 }],
          payment_method_types: ['gcash'],
          reference_number: referenceNumber,
          description,
          success_url: successUrl,
          cancel_url: cancelUrl,
          // Never on: this app already emails/records receipts its own
          // way, and PayMongo's own receipt email is a separate feature
          // this phase does not turn on.
          send_email_receipt: false,
        },
      },
    }),
  })

  } catch (error) {
    // A timeout, a DNS failure, a refused connection — anything that means
    // the request never produced a response. Converted to the SAME
    // PaymongoApiError a non-2xx produces, so the caller has exactly one
    // error type to handle and turns all of them into the same 502. Left
    // as a raw AbortError/TypeError instead, this would reach the generic
    // error handler as a 500 — telling the customer this application is
    // broken, when the truth is the payment provider did not answer.
    throw new PaymongoApiError('Could not reach PayMongo.', { status: null, body: { cause: error.name } })
  }

  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new PaymongoApiError('PayMongo rejected the checkout session request.', { status: response.status, body })
  }

  return { id: body.data.id, checkoutUrl: body.data.attributes.checkout_url }
}

// Verifies a webhook request genuinely came from PayMongo and returns the
// parsed event. Throws PaymongoWebhookVerificationError for ANY failure
// (malformed header, bad signature, stale timestamp) — the route turns
// every one of those into the same 400, deliberately not distinguishing
// them in the response, so a forged request can't be iteratively refined
// by an attacker probing which specific check it failed.
//
// rawBody MUST be the exact bytes PayMongo signed — see PHASE6.5_PLAN.md,
// Decision 5, for why that has to come from express.json()'s own `verify`
// callback rather than a second body parser.
export function verifyPaymongoWebhook({ rawBody, signatureHeader, webhookSecret }) {
  if (!rawBody || !signatureHeader) throw new PaymongoWebhookVerificationError('Missing signature or body.')

  // PayMongo's own SDK source (WebhookService.prototype.constructEvent):
  //   const arrSignature = signatureHeader.split(',')
  //   timestamp = arrSignature[0].split('=')[1]         // "t=..."
  //   testModeSignature = arrSignature[1].split('=')[1]  // "te=..."
  //   liveModeSignature = arrSignature[2].split('=')[1]  // "li=..."
  // Read literally here rather than re-derived, since this is exactly the
  // kind of detail that is easy to misremember and impossible to safely
  // guess at.
  const parts = signatureHeader.split(',').map((part) => part.split('='))
  if (parts.length < 3 || parts.some((part) => part.length !== 2)) {
    throw new PaymongoWebhookVerificationError('Malformed Paymongo-Signature header.')
  }
  const [, timestamp] = parts[0]
  const [, testModeSignature] = parts[1]
  const [, liveModeSignature] = parts[2]
  // PayMongo populates exactly one of te/li depending on whether the event
  // was generated in test or live mode — never trust a caller to say which
  // mode to check, decide it from which one is actually present, same as
  // PayMongo's own reference implementation.
  const providedSignature = testModeSignature || liveModeSignature
  if (!providedSignature || !timestamp) throw new PaymongoWebhookVerificationError('Malformed Paymongo-Signature header.')

  // Replay protection PayMongo's own SDK does not implement — see the
  // module-level comment on webhookReplayToleranceSeconds.
  const timestampSeconds = Number(timestamp)
  if (!Number.isFinite(timestampSeconds) || Math.abs(Date.now() / 1000 - timestampSeconds) > webhookReplayToleranceSeconds) {
    throw new PaymongoWebhookVerificationError('Webhook timestamp is outside the allowed window.')
  }

  // The exact signed string, per PayMongo's own source: `${timestamp}.${payload}`,
  // HMAC-SHA256, hex digest. rawBody is a Buffer; converted to a UTF-8
  // string here (not hashed as raw bytes directly) to match that
  // reference exactly — it calls hmac.update() on a STRING built by
  // concatenating the timestamp with the payload, and later JSON.parses
  // that same payload, which only works if payload was always a string.
  const bodyString = rawBody.toString('utf8')
  const expectedSignature = crypto.createHmac('sha256', webhookSecret).update(`${timestamp}.${bodyString}`).digest('hex')

  // Constant-time comparison — PayMongo's own reference SDK uses a plain
  // `!=`, which is not constant-time and is a textbook timing side-channel
  // (PHASE6.5_PLAN.md, Decision 4). timingSafeEqual requires equal-length
  // buffers and throws otherwise, so the length check guards that rather
  // than letting a malformed signature crash the route with an unhandled
  // exception — a length mismatch just means "not a match," not a bug.
  const expected = Buffer.from(expectedSignature, 'hex')
  const provided = Buffer.from(providedSignature, 'hex')
  if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
    throw new PaymongoWebhookVerificationError('Signature does not match.')
  }

  try {
    return JSON.parse(bodyString)
  } catch {
    throw new PaymongoWebhookVerificationError('Signed payload is not valid JSON.')
  }
}
