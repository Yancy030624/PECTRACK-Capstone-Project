# PAPER_OBJECTIVES_REVIEW.md — the paper checked against the system

The thesis (`docs/PECTRACK.pdf`, 195 pages, May 2026 proposal) compared
claim by claim with the code as of 2026-09-26 (commit `26d400c`).
Read-only: nothing was changed to produce this.

**Headline.** All four specific objectives are met. The gaps are not in
the objectives — they are in the **feature promises** made in *Purpose
and Description* and *Scope*, several written from design mockups, and
one in the **title**: "PECTRACK: A Web-Based Order Management System with
**AI-Assisted Analytics** and **Automated Inventory**". A panel reads the
title first.

---

## Part 1 — The four objectives

| # | Objective (paper p.13–15) | Verdict | Evidence |
|---|---|---|---|
| General | Web-based system: customers browse, order and pay online; admin, cashier and delivery personnel manage daily operations centrally | **Met** | Storefront, cart, checkout, PayMongo GCash; four role-specific screens |
| 1 | Web-based order management: ordering, delivery and monitoring, inventory | **Met** | Orders (online + counter), deliveries with proof, inventory with ledger and alerts |
| 2 | Structured database; create, view, update, **archive** records | **Met** | PostgreSQL, 18 migrations; archiving is deactivation (`is_active`) for customers, staff, addresses, ingredients, recipes, and availability for products |
| 3 | Secure login and authentication; OTP to the registered email; data privacy | **Met, reword** | Admin sign-in requires an emailed OTP; customers confirm their email at registration; role checks on every endpoint. The objective reads as if every user gets an OTP — say *administrator* OTP |
| 4 | Reporting and data analysis with visual representations | **Met** | Sales, Products, Inventory, Production, Forecast tabs with charts; analytics CSV |

---

## Part 2 — The problems (Background, p.7–10) and whether each is solved

| Problem from the interview | Solved? | How |
|---|---|---|
| Orders written on paper | Yes | Every order is a record |
| Two channels (Facebook page + walk-in) handled differently | Yes | Online and counter orders in one queue |
| No customer database; repeat customers hard to track | Yes | Customer records with order history; counter orders can attach a customer |
| Errors from miscommunication and handwritten notes | Yes | Structured items, quantities, instructions, status history with who changed what |
| Customers message to ask where their order is | **Mostly** | Customers see status and its history in My Orders. **No notification** is sent when the status changes — they still have to look |
| **Delays: "the order is for 6:00 but the bread is finished at 7:00"** | **Partly** | Orders carry a requested time, and the forecast estimates demand — but **no screen lines up what is due, when, against what is being baked.** This is the one interview problem the system does not directly answer |
| Inventory monitored manually | Yes | Stock ledger, low-stock alerts, ingredients, production batches |

---

## Part 3 — Promised in the paper, not in the system

Ranked by how exposed the claim is.

### Critical — in the title

**1. "AI-Assisted Analytics" and "AI Inventory Automation."**
The paper (p.14, p.16) says the system *"analyzes product sales trends to
generate intelligent restocking recommendations"* and *"automatically
suggests products and stock quantities that should be replenished based
on customer demand,"* plus analytics for *"sales trends, peak ordering
periods, and best-selling products."*

| Promised | Status |
|---|---|
| Sales trends | Built (Sales report chart) |
| Best-selling products | Built (Products report) |
| Demand prediction | Built (Forecast tab) |
| **Restocking recommendations — which products, how many** | **Not built** |
| **Peak ordering periods** | **Not built** — no hour-of-day or day-of-week view |
| "AI" | **Nothing in the system is AI.** The forecasting is classical statistics (seasonal naive, Holt-Winters, regression) |

The restocking recommendation is now a small step: the forecast already
says how many will sell; subtract what is on hand. Peak periods are a
query over order times. The "AI" wording needs a decision (Part 5).

### High — a panelist would click to find it

**2. PDF export.** Promised for admin, cashier and delivery reports
(p.16, p.41, p.43). The system exports **CSV** only.

**3. Delivery personnel history and Delivery Reports.** The paper (p.15,
p.43) says drivers *"review their delivery history and completed
transactions"* with delivered/failed counts and an export.
`GET /api/deliveries/mine` returns only **open** deliveries — a finished
delivery disappears from the driver's screen. No history, no counts.

**4. Session expires after inactivity** (security section, p.92). Sessions
expire on a fixed seven days; there is no inactivity timeout.

**5. Bulk order requests requiring administrator approval** (p.15). Not
built — a large order is placed like any other.

### Medium — scope written from mockups

| # | Claim | Reality |
|---|---|---|
| 6 | Payment by **GCash, PayMaya, and debit card** (p.93) | GCash only (`payment_method_types: ['gcash']`) |
| 7 | **Product Availability Calendar** showing availability and expiry periods (p.14, p.25) | Expired and unavailable products are hidden; there is no calendar |
| 8 | Delivery **limited to Lucban** (Limitations, p.44) | Lucban is the default city, but any city is accepted |
| 9 | Cashier can **edit** customer information (p.13) | Cashier is read-only, deliberately (UI_REVISIONS_PLAN Decision 12) |
| 10 | Admin can **create** customer records (p.13) | Customers self-register; no admin create |
| 11 | Cashier proposes changes to **pricing, descriptions, availability** (p.14) | Proposals cover stock, minimum level and loss reports only |
| 12 | Cancel orders **with a logged reason** (p.30) | The reason is optional; it defaults to "Order cancelled." |
| 13 | Checkout shows a **delivery fee** (p.40) | No delivery fee exists |
| 14 | Cashier sees **only their own sales for the day** (p.41) | Cashier sees the full Reporting module |
| 15 | Account settings: **SMS order updates**, promo notifications; profile **birthday, membership date, preferred payment** (p.28–30) | Mockup only |

### Wording fixes in the security section (p.92–94)

- RBAC lists **three** roles; there are **four** (Delivery Personnel).
- "hashed using the **ecrypt** algorithm" — typo for bcrypt.
- bcrypt produces an irreversible **hash**, not an "encrypted format".
- HTTPS: TLS is provided by the host; the application enforces secure
  cookies, HSTS and the HTTP→HTTPS redirect. Wording in SECURITY_REVIEW.md.
- PayMongo is PCI-DSS compliant; PECTRACK is not claiming to be. Wording
  in SECURITY_REVIEW.md, section L.

---

## Part 4 — Built, but not in the paper

The paper predates most of this. Worth adding, since each answers a
"how do you know?" question:

- **Ingredients, recipes, production batches with admin approval, and
  per-product costing** — the "tracking how many items are *produced*"
  the name PECTRACK promises (p.11) is literally this.
- **Demand forecasting** with backtesting, and its honest handling of
  assumed data.
- **Customer email verification**, password reset by email, admin 2FA,
  rate limiting, security headers, the security audit trail.
- **Order lifecycle rules**: stock deduction and restoration, refunds at
  the gateway, expiry handling.

---

## Part 5 — What to do: build, or change the paper

Every gap is closed one of two ways. Recommendation per item:

### Build (the claim is central, and the work is small or already half-done)

| # | Gap | Why build |
|---|---|---|
| 1a | **Restocking recommendations** | In the title's "Automated Inventory". Forecast − stock on hand = what to bake/restock. The forecast exists |
| 1b | **Peak ordering periods** | In "AI-Assisted Analytics". One query, one chart |
| 2 | **PDF export** | Promised three times. A print-ready report view gives a real PDF through the browser's Save as PDF |
| 3 | **Driver delivery history and counts** | A whole promised screen; the data exists |
| — | **Production schedule: orders due by time** | Answers the one interview problem still open (Part 2) |
| 4 | **Inactivity timeout** | Stated as a security control |

### Change the paper (the claim came from a mockup, or the system chose differently for a reason)

6 (payment methods), 7 (calendar), 9–11 (role permissions — the system's
choices are recorded with reasons), 13 (delivery fee), 14 (cashier
report scope), 15 (settings and profile fields), and the security
wording.

### Decide

- **"AI" in the title.** Two honest options: (a) keep it and define it
  precisely — *"predictive analytics using statistical demand
  forecasting"* — with that definition in the methodology; or (b) retitle
  to *"with Predictive Analytics and Automated Inventory"*. Option (b) is
  the safer defense. Either way, do not describe the forecasting as
  machine learning.
- **5 — bulk-order approval** and **8 — Lucban-only delivery** and
  **12 — required cancel reason**: small to build; or drop from the paper.
