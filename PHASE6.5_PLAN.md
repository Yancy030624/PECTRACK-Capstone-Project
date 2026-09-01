# Phase 6.5 — Live PayMongo Integration: implementation plan

This document is the agreed design for Phase 6.5, written before writing any
Phase 6.5 code — the same discipline `PHASE5_PLAN.md` and `PHASE6_PLAN.md`
were written under, and the one `PHASE6_PLAN.md`'s own Decision 5 asked for
explicitly ("it gets its own document, written the same way this one was").
Read `PHASE6_PLAN.md` first, especially Decision 5 and the "What Phase 6.5
will add" sketch — this document turns that four-bullet sketch into an
actual plan, and corrects the one place research showed the sketch's own
premise needed adjusting (see Decision 9).

## Why this phase is different from every phase before it

Phases 1 through 6 could each be fully built and fully tested on this
machine, against this Postgres database, with no external dependency. Phase
6.5 cannot: it depends on a live third-party service (PayMongo), real
API credentials, and a public HTTPS URL a webhook can reach — none of which
exist in this repository or this environment yet. Confirmed before writing
this plan: `.env`, `.env.example`, and `package.json` have zero PayMongo
references.

Two decisions were the user's to make, not this document's, and were asked
directly before any of this was written:

- **No PayMongo test-mode keys are available yet** (an account exists, but
  the keys haven't been located). So nothing in this phase can be exercised
  against PayMongo's real sandbox — every test here uses synthetic,
  hand-crafted requests instead. The code is written to be correct once
  real keys are added to `.env`; nothing needs to change in the code for
  that to happen, only the environment.
- **No local tunnel (ngrok or similar) is being set up this session.**
  Installing one is a real action — new software, a public URL exposing
  this machine's dev server for as long as it runs — and that is the
  user's call, not something to assume. Live end-to-end testing through a
  real tunnel is left for later, on the user's own machine, when they are
  ready.

Everything in this plan is written so that constraint is a today-only
limitation, not a design compromise. The webhook logic — signature
verification, replay protection, idempotency — is fully provable with
crafted requests and needs nothing else to be trusted.

## Sourcing: every PayMongo mechanic below was verified, not recalled

PayMongo's own documentation site returned mostly dead links and redirect
loops during planning — repeated fetches of `developers.paymongo.com/docs/*`
and `docs.paymongo.com/docs/*` pages came back 404 or content-free. Given
this is signature-verification code (get one byte of the recipe wrong and
either every legitimate webhook is silently rejected, or worse, forged ones
are silently accepted), nothing below is taken from training-data memory.
Instead:

- The exact webhook signature mechanics (header name, format, HMAC
  construction) come from reading PayMongo's own official Node SDK source
  directly — `github.com/paymongo/paymongo-node`,
  `src/services/Webhook.js`, `constructEvent`, fetched and quoted in full
  during planning.
- The exact event envelope shape (the JSON path from raw body down to the
  nested Payment resource) comes from that same SDK's `src/entities/
  Event.js` and `src/ApiResource.js`.
- Checkout Session request/response shape, the `checkout_session_id` field
  on the Payment resource, authentication scheme, amount units, and the
  Idempotency-Key header all come from `docs.paymongo.com` pages that DID
  return content when fetched directly by exact URL (found via that site's
  own `llms.txt` index) or from a web search of PayMongo's published
  developer-tools guidance.

## Scope

**In scope**

- `POST /api/payments/intent` — a customer (their own order) or staff
  (any order) requests to pay via GCash through PayMongo. Creates a
  PayMongo Checkout Session and a matching `PENDING` row in `payments`,
  returns the checkout URL to redirect to.
- `POST /api/payments/webhook` — PayMongo's server calling back to confirm
  a payment succeeded or failed. Verifies the request genuinely came from
  PayMongo, then flips the matching `PENDING` row to `PAID` or `FAILED`.
- Everything needed to prove the webhook handler correct without a live
  PayMongo account: signature verification, replay-window rejection,
  idempotent redelivery handling, and the balance-recheck-at-confirmation
  logic — all provable with hand-crafted requests and a fake shared secret.
- A short "how to find your PayMongo test keys and wire them into `.env`"
  note, since the user has an account but hasn't located them yet.

**Explicitly out of scope for Phase 6.5**

- **Live end-to-end testing against PayMongo's real API or a real tunnel.**
  Both were asked about directly and both were declined for this pass —
  see above. The code is written to be ready for it; doing it is a later,
  separate step on the user's own machine.
- **Cards, GrabPay, PayMaya, or any payment method beyond GCash.**
  `PROJECT_CONTEXT.md` names "PayMongo / GCash" specifically; `PHASE6_PLAN.md`
  Decision 6 frames the whole feature around GCash. The Checkout Session's
  `payment_method_types` is deliberately requested as `['gcash']` only —
  widening it later is a one-line change, not a redesign.
- **Cancelling or expiring an abandoned `PENDING` intent.** A customer who
  opens the checkout page and never completes it leaves a `PENDING` row
  that blocks a new gateway attempt for that order (Decision 3 below). The
  manual cash/GCash-reference path from Phase 6 remains fully available as
  the escape hatch — a cashier can always record what actually happened at
  the counter regardless of an abandoned online attempt. Recorded as a
  known gap, not solved here; see the end of this document.
- **Partial refunds via the gateway**, or reversing a `payment.paid`
  webhook. Unchanged from Phase 6 — refunds only happen through Decision
  8's admin-cancels-an-order path, which now also has to handle
  gateway-confirmed rows (Decision 8 below), but nothing here adds a
  PayMongo refund API call.

---

## Decisions

### Decision 1 — a thin `lib/paymongo.js`, raw `fetch`, no SDK dependency

`PHASES-RULES-PLANNING.md`: "Do not add technologies, frameworks,
libraries, or architectural patterns unless there is a clear reason." The
entire PayMongo surface this phase needs is two HTTP calls (create a
checkout session, and — never called by us — receive a webhook) plus one
signature check. Node's built-in `crypto` covers the HMAC and
`fetch` (available natively since Node 18, already relied on implicitly
nowhere else in this codebase but standard) covers the HTTP call. Adding
`paymongo-node` as a dependency for this little surface would be exactly
the unnecessary library the rule warns against — and this codebase's
existing convention is already direct code over wrapper libraries (raw SQL
via `pg`, no ORM; no HTTP client wrapper anywhere else either).

`server/lib/paymongo.js` holds every PayMongo-specific detail — the base
URL, the auth header construction, the exact HMAC recipe — so
`routes/payments.js` stays as free of gateway-specific knowledge as
possible, matching how `lib/billing.js` and `lib/inventory.js` already keep
routes/*.js thin.

### Decision 2 — Checkout Sessions, not raw Payment Intents + Sources

PayMongo has three ways to accept GCash: the older Sources API (create a
source, redirect, poll or wait for a webhook, then create a Payment
against it — multi-step), the Payment Intents API (built for card entry
forms, requires handling card data flow even indirectly), and Checkout
Sessions (one call returns a hosted `checkout_url`; PayMongo's own page
handles GCash's redirect entirely; a webhook confirms the result). Checkout
Sessions is the right fit here: no card or GCash credentials ever touch
this server, one API call to start, and `PHASE6_PLAN.md`'s own sketch
already named the shape ("returns the PayMongo checkout URL") — this
decision makes that explicit rather than leaving it implicit.

### Decision 3 — at most one PENDING gateway intent per order

Same shape as Phase 5's `inventory_change_requests_one_pending_per_product_idx`
(migration 004): a partial unique index,
`payments_one_pending_per_order_idx ON payments (order_id) WHERE status =
'PENDING'`, added in migration 006. Without it, a customer double-clicking
"Pay with GCash," or opening the checkout link in two tabs, could create
two `PENDING` rows for the same order — and if both were somehow completed,
the order would be silently overpaid with no guard rail at all (Decision 9
explains why the webhook path cannot simply refuse an overpayment the way
the manual path does).

The route-level check (`SELECT ... WHERE order_id = $1 AND status =
'PENDING'`) is, as always in this codebase, a friendly pre-check — a 409
with a specific message — not the enforcement. The index is.

### Decision 4 — signature verification, exactly as PayMongo's own SDK does it, with two deliberate improvements

Read directly from `paymongo-node`'s `WebhookService.prototype.constructEvent`:

```js
// from PayMongo's own SDK source, quoted for the record
const arrSignature = signatureHeader.split(',')
const timestamp = arrSignature[0].split('=')[1]        // "t=..."
const testModeSignature = arrSignature[1].split('=')[1] // "te=..."
const liveModeSignature = arrSignature[2].split('=')[1] // "li=..."
const hmac = crypto.createHmac('sha256', webhookSecretKey)
const hmacData = hmac.update(timestamp + '.' + payload).digest('hex')
```

So: header `Paymongo-Signature`, value `t=<unix ts>,te=<test sig or
empty>,li=<live sig or empty>`, and the signed string is literally
`` `${timestamp}.${rawBody}` `` — HMAC-SHA256, hex digest. Whichever of
`te`/`li` is non-empty is the one to compare (PayMongo populates exactly
one, depending on whether the event was generated in test or live mode).

Two things this implementation does differently from PayMongo's own
reference, both deliberate and both worth stating rather than silently
"fixing":

1. **Constant-time comparison.** The reference SDK compares with `!=` — a
   plain string comparison, which is not constant-time and is a
   textbook timing side-channel (an attacker who can measure response
   latency precisely can, in principle, recover the correct signature one
   byte at a time). This implementation uses `crypto.timingSafeEqual` on
   the two hex digests instead.
2. **A replay window.** The reference SDK does not check the timestamp's
   age at all — a captured, genuinely-signed webhook payload could be
   replayed by an attacker at any point in the future and would still pass
   `constructEvent`. This implementation rejects any webhook whose `t` is
   more than 5 minutes from the server's current time. PayMongo's own docs
   state no specific tolerance; 5 minutes is this implementation's own
   judgment call, matching the widely-used precedent for this exact
   HMAC-with-timestamp scheme (the same shape Stripe's webhook signing
   uses, where 5 minutes is the documented default).

### Decision 5 — raw body capture via `express.json()`'s `verify` option, not a second body parser

The signed string requires the EXACT bytes PayMongo hashed — not
`JSON.stringify(JSON.parse(rawBody))`, which is not guaranteed
byte-identical (key order, whitespace, number formatting can all differ on
a round trip). `server/app.js` already applies `express.json()` globally,
before any router is mounted, and Express body parsers consume the request
stream exactly once — once `express.json()` has read it, a second,
route-level `express.raw()` on the webhook route alone would receive an
already-drained stream and produce an empty buffer. Restructuring so the
webhook route's raw parser runs BEFORE the global `express.json()` would
mean pulling that one route out of `routes/payments.js` and into `app.js`
directly, breaking the one-router-per-domain convention every other route
in this app follows.

The standard fix (the same one Stripe's own Express integration guide
recommends for this identical problem) is a `verify` callback on the
existing global parser:

```js
app.use(express.json({
  limit: '10kb',
  verify: (request, _response, buffer) => { request.rawBody = buffer },
}))
```

This runs for every request, but the cost is a Buffer reference sitting
unused on `request` for the 20-odd routes that never read it — not a copy,
not measurable overhead. Every route keeps `request.body` exactly as
before; only the webhook route additionally reads `request.rawBody`.

### Decision 6 — the webhook route is registered BEFORE the router's auth gate, in the same file

`routes/payments.js` currently opens with `router.use(requireAuth,
requireRole('ADMIN', 'CASHIER', 'CUSTOMER'))`, which applies to every route
registered after it in that file. PayMongo's webhook call carries no
session cookie — it is server-to-server, unauthenticated by definition
(`PHASE6_PLAN.md`, Decision 5, point 2). The fix is not a second router or
a different mount point (which would scatter payments logic across two
files, against "business logic must be centralized" from
`PHASES-RULES-PLANNING.md`) — Express matches routes in registration order
within one router, so the webhook route is registered ABOVE the
`router.use(requireAuth, ...)` line, in the same file, with a comment
explaining exactly why the order matters and what breaks if it moves
(a genuine, easy-to-reintroduce bug: move it below that line and every
webhook call starts 401ing).

A signature-verified webhook is its own authentication — it proves the
request came from PayMongo, which is a stronger and differently-shaped
guarantee than a session cookie proves a request came from a logged-in
user. It is not "no authentication," it is a different KIND of
authentication than every other route in this app uses.

### Decision 7 — the correlation key is `checkout_session_id`, stored as `gateway_reference`

The Payment resource nested inside a `payment.paid`/`payment.failed`
webhook event carries `checkout_session_id` directly on its own
attributes (confirmed from PayMongo's `PaymentDTO` schema, fetched during
planning). At intent-creation time, this implementation stores the
Checkout Session's own id (`cs_...`) in `payments.gateway_reference` on
the `PENDING` row it inserts. When the webhook arrives, it looks up the
row by `gateway_reference = <the event's checkout_session_id>` — no new
column, no separate mapping table, and `gateway_reference`'s existing
`UNIQUE` constraint (Pattern C, `PHASE6_PLAN.md`) is exactly the right
constraint for this value too: one checkout session can only ever produce
one `PENDING` row.

Reference numbers were considered and rejected for this role: PayMongo's
`reference_number` field lives on the Checkout Session's own attributes,
not on the nested Payment resource inside the webhook event (confirmed
from the Checkout Session Resource schema) — using it would mean an extra
lookup PayMongo's own webhook payload doesn't need to require.

### Decision 8 — webhook idempotency is the same conditional-UPDATE idiom already used four times in this codebase, no new idea needed

PayMongo redelivers webhooks on failure or timeout (their own
retry-logic documentation describes this) — the same event can arrive more
than once. The fix is the identical shape Phase 5 and Phase 6 already use
for "this must happen at most once": a conditional UPDATE with the
required source state in its own `WHERE` clause.

```sql
UPDATE payments SET status = 'PAID', payment_date = CURRENT_TIMESTAMP
 WHERE gateway_reference = $1 AND status = 'PENDING'
RETURNING order_id, amount
```

The first delivery finds the row `PENDING` and flips it. Every redelivery
after that finds the row already `PAID` (or `FAILED`), matches zero rows,
and is correctly treated as a no-op — not an error, not a second credit.
This is the fifth use of this exact pattern in the codebase (stock
deduction, the order status claim, change-request review, the Phase 6
overpayment guard), not a new one invented for this file.

### Decision 9 — a confirmed gateway payment is recorded even if it now overpays the order. This is a deliberate departure from Pattern B, not an oversight.

This is the one place this plan's research changed the sketch's own
premise, and it deserves to be stated plainly rather than discovered later.

Pattern B (`PHASE6_PLAN.md`) refuses a payment that would exceed the
balance — correct for the manual path, where a human is TYPING an amount
and can simply be told "that's too much, try again." The gateway path is
different in a way that matters: by the time the webhook fires, the
customer's money has ALREADY, irreversibly left their account and arrived
in PayMongo's settlement to this business. Refusing to write the `payments`
row at that point does not undo the transfer — it just makes the ledger
wrong in a WORSE way than an overpaid order does: an invisible gap between
money that genuinely arrived and what the system believes arrived, instead
of a visible, explainable, staff-correctable overpaid balance.

Concretely: intent creation validates the amount against the balance due
AT THAT MOMENT (same lock-then-check shape as Pattern A, using
`getBillingSummary`) and refuses to CREATE an intent for more than what's
owed. But time passes between intent creation and webhook confirmation —
long enough for a cashier to record a separate cash payment on the same
order in the meantime, shrinking the balance. If that happens, honoring the
already-agreed intent amount can land the order at a balance below zero.
The webhook handler records it anyway. It does not re-run Pattern B's
refusal.

This is not "the guard was forgotten" — it is "the guard does not apply
once real money has moved," and the two paths (manual recording of
something that already happened at a counter vs. gateway confirmation of
something that already happened electronically) are more alike than
Pattern B's original framing suggested. An overpaid order from a confirmed
gateway payment is a rare, visible condition (`balanceDue` goes negative,
`isFullyPaid` is trivially true) that staff can see and reconcile by hand;
silently dropping a confirmed payment is a financial discrepancy nobody
would notice until a customer disputes it.

---

## Schema changes (migration 006)

One change, and it needs the user's go-ahead the same way migration 005
did before Sonnet implements it — this document is the explanation `PHASES-
RULES-PLANNING.md` requires before a schema change, not the approval
itself.

```sql
BEGIN;

-- Phase 6.5, Decision 3 — at most one PENDING gateway-initiated payment per
-- order. Same shape as migration 004's
-- inventory_change_requests_one_pending_per_product_idx: a partial unique
-- index, not a plain one, so it constrains only PENDING rows and never
-- touches the PAID/FAILED/REFUNDED history an order accumulates.
--
-- Without this, a double-click on "Pay with GCash" (or the checkout link
-- opened in two tabs) could create two PENDING rows for one order. If both
-- were somehow completed, the order would be overpaid with no guard at
-- all -- Decision 9 explains why the webhook confirming a completed
-- payment cannot simply refuse to record it the way the manual path can.
-- Stopping the SECOND intent from ever being created is where this needs
-- to be prevented.
CREATE UNIQUE INDEX IF NOT EXISTS payments_one_pending_per_order_idx
  ON payments (order_id)
  WHERE status = 'PENDING';

COMMIT;
```

No new columns. `payments.gateway_reference`, `payments.status`
(`PENDING`/`FAILED` already exist in the `payment_status` enum, unwritten
until now per `PHASE6_PLAN.md` Decision 6), and `payments.recorded_by`
(already repointed at `users` by migration 005) cover everything this
phase needs.

---

## The two code patterns that matter

### Pattern D — verify the signature before anything else touches the request

```js
router.post('/webhook', express.raw ? undefined : undefined, async (request, response) => {
  // (illustrative shape only -- see server/lib/paymongo.js for the real function)
  let event
  try {
    event = verifyPaymongoWebhook({
      rawBody: request.rawBody,
      signatureHeader: request.headers['paymongo-signature'],
      webhookSecret: config.paymongo.webhookSecret,
    })
  } catch (error) {
    return response.status(400).json({ message: 'Invalid webhook signature.' })
  }
  // only now is `event` trusted enough to read
```

Nothing before signature verification may branch on the request body's
CONTENTS (only on its raw bytes, which are opaque until verified) — a
webhook is the one endpoint in this app any anonymous caller on the
internet can reach, so the ENTIRE point of Decision 4 is that the code
path from "bytes arrived" to "we know PayMongo sent this" touches nothing
else first.

### Pattern E — the webhook UPDATE is the trigger; the row it finds tells it what to do next

```js
const confirmed = await client.query(
  `UPDATE payments SET status = $1, payment_date = CURRENT_TIMESTAMP
    WHERE gateway_reference = $2 AND status = 'PENDING'
  RETURNING order_id, amount`,
  [event.type === 'payment.paid' ? 'PAID' : 'FAILED', checkoutSessionId],
)
if (confirmed.rowCount === 0) {
  // Redelivery of an already-resolved event, OR an event for a
  // gateway_reference this server never created a PENDING row for.
  // Both are a 200 -- PayMongo's retry logic treats anything but 2xx as
  // "try again later", and there is nothing to retry into here.
  await client.query('COMMIT')
  return response.status(200).json({ received: true })
}
```

Same shape as Pattern A/B: the conditional write decides the outcome,
`rowCount` is read afterward, not guessed at beforehand.

---

## Data flow

**Creating an intent:**

```
Customer (or staff) clicks "Pay with GCash" on an order with a balance
  -> POST /api/payments/intent  { orderId }
     -> requireAuth, requireRole('CUSTOMER','CASHIER','ADMIN')
        - a CUSTOMER may only do this for their OWN order (same ownership
          check GET /api/orders/:id already uses)
     -> BEGIN
        -> SELECT ... FROM orders WHERE order_id = $1 FOR UPDATE  [Pattern A]
           - 404 if missing, 409 if CANCELLED
        -> getBillingSummary(client, orderId)
           - 409 if isFullyPaid (nothing left to pay)
           - amount = balanceDue (the full remaining balance -- see below)
           - 422 if amount < PHP 100.00 (PayMongo's own stated minimum)
        -> POST to PayMongo: create Checkout Session
           (Idempotency-Key: a fresh UUID per attempt)
           - network/4xx/5xx failure here -> ROLLBACK, 502 "payment
             provider unavailable, try again"
        -> INSERT INTO payments (..., status='PENDING',
             gateway_reference=<checkout session id>)
           - 23505 on payments_one_pending_per_order_idx -> ROLLBACK, 409
             "a payment attempt for this order is already in progress"
        -> COMMIT
     -> 201 { checkoutUrl }
  -> browser redirects the customer to checkoutUrl (PayMongo-hosted page)
```

The amount is always the FULL current balance, not a customer-chosen
partial figure — Phase 6's manual path lets a cashier record a partial
payment because a human is present to judge that; an unattended online
checkout defaults to "pay what's owed" rather than opening a UI for
choosing a partial online payment, which is out of scope here.

**The webhook:**

```
PayMongo's server -> POST /api/payments/webhook
  -> [registered BEFORE requireAuth -- Decision 6]
  -> verify Paymongo-Signature against request.rawBody  [Pattern D]
     - malformed header, bad HMAC, or timestamp >5min old -> 400
  -> only "payment.paid" and "payment.failed" are handled; every other
     event type -> 200 immediately (acknowledged, ignored -- this endpoint
     is registered for the whole webhook, PayMongo does not let you
     subscribe per-event-type at the URL level)
  -> BEGIN
     -> conditional UPDATE keyed on gateway_reference = checkout_session_id
        [Pattern E]
        - rowCount 0 -> COMMIT, 200 (redelivery or unknown reference)
     -> COMMIT
  -> 200 { received: true }
```

Note what is deliberately NOT here: no order-row lock, no re-run of
Pattern B's overpayment refusal. Decision 9 is why.

## Files affected

**New**

- `database/migrations/006_one_pending_payment_per_order.sql`
- `server/lib/paymongo.js` + `server/lib/paymongoExplanation.js` —
  `createCheckoutSession()` and `verifyPaymongoWebhook()`. Every
  PayMongo-specific HTTP/crypto detail lives here, nowhere else.
- `server/lib/paymongo.test.js` — signature verification tested directly
  with hand-crafted payloads and a fake shared secret; no network calls.
- `server/routes/payments.test.js` — new tests for `POST /intent` and
  `POST /webhook`, appended to the existing describe block (same product/
  users/cookies already set up there).

**Modified**

- `server/config.js` — `config.paymongo = { secretKey, webhookSecret,
  successUrl, cancelUrl }`, read from `process.env`, `undefined` when
  unset (never a bare "" default that could look like a working key).
- `.env.example` — the four new variable names, with a comment on the
  PayMongo dashboard section to find them in (see the note at the end of
  this document).
- `server/app.js` — the `verify` callback on the existing `express.json()`
  call (Decision 5). No new router mount; the webhook route lives inside
  the existing `paymentsRouter`.
- `server/routes/payments.js` + twin — `POST /intent`, `POST /webhook`,
  registered in that order, both ABOVE the existing `router.use(requireAuth,
  ...)` line (Decision 6). `POST /intent` needs `getBillingSummary` and
  `pool`, already imported.
- `src/pages/dashboard/PaymentBilling.jsx` — a "Pay with GCash" button
  next to the existing cash/GCash-reference form, visible whenever
  `canRecordPayment` is true (reusing that exact condition), for CUSTOMER
  as well as staff. Redirects `window.location` to the returned
  `checkoutUrl`.

**Deliberately untouched**

- `routes/orders.js`'s Decision 7/8 logic and `lib/billing.js`. A
  gateway-confirmed `PAID` row is indistinguishable from a manually
  recorded one once it lands — `getBillingSummary` already sums any `PAID`
  row regardless of how it got there, so COMPLETED-requires-full-payment
  and cancel-refunds-a-paid-order both already work correctly against a
  gateway payment with no changes.
- `payments.payment_method` stays `'GCASH'` for a gateway-confirmed row —
  the same value the manual path already writes. No new enum value, no new
  column distinguishing "how" a GCash payment was confirmed.

---

## Build order

**Step 0 — migration 006.** Needs the user's go-ahead before applying,
same as migration 005.

**Step 1 — `lib/paymongo.js`, tested in isolation.** `createCheckoutSession`
and `verifyPaymongoWebhook`, with `paymongo.test.js` proving signature
verification (valid signature accepted; tampered body rejected; wrong
secret rejected; expired timestamp rejected; malformed header rejected) —
all synthetic, no network access, all runnable today with no PayMongo
account at all.

**Step 2 — `POST /api/payments/webhook`.** Built and tested before
`/intent` exists, deliberately — the harder, security-sensitive route
first, proven against crafted requests standing in for real ones.

**Step 3 — `POST /api/payments/intent`.** The one route that DOES need
real credentials to fully exercise (creating a real Checkout Session). Its
own validation (balance check, minimum amount, CANCELLED/fully-paid
refusal, the partial unique index) is tested without ever calling
PayMongo, by having the test double the network call.

**Step 4 — the frontend button.** Small; a link that redirects, not a form.

**Step 5 — the `.env` wiring note**, so the user can drop in real keys
whenever they find them, with nothing else to change.

---

## Testing checklist

Add to the existing suite (158 passing at the end of the Phase 6 review).

- A valid signature is accepted; the SAME payload with one byte flipped is
  rejected.
- A correctly-signed payload, signed with the WRONG secret, is rejected.
- A correctly-signed payload whose timestamp is 10 minutes old is rejected
  (replay window).
- A malformed `Paymongo-Signature` header (missing a part, wrong
  delimiter) is rejected with 400, never a 500.
- `payment.paid` flips a matching PENDING row to PAID; a SECOND delivery
  of the identical event is a no-op, not a second credit (Decision 8).
- `payment.failed` flips PENDING to FAILED, and a subsequent real payment
  attempt for that order is unaffected — a FAILED row does not count
  toward `amountPaid`.
- A webhook whose `checkout_session_id` matches no `payments` row (never
  created here, or already resolved) still returns 200, not 404 — PayMongo
  must never see this as something worth retrying.
- `POST /intent` refuses a second attempt while one is already PENDING for
  the same order (both the friendly pre-check AND, driven directly like
  Phase 5's equivalent test, the partial unique index itself under two
  concurrent inserts).
- `POST /intent` refuses an order that's CANCELLED, or already fully paid.
- `POST /intent` refuses a balance under PHP 100.00.
- A customer may create an intent for their own order; may NOT for
  someone else's.
- **Decision 9's behaviour is itself tested**: create a PENDING intent for
  the full balance, record an unrelated cash payment on the SAME order
  (shrinking the balance), then confirm the webhook — the payment is
  recorded in FULL (not capped, not refused), and `balanceDue` is
  confirmed to read as negative afterward. This is the test most likely to
  look "wrong" to a future reader without this plan open next to it, so it
  gets an explicit comment pointing back to Decision 9, not just an
  assertion.

---

## Where to find the PayMongo test-mode keys

For when the user is ready: in the PayMongo Dashboard, test-mode keys live
under **Developers → API Keys**, with the mode switch (Test/Live) in the
dashboard's top corner set to **Test**. The secret key starts `sk_test_`.
The webhook signing secret is separate — created under **Developers →
Webhooks**, "Add endpoint" (the URL only needs to be real once a tunnel is
running; PayMongo will show the signing secret at creation time, starting
`whsk_`). Both go in `.env`, never committed, never in any frontend file —
exactly the existing rule this repo already follows for `PGPASSWORD`.

---

## Closed in review (Phase 6.5 as built)

Three defects found reviewing the implementation, all reproduced with
measurements before being fixed and all now covered by regression tests
that were confirmed to fail against the unfixed code.

- **`/intent` held a database lock across the PayMongo network call.** The
  first implementation opened a transaction, took `FOR UPDATE` on the
  order, and only then called PayMongo — holding both the row lock and a
  pooled connection for the whole internet round trip. Measured with
  PayMongo stubbed at 3s: an unrelated cash payment on the same order
  blocked for **2542ms**, and with 12 such calls in flight a plain
  `GET /api/products` took **2330ms** because pg's pool (default max 10)
  was exhausted. The second number is the serious one — a slow payment
  provider stalling the *entire API*, not just the order being paid for.
  Restructured into three phases: validate holding nothing, call PayMongo
  holding nothing, then take the lock only to re-check and insert. After:
  **211ms** and **103ms**. The cost is that a checkout session can be
  created and then not used if the re-check refuses it; an unused checkout
  link expiring unused is a far better outcome than stalling the system.
- **No timeout on the PayMongo call.** Node's `fetch` has no default
  overall request timeout, so a provider that accepted the connection and
  never answered would hang the request forever. Now bounded at 15s via
  `AbortSignal.timeout`, and every "no response arrived" failure
  (timeout, DNS, refused connection) is converted to the same
  `PaymongoApiError` a non-2xx produces, so it surfaces as a 502 rather
  than escaping as a 500.
- **The webhook 500'd when no secret was configured** — the app's default
  state, since no PayMongo credentials exist here yet. `undefined` reached
  `crypto.createHmac('sha256', undefined)`, which throws a `TypeError`
  rather than a `PaymongoWebhookVerificationError`, escaping the handler's
  catch. That made the one endpoint any anonymous caller on the internet
  can reach reliably crashable. Now a clean 503 before anything touches
  the request.

## Known gaps deliberately left open

- **An abandoned PENDING intent blocks a new gateway attempt for that
  order indefinitely** (Decision 3's trade-off). No expiry, no
  cancel-intent endpoint in this phase. The manual path remains the
  escape hatch. A natural next increment, not built here.
- **No live end-to-end test performed.** Everything is proven against
  synthetic requests; the first real Checkout Session this code creates
  will be the user's own, whenever they're ready with keys and (optionally)
  a tunnel.
- **Only GCash.** Widening `payment_method_types` to cards or other
  e-wallets is a one-line change but is not this phase's job.
- **The webhook trusts the stored amount, not the amount PayMongo
  reports.** When a `payment.paid` event arrives, the `PENDING` row is
  flipped to `PAID` at whatever amount was recorded when the intent was
  created; the `amount` on the event's own Payment resource is never
  compared against it. With Checkout Sessions the amount is fixed at
  session creation, so the two cannot diverge today — but that is an
  assumption about PayMongo's behaviour, not something this code checks.
  If features like partial capture or pass-on-fees are ever enabled, this
  needs revisiting, and a mismatch check would be the natural guard.
- **`success_url`/`cancel_url` both point at the app's root**, not a
  deep link back to the specific order. This app has no client-side
  routing at all yet (`Dashboard.jsx` switches views with in-memory state,
  not a URL) — Phase 6.5 inherits that limitation rather than fixing it.
  The redirect is UX only; the webhook, not the redirect, is the source of
  truth for whether payment succeeded, so the receipt screen should read
  as "if you just paid, refresh in a moment" rather than assuming instant
  consistency with the redirect.
- **Carried forward from Phase 6**: no `inventory_movements`/`stock_alerts`
  read path; a COMPLETED order still cannot be refunded (confirmed as a
  deliberate business rule, not a gap, in the Phase 6 review).
