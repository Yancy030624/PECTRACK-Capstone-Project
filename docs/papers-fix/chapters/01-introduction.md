# Chapter 1: Introduction

Source: docs/PECTRACK_REVISED.pdf, PDF pages 5–56.

<!-- PDF page 5 -->

## Project Context

## INTRODUCTION

Order Management Systems (OMS) have become an important part of modern business operations because they help businesses organize transactions, coordinate order fulfillment, and monitor product availability. As businesses increasingly accept orders through different channels, managing transactions through separate platforms and manual records can make it difficult to maintain consistent and accurate order information. Jimenez et al. (2024) examined the design and evaluation of order management software for small and medium-sized enterprises (SMEs) in Lima, Peru. Their study involved 308 employees and reported positive evaluations of the system's usability and perceived operational efficiency. Similarly, Sinaga and Johan (2024) designed a web-based Order Management System to help a company consolidate transactions received through multiple online marketplaces. These studies demonstrate how centralized order management can help organize order information and simplify the work involved in handling transactions.

Order management also depends on effective inventory control and coordination throughout the order fulfillment process. Labastida et al. (2024) developed a web-based ordering system for a start-up business that integrated online ordering, inventory management, and demand forecasting. Their work demonstrates the potential of combining these functions within a single platform to support business operations. In addition, Panigrahi et al. (2024) reviewed research on inventory management and its relationship with SME performance. Their findings highlight the importance of inventory-related knowledge, technology, and appropriate management practices in supporting business operations. For small businesses, integrating order records with inventory information can help personnel monitor product availability, keep stock records organized, and make better-informed decisions about order fulfillment.

In food-related businesses, accurate order handling and reliable fulfillment are particularly important because customers often expect their orders to be prepared and

<!-- PDF page 6 -->

released within a specified period. Bonfanti et al. (2023) examined expectations regarding online food ordering and delivery services and identified accuracy, punctuality, and the ability to meet expected service requirements as important considerations. Wu et al. (2024) also examined food delivery service quality and found that reliability, system operation, and order traceability were among the factors associated with customer satisfaction and the intention to reuse a service. These findings support the importance of maintaining accurate order details, providing clear status information, and coordinating the preparation and delivery of orders. A web-based Order Management System can help address these operational needs by providing a centralized record of transactions and making order progress easier to monitor.

Furthermore, predictive analytics can complement order and inventory management by helping businesses estimate future product demand. Hübner et al. (2024) investigated the use of machine-learning-based demand forecasting in a bakery setting, focusing on its potential to reduce food waste through improved sales forecasting. Their study illustrates the relevance of demand estimation to bakeries, where unsold products and inaccurate production planning can create operational challenges. When combined with order records and inventory monitoring, predictive analytics can provide additional information for planning product quantities and identifying expected demand patterns. However, the usefulness of forecasting depends on the quality and availability of historical data, and predictions should be evaluated according to the data on which they are based.

Taken together, the reviewed studies demonstrate the importance of integrating order management, inventory monitoring, and demand forecasting into business operations. Research on web-based order management highlights the value of centralized transaction records, while studies on inventory management and food ordering emphasize accurate stock information, reliable order fulfillment, and effective monitoring. These findings provide a basis for developing PECTRACK, a web-based Order Management System with Predictive Analytics and Inventory System for Pecto’s Bakery in Lucban, Quezon. The proposed system aims to consolidate online, walk-in, and advanced orders, record

<!-- PDF page 7 -->

payment information, monitor order status, and maintain organized product inventory records. It will also demonstrate demand forecasting using assumed historical sales data, as actual historical records are unavailable for the study. Therefore, its predictive results will demonstrate the application of forecasting methods rather than represent verified predictions of the bakery’s actual sales.

## Background of the Problem

Pecto’s Bakery, established in 1947 and located in Lucban, Quezon, is one of the long-standing local bakeries that has continuously served its community and nearby areas. Over the years, the bakery has expanded its reach by offering delivery services within Lucban and across different parts of Quezon Province. With decades of operation and continuous business growth, the bakery has established a strong customer base and remains one of the recognized local bakeries in the area.

Based on the interview conducted with the management, the bakery accommodates approximately 500–700 customers daily, particularly during regular operating days, with higher customer volume during weekends, holidays, and bulk-order seasons. Despite its long history and growing customer demand, the bakery continues to rely heavily on traditional and manual procedures for managing customer orders, customer records, and transactions.

At present, customers place their orders either by sending messages through the bakery’s official Facebook page or by directly visiting the physical store. While these methods provide customers with different ways to place orders, they do not provide a single, centralized platform for organizing transactions. Customer information is recorded manually in logbooks or on paper, while confirmed orders are written down and forwarded to the personnel responsible for preparation. This workflow involves several steps before an order is completed. Based on the information gathered during the interview, the bakery follows these procedures in managing customer orders:

1. Receiving customer inquiries.

<!-- PDF page 8 -->

2. Checking product availability. 3. Manually listing orders. 4. Confirming order details. 5. Forwarding orders to the assigned personnel. 6. Preparing the products. 7. Monitoring inventory manually. 8. Confirming payments. 9. Preparing orders for pickup or delivery. 10.Manually updating customers regarding their order status.

To better understand these operational challenges, an interview was conducted with the General Manager of Pecto’s Bakery, Mrs. Katherine R. Abillar, who has been managing the bakery for many years as part of their family-run business. The following are the significant problems identified:

● Decentralized Order Management: The interview revealed that Pecto’s Bakery receives customer orders through its official Facebook page and direct verbal communication with cashiers for walk-in transactions. The admin or manager handles online orders, while the sales lady manages walk-in customers. This decentralized approach may lead to inconsistent order records, miscommunication, and discrepancies in transaction handling and inventory tracking. To address this problem, PECTRACK will provide a centralized web-based platform for managing customer orders and related transactions. This will allow authorized personnel to access organized order information and coordinate order handling more efficiently.

● Manual Order Recording and Processing: Mrs. Abillar explained that confirmed orders are written on paper and forwarded to the personnel responsible for preparation. Order details are sometimes verified through customer messages and pictures before being recorded. These manual procedures may result in misplaced order slips, incomplete order details,

<!-- PDF page 9 -->

transcription errors, and communication delays, particularly during peak operating hours and when handling large-volume transactions. PECTRACK aims to reduce these issues by digitally recording and organizing customer orders, making order information more accessible to authorized personnel and improving the monitoring of order preparation and fulfillment. ● Lack of Centralized Customer Information and Order History: The interview revealed that Pecto’s Bakery does not have a centralized database for managing customer information and previous transactions. As a result, retrieving customer records and reviewing order history may become time-consuming, especially when serving an estimated 500–700 customers daily. This limitation can make it difficult to verify repeat orders and maintain organized customer information. PECTRACK aims to address this concern by providing centralized customer records and order history, allowing authorized users to retrieve relevant information more efficiently and maintain organized transaction records. ● Limited Visibility into Order Status and Scheduling: Mrs. Abillar explained that delays may occur when production schedules do not align with customers’ expected pickup times. For example, an order scheduled for 6:00 may not be ready until 7:00 because the baked products still require time to finish baking and cool before release. When such delays occur, customers must contact the bakery to ask about their order status. To address this problem, PECTRACK will provide order status monitoring so that authorized personnel can track order progress and customers can check available updates through the system. This feature aims to improve communication, provide better visibility into order fulfillment, and reduce the need for repeated inquiries about order status. ● Manual Payment Verification and Order Release: According to Mrs. Abillar, orders must be paid for before they are released, while delivery orders require full payment in advance to minimize losses from refused deliveries. However, coordinating payment information with individual orders

<!-- PDF page 10 -->

may become challenging when transaction records are handled separately.

PECTRACK aims to address this concern by linking every payment to its order. A

customer who pays online scans the bakery's QR Ph code and enters the

payment's reference number, and the order is held until a staff member confirms

that payment. The system refuses a reference number that was already used,

records who confirmed each payment and when, and releases an order only once

it is paid. Staff no longer need to match payments with messages and paper

records, although the check against the bakery's bank or e-wallet app remains a

manual step, as stated in the Scope and Limitations.

● Manual Inventory Monitoring and Production Planning :

According to Mrs. Abillar, orders must be paid for before they are released, while

delivery orders require full payment in advance to minimize losses from refused

deliveries. However, coordinating payment information with individual orders

may become challenging when transaction records are handled separately.

PECTRACK aims to address this concern by providing a centralized means of

recording payment details and associating payment status with corresponding

orders. This feature will support personnel in verifying payment completion and

coordinating order release in accordance with the bakery’s payment policies.

● No Sales History for Planning :

Because orders and sales are recorded on paper, the bakery has no organized

record of its past sales by product and by day. Production quantities therefore rely

on experience, and the bakery cannot readily review which products sell more on

particular days, weekends, or events. For the same reason, actual historical sales

data are not available for this study. To address this problem, PECTRACK will

record every sale by product and date, so that a sales history builds up from the

first day of use. The system will report sales, best-selling products, and peak

ordering periods, and will demonstrate demand forecasting on this history. Until

enough actual sales are recorded, the forecast will be demonstrated on assumed

<!-- PDF page 11 -->

historical data, as approved by the adviser, and it will switch to actual sales after 56 days.

The findings from the interview demonstrate that Pecto’s Bakery encounters challenges related to decentralized order management, manual record-keeping, customer information retrieval, order status monitoring, payment verification, inventory monitoring and production planning, and the lack of a sales history. These concerns may affect the efficiency of daily operations, particularly when the bakery handles hundreds of customers and large-volume orders. Without a centralized system, personnel must coordinate information through separate communication channels and manually maintained records, making order management more difficult during busy operating periods.

In response to these identified problems, the proposed study aims to develop PECTRACK: A Web-Based Order Management System with Predictive Analytics and Inventory System for Pecto’s Bakery in Lucban, Quezon. The system is designed to centralize order management, customer information, transaction records, and inventory monitoring within a single web-based platform. It will support the digital recording of orders, the retrieval of customer order history, the monitoring of order status, and the recording of payment details. Through these functions, the system aims to reduce repetitive manual tasks, minimize errors associated with paper-based records, improve coordination among authorized personnel, and provide customers with better access to their order information.

Furthermore, the integration of predictive analytics and inventory management is intended to support the bakery in monitoring product availability and demonstrating how demand trends can be used to assist inventory planning. Since actual historical sales data are not available for the predictive analytics component, the study will use assumed historical data for demonstration and evaluation purposes, subject to the approval

<!-- PDF page 12 -->

provided by the adviser. Therefore, the predictive results will illustrate the potential application of analytics rather than represent verified forecasts of Pecto’s Bakery’s actual sales.

Ultimately, PECTRACK aims to provide Pecto’s Bakery with a more organized and accessible approach to managing customer orders, transaction records, and inventory information. By addressing the identified operational challenges through a centralized web-based system, the proposed study seeks to improve workflow efficiency, support more systematic inventory planning, strengthen order monitoring, and enhance the overall service experience for both bakery personnel and customers.

## Purpose and Description

Pectrack is a web-based Order Management System with predictive analytics and inventory system made to improve Pecto's Bakery In Lucban Quezon in its daily transactions. It helps make ordering, product tracking, and inventory management faster and more organized. Instead of using paper and manual processes, the system stores everything digitally, which reduces errors and saves time.

The name Pectrack was coined from Pecto's Bakery and the word Track, reflecting the system's capability of monitoring and tracking the final baked products keeping track of how many items are produced, currently available, and sold. This ensures that the bakery always has an up-to-date view of its product inventory.

The system caters to different user roles including Admin, Cashier and Customer each with specific access and functions suited to their responsibilities. All data is stored digitally, which reduces errors and saves time, providing a more reliable and efficient experience for both the business and its customers.

Below are the following concepts that can incorporate in the proposed study:

<!-- PDF page 13 -->

- Login Module

The Login Module secures the system by verifying the identity of each user before granting access. The sign-in form opens as a pop-up window over the page the visitor is currently viewing and provides two entrances: Customer and Admin. The Admin entrance is used by the administrator and cashiers, each entrance refuses accounts that belong to the other. To sign in, users enter their username or email address together with their password, after which the system validates the credentials and determines the level of access based on the user's assigned role. To protect accounts from unauthorized access, the system locks an account for 15 minutes after five failed sign-in attempts. Users who forget their password may request a password reset link through email. When the "Keep me logged in" option is selected, the user remains signed in on that device for up to seven days; otherwise, the session ends once the browser is closed. All users may sign out through the My Profile page.

New customers register by providing their first and last name, username, number and is verified through a six-digit code sent by SMS before the account is created. The customer is then required to confirm the email address through a link sent by email before placing an order.

The administrator account is subject to an additional layer of security. After passing credential validation, the administrator must enter a six-digit One-Time Password (OTP) sent by email, which remains valid for five minutes. The administrator may mark the device as trusted for 30 days, after which signing in on that device requires only the password; changing the password removes all trusted devices. Once verified, the administrator is directed to the Dashboard and is given full access to all modules.

<!-- PDF page 14 -->

The other users are likewise directed to the page appropriate to their role. Cashiers are directed to the Dashboard and are given access to the operational features of the system, namely orders, walk-in and advanced orders, inventory and production, payments and the payment log, and deliveries, while the User Management and Reporting and Analytics modules remain exclusive to the administrator. Customers are directed to the online Menu, where they browse products, place and pay for orders, and track the progress of their orders.

- Dashboard Module

The Dashboard Module provides the administrator and the cashier with an at-a-glance overview of the matters that require attention. At the top, a "Today" row presents the orders paid for the day, the day's sales excluding delivery fees, and the cash orders that remain unpaid. Below this row, color-coded status tiles, in which green indicates Good, yellow indicates Okay, and red indicates Needs Attention, summarize the soft breads about to be sold out, the hard breads and ingredients low on stock, the orders for the day, and the deliveries awaiting a rider. Selecting a tile opens the corresponding module already filtered to the concern. The Dashboard also displays a Running Out list of products with low stock, a Needed By list of paid orders still to be picked up or delivered, each marked according to how near its requested time is, and a list of the most recent orders.

- User Management Module The User Management Module maintains the records of the individuals who use the system. It is accessible only to the administrator and is organized into two tabs: Customers and Staff. Under the Customers tab, the administrator can search the customer list, correct a customer's details, and deactivate or reactivate an account. Customers create their own accounts through registration, which refuses any username, email address, or contact number already in use, and they manage their own profile, saved delivery addresses, and password through their account

<!-- PDF page 15 -->

page. Under the Staff tab, the administrator creates and manages the accounts of cashiers, edits their details, resets their passwords, and deactivates or reactivates their accounts.

- Order Management Module

The Order Management Module oversees each order from placement to completion. In line with the policy of the bakery, every order is paid before it is released to the customer. An order progresses from Ready for Pickup or Ready for Delivery, to Out for Delivery in the case of deliveries, and finally to Completed. An online order paid through GCash is held for 15 minutes while the customer completes the payment; if the payment is not made within this period, the system releases the order and returns its stock to inventory. Alternatively, a pickup order may be paid in cash at the counter. Such an order is immediately placed as Ready for Pickup and is marked Not Paid until the cashier records the cash payment, with the order details indicating the payment method. A customer may have only one unpaid cash order at a time, and any cash order not collected by the end of its scheduled day is automatically cancelled. Delivery orders, on the other hand, are payable through GCash only and carry a delivery fee of ₱50. Since the bakery does not grant refunds, paid orders cannot be cancelled; however, customers may cancel their own unpaid cash orders.

Staff members view the orders for the current day, the upcoming orders, or the orders for any chosen date, which may be filtered by status and searched by order number or customer name. Each order displays its items, requested time, payment, and progress, and a delivery order awaiting a rider may be assigned to one directly from its details.

Counter orders are handled by the cashier through the Walk-in tab and are classified into walk-in orders and advanced orders. A walk-in order is placed by a customer who is present at the counter, requires no customer details, and is paid in

<!-- PDF page 16 -->

full through cash or GCash; a printable receipt showing the cash received and the change serves as its proof of order. An advanced order, by contrast, is picked up on a later date and requires the customer's name, contact number, which is verified through an SMS code, and the preferred pickup date and time. It is likewise paid in full through cash or GCash, and the order number is sent to the customer by SMS as proof of order, which remains accessible even without an internet connection. To add products to either type of order, the cashier types the first letters of a product's name and selects it from the list of matching products, and quantities may be entered directly.

For online orders, customers browse the Menu, add items to the cart, and choose between pickup and delivery. Customers may leave the time blank to receive the order as soon as it is ready, or they may select a date and one of the available time slots, which are offered every 30 minutes from 5:00 AM to 10:00 PM for up to 30 days in advance. A pickup order may be paid in cash at the counter or immediately through GCash, whereas a delivery order is paid through GCash with the ₱20 delivery fee added to the total. Saved delivery addresses are limited to Lucban, Quezon, with the customer providing the street, barangay, and other necessary details.

- Inventory Management Module

The Inventory Management Module keeps the stock of every product up to date. Stock is automatically deducted when an order is placed, with the stock of an online GCash order set aside while the payment is being made, and is automatically returned when an unpaid order is released or cancelled. The module follows the two methods of stocking practiced by the bakery, one for soft breads and another for hard breads.

Each soft bread is assigned a daily standard stock. Every day at 5:00 AM, the system automatically tops up each soft bread to its standard, wherein the leftovers

<!-- PDF page 17 -->

from the previous day are sold first and only the difference is baked. Soft breads are not restocked during the day. A soft bread is labeled About to Be Sold Out when its stock falls below one-fifth of its standard and Sold Out Today when its stock reaches zero. A soft bread ordered in advance is baked on its pickup day in addition to the standard, so that it does not reduce the stock available to walk-in customers for that day. Each hard bread, on the other hand, is assigned a minimum level, which signals when to produce, and a stop level, which determines how much to produce. A hard bread is labeled Low Stock when its stock is at or below its minimum level.

Stock may be adjusted in two ways. When stock is added, the pieces received are added to the quantity on hand, and the system asks the user to confirm the new total before saving. When a count is corrected, the administrator sets the actual quantity after a physical inspection, such as when bread is discarded. Every change is recorded together with the user who made it and the time it was made.

The Production tab lists the quantity of each product to be baked for a chosen day. For a soft bread, the quantity is computed as the standard less the stock on the shelf, plus the advanced orders for that day. For a hard bread at its minimum level, the quantity is the stop level less the stock on hand. Hard breads are automatically built up to twice the stop level beginning Thursday in preparation for the weekend, and to the multiplier of an event, which is four times the stop level by default, beginning one week before the event. The administrator maintains an Events calendar covering Holy Week, the Pahiyas Festival, Christmas, New Year, and long weekends, and the Production list indicates which event or weekend raised the quantity. Beside each product, a forecast check displays the expected sales for that day. When the forecast expects more sales than the planned stock, the list shows the shortfall, for example "+20 more," and a count of such products appears at the top of the list. While the stocking rules continue to determine the

<!-- PDF page 18 -->

quantities to be baked, the forecast check serves as a warning before a product sells out. The Production list may also be printed.

The module also monitors the stock of ingredients. Staff members record ingredient deliveries, the administrator corrects the counts, and ingredients that reach their minimum level are flagged. Through the Edit Products feature, the administrator maintains the product catalog, including each product's category, bread type (soft or hard), price, size or pack, description, photo, and availability for sale.

- Payment and Billing Module

The Payment and Billing Module processes and records every payment made in the system. At the counter, the cashier records cash payments, for which the system computes the change from the amount received, or GCash payments together with their reference numbers. Online orders for cash pickup are likewise paid at the counter upon collection. Online payments are processed through QR Ph using GCash, and the system confirms each payment automatically. Delivery orders are paid in full in advance, inclusive of the delivery fee, as cash on delivery is not offered.

Each paid order is issued a digital receipt showing the items purchased, the delivery fee if applicable, the total amount, the amount received, and the change. Staff members can view the orders ready for pickup or delivery as well as the completed orders, each with its payment method and payment status. The Payment Log lists every payment received, may be filtered by date and payment method, and may be exported as a PDF file. Customers, for their part, can view their own receipts and payment records.

<!-- PDF page 19 -->

- Notifications

The system keeps its users informed through several channels. Within the application, a notification bell alerts staff members and riders of new orders, payments, deliveries, and orders due within the hour. When a product falls to its minimum level, the administrator and the cashier receive a red low-stock warning accompanied by a distinct sound, which opens the Inventory module when selected. Through email, customers are notified when their order is ready, out for delivery, and delivered. Through SMS, the order number of an advanced order is sent to the customer.

- Reporting and Analytics Module

The Reporting and Analytics Module transforms the recorded data of the bakery into reports and forecasts. It is accessible only to the administrator. Every report may be printed or saved as a PDF file, and the sales report and the forecast may also be exported in CSV format. The module is organized into five tabs. The Sales tab presents the sales, defined as the money received excluding delivery fees, together with the number of orders, and the delivery fees for any date range, grouped by day, week, or month. It also presents a chart of sales and orders, the sources of sales by payment method (cash or GCash) and by order type (walk-in, online pickup, or delivery), the unpaid cash orders, and the peak ordering periods by hour and by day of the week. The Products tab ranks the best-selling products by the number of pieces sold, for all breads or for soft or hard breads only, together with their revenue. The Inventory tab shows, for the selected dates, the number of pieces of each product baked or added, sold, and lost through rejects and downward count corrections. The Forecast tab presents the expected sales of each product for the next seven days and identifies the busiest day ahead. Finally, the Export History tab records every report downloaded or printed, together with the user who did so and the time it was done.

<!-- PDF page 20 -->

The payment log, as previously discussed, is located in the Payment and Billing Module. The reports reflect the actual transactions of the bakery; however, a Demo Data switch adds the practice orders used to demonstrate the reports, and the screen indicates when this switch is turned on. The forecasting feature of the module employs three methods: a seasonal naïve baseline, Holt-Winters exponential smoothing, and multiple linear regression. The multiple linear regression is a supervised machine learning model that learns from the daily sales history the extent to which each day of the week, payday, holiday, and bakery event raises or lowers sales. The three methods are compared for each product through a rolling four-week backtest, and the most accurate method is selected. The forecast runs automatically every night after the sales of the day are complete. It learns from the assumed sales history until the bakery accumulates 56 days of actual sales, after which it learns from the actual sales. The administrator may also run the forecast manually at any time. The forecast guides the setting of the daily standards and the hard bread levels, and the forecast check in the Production list warns when a product is expected to sell more than the planned quantity. These modules work together to form an integrated system that supports the operational needs of the business. The system is designed with simplicity and ease of use as its primary considerations, enabling staff and customers to use its features without extensive technical knowledge. By integrating these modules into a single web-based platform, the system provides a structured, reliable, and efficient approach to order and business management.

<!-- PDF page 21 -->

## Objectives

## General Objective

The general objective of this study is to design, develop, and implement PECTRACK: A Web-Based Order Management System with Predictive Analytics and Inventory System for Pecto's Bakery in Lucban, Quezon. The system centralizes the bakery's online, walk-in, and advanced orders, customer records, order status, payments, and product inventory in a single web-based platform, and demonstrates demand forecasting to support the bakery's inventory planning.

## Specific Objectives

1. To centralize the bakery’s order management in a single web-based platform. The system receives online orders through the bakery's web storefront, and walk-in and advanced orders through the cashier's counter screen, and lists all of them in one order list that every authorized staff member sees. This replaces the separate handling of Facebook messages by the admin and walk-in orders by the sales lady, and reduces inconsistent records and miscommunication.

2. To record and process customer orders digitally. Every order is saved with its items, quantities, prices, requested pickup or delivery time, and a daily order number, and each paid order has a printable receipt. Recording an order also deducts its stock automatically. This removes handwritten order slips and the misplaced slips, missing details, and copying errors that come with them.

<!-- PDF page 22 -->

3. To maintain centralized and secure customer records and order history

Customers with accounts keep their contact details, saved delivery addresses, and past orders with their receipts, so the bakery and the customer can retrieve them at once. Access is limited to authorized users: customers verify their mobile number with an SMS code, the administrator signs in with a one-time password sent by email, accounts are locked for 15 minutes after five failed sign-in attempts, and each role sees only its own functions. 4. To provide order status monitoring and scheduling.

Customers choose a pickup or delivery time in 30-minute slots from 6:00 AM, an hour after the 5:00 AM bake, so the breads have cooled before release, and staff see which orders are needed next. Each order moves through Ready for pickup or Ready for delivery, Out for delivery, and Completed; staff update the status in the system, and customers see it on their orders and receive email updates. Advanced orders reserve their bread when they are placed: hard breads are taken from the stock, and soft breads are added to the bake list for the pickup day. Customers see when their order is ready instead of messaging the bakery to ask. 5. To record payments and link them to order release.

The system records cash and QR Ph payments and shows each order's payment status. For a QR Ph payment, the customer scans the bakery's QR Ph code, pays in their own bank or e-wallet app, and enters the reference number; a staff member confirms each payment before the order is released. An order is released only once paid, and delivery orders are paid in full beforehand, following the bakery's policy. A payment log lists every payment and can be exported as a PDF.

6. To automate the monitoring of the bakery’s product inventory

<!-- PDF page 23 -->

Stock is deducted as orders are placed and returned when an unpaid order is cancelled, and the counts update on screen in real time. Soft breads are topped up to their daily standard every morning, hard breads are flagged for production at their minimum level, and a warning appears when a product runs low. Staff records added stock and deductions, each logged with who made it. 7. To provide reports and demonstrate demand forecasting for inventory planning. Every sale is recorded by product and date, building a sales history the bakery did not have.the system reports sales, best-selling products, peak ordering periods, and inventory movements. It forecasts each product's sales for the next seven days, comparing a machine-learning regression with two simpler methods and using the most accurate one. The forecast is demonstrated on assumed historical sales, as approved by the adviser, so its results illustrate the method rather than verified predictions of the bakery's sales.

<!-- PDF page 24 -->

## Scopes and Limitations

The general purpose of this study is to design, develop, and implement PECTRACK, a web-based Order Management System with Predictive Analytics and Inventory System for Pecto's Bakery in Lucban, Quezon. The system operates as an e-commerce platform that enables customers to browse products, place and pay for orders, and track their orders online, while providing the bakery with a centralized system for managing its daily operations. The target users and beneficiaries of this study are: The Customers, who benefit from browsing products and ordering online without a physical visit to the store; The Administrator, who gains full system control, including products, inventory, production, users, and reports The Cashiers, who are provided with a structured way to take walk-in and advanced orders, record payments, manage stock, and assign deliveries

<!-- PDF page 25 -->

The proposed system includes the following features organized by module: LOGIN MODULE

Figure 1. Proposed login page design The log-in pop-up displays the bakery logo, a short welcome message, the Customer and Admin switch, the fields for the username or email address and the password, the "Keep me logged in" option, the "Forgot password?" link, and a single Log In button. Customers are also shown a "Create an account" link. For the administrator, a second step asks for the code sent by email, with the option to trust the device for 30 days.

<!-- PDF page 26 -->

Figure 1.1 Figure 1.1 Forgot password

Selecting "Forgot password?" opens a page designed in the same style as the log-in, where the user enters an email address to receive a password reset link. The link then opens a page where the user sets a new password.

<!-- PDF page 27 -->

Figure 1.2 Create account

The registration form asks for the customer's first and last name, username, contact number, email address, password, and password confirmation, and requires agreement to the Terms of Service and Privacy Policy. The password must be at least 12 characters long and must contain uppercase and lowercase letters, a number, and a symbol; common passwords are refused. The contact number accepts digits only and is verified through a code sent by SMS. A username, email address, or contact number that is already in use is refused.

<!-- PDF page 28 -->

Figure 1.3 Home page The home page presents the bakery in its own colors and photographs, with links to Home, Menu, Our Story, and Visit Us, as well as the history of the bakery since 1947.

DASHBOARD MODULE

<!-- PDF page 29 -->

Figure 2. Admin dashboard

<!-- PDF page 30 -->

Figure 2.1 Cashier dashboard The dashboard opens with a greeting that states how many matters need attention. It is followed by the Today row, which shows the orders and sales for the day and the cash not yet paid, the status tiles, and the Running Out, Needed By, and Recent Orders lists.

<!-- PDF page 31 -->

Figure 2.2 My Deliveries (delivery personnel) Delivery personnel are directed to My Deliveries, which is designed for use on a mobile phone. Each delivery card shows the customer's name with a tap-to-call contact number, the delivery address, the order total marked as paid, and a Start Delivery button. The system does not provide a map or GPS tracking; instead, each delivery is managed as a status checklist.

<!-- PDF page 32 -->

USER MANAGEMENT MODULE

Figure 3. User Management —Customers

<!-- PDF page 33 -->

Figure 4. User Management — Staff The Customers tab lists every registered customer with the name, username, contact number, email address, and account status, together with a search box, and allows the administrator to edit or deactivate an account. The Staff tab is used to create and manage the accounts of cashiers . Both tabs are accessible to the administrator only.

<!-- PDF page 34 -->

Figure 5. Customer account — My Orders The customer's account page greets them by name and shows three figures from their own orders: orders placed, orders in progress, and the total amount ordered. Three tabs follow: My Profile, My Orders, and My Payments. My Orders lists the customer's orders, newest first, with their status; selecting one shows its items, requested time, delivery progress, the amount paid and balance due with a "Pay now" button, and, while the order is still Placed, a Cancel button that asks for a reason.

<!-- PDF page 35 -->

Figure 5.1 My Profile

My Profile has three sections: Profile, Addresses, and Password. The Profile section shows the username and lets the customer update their full name and contact number. Changing the email address requires the current password, and a notice is sent to the old address.

<!-- PDF page 36 -->

Figure 5.2 Customer account — change password The Password section changes the account password. The current password is required, and the new password must meet the same rules as at registration. In the final system, the customer's account page has three tabs — My Profile, My Orders, and My Payments — and the profile holds the name, username, email address, contact number, and saved addresses. The customer account page has three tabs. The My Profile tab contains the customer's profile, saved addresses, and password; the My Orders tab lists the customer's orders together with their status and receipts; and the My Payments tab lists the customer's payments.

<!-- PDF page 37 -->

ORDER MANAGEMENT MODULE

Figure 6. Order Management - Orders (admin)

The admin's Order Management page lists the orders with their customer, date placed, requested time, total, and status, and can be searched and filtered by status. Selecting an order opens its details: the customer, order type, requested time, delivery progress, items and prices, the amount paid and balance due, and the status history with who changed it and when. A status can only move forward; cancelling requires a reason.

<!-- PDF page 38 -->

Figure 7. Walk-in / Advanced order (cashier) The cashier's Order Management page has two tabs: Orders, the same searchable order list and detail as the admin's, and New order, for orders taken at the counter.

<!-- PDF page 39 -->

Figure 7.1 Walk-in receipt (cashier)

The Orders tab shows the orders for the current day, the upcoming orders, or the orders for a chosen date, each with its status, the customer, and a Not Paid tag for cash orders still awaiting payment. The order details show the items, the requested time, and the payment method and payment status, including the cash received and the change. For a delivery awaiting a rider, the order details also provide an Assign Rider control. The Walk-in tab switches between walk-in and advanced orders, as described in the Purpose and Description.

<!-- PDF page 40 -->

Figure 8. Delivery in progress (delivery personnel) After the rider selects Start Delivery, the card shows the proof-of-delivery photo upload, which accepts up to five JPEG or PNG photos, the Mark Delivered button, and the Couldn't Deliver option with a field for the reason.

<!-- PDF page 41 -->

Figure 9. Menu (customer) The Menu displays the products of the bakery grouped by category, with a search box. Each product shows its photo, name, size or pack, and price, together with an Add to Cart button. Sold-out products are marked as such and cannot be ordered.

<!-- PDF page 42 -->

INVENTORY MANAGEMENT MODULE

Figure 10. Inventory — Products (soft and hard breads) The Pectrack Product & Inventory admin portal features a navigation menu highlighting "Product & Inventory," a main dashboard table with an "Add Product" button that lists product IDs, names, prices, and availability statuses like "In Stock" or "Out of Stock," and a "Product Details" section below for a selected item that includes a product image, an inventory summary, and action buttons to edit or delete the product.

<!-- PDF page 43 -->

Figure 10.1 Edit (Add stock / Correct count)

Figure 10.2 Production and Events, with the forecast check

<!-- PDF page 44 -->

Figure 11. Ingredients

<!-- PDF page 45 -->

Figure 11.1 Edit Products The Products tab lists soft breads and hard breads separately, each with its own status and category filters. The Edit button opens the Add Stock option and, for the administrator, the Correct Count option, each of which requires confirmation. The Production tab lists the quantities to be baked for a chosen day, with the forecast for each product and the Events calendar below the list. The Ingredients tab monitors the stock of ingredients, while Edit Products maintains the product catalog.

<!-- PDF page 46 -->

PAYMENT AND BILLING MODULE

Figure 12. Payment & Billing — Billing

<!-- PDF page 47 -->

Figure 13. Payment log and its PDF The Billing tab lists the orders that are ready for pickup, ready for delivery, and completed, each with its receipt, payment method, and a Not Paid tag for cash orders still awaiting payment. The Payment Log lists every payment received and can be exported as a PDF file that shows the total.

<!-- PDF page 48 -->

Figure 14. Checkout — delivery order (customer) At checkout, the customer chooses between pickup and delivery and selects the date and an available time, as well as a saved address in Lucban in the case of delivery. A pickup order is paid in cash at the counter or through GCash, whereas a delivery order is paid through GCash, with the order summary showing the ₱50 delivery fee included in the total.

<!-- PDF page 49 -->

Figure 14.1 Checkout-delivery order(customer) A pickup order needs no address. The customer pays online beforehand from My Payments, or at the counter when collecting the order.

<!-- PDF page 50 -->

DELIVERY MANAGEMENT MODULE

Figure 15. Delivery Management Staff members view the deliveries that are awaiting assignment, assigned, out for delivery, and delivered, and assign each waiting delivery to a rider.

<!-- PDF page 51 -->

REPORTING AND ANALYTICS MODULE The Reporting and Analytics Module has six tabs: ● Sales: daily, weekly, or monthly totals over any date range, with a sales trend chart and the peak ordering periods by hour of day and day of week. ● Products: the best sellers. ● Inventory: stock movements, and products currently low on stock. ● Forecast: expected sales for the next seven days and how much of each product to bake. ● Transactions: the payment log, filterable by date, payment method, and status. ● Export History. The cashier sees the same reports as the admin, except Export History. Every report can be printed or saved as PDF.

<!-- PDF page 52 -->

Figure 16. Sales(admin) The Sales tab: the date range and grouping at the top, then the orders placed, the amount ordered, the amount collected, and refunds for the period, followed by the sales chart.

Figure 16.1 Products

<!-- PDF page 53 -->

Figure 16.2 Inventory

<!-- PDF page 54 -->

Figure 16.3 Forecast

Figure 17. Reporting & Analytics — Transactions (cashier)

<!-- PDF page 55 -->

Figure 18. Delivery history (delivery personnel)

The module contains the Sales, Products, Inventory, Forecast, and Export History tabs described in the Purpose and Description, and is accessible to the administrator only. Delivery personnel, on the other hand, can view their own delivery history over a chosen date range.

## Limitations

1. Prototype and Data Exclusivity for Pecto’s only.

The PECTRACK system is developed for, and tailored to, the operational needs of Pecto's Bakery in Lucban, Quezon, and all of its modules, workflows, and database structures follow the existing business processes of the bakery. All data stored, processed, and generated within the system, including product information, customer records, transaction histories, inventory data, and reports, belong to Pecto's Bakery and are used solely for the purpose of this capstone project. Delivery is limited to the municipality of Lucban, Quezon, for a flat delivery fee of ₱50. Delivery orders must be paid in full beforehand through

<!-- PDF page 56 -->

GCash, as the system does not offer cash on delivery. Cash is accepted only at the counter, including for online pickup orders paid upon collection, and paid orders are not refunded.

2. Network Dependency.

As a web-based platform, the system requires a stable internet connection. Any network interruption on the part of the cashier or customers may disrupt order placement, status updates, and payment processing.

3. Ingredient Monitoring Only.

Ingredient stock is monitored but not automated. Since the system does not store recipes, ingredients are not deducted when bread is baked; instead, ingredient counts are kept current through recorded deliveries and the administrator's stock checks.

4. Assumed Sales History for the Forecast.

The bakery has not kept sales records that the system can import. As approved by the adviser, the forecast is therefore demonstrated on an assumed one-year sales history built from the patterns described by the bakery, namely higher sales on weekends, sales of about four times the usual during events, mainly in hard breads, and payday effects. The assumed data are labeled as such and are kept out of the sales reports. The forecasting method is validated on this assumed history; hence, the accuracy figure on screen, labeled "Method test (practice data)," shows how well the method fits the assumed pattern rather than the actual demand of the bakery. Its accuracy on the actual sales of Pecto's Bakery will be measured once 56 days of actual sales exist, at which point the system switches to them automatically. To demonstrate the reports, practice orders may be added; these are marked as practice data and appear only when the Demo Data switch is turned on. Furthermore, on days when a product sells out, the true demand is unknown, so
