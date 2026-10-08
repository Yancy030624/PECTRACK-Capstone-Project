# PAPER_FIGURES.md — replacing the mockup figures with the real system

For `docs/PECTRACK_REVISED.pdf`, Scope section (pp. 21–44). Each early
mockup image is replaced by a screenshot of the system. The screenshots
are in `docs/paper-figures/`. They were captured on 2026-10-08 from the
running system with the demo data, at 1440×900 for desktop screens and
390×844 for the delivery personnel's phone screens.

How to use this file, for each figure:
1. In Word, right-click the old image → **Change Picture** → choose the
   file listed below. This keeps the figure's place and caption.
2. Replace the **caption**. The figures now show the built system, so
   drop "Proposed … design".
3. Replace the **description paragraph** under the figure with the text
   given here.

This file **supersedes** the figure-description parts of
`PAPER_FIX_PART_B.md`: the "Figures 3 to 5.3 are early mockups"
sentence, the Figure 14 "early mockup" text, and the Figure 6, 8, 11, 15
and 17 edits. The text fixes for each module's summary paragraph and the
flowcharts still come from Part B.

Optional new figures (1.3, 7.1, 7.2, 10.1, 16.1) show features the paper
describes but never pictured. If you add them, also add them to the List
of Figures.

---

## Login

### Figure 1 — `fig-01-login.png`
**Caption:** Figure 1. Customer sign-in

**Description:**
> Sign-in opens as a pop-up window over the bakery's website, so the visitor never leaves the page they were on. The left panel carries the Pecto's Bakery logo and a "Continue browsing" button; the right panel holds the form. Customers sign in with their username or email address and password, may tick "Remember me" to stay signed in on that device, and can request a password reset link through "Forgot password?". Below the Log In button are a "Create account" button and a separate "Staff sign in" entrance for the admin, cashiers, and delivery personnel; each entrance refuses the other kind of account.

### Figure 1.1 — `fig-01.1-register.png`
**Caption:** Figure 1.1 Customer registration

**Description:**
> The registration form asks for the customer's full name, username, contact number, email address, password, and password confirmation, and requires agreement to the Terms of Service and Privacy Policy. A password must be at least 12 characters long with uppercase and lowercase letters, a number, and a symbol. A username, email address, or contact number already in use is refused. After registering, the customer receives a confirmation link by email and can place orders once the address is confirmed.

### Figure 1.2 — `fig-01.2-home.png`
**Caption:** Figure 1.2 Home page

**Description:**
> The home page presents the bakery in its own colours and photographs. The top bar links to Home, Menu, Our Story, and Visit Us, with Sign in and Create account on the right. The opening section, "Warm bread, baked every morning", offers "See today's menu" and "Sign in to order", and notes that products are baked in-house, ready for pickup on time, and delivered within Lucban. Further down, customers can shop by category and read about the bakery's history since 1947.

### Figure 1.3 (optional, new) — `fig-01-login-staff.png`
**Caption:** Figure 1.3 Staff sign-in

**Description:**
> The staff entrance of the same pop-up is used by the admin, cashiers, and delivery personnel. After a valid password, the admin must also enter a six-digit one-time code sent by email; cashiers and delivery personnel go straight to their work screens. Staff are signed out after 30 minutes without activity.

---

## Dashboard

The descriptions for Figures 2 and 2.1 were already replaced in Part B
(B3). Change only the images and captions; Figure 2.2 gets a new
description.

### Figure 2 — `fig-02-dashboard-admin.png`
**Caption:** Figure 2. Admin dashboard

### Figure 2.1 — `fig-02.1-dashboard-cashier.png`
**Caption:** Figure 2.1 Cashier dashboard

The cashier's dashboard is the same as the admin's, without the "Bulk
orders to approve" tile.

### Figure 2.2 — `fig-02.2-my-deliveries.png` (phone)
**Caption:** Figure 2.2 My Deliveries — delivery personnel's first screen

**Replace the B3 text for 2.2 with:**
> Delivery personnel have no separate dashboard; after signing in they land on My Deliveries, built for use on a phone. The Assigned tab lists each delivery assigned to them with the customer's name, a tap-to-call contact number, the delivery address, the order total marked as paid, and a large "Start delivery" button. The History tab holds their finished deliveries (Figure 18). There is no map or GPS tracking; delivery is a status checklist.

---

## Customer Management

### Figure 3 — `fig-03-customers-admin.png`
**Caption:** Figure 3. Customer Management (admin)

**Description:**
> The admin's Customer Management page lists every registered customer with their name, username, contact number, email address, and account status. A search box finds customers by name, email, or contact number. Each row has an Edit button for correcting the customer's details and a Deactivate button that blocks the account from signing in; a deactivated account can be reactivated. Customers create their own accounts, so there is no "new customer" form.

### Figure 4 — `fig-04-customers-cashier.png`
**Caption:** Figure 4. Customer Management (cashier)

**Description:**
> The cashier sees the same customer list and search, without the Edit and Deactivate buttons. Cashiers look customers up while taking an order at the counter; changes to a customer's record are made by the admin.

### Figure 5 — `fig-05-account-orders.png`
**Caption:** Figure 5. Customer account — My Orders

**Description:**
> The customer's account page greets them by name and shows three figures from their own orders: orders placed, orders in progress, and the total amount ordered. Three tabs follow: My Profile, My Orders, and My Payments. My Orders lists the customer's orders, newest first, with their status; selecting one shows its items, requested time, delivery progress, the amount paid and balance due with a "Pay now" button, and, while the order is still Placed, a Cancel button that asks for a reason.

### Figure 5.1 — `fig-05.1-account-profile.png`
**Caption:** Figure 5.1 Customer account — My Profile

**Description:**
> My Profile has three sections: Profile, Addresses, and Password. The Profile section shows the username and lets the customer update their full name and contact number. Changing the email address requires the current password, and a notice is sent to the old address.

### Figure 5.2 — `fig-05.2-account-addresses.png`
**Caption:** Figure 5.2 Customer account — saved addresses

**Description:**
> Customers can save several delivery addresses, each with a label, recipient name, contact number, street, barangay, municipality, and delivery notes, and mark one as the default. The first address saved becomes the default automatically. Delivery is available only to addresses in Lucban.

### Figure 5.3 — `fig-05.3-account-security.png`
**Caption:** Figure 5.3 Customer account — change password

**Description:**
> The Password section changes the account password. The current password is required, and the new password must meet the same rules as at registration.

---

## Order Management

### Figure 6 — `fig-06-orders-admin.png`
**Caption:** Figure 6. Order Management (admin)

**Description:**
> The admin's Order Management page lists the orders with their customer, date placed, requested time, total, and status, and can be searched and filtered by status. At the top, the admin sets the item count above which an order counts as a bulk order and needs the admin's approval. Selecting an order opens its detail: the customer, order type, requested time, delivery progress, items and prices, the amount paid and balance due, and the status history with who changed it and when. A status can only move forward; cancelling requires a reason. In the example, an unpaid delivery order is flagged "Not paid yet — don't bake it", because delivery orders are prepared only once paid.

### Figure 7 — `fig-07-orders-cashier.png`
**Caption:** Figure 7. Order Management (cashier)

**Description:**
> The cashier's Order Management page has two tabs: Orders, the same searchable order list and detail as the admin's, and New order, for orders taken at the counter.

### Figure 7.1 (optional, new) — `fig-07.1-new-order-cashier.png`
**Caption:** Figure 7.1 New order at the counter

**Description:**
> To take an order at the counter, the cashier searches for the customer or leaves it as a walk-in, chooses Pickup or Delivery (delivery needs a customer account with a Lucban address), adds the products and quantities, and may add special instructions. The order summary on the right totals the order before it is placed.

### Figure 7.2 (optional, new) — `fig-07.2-due-today.png`
**Caption:** Figure 7.2 Production — Due today

**Description:**
> The Production page answers the problem raised in the interview, an order due at 6:00 whose bread is finished at 7:00. It lists the open orders due on the chosen day, grouped by the hour they are due, and adds up how many of each product are still to be made. Orders that are overdue or due within the hour are highlighted, and unpaid delivery orders are tagged "Not paid — don't bake yet". The schedule can be printed or saved as PDF.

### Figure 8 — `fig-08-delivery-detail.png` (phone)
**Caption:** Figure 8. Delivery in progress (delivery personnel)

**Description:**
> Once the delivery personnel taps "Start delivery", the order is marked Out for Delivery for staff and customer alike. The card then shows the proof-of-delivery photo upload, which opens the phone's camera or gallery and accepts up to five JPEG or PNG photos, a "Mark delivered" button, and a "Mark failed" button with a field for the reason.

### Figure 9 — `fig-09-menu.png`
**Caption:** Figure 9. Menu (customer)

**Description:**
> The Menu shows the bakery's products grouped by category, with a search box and category shortcuts at the top. Each product card shows its photo, name, size or pack, and price, with a quantity stepper and Add to cart. Products that are unavailable or expired are not offered. The cart button stays in view while the customer browses.

---

## Product and Inventory

### Figure 10 — `fig-10-products-admin.png`
**Caption:** Figure 10. Product Management (admin)

**Description:**
> Product details are managed separately from stock. In Product Management, the admin maintains the categories and creates, edits, and deletes products, giving each a category, name, size or pack, price, description, photo, shelf life, and whether it is available for ordering.

### Figure 10.1 (optional, new) — `fig-10.1-inventory-admin.png`
**Caption:** Figure 10.1 Inventory Management (admin)

**Description:**
> Inventory Management lists each product's stock, minimum level, and expiration date, with a colour-coded status: Good, Running low, Low stock, or Expired. The status buttons at the top filter the list, and "Needs attention" shows only the products that need action. The admin records restocks and corrections here and reviews the cashiers' change requests in the Change requests tab. Every change is kept in a stock movement record with who made it, when, and why.

### Figure 11 — `fig-11-inventory-cashier.png`
**Caption:** Figure 11. Inventory Management — proposing a stock change (cashier)

**Description:**
> Cashiers can view stock levels but cannot change them directly. In "Propose a change", a cashier either proposes a stock correction (for example, after a recount or a delivery) or reports a loss — spoilage, damaged, expired, or production loss — with a reason. The request takes effect only when the admin approves it, and the cashier can follow its status under "My requests".

---

## Payment and Billing

### Figure 12 — `fig-12-payments-admin.png`
**Caption:** Figure 12. Payment & Billing — payment log (admin)

**Description:**
> The Payment log lists every payment with its order, customer, method (cash or GCash), amount, status (paid, refunded, pending, or cancelled), and date. It can be filtered by date range, method, and status. Only the admin can issue refunds; when a paid order is cancelled, a GCash payment made online is refunded automatically through PayMongo.

### Figure 13 — `fig-13-payments-cashier.png`
**Caption:** Figure 13. Payment & Billing — recording a payment (cashier)

**Description:**
> The Billing tab lists the orders that still owe money. Selecting one shows its receipt: the items, total, amount paid, and balance due. The cashier records a cash payment, or a GCash payment with its reference number, below the receipt; partial payments are allowed, and a payment larger than the balance is refused. The receipt can be printed or saved as PDF, and the customer can do the same from My Payments.

### Figure 14 — `fig-14-deliveries-admin.png`
**Caption:** Figure 14. Delivery Management (admin and cashier)

**Description (replaces the "Payment Verification" mockup):**
> In Delivery Management, the admin and cashier assign each delivery order to a delivery person and follow it through to delivered. A delivery can be assigned only after its order is confirmed and fully paid; there is no cash on delivery, so the delivery personnel never handle payments. Each card shows the order, customer, address, total, and status. The admin can call back a delivery whose driver can no longer finish it, and send a failed delivery back to the queue to be tried again.

### Figure 14.1 — remove

The proof-of-delivery screen is now Figure 8. Delete Figure 14.1 and its
List of Figures entry, or keep the number and reuse `fig-08-delivery-detail.png`
with the caption "Figure 14.1 Proof of delivery".

### Figure 15 — `fig-15-checkout-delivery.png`
**Caption:** Figure 15. Checkout — delivery order (customer)

**Description:**
> At checkout the customer chooses "Pickup at the bakery" or "Delivery". For delivery, a notice explains that delivery orders are paid in full with GCash before baking starts — there is no cash on delivery — and the customer picks one of their saved Lucban addresses or adds another. The customer may add special instructions and a requested date and time up to 30 days ahead. The order summary shows the items and the estimated total; there is no delivery fee. Payment is made right after placing the order, from the confirmation page or My Payments.

### Figure 15.1 — `fig-15.1-checkout-pickup.png`
**Caption:** Figure 15.1 Checkout — pickup order (customer)

**Description:**
> A pickup order needs no address. The customer can pay online beforehand from My Payments or pay at the counter when collecting the order.

---

## Reporting and Analytics

### Figure 16 — `fig-16-reports-admin.png`
**Caption:** Figure 16. Reporting & Analytics — Sales (admin)

**Description:**
> Reporting & Analytics has six tabs: Sales, Products, Inventory, Forecast, Transactions, and Report History. The Sales tab reports any date range by day, week, or month: orders placed, the amount ordered, the amount collected, and refunds, with a sales chart and the peak ordering periods by hour and day of the week. Every report can be printed or saved as PDF, and the sales data exported as CSV.

### Figure 16.1 (optional, new) — `fig-16.1-forecast-admin.png`
**Caption:** Figure 16.1 Reporting & Analytics — Forecast

**Description** (wording depends on decision D4):
> The Forecast tab estimates how much of each product will sell over the next seven days, from past daily sales. It shows the expected sales for the week, how many products need baking now because the shelf will not cover today and tomorrow, and how accurate the forecast has been on past weeks, followed by a "What to bake" list.

### Figure 17 — `fig-17-reports-cashier.png`
**Caption:** Figure 17. Reporting & Analytics — Transactions (cashier)

**Description:**
> Cashiers see the same reports as the admin except Report History. The Transactions tab, shown here, lists the payment records and can be filtered by date, method, and status.

### Figure 18 — `fig-18-delivery-history.png` (phone)
**Caption:** Figure 18. Delivery history (delivery personnel)

**Description:**
> The History tab of My Deliveries is the delivery personnel's own report. For a chosen date range it counts the deliveries delivered and failed and those assigned now, then lists each finished delivery with its customer, address, and the time it was delivered or failed. It can be printed or saved as PDF.

---

## Retaking the screenshots

The capture script lives outside the repo, in the session scratchpad
(`browser/figures.mjs`). It signs in the demo accounts by inserting
sessions directly in the database, so no sign-in codes are emailed. Ask
Claude to rerun it after the demo data changes.
