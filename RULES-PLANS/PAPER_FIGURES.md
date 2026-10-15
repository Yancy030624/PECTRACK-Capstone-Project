# PAPER_FIGURES.md — which screenshot replaces which mockup

For `docs/PECTRACK_REVISED.pdf`, Scope section (pp. 21–44). The early
mockup images are replaced by screenshots of the system, in
`docs/paper-figures/`. They were captured on 2026-10-08 from the running
system with the demo data, at 1440×900 for desktop screens and 390×844
for the delivery personnel's phone screens.

**This file covers images and captions only.** The paragraph under each
figure is in `PAPER_FIX_PART_B.md`, in page order with the rest of the
module's text. Nothing here is pasted as body text.

For each figure:
1. In Word, right-click the old image → **Change Picture** → choose the
   file below. The figure keeps its place.
2. Replace the caption with the one below. The figures now show the built
   system, so "Proposed … design" is dropped.
3. Replace the paragraph under it, using the Part B item named in the
   last column.

| Figure | File | New caption | Text (Part B) |
|---|---|---|---|
| 1 | `fig-01-login.png` | Figure 1. Customer sign-in | B1, p. 21 (done) |
| 1.1 | `fig-01.1-register.png` | Figure 1.1 Customer registration | B2, p. 22 (redo whole paragraph) |
| 1.2 | `fig-01.2-home.png` | Figure 1.2 Home page | B1, p. 23 |
| 1.3 *(optional, new)* | `fig-01-login-staff.png` | Figure 1.3 Staff sign-in | B1, optional |
| 2 | `fig-02-dashboard-admin.png` | Figure 2. Admin dashboard | B3 (done; shared with 2.1) |
| 2.1 | `fig-02.1-dashboard-cashier.png` | Figure 2.1 Cashier dashboard | B3 (done; shared with 2) |
| 2.3 *(optional, new)* | `fig-02.3-new-order-alert.png` | Figure 2.3 New-order alert | PAPER_FIX_REVISIONS R4 |
| 2.2 | `fig-02.2-my-deliveries.png` | Figure 2.2 My Deliveries — delivery personnel's first screen | B3, Figure 2.2 (redo) |
| 3 | `fig-03-customers-admin.png` | Figure 3. Customer Management (admin) | B4 |
| 4 | `fig-04-customers-cashier.png` | Figure 4. Customer Management (cashier) | B4 |
| 5 | `fig-05-account-orders.png` | Figure 5. Customer account — My Orders | B4 |
| 5.1 | `fig-05.1-account-profile.png` | Figure 5.1 Customer account — My Profile | B4 |
| 5.2 | `fig-05.2-account-addresses.png` | Figure 5.2 Customer account — saved addresses | B4 |
| 5.3 | `fig-05.3-account-security.png` | Figure 5.3 Customer account — change password | B4 |
| 6 | `fig-06-orders-admin.png` | Figure 6. Order Management (admin) | B6 |
| 7 | `fig-07-orders-cashier.png` | Figure 7. Order Management (cashier) | B6 |
| 7.1 *(optional, new)* | `fig-07.1-new-order-cashier.png` | Figure 7.1 New order at the counter | B6, optional |
| 7.2 *(optional, new)* | `fig-07.2-due-today.png` | Figure 7.2 Production — Due today | B6, optional |
| 8 | `fig-08-delivery-detail.png` | Figure 8. Delivery in progress (delivery personnel) | B6 |
| 9 | `fig-09-menu.png` | Figure 9. Menu (customer) | B6 |
| 10 | `fig-10-products-admin.png` | Figure 10. Product Management (admin) | B5 |
| 10.1 *(optional, new)* | `fig-10.1-inventory-admin.png` | Figure 10.1 Inventory Management (admin) | B5, optional |
| 11 | `fig-11-inventory-cashier.png` | Figure 11. Inventory Management — updating stock (cashier) | B5, then PAPER_FIX_REVISIONS R1 item 6 |
| 11.1 *(new)* | `fig-11.1-ingredients-cashier.png` | Figure 11.1 Inventory Management — Ingredients | PAPER_FIX_REVISIONS R5 item 8 |
| 12 | `fig-12-payments-admin.png` | Figure 12. Payment & Billing — payment log (admin) | B7 |
| 13 | `fig-13-payments-cashier.png` | Figure 13. Payment & Billing — recording a payment (cashier) | B7 |
| 14 | `fig-14-deliveries-admin.png` | Figure 14. Delivery Management (admin and cashier) | B7 |
| 14.1 | — | **Remove** (proof of delivery is Figure 8) | B7 |
| 15 | `fig-15-checkout-delivery.png` | Figure 15. Checkout — delivery order (customer) | B7 |
| 15.1 | `fig-15.1-checkout-pickup.png` | Figure 15.1 Checkout — pickup order (customer) | B7 |
| 16 | `fig-16-reports-admin.png` | Figure 16. Reporting & Analytics — Sales (admin) | B9 |
| 16.1 *(optional, new)* | `fig-16.1-forecast-admin.png` | Figure 16.1 Reporting & Analytics — Forecast | B9, optional |
| 16.2 *(optional, new)* | `fig-16.2-reports-inventory.png` | Figure 16.2 Reporting & Analytics — Inventory, with ingredients | PAPER_FIX_REVISIONS R5 item 4 |
| 17 | `fig-17-reports-cashier.png` | Figure 17. Reporting & Analytics — Transactions (cashier) | B9 |
| 18 | `fig-18-delivery-history.png` | Figure 18. Delivery history (delivery personnel) | B9 |

**After the swaps:**
- Update the **List of Figures**: the new captions, Figure 14.1 removed,
  and any optional figures you added.
- **Figure 14** used to be "Proposed payment and billing design for
  delivery personnel". It is now Delivery Management, a screen the paper
  never pictured before.

## Retaking the screenshots

The capture script lives outside the repo, in the session scratchpad
(`browser/figures.mjs`). It signs in the demo accounts by inserting
sessions directly in the database, so no sign-in codes are emailed. Ask
Claude to rerun it after the demo data or the design changes.

## Retake of 2026-10-15 (after the client's revisions)

Every screenshot was taken again from the re-seeded demo data after
revisions R1–R5 (`PAPER_FIX_REVISIONS.md`). Same sizes as before: 1440×900
for desktop, 390×844 for the delivery personnel's phone.

**Replace these in the paper** (Change Picture, as above). They changed
because of the revisions:

| Figure | Why it changed |
|---|---|
| 2, 2.1 | New Dashboard: "Needs action now", Recent orders, Ingredients tile (R3, R4, R5) |
| 2.2 | Grouped "Assigned to you" / "To deliver now"; order items on the card (R1, R4) |
| 5 | Daily order numbers (R4) |
| 6, 7 | Daily order numbers (R4) |
| 7.2 | Daily order numbers on Due today (R4) |
| 8 | Order items on the card; "To deliver now" (R1, R4) |
| 10.1 | Products / Ingredients tabs; no Expiry column (R3, R5) |
| 11 | The cashier edits stock directly with a reason; no approval (R1, R3) — new caption above |
| 12, 13 | Daily order numbers; no "Pay with GCash" for staff (R1, R4) |
| 14 | Daily order numbers (R4) |
| 16 | No Refunds card (R2) |
| 17, 18 | Daily order numbers (R4) |

**New figures** (add only if your team wants them): 2.3 new-order alert,
11.1 Ingredients (recommended, since the paper now describes the
ingredient stock), 16.2 the Inventory report with ingredients.

**Unchanged in content:** 1, 1.1, 1.2, 3, 4, 5.1–5.3, 7.1, 9, 10, 15,
15.1. Some of these files were rewritten with the new demo data (names,
amounts), but they show nothing that the revisions changed, so the
pictures already in the paper can stay.

Remember to update the **List of Figures** for the new captions (11) and
any new figures you add.
