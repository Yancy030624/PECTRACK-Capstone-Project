# PAPER_FIX_REVISIONS.md — paper changes caused by the client's revisions

The client asked for changes on 2026-10-15 (`CLIENT_REVISIONS_PLAN.md`).
The team had already finished Parts A, B and the figures. This file lists
**only what the new changes alter**, phase by phase, so it can be applied
on top of that work.

- Each fix quotes the text to **find**. Page numbers are left out until the
  newest PDF has been checked, because they keep shifting.
- Figures to retake are listed per phase. Claude retakes them all at the
  end, after the last phase.

---

## R1 — Cashier edits stock directly; staff no GCash button; driver sees the items

### 1. Purpose and Description, Inventory Management Module

**Find:**
> To preserve data integrity and operational oversight, cashier access to this module is intentionally restricted. Cashiers may view product information and propose updates to stock quantities. However, all proposed modifications must undergo administrator approval before being applied to the live system. This approval-based workflow ensures that unauthorized or accidental modifications are prevented. Once a change is approved, the system updates the product information accordingly.

**Replace with:**
> Cashiers, who encode the bakery's stock, update stock quantities directly — recording restocks, losses, and recounts — while product names, prices, and minimum stock levels remain under the administrator's control. Every change is recorded in a stock movement history showing who made it, when, and why, so that changes stay accountable without slowing down daily work.

### 2. Scope, Inventory Management Module (the paragraph from Part B, B5)

**Find:**
> Cashiers cannot change stock directly; they submit stock corrections and loss reports (spoilage, damaged, expired, or production loss), which take effect only after the administrator approves them.

**Replace with:**
> Both administrators and cashiers update stock quantities directly, giving a reason for each change, while the minimum stock level of each product is set by the administrator.

R3 changes the loss reasons again; see that section when it is added.

### 3. Use case description, the Cashier paragraph (from Part A, A4)

**Find:**
> Cashiers can propose stock corrections and report losses, but a stock change takes effect only after the admin approves it.

**Replace with:**
> Cashiers also update stock levels directly, recording restocks, losses, and recounts; every change is kept in the stock history with the cashier's name.

### 4. Admin paragraph in the same use case description (from Part A, A4)

**Find:**
> …managing products, approving stock changes and bulk orders, generating reports…

**Replace with:**
> …managing products, approving bulk orders, generating reports…

### 5. Flowchart description, Inventory Management

**Find:**
> The Administrator reviews and approves or rejects the stock corrections and loss reports submitted by cashiers. The Cashier may view inventory information and submit such requests.

**Replace with:**
> The Administrator manages the product list and sets each product's minimum stock level. The Cashier updates stock quantities as deliveries arrive and losses occur.

### 6. Figure 11 (the cashier's inventory screen)

- **New caption:** Figure 11. Inventory Management — updating stock (cashier)
- **Replace the description with:**
  > The cashier opens a product with Edit and enters the new stock count. Whenever the count changes, a reason is required (restock, loss, or recount), with an optional note. The change is applied at once and recorded with the cashier's name.
- **Screenshot:** retake. The old one shows the removed "Propose a change" form.

### 7. Figure 10.1, if your team added it (Inventory Management, admin)

**Remove** from its description:
> The Change requests tab holds the cashiers' requests for the admin to approve or reject.

### 8. Figure 13 (Payment & Billing, cashier)

- The description stays.
- **Screenshot:** retake. The old one shows a "Pay with GCash" button, which staff no longer have; only customers pay online.

### 9. Delivery personnel — order items

- **Purpose and Description, Order Management:** "…view their assigned orders, including the customer's name, address, ordered items, quantity, and order time." This is now true as written. **No change.**
- **Figure 8 and Figure 2.2:** add one sentence to each description:
  > Each delivery also lists the ordered items and their quantities, so the delivery personnel can check the order before handing it over.
- **Screenshots:** retake both. The new ones show the items.

### Figures to retake after R1
11, 13, 8, 2.2 (and 10.1 if added).

---

## R2 — No refunds: a paid order can't be cancelled

### 1. Scope, Order Management Module (the paragraph from Part B, B6)

**Find:**
> Cashiers can cancel orders with a required reason, which restores the stock and refunds any payment. A customer may cancel their own order only while it is still Placed.

**Replace with:**
> An unpaid order can be cancelled with a required reason, which returns its stock to the shelf; a customer may cancel their own order only while it is still Placed and unpaid. The bakery does not give refunds, so once an order has been paid it can no longer be cancelled, and any problem with it is settled with the customer at the counter.

### 2. Scope, Payment and Billing Module (the paragraph from Part B, B7)

**Find:**
> Refunds are handled by the administrator; when a paid order is cancelled, an online payment is refunded automatically through PayMongo.

**Replace with:**
> The bakery does not give refunds, so a paid order cannot be cancelled. If a customer completes an online payment after their order was cancelled, the payment is still recorded and the order is flagged for the staff to settle with the customer.

### 3. Flowchart description, Payment and Billing (from Part B, B7)

**Find:**
> The Admin can record payments the same way as the Cashier, and is the only user who can issue refunds.

**Replace with:**
> The Admin can record payments the same way as the Cashier.

### 4. Figure 16 description, Reporting & Analytics, Sales (from Part B, B9)

**Find:**
> …then the orders placed, the amount ordered, the amount collected, and refunds for the period, followed by the sales chart.

**Replace with:**
> …then the orders placed, the amount ordered, and the amount collected for the period, followed by the sales chart.

**Screenshot:** retake. The old one shows a "Refunds issued" card.

### 5. If your team added the "Built, but not in the paper" list (Part C)

- **Find:** "Refunds, partial payments, balance due"
- **Replace with:** "Partial payments and balance due"

If your team listed refunds anywhere else as a feature, remove it there too.

### 6. Database chapter (Part F), PAYMENT table

The table still has `refunded_by`, `refunded_at`, `refund_reason` and `refund_reference`. They hold the history of refunds made before this change, and no new refund is ever written. Describe them in one sentence, or leave them out of the attribute list if your team prefers. The `REFUNDED` status also stays only for past records.

### Figures to retake after R2
16.

---

## R3 — No expiry; stock losses are "Reject"

The bakery does not track expiry. Bread past its best is toasted and sold again, or rejected. Only rejects are written down; burned or dropped bread is not recorded. The system no longer has expiry dates, shelf life, or an "Expired" status, and a stock loss has one reason: Reject.

### 1. Purpose and Description, Inventory Management

**Find:**
> Each product can have an expiration date; the menu shows only products that are available and not expired, and expired stock cannot be ordered.

**Replace with:**
> The menu shows only products that are available, and a product cannot be ordered beyond the stock on hand.

### 2. Scope, Inventory Management Module

This replaces the R1 change to the same paragraph, so apply R1 item 2 first, or apply this directly to the paragraph as it is in the paper now.

**Find:**
> …assigning each product a name, description, category, unit price, availability status, shelf life, and product image.

**Replace with:**
> …assigning each product a name, description, category, unit price, availability status, and product image.

**Find** (the paper's current text):
> Cashiers cannot change stock directly; they submit stock corrections and loss reports (spoilage, damaged, expired, or production loss), which take effect only after the administrator approves them.

Or, if R1 item 2 is already applied:
> Both administrators and cashiers update stock quantities directly, giving a reason for each change, while the minimum stock level of each product is set by the administrator.

**Replace with:**
> Both administrators and cashiers update stock quantities directly, giving one of three reasons for each change: a restock, a reject, or a recount. Rejected bread is the only loss the bakery records. The minimum stock level of each product is set by the administrator.

**Find:**
> Each product is given a status -- Good, Running low, Low stock, or Expired -- and the list can be filtered by status…

**Replace with:**
> Each product is given a status -- Good, Running low, or Low stock -- and the list can be filtered by status…

### 3. Figure 2 / 2.1 description, the dashboard tiles

**Find:**
> …Low stock, Running low, Expired stock, Orders to prepare…

**Replace with:**
> …Low stock, Running low, Orders to prepare…

### 4. Figure 9 description, Menu (customer)

**Find:**
> Products that are unavailable or expired are not offered.

**Replace with:**
> Products that are unavailable are not offered.

### 5. Reporting and Analytics Module, the Inventory tab line

**Find:**
> Inventory: stock movements, losses, and products currently low on stock.

**Replace with:**
> Inventory: stock movements, rejects, and products currently low on stock.

### 6. Earlier Part A / Part B texts, if your team used them

- Part A, R4 (Customer Management, p. 26): "Products are unavailable to customers when it's currently expired. The system automatically displays only products that are currently available and hides expired or unavailable items…" — **replace with:** "The system automatically displays only products that are currently available and hides unavailable items."
- Part A (the Product Availability Calendar): if your team kept "…to view product availability and expiration periods", remove "and expiration periods".
- Part B, the Inventory flowchart description: if your team used "If stock is insufficient, or the product has expired, the order is refused…", remove ", or the product has expired".
- Figure 10 / 10.1 descriptions: if a description lists "expiration date" among the inventory columns, remove it.

### 7. Database chapter (Part F)

- **INVENTORY:** remove `expiration_date` from the attribute list.
- **PRODUCT:** remove `shelf_life_days` from the attribute list.
- **INVENTORY_MOVEMENT:** the reason list gains `REJECT`. `SPOILAGE`, `PRODUCTION_LOSS`, `EXPIRED` and `DAMAGED` stay only for records made before this change. Say this in one sentence, or list only `ORDER_PLACED`, `ORDER_CANCELLED`, `RESTOCK`, `REJECT` and `CORRECTION`.

### Figures to retake after R3
2, 2.1 (no Expired tile), 10 and 10.1 (no Expiry column, the new reasons), 11 (the reasons list).

---

## R4 — Daily order numbers, recent orders, new-order alerts, cleaner dashboards

Orders are now numbered #1, #2, #3… each day, starting again at #1 the next day. Staff see a Recent orders list and are alerted to each new order; delivery personnel are alerted to each new delivery assigned to them. The Dashboard shows only what needs action.

### 1. Purpose and Description, Order Management Module

**Find:**
> This ensures that the order is reflected in the system in real time, preventing conflicts or discrepancies with the inventory.

**Replace with:**
> This ensures that the order is reflected in the system in real time, preventing conflicts or discrepancies with the inventory. Each order receives a daily order number (#1, #2, #3…) that starts again at #1 every day, so staff and customers can call out an order easily. The administrator and cashiers are alerted as soon as a new order is placed, through a notification bell, a pop-up message, and an optional sound, even while they are working in another part of the system.

### 2. Scope, Order Management Module

**Find:**
> An order queue displays all active orders progressing through the stages of Order Placed, Confirmed, In Production, Out for Delivery or Ready for Pickup, and Completed.

**Replace with:**
> Each order is given a daily order number that starts again at #1 every day. An order queue displays all active orders progressing through the stages of Order Placed, Confirmed, In Production, Out for Delivery or Ready for Pickup, and Completed, and new orders are announced to the administrator and cashiers as they arrive.

### 3. Figure 2 / 2.1 description, the Dashboard

This replaces the whole description, including the R3 change to its tile list. It also removes the stray "nd clear typography…" fragment at its end.

**Replace the description with:**
> The Dashboard of the admin and cashier opens with a greeting that states how many things need attention, beside today's number of orders, the amount ordered, and the amount collected. "Needs action now" shows only the status tiles that need attention, red first and then yellow: Low stock, Running low, Orders to prepare (red when an order is past its requested time), Deliveries to assign, Bulk orders to approve (admin only), Unpaid balances, and Likely to sell out (from the sales forecast). The tiles that are fine fold into one "All good" line. Clicking a tile opens the module already filtered to the problem. Below it, "Recent orders" lists the eight newest orders with their number, time, customer, pickup or delivery, total, payment, and status, and refreshes on its own; clicking one opens it. A "Restock first" list shows the five products furthest below their minimum stock level. The bell at the top of every staff screen counts the new orders not yet seen, and a pop-up appears for each new order.

### 4. Figure 2.2 description, delivery personnel

**Find:**
> Delivery personnel have no separate dashboard; after signing in they land on My Deliveries, built for use on a phone.

**Replace with:**
> Delivery personnel have no separate dashboard; after signing in they land on My Deliveries, built for use on a phone. Deliveries already on the road are listed first under "To deliver now", followed by those "Assigned to you", and the bell announces each newly assigned delivery.

(If your team already added the R1 sentence about the order items, keep it.)

### 5. Figure 6 description, Order Management (admin)

**Find:**
> The admin's Order Management page lists the orders with their customer, date placed, requested time, total, and status, and can be searched and filtered by status.

**Replace with:**
> The admin's Order Management page lists the orders by their daily order number with their customer, date placed, requested time, total, and status, and can be searched by order number or customer and filtered by status.

### 6. Figure 13 description, Payment & Billing (cashier)

**Find:** "…such as Order ID, Customer Name…"
**Replace with:** "…such as Order No., Customer Name…"

(Figure 13 is already being retaken for R1; the old description of that screen is checked again in the PDF review.)

### 7. Development / modules list (the dashboard sentence, two places)

**Find:**
> The dashboard module provides an overview of daily transactions, inventory status, low-stock notifications, and quick access to important system functions.

**Replace with:**
> The dashboard module provides an overview of daily transactions, what needs action now, the most recent orders, and low-stock notifications, with an alert for every new order.

**Find:**
> The dashboard module provides an overview of daily transactions, inventory status, and system notifications.

**Replace with:**
> The dashboard module provides an overview of daily transactions, inventory status, recent orders, and new-order notifications.

### 8. Database chapter, ORDER table

**Attributes — add after OrderDate:**
- OrderDay
- DailyNumber

**Add one sentence to the table description:**
> DailyNumber is the order's number within its day (OrderDay); it starts again at 1 every day, and the pair is unique.

If your team lists every table, add:

**DAILY_ORDER_NUMBERS TABLE** — keeps the last order number given out on each day, so two orders placed at the same moment never get the same number.
- Primary Key: Day
- Attributes: Day(PK), LastNumber

### Figures to retake after R4
2, 2.1, 2.2, 6, 7, 8, 12, 13, 14 — every screen that shows an order number or the Dashboard. Add a screenshot of the bell with a new-order pop-up if your team wants to show it.

---

## R5 — Ingredient stock

The system now counts the bakery's ingredients (flour, sugar, eggs and the rest) as well as its products. This is **stock only**: there are no recipes, no production batches, no costing, and nothing is deducted from ingredients automatically when bread is baked or sold. Staff record what came in, what was used, what was thrown out, and recounts.

**Tell the adviser:** the adviser earlier ruled raw-material tracking out of scope. The client asked for ingredient stock at the 2026-10-15 consultation, so it is back, limited to stock counts. Recipes and production costing stay out of scope.

### 1. Purpose and Description, Inventory Management Module (new paragraph)

**Add after the paragraph about stock levels (after the R1 and R3 changes):**
> The module also keeps the stock of the bakery's ingredients, such as flour, sugar, and eggs, each measured in its own unit (for example kilograms, packs, or trays). Administrators and cashiers record each change: a restock when supplies are delivered, the amount used in baking, the amount rejected or thrown out, or a correction after a recount. Every change is kept in a history showing who made it and when, and an ingredient that falls to or below its minimum level is flagged as running low. Ingredient stock is recorded by staff; the system does not deduct ingredients automatically from the products baked or sold.

### 2. Scope, Inventory Management Module (new paragraph)

**Add after the paragraph from R3 item 2:**
> Ingredient stock is kept separately from product stock. The administrator adds the ingredients the bakery uses and sets each one's unit and minimum level; administrators and cashiers record restocks, usage, rejects, and recounts, and the system refuses any change that would take an ingredient's stock below zero. Each ingredient is shown as Good, Running low, or Low stock, in the same way as products.

### 3. Figure 2 / 2.1 description, the Dashboard

In the R4 replacement text, **find:**
> …Low stock, Running low, Orders to prepare…

**Replace with:**
> …Low stock, Running low, Ingredients running low, Orders to prepare…

### 4. Reporting and Analytics Module, the Inventory tab line

This replaces R3 item 5.

**Find:**
> Inventory: stock movements, losses, and products currently low on stock.

**Replace with:**
> Inventory: stock movements, rejects, and products currently low on stock, plus each ingredient's restocks, usage, rejects, and recounts for the period and the ingredients currently low.

### 5. Limitations (new item, after item 1)

> **Ingredient tracking.** The system records ingredient stock as entered by the staff — deliveries, usage, rejects, and recounts. It does not hold recipes, so it does not deduct ingredients automatically when products are baked or sold, and it does not compute production costs.

If your team ever added a sentence saying the system "does not track raw materials" or "inventories finished products only", replace it with this item.

### 6. Review of related literature (no change)

Cruz, Mendoza, and Dela Cruz (2022) is criticised for lacking "ingredient inventory management". The system now has it (stock only), so that gap supports this study. **No change is needed.**

### 7. Database chapter (two new tables)

**INGREDIENT TABLE** — records each ingredient the bakery keeps in stock, its unit of measure, the amount on hand, and the minimum level that marks it as running low.
- Primary Key: IngredientID
- Attributes: IngredientID(PK), Name, Unit, StockQuantity, MinStockLevel, IsActive, CreatedAt, UpdatedAt

**INGREDIENT_MOVEMENT TABLE** — records every change in an ingredient's stock: who made it, when, by how much, and why (Restock, Usage, Reject, or Correction). The changes for an ingredient always add up to its stock on hand.
- Primary Key: MovementID
- Foreign Keys: IngredientID - INGREDIENT(IngredientID); ChangedBy - USER(UserID)
- Attributes: MovementID(PK), IngredientID(FK), ChangedBy(FK), QuantityChange, Reason, Note, CreatedAt

Add both to the ERD: INGREDIENT 1 — many INGREDIENT_MOVEMENT, and USER 1 — many INGREDIENT_MOVEMENT.

### 8. New figure (suggested)

**Figure 11.1. Inventory Management — Ingredients**
> The Ingredients tab lists each ingredient with the amount on hand and its unit, the minimum level, and a colour-coded status, and can be filtered by status. Record opens a short form to log a restock, usage, a reject, or a recount, with an optional note. Below the list, the history shows every change with who made it and when. The administrator can also add ingredients and change their name, unit, and minimum level.

### Figures to retake after R5
2, 2.1 (the new tile), 10 / 10.1 and 11 (the Products and Ingredients tabs), the new 11.1, and the Reporting Inventory tab if your team shows it.

---

## Notifications (N1–N6) — after the classmate test, 2026-10-15

From `NOTIFICATIONS_PLAN.md`. Staff and delivery personnel are now told about more than new orders; delivery personnel and customers are also told by email; marking a paid order delivered completes it; and delivery personnel can call or text the customer from the delivery card. Password fields gained a Show/Hide button, which needs no paper change.

The **Find** texts below are quoted from the revised PDF. Where an R4 replacement is named instead, apply this change on top of it.

### 1. Purpose and Description, the Delivery Personnel paragraph (Order Management Module)

**Find:**
> Additionally, they can review their delivery history and completed transactions.

**Replace with:**
> Additionally, they can review their delivery history and completed transactions. Delivery personnel are told of each newly assigned delivery through the notification bell and by email, and they can call or text the recipient straight from the delivery card. Once they mark a paid order as delivered, the order is completed automatically, and the customer receives an email saying when and where it was delivered, so a delivery made to the wrong house is reported the same day.

### 2. Purpose and Description, Order Management Module (on top of R4 fix 1)

**Find** (the sentence R4 added):
> The administrator and cashiers are alerted as soon as a new order is placed, through a notification bell, a pop-up message, and an optional sound, even while they are working in another part of the system.

**Replace with:**
> The administrator and cashiers are alerted through a notification bell, a pop-up message, and an optional sound, even while they are working in another part of the system, when a new order is placed, an online payment arrives, an order is cancelled, and a delivery leaves the bakery, is delivered, or fails. Customers are emailed when their pickup order is ready and when their delivery is on the way, delivered, or could not be delivered.

### 3. Figure 2 / 2.1 description, the bell (on top of R4 fix 3)

**Find** (the last sentence of the R4 description):
> The bell at the top of every staff screen counts the new orders not yet seen, and a pop-up appears for each new order.

**Replace with:**
> The bell at the top of every staff screen counts the notifications not yet seen — new orders, online payments, cancellations, and deliveries leaving, arriving, or failing — and a pop-up appears for each one. Clicking a notification opens the order or the delivery it is about.

### 4. Figure 2.2 description, delivery personnel (on top of R4 fix 4)

**Find:**
> and the bell announces each newly assigned delivery.

**Replace with:**
> and the bell announces each newly assigned delivery, which is also sent to them by email.

### 5. Figure 8 description, Delivery in progress

**Find:**
> accepts up to five JPEG or PNG photos, a "Mark delivered" button, and a "Mark failed" button with a field for the reason.

**Replace with:**
> accepts up to five JPEG or PNG photos, a "Mark delivered" button, and a "Mark failed" button with a field for the reason. Call and Text buttons open the phone's dialer or messages app for the recipient; when the account holder's number is different, it is offered too, with a link to call the bakery. Marking a paid order delivered also completes the order.

### 6. Use case description, the Delivery Personnel paragraph

**Find:**
> Delivery orders are paid before they leave the bakery, so delivery personnel do not collect payments.

**Replace with:**
> Delivery orders are paid before they leave the bakery, so delivery personnel do not collect payments. They are notified of each new assignment in the system and by email, can call or text the customer from the delivery card, and complete the order by marking it delivered.

### 7. Use case description, the Customer paragraph

**Find:**
> They can also cancel orders.

**Replace with:**
> They can also cancel orders, and they are emailed when a pickup order is ready and when a delivery is on the way, delivered, or could not be delivered.

### 8. Limitations (new item, after item 2, Internet Dependency)

> **Notifications.** Notifications inside the system appear only while it is open in a browser; the system does not send push notifications to phones. For this reason, delivery personnel are also notified of new assignments by email, and customers are emailed about their orders. A delivery that the administrator takes back from a driver simply leaves that driver's list; the driver is not separately notified.

### 9. Database chapter

**No change.** Notifications are built from records the system already keeps (order times, payment times, delivery times, and the order status history); no table was added.

### Figures to retake after the notifications changes
8 (the Call and Text buttons), and 2 / 2.1 if the bell panel is shown open.

---

## Adviser revision A1 — first and last name, required fields marked (2026-10-16)

The adviser asked for the Create Account form to ask for a **first name and a last name** instead of one full name, both saved separately, and for every required field to be marked with an asterisk (*), explained by a "* Required field" legend, and checked both on the form and at the server. Existing accounts were kept: their full name was split once into the two parts (migration 026), and nobody has to register again. Staff accounts still have one name.

### 1. Figure 1.1 description, the registration page

**Find:**
> The form asks for the customer's full name, username, contact number, email address, password, and password confirmation, and requires agreement to the Terms of Service and Privacy Policy.

**Replace with:**
> The form asks for the customer's first name, last name, username, contact number, email address, password, and password confirmation, and requires agreement to the Terms of Service and Privacy Policy. Every field is required: each is marked with an asterisk (*), explained by a "* Required field" note at the top of the form, and a field left empty is named below itself before the form is sent. The server checks the same fields again, so they cannot be skipped.

### 2. Figure 5.1 description, the customer's My Profile

**Find:**
> Profile section shows the username and lets the customer update their full name and contact number.

**Replace with:**
> Profile section shows the username and lets the customer update their first name, last name, and contact number.

### 3. Customer Management Module (scope paragraph)

**Find:**
> including basic personal details such as name, contact number, address, and email address.

**Replace with:**
> including basic personal details such as first and last name, contact number, address, and email address.

### 4. Database chapter, CUSTOMER table

**Find** (in the description):
> name, contact number, and email address

**Replace with:**
> first name, last name, contact number, and email address

**Attributes — replace `Name` with:**
- FirstName
- LastName
- Name

**Add one sentence to the table description:**
> Name is the customer's full name, built by the database from FirstName and LastName and kept in step with them, so receipts and reports show the full name.

(The paper's attribute list also shows `Address`, which lives in CUSTOMER_ADDRESSES; leave that to the team's own Part F decision.)

### Figures to retake after A1
1.1 (the registration page), 5.1 (My Profile, customer), and the ERD if it lists the CUSTOMER attributes.

---

## Adviser revision A2 — no admin approval for large orders (2026-10-16)

The adviser asked to remove the "Orders over [100] items need an admin's approval" setting. It was the only thing that ever made an order wait for approval, so the whole bulk-order approval step is gone (migration 027): a large order is an ordinary order that staff confirm and that can be paid at once. The "Bulk orders to approve" Dashboard tile is gone too. The Background's interview passage about orders over 100 items describes the bakery's problem, not the system, and stays.

### 1. Purpose and Description, Order Management Module

**Find:**
> The system supports advance ordering, bulk order requests requiring administrator approval, and order tracking to streamline bakery operations. A bulk order must first be approved by the administrator before it can be paid, and a bulk delivery order is confirmed only once it is paid in full.

**Replace with:**
> The system supports advance ordering, including large orders for fiestas and events, and order tracking to streamline bakery operations. A delivery order is confirmed only once it is paid in full.

### 2. Figure 2 / 2.1 description, the Dashboard tiles (on top of R4 fix 3)

**Find:**
> Deliveries to assign, Bulk orders to approve (admin only), Unpaid balances,

**Replace with:**
> Deliveries to assign, Unpaid balances,

### 3. Figure 6 description, Order Management (admin)

**Find:**
> At the top, the admin sets the item count above which an order counts as a bulk order and needs the admin's approval.

**Delete this sentence.**

### 4. Use case description, the Admin paragraph

**Find** (the revised PDF's wording):
> managing products, approving stock changes and bulk orders, generating reports,

**Replace with:**
> managing products, generating reports,

(If your team already applied R1's wording "…managing products, approving bulk orders, generating reports…", replace that with the same text. The cashier now changes stock directly, R1.)

### 5. Objectives / Scope

If any objective or scope item still promises "bulk order requests requiring administrator approval", remove that phrase the same way as fix 1.

### 6. Database chapter

**No change** unless your ERD shows `RequiresAdminApproval` on ORDER or an APP_SETTINGS table; if it does, remove them.

### Figures to retake after A2
2 / 2.1 (if the Bulk orders tile shows), and 6 (Order Management, admin — the setting row is gone).

---

## Adviser revisions A3–A6 — receipt after payment, automatic production, order dates and hours (2026-10-16)

- **A3:** after a successful GCash payment, PayMongo sends the customer straight to the order's receipt. The page confirms the payment with the server and shows a loading state while it waits; nothing is marked paid just by opening it. "Pay now" on the Order placed page now opens GCash directly.
- **A4:** no confirmation step. A pickup order goes into **In Production** as soon as it is placed. A delivery order goes into In Production as soon as it is paid in full (it still waits as Placed until then, since there is no cash on delivery). A later status is never overwritten. A customer can cancel only an order that is still Placed, which now means an unpaid delivery order.
- **A5–A6:** orders can be for today or a later day (up to 30 days ahead), between **5:00 AM and 10:00 PM** inclusive, Asia/Manila time, for pickup, delivery and walk-in orders, on the form and at the server. An order "for now" can be placed only within those hours.

The bakery's opening hours on the storefront (5:00 AM – 8:00 PM) are a separate fact and were not changed. If the paper states the bakery's hours as the ordering hours anywhere, it now has to use 5:00 AM – 10:00 PM for ordering.

### 1. Scope, Order Management Module (the stages)

**Find:**
> An order queue displays all active orders progressing through the stages of Order Placed, Confirmed, In Production, Out for Delivery or Ready for Pickup, and Completed.

(If your team applied R4, the sentence starts "Each order is given a daily order number…"; change the same list inside it.)

**Replace the list with:**
> …progressing through the stages of Order Placed, In Production, Out for Delivery or Ready for Pickup, and Completed. A pickup order enters In Production as soon as it is placed, and a delivery order as soon as it is paid in full, with no separate confirmation step. Orders can be for today or a later day, up to 30 days ahead, between 5:00 AM and 10:00 PM.

### 2. Order Management flowchart description (the Cashier and Customer paragraphs)

**Find:**
> Once the order is confirmed, the system records the order and assigns an initial order status.

**Replace with:**
> Once the order is submitted, the system records it and sets its status: a pickup order goes straight into production, and a delivery order waits for payment.

**Find:**
> The system records the order and displays the order status, allowing the customer to track the progress of their purchase.

**Replace with:**
> The customer may choose a date and time for the order, from today up to 30 days ahead, between 5:00 AM and 10:00 PM. The system records the order and displays the order status, allowing the customer to track the progress of their purchase.

### 3. Payment and Billing flowchart description

**Find:**
> If the payment is successful, the system updates the payment status and confirms the order.

**Replace with:**
> If the payment is successful, the system updates the payment status, sends a fully paid delivery order into production, and shows the customer the receipt at once.

### 4. Payment and Billing scope (the receipt sentence)

**Find:**
> The module automatically generates a digital receipt per transaction showing itemized amounts and the total, and maintains a full payment history viewable per order.

**Replace with:**
> The module automatically generates a digital receipt per transaction showing the order number, the customer, the itemized amounts and the total, the payment method and status, and the transaction reference; after an online payment the customer is taken straight to it. It also maintains a full payment history viewable per order.

### 5. Figure 15 description, Checkout

**Find:**
> The customer may add special instructions and a requested date and time.

**Replace with:**
> The customer may add special instructions and a requested date and time: the date picker starts at today and the time runs from 5:00 AM to 10:00 PM.

**Find (Figure 15.1):**
> The customer pays online beforehand from My Payments, or at the counter when collecting the order.

**Replace with:**
> The order goes into production as soon as it is placed. The customer pays online beforehand, or at the counter when collecting the order.

### 6. New figure (suggested)

**Figure 15.2. Receipt after payment (customer)**
> After paying with GCash the customer lands directly on the receipt: the bakery's name, the order number and date, the customer's details, the items with quantities and prices, the total, the payment method, status and transaction reference, with a button to print it or save it as PDF. While GCash is still confirming, the page says so and checks again on its own.

### 7. Use case description, the Customer paragraph

**Find:**
> They can also cancel orders,

**Replace with:**
> They can also cancel an order that is still waiting for payment,

(If your team already applied the Notifications fix 7 to this sentence, keep the email part after it.)

### 8. Database chapter

**No change.** The order statuses are the same list; `Confirmed` is simply no longer used for new orders.

### Figures to retake after A3–A6
6 / 7 (Order Management: status choices without Confirmed), 15 and 15.1 (Checkout: the new date and time pickers), the new 15.2 (receipt), and the Order placed page if shown.

---

## Adviser revisions A7–A10 — fewer clicks: order numbers, status buttons, old orders, Walk-in page (2026-10-16)

The adviser's aim: users should not have to click through extra buttons or pages, and statuses should move on their own.

- **A7 — order numbers:** orders show their permanent number again (#21170), unique for good. This **reverses R4's daily numbers** (#1, #2… each day) on screen, in emails and on PayMongo; the daily number is still kept in the database but no longer shown.
- **A8 — status buttons:** in Order Management the status filter is a row of buttons (Open, Waiting for payment, In production, Ready for pickup, Out for delivery, Completed, Cancelled, All) with counts, and "Confirmed" is gone. The status dropdown in an order's detail is replaced by the one or two actions still done by hand: **Ready for pickup**, **Picked up — complete**, and **Cancel order** (unpaid orders only, with a reason). Everything else moves on its own.
- **A9 — old orders close themselves:** an order whose day has passed (the day it was needed, or the day it was placed) and that is still open is closed by the system within 15 minutes: **completed** if paid in full, **cancelled** if nothing was paid. A cancelled order that was never baked returns its stock; one already baked does not. Part-paid orders and orders out for delivery are left for staff. The status history shows these changes as made by "System" (migration 028).
- **A10 — Walk-in page:** the cashier's "New order" tab is now **Walk-in**. It asks only for the items and, if it is for later, the date and time. No customer account, no pickup/delivery choice, no special instructions: every order placed there is a walk-in pickup.

### 1. Undo R4's daily order numbers (R4 fixes 1, 2, 5 and 8)

- **R4 fix 1 / 2:** remove the sentences "Each order receives a daily order number (#1, #2, #3…) that starts again at #1 every day, so staff and customers can call out an order easily." and "Each order is given a daily order number that starts again at #1 every day."
- **R4 fix 5 (Figure 6):** "lists the orders by their daily order number" → "lists the orders by their order number".
- **R4 fix 8 (Database, ORDER table):** leave OrderDay and DailyNumber in the attribute list only if your ERD lists every column; replace the sentence about them with:
  > DailyNumber and OrderDay are kept for the bakery's records; the order number shown to people is the OrderID.

### 2. Scope, Order Management Module (on top of A3–A6 fix 1)

**Add after the stages sentence:**
> Staff filter the orders with one-click buttons by stage. The only status changes done by hand are marking a pickup order ready and picked up, and cancelling an unpaid order; an order whose day has passed and that is still open is closed automatically, completed if paid and cancelled if not.

### 3. Figure 6 description, Order Management (admin)

**Find:**
> and can be searched and filtered by status.

**Replace with:**
> and can be searched by order number or customer and filtered with one-click status buttons, each showing how many orders it holds.

**Find:**
> A status can only move forward; cancelling requires a reason.

**Replace with:**
> Instead of choosing a status from a list, staff press the one action left to do — Ready for pickup, Picked up, or Cancel order (unpaid orders only, with a reason); every other step happens on its own.

### 4. Figure 7 description, Order Management (cashier)

**Find:**
> The cashier's Order Management page has two tabs: Orders, the same searchable order list and detail as the admin's, and New order, for orders taken at the counter.

**Replace with:**
> The cashier's Order Management page has two tabs: Orders, the same searchable order list and detail as the admin's, and Walk-in, for customers at the counter. Walk-in asks only for the items and, if the order is for later, the date and time; every walk-in order is a pickup with no customer account.

### 5. Order Management flowchart, the Cashier paragraph

**Find:**
> The Cashier selects the customer record and adds products to the order.

**Replace with:**
> The Cashier adds the products the walk-in customer wants to the order.

### 6. Database chapter

- **ORDER_STATUS_HISTORY:** "UpdatedBy is empty when the system made the change, such as closing an order whose day has passed."
- **INVENTORY_MOVEMENT:** the same note for ChangedBy.

### Figures to retake after A7–A10
6 and 7 (status buttons, action buttons, the Walk-in tab), and every figure that shows an order number (it is #21170-style again).

---

## Adviser revisions A11–A17 — payment first, no production (2026-10-16)

Plan and decisions: `RULES-PLANS/PAYMENT_FIRST_PLAN.md`. The bakery bakes its day's stock before opening and is paid before it hands anything over, for walk-in, pickup and delivery alike.

- **A11:** the Production module (the "Due today" schedule) is removed.
- **A12:** no "In production" status anywhere.
- **A13:** the Dashboard's "Orders to prepare" tile opens Order Management on Today.
- **A14/A17:** no unpaid orders. A paid order starts as **Ready for pickup** (pickup and walk-in) or **Ready for delivery**; then Completed (picked up), or Out for delivery and Completed (delivered). "Placed", "Waiting for payment", "In production" and "Cancelled" are no longer shown. A paid order cannot be cancelled. Online, "Place order" goes straight to GCash; the order is held for 15 minutes, hidden from staff, and let go if not paid — the customer can also cancel it from the payment page. At the counter, the Walk-in page takes cash (with change shown) or a GCash reference before the order is saved.
- **A15:** the "Unpaid balances" tile and Payment & Billing's "Still owed" view are removed.
- **A16:** Order Management has Today / Upcoming / Past buttons, by the day the order is picked up or delivered (a reserved order shows under Upcoming until its day).
- Storefront hours are 5:00 AM – 10:00 PM.

### 1. Purpose and Description, Order Management Module

**Replace the stages and the production/bulk sentences with:**
> Every order is paid first. An online order is placed when the customer pays with GCash; an unpaid checkout is held for 15 minutes and then released. Walk-in orders are paid in cash or GCash at the counter as they are rung up. A paid order is immediately Ready for pickup or Ready for delivery, since the bakery bakes its stock before opening, and it is then Completed when picked up, or Out for delivery and Completed when delivered.

### 2. Scope, Order Management Module (the stages)

**Find** the stages list ("Order Placed, … In Production, … Completed").
**Replace with:**
> …progressing through the stages of Ready for Pickup or Ready for Delivery, Out for Delivery, and Completed. Staff filter orders by day (Today, Upcoming, Past — by the day the order is picked up or delivered) and by stage with one-click buttons.

Remove any sentence about orders being confirmed, entering production, or being cancelled by staff.

### 3. Production module / Due today

Remove every mention of a Production module, the "Due today" production schedule, and its figure, from the module list, the scope, the use cases and the figures. The Forecast in Reporting & Analytics stays ("how much of each product to bake" is a planning aid for the morning bake, not a production module).

### 4. Payment and Billing Module

**Find:**
> Walk-in transactions are handled by the cashier, who records cash or GCash payments directly within the system. For pick-up orders, customers have the option to pay either through cash or online payment, with the transaction processed once the order is finalized in the system.

**Replace with:**
> Every transaction is paid first. Walk-in orders are paid at the counter, in cash (the system shows the change) or GCash by its reference number, as the order is rung up. Online pickup and delivery orders are paid with GCash through PayMongo when they are placed; an order is only placed once it is paid.

Remove "and an order cannot be marked as completed until it is fully paid" if it reads as though unpaid orders exist, and any mention of "unpaid balances" or "outstanding" amounts.

### 5. Figure 2 / 2.1 (Dashboard)

Remove "Unpaid balances" from the tile list. "Orders to prepare" counts today's paid orders still to hand over or send out, red when one is past its requested time, and opens Order Management on Today.

### 6. Figures 6, 7 (Order Management), 13 (Payment & Billing), 15 (Checkout)

- Figure 6: Today / Upcoming / Past and status buttons; the only hand action is "Picked up — complete".
- Figure 7: the Walk-in tab takes the payment (Cash with change, or GCash reference) before "Place paid order".
- Figure 13: no "Still owed" view; the list of orders with their receipts, and the payment log.
- Figure 15: the button is "Place order and pay with GCash"; there is no pay-at-pickup option online.

### 7. Use case and flowcharts

- Customer: places an order and pays with GCash in one step; can cancel only before paying.
- Cashier: rings up a walk-in order and takes its payment in the same step; marks pickup orders picked up.
- Payment flowchart: payment happens before the order exists as a placed order; a failed or abandoned online payment releases the order after 15 minutes.

### 8. Database chapter

- ORDER: Status values are now Ready for pickup, Ready for delivery, Out for delivery, Completed (plus Awaiting payment for a checkout being paid; older rows may still hold Placed, Confirmed, In production, Cancelled).

### Figures to retake after A11–A17
2 / 2.1 (Dashboard tiles), 6 and 7 (Order Management, Walk-in with payment), 13 (Payment & Billing), 15 / 15.1 (Checkout), 15.2 (receipt and the pay-or-cancel page), and remove the Production figure.

### A16 revised (2026-10-16, after the user's review)

- Order Management's day filter is **Today**, **Upcoming**, and a **Date** picker for one day (from today on). There is no "Past": finished days are history, kept in Payment & Billing (receipts) and the reports.
- Statuses shown: **Ready for pickup**, **Ready for delivery**, **Out for delivery** (from the driver's phone), **Completed**. No Placed, Confirmed or In production.
- The assumed (synthetic) sales history behind the forecast is no longer listed in Order Management or Payment & Billing; it stays in the database for the Forecast and stays out of sales reports.
- Past test orders were deleted from the live and local databases on 2026-10-16 (`scripts/delete-past-test-orders.sql`, after a full backup).

In fix 2 of A11–A17, replace "Today, Upcoming, Past" with "Today and Upcoming, or one chosen date".

### Screen fixes after review (2026-10-16)

- Dashboard: the tile "Orders to prepare" is now **Orders**.
- Order Management (staff): the order detail no longer lists the status history.
- Checkout: the button is **Place Order** (it still opens GCash at once).
- Payment & Billing, Billing tab: **Ready for pickup** / **Completed** filter buttons; Ready for pickup shows when each order is needed by. No Status or Owed column, no cancelled orders.
- Payment & Billing, Payment log: paid payments only; no Status filter or column.

Figure 13 (Payment & Billing) and Figure 15 (Checkout button) descriptions follow these.

### Dashboard and Inventory after review (2026-10-16)

- Dashboard, below "Needs action now": **Restock first** and **Needed by** side by side, then **Recent orders**. Needed by lists the paid orders still to be picked up or delivered, soonest first, with their time (red when late); each opens the order in Payment & Billing.
- Inventory Management: under the Status buttons, **Category** buttons (All categories and one per category, with counts).

Figures 2 / 2.1 (Dashboard) and 10 / 11 (Inventory) descriptions follow these.
- Payment & Billing, Billing tab: a third button, **Ready for delivery** (with Needed by). Out for delivery is not listed there; the order shows again once Completed. (2026-10-16)
- Customer My Orders: the order detail no longer lists the status history either. (2026-10-16)
