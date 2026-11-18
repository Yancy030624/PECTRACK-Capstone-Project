# Final defense revisions plan (2026-11-18)

Source: the panel's handwritten notes on the bound copy after the final
defense, the adviser's spoken notes, and Yancy's answers on 2026-11-18.
The paper must be book-bound after these revisions.

## What the panel and adviser asked for

| # | Note (as written) | Decision |
|---|---|---|
| P1 | "Endorsement Form" | Paper: add the Endorsement Form page. Team task in Word. |
| P2 | "Bold ang title and names of the proponents sa Approval Sheet" | Paper: formatting. Team task in Word. |
| P3 | "Check your purpose and description" | Paper: rewrite Purpose and Description in past tense, Spiral wording, descriptive analytics, OTP and address changes. |
| P4 | "In Scope and Limitation minimize the inggaso, nag-overlap kasi sa margin ng paragraph" | Paper: fix spacing/indents so text stays inside the margins. Word formatting. |
| P5 | "At least 3 mins ang OTP" | Code: every code lasts 5 minutes (at least 3) and shows a countdown. See C3. |
| P6 | "Remove 'Network Dependency' in Limitation" | Paper: delete Limitation 2 and renumber. |
| P7 | "retain order" beside Objective 3 | Code: going back from the GCash payment page must not lose the order. See C1. |
| P8 | "OTP: to create, to recovery, to change pass, to expiration" | Code: six-digit code for registration (exists), forgot password, and change password; each code has an expiry shown on screen. See C3. |
| P9 | "descriptive" over "demonstrate demand forecasting" in Objective 5 | Paper: the analytics is called **descriptive analytics**. Code labels follow. See C5. |
| P10 | "Safety / Low / Critical" beside Objective 4 | Paper wording only (Yancy, 2026-11-18). Map the current labels; no code change. |
| P11 | "spiral model" beside the General Objective | Paper: methodology becomes the **Spiral Model**. Replaces Iterative and Incremental Development. |
| P12 | "include branch" | Paper: name the branch. The system covers one branch, the Lucban store (Yancy, 2026-11-18). |
| P13 | "centralize" / "edit → address" | Code: address details can be edited in the customer profile. See C2. |
| P14 | "99 stock → error if exceed order beyond stock" | Code: typing a quantity above the stock shows an error at once. See C4. |
| P15 | Item 3 from Yancy: "put the address details when creating account" | Code: registration asks for the address. See C2. |
| A1 | Adviser: "naka past tense na yung mga verb sa document" | Paper: all verbs that describe the study, the system, and the methods in past tense. |

## Code changes

### C1. Going back from the payment page keeps the order

Cause today: `CheckoutPage` clears the cart and opens `/receipt/:id`. The back
button returns to `/checkout`, which now shows an empty cart. The order is still
held (AWAITING_PAYMENT, 15 minutes), but `customerVisibleOrderSql` in
`server/routes/orders.js` hides AWAITING_PAYMENT, so the order is not in My
Orders either. To the customer, the order "disappeared".

Build:
1. `server/routes/orders.js`: `customerVisibleOrderSql` also admits
   `o.status = 'AWAITING_PAYMENT'` (the customer's own live hold). A hold that
   runs out becomes CANCELLED with nothing paid and is hidden again, so no
   other change is needed. Staff lists are unchanged.
2. `GET /api/orders/awaiting-payment` (customer only): the customer's live
   AWAITING_PAYMENT orders, newest first, with `id`, `orderNumber`/label,
   `total`, and the hold's expiry time.
3. `CheckoutPage.jsx` and `CartPage.jsx`: when the cart is empty and the
   customer has a live hold, show a card: "Order #X is waiting for your GCash
   payment. It is held until 10:42 AM." with a **Continue to payment** button
   to `/receipt/:id`. The empty-cart message shows only when there is no hold.
4. `CheckoutPage.jsx`: open the payment page with `navigate(..., { replace: true })`,
   so Back goes to the page before checkout and not to an empty checkout.
5. My Orders: an AWAITING_PAYMENT order shows the status "Waiting for your
   payment" and a **Pay now** button to `/receipt/:id`.
6. The payment page never cancels an order by itself. Only the **Cancel order**
   button (with its confirm) and the 15-minute release cancel it. Keep it so.

Tests: `orders.test.js` — a customer sees their own AWAITING_PAYMENT order in
GET /api/orders and in /awaiting-payment; staff still do not; another customer
does not; an expired-and-released hold is not listed.

### C2. Address at registration, and editable addresses

Build:
1. `RegisterForm.jsx`: a "Delivery address" section after the contact number:
   street address (required), barangay (required at registration), address
   line 2 (optional), delivery notes (optional). Municipality and province show
   "Lucban" and "Quezon", read-only, with the note "We deliver within Lucban,
   Quezon only." The recipient name and contact number are not asked again;
   the server copies them from the registration fields.
2. `POST /api/auth/register`: validate the address with the same rules as
   `routes/addresses.js` (export `validateAddressFields` from a shared place,
   for example `server/lib/addressValidation.js`, and use it in both files).
   The `checkOnly` call validates the address too, so no SMS code is sent for a
   form that will fail. In the same transaction as the customer row, insert one
   `customer_addresses` row: label "Home", is_default TRUE, is_active TRUE.
   Errors come back under `addressLine1`, `barangay`, etc.
3. My Profile → Addresses (`src/pages/dashboard/MyProfile.jsx`): an **Edit**
   button on each active address. It opens `AddressForm` filled with that
   address. `AddressForm` gets an `address` prop: when given, it sends
   `PATCH /api/addresses/:id` with only the changed fields.
4. `PATCH /api/addresses/:id`: today a 409 refuses changes to an address used
   on an order. Change it: when the address was used on an order and a frozen
   field changes, insert a NEW row with the merged values (same customer,
   label, notes, is_default copied), set the old row `is_active = FALSE,
   is_default = FALSE`, all in one transaction, and return the new address.
   Old orders keep pointing at the old row, so their delivery history does not
   change. To the customer it is one edited address.
   Lock order: lock the customer's address rows `FOR UPDATE` before the
   default swap (the partial unique index on default is
   `WHERE is_default AND is_active`; insert the new row with is_default FALSE,
   deactivate the old row, then set the new row default).

Tests: `auth.test.js` — registration without a street address is 422 and
creates nothing; registration with an address creates one default address.
`addresses.test.js` — editing an unused address updates it in place; editing a
used address returns a new id, the old row is inactive and still linked to its
order, and the new row is the default when the old one was.

### C3. Codes for create, recovery, and change password, with expiry shown

Every code: six digits, valid for **5 minutes**, at most 5 wrong tries, and a
new code can be asked for after 60 seconds. The send response returns
`expiresInSeconds` and `resendInSeconds`.

1. Registration (SMS, exists): `codeMinutes` in
   `server/lib/phoneVerification.js` from 10 to 5. Advanced orders use the same
   code and also get 5 minutes.
2. Admin sign-in (email, exists): already 5 minutes. Return
   `expiresInSeconds` from /login when a code is sent.
3. Forgot password (email): replace the emailed **link** with an emailed
   **code**.
   - Migration `045_password_codes.sql`: `password_reset_tokens` gets
     `code_hash TEXT`, `attempt_count SMALLINT NOT NULL DEFAULT 0`, and
     `purpose VARCHAR(20) NOT NULL DEFAULT 'RESET' CHECK (purpose IN ('RESET', 'CHANGE'))`.
     Update `database/schema.sql` to match.
   - `POST /api/auth/forgot-password {email}`: same generic answer as today,
     plus a `resetToken`. For a real account, store hash(resetToken) in
     `token_hash` and hash(code) in `code_hash`, expires in 5 minutes, and email
     the code. For an unknown email, return a random token that matches no row,
     so the two answers look the same.
   - `POST /api/auth/reset-password {resetToken, code, newPassword, confirmPassword}`:
     find the live RESET row by token; wrong code adds 1 to attempt_count; 5
     wrong codes end the row. Everything else (sessions ended, trusted devices
     forgotten, lockout cleared, email confirmed) stays as today.
   - `ForgotPasswordPage.jsx`: step 1 email; step 2 code + new password +
     confirm, with the countdown and Resend. `/reset-password` route now
     redirects to `/forgot-password` (old emailed links stop working; say so on
     the page).
4. Change password (email, any role):
   - `POST /api/auth/password/code` (requireAuth, rate limited): emails a code
     to the account's own email, purpose CHANGE, returns `challengeToken`.
   - `PATCH /api/auth/password`: also requires `challengeToken` and `code`.
     Check the current password first, then the code. A RESET row can never
     satisfy a CHANGE request and the other way round.
   - Password section in My Profile (customers and staff): "Send code" button,
     code field with the countdown, then the existing fields.
   - First-login setup (`/setup-credentials`) does not need a code; it already
     follows an admin-given password.
5. `src/components/CodeTimer.jsx`: shows "Code expires in 4:59", then "Code
   expired. Send a new one."; the Resend button is disabled with "Resend in
   0:45" until the cooldown ends. Use it on: registration SMS code, advanced
   order SMS code (cashier), admin sign-in code, forgot password, change
   password.
6. `server/lib/mail.js`: one `sendCodeEmail({ to, code, minutes, purpose })`
   with plain-text bodies for sign-in, password reset, and password change.

Tests: `auth.test.js` — reset with the right code works once; wrong code 5
times kills the row; expired code fails; a CHANGE code cannot reset and a
RESET code cannot change; PATCH /password without a code is 422.
`phoneVerification.test.js` — the code expires after 5 minutes.

### C4. Quantity above stock shows an error at once

1. `WalkInOrderForm.jsx`: when the typed quantity is above the product's
   stock, show under that line "Only N left." in red and disable Place order.
   (Soft-bread advanced orders do not take today's stock — keep their rule:
   no cap for a soft bread on an advanced order.) On a 409, show the server's
   message, which already names the product and the pieces left, instead of
   the generic sentence.
2. `CartPage.jsx` `QuantityBox`: when the typed number is above the stock, keep
   the clamp but show "Only N left of {product}." under the line. The menu's
   + button at the limit shows the same message.
3. `CheckoutPage.jsx`: on a 409 about items, show the server's message.

### C5. Labels: "descriptive analytics"

The system still forecasts (the Forecast tab stays). The module name in the
UI and paper becomes "Reports and Descriptive Analytics". Change only visible
text (`modules.js` module title, page headings, print headers). No route,
table, or file renames.

## Paper changes (when the .docx is in docs/)

Edit the Word file directly, keeping its formatting, with tracked changes so
the team can review.

1. Past tense across the whole paper (A1): "The system will provide" →
   "The system provided"; "The proponents will consult" → "The proponents
   consulted"; system descriptions "The system deducts" → "The system
   deducted". Do not change the tense of cited studies already in past tense,
   of direct quotations, or of figure captions.
2. Methodology (P11): replace Iterative and Incremental Development with the
   Spiral Model (Boehm, 1988). Four quadrants per loop: determine objectives,
   identify and resolve risks, develop and test, plan the next iteration. Map
   the three development cycles to loops: Loop 1 foundational modules, Loop 2
   core operational modules, Loop 3 decision support and deployment, with
   further loops for consultation and defense revisions. Risk examples from
   this project: no sales history (resolved with assumed data), payment
   verification (resolved with staff confirmation of GCash references),
   hosting resets (images stored in the database). Replace "Figure 17: Agile
   Methodology" with a Spiral Model figure. Fix the Calendar of Activities
   and "Development Cycles" sections to say Spiral.
3. Predictive → descriptive (P9, item 1): title text stays as the adviser
   approved unless the adviser says otherwise; ask before changing the title.
   In the body, "predictive analytics" becomes "descriptive analytics" where
   it means the reports; the forecast is described as part of the descriptive
   analytics module. Objective 5 heading: "To provide reports and descriptive
   analytics for inventory planning."
4. Objective 4 and the Inventory module (P10): describe stock in three levels:
   **Safety** (stock above the minimum level or above one-fifth of the daily
   standard), **Low** (a hard bread at or below its minimum level; a soft bread
   About to Be Sold Out), **Critical** (Sold Out Today, zero stock).
5. Scope (P12): state that the system covers one branch, the Lucban, Quezon
   store of Pecto's Bakery.
6. Limitations (P6): delete "2. Network Dependency." and renumber.
7. Login Module, registration, Figure 1.1, Figure 1.2, My Profile (P8, P13,
   P15): forgot password by emailed code; change password by current password
   plus emailed code; every code valid for 5 minutes with a countdown;
   registration asks for the street address and barangay in Lucban;
   addresses can be edited.
8. Objective 3 / Order module (P7): a held GCash order stays in My Orders as
   "Waiting for your payment" until paid, cancelled, or released after 15
   minutes.
9. Formatting (P1, P2, P4): Endorsement Form, bold title and names on the
   Approval Sheet, Scope and Limitations indents inside the margins. Team
   checks these in Word after the edit.

## Build notes (2026-11-18, as built)

- C1: no new `/awaiting-payment` route. `GET /api/orders` for a customer now
  lists their own AWAITING_PAYMENT holds with `referenceSent` and
  `holdExpiresAt`; `UnpaidOrderNotice.jsx` filters them on the cart and the
  empty checkout.
- C2: `validateAddressFields` is exported from `routes/addresses.js` (not a
  new lib file). Address line 2 is not on the sign-up form.
- C3: reset and change codes are looked up by account + purpose, not by a
  browser token: the person asking for the code holds any token anyway, so it
  added no protection. Security comes from 6 digits, 5 tries, 5 minutes, and
  the 60-second resend wait. Migration 045 also adds the security event types
  `PASSWORD_RESET_FAILED` and `PASSWORD_CHANGE_CODE_SENT`.
- C4: the product list now carries `stockType` (public; SOFT/HARD is not
  sensitive), so the advanced-order screen skips the cap for soft breads.
- C5: dropped. The UI never said "predictive"; the module stays
  "Reporting & Analytics". "Descriptive analytics" is paper wording only.

- C6 (2026-11-19, Yancy): the forecast is hidden in the interface to match
  the paper. `src/lib/features.js` `showForecast = false` removes the
  Forecast tab, the Production list's Forecast column, its "bake more"
  banner, and its note. Server routes and the nightly run are unchanged.
  Old Export history rows labelled "Forecast" still show as they were.
- Not pushed yet (Yancy, 2026-11-19). Migration 045 runs on Railway first.

## Order of work

C1 → C4 → C2 → C3 → C5 → tests and build → paper (needs the .docx).
Migration 045 must run on Railway before the C3 code is deployed.
