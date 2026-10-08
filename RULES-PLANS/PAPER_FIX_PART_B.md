# PAPER_FIX_PART_B.md — Part B: module sections, ready to paste

For editing `docs/PECTRACK_REVISED.pdf` (upload of 2026-10-08, 20:38).
Page numbers are that file's PDF pages. Each fix gives the text to
**find** and the text to **replace it with**. Each claim was checked
against the code on 2026-10-08.

Each module is described in three places in the paper. Fix all three so
that they agree:

1. **Purpose and Description**, pp. 12–17.
2. **Scope**, pp. 20–44: the module summaries and the figure
   descriptions.
3. **Flowchart descriptions**, pp. 71–77.

**Not handled here:**
- The word "AI" (p. 14 "intelligent restocking recommendations", p. 17
  "AI-Assisted Analytics") waits for decision D4 with the adviser.
- The mockup images themselves (Figures 1–18) are covered in the last
  section.

---

## B1 — Login

### p. 12 — Purpose and Description, Login Module (first paragraph)

**Find:**
> The Login Module is responsible for securing the system by verifying user identity before granting access. Users are required to enter a valid username and password, after which the system validates the credentials and determines the appropriate access level based on the user's assigned role.

**Replace with:**
> The Login Module is responsible for securing the system by verifying user identity before granting access. Sign-in opens as a pop-up window with two separate entrances: one for customers and one for bakery staff. Each entrance refuses the other kind of account, so a staff account cannot sign in through the customer entrance. Users enter their username or email address and their password, after which the system validates the credentials and determines the appropriate access level based on the user's assigned role. After five failed attempts, the account is locked for 15 minutes. Users who forget their password can request a reset link by email.

### p. 12 — Cashier access to reports

Cashiers can open the same reports as the admin, except Report History.

**Find:**
> Cashiers do not have access to administrative functions such as report generation or system-wide user management.

**Replace with:**
> Cashiers do not have access to administrative functions such as staff account management, product and price changes, or approving stock changes.

### p. 12 — Where the customer lands

**Find:**
> Once verified, the customer is redirected to the Home Page, which serves as the main browsing interface of the e-commerce platform.

**Replace with:**
> Once verified, the customer is taken to the Menu, which serves as the main browsing interface of the e-commerce platform.

### p. 13 — Delivery Personnel and the end of a session

**Find:**
> …the user is redirected to the Delivery Dashboard. This dashboard allows delivery personnel to access and manage assigned delivery orders, view customer delivery details, update delivery statuses, and monitor completed and pending deliveries.

**Replace with:**
> …the user is redirected to the My Deliveries page. This page allows delivery personnel to access and manage assigned delivery orders, view customer delivery details, update delivery statuses, and review their delivery history.

**Find:**
> If credentials are found to be invalid at any point during the login process, the system denies access and ends the session, protecting the system from unauthorized entry.

**Replace with:**
> If credentials are found to be invalid at any point during the login process, the system denies access, protecting the system from unauthorized entry. Staff accounts are signed out automatically after 30 minutes without activity. With "Remember me" ticked, a user stays signed in on that device for up to seven days; otherwise the session ends when the browser is closed.

### p. 21 — Scope, Login Module (under Figure 1)

**Find:**
> This module supports role-based access control, ensuring that administrators, cashiers, and customers are only able to access the features relevant to their respective roles.

**Replace with:**
> Sign-in is a pop-up window with separate entrances for customers and for staff, and accepts a username or email address. The administrator also confirms a one-time code sent by email. An account is locked for 15 minutes after five failed attempts, staff are signed out after 30 minutes without activity, and a forgotten password can be reset through a link sent by email. This module supports role-based access control, ensuring that administrators, cashiers, delivery personnel, and customers are only able to access the features relevant to their respective roles.

### p. 23 — after Figure 1.2

**Find:**
> After accessing login, The Admin, Cashier, Delivery Personnel and Customer are redirected on their specific dashboards while the customers are in the home page.

**Replace with:**
> After signing in, the Admin and Cashier are taken to their Dashboard, the Delivery Personnel to My Deliveries, and the Customer to the Menu. Signing out returns every user to the Home page.

### p. 72 — Flowchart, Delivery Personnel

**Find:**
> …the user is redirected to the Rider Dashboard.

**Replace with:**
> …the user is redirected to the My Deliveries page.

### p. 72 — Flowchart, Customer

**Find:**
> Only active customers are granted access to the Home Page, where they can browse products, place orders, and track order status.

**Replace with:**
> Only active customers are granted access; they are taken to the Menu, where they can browse products, place orders, and track order status.

---

## B2 — Registration

### p. 22 — Figure 1.1 description

The fields listed no longer match the form.

**Find:**
> The right side contains the actual registration form with input fields for Full Name, Email, Password, and Confirm Password, along with a Terms of Service and Privacy Policy checkbox that must be agreed to before proceeding.

**Replace with:**
> The right side contains the actual registration form with input fields for Full Name, Username, Contact Number, Email, Password, and Confirm Password, along with a Terms of Service and Privacy Policy checkbox that must be agreed to before proceeding. A password must be at least 12 characters long and include uppercase and lowercase letters, a number, and a symbol; common passwords are refused. After registering, the customer receives a confirmation link by email and can place an order only once the email address is confirmed. A username, email address, or contact number that is already in use is refused.

---

## B3 — Dashboard

### pp. 24–26 — Figures 2, 2.1, 2.2

Figure 2 describes "Revenue by Product". Figure 2.1 describes recent
orders. Figure 2.2 describes a driver dashboard with a map icon. None of
these exists. Replace the three descriptions with these two:

**Replace the descriptions of Figures 2 and 2.1 with:**
> The Dashboard of the admin and cashier opens with a greeting that states how many things need attention. A "Today" row shows the number of orders, the amount ordered, and the amount collected for the day. Below it, status tiles are colour-coded green for Good, yellow for Okay, and red for Needs attention: Low stock, Running low, Expired stock, Orders to prepare (red when an order is past its requested time), Deliveries to assign, Bulk orders to approve (admin only), Unpaid balances, and Likely to sell out (from the sales forecast). Clicking a tile opens the module already filtered to the problem; for example, the Low stock tile opens Inventory Management showing only low-stock products. A "Restock first" list shows the products furthest below their minimum stock level.

**Replace the description of Figure 2.2 with:**
> Delivery personnel have no separate dashboard. They sign in to My Deliveries, which lists their assigned deliveries and is described under the Order Management Module.

---

## B4 — Customer Management

### p. 13 — Purpose and Description, Admin and Cashier access

**Find:**
> The Admin has full access to everything within this module, including the ability to view the complete customer list, create new customer records, modify and update existing customer information, and oversee all customer-related data across the system. The Cashier has limited access within this module, restricted only to searching for existing customers, viewing customer details, and editing customer information when necessary to ensure records remain accurate and up to date.

**Replace with:**
> Customers create their own accounts through registration. The Admin has full access within this module, including the ability to view the complete customer list, update existing customer information, and deactivate or reactivate customer accounts. The Cashier has limited access within this module, restricted to searching for existing customers and viewing customer details; editing is reserved for the Admin to protect the integrity of the records. Walk-in customers do not need an account.

### p. 14 — Customer access

**Find:**
> The Customer has limited access within this module, restricted only to viewing their own profile and updating their own personal information.

**Replace with:**
> The Customer has limited access within this module, restricted only to viewing their own profile, updating their own personal information, managing their saved delivery addresses, and changing their password or email address.

### p. 14 — sentence in the wrong module

The sentence about products sits at the end of Customer Management. It
belongs to Inventory Management, which already says it. **Delete:**
> The system automatically displays only products that are currently available and hides expired or unavailable items to maintain product quality and inventory accuracy.

**Then, in the Inventory Management paragraph on p. 14, find:**
> Additionally, inventory levels are automatically adjusted whenever an order is placed.

**Replace with:**
> Additionally, inventory levels are automatically adjusted whenever an order is placed. Each product can have an expiration date; the menu shows only products that are available and not expired, and expired stock cannot be ordered.

### p. 26 — Scope, Customer Management Module

**Find:**
> Admin can view and edit customers for new information. Cashiers are able to search and retrieve customer records during transactions…

**Replace with:**
> Customers can save several delivery addresses, each with a recipient name, contact number, and delivery notes, and choose one as the default. The admin can view, edit, and deactivate or reactivate customer accounts. Cashiers are able to search and retrieve customer records during transactions…

### pp. 27–31 — Figures 3–5.3

The figure descriptions mention billing address and admin notes (Fig.
3), cashier edit buttons (Fig. 4), birthday, membership date and
preferred payment (Fig. 5.1), and an account sidebar. None of these were
built. **Add one sentence after the Figure 5.3 description:**
> Figures 3 to 5.3 are early design mockups. In the final system, the customer's account page has three tabs — My Profile, My Orders, and My Payments — and the profile holds the name, username, email address, contact number, and saved addresses.

Alternatively, replace the figures with screenshots of the system; see
the last section.

### pp. 72–73 — Flowchart, Customer Management

**Find:**
> The Administrator can create new customer records, view customer details, update existing customer information, or archive inactive customer accounts.

**Replace with:**
> The Administrator can view customer details, update existing customer information, or deactivate customer accounts. Customers create their own accounts through registration.

**Find:**
> If a customer is found, the Cashier can view the customer's details and update necessary information if corrections are needed. After editing, the system validates the data before saving the changes.

**Replace with:**
> If a customer is found, the Cashier can view the customer's details and attach the customer to the order. Corrections to a customer's record are made by the Administrator.

**Find:**
> …they may update fields such as contact number, email address, or delivery address.

**Replace with:**
> …they may update fields such as their name and contact number, add or edit delivery addresses, or change their email address, which requires their current password.

---

## B5 — Product and Inventory

### p. 35 — Scope, Inventory Management Module

**Find:**
> Administrators can add, edit, and delete bakery products, assigning each a name, description, category, unit price, availability status, and product image. Also approved the suggested information from cashiers. The cashier's only request to update the stock. The module supports automatic stock deduction when orders are placed, manual stock level updates when new supplies are received, and a low-stock alert dashboard that flags any product or ingredient that has fallen below its defined minimum threshold.

**Replace with:**
> The system separates product details from stock levels. In Product Management, administrators add, edit, and delete bakery products and their categories, assigning each product a name, description, category, unit price, availability status, shelf life, and product image. In Inventory Management, stock levels are kept up to date: the stock is deducted automatically when an order is placed and restored when an order is cancelled, and the administrator records new stock when products are restocked. Cashiers cannot change stock directly; they submit stock corrections and loss reports (spoilage, damaged, expired, or production loss), which take effect only after the administrator approves them. Every change in stock is recorded with who made it, when, and why. Each product is given a status — Good, Running low, Low stock, or Expired — and the list can be filtered by status, so that the products needing attention can be found at once.

### p. 36 — Figure 11 description

**Find:**
> …a small dashboard table with an "Update" button to request suggestions to update the stocks to the Admin.

**Replace with:**
> …a stock table with buttons to request a stock correction or report a loss, which the Admin then approves or rejects.

### p. 73 — Flowchart, Inventory Management

**Find:**
> If stock levels fall below the minimum threshold, the system can generate stock alerts to notify the Administrator. The Cashier may view inventory information when processing orders. Before confirming an order, the system checks whether sufficient stock is available for the selected products. If stock is insufficient, the system notifies the Cashier and prevents the order from proceeding until inventory is updated.

**Replace with:**
> When a product's stock falls to or below its minimum level, it is flagged as low stock on the Dashboard and in Inventory Management. The Administrator reviews and approves or rejects the stock corrections and loss reports submitted by cashiers. The Cashier may view inventory information and submit such requests. When an order is placed, the system checks whether sufficient stock is available for the selected products. If stock is insufficient, or the product has expired, the order is refused until the inventory is updated.

---

## B6 — Order Management

### p. 15 — Purpose and Description, Cashier

**Find:**
> The Cashier is provided with the tools to input new orders, make necessary updates, and track the current status of ongoing transactions, ensuring that every order is handled accurately.

**Replace with:**
> The Cashier is provided with the tools to input new orders, update their status, cancel them with a recorded reason, and track the current status of ongoing transactions, ensuring that every order is handled accurately. Once placed, an order's items are not edited; it is cancelled and placed again, so that stock and payments stay correct.

### p. 15 — Delivery Personnel

**Find:**
> The Delivery Personnel functionality is integrated within the Order Management Module rather than implemented as a separate module. Through this feature, delivery personnel are able to view their assigned orders…

**Replace with:**
> Deliveries are handled in two places. In Delivery Management, the Admin and Cashier assign each paid delivery order to a delivery person. The delivery personnel work from My Deliveries, where they are able to view their assigned orders…

### p. 31 — Scope, Order Management Module

**Find:**
> An order queue displays all active orders progressing through the stages of Order Placed, Confirmed, In Production, Out for Delivery or Ready for Pickup, and Completed. Cashiers can also modify orders if needed, cancel orders with a logged reason, and organize production scheduling based on incoming orders. Customers are able to indicate their preferred receiving method at the time of order placement.

**Replace with:**
> An order queue displays all active orders progressing through the stages of Order Placed, Confirmed, In Production, Out for Delivery or Ready for Pickup, and Completed; an order can also be Cancelled. Status only moves forward, and every change is recorded with who made it and when. Cashiers can cancel orders with a required reason, which restores the stock and refunds any payment. A customer may cancel their own order only while it is still Placed. Customers choose pickup or delivery and may request a date and time up to 30 days ahead. Delivery is available only to addresses in Lucban. The Production page, "Due today", lists the open orders grouped by the hour they are due, with the quantity of each product still to be made, and marks orders that are overdue or due within the hour.

### p. 32 — Figure 6 description

The mockup shows "Cash on Pickup" as the payment method. Orders do not
store a chosen payment method; payments are recorded separately.

**Find:**
> …that provides a specific breakdown of products, a payment method of "Cash on Pickup," and tools for updating the order status and notes.

**Replace with:**
> …that provides a specific breakdown of products, the amount paid and the balance due, and tools for updating the order status and notes.

### pp. 74–75 — Flowchart, Order Management

**Find:**
> After reviewing the cart, the customer confirms the order by selecting the preferred delivery option and payment method.

**Replace with:**
> After reviewing the cart, the customer confirms the order by selecting pickup or delivery and, if they wish, a requested date and time.

**Find:**
> After completing the delivery, the delivery personnel updates the order status to indicate successful delivery.

**Replace with:**
> After completing the delivery, the delivery personnel uploads a photo as proof and marks the delivery as delivered, or as failed with a note of the reason. Staff then mark the order as completed.

---

## B7 — Payment and Billing

### p. 37 — Scope, Payment and Billing Module

**Find:**
> Cash on pickup is also supported for walk-in or pre-order customers, marked as paid by the cashier upon receipt. The module automatically generates a digital receipt per transaction showing itemized amounts and the total, and maintains a full payment history viewable per order.

**Replace with:**
> At the counter, the cashier records cash payments and GCash payments, the latter by their reference number. Partial payments are allowed, and every order shows the amount paid and the balance due. Delivery orders must be paid in full before they are prepared. Refunds are handled by the administrator; when a paid order is cancelled, an online payment is refunded automatically through PayMongo. The module generates a digital receipt per order showing itemized amounts and the total, which can be printed or saved as PDF, and maintains a full payment history that can be filtered by date, payment method, and status.

### pp. 39–40 — Figures 14 and 14.1 (driver Payment Verification)

The "Payment Verification" screen with "Proceed to Delivery" was not
built. Unpaid delivery orders cannot be assigned at all.

**Find:**
> The Payment Verification and Proof of Delivery screens are two separate but related screens within the Delivery Personnel Portal that work together to ensure a complete and verified delivery process. The Payment Verification screen displays the payment details for a specific order , including the payment method (G-Cash via PayMongo), amount, and a confirmed status, along with a "Proceed to Delivery" button once payment is verified. It also includes a warning notice at the bottom instructing the personnel to hold the delivery and notify the admin or cashier if payment is not yet confirmed. The Proof of Delivery screen, on the other hand, shows the confirmed delivery address…

**Replace with:**
> Figure 14 is an early mockup of a payment check for delivery personnel. In the final system, this check happens before the delivery reaches them: a delivery order is paid in full before it is confirmed, and only paid orders can be assigned to a delivery person, so each assigned delivery simply shows that it is paid. The Proof of Delivery screen shows the confirmed delivery address…

### pp. 40–41 — Figures 15 and 15.1 (checkout)

**Find:**
> …and a "Summary" sidebar that lists the subtotal, delivery fee, and a checkout button.

**Replace with:**
> …and a "Summary" sidebar that lists the subtotal and a checkout button (delivery within Lucban has no delivery fee).

**Find** (both figures):
> …selecting a payment method and preferred time…

**Replace with:**
> …selecting a preferred date and time…

Payment is made after the order is placed, from My Payments, so the
checkout itself does not ask for a payment method.

### p. 75 — Flowchart, Payment and Billing

**Find:**
> The Admin does not really manage the order process. It can only view payment transactions and generate financial reports to pdf.

**Replace with:**
> The Admin can record payments the same way as the Cashier, and is the only user who can issue refunds. The Admin also views all payment transactions and can print or save the payment reports as PDF.

**Find:**
> Customers can also select their preferred payment method when placing an order. After completing the payment process, the system records the transaction and updates the order status accordingly. Delivery access the payment and billing module by viewing the payment status of the assigned order of the customers. To also confirm the payment. If yes, proceed to the order management delivery process. If not, hold delivery and notify the admin/cashier.

**Replace with:**
> Customers pay online with GCash through PayMongo from My Payments or from the order itself. After a successful payment, PayMongo notifies the system and the payment is recorded against the order. A delivery order must be paid in full before it is confirmed and before it can be assigned to a delivery person; delivery personnel therefore do not handle payments.

---

## B8 — Delivery

### p. 26 — Figure 2.2 continuation

Covered in B3: the driver has no dashboard. Remove the remaining
description of status counters, the map icon, and the sidebar ("Order
Detail, Payment Verification, Proof of Delivery, and Delivery Reports").

### pp. 33–34 — Figure 8 description, add at the end

> The delivery personnel first marks the order "Out for Delivery", uploads up to five photos as proof of delivery, and then marks it delivered, or failed with a note of the reason. The administrator can send a failed delivery back to the queue to be assigned again.

**Mismatch to settle (p. 16):** the paper says delivery personnel "are
also required to upload proof of delivery". The system allows marking an
order delivered **without** a photo, and the failure reason is optional.
Choose one:
- Reword p. 16 to "are expected to upload proof of delivery".
- Have the system enforce it: Delivered needs at least one photo, and
  Failed needs a reason. This is a small change, with tests.

### p. 15 — no map or tracking

The paper does not promise GPS, but Figure 2.2 shows a map icon. If the
panel asks, the answer is that delivery is a status workflow (Assigned,
Out for Delivery, Delivered or Failed), not live tracking. This is already
in the Part E Limitations suggestions.

---

## B9 — Reporting and Analytics

### p. 17 — Purpose and Description

**Find:**
> …allowing Admins to quickly locate specific records by date, user, or transaction type.

**Replace with:**
> …allowing Admins to quickly locate specific records by date, payment method, or payment status.

**Find:**
> These reports can be exported in PDF format, making them easy to save, print, and share with management or stakeholders as needed.

**Replace with:**
> These reports can be printed or saved as PDF, and the data can be exported as a CSV file, making them easy to save, print, and share with management or stakeholders as needed.

### p. 42 — Scope, Reporting and Analytics Module

**Find:**
> The admin module for reporting and analytics produces a daily sales summary showing total revenue, number of orders, and top-selling products, as well as a monthly sales report filterable by date range. The cashier can only view their total sales on that day and they can export to pdf for reports. The delivery personnel also can view only their made orders that they deliver and can export to pdf for reporting.

**Replace with:**
> The Reporting and Analytics Module has six tabs:
> - Sales: daily, weekly, or monthly totals over any date range, with a sales trend chart and the peak ordering periods by hour of day and day of week.
> - Products: the best sellers.
> - Inventory: stock movements, losses, and products currently low on stock.
> - Forecast: expected sales for the next seven days and how much of each product to bake.
> - Transactions: the payment log, filterable by date, payment method, and status.
> - Report History.
>
> The cashier sees the same reports as the admin, except Report History. Delivery personnel see their own delivery history — delivered and failed deliveries and the deliveries assigned now — over a chosen date range. Every report can be printed or saved as PDF.

### p. 43 — Figure 17 description

**Find:**
> …displaying Total Sales (8,340), Orders Completed (24), Cash Collected (3,120), and Online Collected (5,220).

**Replace with:**
> …displaying the sales figures for the selected period.

(The cashier no longer has a separate daily-only screen.)

### p. 76 — Flowchart, Administrator access

**Find:**
> Only the Administrator has full access to this module to ensure the confidentiality and integrity of business data.

**Replace with:**
> The Administrator has full access to this module. Cashiers see the same reports except Report History, and reports are view-only for everyone, to ensure the integrity of business data.

### p. 77 — Flowchart, Customer

My Orders has no filters. Filtering is on the payment history.

**Find:**
> The Customer may apply filters such as order date or order status to narrow down the results. After applying the selected filters, the system retrieves the corresponding transaction data from the database and displays the order details. The Customer can view the transaction information and, if needed, download a receipt in PDF format for personal documentation.

**Replace with:**
> My Orders lists the customer's orders, newest first, with their status. My Payments lists the customer's payments and can be filtered by date, payment method, and status. The Customer can open the receipt of any order and print it or save it as PDF for personal documentation.

---

## B10 — Objectives (pp. 18–19)

Objective 3 was fixed in Part A (A5). Objective 4 can now name the
analytics the system actually has. **Find:**
> The system is designed to generate reports based on recorded bakery data, including sales summaries, inventory status, and order histories.

**Replace with:**
> The system is designed to generate reports based on recorded bakery data, including sales summaries, best-selling products, peak ordering periods, inventory status and stock movements, payment transactions, a seven-day sales forecast, and restocking recommendations.

---

## The mockup figures (Figures 1–18)

The descriptions above make the text match the system. The images still
show early mockups: the green gradient login, the driver dashboard with a
map, Payment Verification, the delivery fee, the account sidebar, and so
on. The team has two options:

1. **Keep the mockups.** Make sure each caption says "Proposed … design"
   (most already do). The added sentences in B4 and B7 say where the
   final system differs.
2. **Replace them with screenshots of the system.** This is more
   convincing in the defense, because the panel sees the real thing.
   Claude can capture a matching set: one per figure, same role, desktop
   or phone as fits. The descriptions then need only light edits.
