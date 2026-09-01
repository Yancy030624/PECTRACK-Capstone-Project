// Focused tests for verifyPaymongoWebhook (server/lib/paymongo.js) —
// called directly with hand-crafted payloads and a fake shared secret, no
// network access and no PayMongo account needed. This is deliberate: see
// PHASE6.5_PLAN.md's opening section — no PayMongo test-mode credentials
// were available when Phase 6.5 was implemented, so every claim this
// signature-verification code makes about itself has to be provable
// without a live account. Run with: npm test
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { describe, test } from 'node:test'
import { PaymongoWebhookVerificationError, verifyPaymongoWebhook } from './paymongo.js'

const webhookSecret = 'whsk_test_fake_secret_for_unit_tests_only'

// Builds a signature header the exact way verifyPaymongoWebhook expects to
// unpack one — mirroring the module's own recipe (read from PayMongo's own
// SDK source; see paymongo.js's own comments) rather than importing any
// internal signing helper, since PayMongo itself is the one signing real
// webhook payloads and this test's job is to prove verification is
// correct against exactly that recipe, independently derived.
const sign = (secret, timestamp, bodyString, mode = 'te') => {
  const hmac = crypto.createHmac('sha256', secret).update(`${timestamp}.${bodyString}`).digest('hex')
  return mode === 'te' ? `t=${timestamp},te=${hmac},li=` : `t=${timestamp},te=,li=${hmac}`
}

describe('verifyPaymongoWebhook', () => {
  const samplePayload = { data: { id: 'evt_test123', attributes: { type: 'payment.paid', data: { id: 'pay_test123', attributes: { checkout_session_id: 'cs_test123', amount: 10000 } } } } }
  const bodyString = JSON.stringify(samplePayload)
  const rawBody = Buffer.from(bodyString, 'utf8')
  const nowSeconds = () => Math.floor(Date.now() / 1000)

  test('a validly signed payload is accepted and parsed back out', () => {
    const signatureHeader = sign(webhookSecret, nowSeconds(), bodyString)
    const event = verifyPaymongoWebhook({ rawBody, signatureHeader, webhookSecret })
    assert.equal(event.data.attributes.type, 'payment.paid')
    assert.equal(event.data.attributes.data.attributes.checkout_session_id, 'cs_test123')
  })

  test('the live-mode (li) slot is accepted just as validly as test-mode (te)', () => {
    const signatureHeader = sign(webhookSecret, nowSeconds(), bodyString, 'li')
    const event = verifyPaymongoWebhook({ rawBody, signatureHeader, webhookSecret })
    assert.equal(event.data.id, 'evt_test123')
  })

  test('a tampered body is rejected even though the header is a real signature', () => {
    const signatureHeader = sign(webhookSecret, nowSeconds(), bodyString)
    const tamperedBody = Buffer.from(bodyString.replace('10000', '10001'), 'utf8')
    assert.throws(() => verifyPaymongoWebhook({ rawBody: tamperedBody, signatureHeader, webhookSecret }), PaymongoWebhookVerificationError)
  })

  test('a payload signed with the WRONG secret is rejected', () => {
    const signatureHeader = sign('whsk_test_a_completely_different_secret', nowSeconds(), bodyString)
    assert.throws(() => verifyPaymongoWebhook({ rawBody, signatureHeader, webhookSecret }), PaymongoWebhookVerificationError)
  })

  // The replay-protection window this implementation adds beyond
  // PayMongo's own reference SDK (PHASE6.5_PLAN.md, Decision 4) — a
  // genuinely, correctly signed payload from 10 minutes ago must still be
  // rejected, or a captured webhook could be replayed indefinitely.
  test('a correctly signed payload with a stale timestamp is rejected', () => {
    const tenMinutesAgo = nowSeconds() - 600
    const signatureHeader = sign(webhookSecret, tenMinutesAgo, bodyString)
    assert.throws(() => verifyPaymongoWebhook({ rawBody, signatureHeader, webhookSecret }), PaymongoWebhookVerificationError)
  })

  test('a timestamp just inside the 5-minute window is still accepted', () => {
    const fourMinutesAgo = nowSeconds() - 240
    const signatureHeader = sign(webhookSecret, fourMinutesAgo, bodyString)
    assert.doesNotThrow(() => verifyPaymongoWebhook({ rawBody, signatureHeader, webhookSecret }))
  })

  test('a malformed header (missing the te/li parts) is rejected, not a crash', () => {
    const signatureHeader = `t=${nowSeconds()}`
    assert.throws(() => verifyPaymongoWebhook({ rawBody, signatureHeader, webhookSecret }), PaymongoWebhookVerificationError)
  })

  test('a header with both te and li empty is rejected', () => {
    const signatureHeader = `t=${nowSeconds()},te=,li=`
    assert.throws(() => verifyPaymongoWebhook({ rawBody, signatureHeader, webhookSecret }), PaymongoWebhookVerificationError)
  })

  test('a missing header or missing body is rejected, not a crash', () => {
    assert.throws(() => verifyPaymongoWebhook({ rawBody, signatureHeader: '', webhookSecret }), PaymongoWebhookVerificationError)
    assert.throws(() => verifyPaymongoWebhook({ rawBody: null, signatureHeader: sign(webhookSecret, nowSeconds(), bodyString), webhookSecret }), PaymongoWebhookVerificationError)
  })

  // A signature of the wrong LENGTH must be refused cleanly, not crash
  // crypto.timingSafeEqual (which throws on unequal-length buffers) —
  // guards the length check in paymongo.js rather than the constant-time
  // comparison itself.
  test('a signature of the wrong length is rejected, not a thrown RangeError', () => {
    const signatureHeader = `t=${nowSeconds()},te=deadbeef,li=`
    assert.throws(() => verifyPaymongoWebhook({ rawBody, signatureHeader, webhookSecret }), PaymongoWebhookVerificationError)
  })
})
