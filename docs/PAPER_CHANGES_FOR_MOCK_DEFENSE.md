# Paper changes for the mock defense

This checklist covers what in `docs/PECTRACK_REVISED.pdf` (196 pages) no longer matches the system, as of 2026-10-25. Pages are PDF page numbers.

- **Chapter 1 (pp. 1–49):** replace it with `docs/CHAPTER_1_REVISED.md`, which is already aligned.
- **Pages 50 onward:** the list below says, for each place, what to change. Tick each item when it is done.

The detailed notes behind each change are in `RULES-PLANS/PAPER_FIX_REVISIONS.md`.

## 1. The title, everywhere

The title is now **"PECTRACK: A Web-Based Order Management System with Predictive Analytics and Automated Inventory for Pecto's Bakery in Lucban, Quezon"**. The system has no AI-assisted analytics.

- [ ] **p. 67** (Scrum process): the title still says "AI-Assisted Analytics".
- [ ] **p. 89** (Requirements Documentation): same.
- [ ] **pp. 122, 135, 150** (interview transcript headers): the title in each header. The transcripts themselves are a record of what was said, so keep their content.
- [ ] **pp. 52, 61, 64, 69:** check each mention of "AI". Keep a mention only where it describes another study, not PECTRACK.

## 2. The module list (Chapter 3)

- [ ] **p. 100** (database diagram intro): it names "six primary modules: Login, Customer Management, …". Use the system's modules instead: Login, Dashboard, User Management, Order Management, Inventory Management, Payment and Billing, Delivery Management, Notifications, and Reporting and Analytics.
- [ ] **pp. 88–91** (Product Backlog and Sprint Planning): they name "product management", "inventory monitoring" and "sales reporting". Product Management is now the Edit Products tab of Inventory Management. Name the reporting module **Reporting and Analytics (with the forecast)**, and add **Delivery Management**, **Notifications** and the **Production list** to the backlog.
- [ ] **pp. 157–160** (Appendix C, flow charts): "Customer Management Flow Chart" (Figures 37–40) becomes "User Management Flow Chart".

## 3. Who can do what (cashier, admin, customer)

On 2026-10-25 the client's seniors and the team decided:
- **User Management and Reporting & Analytics are for the admin only.**
- The cashier keeps orders, walk-in and advanced orders, inventory and production, Payment & Billing (with the payment log and its PDF), and deliveries.

- [ ] **p. 74** (Login Module, cashier): the cashier "can manage orders, update order status, process payments, and handle customer-related transactions". Keep that, and add inventory and production, and deliveries. Remove any suggestion that the cashier opens reports.
- [ ] **p. 75** (Customer Management flow, cashier paragraph): the cashier no longer searches customer records in a module. Either remove the paragraph, or reword it: at the counter, the cashier enters the walk-in customer's name, or for an advanced order the name and a contact number verified by SMS.
- [ ] **p. 79** (Reporting and Analytics flow): delete "Cashiers see the same reports except Report History" and the whole **Cashier** paragraph.
  - The cashier's daily figures are now the Dashboard's Today row (orders today, sales today, cash not yet paid) and the Payment log in Payment & Billing, which exports a PDF.
  - Rename "Report History" to **Export history**: it records every CSV downloaded and PDF printed, by the admin or the cashier.
- [ ] **p. 174** (Figure 54, Cashier Reporting and Analytics flow chart): remove it, or redraw it as "Cashier Payment log", with these steps: open Payment & Billing → Payment log → filter by date and method → Export PDF.
- [ ] **p. 92** (Use Case Diagram, Figure 30):
  - The cashier no longer "manages customer information"; the admin "manages users".
  - Remove "approving stock changes and bulk orders" from the admin. There is no approval step and no bulk-order threshold any more.
  - Add to the admin: maintains the events calendar, runs or reviews the forecast, and views the reports.
  - The intro says "three main Roles" and then names four. Fix it to four.
- [ ] **p. 93** (Use Case, cashier):
  - Delete "Cashiers can propose stock corrections and report losses, but a stock change takes effect only after the admin approves it." Cashiers now **add stock directly** with a confirmation step, and the admin corrects counts.
  - Add that the cashier takes walk-in and advanced orders and records the cash for cash-pickup orders.
- [ ] **p. 93** (Use Case, customer): "They can also cancel orders." becomes "They can cancel an order that is not yet paid". Paid orders cannot be cancelled (no refunds).
- [ ] **Redraw Figure 30** to match.

## 4. Ordering and payment

- [ ] **p. 77** (Order Management flow):
  - **Cashier:** "assigns an initial order status" and "can update the order status during preparation or processing stages". There are no preparation stages any more. A paid order is **Ready for pickup / Ready for delivery**, then **Out for delivery**, then **Completed**.
  - **Customer:** the customer chooses pickup or delivery and the **payment method**:
    - pickup: Cash at the counter, or GCash now;
    - delivery: GCash only, with the **₱50 delivery fee**.
- [ ] **pp. 77–78** (Payment and Billing flow):
  - "The Admin does not really manage the order process" — reword: the admin views payments and exports the payment log.
  - **Cashier:** records cash (amount received and change) or GCash (reference number), including cash-pickup orders paid when they are collected.
  - **Delivery Personnel paragraph:** "To also confirm the payment … hold delivery and notify the admin/cashier." Delivery orders are paid before a rider is assigned, so riders never check or collect payment. Replace it with: "Delivery personnel do not handle payment; only paid delivery orders are assigned to them."
- [ ] **p. 103** (ORDER table): "order status" — list the statuses the system uses: Awaiting payment (an online checkout being paid, hidden from staff), Ready for pickup, Ready for delivery, Out for delivery, Completed, Cancelled.

## 5. Inventory and production

- [ ] **p. 76** (Inventory flow): add these.
  - **Bread types:** products are **soft breads** (a daily standard, topped up at 5:00 AM) or **hard breads** (a minimum and a stop level).
  - **Production list:** it is built from those levels, raised for weekends (×2 from Thursday) and events (×4 a week ahead).
  - **Forecast check:** the list shows "+N more" when the forecast expects more than the plan.
  - **Stock:** it is deducted when an order is placed.
- [ ] **p. 90** (backlog): "the inventory monitoring module automatically updates stock levels based on completed transactions" — stock is updated when an order is **placed**, returned when an unpaid order is released or cancelled, and topped up each morning.

## 6. Security (pp. 95–97)

- [ ] **p. 95** (Session management): "expires after a defined period of inactivity … idle accounts are automatically logged out". That isn't what the system does. Replace it with:
  - sessions last up to 7 days with "Keep me logged in", or end when the browser closes;
  - every user can sign out from My Profile;
  - an administrator may trust a device for 30 days. Changing the password signs out every trusted device.
- [ ] **p. 95** (2FA): keep it, and add the trusted-device option.
- [ ] **p. 97** (Brute force): "After a defined number" — give the numbers: **5 failed attempts lock the account for 15 minutes**.
- [ ] **p. 96** (Password complexity): give the rule: **at least 12 characters**, with uppercase and lowercase letters, a number and a symbol; common passwords are refused.
- [ ] **Add a paragraph on phone and email verification:**
  - customers verify their mobile number with an SMS code (textbee) when registering, and confirm their email address before ordering;
  - for an advanced order, the customer's number is verified at the counter.

## 7. Database (pp. 99–110)

The paper lists the original core tables. The system has grown since, and the panel may compare the diagram with the live database.

- [ ] **ORDER (p. 104):** add **PaymentMode** (cash or GCash), **DeliveryFee**, **RequestedFulfillmentTime**, **IsReservation** (advanced order), and the guest name and contact for walk-in and advanced orders. Address is an **AddressID** pointing to CUSTOMER_ADDRESS, not a text field.
- [ ] **PRODUCT (p. 105):** add **StockType** (soft or hard).
- [ ] **INVENTORY (p. 108):** add **StandardStock** (soft breads) and **TargetStock** (the hard-bread stop level).
- [ ] **REPORT_LOG (p. 109):** it now records **exports** (a CSV downloaded or a PDF printed). **UserID** names whoever exported, admin or cashier; GeneratedBy (admin) stays for older rows.
- [ ] **Tables to add, briefly, at minimum:**
  - CUSTOMER_ADDRESS;
  - INVENTORY_MOVEMENT (the stock ledger: who, when, how many, why);
  - PAYMENT already has GatewayReference, so add **AmountTendered** (cash received);
  - EVENT (the events calendar);
  - FORECAST_RUN, FORECAST_MODEL and FORECAST (the forecast and its accuracy);
  - INGREDIENT and INGREDIENT_MOVEMENT;
  - DELIVERY_PROOF (the proof-of-delivery photos).
- [ ] **Redraw Figure 32** (relational diagram) with those tables, or say in the text that the diagram shows the core tables only.

## 8. Things to say at the mock defense

- **Accuracy of the forecast:** "The method is validated on assumed history. Its accuracy on Pecto's real sales will be measured once 56 days of real sales exist, when the system switches to them by itself." The on-screen figure is labelled "Method test (practice data)". Do not present it as the bakery's accuracy.
- **Why the cashier has no reports:** the seniors' consultation (2026-10-24/25) made reports and user records the admin's. The cashier's daily view is the Dashboard and the Payment log.
- **Why cash is allowed for pickup but not delivery:** the client refuses cash on delivery, because food refused at the door cannot be resold. A cash pickup is paid at the counter before it is handed over, and a customer can have only one unpaid cash order open at a time.
- **Demo data:** if you show the reports with the Demo data switch on, say so. The yellow "Includes demo data" banner is on screen while it is on.
