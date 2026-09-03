# COUNTER_ORDER_PLAN.md — the cashier's own order screen, and demo data

Two pieces of work with one deadline: a presentation. Part A closes the
last real functional hole in the system. Part B makes the working system
*look* like it works.

Named, not numbered, for the same reason `STOREFRONT_PLAN.md` and
`CHECKOUT_PLAN.md` are: the roadmap's Phase 9 belongs to AI-Assisted
Analytics, and this is work the roadmap assumed rather than scheduled.

---

## Part A — a cashier can take an order at the counter

### Step 0 — Inspect: the backend already does this; only the UI is missing

Found by walking the live system, not by reading it. A cashier posting to
`POST /api/orders` with nothing but items:

```
cashier creates WALK-IN order -> 201 {"id":"6540","status":"PLACED","totalAmount":"8.00"}
  customerName: null | processed by: "Test Cashier"
```

It works today. `orders.js:153` admits `CASHIER`, resolves `processed_by`
from the cashier's own account (`orders.js:200-202`), and leaves
`customer_id` null for a walk-in — the nullability the schema was
deliberately given for exactly this (`PHASE7_PLAN.md`, Decision 7).

**`OrderManagement.jsx` has no way to reach it.** The file imports only
`apiGet` and `apiPatch` — there is no `apiPost` anywhere in it. Staff can
watch orders and advance their status; they cannot create one. So every
order in the system must currently originate from a customer on the
storefront, which for a bakery OMS is the wrong way round: the counter is
where most orders really start.

### Decision 1 — CASHIER only. Not ADMIN.

`POST /api/orders` is `requireRole('CUSTOMER', 'CASHIER')` — an admin is
refused, and `orders.js`'s own header explains why: `orders.processed_by`
references `cashiers(cashier_id)`, so the schema itself treats order-taking
as a cashier's job. An admin has no `cashier_id` to record.

So the New-order UI renders for `CASHIER` only, and an ADMIN viewing Order
Management sees the list exactly as they do now. Same "don't offer a
control that cannot work" rule the Report History tab follows in reverse
(`ReportingAnalytics.jsx`'s `tabsFor`).

**Demo note:** counter orders must be demonstrated as `cashier1`. Signing
in as the admin and looking for this form will find nothing, by design.

### Decision 2 — the draft is component state, NOT the storefront cart

Reuse the *shape* (`{ productId, quantity }`), not the machinery. Do not
import `CartContext` here.

That context is deliberately persisted to `localStorage` per identity
(`CHECKOUT_PLAN.md`, Decision 3) because a customer's cart *should* survive
a refresh. A cashier's half-built counter order should do the opposite:
it belongs to one transaction with one person standing at the counter, and
it must not survive a refresh, must not follow the cashier to another
screen, and must never be visible to whoever uses that shared terminal on
the next shift. Persisting it would be a bug wearing a feature's clothes.

Plain `useState` in the form, cleared on submit and on cancel.

### Decision 3 — the customer-id trap. THIS is the one that will bite.

`GET /api/customers` returns **`id: row.user_id`** (`customers.js`'s
`mapCustomerRow`). `POST /api/orders` and `GET /api/addresses?customerId=`
both want **`customers.customer_id`**. These are different numbers from
different sequences.

Verified live — the only customer in the database right now:

```
customer_id 1914  |  user_id 4868  |  Test Customer
```

Pass the list's `id` (4868) as `customerId` and the order is refused with
"Selected customer does not exist." That is today's *lucky* outcome. With
more customers on file, a `user_id` can equal some **other** customer's
`customer_id`, and then the same mistake silently books the order to the
wrong person — money and a delivery address attached to a stranger, with
nothing in the UI to reveal it.

**Fix: add `customerId` to `mapCustomerRow`'s output**, alongside the
existing `id`. Additive — `CustomerManagement.jsx` reads `.id` and is
unaffected. This is the plan's only backend change; it needs the twin
(`customersExplanation.js`, byte-parity on executable code) and a test
asserting the two fields are present and are the row's real
`customer_id`/`user_id` respectively.

Give the field a comment at the mapper saying which is which, because the
response now carries two ids for one person and the next reader deserves
to be told which one addresses an order.

**Rejected:** having the frontend resolve it (no endpoint exposes
`customer_id`); redefining what `id` means (breaks the customer screen);
teaching `POST /api/orders` to accept a `user_id` (that column genuinely
references `customers(customer_id)` — the fix would be a fiction).

### Decision 4 — walk-in by default; a customer is optional; DELIVERY needs one

The three legal shapes, and the form should make the illegal one
unreachable rather than letting the server refuse it:

| Customer | Type | Allowed |
|---|---|---|
| none (walk-in) | PICKUP | yes — the default |
| chosen | PICKUP | yes |
| chosen | DELIVERY | yes, with one of *their* saved addresses |
| none (walk-in) | DELIVERY | **no** — `orders.js:221` refuses it |

So: selecting DELIVERY without a customer should disable the submit and say
why, in the form. The backend's own message ("A delivery order needs a
customer account — walk-in orders can only be picked up") stays as the
backstop, never as the first time the cashier hears about it.

Addresses come from `GET /api/addresses?customerId=<customer_id>` — staff
must supply it (`addresses.js:150`), and it must be the id from Decision 3.

### Decision 5 — no client-side pricing authority

Identical to `CHECKOUT_PLAN.md`'s Decision 2, for the identical reason: the
running total while building the order is **provisional**, computed from a
fresh `GET /api/products` purely for the cashier to read out loud. The
authoritative figure is the `totalAmount` in the 201 response, summed by
Postgres from the rows actually written (`orders.js:312-336`).

### Decision 6 — tabs on Order Management, not a separate module

`Orders` / `New order`, using the tab pattern `InventoryManagement.jsx`
("Stock levels" / "Change requests") and `MyProfile.jsx` already
established. Not a new `modules.js` entry: taking an order and watching
orders are the same job, and a second nav item would split one workflow
across two places.

### Decision 7 — a created order opens immediately

On 201: clear the draft, reload the list, switch to the Orders tab, and
open the new order's detail panel. The cashier then advances its status
from the screen they are already on — which is also the cleanest thing to
show a panel: take the order, then walk it through the kitchen.

### Implementation steps (Part A)

1. **Backend, the one change.** Add `customerId: row.customer_id` to
   `mapCustomerRow` in `server/routes/customers.js`; mirror into
   `customersExplanation.js`; add a test to `customers.test.js` asserting
   both ids are returned and that `customerId` is the one that
   `POST /api/orders` accepts. Verify twin parity (comment-stripped diff).
2. **Tabs.** Split `StaffOrderManagement` into an `Orders` tab (everything
   it renders today, unchanged) and a `New order` tab, the latter rendered
   only when `user.role === 'CASHIER'`.
3. **The form.** Customer picker (default "Walk-in", plus a searchable list
   from `GET /api/customers`), order type toggle, address picker for
   DELIVERY, item picker (product + quantity → line list, editable
   quantities, remove line), instructions (500 cap, matching
   `orders.js:34`), provisional total, submit.
4. **Submit and land.** `POST /api/orders`; on 201 do Decision 7. Handle
   409/422 the way `CheckoutPage.jsx` does — never show the raw
   "Not enough stock for product 47." to a person; re-fetch products and
   ask them to review the lines.

---

## Part B — demo data

### Decision 8 — seed THROUGH the API, then backdate. Never INSERT orders directly.

A direct `INSERT INTO orders` skips stock deduction, the
`inventory_movements` ledger, and `order_status_history` — so the sales
report and the inventory report would stop reconciling with each other,
which is the exact invariant Phases 5 and 8 are built to uphold. A panel
asking "does your inventory match your sales?" would get a wrong answer
from a system that is actually correct.

Place every order through the real endpoints as the real accounts, then
move `order_date` / `payment_date` with a direct `UPDATE` — precisely the
technique `reports.test.js`'s own `placeOrderAt` helper already uses.

### Decision 9 — removable, and invisible

Write every created id to a JSON manifest and ship a cleanup script beside
the seed, the same shape the earlier user-cleanup work used.

Do **not** tag seeded rows with a visible marker (`"[demo]"` in
`instructions`, a "Demo" customer name). That text renders on screen during
the presentation. The manifest is how you find them again, not the data.

### Decision 10 — restock afterwards, and leave the alerts you want

Seeding ~60 orders deducts real stock. Left alone that can push much of a
41-product catalogue under its minimum, flooding "Needs attention" (capped
at 50) and making the dashboard look like an emergency.

After seeding, restock through `PATCH /api/inventory/:productId` with
reason `RESTOCK` — through the route, so the ledger stays honest — leaving
**two or three** products deliberately below minimum, so the low-stock
feature demonstrates itself without dominating the screen.

### Decision 11 — reuse the four real accounts; create no new users

The user table was deliberately cut to exactly four accounts (one per
role). A seed that invents twenty customers to make charts prettier would
quietly undo that decision. Account-bound orders belong to `customer1`;
variety comes from **walk-ins** (`customer_id` null), which is realistic
for a bakery counter anyway.

### Decision 12 — what the seed should contain

Spread across ~90 days (well inside the 366-day report cap,
`lib/reporting.js:31`), so day, week and month groupings all have shape:

- **Mostly COMPLETED and fully paid** — the bulk of the volume.
- **A few CANCELLED** — proves reports exclude them, and that stock came back.
- **One REFUNDED payment** — otherwise the refunds column and its chart
  series are permanently zero and look broken.
- **Several unpaid or part-paid open orders** — makes `outstanding`
  non-zero and gives Payment & Billing something to record against live.
- **A mix of PICKUP and DELIVERY**, and a handful of walk-ins.
- **One order sitting in each mid-status** (`CONFIRMED`, `IN_PRODUCTION`,
  `READY_FOR_PICKUP`) so Order Management looks like a working board.
- **One delivery ASSIGNED to `delivery1` and not yet delivered** — without
  this the driver's own screen reads "Nothing assigned right now" in front
  of the panel. This is the single highest-value row in the whole seed.
- **A few RESTOCK and SPOILAGE movements** so the inventory report shows
  more than one reason, and spoilage — the number that matters most to a
  bakery — is not zero.
- **Vary the products** so "Top products" is a ranking rather than a tie.

### Implementation steps (Part B)

1. `scripts/seed-demo-data.mjs` — logs in as the real accounts, places
   orders through the API, backdates them, records every id to
   `scripts/demo-data-manifest.json`.
2. `scripts/clear-demo-data.mjs` — reads the manifest and removes exactly
   those rows, in FK-safe order (payments → inventory_movements →
   order_status_history → order_details → deliveries → orders).
3. Restock pass per Decision 10.
4. Run it, then open each screen and look. The seed is right when the
   dashboard, the sales chart, product performance, inventory, Payment &
   Billing, Order Management and My Deliveries all show something
   plausible.

---

## Files affected

**New**
- `src/pages/dashboard/NewOrderForm.jsx` (or kept inside
  `OrderManagement.jsx` if it stays small — implementer's call)
- `scripts/seed-demo-data.mjs`, `scripts/clear-demo-data.mjs`

**Modified**
- `server/routes/customers.js` + `customersExplanation.js` +
  `customers.test.js` — Decision 3, the only backend change
- `src/pages/dashboard/OrderManagement.jsx` — tabs + the form

**Deliberately untouched**
- `src/cart/CartContext.jsx` — Decision 2. If the form seems to want it,
  the form is wrong.
- `POST /api/orders` itself — it already does everything needed. If a step
  seems to require changing it, stop and re-read Decision 4.

## How to test

1. **Walk-in, cash, complete** — as `cashier1`: New order → no customer →
   PICKUP → two products → place → the order opens → advance to COMPLETED,
   recording payment when the 409 says it still owes.
2. **Named customer, delivery** — pick `customer1`, choose DELIVERY, pick a
   saved address, place. Confirm it reaches the assignment queue and that
   the order's detail shows the right customer (**not** a different one —
   Decision 3's whole point).
3. **The illegal combination** — DELIVERY + walk-in must be unreachable in
   the form, and still refused by the server if forced.
4. **Stock conflict** — order more than stock; confirm a readable message
   and that the draft survives so the cashier can fix the quantity.
5. **ADMIN sees no New-order tab** (Decision 1).
6. `npm run lint`, `npm run build`, `npm test` — the customers test must
   cover the new field, and all existing tests stay green.
7. **After seeding:** every screen shows plausible data, and
   `SUM(inventory_movements.quantity_change)` still reconciles with stock.

## Known gaps deliberately left open

- **No order editing after placement.** A wrong line is fixed by
  cancelling and re-taking the order (stock returns automatically).
- **No customer creation from the order form.** A new walk-in who wants an
  account registers on the storefront; the form's walk-in path covers the
  counter case.
- **Admin still cannot take orders** — Decision 1, schema-level, not an
  oversight.
- **Admin OTP still arrives via the server console** — deliberately out of
  scope here; a different OTP delivery is planned separately. For the
  presentation, keep the API server's terminal readable.
- **Online payment still 503s** — PayMongo credentials remain unset
  (carried forward from Phase 6.5).
