# CLIENT_REVISIONS_PLAN.md — changes from the client consultation (2026-10-15)

The client (Pecto's General Manager) reviewed the system and asked for six
things. The team's decisions on 2026-10-15 are recorded with each item.
Use this plan with `PHASES-RULES-PLANNING.md` and `FRONTEND-RULES.md`.

Build order: smallest and safest first. Each phase is its own commit and
leaves the system working:

| Phase | Items | Size | Migration |
|---|---|---|---|
| R1 | #4 cashier edits stock directly; staff no longer see "Pay with GCash"; #5 driver sees the order items | small | — |
| R2 | #6 no refunds: an order cannot be cancelled once paid | small–medium | — |
| R3 | #2 no expiry; stock losses are "Reject" | medium | 023 |
| R4 | #3 daily order numbers, recent orders, new-order notifications, cleaner dashboards | large | 024 |
| R5 | #1 ingredient stock | medium | 025 |

**Tell the adviser about #1.** The adviser ruled ingredients out of scope
(migration 022), and the client now asks for them back. The team decided
on ingredient **stock only**, which is a much smaller scope than the
removed recipes and batches. The paper's Limitations paragraph about
ingredients changes with it.

---

## R1 — Cashier stock edits, no staff GCash button, driver sees the items

### #4a Cashier edits stock directly (no approval)

**Client:** cashiers are the ones who encode stock, sometimes the admin; the
approval step gets in the way.

**Today:**
- The cashier proposes stock changes (`POST /api/inventory/requests`), and
  the admin approves them (`PATCH /api/inventory/requests/:id`).
- Only the admin changes stock directly (`PATCH /api/inventory/:productId`,
  `requireRole('ADMIN')`).

**Change:**
- `PATCH /api/inventory/:productId` allows `ADMIN` and `CASHIER`.
- Every change is still written to `inventory_movements`, with who made it
  and why, so accountability does not depend on approval.
- `InventoryManagement.jsx`: the cashier gets the same stock controls as
  the admin. The "Propose a change" and "Change requests" tabs are
  removed. The requests routes stay, read-only, so old requests remain
  visible in the database.
- **Assumption:** product details and prices stay admin-only (Product
  Management). "Cashiers encode the products" is read as encoding
  **stock**. Confirm with the client; if cashiers also add products, it
  is a one-line role change on `routes/products.js`.
- Tests:
  - A cashier's stock change succeeds and writes a ledger row naming the
    cashier.
  - The request routes are no longer needed by the UI.

### #4b Remove "Pay with GCash" from the staff receipt

**Change:**
- `PaymentBilling.jsx`: `canPayOnline` is for customers only.
- Staff record cash or GCash by reference number, as before.
- `POST /api/payments/intent` stays allowed for staff at the server, but
  nothing in the staff UI calls it. Restricting it to `CUSTOMER` is
  cleaner; do that, and update the test that creates an intent as a
  cashier to use the customer.
- This reverses the 2026-10-13 choice to keep the button.

### #5 Driver sees the order items

**Change:**
- `routes/deliveries.js`: `mapDeliveryRow` adds `items` (product name,
  size or pack, quantity) from `order_details`. It is read in one query
  for all listed deliveries, not one query per delivery.
- `MyDeliveries.jsx`: each card lists the items, the special
  instructions, and the requested time.
- The driver's History tab shows the items too, collapsed.
- Test: `/api/deliveries/mine` returns the items for the driver's own
  delivery.

---

## R2 — No refunds: a paid order cannot be cancelled (#6)

**Client:** the bakery does not give refunds.

**Today:**
- An admin can cancel a paid order. That marks its payments `REFUNDED`
  and refunds online payments through PayMongo (`lib/refunds.js`).
- The Sales report shows "Refunds issued".

**Change:**
1. `PATCH /api/orders/:id` → `CANCELLED` is refused for **everyone** when
   the order has any `PAID` payment: "This order has been paid, so it
   can't be cancelled. Settle any problem with the customer at the
   counter." Checked inside the transaction, after the claim, as the
   current admin-only check is.
2. Customers can still cancel their own **unpaid** order while it is
   Placed. Cancelling still closes any `PENDING` GCash attempt.
3. **A payment that arrives after cancellation:** the customer finished a
   GCash checkout that was still open when the order was cancelled.
   - The webhook or confirm-on-return records it as `PAID` against the
     cancelled order. It is **not** refunded automatically.
   - The order detail and the Payment & Billing list flag it: "Paid after
     cancellation — settle with the customer".
   - This is rare, but the money must not disappear from the records.
4. Remove the refund paths:
   - `POST /api/payments/:id/refund` and the "Retry refund" button;
   - the refund branch of the cancel transaction;
   - `settleGatewayRefunds` calls;
   - the "Refunds issued" box and chart series in Reporting.

   Keep the `REFUNDED` status and the refund columns: past rows stay as
   history, and reports keep excluding them.
5. Text:
   - the Terms page's "Cancellations and refunds" section becomes
     "Cancellations": unpaid orders can be cancelled; paid ones are
     settled at the bakery;
   - Privacy Policy wording on refunds is updated too.
6. Tests:
   - A paid order cannot be cancelled by admin, cashier or customer.
   - An unpaid order can be cancelled.
   - A payment arriving after cancellation is recorded as `PAID` and
     flagged, with no PayMongo refund call.
   - The old refund tests are removed or rewritten.

---

## R3 — No expiry; stock losses are "Reject" (#2)

**Client:**
- Bread past its best is toasted and sold again, or rejected.
- Only rejects are written down. Burned or dropped bread is not recorded.

**Today:**
- `inventory.expiration_date` and `products.shelf_life_days` exist.
- Expired stock is hidden from the menu, refused at checkout, and shown
  as an **Expired** status and Dashboard tile.
- Loss reports offer Spoilage, Damaged, Expired and Production loss.

**Change (migration 023):**
1. Add `'REJECT'` to `stock_movement_reason`. The old values stay in the
   enum, so past ledger rows remain readable.
2. Drop `inventory.expiration_date` and `products.shelf_life_days`.
   Remove every use:
   - `notExpiredSql`, `expiredSql`;
   - the Expired status in `stockHealth.js`;
   - the Dashboard's Expired tile;
   - the menu and checkout expiry checks;
   - the shelf-life field in Product Management;
   - the restock code that sets an expiry date (`lib/restock.js`).
3. Stock losses in Inventory Management: one action, **Record reject**,
   with a quantity and an optional note.
4. The Inventory report:
   - losses are listed as rejects;
   - old rows keep their original reasons, shown as "Reject (recorded as
     Spoilage)" and so on, so totals still add up.
5. The status filter becomes Good / Running low / Low stock / Needs
   attention, without Expired.
6. Seed and demo data: drop the expiry pieces. The SPOILAGE pass in the
   seed becomes REJECT.
7. Tests:
   - A reject lowers stock and writes a `REJECT` movement.
   - The menu and checkout no longer consult an expiry.
   - The old expiry tests are removed.
8. Text:
   - the Privacy Policy and Terms mention of expiry;
   - paper Parts B and E (expiry appears in B5, B6, the figure
     descriptions, and the Inventory scope paragraph);
   - Figures 10.1 and 11 need retaking.

---

## R4 — Daily order numbers, recent orders, notifications, cleaner dashboards (#3)

### Daily order number

**Decision:**
- Orders are numbered **#1, #2, #3… each day**, starting again at #1 the
  next day (Asia/Manila).
- The internal `order_id` stays the key everywhere in the database and
  API; it is no longer shown.

**Data (migration 024):**
- `orders.order_day DATE` and `orders.daily_number INT`, with
  `UNIQUE (order_day, daily_number)`.
- A counter table `daily_order_numbers (day DATE PRIMARY KEY, last_number INT)`.
  Placing an order runs
  `INSERT … ON CONFLICT (day) DO UPDATE SET last_number = daily_order_numbers.last_number + 1 RETURNING last_number`
  inside the same transaction. That is atomic: two cashiers placing orders
  at the same moment can't get the same number.
- Backfill existing orders: number them per Manila day, in `order_date`
  order, and set each counter.
- The seed backdates orders after placing them, so it must recompute the
  numbers for the moved orders. Add a small helper that renumbers one day.

**Display:**
- Everywhere an order is shown, `#21170` becomes **`#7`**, with the date
  wherever the day isn't obvious ("#7 · Oct 15"):
  - staff lists and detail;
  - Due today;
  - Delivery Management;
  - My Deliveries;
  - receipts and the customer's My Orders and My Payments;
  - the Order placed page.
- The PayMongo description becomes "Pecto's Bakery order #7 (Oct 15)".
- Search in Order Management matches the daily number, or a date plus a
  number.

### Recent orders and notifications

**Dashboard (admin and cashier):** a **Recent orders** panel, the newest 8:
- order number, time, customer or "Walk-in", pickup or delivery, total,
  payment state and status;
- each row opens the order;
- it refreshes on its own.

**New-order notifications (admin and cashier):**
- The staff screens poll `GET /api/orders/recent?since=<time>` every
  20 seconds. This is light, and there is no server push to set up.
- A **bell** in the header shows the number of new orders not yet seen.
  Opening it lists them; clicking one opens it in Order Management.
- A **toast** pops up for each new order: "New order #8 — Juan, delivery,
  ₱240".
- An optional soft **sound**, on by default with a mute toggle remembered
  per device.
- A **browser notification** fires when the tab is in the background, if
  the staff member allowed it once.
- "New" means placed since the staff member last looked. That is kept
  per device, so nothing new is stored in the database.
- **Driver:** the same bell and toast for a **newly assigned delivery**.

### Cleaner dashboards

The client wants things organized at a glance. The order of the
**Dashboard** (admin and cashier), top to bottom:
1. A greeting and today's totals (orders, ordered, collected), in one
   compact row.
2. **Needs action now:** only the tiles that are not green, largest
   first. The green ones fold into one "All good: low stock, deliveries…"
   line.
3. **Recent orders** (above).
4. **Restock first** (stock), shortened to 5 rows.

**Driver:** My Deliveries is grouped as "To deliver now" (Out for
delivery), then "Assigned to you", each card showing the items (R1).

**General:**
- less text in tile captions;
- consistent spacing;
- table columns limited to what is needed, with details in the order view.

Screens to retake for the paper after R4: Figures 2, 2.1, 2.2, 6, 7, 8,
12–14.

**Tests:**
- Two simultaneous orders get different daily numbers.
- Numbering restarts the next day.
- The backfill numbers existing orders in time order.
- `/api/orders/recent?since=` returns only newer orders and is
  staff-only.

---

## R5 — Ingredient stock (#1)

**Decision: stock only.** No recipes, no automatic deduction.

**Data (migration 025):**
- `ingredients`:
  - name (unique);
  - unit, free text: kg, g, L, mL, pc, sack, tray;
  - `stock_quantity NUMERIC(12,3) ≥ 0`;
  - `min_stock_level`;
  - `is_active`.
- `ingredient_movements`:
  - who, when, quantity change, a note;
  - reason `RESTOCK` (delivery received), `USAGE` (used in baking),
    `REJECT` (spoiled or thrown out), or `CORRECTION` (recount).
- The removed design is in git (commit `3498db5`, removed in `f2e810c`).
  Reuse its table shapes, without cost, recipes or batches.

**Server:** `routes/ingredients.js`, admin and cashier:
- list;
- add or edit an ingredient (admin only: name, unit, minimum);
- record a movement (both roles).

The quantity changes through the same conditional-update pattern products
use, so stock never goes below zero.

**UI:**
- An **Ingredients** tab in Inventory Management, with the same layout as
  stock levels:
  - name, stock with its unit, minimum, status (Good / Running low /
    Low);
  - Restock, Record usage, Record reject, and Correct buttons;
  - a history of movements.
- A Dashboard tile, **Ingredients running low**, opens the tab filtered.

**Reports:** the Inventory tab gets an ingredient section: movements in the
chosen range, and current low ingredients.

**Paper:**
- Part E's Limitations paragraph loses "does not track raw materials".
  Recipes and production costing stay out of scope.
- B5 gains a paragraph on ingredient stock.
- The database chapter gains the two tables.

**Tests:**
- Stock never goes below zero.
- Each movement writes a ledger row.
- A cashier can record movements but cannot add ingredients.

---

## After all phases

- Re-seed the demo data and retake the paper figures.
- Update `PAPER_FIX_PART_B.md` and `PAPER_FIGURES.md`.
- Push, which redeploys to Railway. Migrations 023–025 must be run on
  Railway's database too. Run them through `RAILWAY_DATABASE_URL` from the
  laptop before pushing the code that needs them.
