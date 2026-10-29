# PECTRACK paper: changes to make

**For:** the whole group
**Based on:** `PECTRACK_REVISED (2).pdf`, checked on October 29, 2026
**Page numbers** are the PDF's page numbers (the number in the PDF viewer, not the number printed on the page).

**How to use this list:** go through the steps in order. Tick a box (☐ → ☑) when you finish an item, so nobody does it twice.

| Step | What | Size of the job |
|---|---|---|
| 1 | Decide the title | 5 minutes, as a group |
| 2 | Replace the Objectives (Chapter 1) | Copy and paste |
| 3 | Remove old names | Find and replace |
| 4 | Update the parts that describe the old system | Rewrite a few paragraphs |
| 4b | Add the QR Ph limitation | Paste one paragraph |
| 5 | Fix the references | Edit the reference list |
| 6 | Align the Background of the Problem with the Objectives | Paste two problems, replace a few sentences |



## Step 4. Update the parts that describe the old system

The system changed after the mock defense, and these parts still describe the old version.

| ☐ | Topic | Where | What it says now | What it should say |
|---|---|---|---|---|
| ☐ | Email confirmation | Login Module (p. 8); Create account (Figure 1.2) | Customers confirm their email through a link before ordering | No email confirmation. After pressing **Create account**, a pop-up asks for the 6-digit SMS code, and a correct code creates the account. |
| ☐ | Delivery personnel | 28 mentions, including the Login Module (p. 8), Figure 2.2 and the Delivery Management Module | Riders have accounts and a My Deliveries screen | No rider accounts and no Delivery Management module. Staff mark a delivery order **Out for delivery**, then **Delivered**, in Order Management. Users are Admin, Cashier and Customer. |
| ☐ | Correct count | Figure 10.1 (p. 41) | "Edit (Add stock / Correct count)" | The actions are **Add** and **Deduct**. Deduct asks how many pieces and a reason (Burnt or Fallen to the floor). Reports show **Deducted**. |
| ☐ | Inventory list | Inventory Management Module | Soft breads and hard breads on separate tabs | One list; each product is labelled **Soft bread** or **Hard bread**. |
| ☐ | Customer account | Customer account figures | Tabs for Profile, Orders and Payments | Two tabs, **Profile** and **Orders**. No My Payments tab. |
| ☐ | Menu | Order Management Module (customer side) | Quantity chosen before Add to cart | Each product shows the **stock left**. A round **+** adds it, then becomes **− n +** to change the amount. |
| ☐ | Notifications | Notifications | New items only | Each item is **Unread** or **Read**; a toast and sound play only for a new unread item. |
| ☐ | Objective 5 | Specific Objectives, item 5 (the second sentence) | "The system records cash and GCash payments, the GCash ones through the PayMongo payment gateway, and shows each order's payment status." | "The system records cash and QR Ph payments and shows each order's payment status. For a QR Ph payment, the customer scans the bakery's QR Ph code, pays in their own bank or e-wallet app, and enters the reference number; a staff member confirms each payment before the order is released." |
| ☐ | Online payment | Payment and Billing Module; checkout figures; every "PayMongo" and "GCash" mention for online payment (Find: PayMongo) | Customers pay with GCash through the PayMongo payment gateway | Customers pay with **QR Ph**, as the adviser recommended. Pickup: **Cash at pickup** or **QR Ph**; delivery: **QR Ph** only. The customer scans the bakery's QR Ph code with any bank or e-wallet app (GCash, Maya, or a bank), pays the exact amount, and enters the **reference number** (a screenshot is optional). The order shows **Waiting for payment confirmation**. A staff member checks the bakery's app for that reference and amount, then presses **Confirm** (the order becomes Ready for pickup or Ready for delivery, and the customer is emailed) or **Reject** with a reason (the order is cancelled, its stock returned, and the customer is emailed). Each decision is saved with who made it and when. A reference number can be used only once. An order with no reference within 15 minutes is released. |
| ☐ | Payment & Billing screen | Payment and Billing Module figures | Billing and Payment log | A third tab, **To confirm**, lists the QR Ph payments waiting for staff, oldest first; one waiting over 30 minutes is marked. The admin uploads the bakery's QR Ph code and account name there. The Dashboard has a **Payments to confirm** tile, and the bell announces each new one. |
| ☐ | Walk-in payment | Walk-in order figures | Cash or GCash | **Cash** or **QR Ph**; for QR Ph, the cashier types the reference number from the customer's payment. |

**Also needed:** new screenshots for every figure above.

---

## Step 4b. Add to the Limitations (Scope and Limitations)

☐ Add this paragraph:

> QR Ph payments are confirmed by a staff member, not automatically. The bakery's static QR Ph code does not notify the system when a payment arrives, so a staff member checks each reference number against the bakery's bank or e-wallet app before the order is released. Automatic confirmation would need a paid payment gateway, which charges a fee on every payment. Any fee for receiving QR Ph payments depends on the bakery's own bank or e-wallet, not on the system.

---

## Step 5. Fix the references (p. 118 onward)

| ☐ | Entry | Problem | Fix |
|---|---|---|---|
| ☐ | Jimenez, L. V., Espinoza, H. G., … (2024) | The surnames are compound | **Velasquez Jimenez, L., Grados Espinoza, H., Rubiños Jimenez, S., Grados Gamarra, J., & Marrujo-Ingunza, C.** (2024). *IJACSA, 15*(12), 86–94. In the text: **(Velasquez Jimenez et al., 2024)** |
| ☐ | Salih, H. S., Ghazi, M., & Aljanabi, M. (2023) | Wrong author order | **Ghazi, M., Salih, H. S., & Al Janabi, M.** (2023). Move it to the letter G. |
| ☐ | Lin, X., et al. (2023) | Wrong issue and article number | *PLOS ONE, 18*(5), **e0286382** |
| ☐ | Utami & Sudarmiatin (2022) | No record of this paper could be found | Remove it, and its citation in the text |
| ☐ | Cruz, M., et al. (2022); Sharma, R., et al. (2023); Singh, A., et al. (2024) | No full author list, volume or DOI | Find the real papers and complete them, or remove them |
| ☐ | Culili (2026), Orquesta (2026), Pattnaike (2025), Krishnamurthy (2024), Mansur (2024) | Not checked yet | Search each on Google Scholar to confirm it exists |

---

## Step 6. Align the Background of the Problem with the Objectives

**Page numbers in this step** are from `PECTRACK_REVISED (4).pdf`.

**Why:** the Background of the Problem lists five problems, and Objectives 1–5 answer them. Objectives 6 (inventory) and 7 (reports and forecasting) answer no problem: the Background only adds them in one paragraph on p. 10 ("In addition to addressing these operational challenges…"). The panel will ask why the system has inventory and predictive analytics if no problem calls for them. Two new problems fix this. Every problem then has an objective, and every objective has a problem.

### 6a. Add two problems (Background of the Problem, p. 10)

☐ Paste these two bullets **after** "Manual Payment Verification and Order Release" (it ends "…in accordance with the bakery's payment policies."):

> ● **Manual Inventory Monitoring and Production Planning:** Based on the follow-up consultations with the management, soft breads are baked every morning up to a daily standard quantity, while hard breads are baked again once their stock falls to a minimum level. Demand also rises on weekends and during events such as Holy Week, the Pahiyas Festival, and Christmas. At present, the stock on the shelves is checked manually, and the quantities to bake are decided from experience. During busy periods, this makes it difficult to know how many pieces of each product are left, which products need to be baked, and how much more to prepare for a coming weekend or event. To address this problem, PECTRACK will deduct stock automatically as orders are placed, update the counts on screen in real time, list what to bake each day based on the daily standards, minimum levels, weekends, events, and advanced orders, and warn the staff when a product runs low.
>
> ● **No Sales History for Planning:** Because orders and sales are recorded on paper, the bakery has no organized record of its past sales by product and by day. Production quantities therefore rely on experience, and the bakery cannot readily review which products sell more on particular days, weekends, or events. For the same reason, actual historical sales data are not available for this study. To address this problem, PECTRACK will record every sale by product and date, so that a sales history builds up from the first day of use. The system will report sales, best-selling products, and peak ordering periods, and will demonstrate demand forecasting on this history. Until enough actual sales are recorded, the forecast will be demonstrated on assumed historical data, as approved by the adviser, and it will switch to actual sales after 56 days.

> If Mrs. Abillar mentioned products selling out or being left over, add that as one sentence in the first bullet. It is the strongest evidence for this problem.

☐ **Delete** the paragraph on p. 10 that begins "In addition to addressing these operational challenges, PECTRACK will incorporate predictive analytics…". The two new problems now cover it.

☐ In the next paragraph, the list "…decentralized order management, manual record-keeping, customer information retrieval, order status monitoring, and payment verification" becomes:

> "…decentralized order management, manual record-keeping, customer information retrieval, order status monitoring, payment verification, inventory monitoring and production planning, and the lack of a sales history."

### 6b. Replace the solution of "Manual Payment Verification and Order Release" (p. 10)

☐ Keep the problem as it is. Replace its last two sentences ("PECTRACK aims to address this concern by providing a centralized means… in accordance with the bakery's payment policies.") with:

> PECTRACK aims to address this concern by linking every payment to its order. A customer who pays online scans the bakery's QR Ph code and enters the payment's reference number, and the order is held until a staff member confirms that payment. The system refuses a reference number that was already used, records who confirmed each payment and when, and releases an order only once it is paid. Staff no longer need to match payments with messages and paper records, although the check against the bakery's bank or e-wallet app remains a manual step, as stated in the Scope and Limitations.

> **If the panel asks "so payment verification is still manual?":** yes, the check itself is. What the system removes is the matching: each reference arrives already attached to its order and amount, appears in one list, can be used only once, and the order cannot be released before it is confirmed. Automatic confirmation needs a paid payment gateway, which charges a fee on every payment.

### 6c. Objectives (p. 21–22)

| ☐ | Objective | Change |
|---|---|---|
| ☐ | 3 | "Customers have accounts that keep their contact details…" becomes "Customers **with accounts** keep their contact details…" |
| ☐ | 4 | Replace the whole explanation (from "Customers choose a pickup or delivery time…" to the end) with: "Customers choose a pickup or delivery time in 30-minute slots from 6:00 AM, an hour after the 5:00 AM bake, so the breads have cooled before release, and staff see which orders are needed next. Each order moves through Ready for pickup or Ready for delivery, Out for delivery, and Completed; staff update the status in the system, and customers see it on their orders and receive email updates. Advanced orders reserve their bread when they are placed: hard breads are taken from the stock, and soft breads are added to the bake list for the pickup day. Customers see when their order is ready instead of messaging the bakery to ask." This answers the Background's own example (an order for 6:00 not ready until 7:00). |
| ☐ | 5 | Use the new wording in Step 4 (the Objective 5 row). |
| ☐ | 7 | Add at the start: "Every sale is recorded by product and date, building a sales history the bakery did not have." |

Objectives 1, 2 and 6 stay as they are.

### 6d. Add to the Limitations (Scope and Limitations)

☐ Add these two paragraphs, together with the QR Ph paragraph in Step 4b:

> Customer records and order history cover customers who have accounts. A walk-in order keeps the customer's name, and the contact number for an advanced order, but it is not linked to a customer record.

> The system does not read the bakery's Facebook messages. The bakery's Facebook page directs customers to the PECTRACK storefront, and an order received through a message is entered by a staff member on the counter screen as a walk-in or advanced order.

### How each problem is solved (for the paper and the defense)

| Problem | Objective | Module | How the system solves it |
|---|---|---|---|
| Decentralized Order Management | 1 | Order Management | Online orders come through the storefront, and walk-in and advanced orders through the counter screen. All of them appear in one order list that every authorized staff member sees. |
| Manual Order Recording and Processing | 2 | Order Management | Every order is saved with its items, quantities, prices, time, and a daily order number, with a printable receipt. The stock is deducted automatically. |
| Lack of Centralized Customer Information and Order History | 3 | Login and Customer Account | Accounts keep contact details, saved addresses, and past orders with receipts. Access is protected by an SMS code, the administrator's email code, a 15-minute lockout after five failed sign-ins, and roles. |
| Limited Visibility into Order Status and Scheduling | 4 | Order Management and Notifications | Customers choose a time in 30-minute slots from 6:00 AM, after the 5:00 AM bake has cooled. Walk-in sales start at 5:00 AM. Advanced orders reserve their bread. Staff see orders due within the hour. Customers see the status and receive emails. |
| Manual Payment Verification and Order Release | 5 | Payment and Billing | Each QR Ph reference is attached to its order and used only once. The order is held until a staff member confirms it, who confirmed it is recorded, and the payment log can be exported as a PDF. |
| Manual Inventory Monitoring and Production Planning (new) | 6 | Inventory Management | Stock is deducted and returned automatically and updates in real time. The Production list shows what to bake each day. A low-stock warning appears, and every stock change is logged with who made it. |
| No Sales History for Planning (new) | 7 | Reporting and Analytics | Every sale is recorded by product and date. Reports show sales, best-selling products, and peak periods. A 7-day forecast compares three methods, uses assumed data until 56 days of actual sales exist, then switches. |

---

## Later (not for now)

- The predictive analytics studies are now in `CHAPTER_GRILL.md` (Rounds 4, 7, 8, and 12), with the final reference list in Round 8b.
