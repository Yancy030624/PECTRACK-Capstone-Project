# NO_COD_PLAN.md — delivery orders are paid before the bakery prepares them

**Decision (2026-10-08, from the client):** no cash on delivery. In the
interview (paper p. 131–132, 00:13:43–00:14:21) the General Manager said
that a customer may refuse food at the door, and the bakery then loses
it. The team asked the client again, and the answer is final.

Today the system allows cash on delivery. A delivery order can be
confirmed, baked and sent out unpaid, and the driver records the cash at
the door (`POST /api/payments` as DELIVERY_PERSONNEL, the "Record cash
collected" form in My Deliveries). This plan removes that path.

Use this plan with the standing rules in `PHASES-RULES-PLANNING.md` and
`FRONTEND-RULES.md`. Every check that a rule depends on runs **inside**
the transaction that does the write, after the row lock. This is the
pattern of the existing COMPLETED check in `server/routes/orders.js`
(PHASE 6, DECISION 7).

---

## As built (2026-10-08, commit 12ac80c)

Built as planned, with three changes found during the build:

- **D1 covers every forward move, not only CONFIRMED.** The status route
  lets staff skip a stage (PLACED → IN_PRODUCTION), so the rule is "a
  DELIVERY order does not move forward unless fully paid". Cancelling
  stays allowed.
- **D4 was wrong as written.** A bulk delivery order could not be paid
  before approval, and approval meant confirming, which now needs
  payment, so the order could never move. Fixed with
  `POST /api/orders/:id/approve` (admin only):
  - It clears `requires_admin_approval`, keeps the order PLACED, and
    logs "Bulk order approved — payment is now open." in the status
    history.
  - Staff confirm the order once it is paid.
  - Bulk pickup orders are still approved by confirming them.
  - The Order Management button reads "Approve" for an unpaid bulk
    delivery order and "Approve and confirm" otherwise.
- **Due today leaves unpaid delivery orders out of "Still to make".**
  They are still listed, with the "Not paid — don't bake yet" tag.
  Counting them as bread to bake would contradict the tag.

Tests: 438 pass (5 new in `deliveries.test.js`, 1 new in
`orders.test.js`). Demo data was re-seeded; order #21170 is the unpaid
delivery order for the demo.

## Decisions

**D1. The rule.** A **DELIVERY** order must be **fully paid** before it
leaves PLACED. `PATCH /api/orders/:id` refuses PLACED → CONFIRMED for an
unpaid delivery order with 409: "Delivery orders must be paid in full
before they are confirmed. Balance: ₱X." Put the check next to the
COMPLETED check: inside the transaction, after the claim, using
`getBillingSummary(client, orderId).isFullyPaid`. Pickup orders and
walk-in orders do not change: they can still be paid at the counter at
any time before COMPLETED.

**D2. Second gate at dispatch.** `PATCH /api/deliveries/:id/assign`
refuses an unpaid order with 409. Use the same billing check inside its
transaction, after the order row lock; the lock order is the order row
first, then the delivery row (see the cross-table lock rule). This
covers orders that were confirmed **before** this change, and orders
that became unpaid again through a partial refund. It does not block a
driver who is already out on a delivery: once assigned, the delivery
continues.

**D3. Who can take payment for a delivery order.** The customer pays
online with GCash through PayMongo, as today. A cashier or admin can
also record cash or GCash at the counter, for example when a customer
comes in or orders by phone and pays in person. The **driver can no
longer record payments**:
- Remove `DELIVERY_PERSONNEL` from `requireRole` on `POST /api/payments`.
- Delete the driver-only branch: the `isDriver` checks, the "only CASH"
  rule, and the "only an order on my OUT_FOR_DELIVERY/DELIVERED
  delivery" scope query.
- Update the comments that describe cash on delivery.

The router-wide `requireRole` keeps DELIVERY_PERSONNEL only if a GET
route still needs it. Check this, and remove the role if no GET route
needs it.

**D4. Bulk orders.** The order of steps stays the same: admin approval,
then payment, then CONFIRMED. A bulk delivery order therefore needs both
approval and full payment before it is confirmed. Check the existing
approval guard first, so that an unapproved order still gets the
approval message, not the payment one.

**D5. Unpaid delivery orders that are never paid.** Out of scope for
automation. The customer can cancel while the order is PLACED (this
already works), and staff can cancel with a reason. No auto-cancel job.
Add a line about this to the paper's Limitations.

**D6. Old data.** Cash payments that drivers recorded before this
change stay in `payments` (recorded_by = the driver). Do not migrate or
delete them; they are real money. Reports keep counting them.

---

## Server changes

1. `server/routes/orders.js` — the D1 check in the PATCH status route.
   Read the order's `fulfillment_type` from the row already claimed
   (no second read outside the lock).
2. `server/routes/deliveries.js`:
   - The D2 check in `PATCH /:id/assign`.
   - In the history route (around lines 205–235), remove the
     `cashCollected` / `cashPayments` query and fields.
   - Remove the "how much cash to collect" comment and any
     `balanceDue` field that exists only for the driver's cash form.
     Keep `isFullyPaid` / `balanceDue` if staff screens use them.
3. `server/routes/payments.js` — D3.
4. `server/routes/production.js` (Due today) — no query change. An
   unpaid delivery order cannot be CONFIRMED any more, so it can only
   appear as PLACED. Add `isFullyPaid` and `fulfillmentType` to each
   row, so the screen can flag the order (see Client step 4).

## Client changes

1. **Checkout (`CheckoutPage.jsx`)** — when Delivery is chosen, show
   this note under the delivery option: "Delivery orders are paid in
   full with GCash before we start baking. Pay right after you place
   the order."
2. **Order placed (`OrderPlacedPage.jsx`)** — the line "Pay at pickup or
   on delivery, or pay online now…" is wrong now. For a delivery order
   (not awaiting approval): "Pay now with GCash so we can start on your
   order." Make the "Pay now" button the primary button. For a pickup
   order: "Pay at pickup, or pay online now from My Payments." For a
   bulk order, keep the approval message, and add to it: "Delivery
   orders are paid in full once approved."
3. **Customer My Orders / order detail** — an unpaid delivery order in
   PLACED shows a yellow note: "Waiting for payment — we start baking
   once it is paid." Include a link to pay.
4. **Staff Order Management** — for an unpaid delivery order, the
   Confirm button is disabled. Next to it, show: "Not paid yet —
   delivery orders are confirmed after full payment." The server
   refusal (D1) is the guarantee; this note only explains it. In
   **Due today**, give an unpaid delivery order a small red "Not paid —
   don't bake yet" tag.
5. **Delivery Management** — the Assign control is disabled with the
   same reason for an unpaid order (D2).
6. **My Deliveries** — remove the "Cash collected" form and its state
   (`cashAmounts`, the record handler). Show "Paid" on each card. If
   the server ever returns an unpaid one (old data), show "Not paid —
   contact the bakery before handing over".
7. **Delivery History** — remove the "Cash collected" card and the
   "payments at the door" line. Adjust the grid so that no empty slot
   is left.
8. **Dashboard** — the "Unpaid balances" tile stays. If it opens a
   list, unpaid delivery orders show the "Waiting for payment" label.
   No new tile.

## Seed script (`scripts/seed-demo-data.mjs`)

Every delivery order that the seed advances past PLACED must first be
paid in full (`recordPayment`, as the cashier). Keep one unpaid
**delivery** order in PLACED, so the "Waiting for payment" state can be
shown in the defense demo. Pickup orders can stay unpaid or part-paid,
as now. Remove any step where a driver records cash.

## Tests

Add:
- An unpaid DELIVERY order going PLACED → CONFIRMED gets 409, and the
  status stays PLACED.
- A fully paid DELIVERY order can be confirmed.
- An unpaid PICKUP order can still be confirmed.
- A part-paid DELIVERY order gets 409, and the message contains the
  balance.
- Assigning an unpaid delivery order (forced to CONFIRMED in SQL, the
  way old data looks) gets 409.
- `POST /api/payments` as DELIVERY_PERSONNEL gets 403.
- A concurrency test, in the style of the existing ones: a payment and
  a confirm racing on the same order never let an unpaid delivery
  order through.

Change:
- The existing driver cash tests become the 403 test, or are deleted.
- The delivery-flow fixtures that confirm an unpaid delivery order now
  record a payment first.

Before reporting done, run all of these:
- `npm test`, the whole suite, twice.
- `npm run build`
- `npm run lint`
- A browser check of the customer flow (place a delivery order, then
  see "Pay now") and the staff flow (Confirm is disabled until paid).
  Insert sessions directly in the DB; do not trigger OTP emails.

## Paper changes (after the build)

- p. 16: replace "…digital wallets such as GCash, in addition to the
  option of cash on delivery." with "…digital wallets such as GCash.
  Delivery orders must be paid in full before the bakery prepares
  them, since food refused at the door cannot be resold."
- p. 92: in the Delivery Personnel paragraph, delete "record cash
  collected on delivery,".
- p. 16: the heading "Payment and Billing Module" appears twice in a
  row. Delete one.
- p. 86: "includedto" should be "included to".
- `PAPER_VS_SYSTEM.md`:
  - B7: replace the "Cash on delivery" row with "Delivery orders are
    prepaid (GCash online, or at the counter)".
  - C16: drop "and cash on delivery".
  - D5: the driver sees that the order is paid.
  - Part E Limitations: "Delivery orders must be paid in full before
    preparation; unpaid ones are not cancelled automatically."
