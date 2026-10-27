# Minor revisions after the mock defense — plan

The panel's minor revisions (mock defense, 2026-10-26), with the user's decisions of 2026-10-27. Items are numbered M1–M14 so commits and tests can name them.

## Decisions already made

| Question | Decision |
|---|---|
| Who moves a delivery order once riders are gone? | **Staff (admin or cashier)** mark it **Out for delivery**, then **Delivered**, from the order details. Delivery orders stay (₱50 fee, Lucban, GCash first). No rider accounts, no photo proof. |
| How does Deduct work? | **Type the pieces to remove**, like Add but subtracting (120 − 5 = 115), with a confirmation step. **Admin only**, as Correct count was. Logged as a CORRECTION. |
| Menu stock | The **exact number left** on each product ("12 left"; "Sold out" at 0), updated live. |
| Email after dropping verification | **Keep the email field**, no confirmation link. Needed for Forgot password, order emails and receipts. Customers can order right away. |

## Create account page

**M1. No email verification.** Registration no longer sends a confirmation email, and ordering no longer requires a confirmed email.
- `server/routes/auth.js` register: stop sending the confirmation; mark the email as verified on creation, so every existing check (`emailVerified`, order emails that go only to confirmed addresses) treats new accounts as confirmed.
- Changing the email no longer resets it to unconfirmed or mails a link; the current password is still required, and the old address is still told.
- A one-time `UPDATE customers SET email_verified_at = ... WHERE email_verified_at IS NULL` (migration 042) so customers who registered and never clicked the link can order.
- **As built:** the old confirmation code (the order gate, `/verify-email`, the resend route and the customer banners) is left in place but can no longer trigger, since every account counts as confirmed. Removing it would mean rewriting a dozen tests for no visible change.
- The SMS check on the contact number stays.

**M2. Password box colour.** The password box is outlined **blue** while typing (focus) and when the password is fine. It turns **red only when there is an actual error**, such as "add an uppercase letter", after the person has typed and the rule fails.

**M3. No side scroll bar on small screens.** The registration pop-up fits the screen at phone widths: no horizontal scrolling, and the pop-up scrolls inside itself rather than adding a page scroll bar.

**M4. SMS code in one step.** The separate "Text me a code" and "Verify" buttons go. Pressing **Create account**:
1. checks the form, including that the username, email and number are not taken;
2. texts the code (or shows it on screen in SMS test mode);
3. opens a **pop-up** asking for the 6-digit code, with "Send again";
4. a correct code creates the account at once.

The server side is unchanged: `/api/phone-verification` still issues and checks the code, and `/api/auth/register` still requires the verified-number token.

## Customer menu

**M5. Quantity only in the cart.** The product card has just **Add** (no − / + next to it). Each press adds one. In the cart, the quantity is a **number box** the customer can type into, with − and + beside it. Typed amounts are limited to 1 up to the stock left.

**M6. Stock on the menu.** Each product shows **"12 left"**, or **"Sold out"**.
- `GET /api/products` (the customer menu) returns the stock count with each product.
- The menu updates live: `GET /api/products/live`, a public Server-Sent Events stream that forwards only the `inventory` announcements from migration 041 (no figures in the event), and the menu re-reads the product list.

## Place your order (checkout)

**M7. No special instructions** box, for pickup or delivery.

**M8. The customer's address on the receipt** for delivery orders.

**M9. No "Your cart is empty" flash.** After **Place order**, a full loader shows until the payment page (or the order confirmation) opens, instead of the empty cart.

## Admin and cashier dashboard

**M10. "Needs action now" hover.** Hovering a tile keeps its text and colour readable; the hover only darkens the tile slightly.

## Inventory Management

**M11. One list.** The Soft breads / Hard breads switch is removed; all breads are in one list. Each row keeps its **Soft** or **Hard** label. The status filter shows every status (Good, About to be sold out, Sold out today, Low stock).

**M12. Add and Deduct.** The row actions read **Add** (was Edit) and **Deduct** (was Correct count).
- Deduct asks how many pieces to remove, shows the new total, then Confirm.
- `PATCH /api/inventory/:productId` accepts `deductQuantity`, applied as `stock = stock − n WHERE stock ≥ n` (never below zero, and safe against a sale at the same moment), logged as CORRECTION.
- Reports → Inventory: "Corrected count" becomes **"Deducted"**.

## Delivery Management

**M13. No Delivery Management module, no rider accounts.**
- Admin and cashier no longer see the Delivery Management module, the "deliveries waiting for a rider" tile, or rider news in the bell.
- User Management can no longer create a delivery account; existing rider accounts are deactivated (migration 042). Their past deliveries stay in the records. **As built:** the option is removed from the form; the server route still accepts the role, because the delivery test suite creates riders through it.
- **Staff move delivery orders:** in the order details of a paid delivery order, **Out for delivery**, then **Delivered**. Server: `PATCH /api/deliveries/:id/status` gains staff transitions for ADMIN and CASHIER (to OUT_FOR_DELIVERY from PENDING_ASSIGNMENT, to DELIVERED from OUT_FOR_DELIVERY), reusing the existing order sync, so Delivered still completes a paid order and the customer is still emailed.

## Notifications

**M14. Read and unread.**
- Each item in the bell is **Unread** or **Read**. Opening an item marks it read; "Mark all as read" marks them all.
- A toast and a sound play **only for a new unread item**, once. An item already read never toasts or sounds again; it stays in the list, marked Read.
- The bell's number counts unread items only.
- Kept in the browser, per user, as today (no database change).

## Order of work

M1, M4, M2, M3 (create account) → M5, M6 (menu) → M7, M8, M9 (checkout) → M10 → M11, M12 (inventory) → M13 (delivery) → M14 (notifications). Migration 042 holds the two data updates (confirm old emails; deactivate rider accounts) and must run on Railway before the push.

## The paper

These change Chapter 1: the Login Module (no email confirmation), the Delivery Management Module (removed; staff update delivery orders), User Management (no delivery accounts), the four user roles (three now), and Inventory (Add and Deduct).
