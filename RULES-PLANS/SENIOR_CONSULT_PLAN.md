# Senior consultation revisions (2026-10-24)

The team consulted their seniors and asked for five changes. Decisions below
were confirmed with the user on 2026-10-24. Build in the order S1–S5, one
commit each. Paper notes go in PAPER_FIX_REVISIONS.md under "S1–S5".

## S1. Time picker shows only available times

**Ask:** "Remove the time outside 5 AM–10 PM, like the dates." The native
date input already greys out dates outside its min/max. The native time
input does not: a person can still scroll to 3:00 AM and only learns it is
refused on submit.

**Decision:** keep the date and the time (online advanced orders still need
them). Replace `<input type="time">` in `src/components/NeededByFields.jsx`
with a `<select>` that lists only times that can be chosen.

- Slots every 30 minutes from 5:00 AM to 10:00 PM, labelled "5:00 AM".
- For today, only slots after the current Manila time (`timeLimits(day).min`).
- No date chosen: the select is disabled with the option "Choose a date first".
- Today after the last slot: `dateLimits` already moves the minimum date to
  tomorrow, so today cannot be picked.
- A slot that was picked earlier and has since passed is cleared when the
  slot list changes (the caller's `onTimeChange('')`).
- Add `timeSlots(day, now)` to `src/lib/orderHours.js` and use it in the
  select. `checkPicked` stays as the submit check. The server rules
  (`server/lib/orderHours.js`) do not change.
- Used by the storefront checkout and the cashier's Walk-in / Advanced order
  form; both get the change through the shared component.

## S2. Address: Lucban, Quezon fixed

**Ask:** the system only covers Lucban, so municipality defaults to Lucban
and only street, barangay and the like are editable.

- `src/components/AddressForm.jsx`: municipality and province are shown as
  read-only text ("Lucban" / "Quezon"), not inputs, with the help line "We
  deliver within Lucban, Quezon only." They are never sent; the column
  DEFAULT fills them (see the DB-default field validation memory).
- `server/routes/addresses.js`: a POST or PATCH that names a municipality
  other than Lucban, or a province other than Quezon, gets 422 "We deliver
  within Lucban, Quezon only." Existing addresses outside Lucban are left as
  they are; checkout already refuses them for delivery.

## S3. Cash at pickup; GCash only for delivery

**Ask:** pickup can be paid in cash or GCash. A cash pickup that is placed but
not paid shows status "Ready for pickup" with payment "Not paid". Order
details show the mode of payment. Delivery stays GCash only.

**Decisions (user, 2026-10-24):**
- No-show: the existing nightly rule cancels it after its day
  (`closeStaleOrders`), with no stock returned (baked for that day).
- Troll guard: a customer may have only ONE open unpaid cash pickup at a time.

**Schema — migration 037_payment_mode.sql**
- `orders.payment_mode VARCHAR(10) NULL CHECK (payment_mode IN ('CASH','GCASH'))`.
  NULL for old rows. The mode the order was placed with, not a payment record.
- Backfill: staff orders from their first PAID payment's method; online
  orders with a gateway payment as GCASH. Others stay NULL.

**POST /api/orders (customer)**
- Body `paymentMode`: `CASH` or `GCASH`, default `GCASH`.
- `CASH` with `orderType` DELIVERY → 422 "Delivery orders are paid with GCash."
- `CASH`: lock the customer row (`SELECT ... FROM customers ... FOR UPDATE`)
  before the order insert, then refuse with 409 when the customer already has
  an order with `payment_mode = 'CASH'`, status READY_FOR_PICKUP, and no
  PAID payment: "You already have a cash order waiting for pickup (#N). Pay
  for or collect it first, or pay this one with GCash." A partial unique
  index cannot express "unpaid" (it lives in `payments`), so the app guards it.
- `CASH` orders start at READY_FOR_PICKUP (not AWAITING_PAYMENT), stock is
  deducted as usual, and a history row "Placed — pay in cash at pickup." is
  written. The response message: "Order placed. Pay in cash when you pick it up."
- `GCASH` keeps the current AWAITING_PAYMENT hold and the GCash redirect.
- Staff orders store `payment_mode` = the method of the payment taken.

**Automatic jobs (`server/lib/staleOrders.js`)**
- `cancelUnpaidOrders` must skip `payment_mode = 'CASH'` orders: today it
  cancels any unpaid READY_FOR_PICKUP within a minute.
- `closeStaleOrders` already cancels an unpaid order after its day. No change.

**Cancelling**
- A customer may cancel their own unpaid cash pickup (no payment at all) from
  My Orders / the receipt, same reason rule as today. Paid orders still
  cannot be cancelled.
- Staff can cancel it as today (UI shows Cancel when nothing is paid).

**Completing:** unchanged. The cashier records the cash in Payment & Billing
(or the order detail), then "Picked up — complete"; the server refuses
COMPLETED until fully paid.

**API output:** `paymentMode` on the order list rows and the order detail.

**Screens**
- Checkout: for Pickup, a choice "Cash" / "GCash". For
  Delivery, the existing "paid first with GCash" note and no choice. Cash
  places the order and goes to `/receipt/:id`; the button reads "Place
  Order" for both.
- Receipt page: a cash order with nothing paid shows "Order #N is placed.
  Pay ₱X in cash when you pick it up." and a Cancel button, not the GCash
  hold message.
- Staff order detail, Payment & Billing detail, customer My Orders: a "Payment
  method: Cash / GCash" line, and a payment pill "Not paid" (red) or
  "Paid" (green) next to the order status. Lists (Order Management, Billing
  tab Ready for pickup, Dashboard Needed by) show a small "Not paid" tag on
  unpaid rows.
- Bell `order_placed` text adds "cash, not paid" for an unpaid cash order.

## S4. Red low-stock toast

**Ask:** a toast like the new-order one when a product hits low stock, red so
it reads as a warning.

**Decision (user):** products only.

- `server/routes/notifications.js`: new staff event `low_stock` from
  `stock_alerts.created_at` (join inventory, products), key
  `low_stock:<alert_id>`. One alert per low spell already
  (`syncStockAlert`), so each spell is announced once; a refreshed message
  does not re-announce. Includes the viewer's own changes (a cashier's sale
  can cause it). Carries productName, stockQuantity, minStockLevel.
- `src/components/NotificationBell.jsx`: wording "Low stock: <product>" /
  "<n> left (minimum <m>)". Toast styled red (red left border, red-50
  background, red title, a warning icon), stays 15 s, with a close button.
  A lower two-note tone instead of the chime. In the bell list it gets a red
  "Low stock" tag.
- Clicking it opens Inventory Management (Dashboard's `onOpen` handler routes
  by `item.type`).

## S5. No User Management for the cashier

- `src/pages/dashboard/modules.js`: User Management roles `['ADMIN']`.
- The server's `/api/customers` stays open to CASHIER: the walk-in form may
  still look up customers. Check the Dashboard has no other link into it for
  a cashier.

## Checks
- `npm test` (backend) passes; add tests for: cash pickup placed READY with
  no payment; second open cash order refused; cash delivery refused;
  cancelUnpaidOrders leaves a cash order alone; low_stock event appears;
  address with another municipality refused.
- `npm run build` passes.
- Migration 037 runs locally; Railway needs it before the push (column read
  by the new code).
