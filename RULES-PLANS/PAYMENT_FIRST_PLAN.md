# Payment first, no production — adviser revisions A11–A17

Written 2026-10-16 by Opus, built in the same session. The adviser's
requests, with the four decisions the user made (all four recommended
options).

## Why

The bakery bakes its day's stock before opening, and every transaction is
paid first: walk-in, pickup and delivery. So:

- there is no Production step and no "In production" status (A11, A12);
- there is no unpaid order, no "Waiting for payment", no "Unpaid
  balances", and a paid order cannot be cancelled (A14, A15, A17);
- the Dashboard's "Orders to prepare" opens Order Management (A13);
- staff see orders by the day they are picked up or delivered (A16).

## Decisions

1. **Statuses.** A paid order starts **Ready for pickup** (pickup, walk-in)
   or **Ready for delivery** (delivery). Then Completed (picked up), or Out
   for delivery and Completed (delivered). Not shown anywhere any more:
   Placed, Confirmed, In production, Cancelled. New enum values:
   `READY_FOR_DELIVERY`, and `AWAITING_PAYMENT` for the hidden hold below
   (migration 029). The old values stay in the enum for old rows.
2. **Online checkout = a 15-minute hold.** "Place order" saves the order as
   `AWAITING_PAYMENT` (stock deducted, as before) and goes straight to
   GCash. A hold is invisible to staff, reports, the bell and the
   customer's own lists, and has no delivery row yet. Paid → it becomes
   Ready for pickup / Ready for delivery, its placed time becomes the time
   it was paid, the delivery row is created, and staff are notified. Not
   paid within 15 minutes, or cancelled by the customer → CANCELLED by the
   system (or the customer), stock returned, still hidden. A payment that
   arrives after that is recorded as before ("paid after cancellation",
   shown to staff to settle). Online payment is GCash only.
3. **Walk-in pays inside the Walk-in page.** Cash (amount received, change
   shown) or GCash (reference number). `POST /api/orders` from staff must
   carry `payment: { method, gatewayReference? }`; the order and a PAID
   payment for its total are saved in one transaction, Ready for pickup.
   Staff orders without a payment are refused.
4. **Date filter: Today / Upcoming / Past**, by the order's day = the
   Manila date of its requested time, or of when it was placed (paid) if
   it has none. Today is the default; a reserved order shows under
   Upcoming until its day.

## Also

- Production module removed (screen, nav, `routes/production.js`). The
  Forecast in Reporting stays.
- Staff actions left by hand: **Picked up — complete** (pickup). Nothing
  else; delivery moves from the driver's phone.
- Old orders: paid open ones (PLACED/CONFIRMED/IN_PRODUCTION) become Ready
  for pickup/delivery (migration 030); unpaid open ones are cancelled by
  the system (lib/staleOrders.js); part-paid ones stay for staff.
- Bakery hours on the storefront: 5:00 AM – 10:00 PM (user, 2026-10-16).
- Customers can no longer cancel a paid pickup order (user confirmed,
  2026-10-16); they cancel only their own unpaid checkout.

## Not done

- No PayMongo "expire session" call: a hold that is cancelled leaves its
  GCash link open until PayMongo expires it; a late payment is recorded
  and flagged, never lost.
