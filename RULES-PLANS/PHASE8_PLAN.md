# Phase 8 — Reporting & Analytics: implementation plan

This document is the agreed design for Phase 8, written before any Phase 8
code exists — the same discipline `PHASE5_PLAN.md`, `PHASE6_PLAN.md`,
`PHASE6.5_PLAN.md`, and `PHASE7_PLAN.md` were written under. Read it before
writing Phase 8 code.

It assumes the conventions already in this repo: Express 5 (async errors
auto-forwarded), `node:test` against a real database, one `*Explanation.js`
study twin per real file kept in sync, and `database/migrations/` for
changing a database that already holds data.

`PHASES-RULES-PLANNING.md` scopes **Phase 8 — REPORTING & ANALYTICS** as:
sales reports, transaction history, product performance, and
inventory-related analytics. This document implements exactly that list.

**This phase is different in kind from the last four, and that matters.**
Phases 5–7 were about *writing* correctly under concurrency: claim
patterns, row locks, lock ordering. Phase 8 writes almost nothing. Reaching
for `BEGIN`/`FOR UPDATE`/rowCount-as-signal here would be cargo-culting the
shape of the previous phases onto a problem that does not have it. The
danger in Phase 8 is entirely different: **a report that is confidently
wrong.** A 500 announces itself; a revenue figure that is quietly off by
one day's takings does not.

---

## What is already true before Phase 8 starts

Checked against the live database and the code, not assumed:

- **`report_logs` exists and has zero code touching it.** Columns:
  `report_id`, `generated_by BIGINT NOT NULL REFERENCES admins(admin_id)`,
  `report_type VARCHAR(100) NOT NULL`, `generated_at`. Note what the schema
  itself decides: `generated_by` points at **`admins`**, not `users` — so a
  cashier structurally *cannot* be recorded as having generated a report.
  That constraint drives Decision 4; do not fight it.
- **`inventory_movements` and `stock_alerts` are write-only in production
  code.** Phase 5 fills them, and the only `SELECT`s against them anywhere
  in the repo are inside test files. `PHASE6_PLAN.md` and `PHASE7_PLAN.md`
  both list "still write-only" as a carried-forward gap. **Phase 8 is where
  that gap closes** — this is the first phase that reads them.
- **`'Reporting & Analytics'` is already in the nav**
  (`src/pages/dashboard/modules.js`, roles `ADMIN` and `CASHIER`) and falls
  through to `DashboardHome`, the shared placeholder. So the menu entry
  exists and currently leads nowhere real.
- **`DashboardHome` displays fabricated numbers.** `₱86,420` monthly
  revenue, `24` orders to process, `12` pending actions, and three fake
  activity rows are hardcoded for every role. Nothing about them is real.
  See Step 6 — this is a credibility problem in a thesis demo, not just
  cosmetic debt.
- **DATE columns are already safe; TIMESTAMPTZ is the unsolved half.**
  `server/db.js` overrides pg's type parser for OID 1082 so a `DATE` comes
  back as a raw `'YYYY-MM-DD'` string (commit `1993c09`, after an
  expiration date silently round-tripped as the *previous day*). That fix
  does not help here: every column Phase 8 groups by — `orders.order_date`,
  `payments.payment_date`, `inventory_movements.created_at` — is
  `TIMESTAMPTZ`, and bucketing those into calendar days is a *different*
  timezone problem. Decision 1.
- **The database session timezone is `Asia/Kuala_Lumpur`.** Verified with
  `SHOW TimeZone`. That is UTC+8, the same offset as Manila, so
  `order_date::date` currently gives the right answer **by coincidence of
  this machine's configuration**. It is not a property of the code.
- **`lib/billing.js` is the single definition of what an order owes**, and
  it already encodes the rule that money is `SUM(amount) WHERE status =
  'PAID'` — never a stored column, never `PENDING`/`FAILED`/`REFUNDED`.
  Phase 8 must not restate that SUM.
- **`payment_date` is reliably set whenever a payment becomes `PAID`** —
  both the manual `INSERT` path and the webhook confirmation
  (`UPDATE payments SET status = 'PAID', payment_date = CURRENT_TIMESTAMP`)
  set it. So it is safe to date revenue by it.
- **`GET /api/payments` already returns a full payment list** — staff see
  every payment, a customer sees their own — with no date filter, no
  status/method filter, and no pagination. Decision 5 builds on this rather
  than beside it.
- **Money is NUMERIC and reaches JavaScript as a string.** Every existing
  money decision is made in Postgres and returned as a ready-made boolean
  or a formatted string, deliberately (`lib/billing.js` explains why at
  length: `'500.00' > '1000.00'` is true under string comparison).
- **Enums Phase 8 reports over:** `order_status` (`PLACED`, `CONFIRMED`,
  `IN_PRODUCTION`, `READY_FOR_PICKUP`, `OUT_FOR_DELIVERY`, `COMPLETED`,
  `CANCELLED`), `payment_status` (`PENDING`, `PAID`, `FAILED`, `CANCELLED`,
  `REFUNDED`), `stock_movement_reason` (`ORDER_PLACED`, `ORDER_CANCELLED`,
  `RESTOCK`, `SPOILAGE`, `CORRECTION`), payment methods `CASH`/`GCASH`
  (validated in code, not an enum).

---

## Scope

**In scope**

- Sales reporting over a date range, bucketed by day / week / month.
- A live dashboard summary (today's takings, outstanding money, what needs
  attention) — the ambient view, distinct from a generated report.
- Product performance: what actually sold, by quantity and by revenue.
- Inventory analytics: stock movement by reason, spoilage, and the
  currently-open low-stock alerts — finally reading what Phase 5 has been
  writing.
- Transaction history: date/method/status filtering and pagination, added
  to the payment list that already exists.
- `report_logs` written when an admin generates a report (Decision 4).
- A CSV export of the sales report (Step 6, last, droppable).
- The `Reporting & Analytics` screen, and replacing `DashboardHome`'s
  fabricated numbers with real ones.

**Explicitly out of scope for Phase 8**

- **Anything predictive.** Demand forecasting, restocking recommendations,
  and trend projection are **Phase 9**, and the roadmap says forecasting
  happens "only if later approved". Phase 8 reports what *happened*. The
  word "analytics" will tempt you toward a trend line with a projection on
  it; do not. A chart of the last 30 days is reporting. The same chart with
  a dotted line extending into next week is Phase 9.
- **Any charting beyond Chart.js itself.** No `react-chartjs-2` or other
  wrapper, and no charting on figures the paper doesn't ask for a chart on
  — see Decision 8.
- **PDF export.** Needs a dependency (`pdfkit`/`puppeteer`) for a format
  nobody has asked for. CSV needs none.
- **Materialized views, caching, or a reporting database.** At bakery
  scale these are complexity with no measured problem behind them. See
  Decision 9.
- **Per-cashier performance/commission reporting.** Real feature, real
  personnel-management implications, not on the roadmap's list.
- **Changing what `lib/billing.js` means.** Reporting consumes the existing
  definition of paid/owed; it does not get its own.

---

## Decisions

### Decision 1 — the reporting day is `Asia/Manila`, stated explicitly, never inherited

This is the most important decision in Phase 8 and the one most likely to
be silently wrong.

`date_trunc('day', order_date)` and `order_date::date` on a `TIMESTAMPTZ`
are **both evaluated in the session's `TimeZone` setting**. That setting
currently reads `Asia/Kuala_Lumpur` — UTC+8, the same offset as Manila — so
today, on this machine, day boundaries land correctly. That is luck, not
design. It comes from the local PostgreSQL install's `postgresql.conf`, and
it changes if the app is deployed anywhere else, if the DB is moved to a
managed host (most default to UTC), or if someone sets `PGTZ`.

Under a UTC session, a bakery order placed at 7:00am on 2 September (local)
is stored as 23:00 on 1 September UTC and lands in the **previous day's**
sales. Every morning's takings, every day, quietly attributed to yesterday.
No error, no crash — just a number that is wrong in a way that looks
plausible.

So Phase 8 never relies on the session:

- One exported constant, `reportingTimeZone = 'Asia/Manila'`, in
  `server/lib/reporting.js`.
- Every bucketing expression converts explicitly:
  `(o.order_date AT TIME ZONE 'Asia/Manila')::date`.
- Every range filter is built from local dates converted to instants:
  `'2026-09-02'::timestamp AT TIME ZONE 'Asia/Manila'`.

This is the same bug as commit `1993c09`, one level up: there, a `DATE`
became a `Date` object and shifted; here, a `TIMESTAMPTZ` gets bucketed in
whatever zone the session happens to be in. The lesson is identical —
**never let an implicit local-vs-UTC assumption decide a calendar date.**

Hardcoded rather than put in `config.js` because it is a property of the
business (one bakery, in Lucban, Quezon), not of the deployment
environment. If PECTRACK ever has a branch in another timezone, it moves to
`config.js` and reports gain a per-branch zone — but inventing that now is
configuration for a requirement that does not exist.

### Decision 2 — "sales" means money COLLECTED, and it is reported beside money ORDERED

Two different numbers are both defensible as "sales", they routinely
disagree, and conflating them is how a report becomes untrustworthy:

- **Ordered** — `SUM(orders.total_amount)` for non-cancelled orders. What
  customers asked for.
- **Collected** — `SUM(payments.amount) WHERE status = 'PAID'`. What
  actually arrived.

They diverge by design in this system. Phase 7's Decision 4 deliberately
allows an order to be `DELIVERED` while still unpaid (cash on delivery is
the normal case for a bakery), and Phase 6's Decision 8 refunds on
cancellation. An order can be placed in August and paid in September.

**Collected is the headline figure**, because "what did we actually take
in" is the question the owner is asking, and because it is the only one of
the two that cannot count money that never turns up. **Ordered and
outstanding are reported alongside it**, never instead of it, so the gap
between them is visible rather than hidden — that gap *is* the accounts
receivable, and it is genuinely useful information for a business that
delivers before it gets paid.

Consequently the two figures are dated by different columns, and this is
not an inconsistency to tidy away:

- ordered volume is bucketed by `orders.order_date`
- collected revenue is bucketed by `payments.payment_date`

Label them unambiguously in both the API and the UI. Never let a single
field called `sales` or `revenue` stand alone with no indication of which
one it is.

### Decision 3 — refunds net out of the period the money was originally taken, and the report says so

Phase 6's refund flips `payments.status` from `PAID` to `REFUNDED` on the
existing row rather than writing a negative one (`amount` has
`CHECK (amount >= 0)`). So `WHERE status = 'PAID'` excludes refunds for
free — which is correct, and has a consequence worth stating out loud
rather than discovering later:

**Historical reports are not immutable.** Run "August sales", get ₱10,000.
Refund an August payment in September. Re-run "August sales", now ₱9,500.
The August figure changed after August ended.

The accounting-correct alternative is to recognise the refund in the period
it was *issued* (`refunded_at`), leaving the original period untouched.
That is more correct and more complex, and it needs a running
period-close concept this system does not have.

**Phase 8's choice: reports are "as things stand now" snapshots.** Refunds
net out of the original period. This is stated in the plan, surfaced in the
API as a separate `refunded` figure per bucket (dated by `refunded_at`), so
anyone comparing two runs of the same report can see and explain the
difference rather than distrusting the whole thing. A number you can
explain is worth more than a number that is theoretically purer.

### Decision 4 — `report_logs` records deliberate report GENERATION, not page views

The table exists and is unused, and the naive reading ("log every reporting
request") turns it into a page-view log that grows every time a dashboard
auto-refreshes, telling nobody anything.

The schema draws the line for us: `generated_by` references
**`admins(admin_id)`**. A cashier has no `admin_id`, so a cashier's request
*cannot* be logged. That is the schema saying this is an admin audit trail.

The rule:

- **`GET /api/reports/sales` with an explicit `from`/`to` range** is a
  deliberately generated report. When the caller is an ADMIN, write one
  `report_logs` row (`report_type` = `'SALES'`, or `'SALES_CSV'` for the
  export).
- **`GET /api/reports/summary`** — the live dashboard, no date parameters —
  is ambient. It logs nothing.
- A CASHIER's report request is served normally and logs nothing. Not an
  error, not a silent failure — simply outside what the table can record.

The distinction is "did you ask for something specific" versus "did you
open a screen", and the parameters make it observable.

The write is a plain `INSERT` outside any transaction. It is an audit
record of a read; if it fails, the report itself is still correct, so it
must never take the response down with it.

### Decision 5 — transaction history EXTENDS `GET /api/payments`; it is not a second endpoint

"Transaction history" is on the Phase 8 list, and `GET /api/payments`
already returns exactly that list — correctly scoped (a customer sees only
their own orders' payments), with the joins that name who recorded and who
refunded each one.

A new `GET /api/reports/transactions` would have to restate
`paymentListSelectQuery` and its role scoping. That is precisely the
duplication `PHASES-RULES-PLANNING.md` forbids ("avoid duplicated business
logic across routes") and `lib/billing.js` exists to prevent — and it would
mean two payment lists that could drift on who is allowed to see what.

So: **add `from`, `to`, `method`, `status`, `limit`, and `offset` to the
existing `GET /api/payments`**, and have the reporting screen call it.

Two consequences to handle carefully, because this modifies a route that
already has passing tests:

- **Pagination changes an existing response.** Keep `payments` as the array
  key so existing callers and tests keep working, and *add* `total` and
  `hasMore` beside it. Default `limit` 50, maximum 200.
- **A default limit is a behaviour change.** Today the endpoint returns
  everything. Re-run `payments.test.js` and read the failures rather than
  adjusting the tests to fit — if an existing test breaks, that is the
  change being visible, and the question is whether the default is right.

The role scoping is *not* touched. A customer filtering their own history
is a feature; a customer seeing someone else's is the bug the existing
scoping already prevents.

### Decision 6 — product performance uses the SNAPSHOTTED price, and excludes cancelled orders

`order_details.unit_price` is a snapshot taken at order time, deliberately
(Phase 4), so a later price change never rewrites history. Product revenue
must therefore be `SUM(od.quantity * od.unit_price)` — **never** a join to
`products.price`, which is today's price and would silently restate every
past month's revenue the next time someone edits a price.

Cancelled orders are excluded from product performance and from sales.
Their stock was restored (Phase 5) and their payments refunded (Phase 6);
counting them as sales would contradict both.

Which statuses *do* count is worth stating explicitly rather than leaving
to a `!= 'CANCELLED'`: an order counts as ordered volume once it is placed
and not cancelled. Use `o.status <> 'CANCELLED'` and say why in a comment,
so a future reader knows the list was considered rather than defaulted.

### Decision 7 — inventory analytics read the ledger; they never recompute stock

`inventory.stock_quantity` is the current truth. `inventory_movements` is
the signed history of how it got there, and `SUM(quantity_change)`
reconciles to it by design (Phase 5, Decision 1).

Phase 8 **reports** the ledger — units sold, restocked, spoiled, corrected,
grouped by reason and period — and **never** recalculates
`stock_quantity` from it or "corrects" a discrepancy. A reporting phase
that writes to inventory is a reporting phase that can corrupt inventory.

`SPOILAGE` gets its own headline figure. For a bakery it is the number with
the most operational meaning in the whole inventory section, and it is
already being recorded and never looked at.

Open `stock_alerts` (`is_resolved = FALSE`) become the "needs attention"
list. This is the first time those rows are read by anything but a test.

### Decision 8 — Chart.js, because the approved thesis paper names it

**Corrected from the original draft of this plan**, which reasoned from
`PHASES-RULES-PLANNING.md`'s "do not add libraries without a clear reason"
alone and concluded CSS bars needed no dependency. That reasoning was
sound on its own terms but incomplete: it did not check `docs/PECTRACK.pdf`
first. The paper's "Technologies to be Used" section names **Chart.js
(Version 4.5)** explicitly, and states its purpose as generating "daily
sales, revenue summaries, inventory statistics, and product performance
charts" — Phase 8's scope, verbatim. That is the clear reason the rule
asks for; it was just sitting in a different document. For a thesis
system, matching a defended, diagrammed technology choice outweighs the
bundle-size argument that would otherwise favor hand-rolled CSS bars.

So: **`chart.js` is a real dependency of this phase**, added to
`package.json` as exactly that package — not `react-chartjs-2` or another
wrapper, since the paper names the library itself and this codebase's
existing pattern (`fetch` over an SDK, `express.raw()` over `multer`) is
to avoid a convenience wrapper around a dependency already justified on
its own. Wire it into React directly: a `<canvas>` ref, a `Chart` instance
created in a `useEffect`, and `chart.destroy()` in that effect's cleanup
(and before creating a replacement on data change) — Chart.js does not
know when React unmounts or re-renders its canvas, and skipping the
cleanup leaks one `Chart` instance per re-render, each still attached to
a canvas no longer on the page.

Used for the sales-over-time bucket chart (line or bar, matching
`groupBy`) and the product-performance ranking (bar). Kept to those two:
the paper justifies the library, not a chart on every number Phase 8
computes — a single KPI like "today's collected" is still a plain figure,
the same shape `DashboardHome`'s existing cards already use.

### Decision 9 — aggregate in SQL, and do not optimise anything yet

Every figure is computed by Postgres and arrives ready to display. No
route pulls rows into JavaScript and reduces them. This is the money rule
from `lib/billing.js` generalised: NUMERIC arithmetic belongs in the
database, and a JS `reduce` over money strings is exactly the habit that
file exists to prevent.

On performance: **add no indexes and no caching in Phase 8.** The existing
indexes (`orders_status_order_date_idx`, `order_details_order_id_idx`,
`payments_order_id_idx`, `inventory_movements_inventory_id_idx`) plus
sequential scans are entirely adequate for a single bakery's data, and
optimising before measuring would be inventing a problem. Pattern I keeps
the range filters index-friendly anyway, which is the part that would
matter first.

If a report ever does get slow, the honest first step is `EXPLAIN ANALYZE`
on the actual query with the actual data — not a materialized view added on
suspicion. Recorded as a known gap, not a to-do.

---

## Schema changes

**None.** As in Phase 7, this is worth stating loudly: `report_logs`,
`inventory_movements`, `stock_alerts`, `order_details`, `payments`, and
every enum Phase 8 reports over already exist and are correct.

No migration 007. If the implementation finds itself wanting a new column —
a cached daily total, a `period_closed` flag, a denormalized
`orders.amount_paid` — stop and re-read Decision 2 and Decision 9. Every one
of those is a stored duplicate of something already derivable, which is the
exact mistake `PHASE6_PLAN.md`'s Decision 1 rejected.

---

## The three code patterns that matter

### Pattern I — filter on a half-open timestamptz range; group by an explicit local date

Verified against the live database with the session `TimeZone` forced to
`UTC`, so the correctness does not depend on this machine:

```sql
-- WRONG, twice over: the ::date depends on the session TimeZone, and
-- wrapping the column in an expression makes the range unindexable.
WHERE (o.order_date AT TIME ZONE 'Asia/Manila')::date BETWEEN $1 AND $2

-- WRONG differently: BETWEEN on a timestamp silently drops the last day.
-- '2026-09-02' as a timestamp is 00:00:00, so a 2pm sale on the 2nd is
-- excluded and the report is a day short at the end of every range.
WHERE o.order_date BETWEEN $1 AND $2

-- RIGHT: a half-open [from, to+1day) range in real instants — index
-- friendly, no end-of-range hole — with the local calendar date used
-- only for GROUPING.
WHERE o.order_date >= ($1::date)::timestamp AT TIME ZONE 'Asia/Manila'
  AND o.order_date <  (($2::date + 1)::timestamp AT TIME ZONE 'Asia/Manila')
GROUP BY (o.order_date AT TIME ZONE 'Asia/Manila')::date
```

Mind the two directions of `AT TIME ZONE`, because they are not symmetric
and mixing them up produces an answer that is wrong by exactly one offset:

- `timestamptz AT TIME ZONE 'X'` → `timestamp`: "what did the wall clock in
  X read at that instant" — used for **bucketing**.
- `timestamp AT TIME ZONE 'X'` → `timestamptz`: "interpret this wall clock
  as being in X" — used for **building range bounds**.

Measured behaviour with `SET TimeZone = 'UTC'`, range `2026-09-02` to
`2026-09-02`:

| instant | local day | in range |
| --- | --- | --- |
| 2026-09-01 23:30 Manila | 2026-09-01 | no |
| 2026-09-02 00:30 Manila | 2026-09-02 | yes |
| 2026-09-02 23:30 Manila | 2026-09-02 | yes |
| 2026-09-03 00:10 Manila | 2026-09-03 | no |

### Pattern J — an empty period returns zeros, never null and never a crash

Reports are run over quiet weeks. Every aggregate needs both guards:

```sql
-- COALESCE: SUM over zero rows is NULL, not 0.
-- NULLIF:   COUNT is 0 on an empty period, and x / 0 is a division-by-zero
--           ERROR in Postgres — a 500 on the emptiest, most harmless input.
SELECT COALESCE(SUM(p.amount), 0)::numeric(12,2)                        AS collected,
       COALESCE(SUM(p.amount) / NULLIF(COUNT(*), 0), 0)::numeric(12,2)  AS average_sale
```

Verified: over zero rows this returns `collected: '0.00'`,
`average_sale: '0.00'` — not `null`, not an error, and with the same two
decimal places every other money figure in this app uses. The
`::numeric(12,2)` is not cosmetic; it is the same fix `lib/billing.js`
documents, where a bare `0` fallback serialises as `'0'` while every real
figure serialises as `'0.00'`.

### Pattern K — CSV cells are escaped, including against formula injection

Only relevant to Step 6. Two separate problems, and the second is the one
people miss:

```js
// 1. CSV quoting: wrap in quotes, double any internal quote. Without it a
//    product named 'Pandesal, large' becomes two columns.
// 2. FORMULA INJECTION: a cell beginning = + - or @ is executed as a
//    formula when the file is opened in Excel or Sheets. A product named
//    '=HYPERLINK("http://evil","click")' is a stored payload that fires on
//    the owner's machine, not the server's — so no amount of server-side
//    hardening covers it. Prefix with a single quote to neutralise.
const csvCell = (value) => {
  const text = value == null ? '' : String(value)
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text
  return `"${safe.replaceAll('"', '""')}"`
}
```

Product names are admin-entered, not public input, so this is defence in
depth rather than a live hole — but it costs three lines and the file is
opened on someone's actual computer.

---

## Data flow

**The live dashboard (ambient, logs nothing):**

```
Admin or cashier opens Reporting & Analytics (or the Dashboard home)
  -> GET /api/reports/summary
     -> today's collected     (payments PAID, payment_date in today Manila)
     -> today's orders placed (orders not CANCELLED, order_date in today)
     -> total outstanding     (lib/billing.js's definition, all open orders)
     -> open low-stock alerts (stock_alerts WHERE NOT is_resolved)
     -> deliveries needing attention (PENDING_ASSIGNMENT + ASSIGNED)
  -> no report_logs row: nobody asked for anything specific
```

**A generated sales report (deliberate, logged for an admin):**

```
Staff pick a date range and a grouping, press Generate
  -> GET /api/reports/sales?from=2026-08-01&to=2026-08-31&groupBy=day
     -> 422 unless from/to are real YYYY-MM-DD dates and from <= to
     -> 422 if the range exceeds the cap (Step 2 — an unbounded range is
        the one way these queries can genuinely hurt)
     -> buckets: [{ period, ordersPlaced, ordered, collected, refunded }]
     -> totals:  { ordered, collected, refunded, averageSale }
     -> if the caller is an ADMIN: INSERT report_logs (SALES)
```

**Product performance and inventory:**

```
  -> GET /api/reports/products?from=&to=&limit=10
     -> per product: quantitySold, revenue  (od.quantity * od.unit_price)
     -> orders with status CANCELLED excluded entirely
     -> ranked by revenue; limit capped

  -> GET /api/reports/inventory?from=&to=
     -> movement totals by reason: sold / restocked / spoiled / corrected
     -> spoilage called out on its own (Decision 7)
     -> currently open stock_alerts, with product name and current stock
     -> reads only; never writes inventory or resolves an alert
```

**Transaction history (the existing endpoint, now filterable):**

```
  -> GET /api/payments?from=&to=&method=CASH&status=PAID&limit=50&offset=0
     -> same role scoping as today: a customer sees only their own
     -> { payments: [...], total, hasMore }
```

## Files affected

**New**

- `server/lib/reporting.js` + twin — the shared pieces, and deliberately
  small: `reportingTimeZone`, the range-bound SQL fragments from Pattern I,
  and `parseDateRange(query)` returning `{ from, to, errors }`. Every route
  below validates its dates the same way or they will disagree at the
  boundaries.
- `server/routes/reports.js` + twin + `reports.test.js`
- `src/pages/dashboard/ReportingAnalytics.jsx`

**Modified**

- `server/app.js` — mount `/api/reports`.
- `server/routes/payments.js` + twin + `payments.test.js` — Decision 5's
  filters and pagination.
- `src/pages/dashboard/Dashboard.jsx` — wire the new screen.
- `src/pages/dashboard/DashboardHome.jsx` — Step 6, real numbers.
- `package.json` — the new test file, and `chart.js` as a real dependency
  (Decision 8 — named in `docs/PECTRACK.pdf`'s tech stack).

**Deliberately untouched**

- `lib/billing.js`. Reporting consumes its definition of paid/owed; if a
  report needs money defined differently, that is a conversation, not a
  second definition.
- Every write path in `orders.js`, `inventory.js`, `deliveries.js`. Phase 8
  reads. The only new write in the entire phase is one `report_logs` row.

---

## Build order

Each step is independently testable, and the one that decides whether every
later number is correct comes first.

**Step 1 — `lib/reporting.js`: the timezone and the date range.** The
constant, the two range-bound fragments, and `parseDateRange`. Unit-test
the boundary behaviour directly (Pattern I's table) *before* any route
exists — every figure in this phase inherits its correctness from here.

**Step 2 — `GET /api/reports/sales`.** The core report: buckets, totals,
`groupBy` of `day`/`week`/`month`, validation, and the range cap. Not the
`report_logs` write yet.

**Step 3 — `GET /api/reports/summary`.** The live dashboard figures. Small
once Step 1 exists.

**Step 4 — products and inventory.** `GET /api/reports/products` and
`GET /api/reports/inventory`. Independent of each other; both build on
Step 1.

**Step 5 — `report_logs` (Decision 4), and Decision 5's payment filters.**
Grouped because both are small changes touching existing behaviour, and
both need the *existing* suites re-run rather than just the new ones.

**Step 6 — the screen, then `DashboardHome`.** `ReportingAnalytics.jsx`
with Chart.js for the sales and product-performance charts (Decision 8),
then replace the fabricated `₱86,420` and its neighbours with real figures
from `/api/reports/summary` for ADMIN and CASHIER — those stay plain
figures, not charts. CSV export lands here too, last of all — if the phase
has to be cut short, this is the piece that goes, and nothing else depends
on it.

---

## Testing checklist

Add to the existing suite (237 passing at the end of the Phase 7 review).

**The day boundary — the tests this phase exists for**
- An order at 00:30 local and one at 23:30 local on the same local date
  both fall in that date's bucket; one at 23:30 local the *previous* day
  does not. Insert explicit `timestamptz` values rather than relying on
  `now()`, so the assertion is about the boundary and not about when the
  test happened to run.
- **Run at least one of these with the session forced to a different
  timezone** (`SET TimeZone = 'UTC'` on the connection). This is the test
  that proves Decision 1 is real rather than inherited from this machine's
  `Asia/Kuala_Lumpur` setting — without it, the whole suite passes just as
  happily with the timezone bug present.
- A sale at 2pm on the `to` date is INCLUDED (the half-open range; the
  `BETWEEN` bug drops it).

**Sales**
- Cancelled orders appear in neither ordered volume nor collected revenue.
- A `PENDING` and a `FAILED` payment are not counted as collected; only
  `PAID` is.
- A refunded payment is excluded from collected and appears in `refunded`.
- An order placed in one month and paid the next contributes its volume to
  the first bucket and its revenue to the second (Decision 2 — this will
  look like a bug to anyone who has not read the plan, so the test gets a
  comment pointing here).
- An empty range returns zeros formatted `'0.00'`, not `null`, not a 500 —
  and the average does not divide by zero.
- `from` after `to`, a malformed date, and an over-long range are each a
  clean 422.

**Products**
- Ranking and revenue use the snapshotted `unit_price`: place an order,
  then change the product's price, and assert the report is unchanged.
  This is the test that catches a join to `products.price`.
- A cancelled order's items are excluded.

**Inventory**
- Movement totals group by reason and reconcile: for a product, the sum of
  reported movements equals `SUM(quantity_change)` in the ledger.
- Spoilage is reported separately and is not counted as a sale.
- An open `stock_alerts` row appears in "needs attention"; a resolved one
  does not.
- The reporting routes write nothing: snapshot `inventory.stock_quantity`
  and the `stock_alerts` rows before and after calling every report, and
  assert they are byte-identical.

**Access and logging**
- A CUSTOMER and a DELIVERY PERSONNEL are refused from every
  `/api/reports` route (403).
- An admin's `GET /api/reports/sales` writes exactly one `report_logs` row
  with the right `report_type`; a cashier's identical request writes none
  and still returns 200.
- `GET /api/reports/summary` writes no `report_logs` row for anyone.

**Payments (existing endpoint — Decision 5)**
- Filtering by date, method, and status each narrows correctly, and they
  compose.
- A customer's filtered history still contains only their own payments —
  the filters must not become a way around the role scoping.
- Pagination returns a correct `total` and `hasMore`, and `limit` above the
  maximum is capped rather than honoured.
- **The whole existing `payments.test.js` still passes**, since the default
  limit changes the response of a route that already had tests.

### On writing these tests

Two concurrency tests in Phase 5 and one in Phase 6.5 passed against broken
code on the first attempt. The Phase 7 review then found five defects
living in the gaps *between* individually-passing tests, and during that
review two freshly-written tests passed against deliberately broken code —
one because the delivery had already hit an unrelated cap, so the right
status code arrived for entirely the wrong reason.

So, restated because it keeps being needed: **temporarily break each fix
and watch the test go red before trusting it.** A test that has never been
observed to fail is not yet a test. And when a test *does* go red, read the
failure — confirm it failed for the reason you intended, not a neighbouring
one.

Phase 8 has its own version of this trap, and it is worse than usual: a
reporting test that asserts `collected === '0.00'` passes when the query is
correct AND when the query is broken enough to return nothing at all.
**Assert on non-trivial numbers with known inputs**, not on zeros and not
on "it returned an array".

---

## Known gaps deliberately left open

- **No forecasting, no recommendations.** Phase 9, and only if approved.
  Phase 8 deliberately stops at what happened.
- **No PDF export.** CSV only. PDF needs a dependency for a format nobody
  has asked for.
- **Historical reports are mutable.** Decision 3 — a refund changes a past
  period's figures. Surfaced rather than hidden; a period-close concept is
  the real fix and is a bigger idea than this phase.
- **No caching, no materialized views, no new indexes.** Decision 9. If a
  report gets slow, `EXPLAIN ANALYZE` first.
- **No per-cashier or per-driver performance reporting.** The data exists
  (`processed_by`, `delivery_personnel_id`) and the feature is real, but
  measuring individual staff has implications worth deciding deliberately
  rather than shipping because the join was easy.
- ~~`report_logs` is now write-only — the same gap Phase 8 just closed.~~
  **Closed**, in CHECKOUT_PLAN.md's follow-on work: `GET /api/reports/logs`
  (admin-only — `report_logs.generated_by` can never be a cashier's, so
  the route carries its own `requireRole('ADMIN')` on top of the
  router-wide guard) and a paginated "Report History" tab on the
  Reporting screen, ADMIN-only there too. Reads the ledger, writes
  nothing, the same discipline `GET /inventory` already follows for
  `inventory_movements`. While fixing it, found and fixed the SAME class
  of bug one level up: two of this file's own tests each created a test
  category and never deleted it — the exact "Report Inventory/CSV
  Category `<hex>`" mess a user later found cluttering Product
  Management, regrowing by two rows on every subsequent `npm test` run
  until the leak itself was closed.
- **The CSV export carries its grouping but not its full provenance.** The
  review made the first column self-describing (`Period (week)`) and the
  date range travels in the filename, but the file records nothing about
  *who* generated it or *when* — so a spreadsheet emailed on to someone
  else has no way to be traced back to the `report_logs` row it created. A
  title block would fix it and would also push the header off row 1 and
  break a plain spreadsheet import, which is why it was not done. Worth
  revisiting only if exports start being circulated.
- ~~`DashboardHome`'s non-reporting roles keep placeholder numbers.~~
  **Closed**, in CHECKOUT_PLAN.md's follow-on work: a customer's
  fabricated "3 active orders" was retired when `modules.js` stopped
  giving CUSTOMER a `Dashboard` module at all, and a driver's fabricated
  "8 deliveries today" was retired the same way — `DELIVERY PERSONNEL`
  no longer has a `Dashboard` module either, and lands on Delivery
  Management (their real work queue) instead. `DashboardHome` is now
  reached only by ADMIN and CASHIER, the two roles Step 6 already made
  real, so there is no fabricated number left anywhere in it.
- **Carried forward, still open:** PayMongo credentials are still not wired
  in, so the gateway path is unexercised against the real API (Phase 6.5);
  a `COMPLETED` order still cannot be refunded (a deliberate business rule
  confirmed in the Phase 6 review); proof-of-delivery files are on local
  disk and have no customer-facing viewer (Phase 7); there is still no
  customer-facing storefront for placing orders, so `POST /api/orders` is
  exercised by tests and staff screens only.
