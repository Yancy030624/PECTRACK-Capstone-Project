# UI_REVISIONS_PLAN.md — the four changes the panel asked for

Adviser/panel feedback from the UI inspection, in their order:

1. Take `LOGIN` out of the navbar links; reach login through the user
   **icon** only. Login becomes a **pop-up**, not a page — same design.
2. Hide the **cart** and **search** icons from visitors who are not signed
   in, and stop a signed-out visitor from adding to cart.
3. A customer who signs in lands on the **Menu**, and a customer's Menu is
   a **different screen** from the public one.
4. Apply **RBAC to the dashboard UI** for ADMIN / CASHIER / DELIVERY
   PERSONNEL / CUSTOMER. Admin sees everything; the cashier's access to
   Customer Management is cut back; Reporting & Analytics is reviewed
   per role.

   Resolved with the user on 2026-09-05: the cashier **keeps** Customer
   Management as read-only and loses only the edit (Decision 12);
   **Product Management** becomes ADMIN-only (Decision 13); Reporting &
   Analytics is **already correct** and changes nothing (Decision 14).

Items 1–3 are one change wearing three hats: they all move the sign-in
boundary from *checkout* to *the moment you try to order*. Item 4 is
independent and can be done first or last.

---

## Step 0 — Inspect: what already exists

Read this before changing anything. Several of these are already done, and
one of them is a trap.

### The header

`src/components/MarketingHeader.jsx` renders, in order:

- the `LOGIN` nav link — line 20, `{!user && <NavLink to="/login">}`. This
  is the one the panel wants gone.
- a **user icon** — lines 24–28. Already exists, already points at
  `/login` when signed out and `/dashboard` when signed in. Item 1 does not
  need a new icon built; it needs the text link deleted and this icon
  pointed at a modal instead.
- a **search icon** — line 23, `<HeaderIcon type="search" disabled />`.
  Visible to everyone and disabled for everyone.
- a **cart icon** — line 29, with a live count badge. Visible to everyone.

### Login

`src/pages/LoginPage.jsx` is a full page. Its useful part is the card at
lines 85–114 — a self-contained `max-w-179` two-column panel
(`WelcomePanel` + form). **That card is already modal-shaped.** Item 1 is
mostly a matter of lifting it out of the page's full-screen background
wrapper (lines 77–84) and rendering it in a dialog instead. The design does
not need redrawing.

The page also still carries the OTP second-step branch (lines 89–98). The
admin OTP requirement was switched off in `server/routes/auth.js`, so
`data.otpRequired` is never true today, but `POST /api/auth/verify-otp`
still exists and still works. Leave that branch alone — see Decision 5.

### The cart

`src/cart/CartContext.jsx` deliberately supports a **guest cart**:

- `canHaveCart(user)` is `!user || user.role === 'CUSTOMER'` (line 32) — a
  signed-out visitor is explicitly allowed one.
- storage key `pectrack.cart.guest` (line 5, via `storageKeyFor(null)`).
- on the signed-out → signed-in transition the guest cart is **adopted**
  into the customer's cart and the guest key deleted (lines 44–50).

`src/pages/customer-storefront/MenuPage.jsx:64` matches:
`canOrder = !user || user.role === 'CUSTOMER'`.

This is not an accident — it is `CHECKOUT_PLAN.md` Decision 3, written out
at length. **Item 2 reverses it.** See Decision 6 for why that is a
legitimate reversal and not the panel overruling a good decision.

### Routing and landing

`src/App.jsx`:

- `staffRoles` (line 17) is `['ADMIN', 'CASHIER', 'DELIVERY PERSONNEL']` —
  a **space**, not an underscore. That is correct: `auth.js:174` returns
  `user_type.replaceAll('_', ' ')`. Do not "fix" this to `DELIVERY_PERSONNEL`;
  it would silently break the delivery role's routing.
- `landingPathFor` (lines 18–20) sends a CUSTOMER to `/` — item 3 changes
  this to `/menu`.
- `RequireCustomer` (line 32) bounces to `/login?returnTo=<path>`, and
  `RegisterRoute` (line 61) navigates to `/login` after registering. Both
  depend on `/login` continuing to exist as a real route.

### Dashboard RBAC — already largely built

`src/pages/dashboard/modules.js` already carries a `roles` array per module
and `Dashboard.jsx:38` already filters the nav by it. There is no URL to
forge — `activeModule` is component state, only settable from the filtered
nav list — so module-level UI gating is genuinely effective.

`ReportingAnalytics.jsx:29` already splits tabs by role: ADMIN gets
`Report History`, CASHIER does not. This already matches the backend, where
`GET /api/reports/logs` is `requireRole('ADMIN')` (`reports.js:472`) while
the rest of the router is `ADMIN, CASHIER`.

So item 4 is smaller than it sounds. Most of it exists; what is missing is
listed in Decisions 12–15.

### Backend guards as they stand

| Route | Guard |
| --- | --- |
| `/api/customers` (whole router) | `ADMIN, CASHIER` — `customers.js:41` |
| `/api/reports` (whole router) | `ADMIN, CASHIER` — `reports.js:84` |
| `/api/reports/logs` | `ADMIN` — `reports.js:472` |
| `/api/payments` | `ADMIN, CASHIER, CUSTOMER` — `payments.js:215` |
| `/api/payments` POST | `CASHIER, ADMIN` — `payments.js:321` |
| `/api/orders` | `CUSTOMER, CASHIER, ADMIN` — `orders.js:68` |
| `/api/inventory` | `ADMIN, CASHIER`; approvals `ADMIN` — `inventory.js:105,236` |
| `/api/products` writes | `ADMIN` — `products.js:155` |
| `/api/deliveries` | `ADMIN, CASHIER, DELIVERY_PERSONNEL` — `deliveries.js:113` |
| `/api/staff` | `ADMIN` — `staff.js:45` |

### THE TRAP — read this before touching item 4

**`NewOrderForm.jsx:28` calls `apiGet('/api/customers')`.**

The cashier's counter-order screen (Phase 8, `COUNTER_ORDER_PLAN.md`)
loads the customer list so a cashier can attach a real customer to a
counter order — and a **DELIVERY order is impossible without one**
(`NewOrderForm.jsx:146–148`: the Delivery button is disabled until a
customer is chosen).

So: *"the cashier should not have Customer Management"* must **not** be
implemented by removing `CASHIER` from `customers.js:41`. Doing that
returns 403 to the counter-order screen, the customer dropdown silently
empties (line 28 swallows the error with `.catch(() => setCustomers([]))`),
and a cashier can no longer take a delivery order at all. It would look
like an unrelated Phase 8 regression days later.

Decision 12 says what to do instead.

---

## Decisions

### Decision 1 — the login modal is an ADDITION; `/login` stays a route

The pop-up becomes the normal way in. The `/login` **route does not get
deleted**, because three things still navigate to it:

- `RequireCustomer` → `/login?returnTo=/checkout` (`App.jsx:32`)
- `RegisterRoute` → `/login` after a successful registration (`App.jsx:61`)
- bookmarks, and the adviser's own browser history during the demo

Deleting the route to "finish" the migration would break all three for no
gain. A visitor who lands on `/login` directly still gets the full page;
everyone who clicks the icon gets the modal. Same form either way.

### Decision 2 — extract `LoginForm` once; render it in two shells

Do **not** copy the form into a modal component. Extract the credential
form + its state and handlers out of `LoginPage.jsx` into
`src/components/LoginForm.jsx`, then:

- `LoginPage.jsx` renders `<LoginForm>` inside its existing full-page
  background — visually unchanged.
- `LoginModal.jsx` renders the same `<LoginForm>` inside a dialog.

One copy of the auth logic. A bug fixed in the form is fixed in both.

`LoginForm` owns: username/password state, `showPassword`, `error`, the
OTP branch, `handleSubmit`, `handleOtpSubmit`, `cancelOtp`. It takes
`onLogin(user)` and `onRegister()` as props and knows nothing about
routing or modals.

### Decision 3 — modal state lives in `StorefrontLayout`, not in a global store

Only the storefront header opens the modal; the dashboard has no use for
it. So `StorefrontLayout` holds `const [loginOpen, setLoginOpen] = useState(false)`
and passes the opener down two ways:

- to `MarketingHeader` as a prop, for the user icon.
- to the routed pages via `<Outlet context={{ openLogin }} />`, read with
  `useOutletContext()` — this is how `MenuPage` will turn a guest's
  "Sign in to order" button into a pop-up instead of a navigation.

No new library, no new context provider. React Router already carries this.

### Decision 4 — one small generic `Modal.jsx`, not a modal library

`FRONTEND-RULES.md` asks for reusable components and no unnecessary
libraries, and this is the project's first dialog. Write a ~30-line
`src/components/Modal.jsx` that handles: fixed backdrop, centred panel,
Escape to close, click-backdrop-to-close, `role="dialog"` + `aria-modal`,
and focus moved into the panel on open. `LoginModal` is then just
`<Modal>` + `<LoginForm>`.

Keep it that small. Do not add portals, animation libraries, or a focus-trap
dependency — a capstone dialog does not need them.

### Decision 5 — leave the OTP branch in the form

`data.otpRequired` is currently unreachable (the ADMIN branch in
`auth.js` is switched off), but `/api/auth/verify-otp` is untouched and
still works. Deleting the client-side branch would be an unrelated change
that makes re-enabling a second factor a rebuild rather than a three-line
restore. Move it into `LoginForm` as-is.

### Decision 6 — reversing the guest cart is legitimate; record the reversal

`CHECKOUT_PLAN.md` Decision 3 argued a guest may fill a cart because a cart
"touches no endpoint and consumes no stock", and moved the sign-in wall to
the checkout button.

The panel wants the wall at the product card instead. That is **not** a
contradiction of `STOREFRONT_PLAN.md` Decision 3 — that decision said
"browse publicly, sign in to order", and specified "product cards show a
clear *Sign in to order* affordance". The current build drifted past it.
This change moves the codebase back onto the storefront plan's original
line, and the pop-up (Decision 1) removes the reason the wall was moved in
the first place: signing in no longer costs the visitor their page.

Because a written decision is being reversed, **update
`CHECKOUT_PLAN.md` Decision 3** with a short note saying it was superseded
here and why. Do not silently leave two plans disagreeing.

### Decision 7 — deleting the guest cart means deleting its machinery

Once guests cannot add to cart, `pectrack.cart.guest` is never written, and
the adoption logic in `CartContext.jsx:44–50` becomes unreachable. Delete
it rather than leaving it dormant:

- `canHaveCart` becomes `user?.role === 'CUSTOMER'`.
- the `wasSignedOut && isNowSignedIn` adoption branch, `guestKey`,
  `guestLines`, and the `removeCart(guestKey)` call all go.
- `storageKeyFor` loses its `?? 'guest'` fallback.

Leaving dead branches behind is how the next person concludes guest carts
are still supported.

**One consequence to accept knowingly:** a visitor who fills a cart, then
signs in, loses nothing — because they can no longer fill one before
signing in. There is no data-loss path to protect any more.

### Decision 8 — which icons show, for whom

| Icon | Signed out | CUSTOMER | ADMIN / CASHIER / DELIVERY |
| --- | --- | --- | --- |
| Search | hidden | shown | hidden |
| User | shown (opens modal) | shown (→ `/dashboard`) | shown (→ `/dashboard`) |
| Cart | hidden | shown, with badge | hidden |

Staff get no cart — that is `CHECKOUT_PLAN.md` Decision 3's staff rule,
which is **not** being reversed and is still right: a cashier's orders
belong in the dashboard's counter-order screen, not the storefront.

### Decision 9 — search: hide it now, implement it in Part 3 or not at all

The panel asked for search to be *hidden when signed out*. They did not ask
for search to be *built*. The icon is `disabled` today
(`CHECKOUT_PLAN.md` Decision 7 deliberately left it that way).

Minimum compliance: hide it for guests and staff, leave it disabled for
customers. That satisfies the request and ships nothing half-built.

**Recommended instead:** since Part 3 builds a customer-specific Menu
anyway, wire the icon to a client-side name filter on that screen — the
products are already all in memory (`MenuPage.jsx:11`), so this is a
`useState` and a `.filter()`, not a feature. A disabled icon sitting in a
signed-in customer's header invites the panel to ask about it next time.

Confirm which of the two you want before implementing — see Open questions.

### Decision 10 — the customer lands on `/menu`, but `returnTo` still wins

`landingPathFor` changes CUSTOMER from `/` to `/menu`. Keep
`LoginRoute`'s existing `returnTo ?? landingPathFor(user)` precedence
(`App.jsx:46,52`) exactly as it is: a customer bounced off `/checkout`
must return to `/checkout`, not be dumped on the Menu having forgotten
what they were doing.

The modal follows the same rule — after signing in from a pop-up, the
customer stays on the page they were already on. Only a login that began
at `/login` navigates anywhere.

### Decision 11 — one `/menu` route, two components, one data hook

"A different Menu for customers" is a **UI** difference, not a URL
difference. Keep the single `/menu` route and split the rendering:

```
MenuPage.jsx        container: fetches once, dispatches on role
├── PublicMenu      photo, name, variant, description, price,
│                   "Sign in to order" → opens the modal
└── CustomerMenu    the above + search filter + quantity stepper
                    + "Add to cart" + cart-aware state
```

Both are fed by one `useMenuData()` hook holding the
`Promise.all([products, categories])` fetch, the loading flag, the error
message, and the `sections` grouping — so the fetch and the category
jump-nav are written once.

Why not a separate `/shop` route: the header's MENU link would have to
change target per role, a guest bookmarking `/shop` would need bouncing,
and the codebase already has a settled convention for exactly this —
`OrderManagement` and `DeliveryManagement` are each one component that
dispatches on role internally (`modules.js:29–34, 41–45`). Follow it.

### Decision 12 — the cashier KEEPS Customer Management, read-only. Only the edit goes.

Superseded the original draft of this decision (hide the module entirely),
on the user's call — and the user's call is the better one. Reasoning,
because the paper will need it:

`GET /api/customers` **must** stay open to CASHIER, because
`NewOrderForm.jsx:28` needs it (the trap above). Given that, hiding the
nav entry would gate a screen whose data the cashier's session can fetch
anyway — cosmetic gating that a panel member can dismantle by asking "so
what actually stops them?". Read-only, by contrast, makes the nav match
the API exactly: the cashier can see what the API lets them see, and
cannot do what it does not let them do.

It is also the real counter workflow — looking up a customer's number
before attaching them to a delivery order is a cashier's job; *rewriting*
their record is not.

**This is already half-built.** `CustomerManagement.jsx:5` already computes
`const isAdmin = user.role === 'ADMIN'`, and line 134 already hides the
Deactivate/Activate button behind it. The **Edit** button at line 133 was
simply never given the same guard. The component was designed for this
split; one branch was missed.

Four coordinated changes:

1. **`CustomerManagement.jsx:133`** — wrap the Edit button in `isAdmin && `,
   exactly as line 135's toggle already is.
2. **`CustomerManagement.jsx:131–138`** — with both buttons gone for a
   cashier the `Actions` column is an empty column. Render the `<th>` and
   the `<td>` only when `isAdmin`, rather than leaving a blank column.
3. **`CustomerManagement.jsx:81`** — the subtitle reads "Search and manage
   customer records." For a cashier that is now untrue. Make it
   `isAdmin ? 'Search and manage customer records.' : 'Search customer records.'`
4. **`customers.js:53`** — `PATCH /:id` gains `requireRole('ADMIN')`. This
   is what makes the restriction real rather than a hidden button. Safe:
   `PATCH /:id` serves both the field edit and the isActive toggle, and the
   cashier is being denied both. No other cashier flow writes to a customer
   — counter orders write to `/api/orders`, and adding a delivery address
   at the counter goes to `/api/addresses`, which keeps CASHIER
   (`addresses.js:135`).

**`customers.js:41` stays `ADMIN, CASHIER`.** Add a comment there naming
`NewOrderForm.jsx:28` and saying the router-level read is load-bearing for
counter orders — otherwise someone reading "cashiers can't edit customers"
will try to tighten that line and take delivery orders down with it.

### Decision 13 — the role matrix (CONFIRMED against the paper)

The panel's "hierarchy of RBAC ... same scope in our thesis paper". The
user confirmed this table matches the paper, and resolved Product
Management to ADMIN-only.

| Module | ADMIN | CASHIER | DELIVERY | CUSTOMER | Change? |
| --- | :-: | :-: | :-: | :-: | --- |
| Dashboard | ✓ | ✓ | — | — | none |
| Staff Management | ✓ | — | — | — | none |
| Order Management | ✓ | ✓ | — | — | none |
| My Orders | — | — | — | ✓ | none |
| Customer Management | ✓ | read-only | — | — | **edit → ADMIN** (Decision 12) |
| Product Management | ✓ | ~~✓~~ | — | — | **cashier removed** |
| Inventory Management | ✓ | ✓ | — | — | none |
| Payment & Billing | ✓ | ✓ | — | ✓ | none |
| Delivery Management | ✓ | ✓ | ✓ | — | none |
| Reporting & Analytics | ✓ | ✓ (no Report History) | — | — | none — Decision 14 |
| My Profile | ✓ | ✓ | ✓ | ✓ | none |

**Product Management → `roles: ['ADMIN']`.** This fixes a real defect, not
just a permission: every write in `products.js` is already
`requireRole('ADMIN')` (lines 155, 188, 241, 279), so today a cashier can
open that screen and every button on it fails. It was neither read-only nor
hidden — it was broken.

**Verified safe.** `GET /api/products` sits *above*
`router.use(requireAuth)` and uses `optionalAuth` (`products.js:98–130`) —
it is public, because the storefront menu must load for signed-out
visitors. So removing the cashier's nav entry costs them nothing they need:
`NewOrderForm` still fetches the catalogue with prices, and stock levels
live in Inventory Management, which the cashier keeps. No backend change is
required for this one — `modules.js` alone.

### Decision 13a — why customers are read-only but products are hidden

The two answers differ, and a panel will ask why. The rule is **"does the
cashier's own workflow need this screen?"**:

- **Customers — yes.** A cashier must look up a customer to attach them to
  a delivery order (`NewOrderForm.jsx:28`, and Delivery is disabled without
  one). The read is load-bearing, so the screen stays and only the write
  goes.
- **Products — no.** The cashier already sees products with prices inside
  the order screen and stock levels in Inventory Management. The screen is
  redundant for them, and every action on it is admin-only anyway. So it
  goes entirely.

Stated once here so the paper can give one principle rather than two
unexplained exceptions.

### Decision 14 — Reporting & Analytics: cut tabs, do not build new screens

`tabsFor()` (`ReportingAnalytics.jsx:29`) is already the mechanism. The
panel's "customize it, appropriate pages per hierarchy" is a change to that
one line plus its tab guards — not a new cashier reporting screen.

Proposed:

| Tab | ADMIN | CASHIER | Why |
| --- | :-: | :-: | --- |
| Sales | ✓ | ✓ | a cashier needs the day's takings |
| Products | ✓ | ✓ | what is selling drives what to bake |
| Inventory | ✓ | ✓ | the cashier already raises restock requests |
| Transactions | ✓ | ✓ | the cashier **records** payments (`payments.js:321`) — hiding the log they created is inconsistent |
| Report History | ✓ | — | already ADMIN-only, backend-enforced |

Which is exactly what the code does today (`ReportingAnalytics.jsx:29`,
backed by `reports.js:472`). **CONFIRMED — item 4's reporting half is
already built. Change nothing.**

The honest answer to the panel is to *demonstrate* the cashier's view
(four tabs, no Report History) rather than to change anything. If Sonnet
finds itself editing `tabsFor()`, it has misread this decision.

### Decision 15 — DELIVERY PERSONNEL needs no change

That role sees exactly `Delivery Management` + `My Profile`, lands on the
former (`Dashboard.jsx:31`), and the backend admits it to
`/api/deliveries` only. It is already the tightest role in the system.
Do not invent work here to make item 4 look bigger.

### Decision 16 — the frontend gates presentation; the backend stays the authority

`FRONTEND-RULES.md` lines 75–85. Every nav change in Part 4 must be paired
with a check that the backend already enforces the same rule — that pairing
is the table in Decision 13 and the guard list in Step 0. Where the two
disagree, the backend wins and the nav is the thing that is wrong.

Hiding a module is a usability decision. It is not a security control, and
it should not be described as one in the paper.

---

## Implementation steps

Four parts. **Do them in order and stop after each** — Part 1 is a
prerequisite for Part 2's "Sign in to order" affordance, and Part 2's card
changes are where Part 3's split begins.

### Part 1 — the login pop-up

1. Create `src/components/Modal.jsx` per Decision 4.
2. Create `src/components/LoginForm.jsx`: move the state, the three
   handlers, and the JSX of `LoginPage.jsx:89–112` into it, props
   `{ onLogin, onRegister }`.
3. Rewrite `LoginPage.jsx` to keep its background wrapper + `WelcomePanel`
   and render `<LoginForm>`. Confirm `/login` looks unchanged.
4. Create `src/components/LoginModal.jsx` = `<Modal>` + `<WelcomePanel>` +
   `<LoginForm>`. On success: call `onLogin(user)`, close, stay put.
5. `StorefrontLayout.jsx`: hold `loginOpen`, render `<LoginModal>`, pass
   `openLogin` to `MarketingHeader` and through `<Outlet context={...}>`.
   It needs `user` and the app's `setUser` — thread `onLogin` down from
   `App.jsx`'s existing `setUser`.
6. `MarketingHeader.jsx`: delete the `LOGIN` NavLink (line 20). The user
   icon calls `openLogin()` when signed out, stays a `<Link to="/dashboard">`
   when signed in.
7. Leave `/login` and `/register` routes exactly as they are.

### Part 2 — the sign-in gate moves to the product card

1. `CartContext.jsx`: apply Decision 7 — `canHaveCart`, drop the adoption
   branch, drop the `'guest'` key fallback.
2. `MarketingHeader.jsx`: apply Decision 8's table. Cart and search render
   only for `user?.role === 'CUSTOMER'`.
3. `MenuPage.jsx`: `canOrder` becomes `user?.role === 'CUSTOMER'`. The
   guest branch renders a **"Sign in to order"** button calling
   `openLogin()` from `useOutletContext()`.
4. `App.jsx`: `/cart` is no longer reachable by guests — change
   `RequireCustomerOrGuest` to `RequireCustomer` on the `/cart` route and
   delete `RequireCustomerOrGuest` (it now has no callers).
5. Update `CHECKOUT_PLAN.md` Decision 3 with the supersession note.

### Part 3 — the customer's Menu

1. Extract `useMenuData()` from `MenuPage.jsx:10–25` into
   `src/pages/customer-storefront/useMenuData.js`.
2. Split the card: `PublicMenu.jsx` and `CustomerMenu.jsx` per Decision 11.
   `MenuProductCard`'s two branches become the two files' cards.
3. `MenuPage.jsx` becomes the container that calls the hook and dispatches
   on `user?.role`.
4. `App.jsx`: `landingPathFor` returns `/menu` for a customer.
5. Only if Decision 9's recommended option is approved: add the search
   filter to `CustomerMenu` and enable the header icon.

### Part 4 — dashboard RBAC

Decision 13's table is confirmed; this part is unblocked. It is the
smallest of the four.

1. `modules.js`: `Product Management` → `roles: ['ADMIN']`. Leave
   `Customer Management` as `['ADMIN', 'CASHIER']` — the cashier keeps the
   screen, read-only (Decision 12).
2. `CustomerManagement.jsx`: the four edits in Decision 12 — gate the Edit
   button on `isAdmin`, drop the Actions column for non-admins, adjust the
   subtitle.
3. `customers.js`: add `requireRole('ADMIN')` to `PATCH /:id`; leave the
   router guard at line 41 alone; add the comment naming
   `NewOrderForm.jsx:28`.
4. `customers.test.js`: two assertions — a CASHIER gets **403** from
   `PATCH /api/customers/:id`, and **200** from `GET /api/customers`. The
   second is the regression guard: it is what fails loudly if someone later
   "tidies up" line 41 and silently breaks counter delivery orders.
5. **Reporting & Analytics: change nothing.** Decision 14.

---

## Files affected

**New**
- `src/components/Modal.jsx`
- `src/components/LoginForm.jsx`
- `src/components/LoginModal.jsx`
- `src/pages/customer-storefront/useMenuData.js`
- `src/pages/customer-storefront/PublicMenu.jsx`
- `src/pages/customer-storefront/CustomerMenu.jsx`

**Changed**
- `src/pages/LoginPage.jsx` — renders the extracted form
- `src/components/MarketingHeader.jsx` — link removed, icons gated
- `src/pages/customer-storefront/StorefrontLayout.jsx` — modal + outlet context
- `src/pages/customer-storefront/MenuPage.jsx` — becomes a dispatcher
- `src/cart/CartContext.jsx` — guest cart removed
- `src/App.jsx` — `landingPathFor`, `/cart` guard, thread `onLogin` down
- `src/pages/dashboard/modules.js` — Product Management → ADMIN only
- `src/pages/dashboard/CustomerManagement.jsx` — Edit gated, Actions column
  and subtitle conditional
- `server/routes/customers.js` — `PATCH` → ADMIN, comment on the router guard
- `server/routes/customers.test.js` — the two assertions above
- `RULES-PLANS/CHECKOUT_PLAN.md` — Decision 3 supersession note

**Deliberately untouched**
- `server/routes/auth.js` — the modal is a client change; login is unchanged
- `server/routes/products.js` — writes are already ADMIN; `GET` must stay
  public for the storefront
- `ReportingAnalytics.jsx` — Decision 14, already correct
- everything for DELIVERY PERSONNEL — Decision 15

---

## How to test

Run `npm test` after Part 4 (it touches the server). Parts 1–3 are frontend
only — verify them in the browser, signed out and signed in.

**Part 1**
- Signed out, the header shows no `LOGIN` text link.
- Clicking the user icon opens the pop-up over the current page; the URL
  does not change.
- Escape closes it; clicking the backdrop closes it; the form inside looks
  like `/login`'s.
- Signing in from the pop-up on `/menu` leaves you on `/menu`, signed in.
- Visiting `/login` directly still renders the full page and still works.
- Registering still lands on `/login` and can still sign in.

**Part 2**
- Signed out on `/menu`: no cart icon, no search icon, and every card says
  "Sign in to order" — no quantity stepper.
- Clicking "Sign in to order" opens the pop-up.
- Navigating to `/cart` signed out redirects to login, not a blank cart.
- Signed in as `customer1`: cart icon returns, adding to cart still updates
  the badge, checkout still completes.
- Signed in as `cashier1`: no cart icon, no search icon on the storefront.
- In devtools → Application → Local Storage, `pectrack.cart.guest` is never
  created.

**Part 3**
- Signing in as `customer1` lands on `/menu`.
- Being bounced from `/checkout` and signing in returns to `/checkout`, not
  `/menu` — this is the regression Decision 10 exists to prevent.
- Signing in as `admin1` / `cashier1` / `delivery1` still lands on
  `/dashboard`.
- The public and customer menus visibly differ.

**Part 4**
- `cashier1` sees **no Product Management** entry; `admin1` still does.
- `cashier1` **does** still see Customer Management, can search it, and
  sees **no Edit and no Deactivate button** — and no empty Actions column.
- `admin1` sees Customer Management with both buttons, and editing still
  saves.
- **`cashier1` can still create a DELIVERY counter order with a customer
  attached** — Order Management → New Order → pick a customer → Delivery.
  If that dropdown is empty, the trap was not avoided; check that
  `customers.js:41` still admits CASHIER.
- `cashier1` opening Reporting & Analytics sees Sales / Products /
  Inventory / Transactions and no Report History.
- `PATCH /api/customers/:id` as a cashier returns 403.
- `npm test` passes.

---

## Open questions

Only one left. Decisions 13 and 14 were confirmed by the user
(2026-09-05): the role table matches the paper, Product Management is
ADMIN-only, Customer Management stays read-only for the cashier.

1. **Decision 9** — hide the search icon only, or build the client-side
   filter on the customer Menu? (Recommended: build it; the products are
   already in memory, so it is a `useState` and a `.filter()`. A disabled
   icon in a signed-in customer's header invites the panel's next
   question.)

---

## Known gaps deliberately left open

- **The pop-up does not replace the login page.** Decision 1. Two entry
  points to one form is the intended end state, not an unfinished migration.
- **No registration modal.** The panel asked about login. `/register` stays
  a page; the modal's "Create account" button navigates there and closes.
  Revisit only if asked.
- **UI role gating is not a security control.** Decision 16. The backend
  guards are, and they are listed in Step 0 so the paper can cite them.
- **Forgot-password still goes nowhere** (`LoginPage.jsx:105`, `href="#forgot"`).
  Pre-existing, out of scope here, and worth listing as a known gap in the
  paper rather than discovering it live during a demo.
