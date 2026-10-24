# Delivery fee and one payment log (2026-10-25)

Two requests from the user after the seniors' consultation. Decisions were
confirmed with the user on 2026-10-25. Build D1 and then D2, one commit each.

## D1. Delivery fee

**Ask:** add a delivery fee. The user first asked for the rider to set it,
then decided against that: the fee is set at checkout, so it is part of the
GCash payment and shows on the receipt. For now it is a flat ₱50.

**Decisions (user):**
- One flat fee for every delivery order: ₱50 for now. Pickup orders have no fee.
- The fee is part of the order total and is paid with GCash with the bread.
- The fee is bakery income, but it is kept apart from bread sales.

**Schema: migration 038_delivery_fee.sql**
- `orders.delivery_fee NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0)`.
  Older orders get 0.

**Server**
- `config.orders.deliveryFee` comes from env `DELIVERY_FEE` and defaults
  to 50. POST /api/orders stores it on a DELIVERY order and 0 on a pickup.
- `total_amount` = SUM(order_details) + delivery_fee. This is the one place
  the total is written. The GCash intent charges `balanceDue`, so the fee
  is included in the payment automatically.
- GET /api/orders/:id and the order list return `deliveryFee`.
- Reports (`routes/reports.js`, sales): "ordered" becomes
  `SUM(total_amount - delivery_fee)`, so bread sales figures stay
  unchanged. A new `deliveryFees` figure is added to the totals and to
  each bucket. "Collected" stays all the money received, fees included,
  and the screen says so. The product reports read `order_details`, so
  they are not affected.
- The forecast reads `order_details`, so it does not change.

**Screens**
- Checkout: the order summary shows Subtotal, Delivery fee ₱50 (delivery
  only) and Total. The client copy of the fee is in `src/lib/bakery.js`
  (`deliveryFee`); the server's figure is the one that counts.
- Receipt, staff order detail, Payment & Billing detail and My Orders: a
  "Delivery fee" line above the total when the fee is above 0.
- Reports: a "Delivery fees" figure beside the sales totals.

## D2. One payment log

**Ask:** remove the Transactions tab from Reporting & Analytics. It is the
same list as the Payment log in Payment & Billing. Add PDF export to the
Payment log instead.

- `ReportingAnalytics.jsx`: remove the Transactions tab and its state.
- `PaymentLog.jsx`: add "Export PDF". It loads every payment that matches
  the current filters, not only the page on screen. Then it prints with
  `PrintHeader`, titled "Payment log" with the date range and method, and
  ends with a total. The browser's Save as PDF writes the file, as the
  other reports already do (PrintReport.jsx).

## Checks
- Backend tests: a delivery order's total includes the fee and a pickup's
  does not. The sales report's ordered figure excludes the fee and
  `deliveryFees` adds it up.
- `npm run build` passes, plus a browser check of the checkout, the receipt
  and the payment log print.
- Migration 038 runs on Railway before the push (the code reads the column).
