# PHASE10_PAPER_ALIGNMENT_PLAN.md — closing the gaps between the paper and the system

Status: **in progress.** Decisions (2026-09-26): **D1** staff 30 minutes
idle, customers 7 days; **D2** peak periods include the demo orders,
labelled assumed; **D3** build bulk-order approval, threshold an admin
setting defaulting to 100 items; **D4** deferred — the team is settling
the title with the adviser, and no code depends on it.

Source: `PAPER_OBJECTIVES_REVIEW.md`. The four specific objectives are met;
this phase closes the **feature promises** the paper makes that the system
does not keep, choosing per gap whether to **build** it or **reword** the
paper. Items are in build order — the ones a panel would reach first come
first.

---

## Part 1 — Build

### B1. Restocking recommendations — "what to bake, and how many"

**Closes:** the title's *Automated Inventory*, and p.14's *"automatically
suggests products and stock quantities that should be replenished based
on customer demand."*

**What it does.** For every product, compare the latest forecast with the
stock on hand and say:

- **Sells out on** — the first day the forecast's running total passes
  current stock ("likely to run out Saturday"), or "covered".
- **Recommended to bake** — enough to cover the next **two days**, plus a
  safety margin, minus what is on hand; never below zero.
  `ceil(predicted today + predicted tomorrow + margin) − stock`
  where the margin is the gap between the forecast and the top of its
  range for today. Two days, not seven: bread is baked daily and a week's
  worth would go stale.
- **In batches** — for products linked to a recipe, that quantity
  converted to recipe batches (`items × units_per_item ÷ yield`), which is
  what the baker actually decides. Empty for unlinked products.

**Stock on hand is already net of placed orders** — stock is deducted
when an order is placed — so advance orders are not double-counted.

**Honesty rule, same as the forecast:** when the forecast was trained on
assumed history, every recommendation carries the *assumed* badge.
Recommendations built from assumed demand against **real** stock are a
demonstration of the mechanism, and the screen says so.

**Where:** a "Restock recommendations" section on the Forecast tab, sorted
by urgency (sells out soonest first), and a **"Likely to sell out"** tile
on the Dashboard linking to it.

**Tests:** the arithmetic on a product with known forecast and stock;
"covered" when stock exceeds demand; batches only for linked products;
never negative.

### B2. Peak ordering periods

**Closes:** p.16's *"AI-Assisted Analytics … peak ordering periods."*

**What it does.** Over the chosen date range: orders by **hour of day**
and by **day of week** (Manila time), as two bar charts, with the busiest
slot named in words ("Busiest: Saturday, 7–8 AM"). A heat grid of
day × hour is the natural chart; two bars are clearer on a phone and
answer the same question.

**Where:** a card on the Reporting → Sales tab, driven by the existing
date range, and in the analytics CSV.

**Data source:** see Decision D2 — real orders only are two days today.

### B3. Save reports as PDF

**Closes:** PDF export promised on p.16, p.41, p.43.

**How.** A **"Print / Save as PDF"** button on each report tab, plus a
print stylesheet: navigation, controls and buttons hidden; a report
header with the bakery name, the report title, the date range and who
printed it; charts and tables laid out for A4. The browser's own
*Save as PDF* produces the file — no PDF library, nothing to install,
and the charts come out exactly as on screen.

**Where:** Sales, Products, Inventory, Production, Forecast; the driver's
report (B4).

### B4. Driver delivery history and report

**Closes:** p.15 *"review their delivery history and completed
transactions"* and the Delivery Reports screen, p.43.

`GET /api/deliveries/mine` returns only open deliveries, so a finished
one vanishes. Add:

- `GET /api/deliveries/mine/history?from&to` — the driver's own DELIVERED
  and FAILED deliveries, paged, scoped to their `delivery_personnel_id`
  exactly as the current route is.
- Counts over the range: delivered, failed, currently assigned, cash
  collected.
- A **History** tab in My Deliveries with the counts, the list, and
  B3's Save as PDF.

**Tests:** a driver sees only their own history; another driver's is
invisible; counts match.

### B5. Production schedule — orders due by time

**Closes:** the one interview problem still open — *"if the order is for
6:00 but the bread is finished at 7:00, it causes delays"* (p.9) — and
p.30's *"organize production scheduling based on incoming orders."*

**What it does.** A **Due today** tab in Production: every open order due
today, grouped by hour of its requested time (orders with no requested
time grouped as "As soon as possible"), each slot showing the items
summed per product, the orders in it, and their status. A slot whose
time has passed with an order not yet ready is flagged **overdue**; one
due within the hour is flagged **due soon**. Tomorrow is one click away.

It answers exactly the baker's question: what has to be ready, by when.

### B6. Inactivity timeout

**Closes:** p.92 *"expires after a defined period of inactivity … idle
accounts are automatically logged out."*

- `sessions.last_seen_at` (migration 019). `requireAuth` refuses a session
  idle longer than the role's limit, deletes it, and records a
  `SESSION_EXPIRED` security event.
- `last_seen_at` is written at most once a minute per session, so an
  active user does not cost a database write per request.
- The client treats a 401 in the middle of a session as "signed out":
  clears the user and opens the sign-in pop-up on the right door, instead
  of every panel showing "Sign in to continue."
- Durations: Decision D1.

### B7. Two small rules the paper states

- **Cancel with a logged reason** (p.30): cancelling requires a reason of
  at least a few characters, stored in the status history. A customer
  cancelling their own order picks from a short list.
- **Delivery within Lucban** (Limitations, p.44): a DELIVERY order is
  refused unless the address's municipality is Lucban, with a message
  saying so; the address form says it too. Pickup is unaffected.

---

## Part 2 — Reword the paper (suggested replacement text)

| Paper says | Replace with |
|---|---|
| Payments via GCash, **PayMaya, and debit card** (p.93) | "Online payments are processed through PayMongo using GCash; cash is recorded at the counter or on delivery." |
| **Product Availability Calendar** (p.14, p.25) | "The menu shows only products that are currently available and not past their expiry date; expired stock is hidden automatically." |
| Cashier can **edit** customer information (p.13) | "The cashier can search and view customer records to attach a customer to an order; editing customer records is reserved to the administrator." |
| Admin can **create** customer records (p.13) | "Customers create their own accounts; the administrator can view, update and deactivate them. Walk-in customers need no account." |
| Cashier proposes **pricing, descriptions, availability** (p.14) | "The cashier can propose stock corrections and report losses; the administrator approves them before stock changes. Product details are managed by the administrator." |
| **Delivery fee** in checkout (p.40) | Remove, or state that delivery is free within Lucban. |
| Cashier sees **only their own sales that day** (p.41) | "Administrators and cashiers can view the sales, product, inventory and production reports; report history is administrator-only." |
| **SMS** order updates, promo notifications; profile birthday, membership date, preferred payment (p.28–30) | Remove from the figure descriptions, or mark the figures as early design mockups. |
| Security section (p.92–94) | See `SECURITY_REVIEW.md` Part 0: four roles, bcrypt (not "ecrypt"; a hash, not encryption), HTTPS wording, PCI-DSS wording. |

---

## Part 3 — What this phase does NOT do

- No AI or machine-learning model. The recommendations are arithmetic on
  a statistical forecast; the paper's wording is Decision D4.
- No SMS, push or email notification on order status.
- No PDF library or server-side PDF generation — the browser makes the PDF.
- No change to how stock is reserved at order time.

---

## Part 4 — Decisions needed before building

**D1. Inactivity timeout — how long?**
Recommendation: **staff (admin, cashier, delivery) 30 minutes idle**;
**customers 7 days**, unchanged. A cashier at a shared counter is the
case the paper is protecting; a customer being logged out of a shopping
site after half an hour is a nuisance no real storefront imposes.

**D2. Peak ordering periods — which orders?**
Real orders cover two days, so a chart of them alone is empty. Options:
(a) include the demo orders, labelled with the *assumed* badge when any
are in range (recommended — same honesty rule as the forecast); (b) real
orders only, empty until the bakery has history.

**D3. Bulk orders requiring administrator approval (p.15) — build or reword?**
Building means a new order state before CONFIRMED, a threshold (for
example, more than 100 items, the number Mrs. Abillar mentions on p.9),
and an approval queue — real work touching the order lifecycle.
Recommendation: **build it**, because the interview names large orders as
the painful case; the threshold becomes a setting the admin can change.

**D4. "AI" in the title.**
(a) Keep "AI-Assisted Analytics" and define it in the methodology as
predictive analytics by statistical demand forecasting; or
(b) retitle: *"PECTRACK: A Web-Based Order Management System with
Predictive Analytics and Automated Inventory for Pecto's Bakery."*
Recommendation: **(b)** — nothing in the system is AI, and a title a
panelist can dispute in one question is the weakest point of a defense.
This is a paper decision; no code depends on it.
