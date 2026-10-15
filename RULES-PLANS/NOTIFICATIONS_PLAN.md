# Notifications, delivery hand-off, and contacting the customer

Written 2026-10-15 by Opus after a classmate test of the live system.
Implement phase by phase (N1–N6), one commit per phase, tests passing
after each. Do not re-decide what is decided here; if something below turns
out to be wrong in the code, stop and note it at the end of this file.

## What the test found

1. Creating an account has no "Show password".
2. Only new orders reach the staff. The tester assigned an order to a
   driver, and the driver saw nothing. The driver marked it delivered, and
   the cashier and admin saw nothing, so they had no way to know it was
   done.
3. The customer hears nothing by email when the order leaves the bakery or
   arrives. If the driver hands the order to the wrong house, nobody finds
   out until the customer complains.
4. The driver needs an easy way to call or text the customer.

## Why the driver saw nothing (read before N3/N4)

The driver already has a bell (`src/components/NotificationBell.jsx`,
CLIENT_REVISIONS_PLAN R4). It polls `/api/deliveries/mine` every 20
seconds and shows a toast for a newly assigned delivery. It fails in the
common case:

- It works only while the PECTRACK tab is open and in front. Phone
  browsers pause background tabs, so the 20-second poll stops.
- `new Notification(...)` throws on Android Chrome. Page-level browser
  notifications need a service worker there, and we have none.
- My Deliveries does not reload its own list when the bell finds
  something, so even a driver looking at the screen sees a stale list.

Fix in two parts. N3 gives every role a real feed and refreshes the open
screen. N4 emails the driver, because email is the one channel that
reaches a phone with the browser closed and needs no new infrastructure.

## Phases

| Phase | What | Size | Migration |
|---|---|---|---|
| N1 | Show/Hide on every password field | small | none |
| N2 | A delivered delivery completes its order | small | none |
| N3 | One notification feed for every staff role | medium | none |
| N4 | Email the driver when a delivery is assigned | small | none |
| N5 | Email the customer: ready, on the way, delivered, failed | medium | none |
| N6 | Call and Text buttons for the driver | small | none |

No migration in any phase. Every event N3 needs already has a timestamp
in the database.

---

## N1 — Show/Hide on every password field

**Decision:** one shared component, so the fields cannot drift apart.

- New `src/components/ui/PasswordInput.jsx`: wraps `Input`, adds a
  right-aligned text button "Show"/"Hide" (the same words LoginForm
  uses). The button is `type="button"`, has `aria-pressed`, and has
  `aria-label="Show password"` / `"Hide password"`. The input gets
  `pr-14` so text never runs under the button. It forwards `ref` and all
  other props (`autoComplete`, `placeholder`, `aria-invalid`, ...).
- Each field has its own toggle. Do not link Password and Confirm
  password to one toggle.
- Use it in:
  - `StaffManagement.jsx`: Password and Confirm password in the create
    form (lines ~231–235), and the reset-password field (~313, keep
    `className="h-8 text-xs"`).
  - `MyProfile.jsx`: Current password on the Profile tab, and every field
    on the Password tab.
  - `ResetPasswordPage.jsx`: every password field.
- `RegisterForm.jsx` (storefront styling, not the `ui` primitives): add
  the same Show/Hide button inline, copying LoginForm line 148's markup,
  to Password and Confirm password.
- No server change. No test beyond a lint and build pass; check by hand
  that the toggle works and that the browser still offers to save the
  password (autocomplete attributes unchanged).

---

## N2 — A delivered delivery completes its order

**Today:** when the driver marks a delivery DELIVERED, `orders.status`
stays OUT_FOR_DELIVERY (PHASE7_PLAN Decision 4). Staff must open the order
and mark it COMPLETED by hand. Decision 4 existed because a cash-on-delivery
order was still unpaid at the door. NO_COD_PLAN removed cash on delivery:
a delivery order cannot be assigned until it is fully paid
(`routes/deliveries.js` assign route), and a paid order can never be
cancelled or refunded (R2). So the reason for Decision 4 is gone.

**Decision:** DELIVERED completes the order in the same transaction, when
the order is fully paid. This supersedes PHASE7_PLAN Decision 4 for
DELIVERED only. FAILED still does not touch `orders.status`.

**Change** in `PATCH /api/deliveries/:id/status`, inside the existing
transaction, after the claim succeeds, next to the OUT_FOR_DELIVERY sync
(the order row is already locked there):

```js
if (status === 'DELIVERED') {
  const billing = await getBillingSummary(client, orderId)
  if (billing.isFullyPaid) {
    const completed = await client.query(
      `UPDATE orders SET status = 'COMPLETED' WHERE order_id = $1 AND status NOT IN ('COMPLETED', 'CANCELLED')`,
      [orderId],
    )
    if (completed.rowCount) {
      await client.query(
        'INSERT INTO order_status_history (order_id, updated_by, status, note) VALUES ($1, $2, $3, $4)',
        [orderId, request.user.id, 'COMPLETED', 'Completed on delivery.'],
      )
    }
  }
}
```

- Use `getBillingSummary` from `lib/billing.js` (already used by the
  assign route). Never compare amounts in JavaScript.
- An unpaid order (old data only) stays OUT_FOR_DELIVERY. Staff complete
  it by hand through the existing route, which still checks payment and
  that the delivery is DELIVERED. Do not remove that route's checks.
- Before writing this, read `PATCH /api/orders/:id` → COMPLETED and
  confirm it has no other side effect (stock, payments). As of this plan
  it only checks payment and the delivery state, then writes the status
  and a history row. If you find another side effect, stop and note it
  here instead of skipping it.
- Update the Decision 4 comment above the OUT_FOR_DELIVERY sync and the
  comment in `routes/orders.js` near line 201 so they describe the new
  rule.
- UI: Order Management's "Mark completed" button for a delivery order
  will now rarely appear. No change needed; it follows the order status.

**Tests** (`server/routes/deliveries.test.js`):
- A paid delivery order: driver marks DELIVERED → order is COMPLETED,
  and a COMPLETED history row exists with the driver's user id.
- An unpaid delivery order (insert directly, bypassing assignment's
  payment check): DELIVERED leaves the order OUT_FOR_DELIVERY.
- FAILED does not change the order status (existing test still passes).

---

## N3 — One notification feed for every staff role

**Decision:** the feed is derived from timestamps that already exist. No
`notifications` table and no write-path changes, so no code path can
forget to emit an event. "Seen" stays per device in localStorage, as R4
decided.

### Server: `GET /api/notifications?since=<ISO time>`

New `server/routes/notifications.js`, mounted in `app.js` behind the same
auth middleware as the other routes. Roles: ADMIN, CASHIER, DELIVERY
PERSONNEL. Customers get 403.

- `since` is optional. Without it, return the newest 20 events. With it,
  return events whose time is after `since`, compared at millisecond
  precision like `/api/orders/recent` does
  (`date_trunc('milliseconds', ...) > $1`). Invalid `since` → 422 with the
  same message `/api/orders/recent` uses.
- Each event is:

```js
{
  key: 'delivered:123',     // `${type}:${source row id}` — unique, the bell's id
  type: 'delivered',        // see the table below
  at: '2026-10-15T07:42:10.123Z',
  orderId: 456,
  orderNumber: 7,
  orderDay: '2026-10-15',
  title: 'Order #7 delivered',
  body: 'By Juan · Maria Santos, Brgy. Ayuti',
}
```

- Build `title` and `body` on the server with `lib/orderNumber.js`, so the
  bell, toast, and browser notification all say the same thing.
- One SQL query per event type, run in parallel, merged and sorted by
  `at` descending in JavaScript, then cut to 20. Each query has its own
  `LIMIT 20`.

**Events for ADMIN and CASHIER:**

| type | Source | Time | Title / body |
|---|---|---|---|
| `order_placed` | `orders` | `order_date` | "New order #7" / "Juan, delivery, ₱240" (same text the bell uses now) |
| `payment_received` | `payments` with `status = 'PAID'` and `gateway_reference IS NOT NULL` (online GCash only) | `payment_date` | "Payment received for #7" / "GCash ₱240" |
| `out_for_delivery` | `order_status_history` rows with `status = 'OUT_FOR_DELIVERY'` | `updated_at` | "Order #7 is on the way" / "With Juan" |
| `delivered` | `deliveries.delivered_at IS NOT NULL` | `delivered_at` | "Order #7 delivered" / "By Juan · recipient, barangay" |
| `delivery_failed` | `deliveries.failed_at IS NOT NULL` | `failed_at` | "Delivery failed for #7" / the driver's note, cut to 80 chars |
| `order_cancelled` | `order_status_history` rows with `status = 'CANCELLED'` | `updated_at` | "Order #7 cancelled" / "By the customer" or the staff name |

- Leave out events the viewer caused (`updated_by = request.user.id`, or
  `recorded_by` for payments). A cashier who cancels an order does not
  need to be told.

**Events for DELIVERY PERSONNEL:**

| type | Source | Time | Title / body |
|---|---|---|---|
| `assigned` | `deliveries` where `delivery_personnel_id` is this driver | `assigned_at` | "New delivery #7" / "Customer, barangay" (same text as now) |

- Look up the driver's `delivery_personnel_id` from `request.user.id`
  the same way `/api/deliveries/mine` does.
- A delivery the admin sends back to the queue clears
  `delivery_personnel_id`, so it drops out of the driver's feed. That is
  acceptable: the driver sees it gone from My Deliveries. Note it in the
  Limitations, not as a bug.

Keep `GET /api/orders/recent`; the Dashboard's Recent orders panel still
uses it. The bell stops using it.

### Client: `NotificationBell.jsx`

- Replace `sourceFor(user)` with one source for every role:
  `fetch: (since) => apiGet('/api/notifications' + query)`, `time: item.at`,
  `title: item.title`, `text: item.body`, and the item id is `item.key`.
  Change every `item.id` in the bell to the key (the Map, toast keys, the
  `tag` of the browser notification, `openedUnseen`).
- Remove the driver-only block that deletes known ids missing from the
  fetch; the feed is a log now, not the open-delivery list.
- Panel heading: "Notifications" for every role. `noun()` becomes
  "notification"/"notifications".
- Browser notification on phones: wrap in a check. If
  `navigator.serviceWorker?.controller` is absent, skip `new Notification`
  on mobile instead of relying on the throw. Do not add a service worker
  in this phase (see "Not in this plan").
- After `announce(fresh)`, dispatch
  `window.dispatchEvent(new CustomEvent('pectrack:notifications', { detail: fresh }))`.

### Client: screens refresh themselves

- `MyDeliveries.jsx`, `DeliveryManagement.jsx`, `OrderManagement.jsx`, and
  `DashboardHome.jsx` listen for `pectrack:notifications` in a
  `useEffect` and call their existing load function. Remove the listener
  on unmount. This fixes the stale list the tester saw.

### Client: where a notification opens (`Dashboard.jsx` `openNotified`)

- `order_placed`, `payment_received`, `order_cancelled` → Order
  Management with `{ orderId: item.orderId, at: Date.now() }` (the
  current behavior, now using `orderId`, not `id`).
- `out_for_delivery`, `delivered`, `delivery_failed` → Delivery
  Management.
- `assigned` → My Deliveries.
- Change the signature to `openNotified(item)`; the bell no longer
  passes a `kind`.

### localStorage

- The "seen" key stays `pectrack.notifications.seen.${user.id}`. Old
  values are ISO times, which still compare correctly against `at`, so no
  reset is needed.

**Tests** (`server/routes/notifications.test.js`):
- A customer gets 403; no token gets 401.
- Admin: placing an order, marking a delivery DELIVERED, and FAILED each
  produce one event of the right type with the daily order number.
- `since` returns only newer events; an invalid `since` is 422.
- A cashier does not see the cancel they made themselves; the admin does.
- A driver sees only their own `assigned` events, never another driver's,
  and none of the staff event types.
- An online payment confirmed through the PayMongo path produces
  `payment_received`; a cash payment recorded by a cashier does not.

---

## N4 — Email the driver when a delivery is assigned

**Decision:** email, not SMS (costs money per message) and not Web Push
(needs a service worker, VAPID keys, a subscriptions table, and does not
work on iPhone unless the site is installed). The Gmail app on the
driver's phone shows the email as a phone notification even with the
browser closed.

- New `server/lib/notices.js` holding every message this plan sends
  (N4 and N5), so the wording lives in one file. Each function takes plain
  values and calls `sendMail` from `lib/mail.js`.
- `sendDeliveryAssignedEmail({ to, driverName, orderLabel, customerName, address, items, requestedTime })`:
  - Subject: `New delivery ${orderLabel} — Pecto's Bakery`
  - Body: who, where (full address), what (items with quantities), when
    it is needed, and the link `${config.clientOrigin}/dashboard` to open
    My Deliveries. No payment amounts; the order is already paid.
- Call it in `PATCH /api/deliveries/:id/assign` **after** `COMMIT`, without
  awaiting it in the response path:

```js
sendDeliveryAssignedEmail({...}).catch((error) => console.error('Could not send the assignment email:', error))
```

  An email failure must never undo or fail an assignment.
- Read the driver's email from `delivery_personnel.email`, and the
  address and items with the same query the response already runs
  (`deliverySelectQuery` + `withItems`). Do not add a second items query.
- Reassigning a delivery that was sent back to the queue sends a new
  email to the new driver. That is correct.

**Tests:** mock `lib/notices.js` the way `mail.test.js` / `auth.test.js`
mock mail. Assigning calls `sendDeliveryAssignedEmail` once with the
driver's email; a failed assignment (409) does not call it; a rejected
promise from the mock still returns 200.

---

## N5 — Email the customer: ready, on the way, delivered, failed

**Decision:** four emails, all sent after the transaction commits, never
awaited in the response path, failures logged only (same pattern as N4).
Only to orders with a `customer_id` (walk-in orders have none, see the
guest-orders rule) and only when `customers.email_verified_at` is set.

| When | Where in code | Subject | Must say |
|---|---|---|---|
| Pickup order → READY_FOR_PICKUP | `PATCH /api/orders/:id` after COMMIT | "Your order #7 is ready for pickup" | Bakery address and hours (from the server copy below) |
| Delivery → OUT_FOR_DELIVERY | `PATCH /api/deliveries/:id/status` after COMMIT | "Your order #7 is on the way" | Driver's first name, the delivery address, the items |
| Delivery → DELIVERED | same | "Your order #7 was delivered" | The time, the recipient name and address it went to, and: "If you did not receive this order, call us today at (042) 540-4366 or (042) 540-8838." |
| Delivery → FAILED | same | "We could not deliver order #7" | "The bakery will contact you." plus the phone numbers. Do not include the driver's internal note. |

- The DELIVERED email is the wrong-house safeguard the tester asked for:
  the customer learns within a minute that the bakery thinks the order
  arrived, and has the numbers to call.
- Each email ends with a link to `${config.clientOrigin}/account` (the
  customer's account page with My Orders, `App.jsx` line ~222).
- Never put the driver's phone number in a customer email. The bakery's
  numbers are the contact point.
- Bakery details on the server: `src/lib/bakery.js` is the screen copy.
  Add `server/lib/bakery.js` with only `name`, `street`, `town`, `hours`,
  and `phones`, and put a comment at the top of **both** files saying the
  other one must change with it. Do not import from `src/` in the server.
- Admin moves (FAILED by admin, back to queue) also trigger FAILED's
  email only when the new status is FAILED. Back-to-queue sends nothing.
- Use `lib/orderNumber.js` `orderLabel(number, day)` for "#7 (Oct 15)" in
  the body; the subject uses "#7" alone.

**Tests:**
- Each of the four transitions calls the right notice once with the
  customer's email.
- A walk-in pickup order going READY_FOR_PICKUP sends nothing.
- An unverified customer email sends nothing.
- A 409 (refused transition) sends nothing.
- A notice that rejects does not change the 200 response.

---

## N6 — Call and Text buttons for the driver

**Today:** My Deliveries shows the recipient's number as a small `tel:`
link. There is no Text option, and nothing for the account holder when
the recipient is someone else.

**Decision:** phone links only. No in-app chat: it needs live messaging,
storage of conversations, and moderation, which is outside this
project's scope. The phone's own Call and SMS apps already do the job.

- `routes/deliveries.js` `deliverySelectQuery`: add
  `c.contact_num AS customer_contact_num` and map it to
  `customerContactNumber` in `mapDeliveryRow`.
- New helper in `src/lib/bakery.js` (next to `telHref`):
  `smsHref(phone, body)` → `sms:${digits}?body=${encodeURIComponent(body)}`.
  `?body=` works on Android and current iOS.
- `MyDeliveries.jsx`, on each open delivery card, a row of two large
  buttons (at least 44px tall, full width on phones, side by side):
  - **Call** → `telHref(delivery.address.contactNumber)`
  - **Text** → `smsHref(delivery.address.contactNumber, "Hi, this is the Pecto's Bakery rider with order #7. ")`
- If `customerContactNumber` differs from the recipient's number (compare
  digits only), show a smaller second line: "Account holder: Juan ·
  Call · Text", for when the recipient does not answer.
- Add a small "Call the bakery" link at the bottom of the card using
  `bakery.phones[0]`.
- Do not show Call/Text on the History tab (finished deliveries).
- `DeliveryManagement.jsx` (staff): make the recipient's number a `tel:`
  link too, if it is not one already.

No server test beyond: `/api/deliveries/mine` returns
`customerContactNumber`.

---

## Not in this plan

- **Web Push** (notifications on a phone with the browser closed, without
  email). Needs a service worker, VAPID keys, the `web-push` package, and
  a `push_subscriptions` table. Revisit only if email to drivers proves too
  slow in practice.
- **In-app notifications for customers.** They get email (N5) and can
  see the status on My Orders.
- **Customers viewing the proof-of-delivery photo.** It would help in a
  wrong-house dispute. It is a known Phase 7 gap and a separate change.
- **In-app chat** between driver and customer (see N6).

## Paper

These change the paper's description of the delivery and notification
features. Put the changes in `RULES-PLANS/PAPER_FIX_REVISIONS.md` under a
new section "Notifications (N1–N6)":
- Delivery status: DELIVERED now completes a paid order.
- Notifications: staff and drivers get in-app notifications for orders,
  payments, and deliveries; drivers and customers also get email.
- Limitations: in-app notifications appear only while the system is open;
  no push notifications; a driver is not told when a delivery is taken
  back.
- Figures to retake: the bell panel (now "Notifications"), My Deliveries
  card (Call/Text buttons).

## Order of work

N1 → N2 → N3 → N4 → N5 → N6. N2 comes before N3 so the `delivered` event
and the completed order appear together when you test N3. Run the full
backend suite, lint, and build after each phase, then commit.
After N6, test once on the live site with two phones (driver and
customer), the way the classmate test was done.
