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

---

## Step 1. Decide the title

The paper uses two different titles:

- **The cover page:** "PECTRACK: A Web-Based Order Management System with Predictive Analytics and **Inventory System** for Pecto's Bakery in Lucban, Quezon"
- **The text, in 9 places:** "…with Predictive Analytics and **Automated Inventory**…"

☐ Agree on one title, then use it everywhere: the cover, the endorsement form, the Project Context (end), the Background of the Problem (end), the Purpose and Description, the Objectives, and the Scope and Limitations.

> The objectives in Step 2 use the cover title. If you choose "Automated Inventory" instead, change the general objective to match.


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

## Later (not for now)

- The predictive analytics studies for the Review of Related Literature are in `papers-rrl/PREDICTIVE_ANALYTICS_RRL.md`. Add them to the reference list when that section is written.
