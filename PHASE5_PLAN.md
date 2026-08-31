# Phase 5 — Inventory Management: implementation plan

This document is the agreed design for Phase 5, written at the end of Phase 4
so the decisions survive a model/session change instead of being re-derived.
Read it before writing Phase 5 code.

It assumes the conventions already in this repo: Express 5 (async errors are
auto-forwarded), `node:test` against a real database, one `*Explanation.js`
study twin per real file kept in sync, and `database/migrations/` for changing
a database that already holds data.

---

## Scope

**In scope**

- Viewing stock levels (admin + cashier).
- Admin editing stock directly.
- Deducting stock when an order is placed, and restoring it when cancelled.
- Low-stock alerts.
- The cashier-proposes / admin-approves workflow for stock changes.
- A movement ledger recording every stock change and why.

**Explicitly out of scope for Phase 5**

- Bulk / pre-order approval (see Decision 3 below — the column stays reserved).
- Batch-level expiry. `inventory.expiration_date` is one date per product, so
  Monday's and Tuesday's bread cannot be held separately. This is a deliberate
  simplification; state it as such rather than letting it be discovered.
- Forecasting of any kind (PROJECT_CONTEXT: not without explicit approval).
- Delivery, payments, analytics.

---

## Decisions

### Decision 1 — add an `inventory_movements` ledger (approved)

`inventory.stock_quantity` is a single mutable integer. When it is wrong — and
it will be, that is normal for real stock — nothing in the system can answer
*why*. Sales are recoverable from `order_details`, but spoilage, deliveries and
corrections are recorded nowhere at all.

That matters beyond Phase 5: PROJECT_CONTEXT says the AI feature should assist
with "inventory/restocking decisions", and restocking advice needs exactly the
data that currently is not kept.

The ledger follows the same pattern as `order_status_history`, which is already
the best-audited part of the app.

### Decision 2 — stock proposals record BOTH the observed and the proposed count

`inventory_change_requests.proposed_stock_quantity` is an absolute value. Used
blindly, approving a stale proposal silently erases whatever sold in between:

    09:00  stock 12.  Cashier proposes 20.
    11:00  5 sell.    stock 7.
    14:00  Admin approves  ->  stock set to 20.  Those 5 sales vanish.

Pure deltas fix that but break the commonest real action — a physical count,
where the cashier is disputing the very number a delta would be measured from.

So the request stores both: what the system showed the cashier
(`observed_stock_quantity`) and what they say it should be
(`proposed_stock_quantity`). Approval applies the **difference they observed**
to whatever stock is current:

    new_stock = current_stock + (proposed - observed)
              = 7 + (20 - 12) = 15   correct

This also composes with Decision 1, because a movement row is itself a delta.

If `observed_stock_quantity` is NULL (rows predating the column), fall back to
setting the absolute value — the old behaviour.

### Decision 3 — `orders.requires_admin_approval` stays, reserved and unexposed

The column is currently written by nothing, read by nothing, and returned by
`GET /api/orders/:id` as permanently `false`, which implies a feature that does
not exist.

It is NOT deleted: it is part of the approved thesis schema, and it has an
obvious future job that Phase 5 makes possible — a customer ordering 50 cupcakes
when 10 are in stock. Rejecting that loses a sale the bakery wants; it needs an
admin to confirm they can produce it.

Building that flow now would blow up Phase 5's scope (rule 6: one module at a
time). So for Phase 5:

- Orders that exceed available stock are **rejected** with a clean 409.
- `requiresAdminApproval` is **removed from the API response**.
- The column stays, documented as reserved for the bulk/pre-order flow.

---

## Schema changes (migration 003)

Both changes below are approved. Write them into
`database/migrations/003_inventory_movements.sql` AND fold them into
`database/schema.sql`, per the convention in `database/README.md`.

```sql
BEGIN;

-- Why a movement happened. CORRECTION covers a physical recount in either
-- direction, which is why quantity_change is signed rather than a magnitude
-- plus a separate direction flag.
CREATE TYPE stock_movement_reason AS ENUM (
  'ORDER_PLACED', 'ORDER_CANCELLED', 'RESTOCK', 'SPOILAGE', 'CORRECTION'
);

CREATE TABLE inventory_movements (
  movement_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  inventory_id BIGINT NOT NULL REFERENCES inventory(inventory_id) ON DELETE CASCADE,
  -- Typically exactly one of these is set, or neither for a direct admin
  -- edit. They are what let the ledger answer "why did this change" with a
  -- link rather than a sentence.
  order_id BIGINT REFERENCES orders(order_id),
  request_id BIGINT REFERENCES inventory_change_requests(request_id),
  -- users(user_id), not a role table: a movement can be caused by a customer
  -- placing an order, a cashier, or an admin. Same reasoning as
  -- order_status_history.updated_by.
  changed_by BIGINT NOT NULL REFERENCES users(user_id),
  quantity_change INTEGER NOT NULL CHECK (quantity_change <> 0),
  reason stock_movement_reason NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX inventory_movements_inventory_id_idx
  ON inventory_movements (inventory_id, created_at DESC);

-- Decision 2: what the system showed the cashier at the moment they proposed.
-- Nullable because it cannot be invented for existing rows; treat NULL as
-- "apply the absolute value", the old behaviour.
ALTER TABLE inventory_change_requests
  ADD COLUMN observed_stock_quantity INTEGER CHECK (observed_stock_quantity >= 0);

COMMIT;
```

Write it to be safe to re-run, like migrations 001 and 002 (`IF NOT EXISTS`
where available). Postgres has no `CREATE TYPE IF NOT EXISTS`, so wrap that one
in a DO block that swallows `duplicate_object`.

---

## The three code patterns that matter

### Pattern A — deduct with a CONDITIONAL update, never a plain decrement

This is the single most important piece of Phase 5. `inventory` has
`CHECK (stock_quantity >= 0)`. A plain decrement relies on that CHECK to catch
overselling, which raises error `23514` *inside the query* — and `orders.js`
rethrows unhandled errors into the generic 500 handler.

Measured on this database, three buyers racing for the last 10 units at 6 each:

    plain decrement:      ok | ERROR 23514 | ERROR 23514   -> two 500s
    conditional update:   sold | refused | refused         -> two clean 409s

Both end at the correct stock of 4. The difference is entirely what the customer
sees. Use:

```js
const deducted = await client.query(
  `UPDATE inventory
      SET stock_quantity = stock_quantity - $2,
          last_updated = CURRENT_TIMESTAMP
    WHERE product_id = $1
      AND stock_quantity >= $2
RETURNING inventory_id, stock_quantity`,
  [item.productId, item.quantity],
)
if (deducted.rowCount === 0) {
  await client.query('ROLLBACK')
  return response.status(409).json({ message: 'Not enough stock.', errors: { items: '...' } })
}
```

`rowCount === 0` IS the "insufficient stock" signal. This is race-free with no
explicit locking, because the UPDATE takes a row lock. It must run inside the
transaction `POST /api/orders` already opens.

### Pattern B — sort items by product_id before deducting

Two simultaneous orders, one for [bread, cake] and one for [cake, bread], each
lock a row the other needs and Postgres kills one as a deadlock. Rare,
intermittent, and miserable to reproduce — the kind of thing that surfaces
during a live demo.

`quantityByProductId` in `routes/orders.js` currently preserves *insertion*
order (whatever the cart sent). Sort by product id when flattening it, so every
transaction takes its locks in the same order and no cycle can form:

```js
const parsedItems = [...quantityByProductId]
  .map(([productId, quantity]) => ({ productId, quantity }))
  .sort((a, b) => (BigInt(a.productId) < BigInt(b.productId) ? -1 : 1))
```

### Pattern C — restore on the TRANSITION into CANCELLED, not on the state

Deduct-at-placement means cancel-must-restore. But `PATCH /api/orders/:id`
currently lets a cashier or admin set any status from any status:

    PLACED -> CANCELLED   restore +5
           -> CONFIRMED   (deduct again? or not?)
           -> CANCELLED   restore +5 again   <- stock invented from nothing

Restoring has to be triggered by the *transition* rather than the resulting
state, and the state machine has to become real. Keep it minimal:

- `CANCELLED` and `COMPLETED` are **terminal** — nothing moves out of them.
- Restore stock only when moving INTO `CANCELLED` from a non-cancelled status.

Making the transition the trigger is what makes it idempotent. Do not ship the
restore logic without the terminal-status rule, or a week of demo cancellations
will quietly inflate stock.

> **Correction, found in review after Step 6.** The paragraph above is right
> about *what* the rule must be and wrong about *what enforces it*. Checking
> `order.status` with a `pool.query` before opening the transaction does not
> make the transition happen once — that read is a snapshot nothing holds
> still, so concurrent PATCHes all pass it and all restore. Measured with six
> simultaneous cancels of one order for 4 units: stock 46 → 70, six
> `ORDER_CANCELLED` rows for one order, and `SUM(quantity_change)` still
> reconciling to the wrong number, so the ledger corroborated the phantom
> stock rather than exposing it.
>
> The rule has to be claimed the same way Pattern A deducts — put the source
> state in the WHERE clause of the status write itself, run it at the TOP of
> the transaction before any stock moves, and treat `rowCount === 0` as the
> 409:
>
> ```sql
> UPDATE orders SET status = $1
>  WHERE order_id = $2 AND status = ANY($3::order_status[])
> RETURNING status
> ```
>
> The general lesson, which applies to every remaining phase: **a read taken
> outside the transaction can only produce a friendlier error message, never
> a guarantee.** If correctness depends on a condition, that condition belongs
> in the WHERE clause of the write, or behind `FOR UPDATE`, or in a database
> constraint. Three separate Phase 5 defects were this same mistake wearing
> different clothes — the cancel restore here, the read-modify-write in
> request approval and direct stock edit (fixed with `FOR UPDATE`), and
> one-pending-request-per-product (fixed with the partial unique index in
> migration 004).

---

## Build order

Each step is independently testable, and the risky one sits in the middle.

**Step 0 — migration 003.** Apply it, fold into `schema.sql`, add a row to the
migration table in `database/README.md`.

**Step 1 — `GET /api/inventory`** (admin + cashier). Read-only list: product
name, stock quantity, min stock level, expiry, low-stock flag. Trivial, and it
settles the UI shape before anything risky.

**Step 2 — admin direct stock edit.** `PATCH /api/inventory/:productId` for
`stockQuantity` / `minStockLevel` / `expirationDate`. Writes an
`inventory_movements` row (`CORRECTION` or `RESTOCK`) in the same transaction.
Establishes the "never change stock without a movement row" habit before the
harder paths exist. Reuse `parseId` from `lib/validation.js`.

**Step 3 — deduct on order placement.** Patterns A and B, inside the existing
transaction in `POST /api/orders`, with an `ORDER_PLACED` movement per item.

**Step 4 — restore on cancellation + status transition rules.** Pattern C, with
an `ORDER_CANCELLED` movement per item. Steps 3 and 4 are one conceptual unit;
do not ship 3 without 4.

**Step 5 — low-stock alerts.** After any movement, if
`stock_quantity <= min_stock_level`, create a `stock_alerts` row ONLY IF no
unresolved alert already exists for that `inventory_id` — otherwise one popular
product generates an alert per order. Auto-resolve when stock climbs back above
the threshold.

**Step 6 — cashier propose / admin approve.** `inventory_change_requests`, last,
because it depends on everything above being correct. Cashiers may only submit
`INVENTORY` requests, never `PRODUCT_DETAILS` — that is an admin-only direct
edit. The schema comment says so but the CHECK does not enforce it, so the route
must. Approval applies the observed delta from Decision 2 and writes a movement
row linked by `request_id`.

---

## Testing checklist

Add to the existing suite (89 passing at the end of Phase 4). The ones that
actually earn their keep:

- Ordering more than stock is refused with 409, and stock is unchanged.
- Concurrent orders for the last unit: exactly one succeeds, stock never goes
  negative, and the loser gets a 409 rather than a 500.
- Placing an order writes one `ORDER_PLACED` movement per line item, and the
  movements sum to the stock change.
- Cancelling restores exactly what was deducted.
- Cancelling an already-cancelled order does NOT restore twice.
- `COMPLETED` and `CANCELLED` reject any further status change.
- A low-stock alert is created once, not once per order.
- Approving a stale proposal applies the observed delta (the 12/20/5 example
  above), not the absolute value.
- A cashier cannot submit a `PRODUCT_DETAILS` request.

---

## Housekeeping while you are in there

- `src/pages/dashboard/InventoryManagement.jsx` is already 315 lines doing
  categories AND products. Adding stock levels and an approval queue will make
  it unmanageable — split it before adding, not after.
- Remove `requiresAdminApproval` from the `GET /api/orders/:id` response
  (Decision 3).
- Keep the `*Explanation.js` twins in sync as you go; they drift silently
  otherwise, and two were found missing entirely during Phase 4.

---

## Known gaps deliberately left open

Identified in the Phase 4 review and consciously not fixed. These are
documented trade-offs, not defects to be surprised by later.

- **No CSRF tokens.** `sameSite: 'lax'` plus the same-origin Vite proxy covers
  it today. If the API is ever hosted on a different domain from the frontend,
  every state-changing endpoint becomes forgeable and this must be revisited.
- **No per-IP rate limiting.** Lockout is per-account only.
- **No password reset.** Change-password exists; reset needs an SMS gateway.
- **No audit trail on customer/staff edits.** A cashier can change any
  customer's email with no record of who did it.
- **No pagination** on orders, products, or customers.
- **The four role tables** (`admins` / `cashiers` / `customers` /
  `delivery_personnel`) mean email uniqueness is enforced in application code,
  not by the database, so it races under concurrency.
- **Three near-identical four-way role joins** in `lib/auth.js` and
  `routes/auth.js` that could share one SQL fragment.
