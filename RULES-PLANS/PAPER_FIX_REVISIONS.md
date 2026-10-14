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
