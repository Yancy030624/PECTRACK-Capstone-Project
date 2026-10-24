# Reporting and predictive analytics (2026-10-25)

These decisions came from a grilling session on the Reporting & Analytics
module and the forecast, and the user confirmed every answer on 2026-10-25.
Build A1–A7 in order, one commit each. Paper notes go in
PAPER_FIX_REVISIONS.md under "Reporting and predictive analytics".

## What the code did before this plan
- The Production list (`lib/dailyStock.js productionFor`) works out what to
  bake from fixed rules: soft = standard (+ advanced orders), hard =
  min/stop levels, ×2 weekends from Thursday, ×4 events. The forecast was
  only a column on that list.
- A forecast ran only when an admin pressed "Run forecast".
- The training data (`analytics_daily_sales` → `forecast_training_data`)
  counted every order that was not cancelled, unpaid checkout holds
  included, and dated each one by order_date.
- Practice orders (`orders.data_source = 'ASSUMED'`: 57 rows locally, with
  ₱19,704 paid) were counted in Sales, Products, the Dashboard's today
  figures and the Payment log.
- `lib/restock.js` still ran on every Dashboard load and forecast view, but
  no screen showed its result.

## A1. Practice orders never count as money
Add `o.data_source = 'RECORDED'` to:
- `routes/reports.js`: sales (ordered buckets and totals), products,
  and the summary's today orders and outstanding;
- the summary's and the sales report's collected figures, which go
  through `payments JOIN orders`;
- `routes/payments.js GET /`, the Payment log.

Nothing is deleted: the forecast and the delivery-history demo still use
the rows. Peak periods already has its own `includeAssumed` switch.

## A2. Clean training data: migration 039_sales_view_real_sales.sql
Replace `analytics_daily_sales` with a version that has the same columns:
- An order counts once it is a real sale: a PAID payment exists, or it is
  COMPLETED. Unpaid checkout holds and uncollected cash pickups are left out.
- Its day is `COALESCE(requested_fulfillment_time, order_date)` in Manila,
  so an advanced order counts on its pickup day. This is the same "order's
  day" that `lib/staleOrders.js` uses.

## A3. Forecast check on the Production list
In `productionFor(day)`, each product's `forecast` (the latest run's
predicted figure for that day) is compared with what is planned:
- SOFT: planned = standard (event-boosted) + that day's advanced orders.
- HARD: planned = on hand + toBake.

When the forecast rounds above the planned figure, the product gets
`forecastShort = forecast − planned`. Shortfalls only; the middle figure
is used, not the upper range. A product whose level is not set (soft: no
standard; hard: no stop level) is not checked. Found in the browser check:
26 of the 27 local soft breads have no standard yet, and every one of them
flagged. `productionPlan` returns a `forecastShortCount`.
`ProductionPanel.jsx` shows a "Forecast" column with "+N" in amber, and
a line at the top: "Forecast says bake more: N products". It appears on
the Production list only; the Dashboard is unchanged.

## A4. Nightly forecast with an automatic switch to real sales
- Move the run out of `routes/forecasts.js` into `lib/forecastRun.js`
  as `runForecast({ source, runBy })`. The route calls it.
- `lib/forecastRun.js` adds `nightlySource()`: REAL once the bakery has
  `MIN_BACKTEST_HISTORY` (56) distinct days of real sales, else ASSUMED.
- `runNightlyForecast(now)`: from 00:05 Manila, once per Manila day.
  Each run claims its day in the new table `forecast_nightly_runs (day
  PRIMARY KEY)` (migration 039), so a restart or a second server never
  runs twice. `server/index.js` calls it every minute, the same way as
  the 5 AM top-up. `run_by` is NULL, shown as "System".
- The admin's button stays and still lets them choose the data.
- The Forecast tab already says which data the run used. It now also
  shows "Ran automatically" for a system run.

## A5. Delete the old restock code
- Delete `lib/restock.js` and `lib/restock.test.js`.
- Remove the `restock` field from `GET /api/forecasts/latest` and
  `likelySellOut` from `GET /api/reports/summary`, and remove the test
  file from `npm test`.

## A6. Practice data on Railway
- `scripts/generate-assumed-demand.mjs --railway` writes to
  `RAILWAY_DATABASE_URL` and never prints the URL. The user runs it in
  the VS Code terminal.

## A7. Paper
- PAPER_FIX_REVISIONS.md gets a "Reporting and predictive analytics"
  section covering A1–A5.
- The limitations get this wording: "The forecasting method is validated
  on assumed history. Its accuracy on Pecto's real sales will be measured
  once 56 days of real sales exist; the system then switches to them by
  itself."
- Christmas and New Year stay as fixed holiday variables, alongside the
  events calendar.
- Report History stays as it is.

## Deploy order
1. Run migration 039 on Railway (the view, plus the nightly-run table).
2. Run the generator on Railway with `--railway`.
3. Push and confirm the bundle changed.
4. Run one forecast on the live site and check it.
