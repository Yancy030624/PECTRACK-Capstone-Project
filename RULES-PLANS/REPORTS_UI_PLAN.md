# Reporting & Analytics screens (2026-10-25)

Decisions from a grilling session on the module's UI. The user confirmed
every answer on 2026-10-25. Build U1–U7 in order, one commit each.

## U1. Each tab has only its own controls
- **Group by** shows on Sales only. **Top products** shows on Products only.
- The "Export analytics CSV" button is removed. The `/api/reports/analytics`
  route stays, for tests and a notebook.
- The page intro no longer mentions the removed transaction history.
- **Peak periods** leaves practice (ASSUMED) orders out by default, on the
  server (`includeAssumed` defaults to false) and in the checkbox. The box
  stays, so practice orders can be shown during the defense.

## U2. Export history (migration 040)
Report History used to log every time the Sales tab opened, which gave
192 identical "SALES" rows. It now records only reports that leave the
system.
- `report_logs.user_id` (users) is added and `generated_by` (admins) becomes
  nullable, so a cashier's export is recorded too. Old rows get `user_id`
  from their admin. The page-open rows (`report_type = 'SALES'`) are deleted.
- Types: SALES_CSV, SALES_PDF, PRODUCTS_PDF, INVENTORY_PDF, FORECAST_PDF,
  FORECAST_CSV, PAYMENT_LOG_PDF, PRODUCTION_PDF.
- The server logs its own CSVs: the sales CSV in `GET /sales?format=csv`
  and the forecast CSV in `GET /forecasts/latest?format=csv`, for any role.
- Prints are made in the browser, so the screen tells the server with
  `POST /api/reports/exports { type }` (admin or cashier). This covers the
  Print button on each tab, the Payment log PDF and the Production list print.
- `GET /logs` stays admin only and returns readable names. The tab is
  called "Export history".

## U3. Sales tab: the money the bakery received
`GET /api/reports/sales` now returns:
- totals: `sales` (money received in the range, delivery fees excluded),
  `orders` (orders that received money in the range), `averageOrder`
  (sales ÷ orders), `deliveryFees` (fees received in the range), and
  `unpaidCash` { orders, amount } (cash pickups placed in the range and
  still not paid);
- buckets per period: sales, orders, deliveryFees;
- breakdown: `byMethod` (CASH / GCASH) and `byType` (WALK_IN = placed at
  the counter, PICKUP = online pickup, DELIVERY), each with orders and sales.

Each payment's fee share is `delivery_fee × amount ÷ total_amount`. That
is exact because, with payment first, an order is paid in full in one
payment. Removed: ordered, collected, refunded (there are no refunds, per
the client on 2026-10-15), and averagePayment. The CSV has Period, Orders,
Sales and Delivery fees.

Screen:
- cards for Sales, Orders, Average order and Delivery fees;
- a line for "Cash orders not yet paid";
- the chart: a Sales line plus Orders bars, in distinct colours;
- the period table;
- a breakdown table by payment method and by order type;
- Peak periods.

## U4. Products tab
- `GET /products?type=SOFT|HARD&sort=quantity|revenue`. The default sort is
  quantity, and each row carries `stockType`.
- An All / Soft / Hard filter. The chart ranks by pieces sold. The table
  has a Type column, and its Pieces and Revenue headers sort.

## U5. Inventory tab
The live lists come off the report: "Needs attention" and the ingredients
"Low now". The Inventory screen and the Dashboard keep them. The report
keeps Units lost, Movement totals and Ingredient activity. The API drops
`attention` and `ingredients.low`.

### U5, revised (the user, 2026-10-25)
The user asked to drop the Inventory tab because the bakery rarely cancels
orders and has no spoilage. Chapter 1 (p. 288) promises reports on
"inventory movements", so the tab stays, cut down to three figures, real
movements only (`inventory_movements.data_source = 'RECORDED'`):
- **Baked / added**: restocks, the 5:00 AM top-up, and counts corrected up.
- **Sold**: order deductions minus cancelled orders' returns.
- **Lost**: rejects and counts corrected down.

There is also a per-product table with those three columns. The
movements-by-reason table and the ingredient activity are removed, because
ingredients keep their own history on the Ingredients screen.
added − sold − lost equals the ledger's net change.

## U6. Forecast tab
- The accuracy card on practice data reads "Method test (practice data):
  about X%", with the note "how well the method fits the sample pattern,
  not Pecto's real sales". On real sales it reads "How accurate".
- The day-by-day table shows the 10 busiest products, with a "Show all N"
  button, and has the same All / Soft / Hard filter (`stockType` on each
  forecast product).
- The Train on selector gets the hint "Runs automatically every night; use
  this to run one now."

## U7. Paper
A PAPER_FIX_REVISIONS.md section and the list of report figures to retake.

## Deploy
The user runs migration 040 on Railway; then push.
