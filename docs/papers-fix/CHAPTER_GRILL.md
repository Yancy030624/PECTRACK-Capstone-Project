# PECTRACK paper: chapter-by-chapter grill

**For:** the whole group
**Based on:** `docs/PECTRACK_REVISED.pdf` (the version from October 29, 2026), split into `docs/papers-fix/chapters/`
**Page numbers** are PDF page numbers (the number in the PDF viewer).

Each round lists the decisions the group accepted. Tick a box (☐ → ☑) when the change is made in the paper.

---

## Round 1: Front matter and Chapter 1, pages 1–12 (accepted 2026-10-29)

| ☐ | Where | Change |
|---|---|---|
| ☐ | Title: p. 1, p. 2, p. 6, p. 11, General Objective (p. 21), and every other mention | "…with Predictive Analytics and **Inventory System**…" becomes "…with Predictive Analytics and **Automated Inventory**…". Check first that the endorsed title may still be changed. |
| ☐ | Title page and endorsement form (p. 1–2) | "May 2026" becomes the month of submission, unless the school's template fixes the proposal date. |
| ☐ | Problem 6, "Manual Inventory Monitoring and Production Planning" (p. 10) | Its text is a copy of the payment problem. Replace it with the text below. |
| ☐ | Problem 5's solution (p. 10) and every online-payment mention | "the bakery's QR Ph code" becomes "the bakery's **GCash QR code**"; "bank or e-wallet app" becomes "GCash". This matches the system, which accepts only GCash's numeric reference numbers. QR Ph may be named once, in Chapter 3 Technical Background, as the standard behind the code. |
| ☐ | Background of the Problem, first paragraph (p. 7) | Add at the end: "The proposed system, however, accepts online delivery orders within Lucban only, as stated in the Scope and Limitations." |
| ☐ | p. 11–12 | "…subject to the approval provided by the adviser" becomes "…as approved by the adviser". |
| ☐ | Problem 7 (p. 11), and every "switch to actual sales after 56 days" | Use the corrected wording below (Round 11). The switch itself already works this way; the per-product accuracy display needs the adviser's OK. |
| ☐ | Project Context (p. 5) and References | "Jimenez et al. (2024)" becomes "Velasquez Jimenez et al. (2024)", with the corrected reference from Step 5 of `OBJECTIVES_ALIGNED.md`. |

**Problem 6 text (paste over the copied payment text):**

> ● **Manual Inventory Monitoring and Production Planning:** Based on the follow-up consultations with the management, soft breads are baked every morning up to a daily standard quantity, while hard breads are baked again once their stock falls to a minimum level. Demand also rises on weekends and during events such as Holy Week, the Pahiyas Festival, and Christmas. At present, the stock on the shelves is checked manually; Mrs. Abillar explained that a staff member checks and counts the stock, and the quantities to bake are decided from experience. During busy periods, this makes it difficult to know how many pieces of each product are left, which products need to be baked, and how much more to prepare for a coming weekend or event. To address this problem, PECTRACK will deduct stock automatically as orders are placed, update the counts on screen in real time, list what to bake each day based on the daily standards, minimum levels, weekends, events, and advanced orders, and warn the staff when a product runs low.

Evidence: Appendix B, 07:55 ("may nag-e-inventory kasi ng stock"). The transcript does not say that breads sell out; only the ube and munggo fillings sometimes run out (08:31), so the paper does not claim it.

**Problem 7, last sentence (replaces "…and it will switch to actual sales after 56 days."):**

> …and it will switch to actual sales once 56 days are recorded, the shortest history on which its accuracy can be measured on four test weeks. From then on, each product's measured accuracy is shown beside the same-day-last-week estimate.

**Corrected in Round 11:** the earlier rule ("switch only when the forecast beats same-day-last-week") was dropped. The chosen method can never be worse than the benchmark, because the benchmark is one of the candidates, so a product whose best method is the benchmark would never switch; and a run must not mix assumed and actual data. **System change (needs the adviser's OK):** show each product's measured accuracy on the Forecast tab, beside the benchmark's (plan: `RULES-PLANS/FORECAST_ACCURACY_PLAN.md`). Sources: `papers-rrl/PREDICTIVE_ANALYTICS_RRL.md`, section 3.

---

## Round 2: Chapter 1, pages 12–20, Purpose and Description (accepted 2026-10-29)

☐ **Replace the whole Purpose and Description (p. 12 to the end of p. 20) with the text below.** It applies every Round 2 decision:

1. The opening is formal, with three roles and the new title.
2. Registration has no email confirmation: a pop-up asks for the SMS code.
3. Cashiers have no "deliveries" access; they confirm GCash payments.
4. The Dashboard tile for deliveries awaiting a rider becomes Payments to Confirm.
5. Order Management: the 15-minute hold applies only until a reference is sent, there are no riders, and a counter GCash payment needs the reference number.
6. Online orders: times start at 6:00 AM, the fee is ₱50 (not ₱20), and the Menu shows stock left with a + button.
7. Inventory: products use Add and Deduct (Burnt or Fallen to the floor), and counts update in real time.
8. Payment and Billing: staff confirm each GCash payment on the To Confirm tab, and receipts are on the customer's Orders tab.
9. Notifications: no riders, Unread or Read, and the email list matches the system.
10. Reports: the Inventory tab shows deducted pieces with the reason.
11. Module names are bold headings, not bullets.

The forecast sentence in the last module uses the Round 11 wording.

> ## Purpose and Description
>
> PECTRACK is a web-based Order Management System with Predictive Analytics and Automated Inventory developed to improve the daily transactions of Pecto's Bakery in Lucban, Quezon. The system streamlines the processes of ordering, payment, product tracking, and inventory management, making these operations faster and more organized. By replacing paper-based and manual procedures with digital record-keeping, the system reduces errors and saves time for both the staff and the customers of the bakery.
>
> The name PECTRACK was derived from *Pecto's Bakery* and the word *Track*, reflecting the system's capability to monitor the bakery's baked products, specifically the number of items produced, currently available, and sold. Through this capability, the bakery maintains an up-to-date view of its product inventory at all times.
>
> The system caters to three user roles, namely the Admin, the Cashier, and the Customer, each of which is granted access and functions suited to its responsibilities. Since all data are stored digitally, the system provides a more reliable and efficient experience for both the business and its customers. The system is accessible on both computers and mobile phones.
>
> The following modules are incorporated in the proposed study.
>
> **Login Module**
>
> The Login Module secures the system by verifying the identity of each user before granting access. The sign-in form opens as a pop-up window over the page the visitor is currently viewing and provides two entrances: Customer and Admin. The Admin entrance is used by the administrator and the cashiers, and each entrance refuses accounts that belong to the other. To sign in, users enter their username or email address together with their password, after which the system validates the credentials and determines the level of access based on the user's assigned role. To protect accounts from unauthorized access, the system locks an account for 15 minutes after five failed sign-in attempts. Users who forget their password may request a password reset link through email. When the "Keep me logged in" option is selected, the user remains signed in on that device for up to seven days; otherwise, the session ends once the browser is closed.
>
> New customers register by providing their first and last name, username, email address, contact number, and password. After the customer presses Create Account, a pop-up asks for the six-digit code sent by SMS to the contact number, and a correct code creates the account, which can place orders at once.
>
> The administrator account is subject to an additional layer of security. After passing credential validation, the administrator must enter a six-digit One-Time Password (OTP) sent by email, which remains valid for five minutes. The administrator may mark the device as trusted for 30 days, after which signing in on that device requires only the password; changing the password removes all trusted devices. Once verified, the administrator is directed to the Dashboard and is given full access to all modules.
>
> The other users are likewise directed to the page appropriate to their role. Cashiers are directed to the Dashboard and are given access to the operational features of the system, namely orders, walk-in and advanced orders, inventory and production, payments, including the confirmation of GCash payments, and the payment log, while the User Management and Reporting and Analytics modules remain exclusive to the administrator. Customers are directed to the online Menu, where they browse products, place and pay for orders, and track the progress of their orders.
>
> **Dashboard Module**
>
> The Dashboard Module provides the administrator and the cashier with an at-a-glance overview of the matters that require attention. At the top, a "Today" row presents the orders paid for the day, the day's sales excluding delivery fees, and the cash orders that remain unpaid. Below this row, color-coded status tiles, in which green indicates Good, yellow indicates Okay, and red indicates Needs Attention, summarize the soft breads about to be sold out, the hard breads and ingredients low on stock, the GCash payments waiting to be confirmed, and the orders for the day. Selecting a tile opens the corresponding module already filtered to the concern. The Dashboard also displays a Running Out list of products with low stock, a Needed By list of paid orders still to be picked up or delivered, each marked according to how near its requested time is, and a list of the most recent orders.
>
> **User Management Module**
>
> The User Management Module maintains the records of the individuals who use the system. It is accessible only to the administrator and is organized into two tabs: Customers and Staff. Under the Customers tab, the administrator can search the customer list, correct a customer's details, and deactivate or reactivate an account. Customers create their own accounts through registration, which refuses any username, email address, or contact number already in use, and they manage their own profile, saved delivery addresses, and password through their account page. Under the Staff tab, the administrator creates and manages the accounts of cashiers, edits their details, resets their passwords, and deactivates or reactivates their accounts.
>
> **Order Management Module**
>
> The Order Management Module oversees each order from placement to completion. In line with the policy of the bakery, every order is paid before it is released to the customer. An order progresses from Ready for Pickup or Ready for Delivery, to Out for Delivery in the case of deliveries, and finally to Completed. An online order paid through GCash is held while the customer pays: if the customer does not send the payment's reference number within 15 minutes, the system releases the order and returns its stock to inventory. Once a reference number is sent, the order waits as Waiting for Payment Confirmation until a staff member confirms or rejects the payment, and it is not released automatically. Alternatively, a pickup order may be paid in cash at the counter. Such an order is immediately placed as Ready for Pickup and is marked Not Paid until the cashier records the cash payment, with the order details indicating the payment method. A customer may have only one unpaid cash order at a time, and any cash order not collected by the end of its scheduled day is automatically cancelled. Delivery orders, on the other hand, are payable through GCash only and carry a delivery fee of ₱50. Since the bakery does not grant refunds, paid orders cannot be cancelled; however, customers may cancel their own unpaid cash orders.
>
> Staff members view the orders for the current day, the upcoming orders, or the orders for any chosen date, which may be filtered by status and searched by order number or customer name. Each order displays its items, requested time, payment, and progress. For a delivery order, a staff member marks the order as Out for Delivery when it leaves the bakery and as Delivered once it reaches the customer.
>
> Counter orders are handled by the cashier through the Walk-in tab and are classified into walk-in orders and advanced orders. A walk-in order is placed by a customer who is present at the counter, requires no customer details, and is paid in full through cash or GCash; a printable receipt showing the cash received and the change serves as its proof of order. An advanced order, by contrast, is picked up on a later date and requires the customer's name, contact number, which is verified through an SMS code, and the preferred pickup date and time. It is likewise paid in full through cash or GCash, and the order number is sent to the customer by SMS as proof of order, which remains accessible even without an internet connection. For a GCash payment at the counter, the cashier enters the reference number shown on the customer's phone. To add products to either type of order, the cashier types the first letters of a product's name and selects it from the list of matching products, and quantities may be entered directly.
>
> For online orders, customers browse the Menu, where each product shows the stock left and a round plus (+) button that adds it to the cart and then changes the quantity. Customers then choose between pickup and delivery. They may leave the time blank to receive the order as soon as it is ready, or they may select a date and one of the available time slots, which are offered every 30 minutes from 6:00 AM to 10:00 PM for up to 30 days in advance. The first slot is set one hour after the 5:00 AM bake so that the breads have cooled before release, while walk-in sales at the counter start at 5:00 AM. A pickup order may be paid in cash at the counter or immediately through GCash, whereas a delivery order is paid through GCash with the ₱50 delivery fee added to the total. Saved delivery addresses are limited to Lucban, Quezon, with the customer providing the street, barangay, and other necessary details.
>
> **Inventory Management Module**
>
> The Inventory Management Module keeps the stock of every product up to date. Stock is automatically deducted when an order is placed, with the stock of an online GCash order set aside while the payment is being made, and is automatically returned when an unpaid order is released or cancelled. Every change in stock appears at once on every open screen, so the staff always see the current count. The module follows the two methods of stocking practiced by the bakery, one for soft breads and another for hard breads.
>
> Each soft bread is assigned a daily standard stock. Every day at 5:00 AM, the system automatically tops up each soft bread to its standard, wherein the leftovers from the previous day are sold first and only the difference is baked. Soft breads are not restocked during the day. A soft bread is labeled About to Be Sold Out when its stock falls below one-fifth of its standard and Sold Out Today when its stock reaches zero. A soft bread ordered in advance is baked on its pickup day in addition to the standard, so that it does not reduce the stock available to walk-in customers for that day. Each hard bread, on the other hand, is assigned a minimum level, which signals when to produce, and a stop level, which determines how much to produce. A hard bread is labeled Low Stock when its stock is at or below its minimum level.
>
> The stock of a product may be adjusted in two ways. When stock is added, the pieces received are added to the quantity on hand, and the system asks the user to confirm the new total before saving. When stock is deducted, the user enters the number of pieces and the reason, either burnt or fallen to the floor. Every change is recorded together with the user who made it and the time it was made.
>
> The Production tab lists the quantity of each product to be baked for a chosen day. For a soft bread, the quantity is computed as the standard less the stock on the shelf, plus the advanced orders for that day. For a hard bread at its minimum level, the quantity is the stop level less the stock on hand. Hard breads are automatically built up to twice the stop level beginning Thursday in preparation for the weekend, and to the multiplier of an event, which is four times the stop level by default, beginning one week before the event. The administrator maintains an Events calendar covering Holy Week, the Pahiyas Festival, Christmas, New Year, and long weekends, and the Production list indicates which event or weekend raised the quantity. Beside each product, a forecast check displays the expected sales for that day. When the forecast expects more sales than the planned stock, the list shows the shortfall, for example "+20 more," and a count of such products appears at the top of the list. While the stocking rules continue to determine the quantities to be baked, the forecast check serves as a warning before a product sells out. The Production list may also be printed.
>
> The module also monitors the stock of ingredients. Staff members record ingredient deliveries, the administrator corrects the counts after a physical check, and ingredients that reach their minimum level are flagged. Through the Edit Products tab, the administrator maintains the product catalog, including each product's category, bread type (soft or hard), price, size or pack, description, photo, and availability for sale.
>
> **Payment and Billing Module**
>
> The Payment and Billing Module processes and records every payment made in the system. At the counter, the cashier records cash payments, for which the system computes the change from the amount received, or GCash payments together with their reference numbers. Online orders for cash pickup are likewise paid at the counter upon collection. For an online GCash payment, the customer scans the bakery's GCash QR code, pays the exact amount, and enters the reference number shown in GCash. The payment then appears on the To Confirm tab, which lists the waiting payments from the oldest and marks any that has waited for more than 30 minutes. A staff member checks the bakery's GCash account for the reference number and amount, then confirms the payment, which releases the order as Ready for Pickup or Ready for Delivery, or rejects it with a reason, which cancels the order and returns its stock. A reference number can be used only once, and each decision is recorded with the staff member who made it and the time it was made. The administrator uploads the bakery's GCash QR code and account name on the same screen. Delivery orders are paid in full in advance, inclusive of the delivery fee, as cash on delivery is not offered.
>
> Each paid order is issued a digital receipt showing the items purchased, the delivery fee if applicable, the total amount, the amount received, and the change. Staff members can view the orders ready for pickup or delivery as well as the completed orders, each with its payment method and payment status. The Payment Log lists every payment received, may be filtered by date and payment method, and may be exported as a PDF file. Customers, for their part, can view their own receipts on the Orders tab of their account.
>
> **Notifications**
>
> The system keeps its users informed through several channels. Within the application, a notification bell alerts the administrator and the cashiers of new orders, GCash payments waiting to be confirmed, deliveries, and orders due within the hour. Each notification is marked Unread or Read, and a pop-up message and sound play only for a new unread notification. When a product falls to its minimum level, the administrator and the cashier receive a red low-stock warning accompanied by a distinct sound, which opens the Inventory module when selected. Through email, customers are notified when their payment is confirmed or not accepted, when their order is ready for pickup, when it is on the way, when it is delivered, and when it could not be delivered. Through SMS, the order number of an advanced order is sent to the customer.
>
> **Reporting and Analytics Module**
>
> The Reporting and Analytics Module transforms the recorded data of the bakery into reports and forecasts. It is accessible only to the administrator. Every report may be printed or saved as a PDF file, and the sales report and the forecast may also be exported in CSV format. The module is organized into five tabs. The Sales tab presents the sales, defined as the money received excluding delivery fees, together with the number of orders and the delivery fees for any date range, grouped by day, week, or month. It also presents a chart of sales and orders, the sources of sales by payment method (cash or GCash) and by order type (walk-in, online pickup, or delivery), the unpaid cash orders, and the peak ordering periods by hour and by day of the week. The Products tab ranks the best-selling products by the number of pieces sold, for all breads or for soft or hard breads only, together with their revenue. The Inventory tab shows, for the selected dates, the number of pieces of each product baked or added, sold, and deducted, together with the reason for each deduction. The Forecast tab presents the expected sales of each product for the next seven days and identifies the busiest day ahead. Finally, the Export History tab records every report downloaded or printed, together with the user who did so and the time it was done.
>
> The payment log, as previously discussed, is located in the Payment and Billing Module. The reports reflect the actual transactions of the bakery; however, a Demo Data switch adds the practice orders used to demonstrate the reports, and the screen indicates when this switch is turned on.
>
> The forecasting feature of the module employs three methods: a seasonal naïve baseline, Holt-Winters exponential smoothing, and multiple linear regression. The multiple linear regression is a supervised machine learning model that learns from the daily sales history the extent to which each day of the week, payday, holiday, and bakery event raises or lowers sales. The three methods are compared for each product through a rolling four-week backtest, and the most accurate method is selected. The forecast runs automatically every night after the sales of the day are complete. It learns from the assumed sales history until 56 days of actual sales are recorded, the shortest history on which its accuracy can be measured on four test weeks, after which it learns from the actual sales. Each product's measured accuracy is shown beside that of a simple same-day-last-week estimate. The administrator may also run the forecast manually at any time. The forecast guides the setting of the daily standards and the hard bread levels, and the forecast check in the Production list warns when a product is expected to sell more than the planned quantity.
>
> These modules work together to form an integrated system that supports the operational needs of the business. The system is designed with simplicity and ease of use as its primary considerations, enabling staff and customers to use its features without extensive technical knowledge. By integrating these modules into a single web-based platform, the system provides a structured, reliable, and efficient approach to order and business management.

**Code cleanup found while checking (not a paper item):** the checkout page still has a "Confirm your email" message (`src/pages/customer-storefront/CheckoutPage.jsx:255`). New accounts are created already confirmed, so it never shows for them.

---

## Round 3: Chapter 1, pages 21–57, Objectives and Scope and Limitations (accepted 2026-10-29)

### 3a. Objectives (p. 21–23): replace with this text

Each objective is a numbered title on its own line, with its explanation below. Changes: the title, Objective 5 (GCash), Objective 7 (switch rule, "did not have. The system"), and "Staff record" in Objective 6.

> **General Objective**
>
> The general objective of this study is to design, develop, and implement PECTRACK: A Web-Based Order Management System with Predictive Analytics and Automated Inventory for Pecto's Bakery in Lucban, Quezon. The system centralizes the bakery's online, walk-in, and advanced orders, customer records, order status, payments, and product inventory in a single web-based platform, and demonstrates demand forecasting to support the bakery's inventory planning.
>
> **Specific Objectives**
>
> Specifically, this study aims to accomplish the following:
>
> 1. **To centralize the bakery's order management in a single web-based platform.**
> The system receives online orders through the bakery's web storefront, and walk-in and advanced orders through the cashier's counter screen, and lists all of them in one order list that every authorized staff member sees. This replaces the separate handling of Facebook messages by the admin and walk-in orders by the sales lady, and reduces inconsistent records and miscommunication.
>
> 2. **To record and process customer orders digitally.**
> Every order is saved with its items, quantities, prices, requested pickup or delivery time, and a daily order number, and each paid order has a printable receipt. Recording an order also deducts its stock automatically. This removes handwritten order slips and the misplaced slips, missing details, and copying errors that come with them.
>
> 3. **To maintain centralized and secure customer records and order history.**
> Customers with accounts keep their contact details, saved delivery addresses, and past orders with their receipts, so the bakery and the customer can retrieve them at once. Access is limited to authorized users: customers verify their mobile number with an SMS code, the administrator signs in with a one-time password sent by email, accounts are locked for 15 minutes after five failed sign-in attempts, and each role sees only its own functions.
>
> 4. **To provide order status monitoring and scheduling.**
> Customers choose a pickup or delivery time in 30-minute slots from 6:00 AM, an hour after the 5:00 AM bake, so the breads have cooled before release, and staff see which orders are needed next. Each order moves through Ready for Pickup or Ready for Delivery, Out for Delivery, and Completed; staff update the status in the system, and customers see it on their orders and receive email updates. Advanced orders reserve their bread when they are placed: hard breads are taken from the stock, and soft breads are added to the bake list for the pickup day. Customers see when their order is ready instead of messaging the bakery to ask.
>
> 5. **To record payments and link them to order release.**
> The system records cash and GCash payments and shows each order's payment status. For an online GCash payment, the customer scans the bakery's GCash QR code, pays, and enters the reference number shown in GCash; a staff member confirms each payment before the order is released. An order is released only once paid, and delivery orders are paid in full beforehand, following the bakery's policy. A payment log lists every payment and can be exported as a PDF.
>
> 6. **To automate the monitoring of the bakery's product inventory.**
> Stock is deducted as orders are placed and returned when an unpaid order is cancelled, and the counts update on screen in real time. Soft breads are topped up to their daily standard every morning, hard breads are flagged for production at their minimum level, and a warning appears when a product runs low. Staff record added stock and deductions, each logged with who made it.
>
> 7. **To provide reports and demonstrate demand forecasting for inventory planning.**
> Every sale is recorded by product and date, building a sales history the bakery did not have. The system reports sales, best-selling products, peak ordering periods, and inventory movements. It forecasts each product's sales for the next seven days, comparing a machine learning regression with two simpler methods and using the most accurate one. The forecast is demonstrated on assumed historical sales, as approved by the adviser, so its results illustrate the method rather than verified predictions of the bakery's sales, and it switches to the bakery's actual sales once 56 days are recorded, the shortest history on which its accuracy can be measured on four test weeks. From then on, each product's measured accuracy is shown beside the same-day-last-week estimate.

### 3b. Scope intro and beneficiaries (p. 24): replace with this text

> The general purpose of this study is to design, develop, and implement PECTRACK, a web-based Order Management System with Predictive Analytics and Automated Inventory for Pecto's Bakery in Lucban, Quezon. The system operates as an e-commerce platform that enables customers to browse products, place and pay for orders, and track their orders online, while providing the bakery with a centralized system for managing its daily operations.
>
> The target users and beneficiaries of this study are the customers, the administrator, and the cashiers of Pecto's Bakery. The customers benefit from browsing products and ordering online without having to visit the store. The administrator gains full control of the system, including the products, inventory, production, users, and reports. The cashiers are provided with a structured means of taking walk-in and advanced orders, recording and confirming payments, managing stock, and marking delivery orders Out for Delivery and Delivered.

### 3c. Figures (p. 25–55)

| ☐ | Figure | Change |
|---|---|---|
| ☐ | Fig 2.2 My Deliveries (p. 31), Fig 8 Delivery in progress (p. 40), Fig 15 Delivery Management with the "DELIVERY MANAGEMENT MODULE" heading (p. 50), Fig 17 Transactions (p. 54), Fig 18 Delivery history (p. 55) | **Delete**, with their text. Renumber the figures after them. |
| ☐ | Fig 2 Admin dashboard | Retake: it must show the **Payments to confirm** tile. |
| ☐ | Fig 5 (p. 34) | Becomes **"Customer account — Orders"**: "The customer's account page has a compact header that shows who is signed in, with a Sign Out button, and two tabs, Profile and Orders. The Orders tab lists the customer's orders, newest first, with their status; selecting one shows its items, requested time, delivery progress, and the receipt with the payment. A customer may cancel their own unpaid cash order." |
| ☐ | Fig 5.2 (p. 36) | Delete the two sentences about three tabs ("In the final system…" and "The customer account page has three tabs…"). |
| ☐ | Fig 6 (p. 37) | "A status can only move forward; cancelling requires a reason" becomes "A status can only move forward. An unpaid order may be cancelled with a reason; a paid order cannot be cancelled." |
| ☐ | Fig 7 (p. 38) | "New order" becomes **"Walk-in"**. |
| ☐ | Fig 7.1 text (p. 39) | "For a delivery awaiting a rider, the order details also provide an Assign Rider control" becomes "For a delivery order, the order details provide the Out for Delivery and Delivered buttons." |
| ☐ | Fig 9 Menu (p. 41) | "together with an Add to Cart button" becomes "together with the stock left and a round plus (+) button, which becomes − n + to change the quantity". Retake. |
| ☐ | Fig 14.1 (p. 49) | "The customer pays online beforehand from My Payments, or at the counter when collecting the order" becomes "The customer pays in cash at the counter when collecting the order, or with GCash right after pressing Proceed Payment." Retake. |
| ☐ | Fig 10 (p. 42) | Replace the description with: "The Products tab lists every product in one list, each labelled Soft bread or Hard bread, with status filters (Good, About to Be Sold Out, Sold Out Today, and Low Stock) and category filters. The counts update in real time as orders are placed." |
| ☐ | Fig 10.1 (p. 43) | Caption becomes **"Edit (Add / Deduct)"**. |
| ☐ | Fig 11.1 text (p. 45) | "lists soft breads and hard breads separately" becomes "lists all products in one list, each labelled Soft bread or Hard bread"; "the Correct Count option" becomes "the Deduct option, which asks for the number of pieces and the reason (Burnt or Fallen to the floor)". |
| ☐ | New figure, Payment and Billing | **"Payment & Billing — To confirm"**: "The To Confirm tab lists the GCash payments waiting for a staff member, oldest first, and marks any that has waited for more than 30 minutes. Each shows the order, the amount, and the reference number, with Confirm and Reject buttons. The administrator uploads the bakery's GCash QR code and account name here." |
| ☐ | New figure, checkout | **"Pay with GCash (customer)"**: "After Proceed Payment, the customer sees the bakery's GCash QR code beside the reference number box, the exact amount to pay, and a Cancel Order button. The order is held for 15 minutes until a reference number is sent." |
| ☐ | New figure, checkout | **"Waiting for payment confirmation (customer)"**: "After the reference number is sent, the page shows it with the amount, says that the bakery is checking it, and updates by itself. The customer is emailed once the payment is confirmed or not accepted." |
| ☐ | Reporting opening paragraph (p. 51) | Replace with: "The Reporting and Analytics Module has five tabs, Sales, Products, Inventory, Forecast, and Export History, and is accessible to the administrator only. Every report can be printed or saved as PDF." |
| ☐ | Fig 16 Sales (p. 52) | Replace with: "The Sales tab shows the date range and grouping at the top, then the sales (money received, delivery fees not included), the number of orders, and the cash orders not yet paid, followed by the sales chart and a table by period that includes the delivery fees." |
| ☐ | Closing sentence (p. 55) | Delete "Delivery personnel, on the other hand, can view their own delivery history over a chosen date range." |

### 3d. Limitations (p. 55–57): replace with this text

Limitation 4 uses the Round 11 wording. If the adviser does not approve the per-product accuracy display, delete the sentence marked †. The old sentence about the "Method test (practice data)" figure is gone either way, because that figure was removed from the screen.

> 1. **Prototype and Data Exclusivity for Pecto's Bakery Only.** The PECTRACK system is developed for, and tailored to, the operational needs of Pecto's Bakery in Lucban, Quezon, and all of its modules, workflows, and database structures follow the existing business processes of the bakery. All data stored, processed, and generated within the system, including product information, customer records, transaction histories, inventory data, and reports, belong to Pecto's Bakery and are used solely for the purpose of this capstone project. Delivery is limited to the municipality of Lucban, Quezon, for a flat delivery fee of ₱50. Delivery orders must be paid in full beforehand through GCash, as the system does not offer cash on delivery. Cash is accepted only at the counter, including for online pickup orders paid upon collection, and paid orders are not refunded.
>
> 2. **Network Dependency.** As a web-based platform, the system requires a stable internet connection. Any network interruption on the part of the cashier or the customers may disrupt order placement, status updates, and payment processing.
>
> 3. **Ingredient Monitoring Only.** Ingredient stock is monitored but not automated. Since the system does not store recipes, ingredients are not deducted when bread is baked; instead, ingredient counts are kept current through recorded deliveries and the administrator's stock checks.
>
> 4. **Assumed Sales History for the Forecast.** The bakery has not kept sales records that the system can import. As approved by the adviser, the forecast is therefore demonstrated on an assumed one-year sales history built from the patterns described by the bakery, namely higher sales on weekends, sales of about four times the usual during events, mainly in hard breads, and payday effects. The assumed data are labeled as such and are kept out of the sales reports. The forecasting method is validated on this assumed history, so its accuracy there shows how well the method fits the assumed pattern rather than the actual demand of the bakery. † Each product's measured accuracy is shown on the Forecast tab, labeled as practice data while the forecast runs on the assumed history. The system switches to actual sales once 56 days are recorded, the shortest history on which its accuracy can be measured on four test weeks, and its accuracy on the bakery's actual sales is measured from then on. To demonstrate the reports, practice orders may be added; these are marked as practice data and appear only when the Demo Data switch is turned on. Furthermore, on days when a product sells out, the true demand is unknown, so those days are excluded from the forecast's learning.
>
> 5. **Manual Confirmation of GCash Payments.** GCash payments are confirmed by a staff member, not automatically. The bakery's GCash QR code does not notify the system when a payment arrives, so a staff member checks each reference number and amount against the bakery's GCash account before the order is released. Automatic confirmation would need a paid payment gateway, which charges a fee on every payment. Any fee for receiving GCash payments depends on the bakery's own GCash account, not on the system.
>
> 6. **Customer Records for Account Holders Only.** Customer records and order history cover the customers who have accounts. A walk-in order keeps the customer's name, and an advanced order also keeps the contact number, but neither is linked to a customer record.
>
> 7. **Facebook Messages Outside the System.** The system does not read the bakery's Facebook messages. The bakery's Facebook page directs customers to the PECTRACK storefront, and an order received through a message is entered by a staff member on the counter screen as a walk-in or advanced order.

### 3e. System change (waits for the adviser)

Show each product's measured accuracy on the Forecast tab, beside the same-day-last-week benchmark, labelled as practice data while the forecast runs on assumed history. Codex removed the overall accuracy card on 2026-10-29 (commit d0db088). Plan: `RULES-PLANS/FORECAST_ACCURACY_PLAN.md`.

---

## Round 4: Chapter 2, pages 57–71, Review of Related Literature (accepted 2026-10-29)

Every source below was checked against its journal or publisher page on 2026-10-27 (`papers-rrl/PREDICTIVE_ANALYTICS_RRL.md`). Removing or replacing the existing sources waits for the citation check (Round 5).

| ☐ | Change |
|---|---|
| ☐ | Add the subsection in 4a under **Foreign Literature**, after "Predictive Analytics for Sales Forecasting and Inventory Optimization" (Mansur). |
| ☐ | Add the two studies in 4b under **Foreign Studies**, before Alzoubi. |
| ☐ | Add the paragraph in 4c to the Synthesis, after the paragraph on foreign literature ("Foreign literature also highlights…"). |
| ☐ | Add the paragraph in 4d to the end of the Synthesis, after the paragraph on foreign systems. Confirm with the group that the printable receipt is not a BIR-registered official receipt. |
| ☐ | Add the references in 4e. |
| ☐ | Headings: section (Related Literature, Related Studies, Related Systems — plural) → Local / Foreign → topic in bold → each study's title on its own line, never running into the paragraph. |
| ☐ | Keep Hyndman and Kostenko (2007) as a foundational source. If the school allows only sources from the last five years, delete it and keep the sentence on minimum data with Hyndman and Athanasopoulos (2021) only. |

### 4a. New subsection under Foreign Literature

> **Forecasting Methods, Evaluation, and Data Requirements**
>
> *Principles of Forecasting Methods*
>
> Hyndman and Athanasopoulos (2021), in their textbook *Forecasting: Principles and Practice*, define the seasonal naïve method, Holt-Winters exponential smoothing, and regression with calendar variables, together with time-series cross-validation and error measures such as the mean absolute error. The textbook is widely used as a standard reference in forecasting. However, it presents general methods that must still be tested on the data of each business. This literature is relevant to PECTRACK because it is the basis of the three forecasting methods the system compares and of the way the system tests them.
>
> *Minimum Data for Seasonal Forecasting Models*
>
> Hyndman and Kostenko (2007) examined how much data seasonal forecasting models require. They explained that a model must always have more observations than parameters; with a weekly season of seven days, a regression with seasonal variables needs at least nine observations and Holt-Winters at least twelve. However, these minimums hold only for data with very little random variation, and real sales data usually need more. This literature is relevant to PECTRACK because it shows that the system's 56 days of actual sales are well above the theoretical minimum, while also explaining why the system measures the forecast's accuracy instead of relying on a number of days alone.
>
> *Evaluating Forecasting Models in Time Order*
>
> Cerqueira, Torgo, and Mozetič (2020) compared methods for estimating forecast accuracy on 174 real-world time series. For real and non-stationary data, the most accurate estimates came from methods that preserve the time order of the data, especially holdout testing repeated over several periods. However, such testing requires enough history to set aside several test periods. This study is relevant to PECTRACK because the system's rolling four-week backtest tests each method on four separate weeks that come after the data it learned from.
>
> *Best Practices in Forecast Evaluation*
>
> Hewamalage, Ackermann, and Bergmeir (2023) reviewed common pitfalls in evaluating forecasts. They recommended rolling-origin testing, which preserves the time order of the data, warned that percentage errors break down when sales are very small, and stressed that every method must be compared against simple benchmarks. However, their guidelines are general and must be applied to each business's data. This study is relevant to PECTRACK because the system compares its methods against the seasonal naïve benchmark and reports the mean absolute error, which remains valid on days with low sales.
>
> *Forecasting Theory and Practice*
>
> Petropoulos and colleagues (2022) presented an extensive review of forecasting theory and practice written by leading forecasting researchers. The review covers how data are prepared, how forecasts are produced and evaluated, and how they are applied in fields such as retail. However, its breadth means that each business must still choose the methods suited to its own data. This literature is relevant to PECTRACK because it provides an authoritative overview of the forecasting practices the system follows.
>
> *Retail Forecasting Research and Practice*
>
> Fildes, Ma, and Kolassa (2022) reviewed forecasting research and practice in retail, from strategic decisions down to forecasts for individual products, including the effects of calendar events, promotions, and new products. However, much of the reviewed work comes from large retailers with extensive data. This literature is relevant to PECTRACK because it shows that daily, product-level forecasting with calendar effects is an established practice in retail.
>
> *Daily Retail Sales Forecasting Competition*
>
> Makridakis, Spiliotis, and Assimakopoulos (2022) reported the results of the M5 competition, which forecast the daily unit sales of 42,840 Walmart product series and compared every method against benchmarks on the same data. However, the competition used far more data than a small bakery has. This study is relevant to PECTRACK because it supports comparing several methods on the same sales data before choosing one, which the system does for each product.
>
> *Statistical and Machine Learning Methods for Daily Demand*
>
> Spiliotis, Makridakis, Semenoglou, and Assimakopoulos (2022) compared statistical and machine learning methods for forecasting the daily demand of individual products. Some machine learning methods were more accurate, but not all of them, and not in every case. However, their results depend on the characteristics of the data used. This study is relevant to PECTRACK because the system does not assume that its regression model is always the most accurate, and instead selects the best method for each product.
>
> **Forecasting in Bakeries**
>
> *Daily Demand Forecasting at a Bakery Chain*
>
> Huber and Stuckenschmidt (2020) forecast the daily demand of the stores of a bakery chain. Machine learning methods outperformed established forecasting methods, and special calendar days such as holidays needed separate treatment. However, the study used the data of a chain with many stores. This study is relevant to PECTRACK because it is the closest match to the system: a bakery, daily demand, and calendar effects, which the system's regression includes as variables for holidays and bakery events.
>
> *Demand Forecasting Against Food Waste in Bakeries*
>
> Hübner, Caspers, Coroamă, and Finkbeiner (2024) studied a machine learning sales forecasting service used by bakeries. Its use was associated with an average 30% reduction in returned unsold bread and rolls in 2022, and its environmental benefits outweighed its own impacts. However, the results came from bakeries that already had sales records. This study is relevant to PECTRACK because it shows how forecasting can help a bakery plan its production and reduce unsold products.
>
> *Using Sales Forecasts in a Bakery*
>
> Fries and Ludwig (2024) conducted a design case study of machine learning sales forecasting in a bakery. Setting up the data and processes was a major challenge, the measured quality of the forecasts did not always match how the staff perceived them, and the staff's trust in the algorithm was the most important factor in its use. However, the study examined one bakery. This study is relevant to PECTRACK because the system presents the forecast as a check beside the bakery's own production rules, so the staff remain in control of what to bake.
>
> **Learning from Generated Data**
>
> *Generated Time Series for Limited Data*
>
> Bandara, Hewamalage, Liu, Kang, and Bergmeir (2021) showed that when real data are scarce, generating synthetic time series and training forecasting models on them improved forecasting accuracy on competition and real-world datasets. However, generated data must reflect the patterns of the real data. This study is relevant to PECTRACK because it supports the adviser-approved approach of demonstrating the forecast on assumed sales history built from the patterns described by the bakery.

### 4b. Two studies under Foreign Studies

> *Order Management Software for Small and Medium-Sized Enterprises*
>
> Velasquez Jimenez and colleagues (2024) examined the design and evaluation of order management software for small and medium-sized enterprises (SMEs) in Lima, Peru. Their study involved 308 employees and reported positive evaluations of the system's usability and perceived operational efficiency. However, the evaluation measured the employees' perceptions rather than changes in order errors or processing time. This study is relevant to PECTRACK because it supports the use of a centralized order management system in small businesses.
>
> *Web-Based Order Management for Multiple Sales Channels*
>
> Sinaga and Johan (2024) designed a web-based Order Management System to help a company consolidate the transactions it received through multiple online marketplaces. However, the system focused on online marketplace orders and did not cover walk-in transactions. This study is relevant to PECTRACK because the system also brings orders from different channels, the online storefront and the counter, into one order list.

### 4c. Synthesis: why these forecasting methods

> The reviewed forecasting literature also guided the design of PECTRACK's forecast. Following Hewamalage and colleagues (2023), every method is compared against a simple benchmark, the seasonal naïve method, which expects the same sales as on the same day of the previous week. Holt-Winters exponential smoothing and multiple linear regression with variables for the day of the week, payday, holidays, and bakery events were chosen because they are standard methods for seasonal daily data (Hyndman & Athanasopoulos, 2021) and because special calendar days strongly affect bakery demand (Huber & Stuckenschmidt, 2020). Since no single method is always the most accurate (Makridakis et al., 2022; Spiliotis et al., 2022), the system compares the three methods for each product through a rolling four-week backtest, which tests them in time order on weeks they have not seen (Cerqueira et al., 2020). Fifty-six days of actual sales, which provide 28 days of learning followed by four test weeks, are well above the theoretical minimum for weekly seasonal models (Hyndman & Kostenko, 2007); however, a number of days alone does not guarantee accuracy. The system therefore switches to actual sales at 56 days, when accuracy can first be measured, and shows each product's measured error beside the seasonal naïve benchmark's, so the bakery can see how reliable each forecast is (Fries & Ludwig, 2024). Until then, demonstrating the forecast on assumed data follows the practice of developing forecasting models on generated series when real data are scarce (Bandara et al., 2021).

If the adviser does not approve the per-product accuracy display, replace the last two sentences with: "The system therefore reports the measured accuracy of each method, and the forecast's results are treated as a guide rather than a guarantee. Until the 56 days are reached, demonstrating the forecast on assumed data follows the practice of developing forecasting models on generated series when real data are scarce (Bandara et al., 2021)."

### 4d. Synthesis: PECTRACK is not a point-of-sale system

> Several of the reviewed systems, such as StoreHub POS, Square for Restaurants, and Toast, and the studies of Divina and colleagues (2025) and Orquesta (2026), are point-of-sale (POS) systems. PECTRACK is not a POS system. A POS system records sales at the checkout counter, while PECTRACK manages each order from placement to completion across the online storefront and the counter, with scheduled pickup and delivery, payment confirmation, automated inventory, production planning, and forecasting. Its counter screen is one of the ways orders enter the system; it does not provide a barcode scanner, a cash drawer, receipt printer integration, or BIR-registered official receipts.

### 4e. References to add (APA 7th edition)

> Bandara, K., Hewamalage, H., Liu, Y.-H., Kang, Y., & Bergmeir, C. (2021). Improving the accuracy of global forecasting models using time series data augmentation. *Pattern Recognition, 120*, 108148. https://doi.org/10.1016/j.patcog.2021.108148
>
> Cerqueira, V., Torgo, L., & Mozetič, I. (2020). Evaluating time series forecasting models: An empirical study on performance estimation methods. *Machine Learning, 109*. https://doi.org/10.1007/s10994-020-05910-7
>
> Fildes, R., Ma, S., & Kolassa, S. (2022). Retail forecasting: Research and practice. *International Journal of Forecasting, 38*(4), 1283–1318. https://doi.org/10.1016/j.ijforecast.2019.06.004
>
> Fries, M., & Ludwig, T. (2024). "Why are the sales forecasts so low?" Socio-technical challenges of using machine learning for forecasting sales in a bakery. *Computer Supported Cooperative Work (CSCW), 33*(2). https://doi.org/10.1007/s10606-022-09458-z
>
> Hewamalage, H., Ackermann, K., & Bergmeir, C. (2023). Forecast evaluation for data scientists: Common pitfalls and best practices. *Data Mining and Knowledge Discovery, 37*(2), 788–832. https://doi.org/10.1007/s10618-022-00894-5
>
> Huber, J., & Stuckenschmidt, H. (2020). Daily retail demand forecasting using machine learning with emphasis on calendric special days. *International Journal of Forecasting, 36*(4), 1420–1438. https://doi.org/10.1016/j.ijforecast.2020.02.005
>
> Hyndman, R. J., & Athanasopoulos, G. (2021). *Forecasting: Principles and practice* (3rd ed.). OTexts. https://otexts.com/fpp3/
>
> Hyndman, R. J., & Kostenko, A. V. (2007). Minimum sample size requirements for seasonal forecasting models. *Foresight: The International Journal of Applied Forecasting, 6*, 12–15.
>
> Makridakis, S., Spiliotis, E., & Assimakopoulos, V. (2022). M5 accuracy competition: Results, findings, and conclusions. *International Journal of Forecasting, 38*(4), 1346–1364. https://doi.org/10.1016/j.ijforecast.2021.11.013
>
> Petropoulos, F., et al. (2022). Forecasting: Theory and practice. *International Journal of Forecasting, 38*(3), 705–871. https://doi.org/10.1016/j.ijforecast.2021.11.001
>
> Spiliotis, E., Makridakis, S., Semenoglou, A.-A., & Assimakopoulos, V. (2022). Comparison of statistical and machine learning methods for daily SKU demand forecasting. *Operational Research, 22*(3), 3037–3061. https://doi.org/10.1007/s12351-020-00605-2

Hübner et al. (2024) and Labastida et al. (2024) are already in the reference list. Before printing:
- add the page ranges for Cerqueira et al. (2020) and Fries and Ludwig (2024);
- format the Petropoulos et al. (2022) author list as your school requires: APA 7 lists the first 19 authors, then "…", then the last author.

---

## Round 5: Chapter 3, pages 71–103, and the Chapter 2 citation check (accepted 2026-10-29)

### 5a. Tense and title page (the whole paper)

| ☐ | Change |
|---|---|
| ☐ | The next defense is the **final** defense. Remove "Proposal" from the title page ("A Capstone Project Presented to…") and from the endorsement form if the school's form allows it. |
| ☐ | Methodology (Chapter 3): use the **past tense** for what the group did ("The study used the Agile Methodology", "The Sprint Testing phase was adopted…"). Replace every "will be adopted", "will adapt", "will prepare for actual deployment". |
| ☐ | System descriptions (Chapters 1 and 3): use the **present tense** for what the system does ("The system deducts…"). The texts in Rounds 2–4 already do. Replace "will provide", "will record", "aims to" in the Background of the Problem's solutions with present tense ("PECTRACK provides…"). |
| ☐ | Calendar of Activities (p. 88): "Sprint Resting" becomes "Sprint Testing". |

### 5b. Technologies to be Used (p. 76–80)

Rename the heading "Technologies Used". The versions in the paper are correct (React 19.2, Tailwind CSS 4.3, Node.js 22, Chart.js 4.5). Check PostgreSQL 18 on Railway (`SELECT version();`). Add these entries in the same style, each with its logo:

> **Express (Version 5)**
> Express is a web framework for Node.js used to build the back end of PECTRACK. It defines the routes that receive requests from the browser, such as placing an order, recording a payment, or updating stock, and passes them to the system's logic and database.
>
> **Vite (Version 8)**
> Vite is the build tool used to run the React front end during development and to package it into optimized files for deployment. It reloads changes instantly while coding, which shortened each development cycle.
>
> **Railway**
> Railway is the cloud platform that hosts PECTRACK. It runs the Node.js server and the PostgreSQL database, provides the secure HTTPS address of the system, and redeploys the system automatically whenever a new version is pushed.
>
> **textbee**
> textbee is the SMS service used to send the six-digit verification codes for customer registration and advanced orders, and the order numbers of advanced orders.
>
> **Gmail API**
> The Gmail API is used to send the system's emails, including the administrator's one-time password, password reset links, and order and payment notices to customers.
>
> **Server-Sent Events and PostgreSQL LISTEN/NOTIFY**
> The real-time stock counts use PostgreSQL's LISTEN/NOTIFY feature, which signals the server whenever stock changes, and Server-Sent Events, which push the new counts to every open screen without reloading the page.

Add after the PostgreSQL entry:

> The forecasting methods, namely the seasonal naïve baseline, Holt-Winters exponential smoothing, and multiple linear regression, are written in the system's own code. PECTRACK does not use an outside forecasting library or an artificial intelligence service.

### 5c. Flowchart descriptions (p. 81–86): replace, and redraw the flowcharts (also in Appendix C)

> **Login Module Flow Chart**
> The Login Module verifies the identity of each user and grants access according to the user's role. The user opens the sign-in pop-up, chooses the Customer or Admin entrance, and enters a username or email address and a password. The system validates the credentials. Invalid credentials are refused, and after five failed attempts the account is locked for 15 minutes. An account that belongs to the other entrance, or that has been deactivated, is also refused. For the administrator, the system sends a six-digit one-time password by email unless the device is trusted; an incorrect or expired code is refused. Once verified, the administrator and the cashiers are directed to the Dashboard, and customers are directed to the Menu.
>
> **User Management Module Flow Chart**
> The administrator opens User Management from the Dashboard. On the Customers tab, the system lists the registered customers, and the administrator searches the list, corrects a customer's details, or deactivates or reactivates an account. On the Staff tab, the administrator creates cashier accounts, edits their details, resets their passwords, and deactivates or reactivates them. The system validates every change; invalid data shows an error message and is not saved. A customer registers through the storefront. The system checks that the username, email address, and contact number are not already in use, sends a six-digit code by SMS, and creates the account once the code is entered correctly. The customer then manages their own profile, saved addresses, and password from the Profile tab of their account; changing the email address requires the current password.
>
> **Inventory Management Module Flow Chart**
> The administrator or the cashier opens Inventory Management, and the system lists every product with its current stock and status. When an order is placed, the system checks that enough stock is available; if it is not, the system notifies the user and the order cannot proceed. Otherwise, the stock is deducted, and it is returned if an unpaid order is released or cancelled. Staff add stock, or deduct pieces with a reason (burnt or fallen to the floor); the system asks for confirmation, records who made the change, and updates the count on every open screen. Every day at 5:00 AM, the system tops up each soft bread to its daily standard. When a product reaches its minimum level, the system shows a red low-stock warning. Customers see the stock left on the Menu, and sold-out products cannot be ordered.
>
> **Order Management Module Flow Chart**
> A customer browses the Menu, adds products to the cart, chooses pickup or delivery and a time, and chooses the payment method. A pickup paid in cash is placed at once as Ready for Pickup and marked Not Paid. An order paid with GCash is held for 15 minutes while the customer pays and sends the reference number; once a staff member confirms the payment, the order becomes Ready for Pickup or Ready for Delivery, and if the payment is rejected or no reference is sent in time, the order is cancelled and its stock returned. At the counter, the cashier opens the Walk-in tab, chooses a walk-in or an advanced order, adds the products, and records the payment in full; a walk-in order prints a receipt, and an advanced order's number is sent to the customer by SMS. Staff then move each order forward: a delivery order is marked Out for Delivery and then Delivered, and a pickup order is marked Completed when it is collected. The administrator views and manages all orders in the same list.
>
> **Payment and Billing Module Flow Chart**
> At the counter, the cashier selects the order and records a cash payment, for which the system computes the change from the amount received, or a GCash payment with its reference number; the system saves the payment and marks the order as paid. For an online GCash payment, the customer scans the bakery's GCash QR code, pays, and enters the reference number. The system refuses a reference number that was already used, and the payment appears on the To Confirm tab. A staff member checks the bakery's GCash account for the reference number and amount. If the payment is confirmed, the order is released and the customer is emailed; if it is rejected, a reason is recorded, the order is cancelled, its stock is returned, and the customer is emailed. The administrator and the cashiers view every payment in the Payment Log and export it as a PDF.
>
> **Reporting and Analytics Module Flow Chart**
> The administrator opens Reporting and Analytics, selects a date range and a grouping by day, week, or month, and may turn on the Demo Data switch. The system retrieves the paid orders and stock movements for that range and shows the Sales, Products, Inventory, and Forecast tabs. Each report can be printed, saved as a PDF, or, for the sales report and the forecast, exported as CSV, and every export is recorded in the Export History tab with the user and the time. Customers view their own orders and receipts on the Orders tab of their account.

Add one new flowchart:

> **Production and Forecast Flow Chart**
> Every night after the day's sales are complete, the system runs the forecast. It checks whether at least 56 days of actual sales are recorded; if so, it learns from the actual sales, and otherwise from the assumed history. For each product, it fits the three methods, tests each on the rolling four-week backtest, keeps the method with the lowest mean absolute error, and forecasts the next seven days. When a staff member opens the Production tab for a chosen day, the system computes the quantity of each product to bake from the stocking rules, namely the daily standards, the minimum and stop levels, the weekend and event multipliers, and the advanced orders, and shows the forecast beside each product, flagging any product whose forecast is higher than the plan.

After choosing the method, the system stores each product's measured error and the benchmark's, which the Forecast tab shows.

### 5d. Product Backlog (p. 93–96)

Replace the list of modules in both Product Backlog sections with: user authentication with SMS and email verification, dashboard, user management, product management, order processing (online, walk-in, and advanced orders), inventory monitoring with real-time stock, production planning with events, payment recording with GCash payment confirmation, notifications, sales reporting, and demand forecasting.

| ☐ | Change |
|---|---|
| ☐ | Delete the proof-of-delivery sentence ("Additionally, the proof-of-delivery image capturing feature was included to allow delivery personnel…"). |
| ☐ | "The proponents also included QR Ph integration to support digital payment processing methods such as GCash" becomes "The proponents also included GCash QR payments, which staff confirm by their reference numbers before an order is released." |
| ☐ | "including digital payments processed through QR Ph" (p. 96) becomes "including GCash payments confirmed by staff". |
| ☐ | Add after the sales reporting sentence: "The production planning feature lists what to bake each day from the bakery's stocking rules, weekends, and events, and the demand forecasting feature estimates each product's sales for the next seven days to warn when a product may sell out." |

### 5e. Sprint Planning (p. 94–97): one version

Keep one Sprint Planning text in Requirements Analysis and one in Requirements Documentation, both with the same three sprints. Delete the two extra copies of "According to the requirements approved by the client, the basic modules…".

> The first sprint covered user authentication, the dashboard, and product management, because they provide secure access and the product data that every other module depends on. The second sprint covered order processing, inventory monitoring and production planning, and payment recording, because they represent the bakery's daily operations and require the product and user data from the first sprint. The third sprint covered sales reporting and demand forecasting, the client's requested revisions, and deployment, so that the reports and forecasts were built on validated transaction data and every requested improvement was in place before deployment.

### 5f. Use case (p. 98–99): fix the text and redraw the diagram

| ☐ | Change |
|---|---|
| ☐ | "the four main roles namely the Admin, Cashier, and Customer" and "Each of the four roles" become **three**. |
| ☐ | Admin: "managing products, approving stock changes and bulk orders, generating reports, assigning deliveries, and managing user accounts, including cashier accounts" becomes "managing products, inventory, production, and events, generating reports and forecasts, and managing user accounts, including cashier accounts". (Stock-change approvals and the bulk-order threshold were removed; there are no rider accounts.) |
| ☐ | Cashier: "create orders for walk-in customers, update order status, record cash and GCash payments" becomes "create walk-in and advanced orders, update order status, record cash and GCash payments, confirm online GCash payments, and add and deduct stock". |
| ☐ | Customer: "They can also cancel orders" becomes "They can also cancel their own unpaid cash orders". |

### 5g. System Security (p. 101–103)

Replace the session paragraph:

> Session management is also enforced throughout the system. Each user is assigned a unique session token upon login. When the "Keep me logged in" option is selected, the session lasts for up to seven days; otherwise, it ends when the browser is closed. Signing out ends the session, and changing the password signs the account out of every other device.

Replace "After a defined number of consecutive failed login attempts, the account is temporarily locked" with "After five failed login attempts, the account is locked for 15 minutes".

Replace the Payment Security paragraph:

> Payment Security: Online payments are made in the customer's own GCash app by scanning the bakery's GCash QR code. PECTRACK never receives or stores the customer's GCash credentials or any card details; it stores only the reference number and the amount of each payment. A staff member confirms each payment against the bakery's GCash account before the order is released, and a reference number can be used only once, so the same payment cannot be claimed for two orders. Each confirmation or rejection is recorded with the staff member who made it and the time it was made.

In Data Privacy, replace "beyond what is necessary for payment processing through QR Ph" with "beyond what is necessary for sending SMS codes and email notices through the system's SMS and email services".

### 5h. Chapter 2 citation check (checked 2026-10-29 on publisher and journal pages)

| ☐ | Source | Action |
|---|---|---|
| ☐ | Cruz, Mendoza, & Dela Cruz (2022); Lopez, Garcia, & Reyes (2023); Santos & Villanueva (2023); Salazar (2024); Alzoubi & Snider (2022); Sharma et al. (2023); Singh et al. (2024) | **Not found anywhere.** Delete each paragraph, its mention in the Synthesis, and its reference entry. |
| ☐ | Taqueban & Villamor (2024) | An unpublished student thesis by Abao, Baja, & Taqueban, with no Villamor and an unconfirmed year. **Delete.** |
| ☐ | Alzoubi, Elrehail, et al. (2022) in the reference list | Real, but about supply chain integration in healthcare; it does not support the order management claims. **Delete.** |
| ☐ | Krishnamurthy et al. (2024) | Real, but in a weak journal. **Delete**; Fildes et al. (2022) and Petropoulos et al. (2022) cover the same point. |
| ☐ | "Comparative Study of AutoML and Machine Learning in Retail Forecasting" (2025) | Cite as **Kristian and Suri (2025)**. Reference: Kristian, D., & Suri, P. A. (2025). Comparative study of AutoML and machine learning in retail forecasting. *Procedia Computer Science, 269*, 882–891. https://doi.org/10.1016/j.procs.2025.09.031 |
| ☐ | Pattnaik et al. (2025) | Pattnaik, M., Padhi, S. K., Panda, L., Naushad, U., Behera, R. K., Mishra, A., & Pattnaik, A. (2025). AI-driven sales forecasting in retail: Insights from Big Bazaar's sales data. *International Journal of Management Science and Engineering Management, 21*(1), 1–14. https://doi.org/10.1080/17509653.2025.2499076 |
| ☐ | Divina et al. (2025) | Add DOI: https://doi.org/10.51584/IJRIAS.2025.1010000066 |
| ☐ | Lo et al. (2025) | DOI: https://doi.org/10.51584/IJRIAS.2025.10100000135 |
| ☐ | Orquesta (2026) | Orquesta, R. D. (2026). Enhancing inventory control through sales forecasting. *International Journal on Science and Technology, 17*(1). https://doi.org/10.71097/IJSAT.v17.i1.10371 |
| ☐ | Culili (2026) | Add DOI: https://doi.org/10.56648/aide-irj.v16i1.285 |
| ☐ | Custodio et al. (2026) | DOI: https://doi.org/10.51584/IJRIAS.2026.110100137 |
| ☐ | van der Haar et al. (2024) | *European Journal of Operational Research, 319*(2), 573–586. https://doi.org/10.1016/j.ejor.2024.07.004 |
| ☐ | Mansur et al. (2025) | *PeerJ Computer Science, 11*, e3058. https://doi.org/10.7717/peerj-cs.3058 |
| ☐ | Local Studies | Add Labastida et al. (2024), already in the reference list, and the verified Philippine studies from the background search (Round 6). |

**After the deletions:** Related Studies keeps Labastida (local) and Velasquez Jimenez and Sinaga & Johan (foreign, Round 4b). Rewrite the Synthesis paragraph on local studies (p. 70) and the one on foreign studies to name only the remaining studies (Round 7 gives the text).

---

## Round 6: Chapter 3, pages 104–114, Database Design (accepted 2026-10-29)

Taken from the database itself on 2026-10-29 (`information_schema`, after all 43 migrations). The local database runs PostgreSQL 18.6, which matches the paper; check the Railway version with `SELECT version();`.

| ☐ | Change |
|---|---|
| ☐ | Redraw Figure 32 (Relational Database Diagram) from the 25 tables below, with the real table and column names. |
| ☐ | Replace the table descriptions (p. 105–114) with the data dictionary below. |
| ☐ | p. 105: "the system's six primary modules: Login, User Management, …" becomes "the system's eight modules: Login, Dashboard, User Management, Order Management, Inventory Management, Payment and Billing, Notifications, and Reporting and Analytics". |
| ☐ | Add the supporting-tables paragraph after the dictionary. |
| ☐ | Add the normalization example to the Third Normal Form paragraph. |

### 6a. Data dictionary

> **users**: the login account of every user, whatever the role.
> PK: user_id. Attributes: user_id, username, password_hash, user_type (ADMIN, CASHIER, or CUSTOMER), is_active, failed_login_attempts, locked_until, created_at, updated_at. Referenced by: admins, cashiers, customers, inventory_movements, ingredient_movements, order_status_history, payments, forecast_runs, report_logs, security_events.
>
> **admins**: the profile of each administrator.
> PK: admin_id. FK: user_id → users. Attributes: admin_id, user_id, name, contact_num, email. Referenced by: report_logs.
>
> **cashiers**: the profile of each cashier.
> PK: cashier_id. FK: user_id → users. Attributes: cashier_id, user_id, name, contact_num, email. Referenced by: orders (processed_by).
>
> **customers**: the profile of each registered customer.
> PK: customer_id. FK: user_id → users. Attributes: customer_id, user_id, first_name, last_name, name, contact_num, contact_verified_at, email, email_verified_at, created_at, updated_at. Referenced by: customer_addresses, orders.
>
> **customer_addresses**: the saved delivery addresses of a customer, so one customer can keep several.
> PK: address_id. FK: customer_id → customers. Attributes: address_id, customer_id, label, recipient_name, contact_num, address_line_1, address_line_2, barangay, municipality, province, postal_code, delivery_notes, is_default, is_active, created_at, updated_at. Referenced by: orders.
>
> **categories**: the groups that products belong to.
> PK: category_id. Attributes: category_id, category_name. Referenced by: products.
>
> **products**: the bakery's product catalog.
> PK: product_id. FK: category_id → categories. Attributes: product_id, category_id, product_name, description, price, variant (size or pack), availability_status, image_key, stock_type (SOFT or HARD). Referenced by: inventory, order_details, forecasts, forecast_models, assumed_daily_demand.
>
> **inventory**: the current stock of each product and its stocking levels.
> PK: inventory_id. FK: product_id → products. Attributes: inventory_id, product_id, stock_quantity, standard_stock (the daily standard of a soft bread), min_stock_level (the minimum of a hard bread), target_stock (the stop level of a hard bread), last_updated. Referenced by: inventory_movements, stock_alerts.
>
> **inventory_movements**: the ledger of every stock change, which is the source of the Inventory report and of restoring stock on cancellation.
> PK: movement_id. FK: inventory_id → inventory; order_id → orders; changed_by → users. Attributes: movement_id, inventory_id, order_id, changed_by, quantity_change, reason (for example, ORDER_PLACED, ORDER_CANCELLED, RESTOCK, REJECT for a deduction, DAILY_STOCK for the 5:00 AM top-up), note, data_source (RECORDED, or ASSUMED for the practice orders shown only with the Demo Data switch), created_at.
>
> **stock_alerts**: the low-stock warnings raised when a product reaches its minimum level.
> PK: alert_id. FK: inventory_id → inventory. Attributes: alert_id, inventory_id, alert_message, is_resolved, created_at.
>
> **events**: the bakery's events calendar used by the Production list.
> PK: event_id. Attributes: event_id, name, starts_on, ends_on, multiplier (four by default), applies_to, lead_days (seven by default), created_at.
>
> **orders**: every order, online or at the counter.
> PK: order_id. FK: customer_id → customers (empty for a walk-in); address_id → customer_addresses (for a delivery); processed_by → cashiers. Attributes: order_id, customer_id, processed_by, address_id, order_date, order_day, daily_number (the order number of the day), status, order_type (PICKUP or DELIVERY), is_reservation (an advanced order), requested_fulfillment_time, payment_mode (CASH or GCASH), delivery_fee, total_amount, instructions, guest_name, guest_contact, guest_contact_verified_at, guest_email, receipt_token_hash, data_source (RECORDED, or ASSUMED for practice orders). Referenced by: order_details, order_status_history, payments, deliveries, inventory_movements.
>
> **order_details**: the products in each order.
> PK: order_detail_id. FK: order_id → orders; product_id → products. Attributes: order_detail_id, order_id, product_id, quantity, unit_price (the price at the time of the order).
>
> **order_status_history**: every status change of an order, with who made it.
> PK: history_id. FK: order_id → orders; updated_by → users. Attributes: history_id, order_id, updated_by, status (for example, AWAITING_PAYMENT, READY_FOR_PICKUP, READY_FOR_DELIVERY, OUT_FOR_DELIVERY, COMPLETED, CANCELLED), note, updated_at.
>
> **daily_order_numbers**: the last order number given out on each day, so order numbers restart every day.
> PK: day. Attributes: day, last_number.
>
> **deliveries**: the delivery progress of each delivery order.
> PK: delivery_id. FK: order_id → orders. Attributes: delivery_id, order_id, status, assigned_at, delivered_at, failed_at, note.
>
> **payments**: every payment recorded for an order.
> PK: payment_id. FK: order_id → orders; recorded_by → users; verified_by → users. Attributes: payment_id, order_id, recorded_by, payment_method (CASH, or QRPH for a GCash QR payment), amount, amount_tendered, status, gateway_reference (the GCash reference number, usable only once), verified_by, verified_at, rejected_reason, proof_image, proof_type, payment_date, created_at.
>
> **ingredients**: the stock of each ingredient.
> PK: ingredient_id. Attributes: ingredient_id, name, unit, stock_quantity, min_stock_level, is_active, created_at, updated_at. Referenced by: ingredient_movements.
>
> **ingredient_movements**: the ledger of every ingredient stock change.
> PK: movement_id. FK: ingredient_id → ingredients; changed_by → users. Attributes: movement_id, ingredient_id, changed_by, quantity_change, reason (RESTOCK, USAGE, REJECT, or CORRECTION), note, data_source, created_at.
>
> **forecast_runs**: each run of the forecast.
> PK: run_id. FK: run_by → users (empty for the nightly run). Attributes: run_id, run_by, horizon_days (seven), sources (ASSUMED or RECORDED), history_from, history_to, days_by_source, products_forecast, products_skipped, created_at. Referenced by: forecasts, forecast_models.
>
> **forecast_models**: the method chosen for each product in a run, with its backtest results.
> PK: run_id, product_id. FK: run_id → forecast_runs; product_id → products. Attributes: run_id, product_id, method (seasonal naïve, Holt-Winters, or regression), mae (mean absolute error), wape, baseline_mae (the seasonal naïve benchmark's error), history_days, candidates, note.
>
> **forecasts**: the expected sales of each product on each of the next seven days.
> PK: run_id, product_id, forecast_date. FK: run_id → forecast_runs; product_id → products. Attributes: run_id, product_id, forecast_date, predicted, low, high.
>
> **assumed_daily_demand**: the assumed one-year sales history used until enough actual sales exist. It is kept apart from the orders, so it never appears in the sales reports.
> PK: local_date, product_id. FK: product_id → products. Attributes: local_date, product_id, units, stocked_out, generator_version, created_at.
>
> **report_logs**: every report printed or exported, shown in Export History.
> PK: report_id. FK: generated_by → admins; user_id → users. Attributes: report_id, generated_by, user_id, report_type, generated_at.
>
> **security_events**: the audit trail of sign-ins, failed attempts, lockouts, and other security events.
> PK: event_id. FK: user_id → users. Attributes: event_id, event_type, user_id, username, ip_address, user_agent, detail, created_at.

**Not shown:** columns kept from earlier versions, such as the refund columns of `payments` (the bakery gives no refunds), `inventory_movements.request_id`, and `deliveries.delivery_personnel_id`.

### 6b. Supporting tables (one paragraph after the dictionary)

> The database also contains supporting tables that are not drawn in the diagram: sessions, otp_codes, trusted_devices, password_reset_tokens, email_verification_tokens, and phone_verifications for sign-in and verification; app_settings for the bakery's GCash QR code and account name; daily_stock_resets for the record of each 5:00 AM top-up; forecast_nightly_runs for the record of each nightly forecast; and inventory_change_requests, delivery_personnel, and delivery_proofs, which are kept from an earlier version of the system for their history and are no longer used.

### 6c. Normalization example (add to Third Normal Form)

> For example, a product's current price is stored once in the products table, while each line of an order stores the price at the time of the order in order_details.unit_price. A later price change therefore does not change the totals of past orders or their receipts.

---

## Round 7: Chapter 2, Local Studies and Synthesis (accepted 2026-10-29)

Sources checked on 2026-10-29 against Crossref and the journal pages. Juanatas and Juanatas (2024) is closed access, so its details come from Crossref and OpenAlex rather than the full paper.

| ☐ | Change |
|---|---|
| ☐ | Replace the Local Studies (p. 62–63) with the four studies in 7a. |
| ☐ | Replace the Synthesis paragraph on local studies (p. 70) with 7b. |
| ☐ | Replace the first sentence of the Synthesis paragraph on foreign studies (p. 70) with 7c; keep the rest of that paragraph. |
| ☐ | Use APA 7 in-text citations everywhere: "Divina et al. (2025)", "Lo et al. (2025)", "Custodio et al. (2026)", "Pattnaik et al. (2025)", "Mansur et al. (2025)", "van der Haar et al. (2024)", "Kristian and Suri (2025)". Remove "Krishnamurthy and Nadukuru and colleagues" and "the AutoML study" from the literature Synthesis (p. 69). |
| ☐ | Add the references in 7d. |

### 7a. Local Studies

> *Web-Based Ordering System with Forecasting for a Start-Up Business*
>
> Labastida and colleagues (2024) developed a web-based ordering system for a start-up business in the Philippines that integrated online ordering, inventory management, and demand forecasting in one platform. The study demonstrated how combining these functions can support the operations of a small business. However, it was designed for a start-up with limited sales history rather than an established bakery with daily production. This study is relevant to PECTRACK because it combines online ordering, inventory, and forecasting in a single web-based system, as PECTRACK does.
>
> *Web and Mobile-Based Ordering and Inventory System with Sales Analytics*
>
> Juanatas and Juanatas (2024) developed a web and mobile-based ordering and inventory system with sales analytics that addressed order management, inventory management, and customer engagement. The system allowed customers to browse and order products, allowed authorized personnel to handle inventory transactions, and provided the owner with a sales analytics module that used a simple moving average to reveal trends and patterns in sales data. The technical and non-technical evaluation produced an overall rating of 4.55, indicating strong agreement and high customer satisfaction. However, the study did not specify a food business setting or a payment recording feature, and its analytics were limited to describing past trends. This study is relevant to PECTRACK because it combines customer ordering, inventory control, and sales trend analysis in a single system, which parallels PECTRACK's integration of online and walk-in ordering, automated inventory, and sales forecasting.
>
> *Sentimart*
>
> Bonto and colleagues (2025) developed Sentimart, a web-based ordering, inventory, and feedback system for RTEA Shop, a specialty tea retailer. The study applied a long short-term memory (LSTM)-based sentiment analysis to customer feedback to forecast inventory and recommend which products to purchase. The ISO 25010 evaluation by technical specialists and end customers showed that the system was highly functional, reliable, user-friendly, and efficient, although portability received a comparatively lower rating. However, its forecasting was driven by customer sentiment rather than by recorded sales, and the study did not report a payment recording feature. This study is relevant to PECTRACK because both are web-based ordering and inventory systems for a Philippine food and beverage business with a predictive component that guides stock decisions, while PECTRACK bases its forecast on recorded sales and links it to daily production planning.
>
> *TrackPOS-IN*
>
> Dalupang (2026) developed TrackPOS-IN, a web-and-mobile point-of-sale and inventory platform for micro food enterprises that combine a fixed stall with mobile selling units. Piloted with Kuya Siomai in Isabela, the system replaced handwritten sales logs and informal messaging with an offline-capable Android point-of-sale, centralized inventory with adjustment logs and low-stock alerts, consolidated dashboards, and GPS monitoring of mobile sellers. All seven functional test cases passed, and user acceptance measured with ISO/IEC 25010 quality characteristics reached a grand mean of 4.68. However, the study was limited to a single pilot, did not provide online customer ordering, and identified cashless payment support as future work. This study is relevant to PECTRACK because both systems address manual sales and stock recording in a Philippine food business through centralized inventory and low-stock alerts, while PECTRACK adds an online storefront, GCash payment confirmation, production planning, and sales forecasting.

### 7b. Synthesis: local studies (replaces the paragraph on p. 70)

> The reviewed local studies show the value of bringing a food business's orders, stock, and sales into one digital system. Labastida et al. (2024) integrated online ordering, inventory management, and demand forecasting for a start-up business; Juanatas and Juanatas (2024) combined customer ordering, inventory control, and sales analytics; Bonto et al. (2025) added a predictive component to a web-based ordering and inventory system for a tea shop; and Dalupang (2026) replaced handwritten sales logs at a food stall with centralized inventory and low-stock alerts. These findings are relevant to PECTRACK because Pecto's Bakery currently handles orders and records through Facebook messages, walk-in transactions, and handwritten documents. However, none of these studies combines scheduled pickup and delivery, payment confirmation, production planning based on a bakery's stocking rules, and a forecast tested against a simple benchmark, which PECTRACK provides.

### 7c. Synthesis: foreign studies (first sentence)

> The foreign studies of Velasquez Jimenez et al. (2024) and Sinaga and Johan (2024) further support the use of order management systems to centralize orders received through different channels and to improve operational efficiency.

### 7d. References to add (APA 7th edition)

> Bonto, G., Acuña, C., Ortazon, J., Pamiloza, C., & Regencia, J. A. (2025). Sentimart: A web-based ordering, inventory & feedback system using long short-term memory (LSTM)-based sentiment analysis for RTEA Shop. *International Journal of Research and Innovation in Applied Science, 10*(10), 763–774. https://doi.org/10.51584/IJRIAS.2025.1010000060
>
> Dalupang, R. C. (2026). Development of TrackPOS-IN: A digital solution for managing operations of small stalls and mobile food businesses. *Isabela State University Linker: Journal of Engineering, Computing and Technology, 3*(1), 56–71. https://doi.org/10.65141/ject.v3i1.n4
>
> Juanatas, R. A., & Juanatas, I. C. (2024). A web and mobile-based ordering and inventory system with sales analytics. In *Proceedings of the 2024 15th International Conference on E-Education, E-Business, E-Management and E-Learning* (pp. 362–367). Association for Computing Machinery. https://doi.org/10.1145/3670013.3670077

Labastida et al. (2024) is already in the reference list.

**Backup local studies** (if the panel wants more): Tanaman et al. (2023), a web-based inventory system for a small enterprise in Pagadian City (not a food business), *International Journal of Science and Applied Information Technology, 12*(5), 44–48, https://doi.org/10.30534/ijsait/2023/021252023. De Guzman et al. (2024), an ordering and inventory website for an organic shop, *International Journal of Computing Sciences Research, 8*, 2749–2765, https://doi.org/10.25147/ijcsr.2017.001.1.185 (check the author list on the PDF first).

---

## Round 8: References, pages 115–119 (accepted 2026-10-29)

| ☐ | Change |
|---|---|
| ☐ | Replace the whole reference list (p. 115–119) with 8b. It applies every addition and deletion from Rounds 1–8. Use a hanging indent. |
| ☐ | In Chapter 2, change four in-text years to match their references: Foodpanda (**2023**), GrabFood (**2023**), Shopify (**2023**), Toast (**2023**). |
| ☐ | In Chapter 1 (Project Context), "Jimenez et al. (2024)" becomes "Velasquez Jimenez et al. (2024)" (Round 1). |

### 8a. What changed

- **Deleted, never cited in the paper:** Alam et al. (2024), Mittal et al. (2023), Salih et al. (2023), Lin et al. (2023), Zomato (2023). Step 5's fixes for Lin and Salih/Ghazi in `OBJECTIVES_ALIGNED.md` are no longer needed.
- **Deleted, not found or not supporting the text (Round 5):** Alzoubi et al. (2022), Cruz et al. (2022), Krishnamurthy et al. (2024), Lopez & Garcia (2023), Sharma et al. (2023), Singh et al. (2024).
- **Added:** the forecasting sources (Round 4), the local studies (Round 7), and Kristian & Suri (2025) with its authors.
- **Corrected:** Velasquez Jimenez et al. (compound surnames), Pattnaik et al. (last author, volume, pages), and the Toast, Domino's, and Goldilocks entries.
- **DOIs added** to every journal entry. The DOIs for Bonfanti, Wu, Panigrahi, Sinaga, and Velasquez Jimenez were looked up on Crossref on 2026-10-29. Sinaga and Johan's article is in Indonesian, so its title is given with an English translation in brackets, as APA 7 requires.

### 8b. Final reference list

> Bandara, K., Hewamalage, H., Liu, Y.-H., Kang, Y., & Bergmeir, C. (2021). Improving the accuracy of global forecasting models using time series data augmentation. *Pattern Recognition, 120*, 108148. https://doi.org/10.1016/j.patcog.2021.108148
>
> Block, Inc. (2023). *Square for restaurants: Point of sale system*. https://squareup.com/us/en/point-of-sale/restaurants
>
> Bonfanti, A., Rossato, C., Vigolo, V., & Vargas-Sánchez, A. (2023). Improving online food ordering and delivery service quality by managing customer expectations: Evidence from Italy. *British Food Journal, 125*(13), 164–182. https://doi.org/10.1108/BFJ-08-2022-0694
>
> Bonto, G., Acuña, C., Ortazon, J., Pamiloza, C., & Regencia, J. A. (2025). Sentimart: A web-based ordering, inventory & feedback system using long short-term memory (LSTM)-based sentiment analysis for RTEA Shop. *International Journal of Research and Innovation in Applied Science, 10*(10), 763–774. https://doi.org/10.51584/IJRIAS.2025.1010000060
>
> Cerqueira, V., Torgo, L., & Mozetič, I. (2020). Evaluating time series forecasting models: An empirical study on performance estimation methods. *Machine Learning, 109*. https://doi.org/10.1007/s10994-020-05910-7
>
> Culili, M. A. (2026). Development of an e-commerce platform for Department of Agrarian Reform Region 02 – ARBO with predictive analytics. *AIDE Interdisciplinary Research Journal, 16*(1), 364–373. https://doi.org/10.56648/aide-irj.v16i1.285
>
> Custodio, N. C., Lucero, H. R., Torres, M. G., Tayubong, R. C., & Quillondrino, A. D. (2026). Predictive sales and inventory system with customer segmentation for enhance customer relationship management. *International Journal of Research and Innovation in Applied Science, 11*(1), 1619–1627. https://doi.org/10.51584/IJRIAS.2026.110100137
>
> Dalupang, R. C. (2026). Development of TrackPOS-IN: A digital solution for managing operations of small stalls and mobile food businesses. *Isabela State University Linker: Journal of Engineering, Computing and Technology, 3*(1), 56–71. https://doi.org/10.65141/ject.v3i1.n4
>
> Divina, J., Olan, A., Perez, N. C., Acepcion, R., Sarmiento, M., & Cabututan, G. (2025). Data-driven point-of-sale and inventory system for Pastil sa Tabi: Integrating sales forecasting algorithms and predictive analytics. *International Journal of Research and Innovation in Applied Science, 10*(10), 826–838. https://doi.org/10.51584/IJRIAS.2025.1010000066
>
> Domino's Pizza LLC. (2024). *Domino's online ordering and delivery tracking system*. https://ir.dominos.com/news-releases/news-release-details/dominosr-updates-its-iconic-industry-first-tracker-even-better
>
> Fildes, R., Ma, S., & Kolassa, S. (2022). Retail forecasting: Research and practice. *International Journal of Forecasting, 38*(4), 1283–1318. https://doi.org/10.1016/j.ijforecast.2019.06.004
>
> Foodpanda. (2023). *Online food delivery service*. https://www.foodpanda.ph
>
> Fries, M., & Ludwig, T. (2024). "Why are the sales forecasts so low?" Socio-technical challenges of using machine learning for forecasting sales in a bakery. *Computer Supported Cooperative Work (CSCW), 33*(2). https://doi.org/10.1007/s10606-022-09458-z
>
> Goldilocks Bakeshop. (2024). *Goldilocks online delivery system*. https://www.goldilocksdelivery.com.ph
>
> Grab. (2023). *GrabFood Philippines*. https://www.grab.com/ph/food/
>
> Hewamalage, H., Ackermann, K., & Bergmeir, C. (2023). Forecast evaluation for data scientists: Common pitfalls and best practices. *Data Mining and Knowledge Discovery, 37*(2), 788–832. https://doi.org/10.1007/s10618-022-00894-5
>
> Huber, J., & Stuckenschmidt, H. (2020). Daily retail demand forecasting using machine learning with emphasis on calendric special days. *International Journal of Forecasting, 36*(4), 1420–1438. https://doi.org/10.1016/j.ijforecast.2020.02.005
>
> Hübner, N., Caspers, J., Coroamă, V. C., & Finkbeiner, M. (2024). Machine-learning-based demand forecasting against food waste: Life cycle environmental impacts and benefits of a bakery case study. *Journal of Industrial Ecology, 28*(5), 1117–1131. https://doi.org/10.1111/jiec.13528
>
> Hyndman, R. J., & Athanasopoulos, G. (2021). *Forecasting: Principles and practice* (3rd ed.). OTexts. https://otexts.com/fpp3/
>
> Hyndman, R. J., & Kostenko, A. V. (2007). Minimum sample size requirements for seasonal forecasting models. *Foresight: The International Journal of Applied Forecasting, 6*, 12–15.
>
> Jollibee Foods Corporation. (2024). *Jollibee delivery online ordering system*. https://order.jollibee.com/
>
> Juanatas, R. A., & Juanatas, I. C. (2024). A web and mobile-based ordering and inventory system with sales analytics. In *Proceedings of the 2024 15th International Conference on E-Education, E-Business, E-Management and E-Learning* (pp. 362–367). Association for Computing Machinery. https://doi.org/10.1145/3670013.3670077
>
> Kristian, D., & Suri, P. A. (2025). Comparative study of AutoML and machine learning in retail forecasting. *Procedia Computer Science, 269*, 882–891. https://doi.org/10.1016/j.procs.2025.09.031
>
> Labastida, P., Simbulan, M., Estrella, C. J., Flores, W., & Centeno, C. (2024). Web-based ordering system for start-up business with forecasting. *World Journal of Advanced Research and Reviews, 22*(3), 357–368. https://doi.org/10.30574/wjarr.2024.22.3.1721
>
> Lo, J. B., Tolentino, E., Tubianosa, A., Laceda, C. J., Pineda, E., & Villanueva, E. M. (2025). RELTRACK: A web-based system for inventory, appointments, and sales forecasting based on predictive analytics and linear regression for REL Glass and Aluminum Works. *International Journal of Research and Innovation in Applied Science, 10*(10), 1497–1510. https://doi.org/10.51584/IJRIAS.2025.10100000135
>
> Makridakis, S., Spiliotis, E., & Assimakopoulos, V. (2022). M5 accuracy competition: Results, findings, and conclusions. *International Journal of Forecasting, 38*(4), 1346–1364. https://doi.org/10.1016/j.ijforecast.2021.11.013
>
> Mansur, S., Sattar, K., Hosseini, S. E., Pervez, S., Ahmad, I., Saleem, K., & Elhendi, A. Z. (2025). Sales forecasting for retail stores using hybrid neural networks and sales-affecting variables. *PeerJ Computer Science, 11*, Article e3058. https://doi.org/10.7717/peerj-cs.3058
>
> Orquesta, R. D. (2026). Enhancing inventory control through sales forecasting. *International Journal on Science and Technology, 17*(1). https://doi.org/10.71097/IJSAT.v17.i1.10371
>
> Panigrahi, R. R., Shrivastava, A. K., & Kapur, P. K. (2024). Impact of inventory management practices on the operational performances of SMEs: Review and future research directions. *International Journal of System Assurance Engineering and Management, 15*(5), 1934–1955. https://doi.org/10.1007/s13198-023-02216-4
>
> Pattnaik, M., Padhi, S. K., Panda, L., Naushad, U., Behera, R. K., Mishra, A., & Pattnaik, A. (2025). AI-driven sales forecasting in retail: Insights from Big Bazaar's sales data. *International Journal of Management Science and Engineering Management, 21*(1), 1–14. https://doi.org/10.1080/17509653.2025.2499076
>
> Petropoulos, F., et al. (2022). Forecasting: Theory and practice. *International Journal of Forecasting, 38*(3), 705–871. https://doi.org/10.1016/j.ijforecast.2021.11.001
>
> Red Ribbon Bakeshop. (2024). *Red Ribbon online ordering system*. https://www.redribbon.ph
>
> Shopify Inc. (2023). *E-commerce platform for online stores*. https://www.shopify.com
>
> Sinaga, L. G., & Johan, M. C. (2024). Perancangan design order management system berbasis web dengan metode design thinking [Web-based order management system design with the design thinking method]. *Jurnal Teknik Informatika dan Sistem Informasi, 10*(2). https://doi.org/10.28932/jutisi.v10i2.8282
>
> Spiliotis, E., Makridakis, S., Semenoglou, A.-A., & Assimakopoulos, V. (2022). Comparison of statistical and machine learning methods for daily SKU demand forecasting. *Operational Research, 22*(3), 3037–3061. https://doi.org/10.1007/s12351-020-00605-2
>
> StoreHub. (2023). *POS system Philippines*. https://www.storehub.com/ph
>
> Toast, Inc. (2023). *Toast POS system for restaurants*. https://pos.toasttab.com
>
> Uber Technologies. (2024). *Uber Eats merchant system*. https://merchants.ubereats.com
>
> van der Haar, J. F., Wellens, A. P., Boute, R. N., & Basten, R. J. I. (2024). Supervised learning for integrated forecasting and inventory control. *European Journal of Operational Research, 319*(2), 573–586. https://doi.org/10.1016/j.ejor.2024.07.004
>
> Velasquez Jimenez, L., Grados Espinoza, H., Rubiños Jimenez, S., Grados Gamarra, J., & Marrujo-Ingunza, C. (2024). Software design aimed at proper order management in SMEs. *International Journal of Advanced Computer Science and Applications, 15*(12), 86–94. https://doi.org/10.14569/IJACSA.2024.0151209
>
> Wu, M., Gao, J., Hayat, N., Long, S., Yang, Q., & Al Mamun, A. (2024). Modelling the significance of food delivery service quality on customer satisfaction and reuse intention. *PLOS ONE, 19*(2), Article e0293914. https://doi.org/10.1371/journal.pone.0293914

**Before printing:**
- Add the page ranges for Cerqueira et al. (2020), Fries and Ludwig (2024), and Sinaga and Johan (2024).
- Format the Petropoulos et al. (2022) author list as the school requires.
- Check that every source cited in the final text appears here, and that every entry here is cited in the text.

---

## Round 9: Appendices, pages 120–199 (accepted 2026-10-29)

| ☐ | Change |
|---|---|
| ☐ | Add a new appendix, **"Consultation Notes"**, after Appendix B (draft in 9a). Each member checks the notes against what was actually said before printing. Add photos if any were taken. |
| ☐ | Appendix C: delete Fig 44 (Delivery Person Inventory Management) and Fig 54 (Cashier Reporting and Analytics). Redraw Fig 55 (Customer: Orders and receipts, no My Payments) and Figs 49–51 (payments: staff confirm GCash references, no gateway). Redraw the others to match the Round 5 descriptions, add the Production and Forecast flowchart, renumber with no gaps (40, 48, and 52 are missing), and correct "FLow". |
| ☐ | Appendix order: **A** Resource Persons, with the request letter (Fig 66) moved next to Fig 33; **B** Interview Transcripts; **C** Consultation Notes (new); **D** Flow Charts; **E** Accomplishment Form, with every consultation week; **F** Gantt Chart; **G** Curriculum Vitae. Remove the misplaced "APPENDIX E. Gantt Chart" heading on p. 181, and update the Table of Contents. |
| ☐ | Request letter (p. 190): keep it **unchanged**, because it is signed. If asked about "pre-assessment process": it was a template error, and the interview covered order processing, as the transcript shows. |
| ☐ | Transcript headers (p. 126 and the two later ones): use the new title, "…with Predictive Analytics and Automated Inventory for Pecto's Bakery in Lucban, Quezon". Leave the transcript text exactly as spoken. |
| ☐ | Gantt chart and accomplishment forms: check that they run to the final defense. If they stop in May 2026, extend them with the June–November work: the three sprints, the client and adviser revisions of October 2026, the mock defense (October 26), and the final revisions. |

### 9a. Consultation Notes (draft; the group checks every line)

Drafted from the group's records of each consultation. Delete any line the client did not actually say, and correct the dates if needed.

> **Consultation with the General Manager, October 8, 2026**
> Attended by: Mrs. Katherine R. Abillar and the proponents.
> - The bakery does not accept cash on delivery, because food refused at the door cannot be resold.
> - Delivery orders must be paid in full before they are prepared and sent out.
>
> Changes made: cash on delivery was removed; delivery orders are paid with GCash before release.
>
> **Consultation with the General Manager, October 15, 2026**
> Attended by: Mrs. Katherine R. Abillar and the proponents.
> - The stock of ingredients should be monitored, without recipes.
> - Bread is not tracked by expiry date; leftover bread is sold first.
> - Orders should have a simple order number for each day, and staff should be notified of new orders.
> - Cashiers should be able to update the stock directly, with a record of who made each change.
> - The bakery gives no refunds; a paid order cannot be cancelled.
>
> Changes made: the Ingredients tab, daily order numbers, new-order notifications, direct stock updates by cashiers with a change history, and the no-refund rule.
>
> **Consultation with the General Manager, October 23, 2026**
> Attended by: Mrs. Katherine R. Abillar and the proponents.
> - Soft breads keep for about three days. The bakery starts each day with a fixed standard quantity of each soft bread and does not bake more during the day.
> - Hard breads keep much longer. They are baked when the stock falls to a minimum of about 200 pieces, up to about 500 to 700 pieces.
> - The bakery does not keep a separate list of rejected bread.
>
> Changes made: daily standards with the 5:00 AM top-up for soft breads, minimum and stop levels for hard breads, and the Production list.
>
> **Consultation with the General Manager, October 24, 2026**
> Attended by: Mrs. Katherine R. Abillar and the proponents.
> - Production rises about four times during Holy Week, the Pahiyas Festival, Christmas, New Year, and long weekends, and about two times on weekends.
> - The increase is mostly in hard breads, which tourists buy as pasalubong; soft breads stay the same.
> - Production for an event is prepared about a week ahead.
>
> Changes made: the Events calendar, the weekend and event build-up of hard breads in the Production list, and the event variable in the forecast.

Also consider a short entry for the adviser's consultation of October 16, 2026 (first and last name at registration, removal of the bulk-order approval, fewer clicks for staff) and the adviser's recommendation of GCash QR payments in place of the paid payment gateway, if the school allows adviser consultations in this appendix.
