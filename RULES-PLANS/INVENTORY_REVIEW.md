# INVENTORY_REVIEW.md — inventory loss and adjustment, reviewed against the code

Prompted by the adviser's question: what happens to stock when product is
lost for a reason other than a sale — burned, expired, damaged, spoiled,
rejected, or simply not where the system says it is?

**No code was changed to produce this.** Every claim below cites the file
and line it was read from. Two things the brief for this review assumed
turned out not to match the codebase, and they are dealt with first,
because the rest of the analysis depends on getting them right.

---

## Two corrections to the premise, before anything else

### 1. There is no FIFO implementation. None.

The brief lists "FIFO-style inventory handling for perishable products" as
existing. It does not. A search of `server/`, `src/`, and `database/` for
`fifo`, `first-in`, `batch`, and `lot` finds **no inventory code at all** —
the only hits are session and OTP expiry, and one test label.

What exists is `inventory.expiration_date` (`schema.sql:171`) — **a single
nullable DATE per product**, not per delivery. FIFO is impossible on that
shape: first-in-first-out requires knowing which units arrived when, which
means a lot or batch per restock, each with its own date. One date on the
product row cannot express "Monday's pandesal expires before Tuesday's."

That column is also almost never meaningful for this business. Bread baked
this morning does not have a printed expiry; it has a shelf life. Nothing
in the app reads `expiration_date` except to display it.

**If the thesis paper claims FIFO, that claim has no implementation behind
it.** That is a defence risk worth fixing in the paper before a panelist
asks to see it. Section 4 says what to do instead — and the honest answer
is better than FIFO for a bakery, not a step down.

### 2. Loss handling is more implemented than the brief believes

The brief says loss scenarios have "NOT yet been fully considered or
implemented." The *mechanism* is largely there — it is the *vocabulary*
that is missing. Specifically, the system already has:

- **A full stock ledger.** `inventory_movements` (`schema.sql:297-316`):
  signed `quantity_change`, a `reason` enum, `changed_by`, `note`, a
  timestamp, and optional links to the causing `order_id` or `request_id`.
  Every path that touches `stock_quantity` writes a row. This is the
  "inventory history / audit table" Question 5 asks whether you need.
- **`SPOILAGE` and `CORRECTION` as first-class reasons**
  (`schema.sql:21-23`), and an admin can record either directly today
  (`inventory.js:28, 370-490`).
- **A cashier proposal → admin approval workflow**
  (`inventory_change_requests`, `schema.sql:259-283`; routes at
  `inventory.js:145` and `:236`), with a required free-text reason.
- **Race safety** on every write path (Section 7).

So the adviser's scenario is not unhandled — a cashier *can* report burned
bread today. The problem is what the record looks like afterwards.

---

## Step 0 — what the code actually does

Read this once; everything after cites it.

### The three write paths

| Path | Who | Shape | Movement written |
| --- | --- | --- | --- |
| Order placed / cancelled | system, in `orders.js` | relative: `stock = stock ± qty` | `ORDER_PLACED` / `ORDER_CANCELLED`, linked to `order_id` |
| Admin direct edit `PATCH /api/inventory/:productId` | ADMIN | **absolute**: "set stock to N" + reason ∈ {RESTOCK, SPOILAGE, CORRECTION} | chosen reason, `note` |
| Cashier request → admin approval | CASHIER proposes, ADMIN reviews | **absolute**: "I count N" + free-text reason | **always `CORRECTION`**, cashier's text in `note` |

The order path (`orders.js:287-291`) is a single conditional decrement —
`UPDATE inventory SET stock_quantity = stock_quantity - $2 WHERE product_id
= $1 AND stock_quantity >= $2` — so an insufficient-stock sale fails the
`WHERE` and never reaches the `CHECK`. There is no read-modify-write and
therefore no race. It is application code, not a database trigger.

Both adjustment paths lock the inventory row with `FOR UPDATE`
(`inventory.js:298, 439`) before computing the new value.

### The observed-delta rule (the clever part)

A cashier's request stores **both** what the system showed them
(`observed_stock_quantity`) and what they counted (`proposed_stock_quantity`).
On approval the admin does not write the proposed number; it applies the
*difference the cashier saw* to *whatever stock is now*
(`inventory.js:317-319`):

```
newStock = currentStock + (proposed − observed)
```

So if stock was 24 when the cashier counted 20, and 3 sold while the
request sat pending, approval yields 21 — not 20. The 3 sales survive.
This is `PHASE5_PLAN.md` Decision 2 and it is the correct design.

### What the tests already guarantee

`inventory.test.js` (32 cases) explicitly pins: a stock change without a
reason is rejected and changes nothing; an order-related reason cannot be
chosen manually; negative stock is rejected; approval applies the observed
delta not the stale absolute; approval re-reads under lock so a
mid-approval sale is not clobbered; approval is refused with 409 if it
would go negative and nothing is applied; rejection changes nothing; a
request cannot be reviewed twice; and a product may have only one pending
request, serially and under concurrency, enforced by the database itself.

That is most of Section 7 already done and already proven.

---

## 1. Inventory events

Every event in the brief maps onto the ledger's signed-delta model. The
question is only whether the *reason* distinguishes them, and today it
does not.

| Event | Sign | Today it becomes | Should become |
| --- | :-: | --- | --- |
| A. Customer sale | − | `ORDER_PLACED` ✓ | unchanged |
| B. Restock / delivery / batch baked | + | `RESTOCK` ✓ | unchanged |
| C. Damaged in handling/storage | − | `SPOILAGE` (admin) or `CORRECTION` (cashier) | **`DAMAGED`** |
| D. Burned / failed / defective production | − | `SPOILAGE` or `CORRECTION` | **`PRODUCTION_LOSS`** |
| E. Expired before sale | − | `SPOILAGE` or `CORRECTION` | **`EXPIRED`** |
| F. Spoiled / unsafe (before its date) | − | `SPOILAGE` ✓ | unchanged |
| G. Quality rejection | − | `SPOILAGE` or `CORRECTION` | `PRODUCTION_LOSS` (it is a yield problem) |
| H. Discrepancy / recount | ± | `CORRECTION` ✓ | unchanged |
| I. Other legitimate adjustment | ± | `CORRECTION` | `CORRECTION` + required note |

**One generalised system, not nine.** They are all the same operation — a
signed change to one integer, with a reason and a signature. Building
separate flows for burned versus expired would be nine copies of the same
transaction. The ledger already generalises them; it just needs three more
words in its vocabulary.

Why three, and why those three: the reason should be chosen by **what you
would do about it**, not by what it looks like on the shelf.

- `PRODUCTION_LOSS` — the unit was never sellable. Signal: a process
  problem (oven, timing, recipe). Remedy: fix production.
- `EXPIRED` — the unit was sellable and nobody bought it in time. Signal:
  overproduction relative to demand. Remedy: bake less, or sell faster.
- `DAMAGED` — the unit was sellable and something happened to it. Signal:
  handling or storage. Remedy: training or packaging.
- `SPOILAGE` (existing) — went bad before its time. In Lucban humidity this
  is genuinely distinct from expiry.
- `CORRECTION` (existing) — the number was wrong and nobody knows why.
  Signal: counting, or shrinkage. Remedy: controls.

Those have *opposite* remedies. Collapsing burned and expired into one
bucket, as the code does today, means analytics can never tell the owner
whether to fix the oven or bake less. That is the entire cost of the
current design, and it is why Section 8 matters.

---

## 2. Inventory adjustment design

The brief's proposed shape is already ~80% present across two tables.
Here is what exists and what is missing, field by field:

| Field | Where it lives today | Status |
| --- | --- | --- |
| Product | `inventory_movements.inventory_id` → product | ✓ |
| Current stock (at the time) | `inventory_change_requests.observed_stock_quantity` (requests only) | ✓ for requests; **not on movements** |
| Adjustment type | `inventory_movements.reason` | ✓ but **too coarse** (Section 1) |
| Quantity | `inventory_movements.quantity_change` (signed) | ✓ |
| Reason (free text) | `inventory_movements.note`, `inventory_change_requests.reason` | ✓ |
| Recorded by | `inventory_movements.changed_by` → `users` | ✓ — the *approving admin* for requests, by design |
| Date/time | `created_at` | ✓ |
| Approval status | `inventory_change_requests.status`, `reviewed_by`, `reviewed_at`, `reviewer_note` | ✓ |
| Inventory updated | same transaction as the movement row | ✓ |
| Audit history | the ledger itself | ✓ |

**Two things to add:**

**a) `movement_reason` on `inventory_change_requests`.** The cashier's
structured reason must survive to the movement row. Today a request has
only free text, so approval has no choice but to write `CORRECTION`
(`inventory.js:337-345`). One enum column on the request fixes this: the
cashier picks `PRODUCTION_LOSS` when submitting, and approval copies it
through.

**b) A delta mode for loss reports.** Both paths today are absolute — the
cashier types the *new count*. For a recount that is right ("I count 20").
For a loss it is wrong: someone who burned 10 loaves must look up the
current figure, subtract in their head, and type 24. That is a subtraction
error waiting to happen, and worse, **the quantity lost is never stored
directly** — it is only recoverable as the delta between two numbers.

So requests should carry either `proposed_stock_quantity` (a recount) *or*
`quantity_change` (a loss: "−10"), never both. A loss report needs no
observed baseline at all — a relative decrement composes correctly with
concurrent sales by definition, exactly the way the order path already
does. That makes the loss path *simpler* than the recount path, not more
complex.

**One thing worth adding but not required — `stock_after` on movements.**
`PHASE5_PLAN.md` Decision 1 chose to store only the delta, on the sound
principle that `SUM(quantity_change)` must equal net stock. Before/after
are derivable. But a history view that says "34 → burned 10 → 24" reads
far better in a defence than "−10", and a stored `stock_after` gives a
free reconciliation check: the latest movement's `stock_after` must equal
current `stock_quantity`, or something bypassed the ledger. One nullable
integer column, written alongside the delta. Nice-to-have, not must-fix.

Nothing else. No new adjustment table — `inventory_movements` *is* the
adjustment table.

---

## 3. Approval workflow

**Keep the split that already exists. It is the right one for a bakery.**

| Actor | Path | Approval |
| --- | --- | --- |
| ADMIN (the owner) | direct edit, immediate | none — they are the approver |
| CASHIER | request → admin reviews → applied on approval | required |

Both are already implemented. The reasoning, for the paper:

- **The owner does not approve their own spoilage.** Requiring an admin to
  submit a request and then approve it themselves is theatre. Direct edit
  with a mandatory reason, written to the ledger under their name, is the
  correct level of control for the person who owns the stock.
- **A cashier's loss report is a claim, and it should be countersigned.**
  "10 burned" is also exactly what unrecorded shrinkage looks like from
  the outside. Two signatures on every loss — the cashier who reported it
  (`request.requested_by`) and the admin who confirmed it
  (`movement.changed_by`) — is a control worth having, and the ledger
  already records both.
- **Do not add a threshold that skips approval for small losses.** It is
  tempting ("under 5 units, no approval"). For a shop with one admin who is
  physically present, approval is one tap; the friction is negligible and
  the control is not. A threshold also invites exactly the gaming it
  seems to prevent — three reports of 4 instead of one of 12.

What *should* change is not the workflow but its inputs: the cashier
should pick a structured reason and, for a loss, enter the quantity lost
rather than a recount. Section 2.

---

## 4. FIFO and expiration

**FIFO should not be built. It is the wrong model for this business, and
the brief should stop claiming it.**

FIFO exists to answer "which units should we sell first?" for goods with
long, varied shelf lives — where Tuesday's delivery might legitimately
sit behind Monday's for weeks. Implementing it means a `lots` table (one
row per restock, each with its own expiry), sales that consume the oldest
lot first, and per-lot expiry checks. That is precisely the
warehouse-management machinery the brief says not to introduce.

A bakery does not need it. Bread is FIFO *physically* — staff put the
morning batch in front of yesterday's by habit, and most products have a
shelf life measured in a day or two. The system does not need to model
which loaf is which; it needs to know **how much went unsold**, which is
what `EXPIRED` as a distinct reason gives it.

**What to do with `inventory.expiration_date`:** leave it, but understand
it is nearly meaningless as a single date. If you want expiry to *do*
something, the useful shape is `products.shelf_life_days` — "pandesal
keeps 1 day, ensaymada 3." Then tomorrow's analytics can say "40 baked,
25 sold, shelf life 1 day → 15 will expire tonight" without any lot
tracking at all. That is a Phase 9 feature, not an inventory one, and it
is a strictly better story than FIFO for the panel.

**How the loss reasons interact with restocks:** they don't need to. A
restock is `+N RESTOCK`; a loss is `−N <reason>`. The ledger is a sum. No
ordering, no lot matching. That is the point of the signed-delta design.

**For the paper:** replace "FIFO-style handling for perishables" with
something true — "loss events are recorded by cause, so unsold and
expired stock is measurable, and shelf life is captured per product for
forecasting." That is defensible and the code can back it.

---

## 5. Stock history and audit trail

**You already have one.** `inventory_movements` is the table the question
describes. Against the brief's checklist:

| Should record | Present? |
| --- | :-: |
| Product | ✓ via `inventory_id` |
| Quantity before | derivable, not stored (see `stock_after` above) |
| Quantity changed | ✓ signed |
| Quantity after | derivable, not stored |
| Movement type | ✓ `reason` — coarse today |
| Reason (text) | ✓ `note` |
| User | ✓ `changed_by` |
| Date/time | ✓ |
| Related order | ✓ `order_id` when applicable |
| Approval information | ✓ via `request_id` → the request row holds reviewer, time, note |

The design deliberately stores the delta only and keeps approval details
on the request row rather than duplicating them. Both are reasonable
choices for a capstone — normalised, no drift, and every movement is
traceable through its `request_id` or `order_id` to its cause.

Is it appropriate for the capstone? It is the *most* appropriate thing in
the system to show a panel: "every change to stock is a row saying what
changed, why, who did it, and what caused it" is a one-sentence answer to
an auditability question. The gap is only that the *why* is currently
three words wide.

---

## 6. Edge cases, against the current code and the proposed changes

**A. 10 breads are burned during production.**
*Today:* the cashier submits a recount (types the new absolute count,
free-text "10 burned"); the admin approves; the ledger records
`CORRECTION −10, note: "10 burned"`. Stock is right, the *reason* is lost
to analytics. Or the admin edits directly with `SPOILAGE`, which is the
wrong word.
*Proposed:* cashier submits a loss report — reason `PRODUCTION_LOSS`,
quantity 10, note optional. Admin approves. Stock −10. Ledger:
`PRODUCTION_LOSS −10`, `request_id` set, `changed_by` = admin. Approval
required (cashier); direct if the admin does it.

**B. 5 products expire.**
Same flow, reason `EXPIRED`. This is the one that feeds demand analytics
(Section 8), so recording it distinctly is the whole point.

**C. 3 products are damaged.**
Same flow, reason `DAMAGED`. Approval required for a cashier.

**D. Physical stock is 20, system says 24.**
*Today — already handled correctly.* This is a recount, not a loss: the
cashier submits `proposed 20`, the system captures `observed 24`, the
admin approves, and the observed-delta rule applies −4 to whatever stock
is at approval time. Ledger: `CORRECTION −4`. Unchanged by this review —
it is the case the existing design was built for.
The *distinction* to teach staff: if you know why it is short, report a
loss with the reason; if you do not, submit a recount. Both produce a
ledger row; only one produces a useful one.

**E. A customer order deducts inventory at the same moment an adjustment
is submitted.**
*Already safe, and proven by tests.* Three mechanisms: the order path is
a single relative `UPDATE … WHERE stock_quantity >= $2`, so it never
reads then writes (`orders.js:287-291`); approval locks the row
`FOR UPDATE` and re-reads before computing (`inventory.js:282-298`,
pinned by the test "a sale committing mid-approval is not clobbered");
and the observed-delta rule preserves anything sold between proposal and
review. A delta-based loss report inherits all of this and needs no
observed baseline — `stock − 10` is correct whatever stock is.
The one genuinely new guard: approving a loss that exceeds current stock
(10 burned, but only 7 left because 3 sold) must be refused, not clamped.
The existing 409 at `inventory.js:321-324` does exactly this for recounts;
reuse it.

**F. An adjustment is submitted but rejected.**
*Already handled.* Rejection touches no inventory row (`inventory.js:279`),
writes no movement, and the request row keeps `status = REJECTED`,
`reviewed_by`, `reviewed_at`, and the admin's `reviewer_note` — so the
cashier can see why. The product is then free for a new request (the
one-pending index is partial on `PENDING`). The ledger is silent about a
rejected request on purpose: nothing happened to stock. The request row
is the record.

---

## 7. Data integrity

Most of this is already done and already tested. Stating where each guard
lives so the paper can cite it:

| Risk | Guard | Where |
| --- | --- | --- |
| Negative stock | `CHECK (stock_quantity >= 0)` **and** the `WHERE stock_quantity >= $2` guard on sales **and** the 409 on approval | `schema.sql:169`, `orders.js:290`, `inventory.js:321` |
| Duplicate deductions (order) | one atomic `UPDATE` per line; `order_details (order_id, product_id)` UNIQUE | `orders.js:287`, `schema.sql:199` |
| Duplicate adjustments (request) | partial unique index — one PENDING per product, enforced by the database under concurrency | `schema.sql:344`, tested |
| Adjustment applied twice | "a request cannot be reviewed twice" — status transition guarded in the same `UPDATE … WHERE status = 'PENDING'` | `inventory.js:270`, tested |
| Unauthorized change | `requireRole` on every write; cashiers can only *propose* | `inventory.js:145, 236, 370` |
| Adjustment without reason | 422 on both paths; `reason TEXT NOT NULL` on requests | `inventory.js:169, 410`, `schema.sql:275` |
| Untraceable change | every write path inserts a movement in the same transaction | all three paths |
| Race / concurrent update | relative decrement on sales; `FOR UPDATE` on both adjustment paths; observed-delta rule | Section 6-E |
| Incorrect totals | `SUM(quantity_change)` must equal current stock — a reconciliation query, not yet exposed | see below |

**Two things not yet guarded:**

- **Ledger reconciliation is possible but not exposed.** Nothing currently
  checks that `SUM(inventory_movements.quantity_change)` for a product
  equals its `stock_quantity`. It should, by construction — but a
  read-only reconciliation report ("these products' ledgers disagree with
  their stock") is the cheapest possible proof that nothing bypassed the
  ledger, and a strong thing to show a panel. Nice-to-have.
- **Admin direct edits have no idempotency key.** A double-clicked submit
  could record two `SPOILAGE −5` rows. Low risk (the second sets the same
  absolute value and writes no movement, since `inventory.js:465-470`
  skips a no-op) — but a delta-based loss endpoint *would* double-apply.
  Guard the new delta path with a disabled-while-submitting button and,
  if you want belt and braces, a client-generated request id. The
  cashier path is already immune via the one-pending index.

---

## 8. Analytics impact — the part that decides the reason vocabulary

The brief's example: **100 produced, 20 sold, 10 burned. What is demand?**

Not 20, not 30. The honest answer has three separate numbers, and the
mistake to avoid is subtracting any of them from the others.

```
produced             100   (RESTOCK +100)
production loss       10   (PRODUCTION_LOSS −10)   → never sellable
sellable supply       90
sold                  20   (ORDER_PLACED −20)      → demand floor
unsold / expired      70   (EXPIRED −70)           → overproduction
```

- **Demand is 20** — *if the product did not sell out.* Sales are a floor
  on demand: you sold 20, so at least 20 people wanted it. Whether more
  wanted it depends on one thing the ledger can tell you: **did stock ever
  reach zero that day?** If it did, demand was *censored* — you cannot
  know how many more you would have sold. If it did not, 20 is a fair
  reading. This stockout flag is the single most important input Phase 9
  needs, and it is derivable from the ledger today.
- **Burned is not demand information at all.** It is *yield*. 10 of 100
  is a 10% production loss rate — a signal about the oven, the recipe,
  or the baker, and nothing to do with customers. Feed it to a production
  metric; keep it out of the demand model entirely.
- **Expired is the overproduction signal.** 70 unsold against 20 sold says
  "bake far less" — or, combined with the stockout flag on other days,
  "demand is volatile." This is the number that actually drives
  restocking advice, and today it is indistinguishable from burned.

So the three streams to keep separate, each built from a different
reason set:

| Stream | Built from | Feeds |
| --- | --- | --- |
| Sales / demand | `ORDER_PLACED` − `ORDER_CANCELLED`, plus a per-day stockout flag | demand forecasting |
| Production yield | `RESTOCK` vs `PRODUCTION_LOSS` | process quality |
| Waste | `EXPIRED`, `SPOILAGE`, `DAMAGED` | overproduction / handling |
| Shrinkage | `CORRECTION` (negative, unexplained) | controls |

**With today's enum this table cannot be built.** Everything a cashier
reports is `CORRECTION`, and an admin's `SPOILAGE` covers burned, expired,
and damaged alike. The analytics would see one undifferentiated "stock
went down for some reason" stream, and any forecast trained on it would
treat a burned batch as if customers had bought it. That is the concrete,
demonstrable distortion — and the reason the enum change is the must-fix,
not the UI.

---

## 9. Capstone scope

The simplest implementation that is realistic, defensible, compatible,
and useful to Phase 9:

- **No new tables.** The ledger and the request table already exist.
- **One migration** (`008`): `ALTER TYPE stock_movement_reason ADD VALUE`
  ×3; two nullable columns on `inventory_change_requests`
  (`movement_reason`, `quantity_change`); optionally `stock_after` on
  movements. Adding enum values is non-breaking — every existing row keeps
  its meaning.
- **Two routes touched, none added.** `POST /requests` accepts a loss
  shape; `PATCH /requests/:id` copies the structured reason through
  instead of hard-coding `CORRECTION`; `PATCH /:productId` widens its
  allowed reason set by three strings.
- **Two forms touched.** The admin stock edit's reason dropdown gains
  three options; the cashier's propose form gains a "Report a loss" mode
  with reason + quantity.
- **No FIFO, no lots, no expiry engine.** Section 4.

That is a small, contained change to a system that is already mostly
right. It is not a rebuild.

---

## 10. Final recommendation

**A. Already correct — preserve it**
- The signed-delta ledger with reason, actor, cause links, and timestamp.
- Atomic conditional decrement on sales; `FOR UPDATE` on adjustments.
- The observed-delta rule for recounts, and its concurrent-sale safety.
- Negative-stock guards at three layers.
- One-pending-request-per-product, database-enforced.
- Cashier-proposes / admin-approves, with admin direct edit.
- Rejection is a no-op on stock, recorded on the request.
- Low-stock alert sync on every write.
- 32 tests pinning all of the above.

**B. Missing**
- A reason vocabulary that distinguishes *why* stock was lost.
- A way for a cashier's structured reason to reach the ledger (every
  approval writes `CORRECTION`).
- A delta-shaped loss report ("remove 10 because burned") — both paths
  are recount-shaped today.
- Any FIFO implementation (and the paper may claim one).
- A per-day stockout signal for analytics (derivable, not exposed).

**C. Must-fix**
1. Add `PRODUCTION_LOSS`, `EXPIRED`, `DAMAGED` to `stock_movement_reason`.
2. Add `movement_reason` to `inventory_change_requests`; approval writes it
   to the movement instead of `CORRECTION`.
3. Add `quantity_change` to requests so a loss is reported as a delta;
   approval applies `stock − N` under the existing lock and 409 guard.
4. Correct the FIFO claim in the paper (Section 4 has the wording).

**D. Nice-to-have**
- `stock_after` on movements, for readable history and reconciliation.
- A reconciliation report: products whose ledger sum ≠ stock.
- `products.shelf_life_days`, for Phase 9's expiry forecasting.
- A per-product waste breakdown by reason in Reporting & Analytics — the
  first genuinely new Phase 9 signal, and it needs nothing but the enum.

**E. Database changes** — one migration, as in Section 9. No table
creation, no drops, nothing destructive.

**F. Backend changes** — `inventory.js` only: widen `manualMovementReasons`
(line 28); accept the loss shape in `POST /requests`; copy the reason and
apply the delta in `PATCH /requests/:id`. Extend `inventory.test.js` with
the loss path, including the "loss exceeds current stock → 409" case.

**G. Frontend changes** — `InventoryManagement.jsx` reason dropdown;
`InventoryRequests.jsx` gains a loss-report mode; the history view (if one
is built) labels rows by reason.

**H. Should FIFO remain?** It cannot remain because it does not exist.
Do not build it. Replace the claim with shelf-life-aware loss recording.

**I. Should you implement an adjustment / stock-movement mechanism?** You
already have. Extend its vocabulary and give it a delta mode. Do not build
a second one.

**J. Implementation order**
1. Migration 008 — the enum values and the two request columns. Zero
   behavioural change on its own; unlocks everything after it.
2. Admin direct edit accepts the three new reasons — one line
   (`inventory.js:28`) and a dropdown.
3. Cashier loss report: request shape, approval applies delta and copies
   reason, tests for both plus the exceeds-stock 409.
4. Frontend forms.
5. `stock_after` and the reconciliation query, if wanted.
6. Waste-by-reason in reporting — the first Phase 9 deliverable.
7. Fix the paper.

Steps 1–4 are the feature. Step 6 is where the adviser's question turns
into a thesis result: the day the system can say "you lost 12% of
pandesal to expiry this month and 3% to production," it is doing what the
title promises.
