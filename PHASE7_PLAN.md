# Phase 7 — Delivery Management: implementation plan

This document is the agreed design for Phase 7, written before any Phase 7
code exists — the same discipline `PHASE5_PLAN.md`, `PHASE6_PLAN.md`, and
`PHASE6.5_PLAN.md` were written under. Read it before writing Phase 7 code.

It assumes the conventions already in this repo: Express 5 (async errors
auto-forwarded), `node:test` against a real database, one `*Explanation.js`
study twin per real file kept in sync, and `database/migrations/` for
changing a database that already holds data.

`PHASES-RULES-PLANNING.md` scopes **Phase 7 — DELIVERY** as: delivery
assignment, delivery personnel workflow, delivery status, proof of
delivery, and explicitly **no GPS tracking**. This document implements
exactly that list.

**Read the corrected Pattern C in `PHASE5_PLAN.md` first.** Every defect
found in the last three reviews was one mistake wearing different clothes —
a condition checked outside the write it gates. Phase 7 adds a SECOND state
machine to a system that already has one, which is a fresh way to make the
same class of error, so Decision 2 below is the most important thing here.

## What is already true before Phase 7 starts

Checked against the live database and the code, not assumed:

- **`customer_addresses` has zero code touching it.** The table, its
  `one_default_per_customer` partial index, and its `updated_at` trigger
  all exist and are complete; nothing reads or writes them. It holds 0 rows.
- **`deliveries` and `delivery_proofs` hold 0 rows** and have no code.
  `deliveries_personnel_status_idx (delivery_personnel_id, status)` — the
  exact index a "my deliveries" query needs — already exists.
- **`DELIVERY_PERSONNEL` accounts can already be created and can log in.**
  `routes/staff.js` supports the role and `lib/auth.js` resolves it. What
  that role cannot do is anything at all: every router built so far
  (`orders`, `inventory`, `payments`) deliberately excludes it, each with a
  comment saying the real access model doesn't exist yet. Phase 7 is that
  model.
- **A delivery person can log in today and reach nothing useful.**
  `modules.js` gives that role three nav entries — Dashboard, Order
  Management, My Profile — and Order Management renders the "ordering isn't
  available here yet" placeholder for them, because `routes/orders.js`
  excludes the role anyway. Phase 7 is the first screen that role can
  actually use.
- **`delivery_personnel` is empty, and that is deliberate.** It briefly held
  5 stale rows all named "Order Test DP" — residue from `orders.test.js`
  runs predating the cleanup fix made during the Phase 6 work. The leak
  itself was already fixed (a fresh run of that file left the count
  unchanged), and the 5 rows plus their 5 orphaned user accounts and live
  sessions were deleted during Phase 7 planning, after confirming nothing
  in `deliveries`, `delivery_proofs`, `order_status_history`,
  `inventory_movements` or `payments` referenced them.
  **So Step 3 starts with no drivers in the database at all** — the
  assignment picker will be legitimately empty until a real
  `DELIVERY_PERSONNEL` account is created through `POST /api/staff`. Create
  one first, or the assignment screen will look broken when it isn't.
- **`POST /api/orders` refuses `DELIVERY` outright** with a 422, and the
  `orders` CHECK constraint requires `address_id` for `DELIVERY` and
  forbids it for `PICKUP`. Lifting that 422 is what starts this phase.

---

## Scope

**In scope**

- Customer address management — the hard prerequisite (Decision 1).
- Placing a `DELIVERY` order, which lifts the existing 422.
- A `deliveries` row per delivery order, assignment to personnel, and the
  status workflow through to `DELIVERED` or `FAILED`.
- The delivery personnel's own view: their assigned deliveries, and the
  transitions they are allowed to make.
- Proof of delivery: a photo uploaded against a delivery, stored on disk
  behind a swappable seam.
- The Delivery Management screen, and a delivery view for the personnel
  role (which currently has no usable screen at all).

**Explicitly out of scope for Phase 7**

- **GPS or live location tracking of any kind.** `PROJECT_CONTEXT.md` and
  `PHASES-RULES-PLANNING.md` both rule this out explicitly. No coordinates,
  no map, no "where is my driver".
- **Delivery fees, zones, or distance pricing.** `orders.total_amount` stays
  the sum of the line items, exactly as Phases 4–6 left it.
- **Route optimisation, scheduling, or driver rostering.**
- **Cash-on-delivery collection by the driver.** See Decision 4 — this is
  the one genuinely tempting scope creep, and it is deliberately left out.
- **Object storage (S3/Cloudinary).** Files go to local disk behind a seam
  (Decision 8). Swapping later changes one module.

---

## Decisions

### Decision 1 — customer addresses come first, in their own router

A `DELIVERY` order is impossible without an `address_id`, and nothing in
this application has ever written one. So Phase 7 starts by building
address management, not delivery.

It does **not** go in `routes/customers.js`: that router is
`requireRole('ADMIN', 'CASHIER')` — the staff-facing customer *record*
screen — and a customer managing their own addresses can't reach it at all.
A new `routes/addresses.js` mounted at `/api/addresses`, admitting
`CUSTOMER` (their own addresses only) plus `ADMIN`/`CASHIER` (acting for a
customer taking a phone order), matches how `routes/payments.js` already
scopes a mixed-role router.

The `customer_addresses_one_default_per_customer` partial unique index
already exists (`WHERE is_default AND is_active`), so "exactly one default
address" is enforced by the database. Setting a new default must therefore
clear the old one **in the same transaction**, or the second insert violates
the index — the same friendly-pre-check-plus-real-constraint shape used for
`inventory_change_requests` and `payments`.

`is_active` exists so an address can be retired without breaking the
`orders.address_id` foreign key on historical orders. Addresses are
**deactivated, never deleted** — an old order must always still be able to
say where it went.

### Decision 2 — `deliveries.status` is the source of truth; `orders.status` is synced FROM it, one direction only

This is the most dangerous thing in Phase 7 and the reason to read Pattern C
first.

`order_status` already contains `OUT_FOR_DELIVERY`. `delivery_status`
contains its own `OUT_FOR_DELIVERY`, plus `DELIVERED` and `FAILED`. That is
two state machines describing one real-world process, and if both are
independently writable they **will** drift — an order reading
`OUT_FOR_DELIVERY` while its delivery row says `PENDING_ASSIGNMENT`, with
nothing in the system able to say which is true. This is the same class of
problem as `orders.amount_paid` in `PHASE6_PLAN.md`'s Decision 1: a second
place for one fact to live.

The rule, and it is one-directional:

- **`deliveries.status` is written by the delivery routes.** It is the
  authority on where a delivery has got to.
- **`orders.status` is updated FROM it**, in the SAME transaction as the
  delivery transition, never independently.
- **`PATCH /api/orders/:id` must REFUSE to set `OUT_FOR_DELIVERY` manually
  on an order that has a delivery row.** Without this the drift comes
  straight back through the door Phase 5 built. This is a new refusal added
  to an existing, already-carefully-guarded handler — add it *after* the
  status claim, inside the transaction, for the reasons Decision 7 of
  `PHASE6_PLAN.md` spells out.

The only sync this phase performs:

    delivery OUT_FOR_DELIVERY  ->  orders.status = OUT_FOR_DELIVERY

and nothing else. `DELIVERED` deliberately does not touch `orders.status` —
see Decision 4.

### Decision 3 — the `deliveries` row is created with the order, in the same transaction

`deliveries.order_id` is `NOT NULL UNIQUE` and `status` defaults to
`PENDING_ASSIGNMENT`. The schema is plainly designed for "every delivery
order has a delivery row from the moment it exists," so `POST /api/orders`
inserts one inside the transaction it already opens for stock deduction.

Creating it lazily on first assignment instead would mean a delivery order
that exists but is invisible to the assignment screen until someone
remembers it — the "pending assignment" queue would be missing exactly the
orders that most need to be in it.

### Decision 4 — `DELIVERED` does NOT complete the order, and drivers do not take payment

Tempting and wrong: having `DELIVERED` set `orders.status = COMPLETED`.

It collides head-on with `PHASE6_PLAN.md`'s Decision 7, which refuses
`COMPLETED` while any balance is owed. For a cash-on-delivery order — the
normal case for a bakery — the money arrives at the customer's door, so at
the moment the driver marks `DELIVERED` the order is still unpaid, and the
auto-complete would simply fail with a 409 the driver can do nothing about.

The obvious fix — let the driver record the cash payment — means giving
`DELIVERY_PERSONNEL` write access to `POST /api/payments`, which is
currently `CASHIER`/`ADMIN` only. That is a real widening of Phase 6's money
surface, it is not in Phase 7's stated scope, and "one module at a time" is
a rule in this repo, not a preference.

So: **`DELIVERED` records that the goods arrived, and nothing more.** Staff
mark the order `COMPLETED` afterwards through the existing
`PATCH /api/orders/:id`, which already enforces the payment rule. "Delivered"
and "settled" are genuinely different facts and this keeps them that way.

Cash-on-delivery collection is recorded as a known gap below, with the note
that it is the natural next increment.

### Decision 5 — delivery transitions use the same claim pattern as everything else

`PENDING_ASSIGNMENT -> ASSIGNED -> OUT_FOR_DELIVERY -> DELIVERED | FAILED`

`DELIVERED` and `FAILED` are terminal. Every transition is a conditional
UPDATE with the allowed source state in its own `WHERE` clause, and
`rowCount === 0` is the 409 — the same idiom used for stock deduction, the
order status claim, change-request review, the payment overpayment guard,
and the webhook confirmation. This is its sixth use; do not invent a
seventh shape.

One deliberate exception: an **ADMIN** may move `FAILED` back to
`PENDING_ASSIGNMENT` to re-attempt a delivery. A failed attempt is a real
thing that gets retried, and without this the only recovery is cancelling
the order. This is the single transition out of a terminal state in this
codebase, so it is admin-only and must record why in `deliveries.note`.

### Decision 6 — cancelling an order must resolve its delivery row

`PATCH /api/orders/:id -> CANCELLED` already restores stock (Phase 5) and
refunds payments (Phase 6). If the order has a delivery row that is not
already terminal, the same transaction must also mark it `FAILED`.

Without this, cancelling an order out for delivery leaves an `ASSIGNED` or
`OUT_FOR_DELIVERY` row pointing at a cancelled order — it stays on some
driver's "my deliveries" list forever, and the delivery queue slowly fills
with work nobody should do. This is exactly the kind of cross-module
interaction that gets missed; it is called out here so it is built, not
discovered.

### Decision 7 — a DELIVERY order requires a customer, so walk-ins are pickup-only

Addresses hang off `customers`. A walk-in order has `customer_id NULL`
(`PHASE5_PLAN.md`'s guest-order design), so it has no addresses to choose
from and cannot be a delivery. `POST /api/orders` refuses `DELIVERY` with no
`customerId` with a clean 422 rather than letting the address lookup fail
into something confusing.

The address must also belong to the order's customer — a customer must not
be able to send an order to someone else's saved address by passing its id,
and a cashier must not do it by accident. Verified server-side, not trusted
from the body.

### Decision 8 — proof files go to local disk behind a one-module seam, uploaded as raw bytes

Two sub-decisions, both about avoiding an unnecessary dependency.

**Where files live.** `delivery_proofs` stores `storage_key`, `file_name`,
`mime_type` — the schema's own comment says files belong in object storage
and this table holds only references. There is no object storage here and
adding one means an account, credentials, and a network dependency, which
is Phase 6.5's PayMongo situation again. So files are written to a local
`uploads/` directory (gitignored), and `storage_key` is the filename within
it. All of that lives in one `lib/storage.js`, so swapping to S3 or
Cloudinary later changes that module and nothing else.

**How they arrive.** Browser file upload normally means
`multipart/form-data`, which Express cannot parse without a library
(`multer`). But `fetch` can send a `File` object directly as a request
body, and `express.raw({ type: [...], limit: '5mb' })` on that ONE route
reads it with no dependency at all — no multipart parsing, no base64
inflation, and no raising the global 10kb JSON limit that every other route
shares. The cost is that no extra form fields can ride along, so
`proof_type` travels as a query parameter. That is a good trade.

**The storage key must be generated server-side.** `file_name` is
attacker-controlled input; if it is used to build a path, `../../` escapes
the uploads directory. `storage_key` is a server-generated UUID plus an
extension derived from the *validated* MIME type, and `file_name` is stored
only as a display label, never touched by the filesystem. This is the
single most important security detail in this phase.

### Decision 9 — delivery personnel see only their own deliveries, and that scoping is derived from the session

Phase 7 is the first time `DELIVERY_PERSONNEL` can do anything. Their
`delivery_personnel_id` is resolved from `request.user.id` server-side and
used to scope every read and every write — the same shape
`GET /api/orders` uses for a customer's own orders and
`GET /api/inventory/requests` uses for a cashier's own proposals. A driver
must never be able to read, transition, or upload proof against a delivery
assigned to somebody else, and passing an id in the body must not change
that.

---

## Schema changes

**None.** This is worth stating loudly because it is unusual: every table,
column, enum value, and index Phase 7 needs already exists in the approved
thesis schema and is currently unused. `customer_addresses`, `deliveries`,
`delivery_proofs`, `delivery_status`, `proof_type`,
`deliveries_personnel_status_idx`, and
`customer_addresses_one_default_per_customer` are all present and correct.

No migration 007. If the implementation finds itself wanting one, that is a
signal to re-read this plan first — it probably means a design decision is
being made accidentally.

One deliberate omission worth naming: there is **no `delivery_status_history`
table**, unlike `order_status_history`. `deliveries` carries `assigned_at`,
`delivered_at`, and a `note`, which covers the questions this phase actually
needs to answer. A full history table is not built on speculation.

---

## The three code patterns that matter

### Pattern F — sync `orders.status` from the delivery transition, inside the same transaction, one direction

```js
// inside the delivery transition's own transaction, AFTER the claim
const claimed = await client.query(
  `UPDATE deliveries SET status = 'OUT_FOR_DELIVERY'
    WHERE delivery_id = $1 AND status = 'ASSIGNED'
  RETURNING order_id`,
  [deliveryId],
)
if (claimed.rowCount === 0) { await client.query('ROLLBACK'); return response.status(409).json(...) }

// The sync. Same transaction, so the two can never disagree -- if the
// order update fails, the delivery transition rolls back with it.
await client.query(
  `UPDATE orders SET status = 'OUT_FOR_DELIVERY'
    WHERE order_id = $1 AND status NOT IN ('COMPLETED', 'CANCELLED')`,
  [claimed.rows[0].order_id],
)
await client.query('INSERT INTO order_status_history (order_id, updated_by, status, note) VALUES ($1, $2, $3, $4)', [...])
```

The `NOT IN ('COMPLETED','CANCELLED')` guard matters: Phase 5 made those
terminal for every role, and a delivery transition must not be the one thing
that quietly moves an order back out of a terminal state.

### Pattern G — never build a filesystem path from client input

```js
// WRONG -- file_name comes from the client. "../../server/db.js" escapes.
const key = request.query.fileName

// RIGHT -- server-generated key, extension from the VALIDATED mime type,
// the client's filename kept only as a label.
const extension = allowedProofTypes.get(request.headers['content-type'])
if (!extension) return response.status(422).json({ message: 'Upload a JPEG or PNG image.' })
const storageKey = `${crypto.randomUUID()}${extension}`
```

`storage_key` is `UNIQUE` in the schema, which a UUID satisfies for free.

### Pattern H — resolve the actor's own id from the session, then scope by it

```js
// The driver's own id -- never read from the request body.
const personnel = await pool.query('SELECT delivery_personnel_id FROM delivery_personnel WHERE user_id = $1', [request.user.id])
const personnelId = personnel.rows[0]?.delivery_personnel_id

// Every read AND every write is scoped by it. A delivery that isn't
// theirs must 404, not 403 -- same "don't confirm it exists" reasoning
// GET /api/orders/:id already uses for another customer's order.
const result = await client.query(
  `UPDATE deliveries SET status = $1
    WHERE delivery_id = $2 AND delivery_personnel_id = $3 AND status = $4
  RETURNING order_id`,
  [next, deliveryId, personnelId, from],
)
```

Scoping in the `WHERE` clause of the write itself — rather than a separate
ownership check followed by an unscoped update — means the authorisation and
the write cannot disagree, for the same reason the claim pattern fuses its
condition into the update.

---

## Data flow

**Placing a delivery order:**

```
Customer picks a saved address, checks out
  -> POST /api/orders { orderType: 'DELIVERY', addressId, items }
     -> 422 if DELIVERY with no customerId (Decision 7 -- walk-ins can't deliver)
     -> 422 if the address isn't active and owned by this order's customer
     -> BEGIN  [the transaction Phase 5 already opens]
        -> deduct stock per item          [Phase 5, unchanged]
        -> INSERT orders (..., order_type='DELIVERY', address_id)
        -> INSERT deliveries (order_id, status='PENDING_ASSIGNMENT')  <- NEW
        -> COMMIT
```

**Assignment and the driver's run:**

```
Staff open Delivery Management, see the PENDING_ASSIGNMENT queue
  -> PATCH /api/deliveries/:id/assign { deliveryPersonnelId }   (ADMIN/CASHIER)
     -> claim PENDING_ASSIGNMENT -> ASSIGNED, set assigned_at

Driver opens their own list
  -> GET /api/deliveries/mine                                   (DELIVERY_PERSONNEL)
     -> scoped by their own delivery_personnel_id  [Pattern H]

  -> PATCH /api/deliveries/:id/status { status: 'OUT_FOR_DELIVERY' }
     -> claim ASSIGNED -> OUT_FOR_DELIVERY, scoped to them
     -> sync orders.status = OUT_FOR_DELIVERY      [Pattern F]

  -> POST /api/deliveries/:id/proof  (raw image body, ?proofType=PHOTO)
     -> scoped to them; storage key generated server-side  [Pattern G]

  -> PATCH /api/deliveries/:id/status { status: 'DELIVERED' }
     -> claim OUT_FOR_DELIVERY -> DELIVERED, set delivered_at
     -> orders.status deliberately UNTOUCHED        [Decision 4]

Staff settle payment, then mark the order COMPLETED through the existing
PATCH /api/orders/:id, which already refuses it while a balance is owed.
```

**Cancelling an order mid-delivery (Decision 6):**

```
PATCH /api/orders/:id { status: 'CANCELLED' }
  -> BEGIN
     -> claim the transition                        [Phase 5, unchanged]
     -> paid-order admin check + refund             [Phase 6, unchanged]
     -> restore stock                               [Phase 5, unchanged]
     -> UPDATE deliveries SET status='FAILED'       <- NEW
          WHERE order_id = $1 AND status NOT IN ('DELIVERED','FAILED')
     -> INSERT order_status_history
     -> COMMIT
```

## Files affected

**New**

- `server/routes/addresses.js` + twin + `addresses.test.js`
- `server/routes/deliveries.js` + twin + `deliveries.test.js`
- `server/lib/storage.js` + twin — the disk seam: `saveProofFile()`,
  `proofFilePath()`. Small on purpose.
- `src/pages/dashboard/DeliveryManagement.jsx` — staff: the assignment
  queue and every delivery's state.
- `src/pages/dashboard/MyDeliveries.jsx` — the driver's own list and
  transitions. Split from the above for the same reason
  `InventoryRequests.jsx` is split out: two audiences, two components.
- `src/pages/dashboard/AddressBook.jsx` — customer-facing address CRUD.
- `uploads/` (gitignored) — created on demand by `lib/storage.js`.

**Modified**

- `server/app.js` — mount `/api/addresses` and `/api/deliveries`.
- `server/routes/orders.js` + twin + tests — lift the DELIVERY 422, validate
  and attach `address_id`, create the `deliveries` row (Decision 3), refuse
  manual `OUT_FOR_DELIVERY` on delivery orders (Decision 2), and fail the
  delivery row on cancellation (Decision 6).
- `src/pages/dashboard/modules.js` — 'Delivery Management' is NOT currently
  in the module list; it needs adding, with roles `ADMIN`, `CASHIER`,
  `DELIVERY PERSONNEL`. Note the role string is space-separated there, not
  underscored (`lib/auth.js` normalises it).
- `src/pages/dashboard/Dashboard.jsx` — wire up the new screens.
- `.gitignore` — add `uploads/`.
- `package.json` — the two new test files.

**Deliberately untouched**

- `lib/billing.js` and the payment routes. Decision 4 keeps delivery out of
  money entirely.
- `lib/inventory.js` and the stock paths. A delivery order deducts stock at
  placement exactly like a pickup order; nothing about delivery changes when
  or how.

---

## Build order

Each step is independently testable, and the risky ones sit in the middle.

**Step 1 — addresses.** The prerequisite, and self-contained: a router,
CRUD, the one-default rule, deactivate-don't-delete. Nothing else depends on
Phase 7 code yet.

**Step 2 — enable DELIVERY orders.** Lift the 422, validate address
ownership, create the `deliveries` row in the same transaction. After this,
delivery orders exist but nothing moves them.

**Step 3 — assignment and the status workflow.** Pattern F and Pattern H,
including the `orders.status` sync and the manual-`OUT_FOR_DELIVERY`
refusal in `routes/orders.js`. This is the risky step: two state machines
meeting.

**Step 4 — cancellation interaction (Decision 6).** Small, but it modifies
Phase 5/6 code, so re-run the whole orders and payments suites, not just
the new ones.

**Step 5 — proof of delivery.** Patterns G and the storage seam.

**Step 6 — the three screens.**

---

## Testing checklist

Add to the existing suite (186 passing at the end of the Phase 6.5 review).

**Addresses**
- A customer sees and edits only their own addresses; another customer's
  id 404s.
- Setting a new default clears the previous one, and the partial unique
  index is proven directly with two concurrent inserts (the technique
  `inventory.test.js` already uses).
- A deactivated address disappears from the picker but an existing order
  still resolves it.

**Delivery orders**
- `DELIVERY` with no `customerId` is 422 (walk-ins can't deliver).
- `DELIVERY` with an address belonging to a DIFFERENT customer is refused.
- Placing a delivery order creates exactly one `deliveries` row at
  `PENDING_ASSIGNMENT`, in the same transaction as the stock deduction —
  and if stock is insufficient, NO delivery row is left behind.

**Workflow**
- Each transition is refused from the wrong source state with a 409.
- A driver cannot transition, read, or upload proof against a delivery
  assigned to someone else — and gets a 404, not a 403.
- `OUT_FOR_DELIVERY` syncs `orders.status`; `DELIVERED` does NOT touch it
  (Decision 4 — this one will look wrong without the plan open, so it gets a
  comment pointing here).
- `PATCH /api/orders/:id` refuses a manual `OUT_FOR_DELIVERY` on an order
  that has a delivery row (Decision 2).
- An admin can move `FAILED` back to `PENDING_ASSIGNMENT`; a cashier and a
  driver cannot.

**Interactions**
- Cancelling an order with an `ASSIGNED` delivery marks that delivery
  `FAILED` in the same transaction, and the stock restore and any refund
  still happen exactly as before.
- The Phase 5 and Phase 6 suites still pass untouched — particularly
  `six simultaneous cancels of one order restore its stock exactly once`,
  since Step 4 edits that handler.

**Proof of delivery**
- A `file_name` of `../../server/db.js` writes a UUID-named file inside
  `uploads/` and nothing outside it (Pattern G). This is the security test
  of the phase; write it first.
- A non-image content type is refused with 422.
- A file over the size limit is refused cleanly, not with a 500.

### On writing these tests

Two concurrency tests in Phase 5 and one in Phase 6.5 **passed against
broken code** on the first attempt and had to be rewritten. The lesson,
restated because it keeps being needed: drive contention deliberately with a
held-open transaction rather than firing concurrent requests and hoping, and
**temporarily break each fix to watch the test go red before trusting it.**
A test that has never been observed to fail is not yet a test.

---

## Known gaps deliberately left open

- **No cash-on-delivery collection.** Decision 4. The driver marks
  `DELIVERED`; staff settle payment separately. This is the most likely
  first complaint from real use and the natural next increment — it needs
  `DELIVERY_PERSONNEL` to be able to record a payment against their own
  assigned order only, which is a deliberate widening of Phase 6's surface
  and deserves its own decision rather than being slipped in here.
- **No delivery status history table.** `assigned_at`, `delivered_at`, and
  `note` carry what this phase needs.
- **Local disk storage for proof files.** Fine for a capstone and for a
  single-machine deployment; a real deployment behind more than one server
  instance needs object storage, which is what the `lib/storage.js` seam
  exists to make cheap.
- **No proof-of-delivery viewer for customers.** Staff can see proofs;
  exposing them to the customer who received the order is a small,
  obvious follow-up, deliberately not bundled here.
- **Carried forward, still open:** `inventory_movements` and `stock_alerts`
  remain write-only (since Phase 5); PayMongo credentials are still not
  wired in, so the gateway path is unexercised against the real API (Phase
  6.5); a `COMPLETED` order still cannot be refunded (confirmed as a
  deliberate business rule in the Phase 6 review).
