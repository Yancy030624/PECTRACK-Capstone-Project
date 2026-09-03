# Customer Storefront — implementation plan

This is the agreed design for the public customer storefront: **Home, Menu,
About, Contact**. Written before any storefront code exists, under the same
discipline as `PHASE5_PLAN.md` through `PHASE8_PLAN.md`.

It assumes the conventions already in this repo: React + Tailwind v4 on
Vite, Express 5 (async errors auto-forwarded), `node:test` against a real
database, one `*Explanation.js` study twin per real server file, and
`database/migrations/` for changing a database that already holds data.

---

## Why this is not "Phase 9"

`PHASES-RULES-PLANNING.md` lists nine phases and **every one of them is
backend**: database, backend foundation, auth/RBAC, core OMS, inventory,
payment, delivery, reporting, AI-assisted analytics. There is no storefront
phase, and that is not an oversight — the roadmap treats the frontend as the
thing the backend is eventually *consumed by*, which is why its own rule
asks, after each phase, to explain "how the frontend will eventually
communicate with it."

So this work is **not a numbered phase**, and it must not take the number 9.
Phase 9 is AI-Assisted Analytics and stays reserved for it — the roadmap
also says forecasting happens only if separately approved, and that decision
is still open. This document is `STOREFRONT_PLAN.md`, sitting alongside the
phase plans rather than inside their sequence.

Nothing in the numbered roadmap blocks this. The storefront consumes APIs
that Phases 3–6 already built and tested; Phase 9 is a separate, backend
concern that shares no files with it.

---

## The risk that makes this different

Phases 5–7 were about **writing correctly under concurrency** — claim
patterns, row locks, lock ordering. Phase 8 was about **a report that is
confidently wrong**. This one is different again, and the difference is the
whole reason to plan it rather than start typing:

> **This is the first code in PECTRACK that a stranger can reach without
> logging in.**

Every route in this system today sits behind `requireAuth`. Verified, not
assumed: `server/routes/products.js:74` and `server/routes/categories.js:20`
both open with a blanket `router.use(requireAuth)`. The only unauthenticated
endpoint in the entire app is PayMongo's webhook, which authenticates by
signature instead (`PHASE6.5_PLAN.md`, Decision 6).

A public storefront changes that. The failure mode here is not a deadlock
and not a wrong number — it is **exposure**: showing a stranger something
that was only ever meant for a signed-in user, or letting one *do*
something. That is what every decision below is shaped around.

---

## What is already true before this work starts

Checked against the code, not assumed:

- **Product and category reads are fully auth-gated.** `router.use(requireAuth)`
  covers every route in both files. A logged-out visitor currently cannot
  read the menu at all. **This is the one blocking fact**: a public Menu
  page is impossible without a deliberate backend change.
- **`GET /api/products` already has exactly the right restriction for a
  public viewer.** `products.js:80` restricts `CUSTOMER` callers to
  `availability_status = TRUE`, and `GET /:id` returns 404 (not 403) for a
  hidden product, so it never confirms one exists. That is precisely the
  rule an anonymous visitor needs.
- **`mapProductRow` exposes nothing sensitive** — id, categoryId,
  categoryName, name, description, price, variant, availabilityStatus. **No
  stock, no cost, no supplier.** Stock lives in `inventory` and is only
  reachable through `/api/inventory`, which is staff-only.
- **Ordering is identity-bound and cannot be made anonymous casually.**
  `POST /api/orders` is `requireAuth` + `requireRole('CUSTOMER','CASHIER')`,
  and it resolves the customer **from the session**, never from the body —
  the code says so: "never trust a customerId claiming to be someone else."
  The nullable `orders.customer_id` is for a **cashier's walk-in order at
  the counter**, not for an anonymous web visitor.
- **There is no router.** `src/App.jsx` switches screens with
  `useState('login' | 'register')` and gates the dashboard on `user`. Every
  screen lives at `/`.
- **A marketing shell partly exists already.** `MarketingHeader.jsx` has a
  HOME / PRODUCTS / LOGIN nav — with `#home` and `#products` anchors that
  currently lead nowhere — plus decorative search / user / cart icons.
  `WelcomePanel.jsx` and `Brand.jsx` carry the green-and-gold brand
  treatment. The storefront's visual language is partly designed; it is the
  destinations that are missing.
- **There is no product image anywhere.** Not in the schema, not in
  `mapProductRow`, not in `ProductManagement.jsx`. Grepped for
  `image|photo|picture` across migrations and routes: zero hits.
- **The asset pipeline is broken in production builds.** `Brand.jsx:8` and
  `WelcomePanel.jsx:15` both use `src="/src/assets/logo-circle.png"` — a raw
  string. Vite only fingerprints assets reached through an `import` (or
  served from `public/`), so that path is copied verbatim into the bundle
  and **no image is emitted to `dist/` at all**. Confirmed: the built JS
  contains the literal string, and `dist/assets/` holds no images. The logo
  works in `npm run dev` and 404s in any real deployment.
- **Phase 7 already solved "a file on disk, served through an endpoint"**
  (`server/lib/storage.js`: `saveProofFile` / `proofFilePath` /
  `deleteProofFile`, with an upload size cap and a 413 handler in `app.js`).
  It is proof-of-delivery-specific today, but the pattern is proven.
- **Scope discipline from `PROJECT_CONTEXT.md`:** "We are building an OMS,
  NOT a POS." A storefront where customers browse and order is squarely
  OMS. A full e-commerce platform is not.

---

## Scope

**In scope**

- Four public pages: **Home, Menu, About, Contact**.
- Client-side routing, so those pages have real, linkable URLs.
- A public read path for the catalogue — the minimum backend change that
  makes a Menu page possible.
- Keeping the storefront reachable for a signed-in CUSTOMER, instead of
  trapping them in the staff dashboard the moment they log in.
- Fixing the production asset bug, because a storefront is image-led and
  building one on a broken pipeline is pointless.

**Explicitly out of scope**

- **Cart and checkout.** The four pages the user asked for are browsing and
  marketing. Cart → checkout touches money and stock and deserves its own
  plan, exactly as `PHASES-RULES-PLANNING.md` demands ("Do not implement
  multiple large modules simultaneously. Build one logical feature at a
  time."). The Menu is *built toward* it — see Decision 6 — but does not
  contain it.
- **Guest checkout.** See Decision 3. Ordering stays identity-bound.
- **A contact form that submits.** See Decision 7.
- **SEO, server-side rendering, meta tags, sitemaps.** This is a capstone
  OMS demonstrated on a laptop, not a site competing for search traffic.
- **A CMS for the Home/About copy.** The bakery's story is static text in a
  component. A database-backed content editor is a whole feature nobody
  asked for.
- **Anything predictive.** Still Phase 9, still undecided.

---

## Decisions

### Decision 1 — add `react-router-dom`, and this is the clear reason the rules ask for

`PHASES-RULES-PLANNING.md` says: "DO NOT add technologies, frameworks,
libraries, or architectural patterns unless there is a clear reason." That
rule has already been applied twice in this project's history, in both
directions — `chart.js` was adopted because the paper named it, and
`react-chartjs-2` was refused because it wrapped something already
justified. So the question is honest, not rhetorical.

The reason here is that **a storefront without URLs is broken in ways a
customer will notice immediately**:

- You cannot send anyone a link to the menu. Not to a classmate, not to the
  panel, not to the bakery owner. Everything is `/`.
- The browser **back button leaves the application entirely**. A customer
  who taps Menu, then a product, then Back, is thrown out of the site.
- Refreshing any page returns you to the login screen.

The alternative is not "no dependency" — it is *hand-rolling* `history.pushState`
and a `popstate` listener, then discovering you also need link interception
and route params. That is more code and more bug surface than the
dependency, which inverts the usual argument: here the hand-rolled version
is the over-engineered one. `react-router-dom` is the React ecosystem's
standard answer, not an exotic pick.

**Deployment note, stated now so it is not discovered later:** a client-side
router needs the host to serve `index.html` for unknown paths. Vite's dev
server does this automatically; a static production host needs an SPA
rewrite rule. Worth knowing before the first deploy, not during it.

### Decision 2 — the public catalogue EXTENDS the existing endpoint; it is not a second one

A Menu page needs products without a session. Two ways:

- **(a)** A new public router, e.g. `GET /api/storefront/products`.
- **(b)** Let `GET /api/products` serve an anonymous caller.

**Choose (b)**, and the precedent is this project's own. `PHASE8_PLAN.md`,
Decision 5 faced the identical shape for transaction history and chose to
extend `GET /api/payments` rather than add a second list, for a reason that
transfers exactly:

> "two payment lists that could quietly drift on who is allowed to see what"

Two product lists could drift the same way, and the drift would be worse
here because one of them is public. So: **one endpoint, one place where
"who sees what" is decided.**

The mechanism is a small sibling to `requireAuth` in `server/lib/auth.js`:

```js
// Populates request.user when a valid session cookie is present and
// otherwise does nothing. Never rejects — the caller decides what an
// anonymous request is allowed to see.
export async function optionalAuth(request, response, next) { … }
```

and then, in `products.js`, the rule that governs the whole storefront:

> **An anonymous visitor sees exactly what a signed-in CUSTOMER sees, and
> never one field more.**

Concretely, `!request.user || request.user.role === 'CUSTOMER'` takes the
already-existing restricted branch — available products only, 404 for hidden
ones. Anonymous is not a new, looser view; it is the *most restricted view
that already exists*.

**Route ordering is load-bearing here**, exactly as it is for PayMongo's
webhook in `payments.js`. Express matches within a router in registration
order, and `router.use(requireAuth)` applies to everything after it. Only
`GET /` and `GET /:id` move above that line. `POST`, `PATCH`, and `DELETE`
stay below it and stay `requireRole('ADMIN')`. Getting this wrong makes the
catalogue publicly writable, which is why the test checklist pins it
explicitly rather than trusting the reading.

`GET /api/categories` gets the same treatment, for the same reason: a Menu
grouped by category needs the category names, which contain nothing private.

### Decision 3 — browse publicly, sign in to order. No guest checkout.

An anonymous visitor may read the catalogue and nothing else. To place an
order they register or log in.

This is not laziness, and the alternative was considered properly. Guest
checkout would mean opening `POST /api/orders` — a route that **deducts
stock inside a transaction** (Phase 5's single deduction trigger) — to
unauthenticated callers. That hands a stranger the ability to consume real
inventory with no identity, no rate limiting, and no way to contact them
about the order. The existing code deliberately resolves the customer from
the session and refuses to trust a `customerId` in the body; guest checkout
would require unpicking exactly that guard.

`orders.customer_id` being nullable does not change this. That nullability
exists so a **cashier** can record a walk-in at the counter, where a real
human is present and a staff account is accountable for the row. It is not
a latent anonymous-ordering feature waiting to be switched on.

The storefront's job is to make signing in feel like a natural step rather
than a wall: product cards show a clear "Sign in to order" affordance, and
the login page already exists and looks the part.

### Decision 4 — fix the asset pipeline before building on it

`Brand.jsx` and `WelcomePanel.jsx` reference `/src/assets/logo-circle.png`
as a raw string. That works in dev and produces a 404 in every production
build, because Vite never sees a reference it can fingerprint and emits no
image at all.

The fix is two lines — `import logoCircle from '../assets/logo-circle.png'`
and use the imported URL — and it must happen **first**, because this plan
adds an image-led storefront and, later, product photography. Building a
visual storefront on a pipeline that silently drops images in production is
the kind of thing that is discovered the night before a defense.

This is a pre-existing bug, found while planning. It is in scope because the
storefront depends on it, not because it was on anyone's list.

### Decision 5 — product images are a SEPARATE, LATER step, and the Menu works without them

A bakery menu wants photographs, and the photos exist. But there is no image
column, no upload endpoint, and no admin UI for one — so images are not a
detail of the Menu page, they are a feature: a schema migration, an
admin-only upload with size and type validation, file cleanup when a product
is deleted, and orphan handling.

`PHASES-RULES-PLANNING.md` is explicit — "Build one logical feature at a
time" — and the schema rules are explicit too: "DO NOT change database
tables… without explaining why first."

So the Menu is built to look **deliberate without photos**, using a branded
placeholder tile, and images land afterwards as their own small step (Step 5
below) with the schema change presented for approval on its own terms. This
also gets a working storefront in front of the user sooner, which is the
point of building incrementally.

When that step comes, the shape is already proven: a nullable
`products.image_key`, an ADMIN-only upload, and the file served through an
endpoint — the same arrangement `lib/storage.js` and Phase 7's
proof-of-delivery already use, rather than a new idea.

### Decision 6 — the Menu is built toward a cart without containing one

Cart and checkout are out of scope, but "out of scope" must not mean "left
in a state that has to be torn up."

`POST /api/orders` already takes `items: [{ productId, quantity }]` — a cart
shape. So the Menu renders product cards that carry everything a cart line
would need, with the ordering affordance present but pointing at sign-in.
When cart/checkout gets its own plan, it adds state and a checkout screen
around cards that already exist, rather than replacing them.

The decorative cart icon in `MarketingHeader.jsx` stays decorative and is
not wired to anything in this work. An icon that looks clickable and does
nothing is worse than one that is plainly ornamental, so it should either
be hidden until the cart exists or visibly disabled — a small call for
implementation, noted so it is not left half-alive.

### Decision 7 — Contact is real information, not a form

A contact form implies a table to store submissions, an endpoint that
accepts unauthenticated writes, spam handling, and somewhere for the
messages to actually go. That is a new public write surface — the exact risk
this document is organised around — built for a requirement that appears
nowhere in the roadmap.

The Contact page presents the bakery's real details: address in Lucban,
Quezon, phone, opening hours, and a link to email or message. Genuinely
useful, and honest about what the system does.

Recorded as a known gap, so a form is a later decision rather than an
oversight.

### Decision 8 — a signed-in CUSTOMER lands on the storefront; staff land in the dashboard

Today `App.jsx` does `if (user) return <Dashboard … />`, so logging in drops
every role into the sidebar dashboard. For a customer that is the wrong
building: `OrderManagement.jsx` says so in its own header comment —
customer-facing ordering "is intentionally NOT here — that's planned as a
separate storefront shell later, not this admin-style dashboard."

After this work:

- **ADMIN / CASHIER / DELIVERY PERSONNEL** — unchanged. They log in and get
  the dashboard, exactly as now.
- **CUSTOMER** — lands on the storefront, with their account area (order
  history, addresses, profile) reachable from it.
- **Anonymous** — the storefront, with sign-in offered.

This touches working session-gating code, so it is deliberately the smallest
change that achieves it: a role check at the routing boundary, not a rewrite
of `App.jsx`'s session lifecycle. The customer's existing dashboard screens
(Order Management, Address Book, Payment & Billing, My Profile) keep working
and keep their current URLs under the account area — nothing is deleted.

---

## Schema changes

**None in Steps 1–4.** The storefront reads what already exists.

One is proposed for **Step 5 only**, presented separately for approval:
`products.image_key VARCHAR NULL`. It is additive, nullable, and changes no
existing behaviour. It does not ship until it is approved on its own terms.

---

## The patterns that matter

### Pattern L — anonymous is the most restricted EXISTING view, never a new one

```js
// RIGHT: anonymous reuses the branch that already exists for the least
// privileged signed-in role. A field added to the customer view is
// consciously a public field; nothing can leak by being forgotten.
const restrictToAvailable = !request.user || request.user.role === 'CUSTOMER'

// WRONG: a parallel "public" mapper that starts as a copy and drifts.
const publicProduct = (row) => ({ id: row.product_id, name: row.product_name, … })
```

The second version looks *safer* — it names its fields explicitly — and is
the more dangerous of the two over time, because two mappers over one table
drift, and only one of them is public.

### Pattern M — the auth boundary is a line in a file, and its position is the security control

```js
router.get('/', optionalAuth, …)     // public read
router.get('/:id', optionalAuth, …)  // public read
router.use(requireAuth)              // ← everything below needs a session
router.post('/', requireRole('ADMIN'), …)
```

Express matches in registration order. Moving the `router.use(requireAuth)`
line, or adding a route above it by accident, silently changes who can write
to the catalogue. This is the same load-bearing ordering that
`payments.js` documents at length for the PayMongo webhook, and it is tested
directly rather than trusted: the checklist below asserts that an anonymous
`POST` is still refused.

---

## Data flow

**A stranger opens the site:**

```
GET /                      -> Home (brand, hero, a few featured items)
GET /menu                  -> GET /api/products   (no cookie)
                              -> optionalAuth attaches no user
                              -> restricted branch: availability_status = TRUE
                              -> no stock, no cost, ever
                           -> GET /api/categories (no cookie) for grouping
GET /about, GET /contact   -> static, no API calls
```

**A stranger tries to order:**

```
Product card -> "Sign in to order" -> /login -> existing auth flow
POST /api/orders without a session -> 401, unchanged
```

**A customer signs in:**

```
CUSTOMER  -> storefront, account area reachable (orders, addresses, profile)
STAFF     -> dashboard, exactly as today
```

---

## Files affected

**New**

- `src/pages/customer-storefront/StorefrontLayout.jsx` — shared header/footer shell
- `src/pages/customer-storefront/HomePage.jsx`
- `src/pages/customer-storefront/MenuPage.jsx`
- `src/pages/customer-storefront/AboutPage.jsx`
- `src/pages/customer-storefront/ContactPage.jsx`
- `database/migrations/007_product_image.sql` — Step 5
- `STOREFRONT_PLAN.md` — this document

**Modified**

- `server/lib/auth.js` + twin — add `optionalAuth`
- `server/lib/storage.js` + twin — renamed `saveProofFile`/`proofFilePath`/
  `deleteProofFile` to `saveFile`/`filePath`/`deleteFile` once product
  images became a second caller alongside `server/routes/deliveries.js` +
  twin + test (Step 5) — mechanical rename, same mechanism, not a rewrite
- `server/routes/products.js` + twin + `products.test.js` — public reads
  (Step 2) and the image upload/serve/delete routes (Step 5)
- `server/routes/categories.js` + twin + `categories.test.js` — public reads
- `src/App.jsx` — routing, and Decision 8's landing rule
- `src/components/Brand.jsx`, `src/components/WelcomePanel.jsx` — asset fix
- `src/components/MarketingHeader.jsx` — real nav destinations
- `src/components/HeaderIcon.jsx` — a `disabled` state for Decision 6's
  visibly-inert cart/search icons
- `src/pages/dashboard/ProductManagement.jsx` — the admin photo upload UI
- `package.json` — `react-router-dom`

Renamed post-plan, same content: `src/pages/storefront/` →
`src/pages/customer-storefront/`.

**Deliberately untouched**

- `POST /api/orders` and every write path. This work adds no write surface.
- The dashboard screens. Staff experience is unchanged.
- `lib/billing.js`, `lib/reporting.js`, and everything Phases 5–8 built.

---

## Build order

**Step 1 — the asset fix.** Two imports. Independently verifiable with
`npm run build` plus a check that an image now lands in `dist/assets/`.
Nothing else is built on a broken pipeline.

**Step 2 — `optionalAuth` and the public catalogue reads.** Backend only,
fully testable before a single page exists. This is the step where the
security properties are established, so it comes before anything that
depends on them.

**Step 3 — routing and the storefront shell.** `react-router-dom`, the
layout with a real nav, and Decision 8's landing rule. Staff login must be
re-verified here — it is the one existing flow this step can break.

**Step 4 — the four pages.** Home, Menu, About, Contact. Menu is the only
one that talks to an API; the other three are content. Build Menu first, so
the API work from Step 2 is exercised early.

**Step 5 — product images.** Migration 007 (`products.image_key`), an
ADMIN-only upload/replace/remove endpoint sharing `lib/storage.js` with
Phase 7's proof-of-delivery photos (renamed `saveFile`/`filePath`/
`deleteFile` once it gained a second caller), a public `GET
/:id/image` that applies the exact same hidden-product rule `GET /:id`
already does, and an admin upload UI in `ProductManagement.jsx`.

**Done.** Real photos and prices came from the bakery's own price-list
photos (`C:\Product-pics`, 40 images: two full poster sheets plus 38
per-item marketing shots) — 41 products across 5 real categories (Breads,
Ensaymada, Pastries & Sweet Rolls, Broas & Ladyfingers, Crackers &
Biscuits), 39 of them photographed, replacing the stale test debris that
had accumulated in `products`/`categories` from interrupted `npm test`
runs. The bakery's real address and phone number, read off its own
product packaging, replaced the placeholder contact details on the
Contact page and the storefront footer. Two Pandesal rows (Big/Small)
ship without a dedicated photo — the poster's grid photo is far lower
resolution than the 38 individual shots, and a single blurry tile would
have stood out against 39 sharp ones — and simply show the Menu's
placeholder tile until better photos exist, exactly as designed.

---

## Testing checklist

Backend changes are tested with `node:test` against the real database, in
the existing `products.test.js` and `categories.test.js`. The frontend is
verified the way Phases 7 and 8 were — driving the real app in a browser —
because this project has no frontend test framework, and adding one would be
adding a technology without a clear reason.

**The exposure tests — the ones this work exists to justify**

- An anonymous `GET /api/products` returns **200** and contains only
  available products.
- An anonymous response is **field-identical to the CUSTOMER response** for
  the same product. This is the test that catches a future field leaking
  into public view.
- The response contains **no stock and no cost** fields, asserted by name.
- An anonymous `GET /api/products/:id` for an **unavailable** product
  returns **404**, not 403 and not the product.
- An anonymous `POST`, `PATCH`, and `DELETE` on `/api/products` each still
  return **401**. This is Pattern M's guard: it fails loudly if the
  `router.use(requireAuth)` line ever drifts.
- A CASHIER and an ADMIN still see the **full** catalogue including
  unavailable items — the existing behaviour is unchanged.
- `GET /api/categories` gets the same anonymous-read and
  anonymous-write-refused pair.
- **The whole existing `products.test.js` and `categories.test.js` still
  pass**, unmodified where possible. These are routes with working tests;
  breakage is the change being visible, and the question is whether the
  change is right.

**Frontend verification (live browser)**

- Every nav destination loads, and the browser **back button** moves between
  storefront pages rather than leaving the app.
- A **direct visit to `/menu`** with no session renders products — the whole
  point of Step 2.
- Refreshing on `/about` stays on `/about`.
- A CUSTOMER logs in and lands on the storefront, with their account area
  reachable.
- **An ADMIN logs in and still lands on the dashboard** with all nine
  modules — the regression Step 3 is most likely to cause.
- `npm run build` emits the logo into `dist/assets/`, and the built app
  shows it.

### On writing these tests

The lesson that keeps being relearned in this project: **break each fix and
watch the test go red before trusting it.** Phase 8's review found a test
that passed against deliberately broken code, and its own plan records two
more from Phase 5 and one from Phase 6.5.

This work has a specific version of that trap. A test asserting "the
anonymous response contains only available products" **passes when the
endpoint is correct and also when it returns an empty array** — including
when it is broken enough to return nothing at all. So assert on **known
products by name**: one available product that must be present, one
unavailable product that must be absent. Never on a count, and never on
"it returned an array."

---

## Known gaps deliberately left open

- **No cart, no checkout.** The next plan, and the natural one.
- **Two Pandesal variants (Big/Small) have no dedicated photo** — every
  other product in the seeded catalog does. Genuinely blocked on a real
  photo existing, not on any code.
- **Contact is information, not a form** (Decision 7).
- **Home and About copy is static in a component.** Editing the bakery's
  story means editing a file. A CMS is a real feature and nobody has asked
  for one.
- **No SEO or server-side rendering.** Out of scope for a capstone OMS.
- **The header's cart and search icons stay decorative** until the features
  behind them exist (Decision 6).
- **Carried forward, still open:** PayMongo credentials are still not wired
  in, so the gateway path is unexercised against the real API (Phase 6.5); a
  `COMPLETED` order still cannot be refunded (a deliberate rule confirmed in
  the Phase 6 review); proof-of-delivery files are on local disk with no
  customer-facing viewer (Phase 7); `report_logs` is written but nothing
  reads it (Phase 8 review).
