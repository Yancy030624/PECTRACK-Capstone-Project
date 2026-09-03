# Phase 6 — Payment & Billing: implementation plan

This document is the agreed design for Phase 6, written at the end of the
Phase 5 review so the decisions survive a model/session change instead of
being re-derived. Read it before writing Phase 6 code.

It assumes the conventions already in this repo: Express 5 (async errors are
auto-forwarded), `node:test` against a real database, one `*Explanation.js`
study twin per real file kept in sync, and `database/migrations/` for changing
a database that already holds data.

**Read `PHASE5_PLAN.md` first, especially the correction inside Pattern C.**
Every defect found in the Phase 5 review was one mistake wearing different
clothes, and Phase 6 is full of places to repeat it. That mistake is restated
as Pattern A below because it is the single most important thing in this file.

`PHASES-RULES-PLANNING.md` is the authority on phase boundaries and the
development rules; this document implements its **Phase 6 — PAYMENT**
(payment records, payment status, cash payment, online payment, PayMongo
integration, payment verification). Everything in that list is covered across
Phase 6 and Phase 6.5 — see Decision 5 for why the split exists and where the
line falls.

---

## Scope

**In scope**

- Recording a payment against an order (cash at the counter, or GCash
  confirmed by reference number).
- Showing what an order has been paid, and what it still owes.
- Refusing an order to be marked `COMPLETED` while money is still owed.
- Refunding when a paid order is cancelled.
- A billing / receipt view per order.
- The Payment & Billing screen, which is currently a nav stub falling through
  to `DashboardHome`.

**Explicitly out of scope for Phase 6**

- **Live PayMongo API integration.** Moved to **Phase 6.5**, which follows
  this one immediately — not dropped. See Decision 5 for the sequencing and
  what Phase 6 leaves ready for it.
- Delivery, proof of delivery, reporting, analytics, AI.
- Partial refunds. A refund in Phase 6 reverses one whole payment row.
- Discounts, vouchers, taxes, service charges. `total_amount` is the sum of
  the line items and nothing else, exactly as Phase 4 left it.
- Cash drawer / change calculation. This is an OMS, not a POS
  (PROJECT_CONTEXT) — the system records that ₱500 was received, it does not
  manage the physical till.

---

## Decisions

### Decision 1 — an order's paid amount is derived, never stored

`payments.order_id` has no `UNIQUE` constraint, and that is correct rather
than an oversight. One order legitimately produces several payment rows: a
deposit then the balance, or a failed GCash attempt then a successful one.

So "has this order been paid?" is a question answered by
`SUM(amount) WHERE status = 'PAID'`, not by reading a column.

Do **not** add `orders.amount_paid`. It would be a second source of truth
that can drift from the rows it summarises — the exact problem
`orders.total_amount` already avoids by being summed in Postgres from
`order_details` (commit `3194f5b`, and the long comment in `routes/orders.js`
explaining it). Same reasoning, same answer: whatever was really written is
what gets counted.

### Decision 2 — recording a payment is a read-modify-write, so the order row must be locked

To decide whether a ₱200 payment is allowed, you must know what is already
paid. That is a read, followed by a decision, followed by a write — the exact
shape that produced three separate Phase 5 defects.

Two cashiers recording payment for the same ₱500 order at the same moment
both read "₱0 paid", both conclude ₱500 is acceptable, and both insert. The
order is now paid ₱1000 and the bakery owes a refund it has no record of
owing.

The fix is Pattern A below. Note **which** row gets locked: `orders`, not
`payments`. There is no single payments row to lock — the thing being
protected is the aggregate over a collection, and locking the parent row is
what serialises writes to its children.

### Decision 3 — underpayment is allowed, overpayment is refused

Partial payment is real: a customer ordering 50 cupcakes may leave a deposit
and pay the balance on pickup. Decision 1 makes this free — several rows
summing to the total is already the model.

Overpayment is always an error. If a customer hands over ₱1000 for a ₱500
order, the bakery gives ₱500 back in cash; it does not record a ₱1000
payment. So the rule is:

    amount_already_paid + this_amount  <=  orders.total_amount

Violations are a clean 409, never a 500.

A payment of exactly `0` is also refused, at validation. The column's
`CHECK (amount >= 0)` permits it, but a zero payment records nothing that
happened and would let anyone fill the table with meaningless rows.

### Decision 4 — payment methods are validated in code, not by a new enum

`payments.payment_method` is `VARCHAR(50)` in the approved thesis schema, not
an enum. Phase 6 accepts exactly two values:

    CASH    — money received at the counter
    GCASH   — confirmed against a reference number from the customer's receipt

Validate against a `Set` in the route, the same way `manualMovementReasons`
is handled in `routes/inventory.js`. Converting the column to a Postgres enum
would be a schema change that buys nothing the allow-list does not already
guarantee at the API boundary, and it would make adding a method later a
migration instead of a one-line change.

### Decision 5 — PayMongo is built in Phase 6.5, immediately after this phase

`PHASES-RULES-PLANNING.md` scopes "Online payment" and "PayMongo
integration" into Phase 6. **They are not being cut** — they are being
sequenced second, as Phase 6.5, against a record layer that is already
proven. Phase 6 plus Phase 6.5 together deliver the written Phase 6 in full.

The reason is dependency order, not scope reduction. A gateway webhook's job
is to *write a payment row*, so it needs the order lock (Pattern A), the
overpayment guard (Pattern B), and the idempotency key (Pattern C) to
already be correct and tested. Building it alongside them means debugging two
unproven layers at once, through an endpoint that a localhost dev server
cannot even receive a request on. It also runs straight into the rule "do
not implement multiple large modules simultaneously".

The three things Phase 6.5 walks into, recorded here so the phase that builds
it is not surprised:

1. A live gateway confirms payment by calling a **webhook** — a public HTTPS
   URL it can reach. A localhost dev server cannot receive one without a
   tunnel, so the flow cannot be exercised or tested the way every other
   route in this repo is.
2. A webhook endpoint is **unauthenticated by definition**. It needs
   signature verification, replay protection, and careful idempotency, and it
   sits on an app whose documented known gaps already include no CSRF tokens
   and no rate limiting. That is a security surface worth its own phase.
3. Rule 6: one module at a time.

What Phase 6 builds instead is the **record layer a gateway plugs into**, and
the schema is already shaped for it. `payments.gateway_reference` is
`UNIQUE`, which is exactly the idempotency key a webhook needs, and
`payment_status` already carries `PENDING` and `FAILED` for the async flow.

So GCash in Phase 6 means: the customer pays through GCash on their own
phone, shows the cashier the reference number, and the cashier records it.
The reference goes in `gateway_reference`, whose `UNIQUE` constraint is what
stops the same receipt being claimed twice.

**The one thing to preserve while implementing Phase 6:** do not "simplify
away" `gateway_reference`, `PENDING`, or `FAILED` because nothing writes them
yet. They are the exact seams Phase 6.5 attaches to, and Pattern C already
depends on the first of them.

#### What Phase 6.5 will add

Sketched, not planned — it gets its own document, written the same way this
one was. Recorded now so the boundary is a deliberate line rather than a
vague "later":

- `POST /api/payments/intent` — creates a `PENDING` row and returns the
  PayMongo checkout URL.
- `POST /api/payments/webhook` — unauthenticated by necessity, so it needs
  signature verification against the PayMongo secret, replay protection, and
  idempotency keyed on `gateway_reference`. It flips `PENDING` to `PAID` or
  `FAILED` and must reuse the same overpayment guard, not a second copy of
  it (rule: no duplicated business logic across routes).
- A tunnel for local development, since a webhook cannot reach `localhost`.
- Secrets in environment configuration only, never in frontend code.

Everything above writes through the same `payments` table Phase 6 builds. No
schema change is expected beyond migration 005.

### Decision 6 — `PENDING` and `FAILED` payment rows are reserved, not written

Every payment Phase 6 records is money that has **already changed hands** —
cash in the drawer, or a GCash transfer the cashier can see. There is no
waiting period, so every row is inserted as `PAID` directly.

`PENDING` and `FAILED` belong to the gateway flow, so Phase 6.5 is what
starts writing them: an intent is created `PENDING` and the webhook resolves
it to `PAID` or `FAILED`. Until then they stay unwritten and documented as
reserved, the same way `orders.requires_admin_approval` was handled in Phase
5 rather than deleted or quietly filled with a meaningless value.

This is why Phase 6 must not narrow the `payment_status` enum or default rows
to something else for convenience — a phase away, those two values carry the
whole asynchronous flow.

### Decision 7 — `COMPLETED` requires the order to be fully paid

An order management system should not let staff mark an order complete while
money is owed. `PATCH /api/orders/:id` gains one rule: a transition to
`COMPLETED` is refused with a 409 unless the balance due is zero.

This touches Phase 5 code. It must go **inside** the transaction, after the
status claim, using the locked order row — see Pattern A. Checking it before
the transaction would reproduce the exact bug the Phase 5 review fixed.

`CANCELLED` is deliberately not subject to this rule; see Decision 8.

### Decision 8 — cancelling a paid order is admin-only, and refunds it

Phase 5 made `CANCELLED` terminal and made it restore stock. Money needs the
same treatment: cancelling an order the customer has paid for must not
silently keep their money.

- An order with **no** `PAID` payments cancels exactly as it does today.
  Nothing changes for the customer self-cancel path, which in practice always
  applies to unpaid `PLACED` orders — for pickup, payment happens at the
  counter.
- An order **with** `PAID` payments may only be cancelled by an **ADMIN**. A
  cashier or customer gets a 409 explaining that a refund is involved and an
  admin has to handle it.
- When an admin cancels such an order, every `PAID` row for it flips to
  `REFUNDED` in the same transaction, recording who did it and why.

A refund is a **status change on the existing row**, not a new negative row:
`payments.amount` has `CHECK (amount >= 0)`, so a negative row is impossible
by design, and `payment_status` already has `REFUNDED` for precisely this.

Flipping a status without recording who and when is the mistake Phase 5's
Decision 1 exists to prevent, so migration 005 adds the audit columns for it.
A full `payment_status_history` table mirroring `order_status_history` would
be the maximally consistent choice, but it is over-engineering here: unlike
an order, a payment has exactly **one** status transition that ever matters
(`PAID` → `REFUNDED`). Three columns record it completely.

---

## Schema changes (migration 005)

The rule is "do not change database tables, columns, relationships, or
constraints without explaining why first". The two changes below are that
explanation, and each states its reasoning inline rather than in a commit
message nobody will read again. Neither change touches an existing
relationship that other code depends on, and both are additive to how
`payments` is read.

Write them into `database/migrations/005_payment_audit.sql` AND fold them
into `database/schema.sql`, then add a row to the migration table in
`database/README.md`, per the convention in that file.

All four Phase 6/7 tables (`payments`, `deliveries`, `delivery_proofs`,
`report_logs`) were verified **empty** at the time of writing, so no data
remapping is needed. **Verify that is still true before applying**, and stop
if it is not — the `recorded_by` change below silently loses its meaning if
rows already hold cashier ids.

```sql
BEGIN;

-- 1. recorded_by should reference users, not cashiers.
--
-- An ADMIN can record a payment, and MUST be able to record a refund
-- (Decision 8) — but admins have no cashier_id, so the current FK forces
-- their audit trail to be NULL. Exactly the reasoning that put
-- users(user_id) on order_status_history.updated_by and
-- inventory_movements.changed_by: when an action can be taken by more than
-- one kind of staff, the audit column has to point at the table they all
-- share.
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_recorded_by_fkey;
ALTER TABLE payments
  ALTER COLUMN recorded_by TYPE BIGINT,
  ADD CONSTRAINT payments_recorded_by_fkey
    FOREIGN KEY (recorded_by) REFERENCES users(user_id);

-- 2. Refund audit.
--
-- A refund flips PAID -> REFUNDED. Changing a money figure's meaning without
-- recording who and why is the same defect the inventory_movements ledger
-- exists to prevent (PHASE5_PLAN.md, Decision 1). A payment has exactly one
-- transition worth auditing, so three columns cover it without a history
-- table.
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS refunded_by BIGINT REFERENCES users(user_id),
  ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refund_reason TEXT;

COMMIT;
```

Write it to be safe to re-run, like migrations 001–004 (`IF NOT EXISTS` /
`IF EXISTS` where available).

**No unique constraint is added on `(order_id)`.** That is Decision 1 — an
order having several payment rows is the design, not a defect to constrain
away.

---

## The three code patterns that matter

### Pattern A — lock the order row, then decide, inside one transaction

This is the most important piece of Phase 6, and it is the generalised
lesson of the entire Phase 5 review: **a condition read outside the
transaction can only produce a friendlier error message, never a guarantee.**

Recording a payment, completing an order, and refunding on cancellation are
all read-modify-writes over the same aggregate. All three must open the
transaction by locking the order row:

```js
const client = await pool.connect()
try {
  await client.query('BEGIN')

  // The lock. Everything below reads a figure derived from this order and
  // then writes based on it, so nothing else may move it in between.
  const orderResult = await client.query(
    'SELECT order_id, status, total_amount FROM orders WHERE order_id = $1 FOR UPDATE',
    [orderId],
  )
  const order = orderResult.rows[0]
  if (!order) { await client.query('ROLLBACK'); return response.status(404).json({ message: 'Order not found.' }) }
  ...
```

**Lock first, then aggregate in a separate statement.** Be aware of exactly
what Postgres does and does not allow here, because the two look similar:

    SELECT o.order_id,
           (SELECT COALESCE(SUM(p.amount), 0) FROM payments p WHERE p.order_id = o.order_id)
      FROM orders o WHERE o.order_id = $1 FOR UPDATE;     -- allowed

    SELECT o.order_id, COALESCE(SUM(p.amount), 0)
      FROM orders o LEFT JOIN payments p ON p.order_id = o.order_id
     WHERE o.order_id = $1 GROUP BY o.order_id FOR UPDATE; -- ERROR 0A000

A scalar aggregate **subquery** alongside `FOR UPDATE` is fine; `FOR UPDATE`
with a `GROUP BY` is rejected outright ("FOR UPDATE is not allowed with GROUP
BY clause"). Both forms were run against this database to confirm it.

Either write the first form, or keep the lock and the sum as two statements
on the same client — the lock is held for the rest of the transaction either
way, so both are correct. Two statements is the clearer default; just do not
reach for the `GROUP BY` shape and then work around the error by dropping the
lock, which would quietly reintroduce Decision 2's bug.

### Pattern B — make the overpayment guard a CONDITIONAL INSERT

The lock in Pattern A makes the arithmetic safe. Do the arithmetic **in
Postgres** anyway, by putting the guard in the INSERT itself:

```js
const recorded = await client.query(
  `INSERT INTO payments (order_id, recorded_by, payment_method, amount, status, gateway_reference, payment_date)
   SELECT $1, $2, $3, $4::numeric, 'PAID', $5, CURRENT_TIMESTAMP
    WHERE $4::numeric <= (
      SELECT o.total_amount - COALESCE((
        SELECT SUM(p.amount) FROM payments p WHERE p.order_id = $1 AND p.status = 'PAID'
      ), 0)
      FROM orders o WHERE o.order_id = $1
    )
   RETURNING payment_id`,
  [orderId, request.user.id, method, amount, gatewayReference],
)
if (recorded.rowCount === 0) {
  await client.query('ROLLBACK')
  return response.status(409).json({ message: 'That is more than this order still owes.', errors: { amount: '...' } })
}
```

`rowCount === 0` IS the "overpayment" signal — the same shape as Phase 5's
stock deduction (`PHASE5_PLAN.md`, Pattern A), the order status claim, and
the change-request review. Three routes already use it; make this the fourth
rather than inventing a different idiom.

It also keeps every peso inside `NUMERIC`. Money must never be compared or
summed in JavaScript: `pg` returns `NUMERIC` as a **string** precisely
because JS numbers are binary floating point, and `'500.00' > '1000.00'` is
`true` under string comparison. `routes/orders.js` already sums totals in
Postgres for this reason — the long comment there is worth re-reading.

### Pattern C — `gateway_reference` UNIQUE is the double-payment guard

A GCash reference number identifies one real transfer. If a cashier records
the same receipt twice — a mis-click, or a customer presenting it at two
counters — the order is credited for money that arrived once.

`payments.gateway_reference` is already `UNIQUE`, so the database refuses it.
Catch the violation and turn it into a clean 409, exactly as
`routes/inventory.js` now does for
`inventory_change_requests_one_pending_per_product_idx`:

```js
if (error.code === '23505' && error.constraint === 'payments_gateway_reference_key') {
  return response.status(409).json({ message: 'That GCash reference has already been recorded.' })
}
throw error
```

Confirm the real constraint name against the database rather than trusting
this one — a bare `code === '23505'` check would swallow unrelated violations
and mislabel them.

`UNIQUE` permits many `NULL`s in Postgres, so cash payments (which have no
reference) are unaffected. Send `NULL`, never `''` — an empty string would
collide with the next cash payment.

---

## Data flow

`PHASES-RULES-PLANNING.md` requires the data flow and the affected files to
be explained before a significant feature is implemented. Both sections
below exist for that, and they are also the fastest way for an implementer to
see whether they have missed a call site.

**Recording a payment** — the path that matters most, because it is the one
with the race:

```
Cashier fills the payment form
  -> POST /api/payments  { orderId, method, amount, gatewayReference? }
     -> requireAuth, requireRole('CASHIER', 'ADMIN')
     -> validate: method in {CASH, GCASH}, amount > 0, integer-safe id
     -> BEGIN
        -> SELECT ... FROM orders WHERE order_id = $1 FOR UPDATE   [Pattern A]
           - 404 if missing, 409 if CANCELLED
        -> INSERT INTO payments ... WHERE amount <= balance_due    [Pattern B]
           - rowCount 0 -> ROLLBACK, 409 overpayment
           - 23505 on gateway_reference -> ROLLBACK, 409 duplicate [Pattern C]
        -> COMMIT
     -> 201 { payment, balanceDue, isFullyPaid }
  -> UI refetches the order; receipt view shows the new balance
```

**Completing an order** (Decision 7) — the balance check joins the Phase 5
status claim inside the same transaction:

```
PATCH /api/orders/:id { status: 'COMPLETED' }
  -> BEGIN
     -> UPDATE orders SET status ... WHERE status = ANY(...)  [Phase 5 claim]
        - rowCount 0 -> 409
     -> SELECT balance due for this order            <- NEW, after the claim
        - balance > 0 -> ROLLBACK, 409 "still owes"
     -> INSERT order_status_history
     -> COMMIT
```

**Cancelling a paid order** (Decision 8) — reuses the same claim, then the
Phase 5 stock restore, then the refund:

```
PATCH /api/orders/:id { status: 'CANCELLED' }
  -> BEGIN
     -> claim the transition                          [Phase 5, unchanged]
     -> SELECT paid total for this order              <- NEW
        - paid > 0 AND role != ADMIN -> ROLLBACK, 409 "an admin must refund"
     -> restore stock + inventory_movements           [Phase 5, unchanged]
     -> UPDATE payments SET status='REFUNDED', refunded_by, refunded_at  <- NEW
     -> INSERT order_status_history
     -> COMMIT
```

Note the ordering in the last two: the balance and refund checks go **after**
the status claim, never before it. Putting them before would mean reading a
figure the claim has not yet frozen — the precise mistake the Phase 5 review
corrected in three separate places.

## Files affected

**New**

- `database/migrations/005_payment_audit.sql`
- `server/routes/payments.js` + `server/routes/paymentsExplanation.js`
- `server/routes/payments.test.js`
- `server/lib/billing.js` + `server/lib/billingExplanation.js` — one shared
  "what does this order owe" helper. It is needed by `POST /api/payments`,
  `GET /api/orders/:id`, and both branches of `PATCH /api/orders/:id`, and
  the rule "avoid duplicated business logic across routes" means it must not
  be written four times. Model it on `lib/inventory.js`: takes a `client`, so
  callers can run it inside their own transaction.
- `src/pages/dashboard/PaymentBilling.jsx` (and a receipt component if it
  grows past ~200 lines — see the inventory split)

**Modified**

- `database/schema.sql`, `database/README.md` — fold in migration 005
- `server/app.js` — mount `/api/payments`
- `server/routes/orders.js` + twin + tests — Decisions 7 and 8, inside the
  existing transaction in `PATCH /:id`; payment summary on `GET /:id`
- `src/pages/dashboard/Dashboard.jsx` — replace the `DashboardHome` fallback
  for 'Payment & Billing'

**Deliberately untouched**

- `server/lib/inventory.js` and the Phase 5 stock paths. Phase 6 adds rules
  *around* cancellation; it must not change how stock is restored.
- `src/pages/dashboard/modules.js` — 'Payment & Billing' is already listed
  with roles `ADMIN`, `CUSTOMER`, `CASHIER`.

## Build order

Each step is independently testable, and the risky one sits in the middle.

**Step 0 — migration 005.** Verify `payments` is still empty (see the schema
section — stop if it is not). Apply, fold into `schema.sql`, add the README
row. The migration was dry-run against this database during planning: it
applies cleanly, is safe to re-run, and was rolled back afterwards, so it is
**not** yet applied.

**Step 1 — read-only billing.** `GET /api/orders/:id` gains a `payment`
object: `totalAmount`, `amountPaid`, `balanceDue`, `isFullyPaid`, and the
list of payment rows. Plus `GET /api/payments` (admin + cashier) listing
payments with their order. No writes yet — this settles the response shape
and the UI before anything risky exists.

**Step 2 — `POST /api/payments`.** Cashier + admin. Patterns A, B and C
together. This is the risky step. Refuse payment on a `CANCELLED` order.

**Step 3 — `COMPLETED` requires full payment.** Decision 7, inside the
existing transaction in `PATCH /api/orders/:id`, after the status claim.

**Step 4 — refund on cancellation.** Decision 8. Steps 3 and 4 both modify
Phase 5's status handler; do them together and re-run the Phase 5 race tests
afterwards, not just the new ones.

**Step 5 — the Payment & Billing screen.** Replace the `DashboardHome`
fallback in `src/pages/dashboard/Dashboard.jsx` with a real component. Follow
the split already made for inventory: `InventoryManagement.jsx` +
`InventoryRequests.jsx` rather than one file doing everything. A receipt view
per order and a payments list are two components, not one.

---

## Testing checklist

Add to the existing suite (136 passing at the end of the Phase 5 review). The
ones that actually earn their keep:

- Recording a payment updates `balanceDue`, and the row is `PAID`.
- A partial payment leaves a balance; a second payment clears it.
- Overpaying in one go is refused with 409, and no row is written.
- Overpaying **across two payments** is refused (₱300 then ₱300 on a ₱500
  order).
- **Two simultaneous payments for the same order cannot exceed the total.**
- The same `gateway_reference` cannot be recorded twice.
- Two cash payments with no reference are both fine (the `NULL` case).
- A payment of `0`, a negative amount, and an unknown method are all 422.
- Recording a payment against a `CANCELLED` order is refused.
- `COMPLETED` is refused while a balance is owed, and allowed once it is zero.
- Cancelling an unpaid order still works for a customer, exactly as before.
- Cancelling a **paid** order is refused for cashier and customer, allowed
  for admin, and flips its payments to `REFUNDED` with `refunded_by` set.
- The Phase 5 race tests still pass — `six simultaneous cancels of one order
  restore its stock exactly once` in particular, since Step 4 edits that path.

### On writing the concurrency tests

Two of the concurrency tests written during the Phase 5 review **passed
against the broken code** on the first attempt and had to be rewritten. Do
not repeat that:

- Firing concurrent `fetch` calls and hoping they interleave is unreliable.
  The four-concurrent-proposals test passed with the guard removed, every
  time, and proved nothing.
- Drive the contention deliberately instead. Hold a transaction open on a
  second `pool.connect()` client so the route under test genuinely blocks,
  and where the route only blocks partway, poll `pg_stat_activity` for
  `wait_event_type = 'Lock'` before releasing it. Both rewritten tests then
  failed 5/5 against the unfixed code.
- **A race test that has never been observed to fail is not yet a test.**
  Temporarily break the fix, confirm the test goes red, then restore it.

---

## Housekeeping while you are in there

- Keep the `*Explanation.js` twins in sync as you go. They drift silently;
  the Phase 5 review found all three stale. A comment-stripped `diff` between
  a file and its twin should show no difference in executable code.
- `src/pages/dashboard/modules.js` already lists 'Payment & Billing' with
  roles `ADMIN`, `CUSTOMER`, `CASHIER`. A customer should see their own
  bills, not the full payments list — scope it the same way `GET /api/orders`
  scopes a customer to their own orders.
- Mount the new router in `server/app.js` alongside the other seven.

---

## Known gaps deliberately left open

Carried forward from Phase 5 and still true, plus the new ones this phase
creates. These are documented trade-offs, not defects to be surprised by.

- **No live payment gateway until Phase 6.5** (Decision 5). Between the two
  phases, "paid" means a member of staff asserted it. The `UNIQUE` reference
  stops the same receipt being recorded twice, but nothing verifies the
  reference corresponds to a real GCash transfer. This is the one gap that
  closes by design rather than by decision, and it is why Phase 6.5 follows
  immediately rather than sitting at the end of the backlog.
- **No partial refunds.** A refund reverses one whole payment row.
- **A COMPLETED order cannot be refunded — decided, not overlooked.** The
  review asked the question directly and the answer is a business rule:
  once an order has been fulfilled and paid, it is final. `COMPLETED` is
  terminal (Phase 5, Pattern C), so the only refund path is cancelling a
  paid order before fulfilment (Decision 8), which is exactly the intent.
  A customer complaining after pickup is handled at the counter, not by
  the system reversing a completed sale. If that ever needs to change it
  is a new decision with its own audit requirements, not a bug fix.
- **No `inventory_movements` or `stock_alerts` read path.** Both tables are
  written correctly by Phase 5 and read by nothing. The live "Low stock"
  badge covers the user-facing need, but the *history* is unreachable, and it
  is the data the planned AI restocking feature needs. Still open going into
  Phase 6.5 — the cost is one `GET` and one panel.

---

## Closed in review (Phase 6 as built)

Recorded so the next phase does not re-litigate them.

- **`GET /api/orders` now carries each order's balance.** The plan only put
  the `payment` object on `GET /api/orders/:id`, which meant answering
  "which orders still owe money" — the Payment & Billing screen's whole
  purpose — took one click per order. The list now selects the same money
  columns, spliced in from `lib/billing.js` (`billingListSql`) rather than
  a second `SUM` written out in `routes/orders.js`. That sharing is the
  point: the hand-rolled version would have omitted the `::numeric(12,2)`
  cast and shipped a second copy of an already-fixed formatting bug.
- **Sub-centavo amounts are refused, not rounded to zero.** Validation
  runs on the ROUNDED figure now. Validating the raw value let `0.001`
  through and then stored it as `0.00` — the exact row Decision 3 forbids.
- **An over-long `gateway_reference` is a 422, not a 500.** It is refused
  rather than truncated: a reference is an identifier that must match one
  real transaction, so a clipped one is a *different* reference occupying
  the `UNIQUE` slot the real one needs.
- **No CSRF tokens**, no per-IP rate limiting, no password reset, no audit
  trail on customer/staff edits, no pagination — all as documented at the end
  of Phase 5.
- **Email uniqueness is enforced in application code**, not by the database,
  because of the four role tables, so it races under concurrency.
