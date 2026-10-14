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
