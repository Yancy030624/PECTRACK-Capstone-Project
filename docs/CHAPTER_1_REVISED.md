# PECTRACK: A Web-Based Order Management System with Predictive Analytics and Automated Inventory for Pecto's Bakery in Lucban, Quezon

# INTRODUCTION

## Project Context

Order Management Systems and Customer Relationship Management have brought significant change to how businesses worldwide manage their transactions, customer interactions, and day-to-day operations. Businesses that have implemented Customer Relationship Management systems have recorded improvements in operational workflows, sales performance, and long-term customer loyalty across a wide range of industries (Guerola-Navarro, 2024; Nethanani, 2024). Customer Relationship Management allows businesses to centralize customer data, track order histories, and respond to customer needs more efficiently. It shifts the way organizations engage with their clients from a reactive approach to a more structured and proactive one. Research further confirms that businesses which have integrated Customer Relationship Management into their operations report stronger customer relationships, higher sales conversion, and sustained competitive advantage in their respective markets (AlQershi, 2020; Khan, 2022). This shows that the strategic adoption of Customer Relationship Management is not merely an operational upgrade but a foundational shift in how businesses build and sustain meaningful client connections.

In addition to improving customer relationships, Order Management Systems and Customer Relationship Management technologies have also transformed how businesses handle inventory and order management. In small and medium-sized enterprises, the shift from manual record-keeping to digital order management systems has resulted in greater accuracy in stock tracking (Panigrahi, 2024; Salih, 2023). Web-based ordering systems developed and implemented by small businesses confirm that digital platforms improve the consistency and accessibility of business records, allowing owners and cashiers to monitor transactions and inventory levels in real time (Labastida, 2024). This reinforces the view that digital adoption in small and medium-sized enterprises is less of a luxury and more of a structural necessity for businesses aiming to remain accurate, responsive, and competitive in their daily operations.

Furthermore, in the food and retail sectors, the implementation of digital Order Management Systems and Customer Relationship Management systems has produced measurable improvements in service quality and the overall customer experience. Businesses that have embraced online ordering platforms report higher levels of order accuracy, faster service delivery, and more consistent communication with their customers, all of which contribute to stronger satisfaction and continued patronage (Bonfanti, 2023; Wu, 2024). Service speed and accuracy have been identified as key drivers of customer satisfaction in digital commerce, and businesses that have implemented these systems are better equipped to meet the growing expectations of their customers (Lin, 2023). In an increasingly digital marketplace, the ability to deliver fast and accurate service is no longer a differentiator but a baseline expectation that businesses must consistently meet to retain customer trust and loyalty.

Beyond recording what has already happened, businesses increasingly use their own transaction data to anticipate what will happen next. Predictive analytics applies statistical and machine-learning methods to historical sales to estimate future demand, allowing a business to prepare the right quantity of products before customers arrive. For a bakery, whose products are perishable and produced daily, matching production to expected demand directly reduces both unsold stock and missed sales. When predictive analytics is combined with automated inventory, where stock is updated by the system as orders are placed and as daily production is recorded, the business gains an accurate, current view of its stock without manual counting after every sale.

Taken together, the body of research surrounding Order Management Systems and Customer Relationship Management implementation demonstrates that these technologies have reshaped business operations on a global scale, from large enterprises to small and start-up businesses across various industries. Studies on web-based order management systems in small business contexts consistently confirm that the transition to digital platforms brings documented benefits in order management, inventory control, and service delivery (Labastida, 2024; Bonfanti, 2023). The consistent evidence across literature from diverse industries and regions underscores that the integration of Order Management Systems and Customer Relationship Management principles into business operations is a well-established and globally recognized approach to improving how businesses process transactions, manage relationships, and deliver value to their customers (Guerola-Navarro, 2024; Utami and Sudarmiatin, 2022). Regardless of industry or scale, the shift toward digital systems represents a convergence of practical necessity and strategic foresight that continues to define the future of modern business operations.

## Background of the Problem

Pecto's Bakery, established in 1947 and located in Lucban, Quezon, is one of the long-standing local bakeries that has continuously served its community and nearby areas. Over the years, the bakery has expanded its reach by offering delivery services not only within Lucban but also across different parts of Quezon Province. With decades of operation and continuous business growth, the bakery has established a strong customer base and remains one of the recognized local bakeries in the area. The proposed system, however, accepts online delivery orders within Lucban only, as stated in the Scope and Limitations.

Based on the interview conducted with the management, the bakery accommodates approximately 500–700 customers daily, especially during regular operating days, with higher customer volume during weekends, holidays, and bulk-order seasons. Despite its long history and growing customer demand, the bakery still relies heavily on traditional and manual processes in handling customer orders, customer records, and transaction management.

At present, customers place their orders either by sending messages through the bakery's official Facebook page or by directly visiting the physical store. While this method provides flexibility and convenience for customers, it lacks a structured and centralized process for organizing transactions. Customer information is still recorded manually in logbooks or written on paper, and orders are listed manually and passed to the assigned personnel for preparation. This manual process requires multiple steps before an order is completed. Based on the current workflow gathered during the interview, the bakery follows these manual procedures in processing customer orders:

1. receiving customer inquiries;
2. checking product availability;
3. manually listing orders;
4. confirming order details;
5. forwarding orders to the assigned personnel;
6. preparing the products;
7. monitoring inventory manually;
8. confirming payments;
9. preparing orders for pickup or delivery;
10. manually updating customers regarding their order status.

While this process remains functional, it creates inefficiencies, repetitive tasks, and communication gaps between personnel.

To better understand these operational challenges, an interview was conducted with the General Manager of Pecto's Bakery, Mrs. Katherine R. Abillar, who has been managing the bakery for many years as part of their family-run business. The following are the significant findings gathered from the interview:

- **Method of Receiving Customer Orders:** When asked, "What method do you use to receive customer orders?" Mrs. Abillar explained that customers may place orders through the bakery's official Facebook page, while walk-in customers directly communicate their orders to the cashier. This dual method of receiving orders may result in inconsistencies in recording and handling customer transactions.
- **Order Processing Procedure:** When asked, "How do you process an order from start to finish?" Mrs. Abillar stated that orders are first confirmed through communication with the customer, and pictures may sometimes be sent for verification. After confirmation, the order is written on paper and handed over to the assigned cashier or personnel responsible for preparation.
- **Personnel Responsible for Customer Orders:** In response to the question, "Who is responsible for handling and managing customer orders?" Mrs. Abillar explained that the responsibilities are divided among different personnel. The admin or manager handles online orders, while the sales lady manages walk-in customers. This separation of responsibilities, without a centralized system, may contribute to communication gaps and delays in order handling.
- **Recording of Customer Orders:** When asked, "Where do you record or list customer orders?" Mrs. Abillar confirmed that orders are still recorded manually on paper. This method makes it more difficult to organize, retrieve, and monitor orders, particularly during periods of high customer volume.
- **Customer Records and Order History:** The interview revealed that customer records and repeat transactions are difficult to track because the bakery does not have a centralized customer database. With an estimated 500–700 customers daily, manually retrieving customer information and previous order history can become time-consuming, especially during peak operating hours.
- **Causes of Problems in Order Handling:** When asked, "Why do you think these problems happen during order handling?" Mrs. Abillar identified miscommunication as one of the main reasons. She stated that it would be better if orders were directly communicated to the personnel assigned to handle them. The interview also revealed that some orders are conveyed verbally without being properly written down, increasing the possibility of errors.
- **Common Problems Encountered in Managing Orders:** When asked, "What common problems do you encounter when managing orders?" Mrs. Abillar explained that miscommunication and verbally conveyed orders can result in incorrect or incomplete order details. These problems become more challenging when the bakery handles large-volume transactions.
- **Effect on Daily Operations:** When asked, "How do these problems affect your daily operations?" Mrs. Abillar explained that handling incorrect orders causes stress, particularly when dealing with large orders. She noted that the situation becomes more difficult when orders exceed 100 items because the bakery has to explain the issue to customers when their orders do not meet their expectations.
- **Occurrence of Delays:** In response to the question, "When do delays usually happen?" Mrs. Abillar explained that delays commonly occur when production schedules are not aligned with the customer's expected pickup time. For example, an order scheduled for 6:00 may be delayed if the bread is only finished at 7:00, since the products may still require additional time to cool before they can be released to the customer.
- **Difficulty in Tracking Order Status:** When asked, "Why is it difficult to track order status manually?" Mrs. Abillar stated that customers generally rely on the agreed pickup or delivery time. When delays occur, customers have to send messages or contact the bakery to ask about the status of their orders. This lack of real-time order status information creates inconvenience for both customers and bakery personnel.

Follow-up consultations with the bakery's management clarified how the bakery produces and stocks its products, which the manual process also leaves unmonitored:

- **Payment before release:** Orders are paid before they are released. Delivery orders are paid in full beforehand, since food refused at the door cannot be resold, and the bakery does not give refunds.
- **Soft breads:** Soft breads keep for about three days. The bakery starts each day with a fixed standard quantity of each soft bread and does not bake more during the day; a soft bread that sells out stays sold out until the next day's production.
- **Hard breads:** Hard breads keep much longer. Production continues while the stock is at or below a minimum of about 200 pieces and stops once the stock reaches about 500 to 700 pieces.
- **Weekends and events:** Production rises on weekends (about twice the usual) and during events such as Holy Week, the Pahiyas Festival, Christmas, New Year, and long weekends (about four times the usual). The increase is mostly in hard breads, which tourists buy as pasalubong, and production is prepared about a week before an event.
- **Losses:** Rejected or wasted products are not recorded in a separate list.

These practices are currently managed from memory and experience, with no record that shows how much should be produced tomorrow or ahead of the next event.

The findings from the interview and consultations clearly demonstrate that Pecto's Bakery faces recurring issues related to:
- manual record-keeping;
- miscommunication;
- order inaccuracies;
- delayed service;
- difficulty in monitoring customer records and order progress;
- production that is planned without a record of past sales.

These operational problems become more evident as the bakery continues to handle hundreds of customers daily, making the manual process more difficult to sustain efficiently.

In response to these identified problems, the proposed study becomes highly relevant. The development of PECTRACK, a web-based Order Management System with predictive analytics and automated inventory, aims to address these inefficiencies by:
- digitizing order management;
- centralizing customer data;
- improving communication among the bakery staff;
- automating transaction and inventory updates;
- forecasting demand from the bakery's own sales history.

Through the implementation of the proposed system, the bakery's current manual order-processing procedures can be reduced to these simplified procedures:
1. customer order placement;
2. payment;
3. automated order recording and stock deduction;
4. preparation for pickup or delivery;
5. completion.

This process reduction serves as the innovation of the proposed system. It eliminates repetitive manual tasks, reduces miscommunication between staff, minimizes human error, and improves transaction speed.

By replacing manual methods with an organized and automated system, the proposed solution is expected to:
- improve order accuracy;
- simplify operational procedures;
- strengthen customer record management;
- keep the inventory current without manual counting after every sale;
- help the bakery decide how much to produce.

Ultimately, PECTRACK will provide a more reliable, efficient, and customer-centered operational system for Pecto's Bakery while improving the overall workflow of the business and enhancing customer satisfaction.

## Purpose and Description

PECTRACK is a web-based Order Management System with predictive analytics and automated inventory, made to improve the daily transactions of Pecto's Bakery in Lucban, Quezon. It makes ordering, payment, product tracking, and inventory management faster and more organized. Instead of using paper and manual processes, the system stores everything digitally, which reduces errors and saves time.

The name PECTRACK was coined from *Pecto's Bakery* and the word *Track*, reflecting the system's capability of monitoring and tracking the bakery's baked products: how many items are produced, currently available, and sold. This ensures that the bakery always has an up-to-date view of its product inventory.

The system caters to four user roles, each with specific access and functions suited to their responsibilities: Admin, Cashier, Delivery Personnel, and Customer. All data is stored digitally, providing a more reliable and efficient experience for both the business and its customers. The system works on computers and mobile phones; on a phone, the staff modules are reached through a menu button.

Below are the modules incorporated in the proposed study:

### Login Module

The Login Module secures the system by verifying user identity before granting access.

**Signing in**
- Sign-in opens as a pop-up window over the page the visitor is on. It has two entrances, **Customer** and **Admin**.
- The Admin entrance is used by the admin, cashiers, and delivery personnel. Each entrance refuses the other kind of account.
- Users enter their username or email address and their password. The system validates the credentials and determines the access level from the user's assigned role.
- After five failed attempts, the account is locked for 15 minutes. Users who forget their password can request a reset link by email.
- With "Keep me logged in" ticked, a user stays signed in on that device for up to seven days; otherwise the session ends when the browser is closed. Every user can sign out from My Profile.

**Customer registration**
- New customers register with their first and last name, username, email address, contact number, and password.
- The contact number is a Philippine mobile number and is verified with a six-digit code sent by SMS before the account is created.
- The customer then confirms the email address through a link sent by email before placing an order.

**Administrator**
- After passing credential validation, the administrator must enter a six-digit One-Time Password (OTP) sent by email. The code is valid for five minutes.
- The administrator may mark the device as trusted for 30 days, after which signing in on that device needs only the password. Changing the password removes every trusted device.
- Once verified, the administrator is taken to the Dashboard, with full access to all modules.

**Cashiers** are taken to the Dashboard, with access to the operational features: orders, walk-in and advanced orders, inventory and production, payments and the payment log, and deliveries. User Management and Reporting and Analytics are for the administrator only.

**Customers** are taken to the online Menu, where they browse products, place orders, pay, and follow their orders.

**Delivery personnel** are taken to My Deliveries, which lists the deliveries assigned to them. They have no access to administrative or cashier functions.

### Dashboard Module

The Dashboard gives the admin and cashier an overview of what needs attention at a glance:
- a "Today" row with the orders paid today, today's sales (delivery fees not included), and the cash orders not yet paid;
- colour-coded status tiles (green for Good, yellow for Okay, red for Needs attention) for soft breads about to be sold out, hard breads low on stock, ingredients low on stock, today's orders, and deliveries waiting for a rider;
- a **Running out** list of products running low;
- a **Needed by** list of paid orders still to be picked up or delivered, each marked by how close its time is;
- the most recent orders.

Selecting a tile opens the module already filtered to the problem.

### User Management Module

The User Management Module keeps the records of the people who use the system. It is for the administrator only and has two tabs.

**Customers**
- Customers create their own accounts through registration.
- The admin can search the customer list, correct a customer's details, and deactivate or reactivate an account.
- Customers manage their own profile, saved delivery addresses, and password from their account page.
- Registration refuses a username, email address, or contact number already in use.

**Staff**
- The admin creates and manages the accounts of cashiers and delivery personnel, edits their details, resets their passwords, and deactivates or reactivates them.

### Order Management Module

The Order Management Module oversees each order from placement to completion.

**Paid before release**
- Every order is paid before it is handed over. An order becomes **Ready for pickup** or **Ready for delivery**, then **Out for delivery** (for deliveries), and finally **Completed**.
- **GCash:** an online order paid with GCash is held for 15 minutes while the customer pays. If it is not paid in time, the system releases it and returns its stock.
- **Cash at pickup:** a pickup order can instead be paid in cash at the counter. It is placed at once as **Ready for pickup** and marked **Not paid** until the cashier records the cash; the order details show its payment method. A customer can have only one unpaid cash order at a time, and one not collected by the end of its day is cancelled automatically.
- **Delivery:** delivery orders are paid with GCash only, and carry a delivery fee of ₱50.
- Paid orders cannot be cancelled, as the bakery gives no refunds. A customer may cancel their own unpaid cash order.

**Orders list**
- Staff see the orders for **Today**, the **Upcoming** ones, or any chosen date, filtered by status and searchable by order number or customer.
- Each order shows its items, requested time, payment, and progress.
- A delivery order waiting for a rider can be assigned to one directly from its details.

**Counter orders** (cashier, Walk-in tab)

| | Walk-in | Advanced order |
|---|---|---|
| When | The customer is at the counter now | Picked up on a later date |
| Customer details asked | None | Name, contact number (verified by an SMS code), pickup date and time |
| Payment | Cash or GCash, paid in full | Cash or GCash, paid in full |
| Proof of order | A printable receipt showing the cash received and the change | The order number sent to the customer by SMS, which also works without internet |

To add products, the cashier types the first letters of a product's name and picks it from the matching list. Quantities can be typed directly.

**Online orders** (customer)
- Customers browse the Menu, add items to the cart, and choose pickup or delivery. They may leave the time blank for "as soon as it's ready", or choose a date and one of the available times. Times are offered every 30 minutes from 5:00 AM to 10:00 PM, up to 30 days ahead.
- **Payment method:** a pickup is paid in cash at the counter or with GCash right away; a delivery is paid with GCash, with the ₱50 delivery fee added to the total.
- **Delivery address:** saved addresses are always in Lucban, Quezon; the customer enters the street, barangay, and similar details.

### Inventory Management Module

The Inventory Management Module keeps the stock of every product current. Stock is deducted automatically when an order is placed (an online GCash order's stock is set aside while it is being paid) and returned automatically when an unpaid order is released or cancelled. The module follows the bakery's two ways of stocking.

**Soft breads**
- Each soft bread has a **daily standard** stock.
- Every day at 5:00 AM the system automatically tops each soft bread up to its standard: leftovers from the previous day are sold first, and only the difference is baked.
- Soft breads are not restocked during the day. A soft bread is shown as **About to be sold out** when under a fifth of its standard, and **Sold out today** at zero.
- A soft bread ordered in advance is baked on its pickup day, in addition to the standard, so it does not reduce the day's stock for walk-in customers.

**Hard breads**
- Each hard bread has a **minimum** (when to produce) and a **stop level** (how much to make).
- A hard bread is shown as **Low stock** when at or below its minimum.

**Edit and confirmation**
- **Add stock:** the pieces received are added to what is on hand, and the system confirms the new total before saving.
- **Correct count:** the administrator can set the actual count after a physical check, for example when bread is thrown away.
- Every change is recorded with who made it and when.

**Production**
- The Production tab lists what to bake for a chosen day.
- For a soft bread, it is the standard less what is on the shelf, plus advanced orders for that day.
- For a hard bread at its minimum, it is the stop level less what is on hand. Hard breads are automatically built up to twice the stop level from Thursday for the weekend, and to the event's multiplier (four times by default) from a week before an event.
- The admin keeps an **Events** calendar (Holy Week, the Pahiyas Festival, Christmas, New Year, and long weekends), and the list shows which event or weekend raised the amount.
- **Forecast check:** beside each product, the list shows the forecast's expected sales for that day. When the forecast expects more than the plan will have, it shows how many more (for example "+20 more"), with a count at the top of the list. The rules above still decide what to bake; the forecast warns before a product sells out.
- The list can be printed.

**Ingredients and products**
- **Ingredients:** the stock of ingredients is monitored. Staff add deliveries, the administrator corrects the counts, and ingredients at their minimum are flagged.
- **Edit Products** (admin): the administrator maintains the product catalogue, including each product's category, bread type (soft or hard), price, size or pack, description, photo, and whether it is on sale.

### Payment and Billing Module

The Payment and Billing Module processes and records every payment.
- **Counter:** the cashier records cash, with the amount received and the change computed, or GCash, with its reference number. Cash pickups ordered online are paid here when they are collected.
- **Online:** orders are paid through the PayMongo payment gateway using GCash, and the system confirms the payment automatically.
- **Delivery orders** are paid in full beforehand, delivery fee included; cash on delivery is not offered.

Each paid order has a digital receipt showing the items, the delivery fee if any, the total, the amount received, and the change. Staff see the orders ready for pickup or delivery and the completed ones, each with its payment method and whether it is paid. The **Payment log** lists every payment received, filtered by date and payment method, and can be exported as a PDF. Customers see their own receipts and payments.

### Delivery Management Module

The Delivery Management Module manages deliveries within Lucban.
- Staff assign each paid delivery order to a rider, and riders see their deliveries on their phones in My Deliveries.
- The rider marks a delivery **Out for delivery**, then uploads proof of delivery (up to five photos) and marks it **Delivered**, which completes the order.
- If a delivery cannot be completed, the rider records the reason and the order returns to the bakery to be assigned again.
- Riders can call or message the customer from the delivery card, and see their own delivery history.

### Notifications

The system keeps users informed:
- **In-app:** a notification bell for staff and riders (new orders, payments, deliveries, and orders due within the hour).
- **Low-stock warning:** when a product falls to its minimum, the admin and cashier see a red warning with its own sound, which opens the Inventory module.
- **By email:** customers (order ready, out for delivery, delivered) and riders (new assignment).
- **By SMS:** the order number of an advanced order is sent to the customer.

### Reporting and Analytics Module

The Reporting and Analytics Module transforms the bakery's recorded data into reports and forecasts. It is for the administrator only. Every report can be printed or saved as PDF, and the sales report and the forecast can be exported as CSV.

| Tab | What it shows |
|---|---|
| Sales | Sales (money received, delivery fees not included), number of orders, average order, and delivery fees for any date range, by day, week, or month; a chart of sales and orders; where the sales came from (cash or GCash; walk-in, online pickup, or delivery); the cash orders not yet paid; and the peak ordering periods by hour and day of the week |
| Products | The best sellers by pieces sold, for all breads or only soft or hard breads, with revenue |
| Inventory | For the chosen dates, how many pieces of each product were baked or added, sold, and lost (rejects and counts corrected down) |
| Forecast | The expected sales of each product for the next seven days and the busiest day ahead |
| Export history | Every report downloaded or printed, by whom and when |

The payment log is in the Payment and Billing Module. Reports show the bakery's real transactions; a **Demo data** switch adds the practice orders used to demonstrate the reports, and the screen says so while it is on.

**Predictive analytics (Forecast)**
- The forecast uses three methods: a seasonal-naïve baseline, Holt-Winters exponential smoothing, and a multiple linear regression.
- The regression is a supervised machine-learning model that learns from the daily sales history how much each day of the week, payday, holiday, and bakery event raises or lowers sales.
- The three methods are compared for each product on a rolling four-week backtest, and the most accurate one is used.
- The forecast runs automatically every night after the day's sales are complete. It learns from the assumed sales history until the bakery has 56 days of real sales, and from the real sales after that. The administrator can also run one at any time.
- The forecast guides the daily standards and the hard-bread levels, and the Production list's forecast check warns when a product is expected to sell more than the plan.

Each of these modules works together to create an integrated system that supports the operational needs of the business. The system is designed with simplicity and ease of use as primary considerations, so that staff and customers can use its features without extensive technical knowledge. By integrating these modules into a single web-based platform, the system provides a structured, reliable, and efficient approach to order and business management.

## Objectives

### General Objective

The general objective of this study is to design, develop, and implement PECTRACK, a web-based Order Management System with predictive analytics and automated inventory for Pecto's Bakery in Lucban, Quezon. It enables customers to browse products, place orders, and pay online, while providing the administrator, cashiers, and delivery personnel with a centralized platform to manage daily operations efficiently.

### Specific Objectives

1. **To develop a web-based order management system.**
   The system improves the efficiency and organization of Pecto's Bakery's daily operations. It handles online, walk-in, and advanced orders, payment, pickup, and delivery in one platform, reducing reliance on manual and paper-based processes and improving the management of business transactions.

2. **To implement a structured database for bakery operations.**
   The system stores and manages all bakery-related data in a structured database: customer and staff records, orders, payments, product inventory, production events, and transaction records. Authorized users can create, view, update, and deactivate records to maintain data accuracy. By organizing data systematically, the system eliminates redundancy, ensures data consistency, and allows authorized users to manage the information needed for daily bakery operations efficiently.

3. **To deliver a web-based system with authentication features for data privacy.**
   The system gives access to authorized users only, through a secure login and role-based access. Security measures include:
   - the administrator enters a One-Time Password (OTP) sent by email, with the option to trust a device for 30 days;
   - customers verify their mobile number with an SMS code and confirm their email address before ordering;
   - any account is locked for 15 minutes after five failed sign-in attempts.

   Through these measures, the system safeguards sensitive business data such as customer information, order records, and inventory details from unauthorized access, ensuring confidentiality and data privacy.

4. **To automate the bakery's inventory.**
   The system deducts stock automatically as orders are placed, and returns the stock of unpaid orders that are released or cancelled. Every morning it tops soft breads up to their daily standard, and it signals when hard breads should be produced. It also builds hard breads up ahead of weekends and events, giving the bakery an accurate, current view of its stock without manual counting after every sale.

5. **To create a reporting and predictive analytics module for the bakery.**
   The system generates reports on sales, best-selling products, peak ordering periods, inventory movements, and payment transactions. It also forecasts the next seven days' sales of each product using a machine-learning regression model compared against simpler methods. This enables the bakery to make informed decisions on production, identify trends, and develop strategies that support the growth of Pecto's Bakery in Lucban, Quezon.

## Scope and Limitations

The general purpose of this study is to design, develop, and implement PECTRACK, a web-based Order Management System with predictive analytics and automated inventory for Pecto's Bakery in Lucban, Quezon. It operates as an e-commerce platform that enables customers to browse products, place and pay for orders, and follow their orders online, while providing the bakery with a centralized system to manage its daily operations.

The target users and beneficiaries of this study are:
- the **customers** of Pecto's Bakery, who benefit from browsing products and ordering online without a physical visit to the store;
- the **administrator**, who gains full system control, including products, inventory, production, users, and reports;
- the **cashiers**, who are provided with a structured way to take walk-in and advanced orders, record payments, manage stock, and assign deliveries;
- the **delivery personnel**, who are provided with a phone-friendly interface for managing and updating their assigned deliveries.

### Features by module

**Login Module**

> *Figure 1. Log-in pop-up (Customer and Admin entrances)* — retake screenshot.

The log-in pop-up shows the bakery logo, a short welcome line, the Customer / Admin switch, the username or email and password fields, "Keep me logged in", "Forgot password?", and one Log in button. Customers also see "Create an account". For the administrator, a second step asks for the emailed code, with the option to trust the device for 30 days.

> *Figure 1.1 Forgot password* — new screenshot.

"Forgot password?" opens a page in the same style as the log-in, where the user enters their email address to receive a reset link. The link opens a page to choose a new password.

> *Figure 1.2 Create account* — retake screenshot.

Registration asks for the customer's first and last name, username, contact number, email address, password, and password confirmation, and requires agreement to the Terms of Service and Privacy Policy.
- **Password:** at least 12 characters long, with uppercase and lowercase letters, a number, and a symbol; common passwords are refused.
- **Contact number:** digits only, verified with a code sent by SMS.
- **Duplicates:** a username, email address, or contact number already in use is refused.
- **Email:** after registering, the customer confirms the email address through a link before placing an order.

> *Figure 1.3 Home page* — retake screenshot.

The home page presents the bakery in its own colours and photographs, with links to Home, Menu, Our Story, and Visit Us, and the bakery's history since 1947.

**Dashboard Module**

> *Figure 2. Admin dashboard*, *Figure 2.1 Cashier dashboard* — retake screenshots.

The dashboard opens with a greeting that states how many things need attention, followed by the Today row (orders today, sales today, cash not yet paid), the status tiles, and the Running out, Needed by, and Recent orders lists.

> *Figure 2.2 My Deliveries (delivery personnel)* — retake screenshot.

Delivery personnel land on My Deliveries, built for use on a phone. Each card shows:
- the customer's name and a tap-to-call contact number;
- the delivery address;
- the order total, marked as paid;
- a "Start delivery" button.

There is no map or GPS tracking; delivery is a status checklist.

**User Management Module**

> *Figure 3. User Management — Customers*, *Figure 4. User Management — Staff* — retake screenshots.

The Customers tab lists every registered customer with their name, username, contact number, email address, and account status, with a search box, and the admin can edit or deactivate an account. The Staff tab creates and manages cashier and delivery personnel accounts. Both are for the admin only.

> *Figure 5. Customer account*, *Figure 5.1 My Profile*, *Figure 5.2 Change password* — retake screenshots.

The customer's account page has three tabs:
- **My Profile:** profile, saved addresses, and password;
- **My Orders:** the customer's orders, with their status and receipts;
- **My Payments:** the customer's payments.

**Order Management Module**

> *Figure 6. Order Management — Orders*, *Figure 7. Walk-in / Advanced order (cashier)*, *Figure 7.1 Walk-in receipt* — retake screenshots.

The Orders tab shows the orders for Today, Upcoming, or a chosen date, with their status, the customer, and a "Not paid" tag on cash orders still to be paid. The order detail shows the items, the requested time, the payment method and whether it is paid (including the cash received and the change), and, for a delivery waiting for a rider, an Assign rider control. The Walk-in tab switches between Walk-in and Advanced order as described in the Purpose and Description.

> *Figure 8. Delivery in progress (delivery personnel)* — retake screenshot.

After "Start delivery", the card shows the proof-of-delivery photo upload (up to five JPEG or PNG photos), "Mark delivered", and "Couldn't deliver" with a field for the reason.

> *Figure 9. Menu (customer)* — retake screenshot.

The Menu shows the bakery's products grouped by category, with a search box. Each product shows its photo, name, size or pack, and price, with Add to cart. Sold-out products are marked and cannot be ordered.

**Inventory Management Module**

> *Figure 10. Inventory — Products (soft and hard breads)*, *Figure 10.1 Edit (Add stock / Correct count)*, *Figure 10.2 Production and Events, with the forecast check*, *Figure 10.3 Low-stock warning*, *Figure 11. Ingredients*, *Figure 11.1 Edit Products* — retake screenshots.

The Products tab lists soft breads and hard breads separately, each with its own status filters and category filters. The Edit button opens Add stock and, for the administrator, Correct count, each with a confirmation. The Production tab lists what to bake for a chosen day, with the forecast for each product and the Events calendar below it. The Ingredients tab monitors ingredient stock. Edit Products maintains the product catalogue.

**Payment and Billing Module**

> *Figure 12. Payment & Billing — Billing*, *Figure 13. Payment log and its PDF* — retake screenshots.

The Billing tab lists the orders ready for pickup, ready for delivery, and completed, with each order's receipt, payment method, and a "Not paid" tag on cash orders still to be paid. The Payment log lists every payment received and exports it as a PDF with the total.

> *Figure 15. Checkout (customer)* — retake screenshot.

At checkout the customer chooses pickup or delivery, the date and an available time, and, for delivery, a saved address in Lucban. A pickup is paid in cash at the counter or with GCash; a delivery is paid with GCash, and the summary shows the ₱50 delivery fee in the total.

**Delivery Management Module**

> *Figure 14. Delivery Management* — retake screenshot.

Staff see the deliveries to assign, assigned, out for delivery, and delivered, and assign each waiting delivery to a rider.

**Reporting and Analytics Module**

> *Figure 16. Sales*, *Figure 16.1 Products*, *Figure 16.2 Inventory*, *Figure 16.3 Forecast*, *Figure 17. Export history*, *Figure 18. Delivery history (delivery personnel)* — retake screenshots.

The module has the Sales, Products, Inventory, Forecast, and Export history tabs described in the Purpose and Description, for the admin only. Delivery personnel see their own delivery history over a chosen date range.

### Limitations

1. **Prototype and Data Exclusivity for Pecto's Bakery only.**
   - **Tailored to Pecto's:** the PECTRACK system is developed for, and tailored to, the operational needs of Pecto's Bakery in Lucban, Quezon. All modules, workflows, and database structures follow the bakery's existing business processes.
   - **Data ownership:** all data stored, processed, and generated within the system belongs to Pecto's Bakery. This includes product information, customer records, transaction histories, inventory data, and reports, which are used solely for the purpose of this capstone project.
   - **Delivery and payment:** delivery is limited to the municipality of Lucban, Quezon, for a flat delivery fee of ₱50. Delivery orders must be paid in full beforehand with GCash; the system does not offer cash on delivery. Cash is accepted only at the counter, including for online pickup orders paid when collected. Paid orders are not refunded.

2. **Internet Dependency.** As a web-based platform, the system requires a stable internet connection. Any network interruption on the part of the cashier, delivery personnel, or customers may disrupt order placement, status updates, and payment processing.

3. **SMS Dependency.** SMS codes and order-number messages are sent through an SMS gateway (textbee) running on an Android phone kept by the bakery. The phone must be on, online, and loaded, and the free service allows a limited number of messages per day. When the phone is unavailable, phone verification can be turned off temporarily.

4. **Assumed Sales History for the Forecast.** The bakery has not kept sales records that the system can import. As approved by the adviser, the forecast is demonstrated on an assumed one-year sales history built from the bakery's described patterns:
   - higher sales on weekends;
   - about four times the usual on events, mainly in hard breads;
   - payday effects.

   The assumed data is labelled as such and is kept out of the sales reports.
   - **Accuracy:** the forecasting method is validated on the assumed history. The accuracy figure on screen, labelled "Method test (practice data)", shows how well the method fits the assumed pattern, not the bakery's real demand. Its accuracy on Pecto's real sales will be measured once 56 days of real sales exist; the system then switches to them by itself.
   - **Demonstration orders:** to show the reports working, practice orders can be added. They are marked as practice data and appear only when the Demo data switch is on.
   - **Sold-out days:** on days when a product sells out, the true demand is not known, so those days are left out of the forecast's learning.

5. **Ingredient Monitoring Only.** Ingredient stock is monitored, not automated. Ingredients are not deducted when bread is baked, because the system does not store recipes, so ingredient counts are kept current by recorded deliveries and the administrator's stock checks.

6. **No Record of Rejects.** Following the bakery's practice, rejected or wasted products are not recorded in a separate list. They are reflected through the administrator's stock count corrections. The system does not track how many days leftover soft breads have been on the shelf.

7. **Back-up and Maintenance.**
   - **Backups:** the system requires regularly scheduled data backups to prevent the permanent loss of critical business information, such as customer records, order histories, payment transactions, and inventory data, in the event of system failure or data corruption.
   - **Maintenance:** periodic maintenance (security updates, software patches, and performance improvements) must be carried out to keep the system operating efficiently and securely. During scheduled maintenance the system may be temporarily unavailable.
   - **Responsibility:** the long-term reliability of PECTRACK depends on the consistent execution of these procedures by the bakery administrator in coordination with the system developers.

---

## Notes for the team (not part of the chapter)

- **Kept unchanged:**
  - **Project Context:** kept as written, with one paragraph added on predictive analytics and automated inventory to support the new title. Its citations are unchanged; add a source for that paragraph if your adviser requires one.
  - **Background of the Problem:** the interview findings are as written.
- **Background additions:** the follow-up consultations (payment first, soft and hard breads, weekends and events, no rejects list).
- **Removed, because the system no longer does it:**
  - cashier stock changes needing admin approval;
  - expiration dates;
  - the bulk-order threshold;
  - the 30-minute staff auto-logout;
  - statuses Placed, Confirmed, and In Production;
  - the "Staff sign in" wording, "Customer Management Module" and "Product Management" as separate modules;
  - "AI-Assisted Analytics";
  - refunds;
  - the "unpaid order is not cancelled automatically" line.
- **Objectives:** now five instead of four. *To automate the bakery's inventory* was added so that both parts of the title have an objective. Check with your adviser whether five is acceptable.
- **Figures:** every figure needs a new screenshot; the captions above say what each should show. Figure numbers follow the old order where possible; renumber after retaking.
- **Updated 2026-10-25, to match the system after the seniors' consultation and the reports review:**
  - cashier access: no reports, no User Management;
  - "Paid before release": cash at pickup, GCash for delivery, the ₱50 delivery fee, time slots, and the fixed Lucban address;
  - stock is deducted when an order is placed;
  - the Reporting and Analytics module, rewritten: admin only, the new tabs, Export history, the Demo data switch, and the nightly forecast with the switch to real sales;
  - the Production forecast check;
  - the low-stock warning;
  - the Dashboard's Today row;
  - Limitation 4 (accuracy wording);
  - the figure list.

  Other chapters need the same changes; see docs/PAPER_CHANGES_FOR_MOCK_DEFENSE.md.
- **Mock defense:** be ready to explain the 5:00 AM top-up, the production list with weekends and events, and the forecast method (three methods, backtest, regression with an event variable). On accuracy, say: "the method is validated on assumed history; real accuracy is measured after 56 days of real sales, when the system switches to them by itself." Do not quote the practice-data figure as the bakery's accuracy.
