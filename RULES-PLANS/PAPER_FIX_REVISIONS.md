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
