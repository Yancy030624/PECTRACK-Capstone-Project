# CHECKOUT_PLAN.md — cart, checkout, and closing the customer ordering loop

## Why this is not called "Phase 9"

`PHASES-RULES-PLANNING.md` already assigns Phase 9 to **AI-Assisted
Analytics** — historical sales analysis, demand prediction, restocking
recommendations. That is a title-level requirement of the paper ("*A
Web-Based Order Management System with **AI-Assisted Analytics** and
Automated Inventory*"), not an optional extra, and the number belongs to
it.

Cart and checkout sit outside the numbered roadmap for the same reason the
storefront did, so this follows the precedent `STOREFRONT_PLAN.md` set: a
**named** plan for work the roadmap assumed rather than scheduled. The
roadmap's Phase 4 lists "Order Management / Order Items / Order Status" and
Phase 6 lists payment — both were built staff-first. The customer's own
half of that journey was never given a phase number, and it is the half a
defense panel will ask about first.

**Scheduling note, stated once and then dropped:** this plan should be
time-boxed. Phase 9 is in the paper's title and has not started. Cart and
checkout are worth doing properly because the customer journey currently
dead-ends, but every step below is deliberately small for this reason.

---

## Step 0 — Inspect: what already exists

This section is the reason the plan that follows is short. Most of the work
is already done; almost none of it is where a reader would expect.

### The backend is already complete for this feature

`POST /api/orders` (`server/routes/orders.js:153`) already accepts exactly
the shape a cart produces, and already does every hard part:

| What checkout needs | Where it already lives |
|---|---|
| `items: [{ productId, quantity }]` | `orders.js:158-190` — duplicate product ids are summed, not rejected; items are sorted by id for deadlock-safe stock locking |
| PICKUP vs DELIVERY | `orders.js:154-155` |
| Delivery address, verified as the caller's own | `orders.js:219-226` |
| Special instructions (500 char cap) | `orders.js:157` |
| Price snapshot at order time | `orders.js:238-243`, `299` |
| Stock deduction, race-free | `orders.js:285-297` — conditional UPDATE, 409 on insufficient stock |
| Total computed in Postgres, not JS | `orders.js:326-336` |
| `deliveries` row created with the order | `orders.js:268-270` |
| Customer identity resolved from the session, never the body | `orders.js:197-199` |

**There is no backend work in this plan's core.** That is not a
coincidence to be grateful for — `STOREFRONT_PLAN.md` Decision 6 built the
Menu toward this shape on purpose. It also means this plan satisfies
`FRONTEND-RULES.md`'s hardest constraint (*"Do not change the backend or
database to accommodate the UI"*) by construction rather than by effort.

### The screens the customer lands on afterwards already exist

This is the finding that shrinks the plan most, and it was missed in the
initial suggestion list:

- **`My Orders`** — built last session. Real order history, order detail,
  self-cancellation while `PLACED`. `GET /api/orders` is already scoped to
  the calling customer (`orders.js:71-76`).
- **`Payment & Billing`** — already handles `CUSTOMER`, and already has an
  online-payment path for them: `PaymentBilling.jsx:131`'s `canPayOnline`
  is true for a customer on an unpaid, non-cancelled order.
- **`POST /api/payments/intent`** — already open to `CUSTOMER`
  (`payments.js:487`), and already returns a clean, honest 503 when
  PayMongo credentials are absent (`payments.js:508-510`).

So checkout does not need to build a receipt screen, an order-history
screen, or a payment screen. **It needs to end by handing off to three
things that already work.** Rebuilding any of them would be the duplication
this inspection exists to prevent.

### What is genuinely missing

1. No cart state anywhere in the frontend.
2. `MenuPage.jsx:101` renders a dead `"Ordering soon"` pill for signed-in
   users.
3. `MarketingHeader.jsx:46` renders `<HeaderIcon type="cart" disabled />`.
4. No `/cart` or `/checkout` route (`App.jsx:112-117`).
5. **`orders.requested_fulfillment_time` is returned but never written.**
   `GET /api/orders/:id` sends it (`orders.js:143`); the `INSERT` at
   `orders.js:255-259` does not include it. The column is read-only in
   practice — the mirror image of the `report_logs` gap Phase 8 recorded.
   See Decision 8.
6. **`GET /api/products` does not expose stock quantity** (`mapProductRow`,
   `products.js:25-35`). The cart cannot show "only 3 left". See Decision 5.

---

## Decisions

### Decision 1 — the cart is React Context + `localStorage`. No library.

`FRONTEND-RULES.md` is explicit: *"Do not use a global state-management
library if React's built-in state/context is sufficient."* It is
sufficient. Three consumers need the cart — the header badge, the Menu's
add button, and the cart/checkout pages — and they sit in different parts
of the route tree, which is precisely the case Context exists for.

`CartProvider` wraps `<Routes>` in `App.jsx`, where `user` already lives
(Decision 3 needs it).

**Rejected:** Redux/Zustand (a dependency for one object), and prop-drilling
through `StorefrontLayout` (the header is three levels down from where the
state must live).

### Decision 2 — the cart stores `{ productId, quantity }` and nothing else

No price, no name, no image in stored cart state. Display data is read from
a fresh `GET /api/products` on the cart and checkout pages.

The reason is the same one `orders.js:312-325` gives for summing the total
in Postgres: **a price the frontend remembers is a second source of truth
that can silently disagree with the one that charges the customer.** If an
admin edits a price while an item sits in someone's cart, a stored price
would show a total the backend will not honour. Re-fetching means the cart
shows the current price or nothing at all.

The cart page shows a **provisional** subtotal from freshly-fetched prices,
labelled as such. The authoritative figure is `totalAmount` from the 201
response, and that is what the confirmation screen displays. This is the
line `FRONTEND-RULES.md` draws — the frontend does presentation, the
backend does calculation.

### Decision 3 — anonymous visitors may build a cart; only signed-in customers may check out

This extends `STOREFRONT_PLAN.md` Decision 3 rather than reopening it.
**Guest checkout stays closed**, for the reason already recorded there:
`POST /api/orders` deducts real stock, and opening it to unauthenticated
callers hands a stranger the ability to consume inventory with no identity.

But a *cart* is client-side only. It touches no endpoint and consumes no
stock, so there is no reason to forbid an anonymous visitor from filling
one. Forbidding it would punish exactly the behaviour the storefront is
built to encourage — browse first, sign in when ready.

So: the Menu's card affordance becomes **"Add to cart" for everyone**. The
sign-in wall moves from the product card to the checkout button, where it
belongs. On sign-in, an anonymous cart is **adopted** into the user's cart
rather than discarded — losing it at the login wall is the one moment most
likely to end the order.

Storage is keyed per identity (`pectrack.cart.<userId>`, and
`pectrack.cart.guest`), so two accounts on a shared bakery computer never
see each other's cart. Logout clears the in-memory cart and leaves other
keys untouched.

**Adoption must clear the guest key.** Adopt on the `null → user`
transition, then delete `pectrack.cart.guest`. Without the delete, that key
survives forever and is re-adopted on *every* future sign-in and every page
refresh that restores a session via `GET /api/auth/me` — a customer would
watch items they deleted weeks ago reappear in their cart. Adopt only into
an empty cart; if the signed-in user already has stored items, keep theirs
and discard the guest cart (merging two carts silently changes quantities
nobody chose).

**Staff do not get a cart.** `POST /api/orders` admits `CASHIER` as well as
`CUSTOMER` (`orders.js:153`) — a cashier posting from the storefront would
create a walk-in order with `customer_id` null, which is a real backend
capability but *not* what the storefront is for; counter orders belong in
the dashboard's Order Management. So: the Menu shows "Add to cart" to
anonymous visitors and `CUSTOMER`s only, the header badge renders for the
same two, and `/cart` and `/checkout` redirect a signed-in staff user to
`/dashboard` (never to `/login` — they *are* signed in, and bouncing them
to a login page they will be redirected straight back out of is a loop the
user can see).

### Decision 4 — `/cart` and `/checkout` are pages, not a slide-over drawer

Pages are linkable, work identically at 390px and 1440px with no extra
code, and need no focus trap, no scroll lock, and no escape-key handling.
A drawer needs all of those to be accessible and buys nothing a bakery
customer needs.

`FRONTEND-RULES.md`: *"Do not spend excessive time on visual polish or
animations… Treat this as a temporary development UI."*

### Decision 5 — stock errors are handled by re-validating, not by parsing the message

The cart cannot know stock levels — `GET /api/products` does not expose
them (see Step 0), and exposing them would be a backend change made to suit
the UI, which `FRONTEND-RULES.md` forbids. It is also the correct design:
stock at the moment of *display* is not stock at the moment of *purchase*,
and only the transaction at `orders.js:285-297` can settle it.

So the cart is optimistic and the 409 is the authority. On `409` (or the
`422` for an unavailable product), checkout re-fetches `GET /api/products`,
drops or flags any cart line whose product is no longer available, and
shows a clear message asking the customer to review the cart.

**Rejected:** parsing the product id out of the message string
(`"Not enough stock for product 47."`) to pinpoint the line. It works today
and breaks silently the first time anyone rewords that string. If
pinpointing turns out to matter, the fix is a structured `errors.productId`
from the backend — listed in "Follow-on work" as its own step, deliberately
not bundled here.

**Note for implementation:** those two messages name a bare numeric product
id, which is fine for a cashier-facing 500 log and wrong in front of a
customer. The frontend must show its own wording, never the raw
`error.message`, for these two cases specifically.

### Decision 6 — checkout places the order; it does not take payment

The order is created unpaid. The confirmation screen then offers two real
paths, both already built: pay at pickup / on delivery (nothing to do), or
**Pay now**, which links to Payment & Billing where `canPayOnline` already
works.

Combining them would mean either a new endpoint that creates an order and a
payment in one transaction (a backend change, and a second inventory-
adjacent write path), or two calls from the browser where the second can
fail after the first succeeded — leaving a placed order and a customer who
believes they have paid, with no rollback story. `POST /api/orders` and
`POST /api/payments` are separate on purpose. Keep them separate.

### Decision 7 — the cart icon becomes real; the search icon stays disabled

`STOREFRONT_PLAN.md` Decision 6 left both `HeaderIcon`s visibly disabled
and recorded that they should not be left "half-alive". This plan makes
exactly one of them real, with a count badge. Search stays disabled —
no search feature is in scope, and the Menu's category jump-nav
(`MenuPage.jsx:50-56`) already covers finding things in a 40-item catalogue.

### Decision 8 — `requested_fulfillment_time` is a SEPARATE, OPTIONAL step

The column exists, is returned by `GET /api/orders/:id`, and is never
written by anything. Checkout is the natural place a customer says "I need
this Saturday at 3pm", and for a bakery that takes cake pre-orders that is
a real requirement, not a nicety.

But writing it requires touching `POST /api/orders`, and this plan's core
is otherwise backend-free. Bundling a backend change into it would break
both *"build one logical feature at a time"* and the constraint that makes
the rest of this plan safe.

So it is **Step 6**, last, separately approvable, and droppable without
affecting anything before it. It is presented as a backend gap being
closed — not as a change made to accommodate the UI — because the column
and its read path already exist.

---

## Implementation steps

Each step should end with the app in a working state.

### Step 1 — cart state

- `src/cart/CartContext.jsx` (new) — `CartProvider`, `useCart()`.
  State: `[{ productId, quantity }]`. Actions: `addItem`, `setQuantity`,
  `removeItem`, `clear`, plus derived `itemCount`.
- Per-identity `localStorage` persistence, guest-cart adoption on login,
  clear on logout (Decision 3). Wrap every read/write in `try/catch` —
  private-mode browsers throw on access, and a thrown cart must not blank
  the storefront.
- Mount in `App.jsx` around `<Routes>`.

### Step 2 — Menu becomes orderable

- `MenuProductCard` (`MenuPage.jsx:84`): replace the `"Ordering soon"` /
  `"Sign in to order"` split with a real **Add to cart** control for
  everyone (Decision 3). Quantity stepper on the card, or add-then-adjust-
  in-cart — implementer's call; the simpler one is fine.
- Confirmation feedback on add (the card's own state is enough; no toast
  system exists and this plan does not add one).

### Step 3 — header badge

- `HeaderIcon.jsx` — gains an optional count badge; the cart icon stops
  being `disabled`.
- **`HeaderIcon` renders a `<button>`, not an anchor.** Do not wrap it in a
  `<Link>` — a `<button>` inside an `<a>` is invalid HTML and browsers
  handle it inconsistently. Two valid options: pass
  `onClick={() => navigate('/cart')}` (the component already accepts
  `onClick`, and honours it only when not `disabled`), or hand-roll a
  `<Link>` with the inline SVG the way the user icon already does at
  `MarketingHeader.jsx:41-45`. Prefer the `onClick` route — it uses the
  component's existing API and leaves one icon implementation, not two.
- `aria-label` must carry the count ("Cart, 3 items"), not the bare `type`.
- Badge renders only for anonymous visitors and `CUSTOMER`s (Decision 3),
  and only when `itemCount > 0`.

### Step 4 — `/cart`

- New `src/pages/customer-storefront/CartPage.jsx`, inside
  `StorefrontLayout` (`App.jsx:112-117`).
- Fetches `GET /api/products`, joins against cart lines, shows quantity
  controls, per-line and provisional subtotal (Decision 2).
- Drops lines whose product is no longer in the available catalogue, and
  says so.
- Empty state linking to `/menu`.
- Primary action: **Checkout** → `/checkout`, or `/login` when signed out.

**The sign-in return path must be handled, or checkout dead-ends.**
`App.jsx:25-27`'s `landingPathFor` sends a signed-in `CUSTOMER` to `/`, so
a visitor who clicks Checkout, signs in, and is dropped on the homepage has
to find their own way back — at the exact moment they had decided to buy.
Fix it in `LoginRoute` (`App.jsx:41-53`): accept a `returnTo` (a
`?returnTo=/checkout` query param, or router location state) and prefer it
over `landingPathFor` after a successful login. Guard it — only ever honour
an internal path beginning with a single `/`, never an absolute URL, or the
param becomes an open-redirect handed to anyone who can get a customer to
click a link.

### Step 5 — `/checkout` and confirmation

- New `src/pages/customer-storefront/CheckoutPage.jsx`. Signed-in
  customers only; redirect to `/login` otherwise.
- Order type toggle (PICKUP default), delivery address picker for DELIVERY
  (`GET /api/addresses`), instructions textarea (500 cap, matching
  `orders.js:34`), order summary, place-order button with a pending state.
- **Address dependency** — a customer who picks DELIVERY with no saved
  address must not hit a dead end. Two options:
  - **(a) Recommended** — extract the address form out of
    `MyProfile.jsx`'s `AddressesTab` into a shared
    `src/components/AddressForm.jsx`, used by both. The clear reason
    required by `PHASES-RULES-PLANNING.md` for touching working code: the
    alternative is the same validated form maintained in two places.
  - **(b) Smaller** — checkout only lists existing addresses and links to
    My Profile → Addresses. Less code, but it throws the customer into a
    different shell mid-checkout.
- Submit `POST /api/orders`. Handle 409/422 per Decision 5. On 201, clear
  the cart and navigate to confirmation.
- **Confirmation is its own route: `/order-placed/:orderId`**, inside
  `StorefrontLayout`. Named explicitly because the alternative — holding
  the 201 response in component state and swapping the view in place — puts
  the customer on a URL that shows nothing after a refresh, right where
  people screenshot and re-read. A real route survives reload and the back
  button.
  It reads the order with `GET /api/orders/:id` (already customer-scoped,
  `orders.js:99-105`) rather than trusting router state, so a refresh
  renders the same page. A customer opening someone else's order id gets
  that route's existing 404 for free.
- Confirmation view: order number, authoritative `totalAmount`, order type,
  and links to **My Orders** and **Pay now** (Decision 6).
- **Do not leave the cart cleared if the order failed.** Clear only after a
  201; a 409 must leave the cart exactly as it was so the customer can fix
  a quantity and retry.

### Step 6 — `requested_fulfillment_time` (optional, separately approved)

Only if Decision 8 is approved. Backend: accept and validate an optional
ISO timestamp in `POST /api/orders`, reject times in the past, insert it.
Mirror into `ordersExplanation.js` (byte-parity on executable code), add
tests to `orders.test.js`. Frontend: an optional datetime field on
checkout.

---

## Files affected

**New**
- `src/cart/CartContext.jsx`
- `src/pages/customer-storefront/CartPage.jsx`
- `src/pages/customer-storefront/CheckoutPage.jsx`
- `src/pages/customer-storefront/OrderPlacedPage.jsx`
- `src/components/AddressForm.jsx` (Step 5, option a)

**Modified**
- `src/App.jsx` — `CartProvider`, three storefront routes (`/cart`,
  `/checkout`, `/order-placed/:orderId`), and `LoginRoute`'s `returnTo`
  handling (Step 4)
- `src/pages/customer-storefront/MenuPage.jsx` — add-to-cart
- `src/components/MarketingHeader.jsx`, `src/components/HeaderIcon.jsx` — badge
- `src/pages/dashboard/MyProfile.jsx` — only if the form is extracted

**Deliberately untouched**
- Every file under `server/` (Steps 1-5). If a step seems to need a
  backend change, stop — either it belongs in Step 6, in follow-on work,
  or the design is wrong.
- `OrderManagement.jsx` / `PaymentBilling.jsx` — the post-checkout
  destinations already work (Step 0). Do not rebuild them.
- `FRONTEND-RULES.md`, `PROJECT_CONTEXT.md`, `PHASES-RULES-PLANNING.md` —
  these are the user's own documents. See Follow-on item 4.

---

## How to test

There is no frontend test harness in this project, and this plan does not
add one — that would be a new framework for a temporary UI, against
`FRONTEND-RULES.md`. **Say so plainly rather than implying coverage that
does not exist.** Verification is:

1. **Playwright, end to end** (the pattern already used for the IA work):
   anonymous adds to cart → cart survives sign-in → PICKUP checkout →
   order appears in My Orders with the right total → cancel it.
2. **DELIVERY path** — with a saved address, and with none (the dead-end
   case Step 5 exists to prevent).
3. **Stock conflict** — set a product's stock to 1 via the inventory
   screen, put 5 in the cart, check out, confirm the 409 renders as a
   readable message and never as `"Not enough stock for product 47."`
4. **Cart isolation** — sign in as `customer1`, add items, log out, sign in
   as `cashier1`, confirm no cart leaks and that staff get no cart UI at
   all; visiting `/cart` directly as `cashier1` lands on `/dashboard`.
5. **Guest-cart adoption, once** — add items anonymously, sign in, confirm
   they carry over; then log out and back in and confirm they do **not**
   reappear a second time (the cleared guest key, Decision 3).
6. **Return path** — click Checkout while signed out, sign in, and confirm
   the landing is `/checkout` with the cart intact, not `/`.
7. **Failed checkout keeps the cart** — force a 409 and confirm the cart
   still holds every line.
8. **Confirmation survives reload** — refresh `/order-placed/:id` and
   confirm it still renders.
9. **Responsive** — 390 / 820 / 1440 on `/cart`, `/checkout`, and
   `/order-placed/:id`; no horizontal overflow, no console errors.
10. **Backend regression** — `npm test` (308 tests) must stay green; Steps
    1-5 touch no server file, so any failure means something is wrong.
11. `npm run lint` and `npm run build`.

---

## Follow-on work (the smaller items, in order)

These are each small and independent. **Do them after checkout, not
before** — items 3 and 4 in particular would have to be redone once
checkout adds screens.

1. **Retire the delivery driver's fabricated Dashboard.**
   `DashboardHome.jsx` still shows a driver an invented "8 deliveries
   today". Two options: make it real from `GET /api/deliveries/mine`
   (`deliveries.js:150`), or — **recommended** — remove `'DELIVERY
   PERSONNEL'` from the `Dashboard` entry in `modules.js` and default them
   to Delivery Management, exactly as `CUSTOMER` was handled last session.
   A driver landing on their work queue beats landing on two numbers.
   This also lets `DashboardHome`'s `roleMetrics` object, its
   `primaryValue`/`primaryLabel` ternaries and the `'12'` fallback be
   **deleted entirely** — after it, every role reaching that component is
   `canSeeSummary`, and the last fabricated figures in the app are gone.

2. **Make `report_logs` readable.** Phase 8 recorded this as "an audit
   trail nobody can currently audit". Add `GET /api/reports/logs` —
   ADMIN-only, so it needs its own `requireRole('ADMIN')` override on the
   route because the router-wide guard at `reports.js:77` admits CASHIER
   too — joined to `admins` for the generator's name, paginated like the
   other list endpoints. Mirror into `reportsExplanation.js`, add tests to
   `reports.test.js`, and render it as a section on `ReportingAnalytics.jsx`.

3. **Responsive sweep of the remaining dashboard screens.** 390/820/1440
   across Product, Inventory, Staff, Customer, Payment & Billing,
   Delivery, and Reporting. Expected to be verification rather than rework
   — those tables are already inside `overflow-x-auto` wrappers — but it
   has never actually been checked, and the Brand-size bug found last
   session was exactly this class of thing.

4. **Document the established frontend patterns** — in a **new**
   `FRONTEND_PATTERNS.md`, *not* by editing `FRONTEND-RULES.md`. That file
   is written in the user's own voice as instructions to the assistant;
   it is theirs, and an assistant editing it turns a brief into a
   changelog. Worth recording: the role-dispatching component
   (`DeliveryManagement.jsx`, `OrderManagement.jsx`), the tabbed sub-nav
   (`InventoryManagement.jsx`, `MyProfile.jsx`), and now the cart context.

5. **Structured stock errors** (only if Decision 5's generic message
   proves insufficient in testing) — return `errors.productId` from
   `orders.js`'s 409/422 so checkout can pinpoint the offending line
   without string-parsing.

---

## Known gaps deliberately left open

- **No delivery fee, no minimum order.** Neither exists in the schema.
  Inventing one here would be a business rule invented by a UI.
- **No cart-level stock preview.** Decision 5 — the transaction is the
  only honest authority, and exposing stock on the public catalogue is a
  backend change made for the UI.
- **No promo codes, no order editing after placement.** Neither is in the
  roadmap. A placed order can be cancelled (`PLACED` only) and re-placed.
- **No toast/notification system.** `FRONTEND-RULES.md` lists it as an
  architectural concern, and every screen so far has used inline
  `role="status"` messages instead. Checkout follows suit rather than
  introducing a global one for a single flow.
- **Online payment remains unexercised against the real PayMongo API** —
  credentials still unset (carried forward from Phase 6.5). Decision 6's
  "Pay now" link inherits the existing, honest 503.
- **Carried forward, still open:** a `COMPLETED` order still cannot be
  refunded (deliberate, confirmed in the Phase 6 review); proof-of-delivery
  files have no customer-facing viewer (Phase 7); `report_logs` is
  write-only until follow-on item 2.
