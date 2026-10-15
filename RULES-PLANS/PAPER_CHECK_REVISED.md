# PAPER_CHECK_REVISED.md — check of `docs/PECTRACK_REVISED.pdf` (2026-10-15)

This is a check of the PDF your team uploaded after applying Parts A and B and the
figures. It lists mistakes, items from Parts A and B that were not pasted or were
pasted in the wrong place, and pieces that are missing. Everything was checked
against the system as it is now, after the client's revisions R1–R5.

**How this file fits with the others:**
- `PAPER_FIX_REVISIONS.md` (R1–R5) lists what the client's revisions change.
- `PAPER_FIGURES.md` lists which screenshots to replace.
- **This file** lists everything else. Where a Part B item was never pasted and a
  revision also changes the same text, this file gives **one final text** that
  already includes both. Paste that, and skip the revision item it names.

Page numbers are the **PDF pages of this upload** (the number the PDF viewer
shows, not the printed page number). They will shift as you edit, so the text to
find is always quoted.

---

## 1. Part A/B items not pasted, or pasted in the wrong place

### 1.1 Customer Management, Purpose and Description (pp. 13–14) — and a copy in the wrong module (p. 15)

The B4 text for this section was pasted into the **Order Management** module
(p. 15) instead. The Customer Management module still has the old text.

**Step 1 — on pp. 13–14, find:**
> The Admin has full access to everything within this module, including the ability to view the complete customer list, create new customer records, modify and update existing customer information, and oversee all customer-related data across the system.
>
> The Cashier has limited access within this module, restricted only to searching for existing customers, viewing customer details, and editing customer information when necessary to ensure records remain accurate and up to date.

**Replace with:**
> Customers create their own accounts through registration. The Admin has full access within this module, including the ability to view the complete customer list, update existing customer information, and deactivate or reactivate customer accounts. The Cashier has limited access within this module, restricted to searching for existing customers and viewing customer details; editing is reserved for the Admin to protect the integrity of the records. Walk-in customers do not need an account.

**Step 2 — on p. 15, under Order Management Module, delete** the misplaced paragraph:
> The Customers create their own accounts through registration. The Admin has full access within this module, including the ability to view the complete customer list, update existing customer information, and deactivate or reactivate customer accounts. The Cashier has limited access within this module, restricted to searching for existing customers and viewing customer details; editing is reserved for the Admin to protect the integrity of the records. Walk-in customers do not need an account.

### 1.2 Order Management, Purpose and Description — the Cashier (p. 15)

B6 was not pasted. The paper still says the cashier can "make necessary updates" to orders; orders cannot be edited once placed. This text also includes R2 (no refunds).

**Find:**
> The Cashier is provided with the tools to input new orders, make necessary updates, and track the current status of ongoing transactions, ensuring that every order is handled accurately.

**Replace with:**
> The Cashier is provided with the tools to input new orders, update their status, cancel unpaid orders with a recorded reason, and track the current status of ongoing transactions, ensuring that every order is handled accurately. Once placed, an order's items are not edited; an unpaid order is cancelled and placed again, so that stock and payments stay correct.

### 1.3 Order Management, Purpose and Description — Delivery Personnel (p. 16)

B6 and the proof-of-delivery rewording (decided 2026-10-13) were not pasted.

**Find:**
> The Delivery Personnel functionality is integrated within the Order Management Module rather than implemented as a separate module. Through this feature, delivery personnel are able to view their assigned orders…

**Replace with:**
> Deliveries are handled in two places. In Delivery Management, the Admin and Cashier assign each paid delivery order to a delivery person. The delivery personnel work from My Deliveries, where they are able to view their assigned orders…

**Then find:**
> To ensure accountability and verification, delivery personnel are also required to upload proof of delivery, such as a photo or confirmation, once the order has been successfully handed over to the customer.

**Replace with:**
> For accountability, delivery personnel can also upload photos as proof of delivery once the order has been handed over to the customer.

### 1.4 Payment and Billing, Purpose and Description (p. 17)

A successful online payment is recorded against the order. It does **not** change the order's status; staff confirm the order.

**Find:**
> …via a secure webhook, which then updates the order status and generates a digital receipt accordingly.

**Replace with:**
> …via a secure webhook, which then records the payment against the order and updates its receipt.

### 1.5 Order Management Module, Scope (p. 32)

B6 was not pasted. The paper still says the payment method is chosen when the order is created, that cashiers can "modify orders", and that they "organize production scheduling". This final text includes B6, R2 (no refunds) and R4 (daily order numbers, alerts). **It replaces R2 item 1 and R4 item 2** in `PAPER_FIX_REVISIONS.md`.

**Find** the whole paragraph, from:
> The Order Management Module handles the entire order process from creation to completion. This focuses on Cashiers, they can create new orders by capturing the customer name, items, quantities, and preferred method cash or gcash payment, …

to:
> …Customers are able to indicate their preferred receiving method at the time of order placement.

**Replace with:**
> The Order Management Module handles the entire order process from creation to completion. Customers place their own orders online, and cashiers enter the orders taken at the counter by choosing the customer (or leaving the order as a walk-in), the products and quantities, and whether it is for pickup or delivery. Each order is given a daily order number that starts again at #1 every day. An order queue displays all active orders progressing through the stages of Order Placed, Confirmed, In Production, Out for Delivery or Ready for Pickup, and Completed; an order can also be Cancelled. Status only moves forward, and every change is recorded with who made it and when. New orders are announced to the administrator and cashiers as they arrive. An unpaid order can be cancelled with a required reason, which returns its stock to the shelf; a customer may cancel their own order only while it is still Placed and unpaid. The bakery does not give refunds, so once an order has been paid it can no longer be cancelled, and any problem with it is settled with the customer at the counter. Customers choose pickup or delivery and may request a date and time up to 30 days ahead. Delivery is available only to addresses in Lucban. The Production page, "Due today", lists the open orders grouped by the hour they are due, with the quantity of each product still to be made, and marks orders that are overdue or due within the hour.

### 1.6 Figure 10 (p. 37)

The screenshot is now Product Management, but the caption and text still describe the old "Product & Inventory" mockup.

- **Caption:** Figure 10. Product Management (admin)
- **Replace the description with:**
  > Product Management shows the categories at the top, a form for a new product, and the product list, where each product can be edited, given a photo, or deleted.

### 1.7 Figure 11 (p. 38)

Still the old mockup text. Use **R1 item 6** in `PAPER_FIX_REVISIONS.md` (new caption and description).

### 1.8 Payment and Billing Module, Scope (pp. 38–39)

B7 was not pasted. The paper still says "Cash on pickup … marked as paid by the cashier upon receipt" and "receipt per transaction". This final text includes B7 and R2. **It replaces R2 item 2.**

**Find** the whole paragraph that starts:
> The Payment and Billing Module processes customer payments and records completed transactions.

and ends:
> …and maintains a full payment history viewable per order.

**Replace with:**
> The Payment and Billing Module processes customer payments and records completed transactions. The system supports online payment through integration with PayMongo, accepting GCash; online payments are started by the customers themselves. At the counter, the cashier records cash payments and GCash payments, the latter by their reference number. Partial payments are allowed, and every order shows the amount paid and the balance due. Delivery orders must be paid in full before they are prepared. The bakery does not give refunds, so a paid order cannot be cancelled; if a customer completes an online payment after their order was cancelled, the payment is still recorded and the order is flagged for the staff to settle with the customer. The module generates a digital receipt per order showing itemized amounts and the total, which can be printed or saved as PDF, and maintains a full payment history that can be filtered by date, payment method, and status.

### 1.9 Figures 12 and 13 (pp. 39–40)

The screenshots were replaced, but both descriptions still describe the old mockup ("All Types" filter, "Confirm Cash", "View Invoice", "green and beige colour scheme"). **This replaces R4 item 6.**

**Figure 12.** Caption: *Figure 12. Payment & Billing — payment log (admin)*. Description:
> The Payment log lists every payment with its order number, customer, method, amount, status, the staff member who recorded it, and the date, and can be filtered by date range, method, and status.

**Figure 13.** Caption: *Figure 13. Payment & Billing — recording a payment (cashier)*. Description:
> The Billing tab lists the orders that still owe money. Selecting one shows its receipt, with a "Print / Save as PDF" button, and below it the form for recording a cash or GCash payment.

### 1.10 Flowchart descriptions (pp. 76–78)

**Inventory (p. 76).** B5 was not pasted. This final text includes B5, R1, R3 and R5. **It replaces R1 item 5 and the flowchart line in R3 item 6.**

**Find** the first two paragraphs, from:
> The Administrator oversees the inventory system through the Inventory Management Module.

to:
> …prevents the order from proceeding until inventory is updated.

**Replace with:**
> The Administrator oversees the inventory through the Inventory Management Module. The system displays all products with their current stock levels and a colour-coded status. The Administrator manages the product list and sets each product's minimum stock level. The Administrator and the Cashier update stock quantities as deliveries arrive, when bread is rejected, or after a recount, giving a reason for each change; every change is recorded with who made it. When a product's stock falls to or below its minimum level, it is flagged as low stock on the Dashboard and in Inventory Management. Ingredients are handled the same way: staff record restocks, usage, rejects, and recounts, and an ingredient at or below its minimum is flagged as running low. When an order is placed, the system checks whether enough stock is available for the selected products. If stock is insufficient, the order is refused until the inventory is updated.

Also fix the grammar of the last paragraph: "Delivery Personnel do not also have direct access to the inventory. However, they can only view order items…" → "Delivery Personnel have no direct access to the inventory; they only see the items of the orders assigned to them."

**Order Management (p. 77).** B6 was not pasted.
- Find: "…the customer confirms the order by selecting the preferred delivery option and payment method." → Replace: "…the customer confirms the order by selecting pickup or delivery and, if they wish, a requested date and time."
- Find: "After completing the delivery, the delivery personnel updates the order status to indicate successful delivery." → Replace: "After completing the delivery, the delivery personnel uploads a photo as proof and marks the delivery as delivered, or as failed with a note of the reason. Staff then mark the order as completed."

**Payment and Billing (pp. 77–78).** B7 was not pasted. **This replaces R2 item 3.**
- Find: "The Admin does not really manage the order process. It can only view payment transactions and generate financial reports to pdf." → Replace: "The Admin can record payments the same way as the Cashier, and also views all payment transactions and can print or save the payment reports as PDF."
- Find: "If the payment is successful, the system updates the payment status and confirms the order." → Replace: "If the payment is successful, the system records the payment against the order, and staff then confirm the order."
- Find the paragraph from "Customers can also select their preferred payment method when placing an order." to "…If not, hold delivery and notify the admin/cashier." → Replace: "Customers pay online with GCash through PayMongo from My Payments or from the order itself. After a successful payment, PayMongo notifies the system and the payment is recorded against the order. A delivery order must be paid in full before it is confirmed and before it can be assigned to a delivery person; delivery personnel therefore do not handle payments."

### 1.11 Use case description (p. 92)

- Find: "The system involves three main Roles: Admin, Cashier, Delivery personnel, and Customer. Each of the four roles…" → Replace: "The system involves four main roles: Admin, Cashier, Delivery Personnel, and Customer. Each role…"
- Find: "The Cashier is responsible for processing customer orders, recording payments, updating order status, and managing customer information." → Replace: "…updating order status, looking up customer records, and updating stock."
- The Admin and Cashier paragraphs after it are covered by **R1 items 3 and 4**.
- Customer paragraph (p. 93): "They can also cancel orders." → "They can also cancel an order while it is still Placed and unpaid."

### 1.12 After Figure 1.2 (optional, B1)

The sentence about where each user lands after signing in was not added. Optional, after the Figure 1.2 description:
> After signing in, the Admin and Cashier are taken to their Dashboard, the Delivery Personnel to My Deliveries, and the Customer to the Menu. Signing out returns every user to the Home page.

---

## 2. Missing pieces

### 2.1 Figure 5.2 is missing (between pp. 30 and 31)

The PDF goes from Figure 5.1 to Figure 5.3. Add the screenshot `fig-05.2-account-addresses.png`:
- **Caption:** Figure 5.2 Customer account — saved addresses
- **Description:**
  > The Addresses section lists the customer's saved addresses, marks the default one, and has an "Add address" button. The first address saved becomes the default automatically.

### 2.2 Figure 14 is missing (p. 41)

Figure 13 is followed directly by Figure 15. Add `fig-14-deliveries-admin.png`:
- **Caption:** Figure 14. Delivery Management (admin and cashier)
- **Description:**
  > In Delivery Management, the admin and cashier assign each delivery order to a delivery person and follow it through to delivered. Only confirmed, fully paid orders can be assigned, so delivery personnel never handle payments. The admin can call back a delivery whose driver can no longer finish it, and send a failed delivery back to the queue.

### 2.3 Figure 5.3 (p. 31): one sentence too many

**Delete:**
> In the final system, the customer's account page has three tabs -- My Profile, My Orders, and My Payments -- and the profile holds the name, username, email address, contact number, and saved addresses.

Figure 5 already says this.

### 2.4 Three flowchart pictures are empty in the PDF

Pages 156, 165 and 167 show only the caption, with no chart:
- Figure 36. Login Flow Chart
- Figure 45. Admin Order Management Flow Chart
- Figure 47. Customer Order Management Flow Chart

Check them in Word. If a chart is made of shapes, select it, group it, then copy and **Paste Special → Picture** before saving as PDF, so it is exported.

### 2.5 Flowchart pictures that still show the old design

The descriptions in the paper are being updated, so the pictures must match. Redraw these:

| Figure | What is wrong | The steps it should show |
|---|---|---|
| 37 Admin Customer Mgmt | "Archive customer" | Open Customer Management → choose: View details / Edit customer / Deactivate or reactivate → valid? → save |
| 38 Cashier Customer Mgmt | "View/Edit details", "Changes saved" | Search customer → found? → view details → attach to order (no editing) |
| 41 Admin Inventory | "Review inventory requests → approve/reject" | Open Inventory → choose: Products (add/edit product) or Stock (edit count with reason: restock / reject / recount; set minimum) or Ingredients (record restock / usage / reject / recount) → save → at or under minimum? → flagged low |
| 42 Cashier Inventory | Cashier suggests stock, **price**, description → "Pending admin approval" | Open Inventory → select product or ingredient → enter new count → choose reason → save → change recorded with the cashier's name |
| 46 Cashier Order Mgmt | "Edit order" loop | Create new order → select customer or walk-in → add products → pickup or delivery → place order → update status → (unpaid only) cancel with reason |
| 49 Admin Payment | Admin only views and exports | View payments → (optional) record cash / GCash payment → print or save report as PDF |
| 50 Cashier Payment | Delivery branch waits for payment and "notify customer when ready" | Select order → record cash or GCash (reference no.) → fully paid? → receipt (print / save as PDF) |
| 51 Customer Payment | "Select payment method" at checkout; walk-in "pay at counter" path | Open order or My Payments → Pay with GCash → PayMongo → success? → payment recorded → receipt; failed → try again |
| 52 Delivery Payment | Driver checks "payment confirmed?", holds delivery | **Remove**, or replace with one box: "Assigned deliveries are already paid; the driver only sees that the order is paid" |

**Figure 48** (Delivery Order) is close. Only the proof-of-delivery upload should be shown as optional, not as a required step.

### 2.6 Use Case Diagram (Figure 30, p. 91)

The picture is the original design. Change:
- **Customer:** "Place Order" must not *include* "Create Order (Cashier)", "Update Inventory (Admin)" or "Payment Processing (Cashier)": an online order is placed by the customer alone, stock is deducted by the system, and online payment goes through PayMongo. Add **Cancel Order**, **Manage Addresses** and **View Receipt**.
- **Cashier:** "Manage Customer Information" → **Look Up Customer**. Add **Update Stock**, **Record Ingredient Changes**, **Assign Deliveries** and **Cancel Order**.
- **Delivery Personnel:** add **Mark as Failed**.
- **Admin:** "Delete User" → **Deactivate User**; "Cancel / Archive Order" → **Cancel Order**. Add **Approve Bulk Orders** and **Manage Ingredients**.

### 2.7 Database chapter and ERD (pp. 99–110) — not updated yet

Part F was not applied, and R2–R5 add to it. The ERD (Figure 32) and the table list still show the original 15 tables, including the removed `Address` fields. The system has **32 tables** now.

Short of redrawing the whole ERD, at least make the text and the diagram **agree with each other** and correct these:

**Tables in the paper — change:**

| Table | Change |
|---|---|
| (intro, p. 100) | "six primary modules" → list the system's modules: Dashboard, Staff, Customer, Order, Production, Product, Inventory, Payment and Billing, Delivery, Reporting and Analytics |
| USER | + IsActive, FailedLoginAttempts, LockedUntil |
| CUSTOMER | − Address (moved to CUSTOMER_ADDRESSES); + EmailVerifiedAt |
| ORDER | − Address; + AddressID (FK to CUSTOMER_ADDRESSES), RequestedFulfillmentTime, RequiresAdminApproval, DataSource, OrderDay, DailyNumber (R4). CustomerID may be empty (walk-in). |
| ORDER_DETAILS | − Status; + UnitPrice (the price when ordered). The ERD shows "Price" and the text shows "Status" — they disagree now. |
| PRODUCT | + ImageKey (photo) |
| PAYMENT | RecordedBy refers to **USER**, not CASHIER (the admin can record payments too); + GatewayPaymentID |
| DELIVERY | + FailedAt; the ERD has a typo, "DeliveryPersnnelID" |
| ORDER_STATUS_HISTORY | + Note (holds the cancellation reason) |

**Tables to add** (one short paragraph each, the same layout as the others):
CUSTOMER_ADDRESSES, DELIVERY_PROOFS, INVENTORY_MOVEMENTS, INGREDIENT and INGREDIENT_MOVEMENT (R5 item 7), DAILY_ORDER_NUMBERS (R4 item 8), SESSIONS, OTP_CODES, PASSWORD_RESET_TOKENS, EMAIL_VERIFICATION_TOKENS, SECURITY_EVENTS, APP_SETTINGS, and the forecasting tables FORECAST_RUNS, FORECAST_MODELS, FORECASTS and ASSUMED_DAILY_DEMAND.

Notes on the history-only columns:
- The refund columns of PAYMENT (R2 item 6) and INVENTORY_CHANGE_REQUESTS (R1) hold only records made before those changes.
- Mention them in one sentence each, or leave them out.

### 2.8 Limitations (pp. 48–49) — items missing

Only three limitations are listed. Add these:

> **4. Forecast data.** Until enough real sales are recorded, the sales forecast and restocking suggestions learn from assumed sample sales history, approved by the adviser. These assumed records are kept separate and are never counted in the sales reports.

> **5. Online payment.** Online payment accepts GCash only, through PayMongo.

> **6. No customer notifications.** Customers are not sent messages when an order changes status; they follow their orders in My Orders. (Staff receive alerts for new orders.)

> **7. No live tracking.** Delivery is a status checklist (Assigned, Out for Delivery, Delivered or Failed), not a GPS map.

> **8. Ingredient tracking.** See R5 item 5 in `PAPER_FIX_REVISIONS.md`.

**The first item (assumed data) is required.** The adviser's approval of the assumed history was given on the condition that it is stated in the limitations.

### 2.9 Technologies to be Used (pp. 69–73)

MediaDevices API and OOP were removed, which is fine. The following are missing:

- **Express (Version 5)** — the server framework for the REST API.
- **Vite (Version 8)** — the development server and build tool for the React front end.
- **Gmail API** — sends the one-time codes, email confirmations, and password-reset links from the bakery's Gmail account.
- **Railway** — the cloud platform that hosts the live system and its PostgreSQL database, with HTTPS. The paper never says where the system runs.
- Node.js: "Version 22" → "Version 22 or later" (A12).
- "REACT (Version 19.2)" → "React (Version 19.2)"; "Chart.js(Version 4.5 )" → "Chart.js (Version 4.5)".

### 2.10 Data Privacy (p. 97)

**Find:**
> The system does not share customer data with any third-party service beyond what is necessary for payment processing through PayMongo.

**Replace with:**
> The system shares customer data with third-party services only as far as needed to run it: PayMongo for online payments, Google's Gmail service to send account emails such as one-time codes and confirmation links, and the hosting provider, Railway, where the system and its database run.

### 2.11 Requirements Documentation (pp. 90–91)

- The paragraph "According to the requirements approved by the client, the basic modules like user authentication, dashboard, and product management were attributed to the first sprint…" appears **three times** (twice on p. 90, once on p. 91). Keep the first.
- Find: "…the inventory monitoring module automatically updates stock levels based on completed transactions." → Replace: "…automatically updates stock levels when an order is placed or cancelled."

### 2.12 Product Backlog and Sprint Planning (pp. 87–91), optional

The module list stops at the original eight. Customer Management, Delivery Management, Staff Management, Production (Due today), the sales forecast, and ingredient stock are built but are not in the backlog. Optionally add them under the decision support modules (G2 in `PAPER_VS_SYSTEM.md`).

### 2.13 Appendices

- **The 2026-10-15 consultation** that led to revisions R1–R5 is not recorded anywhere.
  - Add its transcript or minutes to Appendix B, and its consultation photo or form to Appendix D.
  - This matters most for ingredient stock, because it reverses the adviser's earlier ruling.
- **p. 179:** a stray heading "APPENDIX E. Gantt Chart" sits in the middle of the Accomplishment Form pages. The real Appendix E starts on p. 190. Delete the stray one.
- Accomplishment forms jump from week 7 to week 12 (Figures 63–64). If weeks 8–11 had consultations, add them; if not, nothing to do.

---

## 3. Figure captions

The figures are screenshots of the built system now, so "Proposed … design" no longer fits (see `PAPER_FIGURES.md`):

| Page | Now | Change to |
|---|---|---|
| 21 | Figure 1. Proposed login page design | Figure 1. Customer sign-in |
| 22 | Figure 1.1 Proposed registration page design | Figure 1.1 Customer registration |
| 23 | Figure 1.2 Proposed home page design (broken over two lines) | Figure 1.2 Home page |
| 26 | Figure 2.2 Proposed dashboard page design for delivery personnel | Figure 2.2 My Deliveries — delivery personnel's first screen |
| 30 | Figure 5.1 Proposed personal information design for customer | Figure 5.1 Customer account — My Profile |
| 37 | Figure 10. Proposed inventory management design for admin | Figure 10. Product Management (admin) |
| 38 | Figure 11. Proposed inventory management design for cashier | Figure 11. Inventory Management — updating stock (cashier) |
| 39 | Figure 12. Proposed payment and billing design for admin | Figure 12. Payment & Billing — payment log (admin) |
| 40 | Figure 13. Proposed payment and billing design for cashier | Figure 13. Payment & Billing — recording a payment (cashier) |
| 42 | Figure 15.1 Checkout-delivery order(customer) | Figure 15.1 Checkout — pickup order (customer) |
| 45 | Figure 16. Reporting & Analytics- Sales(admin) | Figure 16. Reporting & Analytics — Sales (admin) |
| 156, 164 | "FLow Chart" (Figures 36, 44) | "Flow Chart" |
| 158, 162, 163 | "Figure 38.Cashier…", "Figure 42.Cashier…", "Figure 43.Customer…" | add a space after the period |

Update the **List of Figures** after these.

---

## 4. References and citations

| Problem | Where | Fix |
|---|---|---|
| Panigrahi (2024) is cited but not in References | Project Context, p. 5 | Add the reference, or remove the citation |
| Santos and Villanueva (2023), Taqueban and Villamor (2024), Salazar (2024) are discussed but not in References | RRL pp. 54–55, Synthesis | Add the three references |
| "Alzoubi and Snider (2022)" — the reference is Alzoubi, Elrehail, Hanaysha, Al-Gasaymeh & Al-Adaileh (2022), on **supply chain integration**, and has no Snider | RRL p. 55, Synthesis p. 62 | Cite "Alzoubi et al. (2022)" and check that the summary matches what that article is about; if the OMS study is a different source, add it |
| "Paolo Barsocchi (2021)" — Barsocchi is the last of five authors; the first is Saha | RRL p. 52, Synthesis p. 61 | Cite "Saha et al. (2021)" |
| "Lopez, Garcia, and Reyes (2023)" — the reference has only Lopez and Garcia | RRL p. 53, Synthesis | Make them match |
| Guerola-Navarro: 2024 in Project Context, 2022 in RRL and References | pp. 5, 6, 49, 60 | Use one year everywhere (vol. 20, pp. 507–547 was published in 2024) |
| System years differ: Foodpanda, GrabFood, Shopify and Toast are (2024) in the text but (2023) in References | RRL pp. 56–59 | Make them match |
| Listed twice: Labastida (2024), Lin (2023) | References pp. 112–113 | Delete the second copy |
| Not cited anywhere: Alam (2024), Sharma (2023), Singh (2024), Zomato (2023) | References | Cite them or remove them |
| Not in alphabetical order: Salih sits between Huang and Jollibee; Khan comes after Lin | References | Reorder |
| "(Panigrahi., 2024; Salih., 2023)", "(Bonfanti., 2023; Wu ., 2024)", "(Lin., 2023)" | pp. 5–6 | "(Panigrahi et al., 2024; Salih et al., 2023)", and so on |
| Several references have no DOI, volume, or URL ("Domino's Pizza Tracker", "Goldilocks Official Website", "Philippine Computing Journal") | References | Complete them in APA 7 |

Also note:
- **"Local Literature" lists foreign authors.** Guerola-Navarro, Alshurideh, Ballestar and Nethanani are not Philippine studies. Move them to Foreign Literature, or find local sources. A panelist may ask about this.
- Single authors are referred to as "Their study" (Mittal, Martinho, Barsocchi, Huang). Use "The study".

---

## 5. Typos and consistency

- **Name of the system:** "PECTRACK", "Pectrack" and "PecTrack" are all used. Pick one (the title uses PECTRACK).
- **Name of the bakery:** "Pecto's Bakery", "PECTO'S Bakery" and "PECTO Bakery" (p. 84). Use "Pecto's Bakery".
- **Title:** "…for Pecto's Bakery **in** Lucban Quezon" (p. 1) vs "**at** Lucban Quezon" (pp. 2–3 and elsewhere); "**With**" vs "with". Use one form everywhere, and add the comma: "Lucban, Quezon".
- **p. 4:** "Curriculumn Vitae" → "Curriculum Vitae". Update all the page numbers after the edits.
- **p. 11:** "Pecto's Bakery In Lucban Quezon" → "in Lucban, Quezon".
- **p. 12:** "Below are the following concepts that can incorporate in the proposed study:" → "The proposed system is made up of the following modules:"
- **p. 12:** the cashier dashboard gives access to "customer record management" → "customer look-up".
- **p. 17:** heading "Reporting and **Analysis** Module" vs "Reporting and **Analytics** Module" everywhere else (also pp. 62, 63). Use "Analytics".
- **p. 18:** "supports both the operational needs of the business" → "supports the operational needs of the business"; "order Management" → "order management".
- **p. 18, General Objective:** "web-based Management Processing System" → "web-based Order Management System". **p. 20, Scope:** "Web-Based Order Management Processing System" → "web-based Order Management System".
- **p. 19, Objective 2:** "archiving outdated or incorrect entries" → "deactivating outdated or incorrect entries" (the system deactivates records; it does not archive them).
- **p. 20:** "the cashier, who are provided with … the ability to manage customer records" → "the cashiers, who are provided with … the ability to look up customer records".
- **p. 25:** the stray "nd clear typography to enhance usability, visual clarity, and user experience." at the end of the Dashboard text. R4 item 3 replaces the whole description, which removes it.
- **p. 81:** "Sprint **Resting**" → "Sprint Testing"; "a group had made to go through a series of stages to innovate project" → "the group was formed and went through a series of stages to develop the project"; "Objectives of the Study The researchers…" and "Synthesis The researchers…" need their own bullet or a dash.
- **p. 83:** "SATA- 256GB" → "Storage – 256 GB SSD". **p. 84:** "8GB RAM + 256 ROM" → "8 GB RAM, 256 GB storage".
- **p. 85:** "Figma(Version 125)" → "Figma (Version 125)".
- **p. 88:** "…including the deployment preparation The sales reporting module…" — missing period.
- **p. 94:** "recognition.Pectrack" — missing space.
- **p. 124:** "Zeleta" → "Zoleta". **p. 135:** "[00:00:012]" → "[00:00:12]". **p. 150:** "00:00:20]" — missing "[".

---

## 6. Still pending — decision D4 (the word "AI")

These still say AI, so they all wait for the adviser:
- the title, on the title page, endorsement, approval sheet, pp. 67, 69, 89 and the transcript headers;
- p. 15 "intelligent restocking recommendations";
- p. 17 "The AI-Assisted Analytics feature…".

Note that the **Synthesis (p. 64)** says the system *excludes* "advanced artificial intelligence integration", while the title says "AI-Assisted". Panelists may point out this contradiction, so settle the wording with the adviser.
