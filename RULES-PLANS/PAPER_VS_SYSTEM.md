# PAPER_VS_SYSTEM.md — what the paper says vs. what PECTRACK does now

Checked on 2026-10-08 against `docs/Pectrack.pdf` (195 pages) and the
code at commit `9227e75`. It replaces `PAPER_OBJECTIVES_REVIEW.md`
(2026-09-26), which predates Phase 10, the ingredients removal and the
redesign.

How to use it: work through Parts A–G in order and edit the paper section
by section. Page numbers are the PDF's page numbers. Part H lists
redundancy and errors found in the **system** (not the paper), with fixes.

| Part | What it covers |
|---|---|
| A | Factual errors in the paper — fix these no matter what |
| B | Section-by-section changes (Purpose & Description, Scope, mockups) |
| C | Features built but not in the paper — add them |
| D | Promised in the paper but not built — reword or remove |
| E | Removed on purpose — move to Limitations |
| F | Database chapter (pp. 96–107) |
| G | Methodology, technologies, testing |
| H | Redundancy and errors in the system itself |

---

## Re-check of the revised paper (second upload, 2026-10-08)

A teammate revised `docs/PECTRACK.pdf`. It was compared page by page with
the first upload. Nothing in the revision contradicts this plan; most
edits apply items from it. The revised paper's pages 21–94 are **one page
later** than the page numbers used in Parts A–G (the Background grew by a
page). Pages 1–20 and 95 onward are unchanged.

**Already fixed by the revision**

| Item | Where (new page) | Change |
|---|---|---|
| A2 | 93 | "ecrypt" → **bcrypt** |
| A6, A10 | 70, 86, 94 | Maya and cards removed; **GCash only** |
| A12 (part) | 69 | PostgreSQL **18** (the system runs 18.6) |
| A1 (part) | 81 | "PHP-based" → "Web-based" |
| B5 (part) | 14 | Cashier proposes **stock quantities** only, not prices or descriptions |
| D2 (part) | 14, 26 | Says expired products are hidden from customers |
| A5 (part) | 19 | The broken "both" removed |

**New errors introduced by the revision**

| # | Page | Paper says now | Problem | Fix |
|---|---|---|---|---|
| R1 | 14 | "The Product Availability Calendar staff to view product availability and expiration periods." | Broken sentence (words deleted mid-sentence), and the Calendar was never built (D2). | Delete that sentence. Keep the next one: "The system automatically displays only products that are currently available and hides expired or unavailable items…" |
| R2 | 16 | "…while preventing orders from being prepared or dispatched without verified proof of payment." | **False.** Orders can be prepared and delivered unpaid (cash on delivery, partial payments). The system only refuses to mark an order **Completed** while it still owes money. | "…and an order cannot be marked Completed until it is fully paid." |
| R3 | 16 | Walk-in: "the cashier, who processes cash payments" | Incomplete: the counter also records **GCash** payments (by reference number). | "…who records cash or GCash payments directly in the system." |
| R4 | 26 | "Products are unavailable to customers when it's currently expired." | Grammar ("it's" for plural products); repeats p. 14 word for word; sits under Customer Management, but it is about products. | Move it to the Inventory part. Use: "Expired products are hidden from customers automatically." |
| R5 | 31 | Figure 5.3: "a checkbox for **email** order updates" | Still not built: the system sends no order-update emails (only sign-in codes, email confirmation, password reset and email-change notices). SMS → email does not fix D3/D9. | Label Figure 5.3 an early mockup, or remove the Notification and Marketing cards from the description. |
| R6 | 14 | "inventory levels are automatically adjusted whenever an order is placed" followed by "The AI Inventory Automation feature automatically updates product stock levels whenever an order is processed" | Same fact twice in a row; the second also says "AI" (D1, pending). | Keep the first sentence; start the second at "The system also monitors stock levels…" |
| R7 | 84 | "organizing **REACT** and Tailwind CSS" | Capitalisation, and the server code (Node.js/Express) is not mentioned. | "…organizing the React, Node.js (Express) and Tailwind CSS code…" |

**Decision for the team: cash on delivery (p. 16 vs. p. 129)**

The revised p. 16 offers delivery customers "the option of cash on
delivery". In the client interview (p. 129, 00:13:43–00:14:21) the General
Manager was wary of COD for food: a customer may refuse the order and the
bakery loses it. A team member answered that it would be removed. The
system today **does** allow it: a delivery order can go out unpaid, and the
driver records the cash collected. A panelist who reads both pages may ask.
Choose one:

1. **Keep COD** (current system). Say in the paper that the bakery asked
   about the risk, and that COD is limited to Lucban, where the bakery
   knows its customers. Mention that bulk orders (over 100 items) need
   approval first.
2. **Online payment first for delivery.** This is a system change: a
   delivery order cannot be dispatched until it is paid. Then remove COD
   from p. 16.

**Decided 2026-10-08: option 2.** The client does not allow cash on
delivery. The system change is planned in `NO_COD_PLAN.md`; the paper
changes for it are listed at the end of that plan.

## Re-check of `docs/PECTRACK_REVISED.pdf` (third upload, 2026-10-08)

Part A and R1–R7 were applied correctly: A1, A2, A3, A4, A5, A11, A12
(React, Tailwind), R1–R6. A7 and A8 were handled by **deleting** the
MediaDevices and OOP sections on p. 70, not by replacing them. That is
acceptable, because the file-upload and modular-design text was optional.
The pages from p. 88 onward moved one more page later in this upload
(for example, CUSTOMER TABLE is now on p. 101).

Still open:
- p. 16: "…in addition to the option of cash on delivery" — remove it
  (the change is built; paste text in `PAPER_FIX_PART_A.md`, "After the
  no-cash-on-delivery build").
- p. 92: Delivery Personnel "record cash collected on delivery" — same.
- p. 86: "includedto" should be "included to" (typo from the edit).
- p. 16: "Payment and Billing Module" heading printed twice (older error).
- p. 67/68 (optional): "Node.js (Version 22 or later)"; "Chart.js
  (Version 4.5)" spacing.

---

## Part A — Factual errors in the paper (fix regardless)

Ready-to-paste text for every item below: `PAPER_FIX_PART_A.md`.

| # | Page | Paper says | Correct statement |
|---|---|---|---|
| A1 | 80, 83 | "PHP-based system"; VS Code used for "HTML, PHP, and Tailwind CSS" | The system is **React (JavaScript) + Node.js/Express + PostgreSQL**. No PHP anywhere. |
| A2 | 92 | "hashed using the **ecrypt** algorithm" | **bcrypt**. Also: hashing is not "encrypted format" — say "a one-way hash that cannot be reversed". |
| A3 | 99 | CUSTOMER TABLE: "The CASHIER table contains the information of staff members…" (copied text) | "The CUSTOMER table stores the profile of each customer account: name, contact number and email. Delivery addresses are kept in CUSTOMER_ADDRESSES." |
| A4 | 20, 89, 92 | "three main roles: Admin, Cashier, and Customer" | **Four** roles: Admin, Cashier, Delivery Personnel, Customer (pp. 11–12 already say four — make the rest agree). |
| A5 | 18 (Objective 3) | OTP "sent through **both** the user's registered email address" (for every user) | OTP is the **admin's** second factor only. Other users sign in with password; customers must **confirm their email** before ordering. (Grammar: "both" with one item.) |
| A6 | 69, 85, 93 | PayMongo accepts "GCash, **Maya, and debit or credit cards**" | **GCash only** (online through PayMongo; GCash reference or cash at the counter). |
| A7 | 69, 84–85 | Proof of delivery captured with the **MediaDevices (Web Camera) API** | The driver **uploads a photo** (JPEG/PNG, up to 5 per delivery) through the phone's file picker, which opens the camera or the gallery. The MediaDevices API is not used. |
| A8 | 69 | Built with **OOP** (objects for orders, products, users) | The code is organised as **modules** (one route file and one screen per module, shared libraries). Replace with "modular, component-based design" — React components on the client, Express route modules on the server. |
| A9 | 94 | "Any attempt to access the system over HTTP is automatically redirected to HTTPS" | **Correct — keep.** Rechecked 2026-10-08: in production the server redirects HTTP to HTTPS (308) and sends Strict-Transport-Security (`server/lib/security.js`). |
| A10 | 93 | PayMongo is PCI-DSS compliant (the claim is about PayMongo, fine) — but also lists "GCash, **PayMaya, and debit card** transactions" | Same as A6: GCash only. |
| A11 | 7 (Background) | Delivery "across different parts of Quezon Province" | True of the bakery today, but the **system** delivers within **Lucban only** (p.44 Limitations already says so). Add "the system's online delivery covers Lucban only" to avoid a contradiction. |
| A12 | 65–68 | Versions: React 19, Tailwind CSS 4.1, Node.js 22, PostgreSQL 17 | Actual: **React 19.2, Tailwind CSS 4.3, Node.js 22 or later, PostgreSQL 17/18, Express 5, Chart.js 4.5, Vite 8**. |

---

## Part B — Section-by-section changes

Ready-to-paste text for every module below: `PAPER_FIX_PART_B.md` (pages of `PECTRACK_REVISED.pdf`).

### B1. Purpose and Description — Login Module (pp. 11–12) and Login Module scope (p. 20)

| Paper | System now |
|---|---|
| One login page; "valid username and password" | **Pop-up sign-in**, no separate page. Two doors: **customer sign-in** and **staff sign-in**. Each door refuses the other kind of account (a cashier cannot sign in at the customer door). Username **or email**. "Remember me". |
| Admin OTP by email | Same — 6-digit code, expires in 5 minutes, single use. |
| Invalid credentials end the session | After **5 failed attempts** the account is **locked for 15 minutes**. |
| "Session expires after a period of inactivity" (p. 92) | **Staff** are signed out after **30 minutes** without activity; **customers** keep a 7-day session. The sign-in pop-up reopens with the reason. |
| — | **Forgot password**: a reset link by email, for every role. |
| After login: Admin/Cashier → their dashboard, Customer → Home, Delivery → Delivery Dashboard | Admin/Cashier → **Dashboard**; Delivery Personnel → **My Deliveries**; Customer → **Menu**. Signing out returns everyone to the Home page. |

### B2. Registration (p. 21, Figure 1.1)

Paper fields: Full Name, Email, Password, Confirm Password. System fields:
**Full name, Username, Contact number, Email, Password, Confirm password**,
Terms checkbox. Password rule: **at least 12 characters with uppercase,
lowercase, number and symbol**; common passwords are refused (p. 93 says
"minimum length" — state 12). After registering, the customer receives a
**confirmation link by email** and cannot place an order until the email is
confirmed. Duplicate username / email / contact number is refused (p. 25
mentions duplicate detection — keep).

### B3. Dashboard Module (pp. 22–25, Figures 2–2.2)

Replace the descriptions with what the Dashboard shows now (Admin and
Cashier; the driver has no dashboard — see B8):

- A greeting that says how many things need attention.
- **Today**: orders today, amount ordered, amount collected.
- **Status tiles, colour-coded** — green *Good*, yellow *Okay*, red *Needs
  attention*: Low stock, Running low, Expired stock, Orders to prepare
  (red when an order is past its requested time), Deliveries to assign,
  Bulk orders to approve (admin only), Unpaid balances, Likely to sell out
  (from the forecast).
- Clicking a tile opens the module **already filtered to the problem**
  (e.g. Low stock opens Inventory showing only low-stock products;
  Unpaid balances shows only orders that still owe money).
- **Restock first**: the products furthest under their minimum.

### B4. Customer Management (pp. 13, 25–30, 71–72)

| Paper | System now |
|---|---|
| Admin **creates** customer records | Customers **create their own accounts** (registration). Admin can **view, edit and deactivate/reactivate**. Walk-in customers need no account (counter orders can have no customer). |
| Cashier can **edit** customer information | Cashier is **view/search only** — editing is admin-only (data integrity). |
| Customer profile: birthday, membership date, preferred payment (Fig. 5.1) | Not stored. Profile = name, username, email, contact number. |
| Settings: SMS notifications, promo opt-in (Fig. 5.3) | Not built. Settings = change password, change email (requires current password; the old address is notified). |
| Addresses (Fig. 5.2) | Built: **several saved addresses**, one default, recipient name and contact per address, delivery notes. |
| Account page with sidebar | Account page with three tabs: **My Profile, My Orders, My Payments**, in the storefront's design. |

### B5. Inventory Management (pp. 14, 34–35, 72–73)

| Paper | System now |
|---|---|
| Inventory = product list + stock | Split into two modules: **Product Management** (admin: categories, products, prices, photos, availability, shelf life) and **Inventory Management** (stock levels). |
| Cashier proposes changes to **stock, pricing, descriptions and availability** | Cashier proposes **stock corrections** and files **loss reports** (reason: spoilage, damaged, expired, production loss). Admin approves or rejects; only then does stock change. Product details are admin-only. |
| Low-stock alert for "product **or ingredient**" (p. 34) | Products only (ingredients are out of scope — Part E). |
| — | **Expiry dates**: expired stock is hidden from the menu and refused at checkout automatically. |
| — | **Stock status filter**: Good / Running low / Low stock / Expired / Needs attention, each colour-coded. |
| — | Every stock change is recorded in a **stock movement ledger** (who, when, why). |
| "AI Inventory Automation… restocking recommendations" (p. 14) | Built as **restock recommendations** in the Forecast tab: how many of each product to bake to cover today and tomorrow. Describe as forecast-based, not "AI" (see D1). |

### B6. Order Management (pp. 14–15, 30–33, 73–74)

| Paper | System now |
|---|---|
| Statuses: Placed, Confirmed, In Production, Out for Delivery / Ready for Pickup, Completed | Same, plus **Cancelled**. Status can only move forward; every change is recorded with who and when. |
| "Cancel orders with a logged reason" | Built: a reason is **required**; customers pick from a list. A customer can cancel only while the order is still Placed. Cancelling restores stock and refunds any payment. |
| "Bulk order requests requiring administrator approval" | Built: an order with **more than 100 items** (admin-adjustable) waits for an admin's approval and **cannot be paid until approved**. |
| "Advance ordering" | Built: customers choose a **requested date and time, up to 30 days ahead**. |
| "Organize production scheduling based on incoming orders" | Built: **Production → Due today** — open orders grouped by the hour they are due, what is still to make, overdue / due-soon flags. This answers the interview problem on p. 9 ("order is for 6:00 but the bread is finished at 7:00"). |
| Cashier can "modify orders" | Not built: items cannot be edited after the order is placed (cancel and re-order instead). Remove "modify". |
| Delivery orders | Delivery is accepted **only for addresses in Lucban**; pickup is open to anyone. |
| Order screen mockups (Figs. 6–9) | Replace with screenshots: staff order list with filters, order detail, counter "New order" form; customer Menu with categories and search, cart, checkout. |

### B7. Payment and Billing (pp. 15–16, 36–40, 74)

| Paper | System now |
|---|---|
| Cash for walk-in/pickup; PayMongo for online | Cash and **GCash reference** at the counter; **GCash online through PayMongo** (customer pays from My Payments or the order). PayMongo confirms through a signed webhook. |
| — | **Partial payments** allowed; every order shows amount paid and **balance due**. |
| — | **Refunds** (admin only), including automatic PayMongo refunds when a paid order is cancelled. |
| — | **Delivery orders are prepaid** (built 2026-10-08, `NO_COD_PLAN.md`): paid in full — GCash online, or cash/GCash at the counter — before the order is confirmed and before a driver is assigned. No cash on delivery; the driver never handles money. |
| "Delivery fee" in checkout (Fig. 15) | No delivery fee. Remove, or state delivery within Lucban is free. |
| Driver "Payment Verification… Proceed to Delivery" screen (Fig. 14) | Not built as a gate. The driver sees whether the order is paid and how much to collect, and records cash. |
| Digital receipt | Built (receipt per order in Payment & Billing / My Payments). |

### B8. Delivery (pp. 15, 24–25, 32–33, 38–39, 43)

| Paper | System now |
|---|---|
| Delivery Dashboard with counters and map icon | The driver lands on **My Deliveries**: Assigned tab (start delivery, upload proof photo, record cash, mark delivered/failed with a reason) and **History** tab (delivered, failed, assigned now, cash collected; date range; Save as PDF). No map/GPS. |
| Admin assigns deliveries | Admin **and cashier** assign a driver (Delivery Management). Admin can retry a failed delivery or call back a stuck one. |
| Delivery statuses | Pending assignment → Assigned → Out for delivery → Delivered / Failed. |

### B9. Reporting and Analytics (pp. 16, 41–43, 75–76)

| Paper | System now |
|---|---|
| Admin daily/monthly sales | **Sales** report (by day/week/month, any date range), **Products** (best sellers), **Inventory** (stock movement, losses), **Forecast**, **Transactions** (payment log, filter by date, method, status), **Report History** (admin). |
| "Peak ordering periods" | Built: **Peak ordering periods** by hour of day and day of week (Sales tab). |
| "Sales trends… best-selling products" | Built (Sales chart, Products report). |
| Export PDF | Built: **Print / Save as PDF** on every report tab, driver history and Due today; plus **CSV export**. |
| Cashier sees "only their total sales on that day" | Cashier sees the **same reports as the admin** except Report History. Update the text. |
| Customer downloads receipt as PDF | Not built (receipt is viewable, not downloadable) — see H9. |
| Reports are view-only | True. |

### B10. Objectives (pp. 17–19)

Objectives 1, 2 and 4 hold. Objective 3: fix the OTP sentence (A5).
Objective 4 can now name the analytics that exist: sales trends, best
sellers, peak ordering periods, demand forecast and restock
recommendations.

---

## Part C — Built, but not in the paper (add these)

1. **Separate customer and staff sign-in doors**, pop-up sign-in.
2. **Email verification** before a customer can order; **password reset by email**; **change email** with notice to the old address.
3. **Account lockout** (5 tries, 15 minutes) and **30-minute idle sign-out** for staff.
4. **Security audit log** (`security_events`): sign-ins, failures, lockouts, OTP use, password changes, account changes.
5. **Staff Management** module: admin creates and deactivates cashier and driver accounts.
6. **Multiple saved addresses** per customer.
7. **Order ahead** (requested time up to 30 days).
8. **Bulk-order approval** with an admin-set threshold.
9. **Production → Due today** schedule.
10. **Lucban-only delivery** rule.
11. **Loss reports** with reasons; **stock change requests** with admin approval; **stock movement ledger**.
12. **Expiry dates** with automatic hiding.
13. **Sales forecast** (next 7 days) and **restock recommendations** — see the methodology note in G3.
14. **Peak ordering periods**.
15. **Colour-coded Dashboard** with filtered drill-down; **Inventory status filter**.
16. **Driver delivery history**; **prepaid delivery orders** (no cash on delivery — the client's rule).
17. **Refunds**, partial payments, balance due.
18. **Print / Save as PDF** and **CSV export**.
19. **Customer storefront**: Home, Menu with categories and search, Our Story, Visit Us, cart, checkout — bakery design.
20. **Automated tests**: 433 tests run on every change (see G4).

---

## Part D — Promised in the paper, not built (reword or remove)

| # | Page | Promise | Suggested action |
|---|---|---|---|
| D1 | Title, 14, 16 | "**AI**-Assisted Analytics", "**AI** Inventory Automation" | Pending decision D4 with the adviser. Either retitle to "Predictive Analytics", or define "AI-assisted" in Definition of Terms as statistical, data-driven forecasting. |
| D2 | 14, 25 | **Product Availability Calendar** | Reword: "The menu shows only products that are available and not expired; expired stock is hidden automatically." |
| D3 | 28–30 | Birthday, membership date, preferred payment, SMS order updates, promo notifications | Remove from the figure descriptions, or label the figures "early design mockups". |
| D4 | 15 | "**Modify** orders" | Remove; orders can be cancelled (with reason) and re-placed. |
| D5 | 38–39 | Driver "Payment Verification" gate | Reword to: delivery orders are paid before they leave the bakery, so the driver only sees that the order is paid. |
| D6 | 40 | Delivery fee | Remove or say free within Lucban. |
| D7 | 41, 76 | Customer downloads receipt as **PDF** | **Built (H9).** Keep it; describe it as "Print / Save as PDF" from the receipt screen. |
| D8 | 13, 72 | Delivery personnel "access the Customer Management module" | Reword: the driver sees the delivery address and contact number on each assigned delivery only. |
| D9 | — | Customers are **notified** when the order status changes | Not built — customers check My Orders. Add to Limitations if the paper implies notifications. |

---

## Part E — Removed on purpose (Limitations)

**Ingredients, recipes, production batches and production costing** were
built and then removed (migration 022) because the adviser ruled
raw-material tracking out of scope. Suggested Limitations paragraph:

> The system manages the inventory of finished bakery products only. It
> does not track raw materials or ingredients (such as flour, sugar and
> eggs), recipes, ingredient usage per production batch, or the production
> cost and profit margin of each product. Stock of finished products is
> recorded through restocking, sales, cancellations and reported losses.
> Ingredient purchasing and recipe management remain manual processes of
> the bakery and may be addressed in future work.

Also add to Limitations:
- **Forecast data**: until enough real sales are recorded, the forecast
  learns from assumed (sample) sales history, approved by the adviser; it
  is labelled "Practice mode" and kept out of sales reports.
- **Online payment**: GCash only.
- **Delivery orders are prepaid**: no cash on delivery (the client's decision). An unpaid delivery order is not cancelled automatically; the customer or staff cancel it.
- **No notifications**: customers are not messaged when an order changes
  status.
- **No live tracking**: delivery is a status workflow, not a GPS map.

---

## Part F — Database chapter (pp. 96–107)

The paper describes 15 tables. The system has **29 tables plus 3 views** (the 15 below, changed, and 14 new ones).

**Tables in the paper that changed:**

| Table | Change |
|---|---|
| USER | + `is_active` (deactivation) and lockout fields `failed_login_attempts`, `locked_until` |
| CUSTOMER | Remove `Address` (moved to CUSTOMER_ADDRESSES); + `email_verified_at` |
| ORDER | Remove `Address`; + `address_id` (FK to CUSTOMER_ADDRESSES), `requested_fulfillment_time`, `requires_admin_approval`, `data_source`. `CustomerID` may be empty (walk-in). |
| ORDER_DETAILS | Remove `Status`; + `unit_price` (price at the time of the order) |
| PRODUCT | + `image_key` (photo), `shelf_life_days` |
| INVENTORY | + `expiration_date` |
| PAYMENT | `RecordedBy` refers to **USER** (admin, cashier or driver may record), not CASHIER; + `refunded_by`, `refunded_at`, `refund_reason`, `gateway_payment_id`, `refund_reference` |
| DELIVERY | + `failed_at` |
| ORDER_STATUS_HISTORY | + `note` (holds the cancellation reason) |

**Tables to add to the chapter:**

| Table | Purpose |
|---|---|
| SESSIONS | Signed-in sessions, with last activity for the idle timeout |
| OTP_CODES | Admin one-time codes (stored hashed) |
| PASSWORD_RESET_TOKENS | Password reset links (hashed) |
| EMAIL_VERIFICATION_TOKENS | Email confirmation links (hashed) |
| SECURITY_EVENTS | Security audit log |
| CUSTOMER_ADDRESSES | Saved delivery addresses |
| DELIVERY_PROOFS | Proof-of-delivery photos |
| INVENTORY_CHANGE_REQUESTS | Cashier stock corrections and loss reports awaiting approval |
| INVENTORY_MOVEMENTS | Every stock change and its reason |
| APP_SETTINGS | Admin settings (bulk-order threshold) |
| ASSUMED_DAILY_DEMAND | Sample sales history for the forecast (kept separate from real sales) |
| FORECAST_RUNS, FORECAST_MODELS, FORECASTS | Each forecast run, the method chosen per product, and the 7-day predictions |

Also update Figure 32 (the ERD) and the sentence on p. 97 ("six primary
modules") — the system now has Dashboard, Staff, Order, Customer, Product,
Inventory, Production, Payment & Billing, Delivery, Reporting & Analytics
and My Profile.

---

## Part G — Methodology, technologies, testing

**G1. Technologies to be Used (pp. 65–69)** — keep React, Tailwind CSS,
Node.js, Chart.js, PostgreSQL, REST API, PayMongo. Add:
- **Express 5** (server framework), **Vite** (build tool).
- **Nodemailer with Gmail SMTP** (OTP, verification and reset emails).
- **Vercel** (hosting, HTTPS).
- Remove MediaDevices API (A7) and OOP (A8), or reword.

**G2. Sprint plan (pp. 62–65, 84–88)** — the backlog now includes the
Phase 10 items (restock, peak periods, PDF, delivery history, Due today,
idle timeout, cancel reason, Lucban rule, bulk approval) under **decision
support modules**, and the storefront redesign under client revisions.

**G3. Forecasting procedure (new subsection)** — the forecast is not
described anywhere in the methodology. Add: data source (daily sales per
product; sold-out days excluded; assumed history with adviser approval),
methods (same-weekday average, Holt-Winters, calendar regression),
selection by backtesting on 4 past weeks scored by mean absolute error,
and the restock rule (bake = expected today + tomorrow + busy-day margin −
stock). Wording depends on decision D4.

**G4. Testing (Sprint Testing, p. 64)** — besides functional and usability
testing, the system has **433 automated tests** (Node.js built-in test
runner) covering security, orders, payments, deliveries, inventory,
reports and forecasting; they run before every change is committed. Worth
one paragraph and a results table.

**G5. Hardware (p. 80)** — "PHP-based system" (A1).

---

## Part H — Redundancy and errors in the system

Ranked by impact. These are fixes to the **code or data**, not the paper.

| # | Finding | Impact | Fix |
|---|---|---|---|
| H1 | **Demo data is stale.** The 12 assumed demo orders from September are still "Placed", so the Dashboard shows "Orders to prepare: 12" and Due today lists them every day; the assumed sales history ends Sep 24 and drifts further from today. | Misleading figures in the defense demo | Before the defense: clear and re-seed demo data (`scripts/clear-demo-data.mjs`, `seed-demo-data.mjs`), regenerate assumed demand up to yesterday, then run the forecast once. |
| H2 | **Bakery details hard-coded in several places** — address, hours and phone numbers appear separately in the footer, Visit Us, the Home "giant chef" section and the paper. The bakery's own About page says "Daily 5:00 AM – 8:00 PM", the site says "Monday–Saturday 6:00 AM – 8:00 PM". | Inconsistent information; one edit misses a copy | Confirm the real hours with the client; keep them in one shared file used by every page. |
| H3 | **22 "Explanation" files** (`server/**/…Explanation.js`, 440 KB) are frozen, annotated copies of old code. They are not run and are already out of date. | Confusing duplicates; risk of a panelist reading stale code | Move them to `docs/code-walkthrough/` (or delete) and say in the README they describe an earlier version. |
| H4 | **Unused work in the Dashboard summary.** `/api/reports/summary` still computes the low-stock alert list and expired-stock list, but the new Dashboard reads stock from `/api/inventory` instead. | Two extra queries on every Dashboard load | Remove `lowStockAlerts`, `lowStockAlertsTotal`, `expiredStock`, `expiredStockTotal` from `/summary`. |
| H5 | **Two definitions of "low stock".** The Dashboard and Inventory compute it live (stock ≤ minimum); the Reports → Inventory tab counts open rows in `stock_alerts`. They agree today, but they are two sources for one fact. | Possible mismatch if an alert row is left open | Make the Inventory report use the same live rule, or document `stock_alerts` as the alert history only. |
| H6 | **Duplicated helpers**: the Manila-date function is written three times (Delivery History, Due today, Reports); the chart-colour helper three times; the Lucban check in two places on the client and once on the server; the page banner twice (Menu, About). | Small; a fix in one copy can miss the others | Move each into one shared module. |
| H7 | **Unused stock-movement reason.** `PRODUCTION` (stock added by a production batch) no longer has a writer since batches were removed; it remains only for old ledger rows. | None — documented in migration 022 | Leave; mention in the database chapter only if needed. |
| H8 | **Duplicate forecast runs.** Pressing Run forecast twice stores two identical runs (it happened on Oct 8). | Clutter in history | Optional: disable the button while a run is in progress (it is) and skip a run if one finished in the last minute. |
| H9 | **No printable customer receipt.** The paper promises a PDF receipt; the receipt screen has no Print / Save as PDF. | Paper promise unmet | Add the existing Print / Save as PDF button to the receipt (about an hour), or remove the promise (D7). |
| H10 | **Order items cannot be edited** after placing. | Paper says "modify orders" | Keep as is (cancel and re-order is safer for stock and payments) and reword the paper (D4). |

### Status of Part H (2026-10-08)

| # | Status | What was done |
|---|---|---|
| H1 | Done | The seed script logs in without sending an OTP email and builds orders that fit today's rules (live orders get a pickup/delivery time; cancellations get a reason). Demo data was cleared and re-seeded (57 orders), assumed demand regenerated to Oct 7, and the forecast run once. |
| H2 | Done | Name, address, hours and phones live in `src/lib/bakery.js`; the footer, Visit Us, Home, Our Story and checkout read from it. Hours follow the bakery's own About page (Daily 5:00 AM – 8:00 PM, fresh batches at 5 AM and 3 PM), adopted 2026-10-13. |
| H3 | Done | The 22 files moved to `docs/code-walkthrough/`, with a README saying they describe an earlier version. |
| H4 | Done | `/summary` no longer computes the low-stock or expired lists. |
| H5 | Done | The Reports → Inventory tab uses the same live rule as the Dashboard and Inventory page (stock at or under the minimum). `stock_alerts` remains the alert history. |
| H6 | Done | Shared `lib/dates.js` (Manila dates), `lib/theme.js` (chart colours), `isDeliverable` in `lib/bakery.js` (Lucban rule on the client), and `components/storefront/PageBanner.jsx`. |
| H7 | Left as is | Documented in migration 022. |
| H8 | No change needed | The button is already disabled while a run is in progress; the Oct 8 duplicates came from scripted test clicks. |
| H9 | Done | The receipt has a Print / Save as PDF button that prints only the receipt (one page). Staff and customers both have it, so D7 can stay in the paper. |
| H10 | Paper only | Reword "modify orders" in the paper (see D4). |
| H11 | Done (found while testing) | A forecast run failed outright if a product was deleted during the few seconds of training. The run now locks the products it saves and leaves out any already deleted. |
