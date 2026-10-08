# PAPER_FIX_PART_A.md — Part A: factual errors, ready to paste

For editing `docs/PECTRACK.pdf` (second upload, 2026-10-08). Page numbers
are that file's PDF pages. Each fix gives the text to **find** and the text
to **replace it with**. Each claim was checked against the code on
2026-10-08.

Done in the second upload already, so nothing to do: A2 (the spelling
"bcrypt"), A6, A10, the PostgreSQL version in A12, and p. 81 of A1.

**Correction to the plan:** A9 is **not** an error. The server redirects
plain HTTP to HTTPS (status 308) when it runs in production, and it sends
a Strict-Transport-Security header. The p. 94 sentence stays. An optional
addition is under A9 below.

---

## A1 — Technology named for the code editor (p. 84)

**Find:**
> Visual Studio Code will be the main code editor used by the proponents for writing, editing, and organizing REACT and Tailwind CSS during development.

**Replace with:**
> Visual Studio Code will be the main code editor used by the proponents for writing, editing, and organizing the React (JavaScript) front end, the Node.js and Express back end, and the Tailwind CSS styles during development.

(p. 81, "Web-based system", is correct now. Optional: lower-case "web-based".)

## A2 — What hashing does (p. 93)

The algorithm name is already fixed. The rest of the sentence still calls a
hash "encrypted". Encryption can be reversed with a key; a hash cannot.
Panelists sometimes ask about this.

**Find:**
> Bcrypt is a one-way hashing function that transforms passwords into an irreversible encrypted format, ensuring that even if the database is compromised, actual passwords cannot be retrieved.

**Replace with:**
> Bcrypt is a one-way hashing function: it turns each password into a hash that cannot be reversed, so even if the database is compromised, the actual passwords cannot be retrieved. Bcrypt also adds a random salt to every password, so two users with the same password are stored with different hashes.

## A3 — CUSTOMER table description copied from CASHIER (p. 99)

**Find** (under the heading CUSTOMER TABLE):
> The CASHIER table contains the information of staff members responsible for processing orders, recording payments, and managing daily transactions within the system.

**Replace with:**
> The CUSTOMER table stores the profile of each registered customer — name, contact number, and email address — and links it to the customer's login account in the USER table. A customer's delivery addresses are stored separately in the CUSTOMER_ADDRESSES table, so that one customer can save several addresses.

(The CUSTOMER_ADDRESSES table itself is added to the chapter in Part F.
Leave the CASHIER TABLE description on p. 98 as it is; it is correct
there.)

## A4 — Three roles instead of four (pp. 90–91, 93)

### p. 90, second paragraph

The first paragraph on p. 90 already says **four** roles. The second one
says three and repeats the first. Replace the second paragraph and the
role descriptions that follow on p. 91.

**Find** (from p. 90 into p. 91):
> The system involves three main Roles: Admin, Cashier, and Customer. Each Role has different responsibilities and levels of access within the system. … The Cashier plays an operational role in handling daily transactions within the bakery. Cashier members can create or update customer orders, can also update inventory stock, record payments for completed transactions, and update delivery status. These actions help ensure that orders are processed accurately and that product availability is properly monitored.

**Replace with:**
> Each of the four roles has different responsibilities and levels of access within the system. The Admin is responsible for managing and controlling the overall system operations. The admin can log in to the system and perform administrative tasks such as managing products, approving stock changes and bulk orders, generating reports, assigning deliveries, and managing user accounts, including cashier and delivery personnel accounts. Through these functions, the admin ensures that the system operates efficiently and that all necessary information is properly maintained.
>
> The Cashier plays an operational role in handling daily transactions within the bakery. Cashiers can create orders for walk-in customers, update order status, record cash and GCash payments, and assign deliveries to delivery personnel. Cashiers can propose stock corrections and report losses, but a stock change takes effect only after the admin approves it. These actions help ensure that orders are processed accurately and that product availability is properly monitored.
>
> The Delivery Personnel handles the deliveries assigned to them. They can view each assigned order's delivery address and items, mark the order as out for delivery, upload a photo as proof of delivery, record cash collected on delivery, and mark the delivery as delivered or failed with a reason.

Keep the Customer paragraph that follows ("The Customer interacts with the
system primarily for purchasing bakery products…").

### p. 93

**Find:**
> …based on the user's assigned role: Admin, Cashier, or Customer.

**Replace with:**
> …based on the user's assigned role: Admin, Cashier, Delivery Personnel, or Customer.

## A5 — Objective 3: who receives an OTP (p. 19)

Only the **admin** receives an OTP. Cashiers and delivery personnel sign
in with a password. Customers sign in with a password and must confirm
their email before they can order.

**Find:**
> To further strengthen security, the system incorporates One-Time Password (OTP) verification sent through the user's email, ensuring that only verified users can successfully access the platform. By requiring verified credentials and OTP confirmation before granting access, the system safeguards sensitive business data…

**Replace with:**
> To further strengthen security, the administrator account, which has full control over the system, must also enter a One-Time Password (OTP) sent to the administrator's email before access is granted. Customers must confirm their email address before they can place an order, and any account is locked for 15 minutes after five failed sign-in attempts. Through these measures, the system safeguards sensitive business data…

(The rest of the sentence stays: "…such as customer information, order
records, and inventory details from unauthorized access…")

## A7 — Proof of delivery does not use the MediaDevices API (pp. 70, 86, 88)

The driver uploads a photo through the browser's standard file picker. On
a phone, that picker offers the camera or the gallery. The system accepts
JPEG and PNG, up to five photos per delivery.

### p. 70

**Find** (heading and paragraph):
> MediaDevices API (Web Camera API) — The MediaDevices API, also known as the Web Camera API, will be used to access the device camera for capturing proof-of-delivery images. This allows delivery personnel or authorized users to take and upload photos directly through the web application as verification that customer orders have been successfully delivered. This feature enhances delivery confirmation and transaction transparency.

**Replace with:**
> **File Upload for Proof of Delivery** — Proof-of-delivery photos will be uploaded through the web browser's standard file upload. On a mobile phone, this lets the delivery personnel take a photo with the camera or choose one from the gallery. The system accepts JPEG and PNG images, up to five per delivery, and stores them with the delivery record as verification that the order was handed over to the customer. This feature enhances delivery confirmation and transaction transparency.

### p. 86

**Find:**
> …to allow delivery personnel to upload delivery confirmation photos using the MediaDevices API.

**Replace with:**
> …to allow delivery personnel to upload delivery confirmation photos taken with the phone's camera or chosen from its gallery.

### p. 88

**Find:**
> …the proof-of-delivery feature allows authorized personnel to capture and upload delivery confirmation images through the MediaDevices API.

**Replace with:**
> …the proof-of-delivery feature allows delivery personnel to upload delivery confirmation photos through the web application.

## A8 — OOP (pp. 70–71)

The code is organized as modules and React components, not as classes and
objects.

**Find** (heading and paragraph, ending at the top of p. 71):
> OOP (Object Oriented Programming) — Object-Oriented Programming (OOP) is a programming paradigm used to structure the system into reusable and modular components called objects. Each object represents a specific part of the system, such as orders, products, or users. By using OOP principles, this approach will improve the code organization, and maintainability, allowing the proponents to develop a more efficient and structured system.

**Replace with:**
> **Modular, Component-Based Design** — The system will be organized into modules. On the front end, each screen is built from reusable React components such as forms, tables, and dashboard cards. On the back end, each module — orders, products, inventory, payments, deliveries, and reports — has its own Express route file, while shared logic such as authentication, stock movements, and forecasting is kept in separate library files. This approach improves code organization and maintainability, and it lets the proponents change one module without affecting the others.

## A9 — HTTPS redirect (p. 94): keep

The sentence is true. Optionally add after it:

> The server also sends a Strict-Transport-Security header, which instructs the browser to use HTTPS on every later visit.

## A11 — Delivery area (p. 7)

The bakery itself delivers across Quezon Province, but the system's online
delivery covers Lucban only. Keep the Background sentence (it describes
the bakery). Add this sentence at the end of the same paragraph, after
"…remains one of the recognized local bakeries in the area.":

> The proposed system, however, accepts online delivery orders within Lucban only, as stated in the Scope and Limitations.

Check that Scope and Limitations (p. 45 in this upload) still says this.

## A12 — Version numbers (pp. 66–68)

| Page | Find | Replace with |
|---|---|---|
| 66 | REACT (Version 19) | React (Version 19.2) |
| 67 | Tailwind CSS (Version 4.1) | Tailwind CSS (Version 4.3) |
| 67 | Node.js (Version 22) | Node.js (Version 22 or later) |
| 68 | Chart.js(Version 4.5 ) | Chart.js (Version 4.5) |

Express 5 and Vite 8 are not in the paper yet; they are added in Part G1.

---

## Errors introduced by the second upload (R1–R7)

These are factual errors too, so fix them along with Part A.

### R1 — p. 14, broken sentence about the Calendar

**Delete:**
> The Product Availability Calendar staff to view product availability and expiration periods.

Keep the sentence after it.

### R2 — p. 16, payment before preparation

**Find:**
> …ensures accurate and reliable financial record-keeping while preventing orders from being prepared or dispatched without verified proof of payment.

**Replace with:**
> …ensures accurate and reliable financial record-keeping, and an order cannot be marked as completed until it is fully paid.

(If the team chooses "pay online first for delivery" in the cash-on-delivery
decision, this sentence changes again.)

### R3 — p. 16, payments at the counter

**Find:**
> Walk-in transactions are handled manually by the cashier, who processes cash payments directly within the system.

**Replace with:**
> Walk-in transactions are handled by the cashier, who records cash or GCash payments directly within the system.

### R4 — p. 26, expired products under Customer Management

**Delete** from the Customer Management paragraph:
> Products are unavailable to customers when it's currently expired. The system automatically displays only products that are currently available and hides expired or unavailable items to maintain product quality and inventory accuracy.

The same point is already on p. 14 (Inventory Management).

### R5 — p. 31, Figure 5.3 settings mockup

The system sends no order-update or promo emails. **Find:**
> …divided into three cards: a "Notification" card with a checkbox for email order updates, a "Security" card featuring a "Change Password" button, and a "Marketing" card with a checkbox to opt into promo notifications for new breads and seasonal cakes.

**Replace with:**
> …with a "Security" card for changing the password and the email address. (The Notification and Marketing cards in this early mockup were not carried into the final system.)

### R6 — p. 14, stock deduction said twice

**Find:**
> The AI Inventory Automation feature automatically updates product stock levels whenever an order is processed. The system also monitors stock levels…

**Replace with:**
> The system also monitors stock levels…

(This also drops one "AI" wording, which stays on hold until decision D4.)

### R7 — p. 84, "REACT"

Covered by A1 above.

---

## After the no-cash-on-delivery build (2026-10-08)

Page numbers are those of `docs/PECTRACK_REVISED.pdf`.

### p. 16 — payment for delivery orders

**Find:**
> …which enables customers to complete transactions using digital wallets such as GCash, in addition to the option of cash on delivery.

**Replace with:**
> …which enables customers to complete transactions using digital wallets such as GCash. Delivery orders must be paid in full before the bakery confirms and prepares them; cash on delivery is not offered, since food refused at the door cannot be resold.

### p. 16 — heading printed twice

"Payment and Billing Module Payment and Billing Module": delete one.

### p. 92 — Delivery Personnel paragraph

**Find:**
> …upload a photo as proof of delivery, record cash collected on delivery, and mark the delivery as delivered or failed with a reason.

**Replace with:**
> …upload a photo as proof of delivery, and mark the delivery as delivered or failed with a reason. Delivery orders are paid before they leave the bakery, so delivery personnel do not collect payments.

### p. 86 — typo

"includedto" should be "included to".

### p. 45 — Scope and Limitations (add)

Add after the sentence about delivery within Lucban:

> Delivery orders must be paid in full, through GCash online or at the bakery's counter, before they are prepared; the system does not offer cash on delivery. An unpaid order is not cancelled automatically.

### Optional — p. 15, bulk orders

To explain the bulk-order flow, add after "…bulk order requests requiring administrator approval…":

> A bulk order must first be approved by the administrator before it can be paid, and a bulk delivery order is confirmed only once it is paid in full.
