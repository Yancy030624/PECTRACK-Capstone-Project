# QR Ph payments — plan

The adviser recommended **QR Ph** in place of PayMongo, because it is free for the bakery to receive and has no fee on every payment (2026-10-28). Decided with the user in a grilling session on 2026-10-29.

## Decisions

| # | Decision |
|---|---|
| Q1 | QR Ph **replaces** PayMongo for online orders. The PayMongo code stays, unused. |
| Q2 | The admin **uploads the bakery's QR Ph image** and its account name in the system. |
| Q3 | The customer **types the reference number** (required); a **screenshot** is optional. |
| Q4 | The **admin or a cashier** confirms or rejects; each decision is logged with who and when. |
| Q5 | **Stock stays reserved** while the order waits. |
| Q6 | The **counter** is unchanged in flow: the cashier types the reference of a scan at the counter. |
| Q7 | No reference within **15 minutes** → the order is released, stock returned (today's hold). |
| Q8 | Reference sent → the order **is never cancelled automatically**; it shows as **overdue** to staff after **30 minutes**. |
| Q9 | **Reject** cancels the order with a reason, returns the stock, and emails the customer. |
| Q10 | A **reference number can be used once** (the existing UNIQUE on `payments.gateway_reference`). |
| Q11 | Staff are told: bell, toast and sound (`payment_to_confirm`), and a Dashboard tile **Payments to confirm**. |
| Q12 | The customer sees **Waiting for payment confirmation**, and is emailed when it is confirmed. |
| Q13 | A delivery order is **Ready for delivery** only once its payment is confirmed (paid first). |
| Q14 | The payment method is **QRPH**, shown as "QR Ph"; old PayMongo payments keep **GCash**. |
| Q15 | Pickup: **Cash at pickup** or **QR Ph now**; delivery: **QR Ph only**. |
| Q16 | A screenshot is stored like a delivery proof photo (JPEG or PNG, 5 MB) and shown to staff only. |
| Q17 | The paper's Objective 5, Payment and Billing Module and Limitations change (`docs/papers-fix/OBJECTIVES_ALIGNED.md`). |

## How it works

1. **Checkout** saves an online order as today's 15-minute hold (`AWAITING_PAYMENT`, hidden from staff, stock reserved) and opens its receipt page.
2. **The receipt page** shows the bakery's QR Ph image, the account name and the exact amount. The customer pays in their own app, then types the **reference number** and may attach a **screenshot**.
3. `POST /api/qrph` records a **PENDING** payment, method `QRPH`, the reference in `gateway_reference`. The hold job (`lib/staleOrders.js`) keeps any hold with a pending QR Ph payment.
4. **Staff** see it under **Payments to confirm** in Payment & Billing, on the Dashboard, and in the bell. They check the bakery's app for that reference and amount, then:
   - **Confirm** (`POST /api/qrph/payments/:id/verify`, `decision: CONFIRM`): the payment becomes PAID, `verified_by` and `verified_at` are set, and the order becomes Ready for pickup or Ready for delivery (`readyIfPaid`). The customer is emailed.
   - **Reject** (`decision: REJECT`, reason required): the payment becomes FAILED with `rejected_reason`, the order is cancelled with its stock returned, and the customer is emailed.

## Data (migration 043)

- `payments`: `verified_by` (users), `verified_at`, `rejected_reason`, `proof_image` and `proof_type` (the screenshot).
- `app_settings (key PRIMARY KEY, value, data)`: `qrph_image` (bytes in `data`, MIME type in `value`) and `qrph_account_name`.
- Both images are stored **in the database**, not in `uploads/`: Railway replaces its disk on every deploy, so a file there would vanish after a push.

## Server

Its own router, `server/routes/qrph.js`, mounted at `/api/qrph` (so it cannot clash with `/api/payments/:id`).

| Route | Who | What |
|---|---|---|
| `GET /api/qrph` | Signed in | `{ configured, accountName, imageUrl }` |
| `GET /api/qrph/image` | Signed in | The QR image |
| `PUT /api/qrph/image` | Admin | Upload the QR image (raw JPEG or PNG, 5 MB) |
| `PATCH /api/qrph` | Admin | `{ accountName }` |
| `POST /api/qrph` | Customer | `{ orderId, reference }` → PENDING QR Ph payment for the balance |
| `POST /api/qrph/payments/:id/proof` | That customer | Raw screenshot, while the payment is pending |
| `GET /api/qrph/payments/:id/proof` | Staff | The screenshot |
| `GET /api/qrph/to-confirm` | Staff | Pending QR Ph payments, oldest first, with `overdue` |
| `POST /api/qrph/payments/:id/verify` | Staff | `{ decision: CONFIRM or REJECT, reason }` |

Also: `QRPH` is accepted as a counter payment method; the Sales report's "By payment method" lists Cash, QR Ph and GCash; the bell feed gains `payment_to_confirm`; the Dashboard summary gains `paymentsToConfirm` and `paymentsOverdue`.

## Screens

- **Checkout:** "QR Ph now" instead of "GCash"; Place order goes to the receipt page.
- **Receipt page:** the QR, amount, reference box and optional screenshot; then "Waiting for payment confirmation"; then the receipt once confirmed, or a "not accepted" message with the reason.
- **Payment & Billing:** a **Payments to confirm** list (reference, amount, customer, waiting time, overdue badge, screenshot, Confirm, Reject with a reason), and for the admin a **QR Ph code** card to upload the image and name.
- **Dashboard:** a **Payments to confirm** tile. **Bell:** "Payment to confirm for order #…".
- **Labels:** "QR Ph" wherever "GCash" was the online method; old payments still read GCash.
