# PAPER_FIX_PART_B.md — Part B: module sections, ready to paste

For editing `docs/PECTRACK_REVISED.pdf`. Page numbers are that file's PDF
pages. Each fix gives the text to **find** and the text to **replace it
with**. Each claim was checked against the code on 2026-10-08.

**One file per job:**
- **All text** for the paper — module paragraphs, figure descriptions,
  flowcharts — is in this file, in page order within each module.
- **Images and captions** are in `PAPER_FIGURES.md`: which screenshot
  replaces which mockup, and the new caption. That file has no paragraph
  text, so nothing is pasted twice.

**How the text is split, so the paper does not repeat itself:**
- The **module summary** paragraph in Scope (for example p. 35, Inventory
  Management Module) says what the module does and its rules.
- The **figure description** under each screenshot says only what that
  screen shows. It does not restate the rules from the summary on the
  same page.
- **Purpose and Description** (pp. 12–17) and the **flowcharts**
  (pp. 71–77) repeat some facts. The paper is built that way (each
  module is described in three places), so those keep their own wording.

**Not handled here:** the word "AI" (p. 14 "intelligent restocking
recommendations", p. 17 "AI-Assisted Analytics") waits for decision D4
with the adviser.

---

## Where you are

Done (pasted before you stopped at Figure 3): B1, B2, B3, and the B4
items for pp. 13, 14 and 26.

Three follow-ups to the parts already pasted, now that the figures are
screenshots:

1. **Figure 1.1 (p. 22).** You replaced one sentence, but the rest of
   the paragraph still describes the mockup ("dark green gradient", "Go
   To Home" button). Replace the **whole** paragraph with the new B2
   text below.
2. **Figure 1.2 (p. 23).** Replace the homepage sentence; see the new
   item under B1.
3. **Figure 2.2 (pp. 25–26).** Replace the sentence you pasted with the
   new B3 text below. Delete any old text that is left: the three status
   counters, order cards with a map icon, and the sidebar list ("Order
   Detail, Payment Verification, Proof of Delivery, and Delivery
   Reports").

Then continue from **B4, Figures 3–5.3**.

---

## B1 — Login ✔ done

### p. 12 — Purpose and Description, Login Module (first paragraph) ✔

**Find:**
> The Login Module is responsible for securing the system by verifying user identity before granting access. Users are required to enter a valid username and password, after which the system validates the credentials and determines the appropriate access level based on the user's assigned role.

**Replace with:**
> The Login Module is responsible for securing the system by verifying user identity before granting access. Sign-in opens as a pop-up window with two separate entrances: one for customers and one for bakery staff. Each entrance refuses the other kind of account, so a staff account cannot sign in through the customer entrance. Users enter their username or email address and their password, after which the system validates the credentials and determines the appropriate access level based on the user's assigned role. After five failed attempts, the account is locked for 15 minutes. Users who forget their password can request a reset link by email.

### p. 12 — Cashier access to reports ✔

**Find:**
> Cashiers do not have access to administrative functions such as report generation or system-wide user management.

**Replace with:**
> Cashiers do not have access to administrative functions such as staff account management, product and price changes, or approving stock changes.

### p. 12 — Where the customer lands ✔

**Find:**
> Once verified, the customer is redirected to the Home Page, which serves as the main browsing interface of the e-commerce platform.

**Replace with:**
> Once verified, the customer is taken to the Menu, which serves as the main browsing interface of the e-commerce platform.

### p. 13 — Delivery Personnel and the end of a session ✔

**Find:**
> …the user is redirected to the Delivery Dashboard. This dashboard allows delivery personnel to access and manage assigned delivery orders, view customer delivery details, update delivery statuses, and monitor completed and pending deliveries.

**Replace with:**
> …the user is redirected to the My Deliveries page. This page allows delivery personnel to access and manage assigned delivery orders, view customer delivery details, update delivery statuses, and review their delivery history.

**Find:**
> If credentials are found to be invalid at any point during the login process, the system denies access and ends the session, protecting the system from unauthorized entry.

**Replace with:**
> If credentials are found to be invalid at any point during the login process, the system denies access, protecting the system from unauthorized entry. Staff accounts are signed out automatically after 30 minutes without activity. With "Remember me" ticked, a user stays signed in on that device for up to seven days; otherwise the session ends when the browser is closed.

### p. 21 — Scope, Login Module — also the Figure 1 description ✔

**Find:**
> This module supports role-based access control, ensuring that administrators, cashiers, and customers are only able to access the features relevant to their respective roles.

**Replace with:**
> Sign-in is a pop-up window with separate entrances for customers and for staff, and accepts a username or email address. The administrator also confirms a one-time code sent by email. An account is locked for 15 minutes after five failed attempts, staff are signed out after 30 minutes without activity, and a forgotten password can be reset through a link sent by email. This module supports role-based access control, ensuring that administrators, cashiers, delivery personnel, and customers are only able to access the features relevant to their respective roles.

This paragraph is Figure 1's description; Figure 1 needs no other text.

### p. 23 — Figure 1.2, home page **(new — to do)**

**Find:**
> The Pectrack homepage includes a top navigation bar with branding and utility icons, a hero section with a bold "Ready for pickup" headline accompanied by "Browse products" and "Order pickup" buttons, and a "Customer Favorites" section displaying horizontal product cards for Spanish Bread, Egg Pie, and Pinagong with their respective prices and status tags.

**Replace with:**
> The home page presents the bakery in its own colours and photographs. The top bar links to Home, Menu, Our Story, and Visit Us, with Sign in and Create account on the right. The opening section, "Warm bread, baked every morning", offers "See today's menu" and "Sign in to order", followed by the product categories and the bakery's history since 1947.

### p. 23 — after Figure 1.2 ✔

**Find:**
> After accessing login, The Admin, Cashier, Delivery Personnel and Customer are redirected on their specific dashboards while the customers are in the home page.

**Replace with:**
> After signing in, the Admin and Cashier are taken to their Dashboard, the Delivery Personnel to My Deliveries, and the Customer to the Menu. Signing out returns every user to the Home page.

### p. 72 — Flowchart, Delivery Personnel ✔

**Find:**
> …the user is redirected to the Rider Dashboard.

**Replace with:**
> …the user is redirected to the My Deliveries page.

### p. 72 — Flowchart, Customer ✔

**Find:**
> Only active customers are granted access to the Home Page, where they can browse products, place orders, and track order status.

**Replace with:**
> Only active customers are granted access; they are taken to the Menu, where they can browse products, place orders, and track order status.

### Optional — Figure 1.3, staff sign-in (new figure, after Figure 1.2)

> The staff entrance of the same pop-up is used by the admin, cashiers, and delivery personnel. After a valid password, the admin must also enter the six-digit one-time code sent by email.

---

## B2 — Registration

### p. 22 — Figure 1.1 description **(redo: replace the whole paragraph)**

**Find** the whole Figure 1.1 paragraph. It starts "The Customer
Registration screen of the PecTrack web portal features a two-panel card
layout…" and ends "…keeping the registration process clean and
straightforward for new customers."

**Replace with:**
> Registration opens in the same pop-up window as sign-in. The form asks for the customer's full name, username, contact number, email address, password, and password confirmation, and requires agreement to the Terms of Service and Privacy Policy. A password must be at least 12 characters long and include uppercase and lowercase letters, a number, and a symbol; common passwords are refused. A username, email address, or contact number already in use is refused. After registering, the customer receives a confirmation link by email and can place an order only once the email address is confirmed.

---

## B3 — Dashboard

### pp. 24–25 — Figures 2 and 2.1 ✔

These were replaced with one shared description:
> The Dashboard of the admin and cashier opens with a greeting that states how many things need attention. A "Today" row shows the number of orders, the amount ordered, and the amount collected for the day. Below it, status tiles are colour-coded green for Good, yellow for Okay, and red for Needs attention: Low stock, Running low, Expired stock, Orders to prepare (red when an order is past its requested time), Deliveries to assign, Bulk orders to approve (admin only), Unpaid balances, and Likely to sell out (from the sales forecast). Clicking a tile opens the module already filtered to the problem; for example, the Low stock tile opens Inventory Management showing only low-stock products. A "Restock first" list shows the products furthest below their minimum stock level.

No more text needed. Optionally add after it: "The cashier's dashboard
(Figure 2.1) is the same without the Bulk orders to approve tile."

### pp. 25–26 — Figure 2.2 **(redo)**

**Replace** the sentence you pasted ("Delivery personnel have no separate
dashboard. They sign in to My Deliveries…") and any old text left after
it, with:
> Delivery personnel have no separate dashboard; after signing in they land on My Deliveries, built for use on a phone. Each assigned delivery shows the customer's name, a tap-to-call contact number, the delivery address, the order total marked as paid, and a "Start delivery" button. There is no map or GPS tracking; delivery is a status checklist.

---

## B4 — Customer Management

### p. 13 — Purpose and Description, Admin and Cashier access ✔

**Find:**
> The Admin has full access to everything within this module, including the ability to view the complete customer list, create new customer records, modify and update existing customer information, and oversee all customer-related data across the system. The Cashier has limited access within this module, restricted only to searching for existing customers, viewing customer details, and editing customer information when necessary to ensure records remain accurate and up to date.

**Replace with:**
> Customers create their own accounts through registration. The Admin has full access within this module, including the ability to view the complete customer list, update existing customer information, and deactivate or reactivate customer accounts. The Cashier has limited access within this module, restricted to searching for existing customers and viewing customer details; editing is reserved for the Admin to protect the integrity of the records. Walk-in customers do not need an account.

### p. 14 — Customer access ✔

**Find:**
> The Customer has limited access within this module, restricted only to viewing their own profile and updating their own personal information.

**Replace with:**
> The Customer has limited access within this module, restricted only to viewing their own profile, updating their own personal information, managing their saved delivery addresses, and changing their password or email address.

### p. 14 — sentence in the wrong module ✔

**Delete** from the end of Customer Management:
> The system automatically displays only products that are currently available and hides expired or unavailable items to maintain product quality and inventory accuracy.

**Then, in the Inventory Management paragraph on p. 14, find:**
> Additionally, inventory levels are automatically adjusted whenever an order is placed.

**Replace with:**
> Additionally, inventory levels are automatically adjusted whenever an order is placed. Each product can have an expiration date; the menu shows only products that are available and not expired, and expired stock cannot be ordered.

### p. 26 — Scope, Customer Management Module ✔

**Find:**
> Admin can view and edit customers for new information. Cashiers are able to search and retrieve customer records during transactions…

**Replace with:**
> Customers can save several delivery addresses, each with a recipient name, contact number, and delivery notes, and choose one as the default. The admin can view, edit, and deactivate or reactivate customer accounts. Cashiers are able to search and retrieve customer records during transactions…

### pp. 27–28 — Figure 3 description ← **continue here**

**Find** the paragraph that starts "The Pectrack Customer Records admin
portal features a navigation menu highlighting "Customer Records,"…" and
ends "…tools for updating account status and administrative notes."

**Replace with:**
> The admin's Customer Management page lists every registered customer with their name, username, contact number, email address, and account status, with a search box above. Each row has an Edit button and a Deactivate button.

### p. 28 — Figure 4 description

**Find** the paragraph that starts "The Customer Management interface of
the Pectrack cashier portal is designed to provide…" and ends "…ease of
navigation for cashiers and staff."

**Replace with:**
> The cashier sees the same customer list and search, without the Edit and Deactivate buttons.

### p. 29 — Figure 5 description

**Find** the paragraph that starts "The Pectrack user profile interface
features a navigation header, a personalized greeting banner for
"Yancy"…" and ends "…status labels like "Ready for pickup" or
"Completed.""

**Replace with:**
> The customer's account page greets them by name and shows the number of orders placed, the orders in progress, and the total amount ordered. Three tabs follow: My Profile, My Orders, and My Payments. My Orders lists the customer's orders, newest first, with their status; selecting one shows its items, delivery progress, the balance due with a "Pay now" button, and, while the order is still Placed, a Cancel button that asks for a reason.

### pp. 29–30 — Figure 5.1 description

**Find** the paragraph that starts "The Pectrack personal information
interface features a top navigation bar…" and ends "…accompanied by an
"Edit Profile" button for making updates."

**Replace with:**
> My Profile has three sections: Profile, Addresses, and Password. The Profile section shows the username and lets the customer update their full name and contact number. Changing the email address requires the current password.

### p. 30 — Figure 5.2 description

**Find** the paragraph that starts "The Pectrack saved addresses
interface features a top navigation bar…" and ends "…both accompanied
by specific delivery notes."

**Replace with:**
> The Addresses section lists the customer's saved addresses, marks the default one, and has an "Add address" button. The first address saved becomes the default automatically.

### p. 31 — Figure 5.3 description

**Find** the paragraph that starts "The Pectrack account settings
interface features a top navigation bar…" and ends "…were not carried
into the final system.)"

**Replace with:**
> The Password section changes the account password. The current password is required, and the new one must meet the same rules as at registration.

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

### p. 36 — Figure 10 description

**Find** the paragraph that starts "The Pectrack Product & Inventory
admin portal features a navigation menu highlighting "Product &
Inventory,"…" and ends "…action buttons to edit or delete the product."

**Replace with:**
> Product Management shows the categories at the top, a form for a new product, and the product list, where each product can be edited, given a photo, or deleted.

### Optional — Figure 10.1, Inventory Management (new figure, after Figure 10)

> Inventory Management lists each product's stock, minimum level, expiration date, and colour-coded status. The status buttons at the top filter the list. The Change requests tab holds the cashiers' requests for the admin to approve or reject.

### p. 36 — Figure 11 description

**Find** the paragraph that starts "The Pectrack Product & Inventory
cashier portal features a navigation menu…" and ends "…what's the low
stock and out of stock products."

**Replace with:**
> In "Propose a change", the cashier chooses a product and either proposes a corrected stock count (for example, after a recount) or reports a loss, with a reason. "My requests" shows whether each request is pending, approved, or rejected.

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

**Find** the paragraph that starts "The Pectrack Order Management admin
portal includes a navigation menu…" and ends "…tools for updating the
order status and notes."

**Replace with:**
> The admin's Order Management page lists the orders with their customer, date placed, requested time, total, and status, and can be searched and filtered by status. At the top, the admin sets the number of items above which an order needs the admin's approval. Selecting an order opens its detail: items and prices, delivery progress, the amount paid and balance due, the status controls, and the status history. In the example, an unpaid delivery order is flagged "Not paid yet — don't bake it".

### pp. 32–33 — Figure 7 description

**Find** the paragraph that starts "The Order Management interface of
the Pectrack cashier portal is designed to efficiently organize…" and
ends "…workflow efficiency, and overall user experience."

**Replace with:**
> The cashier's Order Management page has two tabs: Orders, the same searchable order list and detail as the admin's, and New order, for orders taken at the counter.

### Optional — Figures 7.1 and 7.2 (new figures, after Figure 7)

Figure 7.1, New order at the counter:
> The cashier searches for the customer or leaves the order as a walk-in, chooses Pickup or Delivery, adds the products and quantities, and may add special instructions. The order summary on the right totals the order before it is placed.

Figure 7.2, Production — Due today:
> The Production page shows the open orders due on the chosen day, hour by hour, with the total of each product still to make at the top. Late and due-soon orders are highlighted, and unpaid delivery orders are tagged "Not paid — don't bake yet". The page can be printed or saved as PDF.

### pp. 33–34 — Figure 8 description

**Find** the paragraph that starts "The Order Detail screen of the
PecTrack Delivery Personnel Portal displays the full information…" and
ends "…update the order status in real time."

**Replace with:**
> After the delivery personnel taps "Start delivery", the card shows the proof-of-delivery photo upload, which opens the phone's camera or gallery and accepts up to five photos, a "Mark delivered" button, and a "Mark failed" button with a field for the reason.

**Proof of delivery (p. 16) — decided 2026-10-13: reword the paper.** The
system lets delivery personnel upload photos but does not require one,
and the failure reason is optional.

**Find** (pp. 15–16):
> To ensure accountability and verification, delivery personnel are also required to upload proof of delivery, such as a photo or confirmation, once the order has been successfully handed over to the customer.

**Replace with:**
> For accountability, delivery personnel can also upload photos as proof of delivery once the order has been handed over to the customer.

### p. 34 — Figure 9 description

**Find** the paragraph that starts "The Pectrack products page features
a top navigation header with search and profile icons…" and ends
"…stock status badges."

**Replace with:**
> The Menu shows the bakery's products grouped by category, with a search box and category shortcuts at the top. Each product card shows its photo, name, size or pack, and price, with a quantity stepper and Add to cart.

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

### pp. 37–38 — Figure 12 description

**Find** the paragraph that starts "The Pectrack Payment & Billing admin
portal features a navigation menu highlighting "Payments & Billing,"…"
and ends "…"View" buttons for detailed action."

**Replace with:**
> The Payment log lists every payment with its order, customer, method, amount, status, the staff member who recorded it, and the date, and can be filtered by date range, method, and status.

### p. 38 — Figure 13 description

**Find** the paragraph that starts "The Payment & Billing screen of the
pectrack cashier portal displays a clean and organized table…" and ends
"…aligns with the overall PecTrack branding."

**Replace with:**
> The Billing tab lists the orders that still owe money. Selecting one shows its receipt, with a "Print / Save as PDF" button, and below it the form for recording a cash or GCash payment.

### pp. 39–40 — Figures 14 and 14.1

Figure 14 becomes Delivery Management, and Figure 14.1 is removed (see
`PAPER_FIGURES.md`).

**Find** the paragraph that starts "The Payment Verification and Proof
of Delivery screens are two separate but related screens…" and ends
"…enforce accountability and transparency in the delivery workflow."

**Replace with:**
> In Delivery Management, the admin and cashier assign each delivery order to a delivery person and follow it through to delivered. Only confirmed, fully paid orders can be assigned, so delivery personnel never handle payments. The admin can call back a delivery whose driver can no longer finish it, and send a failed delivery back to the queue.

### pp. 40–41 — Figure 15 description

**Find** the paragraph that starts "The Pectrack checkout interface
includes a header with navigation and utility icons, an "Order Basket"
section…" and ends "…before clicking the "Place Order" button."

**Replace with:**
> At checkout the customer chooses "Pickup at the bakery" or "Delivery". For delivery, a notice explains that the order is paid in full with GCash before baking starts, and the customer picks one of their saved addresses or adds another. The customer may add special instructions and a requested date and time. The order summary shows the items and the estimated total; there is no delivery fee.

### p. 41 — Figure 15.1 description

**Find** the paragraph that starts "The Pectrack checkout page displays
a navigation header with utility icons…" and ends "…finalizing the
transaction with the "Place Order" button."

**Replace with:**
> A pickup order needs no address. The customer pays online beforehand from My Payments, or at the counter when collecting the order.

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

Nothing separate: delivery text is in B3 (Figure 2.2), B6 (Figure 8,
p. 15, flowchart), B7 (Figure 14), and B9 (Figure 18). If the panel asks
about a map: delivery is a status workflow (Assigned, Out for Delivery,
Delivered or Failed), not live tracking. This is in the Part E
Limitations suggestions.

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

### p. 43 — Figure 16 description

**Find** the paragraph that starts "The Pectrack Reporting & Analytics
admin portal features a navigation menu highlighting "Reports &
Analytics,"…" and ends "…accompanied by an "Export PDF" button."

**Replace with:**
> The Sales tab: the date range and grouping at the top, then the orders placed, the amount ordered, the amount collected, and refunds for the period, followed by the sales chart.

### Optional — Figure 16.1, Forecast (new figure, after Figure 16)

Wording depends on decision D4.
> The Forecast tab shows the expected sales for the coming week, how many products need baking now, and how accurate the forecast has been on past weeks, followed by a "What to bake" list.

### pp. 43–44 — Figure 17 description

**Find** the paragraph that starts "The Reporting and Analytics screen
of the PecTrack Cashier Portal provides a quick overview…" and ends
"…for record-keeping or submission purposes."

**Replace with:**
> The cashier's Reporting & Analytics, showing the Transactions tab: the payment records with filters for date, method, and status.

### p. 44 — Figure 18 description

**Find** the paragraph that starts "The Delivery Reports screen of the
pectrack delivery personnel portal gives the delivery staff a personal
summary…" and ends "…saved or submitted for documentation purposes."

**Replace with:**
> The History tab of My Deliveries counts the deliveries delivered and failed and those assigned now for a chosen date range, then lists each finished delivery with its customer, address, and the time it was delivered or failed. It can be printed or saved as PDF.

### p. 76 — Flowchart, Administrator access

**Find:**
> Only the Administrator has full access to this module to ensure the confidentiality and integrity of business data.

**Replace with:**
> The Administrator has full access to this module. Cashiers see the same reports except Report History, and reports are view-only for everyone, to ensure the integrity of business data.

### p. 77 — Flowchart, Customer

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
