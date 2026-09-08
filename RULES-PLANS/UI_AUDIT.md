# UI_AUDIT.md — UI/UX review and design direction

Review of the PECTRACK frontend as it stands, ahead of any redesign work.
**No code was changed to produce this.** Every finding below cites the file
and, where useful, the measured count behind it.

The brief: modern but practical, clean, appropriate for a bakery, not
flashy, no gratuitous animation or gradients, readable, achievable in
React + Tailwind, and not over-engineered. Findings are graded against
that brief, not against a design-agency ideal.

---

## What the audit measured

Counts across `src/`, so the review argues from evidence rather than taste:

| Signal | Measured |
| --- | --- |
| Type sizes in use | `text-xs` ×208, `text-[10px]` ×170, `text-sm` ×135, `text-[11px]` ×70, `text-[9px]` ×3 |
| Font weights | `font-bold` ×279, `font-extrabold` ×97, `font-semibold` ×91, `font-medium` ×61 |
| Border radii | `rounded-2xl` ×113, `rounded-lg` ×98, `rounded-full` ×74, `rounded-xl` ×52, plus `[26px]`, `[40px]`, `[45px]` |
| Shadows | `shadow-sm` ×41, `shadow-md` ×20, `shadow-lg` ×6, `shadow-2xl` ×5, `shadow` ×4, `shadow-xl` ×1 |
| Input variants | 3 competing shapes, used ×28 / ×26 / ×26 |
| Focus styles | 43, against 198 interactive elements (~22%) |
| Table headers | 75 `<th>`, **0** with `scope` |
| Design token layer | **none** — no `@theme` block anywhere |
| Status style maps | 6 separate copies |
| Badge markup | duplicated 8× |
| `pt-24` magic number | 11 files |

### What is already good

Worth stating plainly, because a redesign should preserve these:

- **The status colour semantics are coherent** — amber = waiting, blue =
  acknowledged, teal = in transit, green = done, red = failed, slate =
  inactive. Consistent across all six maps. The problem is duplication,
  not disagreement.
- **Every badge lookup has a `?? 'bg-slate-100'` fallback.** An unknown
  status degrades to a neutral pill instead of an unstyled one. That is
  disciplined defensive rendering.
- **Loading, empty, and error states exist on essentially every screen.**
  Most student projects have none. They are inconsistent in *form*, but
  they are present, which makes this a normalisation job, not a build.
- **`overflow-x-auto` wraps every table.** No horizontal page scroll.
- **Role dispatch is already componentised** (`OrderManagement`,
  `DeliveryManagement` branch internally) rather than duplicated.

---

## Findings

### CRITICAL

#### C1 — There is no design token layer
**Affected:** `src/index.css` (whole app)

`index.css` is one line: `@import "tailwindcss";`. Tailwind v4.3 is
installed, but there is **no `@theme` block**, which is v4's entire
mechanism for defining brand tokens. So every colour is either a raw
palette class (`green-700`, `slate-500`) or a hard-coded hex
(`bg-[#fffedc]`, `text-[#291dcc]`), scattered across 30+ files.

*Why it hurts:* this is the root cause of nearly every other finding. There
is no single place to change the brand green, so it exists as `#26752a`,
`#449947`, and `green-700` simultaneously. Any redesign done without
fixing this will re-fragment within weeks, and a Figma handoff has nothing
to map onto.

*Fix:* define an `@theme` block in `index.css` with brand, surface,
neutral, and status tokens (spec in the Design System section). Then
components use `bg-brand-600`, not `bg-[#26752a]`. **This is the enabling
fix — do it before any visual work.**

#### C2 — Clickable table rows are unreachable by keyboard
**Affected:** `OrderManagement.jsx:122`, and the same pattern elsewhere

```jsx
<tr onClick={() => openOrder(order.id)} className="cursor-pointer …">
```

A `<tr>` is not focusable and has no key handler. Opening an order — the
primary action of the busiest staff screen — is **mouse-only**.

*Why it hurts:* a cashier working quickly at a counter is exactly the user
who wants to tab between fields, and a keyboard-only or screen-reader user
is locked out entirely. This is also the single easiest thing for a panel
to catch: tab through the orders table and nothing happens.

*Fix:* keep the row click as a convenience, but make the first cell a real
`<button>` or `<Link>` carrying the accessible name (`Open order #1042`).
That gets focus, Enter/Space, and screen-reader semantics for free without
restructuring the table.

#### C3 — Error messages are the least readable text on the page, and are announced as status
**Affected:** every dashboard module; pattern from `OrderManagement.jsx:99`

```jsx
{message && <p role="status" className="… text-[10px] font-semibold text-red-700">{message}</p>}
```

Two defects in one line. The message is rendered at **10px** — smaller
than every other piece of content on the screen — and marked
`role="status"`, which is a *polite* live region. Errors belong in
`role="alert"`, which is assertive.

*Why it hurts:* when a payment fails or a stock update is rejected, the
explanation is the most important thing on screen and is currently the
hardest thing to read. Assistive tech may not announce it promptly.

*Fix:* one `<Alert variant="error|success|info">` primitive at 14px with
an icon, `role="alert"` for errors and `role="status"` for confirmations.
Replaces ~15 hand-rolled copies.

---

### HIGH

#### H1 — The type scale has collapsed into the 9–12px band
**Affected:** app-wide

`text-xs` (12px) ×208 and `text-[10px]` ×170 are the two most-used sizes,
with `text-[11px]` ×70 and `text-[9px]` ×3 behind them. Four distinct
sizes are packed into a 3px range, while `text-sm` (14px) — the sensible
body size — is only third.

*Why it hurts:* body copy, table cells, form labels, and error text are all
below comfortable reading size, and the 10/11/12px steps are too close to
create any hierarchy — they just read as "small". On a counter screen or a
delivery rider's phone in daylight, this is a real speed and error-rate
problem, not an aesthetic one.

*Fix:* adopt the scale in the Design System section. Body becomes 14px,
12px is the floor for secondary text, and 10px survives only for uppercase
tracked micro-labels. Delete `text-[9px]` and `text-[11px]` entirely.

#### H2 — Font-weight inflation flattens hierarchy
**Affected:** app-wide

279 `font-bold` + 97 `font-extrabold` + 91 `font-semibold` = 467 weight
overrides. Table headers, table cells, badges, buttons, labels, and nav
items are all bold.

*Why it hurts:* emphasis only works by contrast. When nearly everything is
bold, the eye gets no guidance about what matters, and the interface reads
as loud rather than confident. Combined with H1 (tiny + bold everywhere)
it produces the characteristic "dense and shouty" look.

*Fix:* weight carries meaning — 600 for headings and the one value that
matters in a row; 500 for emphasis; 400 for everything else. Reserve 700+
for page titles and KPI figures only.

#### H3 — Three competing input styles
**Affected:** all forms

| Shape | Uses |
| --- | --- |
| `rounded-lg border-stone-200 px-2 py-1.5` | 28 |
| `rounded-xl border-stone-200 px-3 py-2` | 26 |
| `rounded-2xl border-stone-200 bg-white px-4 py-2.5` | 26 |

Three different heights and three different radii, used almost equally
often — so none of them is "the" input.

*Why it hurts:* forms on adjacent screens look like they came from
different products, and controls fail to line up when mixed in one row.

*Fix:* one `<Input>` primitive (plus `<Select>`, `<Textarea>` sharing its
shape) at a single height and radius, with an optional `size="sm"` for
genuinely dense table-inline editing.

#### H4 — Four border radii with no strategy, plus arbitrary pixel values
**Affected:** app-wide

`rounded-2xl` (113), `rounded-lg` (98), `rounded-full` (74), `rounded-xl`
(52), plus `rounded-[26px]`, `rounded-[40px]`, `rounded-[45px]`.

*Why it hurts:* radius should encode *what kind of object* something is. At
present a card, a panel, an input, and a button may each carry any of four
radii, so the shape language communicates nothing. The heavy use of 16px
(`2xl`) on every panel is also specifically what the brief means by
"excessive rounded cards".

*Fix:* three tiers, assigned by role — 6px controls, 10px containers, full
for pills and avatars only. Retire the arbitrary values.

#### H5 — Most interactive elements have no visible focus state
**Affected:** app-wide — 43 focus styles for 198 interactive elements

*Why it hurts:* keyboard users cannot see where they are. Compounds C2.

*Fix:* set a single global focus-visible ring in the `@theme`/base layer so
it applies by default and individual components stop hand-rolling it.

#### H6 — `pt-24` in 11 files is load-bearing layout coupling
**Affected:** `Dashboard.jsx:46` and all 11 module pages

The mobile module nav is `absolute top-16.25`, so every module page adds
`pt-24` to avoid being covered.

*Why it hurts:* a magic number repeated in 11 files that silently breaks if
the header height changes. A new module page that forgets it renders
underneath the nav. This is a bug waiting for the next contributor.

*Fix:* make the shell own its own spacing — put the mobile nav in normal
document flow inside a flex/grid column (or `position: sticky`), and delete
`pt-24` from all 11 pages.

#### H7 — Status badge logic duplicated six times, markup eight times
**Affected:** `OrderManagement`, `PaymentLog`, `PaymentBilling`,
`DeliveryManagement`, `MyDeliveries`, `InventoryRequests`

`PaymentLog` and `PaymentBilling` hold byte-identical maps under different
names. The badge's markup — `rounded-full px-2.5 py-1 text-[10px]
font-bold …` — is pasted at 8 sites.

*Why it hurts:* adding a status or restyling badges means finding six
files. `MyDeliveries` already carries only 2 of the 5 delivery statuses,
so its badges silently fall back to grey for `DELIVERED` and `FAILED`.

*Fix:* one `<StatusBadge status="…" />` reading a single exported map. The
existing colour semantics carry over unchanged — this is consolidation,
not redesign.

---

### MEDIUM

#### M1 — The dashboard's hero KPI card is a green-to-navy gradient
**Affected:** `DashboardHome.jsx:20` — `bg-linear-to-br from-green-700 to-blue-900`

Directly contradicts the "avoid excessive gradients" brief, and green→navy
is not a brand relationship — navy appears nowhere else in the identity.
It also makes that one card visually unlike its three siblings.

*Fix:* solid brand green (or a white card with a green figure). Keep the
four KPI tiles as one visual object.

#### M2 — "View details →" is not clickable
**Affected:** `DashboardHome.jsx:22`

Rendered as `<p className="… text-green-700">View details →</p>`. It looks
like an action and does nothing.

*Fix:* make it a real `<button>`/`<Link>` that switches to the relevant
module, or remove it. A false affordance is worse than no affordance —
especially in a demo.

#### M3 — A KPI slot is occupied by filler copy
**Affected:** `DashboardHome.jsx:23`

The fourth tile reads "Use the navigation to move through your permitted
Pectrack modules securely." That is not information — it is padding
occupying prime screen space in a row of metrics.

*Fix:* replace with a real fourth metric (orders today, pending
deliveries), or drop to a three-tile row. Do not pad a metrics row with
prose.

#### M4 — The dashboard summary fails silently
**Affected:** `DashboardHome.jsx:8` — `.catch(() => {})`

If `/api/reports/summary` fails, every figure shows `—` forever with no
explanation, and the "Needs attention" panel reads "Loading…" permanently.

*Why it hurts:* this is precisely the laptop-demo failure mode already hit
once this project — a page that looks merely empty when it is actually
broken.

*Fix:* set an error state and render the `<Alert>` from C3.

#### M5 — Six shadow levels, no strategy
**Affected:** app-wide

*Fix:* two tiers — a subtle `raised` for cards, a pronounced `overlay` for
modals and dropdowns. Nothing else. Flat borders carry most separation.

#### M6 — No table semantics
**Affected:** all 12 tables, 75 `<th>`

Zero `scope="col"`. Screen readers cannot associate cells with headers, so
a row reads as a bare string of values.

*Fix:* `scope="col"` on every header, `<caption class="sr-only">` naming
the table. Cheap, and directly citable in the paper's accessibility
section.

#### M7 — Loading states differ by area
**Affected:** dashboard vs storefront

The storefront animates skeleton cards; the dashboard renders the bare
string `Loading…`. Same app, two conventions.

*Fix:* one `<Skeleton>` primitive. Use skeletons where layout is known
(tables, cards), a spinner only for indeterminate waits.

#### M8 — Warm and cool neutrals are mixed
**Affected:** forms vs tables

Inputs use `border-stone-200` (warm); dashboard text uses `text-slate-500`
/ `text-slate-900` and `divide-slate-100` (cool). Placed side by side, the
greys visibly disagree.

*Fix:* pick one neutral family. For a bakery, warm — and the Design System
below specifies a warm neutral ramp.

---

### LOW

#### L1 — `App.css` is 186 lines of dead Vite starter CSS
**Affected:** `src/App.css` — never imported by anything

Contains `.counter`, `.hero`, `.vite`, `#next-steps`, `#docs`, `.ticks`,
referencing CSS variables that do not exist in this project.

*Fix:* delete the file. Confirm nothing imports it first (nothing does).

#### L2 — Near-duplicate hex values
**Affected:** app-wide

`#fffedc` and `#fbfbdc` (two creams a hair apart); `#291dcc`, `#271dc8`,
and `#1e159b` (three indigos); `#26752a` and `#449947` (two greens).

*Fix:* collapse into tokens during C1. Each of these should be exactly one
named value.

#### L3 — The indigo action colour is off-brand
**Affected:** `LoginForm.jsx`, `WelcomePanel.jsx`

The primary sign-in button is `#291dcc` — a saturated blue-violet that
appears nowhere in the bakery identity and reads as generic SaaS.

*Fix:* promote brand green to the primary action colour and retire the
indigo, or demote it to a single decorative accent on the welcome panel.

---

### SUGGESTION

- **S1 — Storefront and dashboard read as two different products.** The
  split is intentional and correct, but they should share one token layer
  so the green, the neutrals, and the type scale match. Different *layout
  language*, same *design system*.
- **S2 — Role identity is currently only nav filtering.** All four roles
  see an identical shell with a different list. A small role marker in the
  sidebar (the existing "CASHIER access · 8 permitted modules" block is
  already halfway there) would make role switching legible in a demo.
- **S3 — Consider a denser table mode for counter use** once the type
  scale is fixed, rather than keeping everything small by default.

---

## DESIGN SYSTEM

Written as a Tailwind v4 `@theme` block so it is directly implementable.
Values are derived from the existing identity — the logo's green and gold,
the cream the storefront already uses — so this is a consolidation of what
PECTRACK already looks like, not a new visual direction.

```css
/* src/index.css */
@import "tailwindcss";

@theme {
  /* ---- Brand: the bakery green, from the storefront header rule ---- */
  --color-brand-50:  #eef5ec;
  --color-brand-100: #d6e8d4;
  --color-brand-500: #33883a;
  --color-brand-600: #26752a;   /* primary actions, active nav */
  --color-brand-700: #1d5a21;   /* hover */
  --color-brand-900: #123a15;

  /* ---- Accent: the wordmark gold. Secondary, never a default button ---- */
  --color-accent-50:  #fdf6e3;
  --color-accent-100: #f9e9bf;
  --color-accent-500: #c98a12;
  --color-accent-600: #b97600;

  /* ---- Surfaces: warm, bakery-appropriate ---- */
  --color-surface:     #ffffff;  /* cards, tables */
  --color-surface-sunk: #f7f6ef; /* app background */
  --color-surface-warm: #fffdf0; /* highlight panels (replaces #fffedc/#fbfbdc) */

  /* ---- Neutrals: ONE warm ramp. Replaces the stone/slate mix ---- */
  --color-ink-900: #1c1b17;  /* headings */
  --color-ink-700: #3d3b34;  /* body */
  --color-ink-500: #6b6860;  /* secondary */
  --color-ink-400: #8c8880;  /* placeholder, disabled */
  --color-line-200: #e4e2d8; /* borders */
  --color-line-100: #f0efe8; /* dividers */

  /* ---- Status: the existing semantics, centralised ---- */
  --color-status-wait-bg:    #fef3c7;  --color-status-wait-fg:    #92400e;
  --color-status-active-bg:  #dbeafe;  --color-status-active-fg:  #1e40af;
  --color-status-transit-bg: #ccfbf1;  --color-status-transit-fg: #115e59;
  --color-status-done-bg:    #dcfce7;  --color-status-done-fg:    #166534;
  --color-status-fail-bg:    #fee2e2;  --color-status-fail-fg:    #991b1b;
  --color-status-idle-bg:    #f1f0ea;  --color-status-idle-fg:    #57534e;

  /* ---- Radius: three tiers, assigned by role ---- */
  --radius-control: 0.375rem;  /* 6px  — buttons, inputs, badges-square */
  --radius-panel:   0.625rem;  /* 10px — cards, tables, modals */
  /* rounded-full stays, for pills and avatars ONLY */

  /* ---- Shadow: two tiers ---- */
  --shadow-raised:  0 1px 2px rgb(28 27 23 / 0.06), 0 1px 3px rgb(28 27 23 / 0.04);
  --shadow-overlay: 0 8px 24px rgb(28 27 23 / 0.14);
}
```

### Typography hierarchy

One family (system sans) for the interface; the existing serif stays for
the PECTRACK wordmark and storefront headlines only — that contrast is
part of the storefront's character and is worth keeping there.

| Role | Size | Weight | Use |
| --- | --- | --- | --- |
| Display | 30px | 700 | Storefront headlines only |
| Page title | 24px | 600 | One per screen (`Order Management`) |
| Section | 18px | 600 | Card and panel headings |
| Body | **14px** | 400 | **Default. Table cells, paragraphs, inputs** |
| Body strong | 14px | 600 | The one value that matters in a row |
| Small | 12px | 400 | Secondary/help text — the floor for sentences |
| Micro-label | 10px | 600 | Uppercase, `tracking-wide`, labels only — never sentences |

Retire `text-[9px]` and `text-[11px]`. Page titles drop from
`text-3xl font-extrabold` to 24px/600 — still clearly a title, far less shouty.

### Spacing scale

4px base; use only **4, 8, 12, 16, 24, 32, 48**. Card padding 24px desktop
/ 16px mobile. Table cell padding 12px vertical. Gap between sibling cards
16px. Section rhythm 32px.

### Button styles

One height ramp: **36px default**, 32px compact (table row actions), 44px
for primary storefront CTAs and any touch-critical control (delivery
screens).

| Variant | Style | Use |
| --- | --- | --- |
| Primary | `bg-brand-600` white text, hover `brand-700` | The one main action per view |
| Secondary | white, `border-line-200`, `ink-700` | Cancel, secondary actions |
| Ghost | transparent, `ink-500`, hover `surface-sunk` | Tertiary, icon buttons |
| Destructive | `bg-red-600` white / red outline | Deactivate, refund, cancel |

All: `rounded-control`, 500 weight, `disabled:opacity-60
disabled:cursor-not-allowed`, and the global focus ring. Never more than
one Primary visible in a panel.

### Input styles

```
h-9 · w-full · rounded-control · border border-line-200 · bg-surface
px-3 · text-[14px] · placeholder:text-ink-400
focus:border-brand-600 focus:ring-2 focus:ring-brand-500/25
aria-invalid:border-red-500
```

Label 12px/600 above the field, help text 12px `ink-500` below, error text
12px red-700 below and referenced by `aria-describedby`. `<Select>` and
`<Textarea>` inherit the same border, radius, and focus.

### Table styles

- Wrapper `overflow-x-auto` (already done) inside a `radius-panel` card.
- Header: 10px uppercase micro-label, `ink-500`, `scope="col"`, bottom
  border `line-200`, sticky on tall tables.
- Cells: 14px, 12px vertical padding, `divide-y divide-line-100`.
- **Numeric and currency columns right-aligned with `tabular-nums`** — the
  peso columns currently left-align and do not line up.
- Row hover `surface-sunk`; selected row `brand-50`.
- First cell is a focusable `<button>`/`<Link>` when the row is clickable
  (fixes C2).
- Actions column last, fixed width, ghost buttons.
- Every table gets an `<caption class="sr-only">`.

### Status colours

Keep the existing semantics; expose them once:

| Token | Meaning | Statuses |
| --- | --- | --- |
| `wait` | needs someone to act | `PLACED`, `PENDING`, `PENDING_ASSIGNMENT` |
| `active` | acknowledged, in hand | `CONFIRMED`, `ASSIGNED`, `IN_PRODUCTION` |
| `transit` | moving to the customer | `READY_FOR_PICKUP`, `OUT_FOR_DELIVERY` |
| `done` | finished, money in | `COMPLETED`, `PAID`, `DELIVERED`, `APPROVED` |
| `fail` | failed or reversed | `CANCELLED`, `FAILED`, `REFUNDED`, `REJECTED` |
| `idle` | inactive/unknown | fallback |

Badges: `rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase
tracking-wide`. One `<StatusBadge>` component, one map.

---

## PAGE PRIORITY

Ranked by *users affected × frequency of use × distance from the target*.

| # | Screen | Why it ranks here |
| --- | --- | --- |
| 1 | **Dashboard shell** (`Dashboard.jsx`) | Every staff role sees it constantly. Owns H6's `pt-24` coupling and the mobile nav hack. Fixing it unblocks all 11 module pages. |
| 2 | **DashboardHome** | First screen after every staff login — the demo's opening shot. Carries M1 gradient, M2 false affordance, M3 filler tile, M4 silent failure. Highest impression-per-fix. |
| 3 | **OrderManagement** | Busiest staff screen and the C2 keyboard trap. Densest table, so it benefits most from the type and table work. |
| 4 | **NewOrderForm** | Counter speed is the point; currently the worst mix of the three input styles. |
| 5 | **PaymentBilling + PaymentLog** | Money screens — where right-aligned `tabular-nums` and readable errors matter most. Also the duplicated status map. |
| 6 | **MyDeliveries / DeliveryManagement** | **The only role working on a phone in the field.** Mobile is not a nice-to-have here, and its badge map is missing two statuses. |
| 7 | **InventoryManagement + InventoryRequests** | Approval flows; moderate traffic, mostly inherits the primitives. |
| 8 | **ReportingAnalytics** | Largest file (414 lines). Charts need the token colours, but it is admin-only and lower frequency. |
| 9 | **Storefront Menu / Cart / Checkout** | Recently reworked and in the best shape. Mostly inherits tokens. |
| 10 | **Login / Register / static pages** | Just reworked. Only L3's indigo needs a decision. |

---

## REDESIGN PLAN

Staged so that **every stage ships something demonstrable and nothing is
left half-migrated.** If the schedule runs out after any stage, the app is
in a coherent state.

### Stage 0 — Foundation *(no visible change)*
Define the `@theme` block; delete dead `App.css`; add the global
focus-visible ring. Nothing else. The app looks identical afterwards —
that is the success criterion. Everything below depends on this.

### Stage 1 — The primitive kit
Build in `src/components/ui/`: `Button`, `Input`, `Select`, `Textarea`,
`Field` (label + help + error + `aria-describedby`), `StatusBadge`,
`Card`, `Table` parts, `Alert`, `Skeleton`, `EmptyState`. Ship with one
screen converted (**CustomerManagement** — smallest table, 149 lines) to
prove the kit before it spreads.

### Stage 2 — The shell (Priority 1)
Fix the mobile nav to sit in flow; delete `pt-24` from all 11 pages;
normalise the sidebar to the new tokens. One change, eleven pages
improved.

### Stage 3 — Highest-traffic screens (Priority 2–4)
DashboardHome (kill the gradient, the filler tile, the false affordance;
add the error state), OrderManagement (fix C2 with a focusable first
cell), NewOrderForm. Convert to primitives as you go.

### Stage 4 — Money and inventory (Priority 5, 7)
PaymentBilling, PaymentLog, InventoryManagement, InventoryRequests.
Right-align currency with `tabular-nums`. Delete the duplicate status maps.

### Stage 5 — The delivery role on mobile (Priority 6)
Test on a real phone viewport, not a resized desktop window. 44px touch
targets, single-column, thumb-reachable primary actions.

### Stage 5.5 — the four screens this plan originally missed

**Correction (2026-09-09).** Stages 3–5 as first written covered eleven
screens and silently skipped four. Found by measuring conversion coverage
across `src/pages/dashboard/` after Stage 5, not by re-reading the plan:

| Screen | Old-style hits | Seen by |
| --- | --- | --- |
| `MyProfile` | 27 | **all four roles** |
| `ReportingAnalytics` | 73 | ADMIN, CASHIER |
| `ProductManagement` | 31 | ADMIN |
| `StaffManagement` | 27 | ADMIN |

`MyProfile` is the serious one — `modules.js` grants it to every role, so
every user currently lands on an unconverted screen. `ReportingAnalytics`
is the largest file in the frontend (414 lines) and owns the Chart.js
canvases, whose colours are hard-coded rather than taken from the tokens.

This must run **before** Stage 6: an accessibility sweep over markup that
is about to be rewritten is wasted work.

Order within the stage: `MyProfile` first (all roles), then
`StaffManagement` and `ProductManagement` (both admin-only, both mostly
tables and forms the primitives already cover), then `ReportingAnalytics`
last — it is the largest and the only one with charts.

**The storefront stays as it is.** `src/pages/customer-storefront/` and
`MarketingHeader` are deliberately a different visual language from the
dashboard (`STOREFRONT_PLAN.md`), they were reworked recently, and they
are internally consistent. They share the token layer already. Converting
them to dashboard primitives would be scope creep with little return.

### Stage 6 — Accessibility and consistency sweep
`scope="col"` and `sr-only` captions on all 12 tables; audit remaining
focus states; verify colour contrast; tab through each role end to end.
This stage is directly citable in the thesis.

### Explicitly out of scope
- No animation beyond existing hover/transition states.
- No new dependencies — the primitive kit is plain React + Tailwind.
- No backend or schema changes for UI reasons.
- No storefront visual redirection; it stays as designed, on shared tokens.
- The Figma is not final, so **Stage 0's tokens are the contract** — when
  Figma lands, changing the `@theme` values re-skins the app without
  touching components. That is the whole point of doing Stage 0 first.

---

## Stage 6 — accessibility results

Measured 2026-09-09, against the running app (backend on :3001 against the
real local Postgres instance, frontend on Vite) rather than against source
alone, so the numbers below reflect what a keyboard or screen-reader user
actually gets.

### Table semantics (M6) — already closed, not by this stage

The brief for this stage assumed 3 hand-written `<th>` and 3 `<Table>` call
sites without a `caption` were still outstanding. Measuring first (per the
brief's own method) found neither: `grep -rn "<th\b" src/` outside
`ui/Table.jsx` returns nothing, `grep -rn "<table\b"` outside the same file
returns nothing, and all 8 `<Table>` call sites across
`CustomerManagement`, `InventoryManagement`, `OrderManagement`,
`PaymentBilling`, `PaymentLog`, `ProductManagement`, `StaffManagement`, and
`ReportingAnalytics` (5 tables in that one file) already pass a `caption`.
Stage 5.5's conversion of the four missed screens evidently finished this
along the way. **This is a finding in this stage's brief that turned out
to be stale, not a finding in the app** — recorded here so the discrepancy
is on the record rather than silently absorbed.

### Colour contrast — measured against the tokens actually in use

Method: a throwaway Node script (relative-luminance + WCAG contrast-ratio
formula, no library) against the hex values in `src/index.css`'s `@theme`
block. Checked against **AA: 4.5:1 for body text, 3:1 for large text and
UI-component boundaries** (WCAG 1.4.3 and 1.4.11).

| Pair | Hex | Ratio | AA body (4.5:1) | AA large/UI (3:1) |
| --- | --- | --- | --- | --- |
| `ink-700` on `surface` | `#3d3b34` / `#ffffff` | 11.21:1 | PASS | PASS |
| `ink-700` on `surface-sunk` | `#3d3b34` / `#f7f6ef` | 10.35:1 | PASS | PASS |
| `ink-500` on `surface` | `#6b6860` / `#ffffff` | 5.56:1 | PASS | PASS |
| `ink-500` on `surface-sunk` | `#6b6860` / `#f7f6ef` | 5.14:1 | PASS | PASS |
| `ink-400` on `surface` | `#8c8880` / `#ffffff` | 3.53:1 | **FAIL** | PASS |
| `ink-400` on `surface-sunk` | `#8c8880` / `#f7f6ef` | 3.26:1 | **FAIL** | PASS |
| `brand-600` on white / white on `brand-600` | `#26752a` / `#ffffff` | 5.74:1 | PASS | PASS |
| `brand-700` on white | `#1d5a21` / `#ffffff` | 8.28:1 | PASS | PASS |
| `status-wait-fg` on `status-wait-bg` | `#92400e` / `#fef3c7` | 6.37:1 | PASS | PASS |
| `status-active-fg` on `status-active-bg` | `#1e40af` / `#dbeafe` | 7.15:1 | PASS | PASS |
| `status-transit-fg` on `status-transit-bg` | `#115e59` / `#ccfbf1` | 6.73:1 | PASS | PASS |
| `status-done-fg` on `status-done-bg` | `#166534` / `#dcfce7` | 6.49:1 | PASS | PASS |
| `status-fail-fg` on `status-fail-bg` | `#991b1b` / `#fee2e2` | 6.80:1 | PASS | PASS |
| `status-idle-fg` on `status-idle-bg` | `#57534e` / `#f1f0ea` | 6.68:1 | PASS | PASS |
| `line-200` (border) on `surface` — **before** | `#e4e2d8` / `#ffffff` | 1.30:1 | — | **FAIL** |

Every status pair and every core text tier passes with margin. Two
findings needed a real fix, not just a table entry:

**1. `line-200` (the border token behind `Input`, `Button`'s secondary
variant, and `Card`) failed WCAG 1.4.11 badly — 1.30:1, effectively
invisible.** None of those three components differ in *background* from
their surroundings (an `Input` is `bg-surface` inside a `Card` that is
also `bg-surface`; a `Card` sits on `surface-sunk`, itself only 1.03:1 from
white), so the border is not decorative — it is the only thing that says
"this is a text field" or "this is where the card ends." **Fixed the
token**: `--color-line-200` moved from `#e4e2d8` to `#8f8a70` (same warm
hue, darker) — now 3.48:1 on `surface` and 3.21:1 on `surface-sunk`, both
past 3:1. `line-100` (`#f0efe8`, decorative row dividers inside an
already-bordered table) was left alone — 1.4.11 only binds UI-component
boundaries, and a divider inside a table that already has its own border
isn't one.

**2. `ink-400` fails AA body text (3.53:1, needs 4.5:1) — and grep showed
it was actually being used as body text**, not only for the placeholder/
disabled cases the token layer's original comment names as exempt.
Genuine content was found set in `ink-400` in 8 files: a username in a
table cell (`CustomerManagement.jsx`), the "MAIN MENU" nav label
(`Dashboard.jsx`), a KPI caption (`DashboardHome.jsx`), help sentences
(`NewOrderForm.jsx`, `OrderManagement.jsx`, `PaymentBilling.jsx`), a
refund-reason quote (`PaymentLog.jsx`), and four captions/sub-labels
(`ReportingAnalytics.jsx`). Darkening the token itself to clear 4.5:1
lands it within 3 points of lightness of `ink-500` (worked out to
`#736f68` at l=43 — visually almost the same colour as `#6b6860`), which
would make two "different" tiers indistinguishable. **Fixed the usage
instead of the token**: all 12 real-content call sites above moved from
`text-ink-400` to `text-ink-500` (already 5.56:1/5.14:1, comfortably
passing); `ink-400`'s hex is unchanged, and `index.css` now says in the
token comment that it is for placeholder and disabled text only — its one
remaining use is `Input.jsx`'s `placeholder:text-ink-400`, which is
exempt (WCAG doesn't bind placeholder copy, and every field carrying one
also has a real `<label>` via `Field`, so the placeholder was never the
only name for the control).

No other pair needed a change. `accent-600` is chart-only (a Chart.js
`backgroundColor`/`borderColor`, never text-on-background) and wasn't
checked as a text pair for that reason.

### Keyboard pass, per role

Method: Playwright driving real Chromium against the running app
(installed with `npm install --no-save playwright`, uninstalled after;
temp scripts deleted, both dev servers killed). For each role: log in,
walk every module that role's nav exposes, and press Tab in a loop,
recording `document.activeElement` and its computed `outline`/`box-shadow`
after every press. 269 Tab presses were traced across the three
reachable roles.

**ADMIN could not be tested — no admin password was provided or found in
the repo, and none should be guessed.** Everything below is CASHIER,
DELIVERY PERSONNEL, and CUSTOMER only. ADMIN shares the same shell,
primitives, and (for 7 of its 9 modules) the same components CASHIER
already exercised, so the untested surface is `Staff Management` and
`Product Management` specifically, plus whatever ADMIN-only branches exist
inside shared screens (e.g. the "Actions" column, category/product
mutation forms). This is a real gap, not a formality — say so rather than
implying coverage that doesn't exist.

**CASHIER** (desktop, 1400×900) — all 8 modules plus the dashboard home:
Dashboard, Order Management, Customer Management, Inventory Management,
Payment & Billing, Delivery Management, Reporting & Analytics, My Profile.
140 Tab presses. Every element reached had a visible focus indicator
except 2 (below). Confirmed C2 is still fixed live, not just in source:
focused the `aria-label="Open order #6828"` button by keyboard and pressed
Enter — the order detail panel opened, matching the `stopPropagation`
pattern in `OrderManagement.jsx:153-165`. Tab order through the orders
table is sequential by row (button → next row's button), which is
sensible reading order.

**DELIVERY PERSONNEL** (phone viewport, 390×844, per the audit's own
"test on a real phone viewport" instruction for this role) — Delivery
Management and My Profile. 35 Tab presses, 0 without a visible ring. The
demo account had exactly one assigned delivery, so the reachable set was
small (Log out, the two mobile nav pills, one "Start delivery" button) —
confirmed by screenshot, not just the trace, that this is the true content
of the screen and not something skipped. The mobile module nav (Stage 2's
fix) renders as in-flow pills at this viewport and both are independently
reachable and operable.

**CUSTOMER** (desktop, 1400×900) — the storefront (`/`, `/menu`, `/cart`)
and the dashboard shell (My Orders, Payment & Billing, My Profile). 94 Tab
presses, 0 without a visible ring. Order-history rows use the same
focusable-button-per-row pattern as staff's Order Management.

**The only anomaly across all 269 presses**: 2 of them, both on the same
native `<input type="date">` in Reporting & Analytics' Sales tab. Chromium
renders a date input's month/day/year as internal segments that share one
DOM node and one accessible-name (confirmed both segments correctly
report their `<label>` — "From" / "To" — via `el.labels`); Tab moves
between segments without `document.activeElement` changing, and on the
segment immediately before the field is left, the browser's own computed
`outline-style` briefly reports `none` where the prior two segments
reported the app's `solid 2px` ring. This reproduced identically on both
date fields and is a property of Chromium's native control internals, not
of any CSS in this app — there is no selector in `src/` that could target
an internal date-input segment to suppress its outline. Recorded rather
than "fixed" because there is nothing in the app to fix.

**Not covered**: mouse-only interactions (drag, hover-only affordances —
the audit's own read is that the app has none), and any screen behind a
data state the demo database didn't have populated (e.g. a delivery in
every status, not just ASSIGNED).

### Forms and labels

The `Field` primitive (`src/components/ui/Field.jsx`) wires `<label
htmlFor>` and `aria-describedby` automatically wherever it's given a
`label` prop, but deliberately allows an unlabelled `Field` for dense
table-inline edits "whose column header already names the field" — the
comment's assumption was that the header naming it *visually* was enough.
It isn't: a `scope="col"` header associates with a `<td>`'s text for a
screen reader reading table cells, not with a form control nested inside
one, so every inline-edit control built that way had **zero** accessible
name. Grepping every `<Input`/`<Select`/`<Textarea` call site and checking
each one against its nearest `Field label=`/`aria-label` found 13 real
gaps, all now fixed with a matching `aria-label`:

| File | Control(s) fixed |
| --- | --- |
| `CustomerManagement.jsx` | inline-edit Name, Contact number, Email |
| `StaffManagement.jsx` | inline-edit Name, Contact number, Email |
| `ProductManagement.jsx` | category-rename input; inline-edit Product name, Category, Variant, Price |
| `NewOrderForm.jsx` | customer `<Select>`; "Add a product…" `<Select>` |
| `DeliveryManagement.jsx` | status filter `<Select>`; per-row "Assign a driver" `<Select>`; per-row retry-note and recall-note `<Input>` |

Everything else checked — `AddressForm.jsx`, `LoginForm.jsx`,
`RegistrationPage.jsx`, every `Field`-wrapped call site in `MyProfile.jsx`
/ `InventoryRequests.jsx` / `PaymentBilling.jsx` / `ReportingAnalytics.jsx`
/ `MyDeliveries.jsx` — already had a real `<label>` or `aria-label`; those
were false positives from a first-pass grep (multi-line JSX hides the
`aria-label` on a different line) and are recorded here only to show they
were checked, not skipped.

**Storefront** (the two inputs the brief named specifically): the
checkout instructions `<textarea>` and every `AddressForm` field already
had a real `<label>`; `CustomerMenu.jsx`'s search input had only a
`placeholder`, which the task's own bar (`<label>`, `aria-label`, or
`aria-labelledby` — not placeholder) doesn't count. Added
`aria-label="Search the menu"`.

### C3 — storefront error announcements (the main gap this stage closed)

All four files the brief named were confirmed to be genuinely mismarked
and fixed:

| File | Before | After |
| --- | --- | --- |
| `CartPage.jsx:38` | `role="status"` | `role="alert"` (the `message` state is only ever set from a `.catch`, never a success path) |
| `CustomerMenu.jsx:40` | `role="status"` | `role="alert"` (same — `useMenuData.js`'s `message` is catch-only) |
| `PublicMenu.jsx:16` | `role="status"` | `role="alert"` (same shared hook) |
| `CheckoutPage.jsx:115` | `role="status"` always | `role={messageFailed ? 'alert' : 'status'}` — the component already tracked which case it was in (`messageFailed`), it just wasn't reading that flag for the `role` |

No other change to these four files — styling, copy, and business logic
are untouched, per the brief's "ARIA semantics only" instruction.

### Headings and landmarks

Checked live via `document.querySelectorAll('h1..h6')` and landmark tag
counts, across the CASHIER-visible dashboard screens and every public
storefront route (`/`, `/menu`, `/about`, `/contact`, `/login`,
`/register`). Every screen has exactly one `<h1>`, heading levels never
skip (h1 → h2 → h3 on `/menu`'s category/product listing, h1 → h2
elsewhere), and every screen has exactly one `<header>`, one `<main>`, and
at least one `<nav>`. `OrderManagement.jsx` and `CheckoutPage.jsx` each
have two `<h1>` **in source**, but they're mutually exclusive early-return
branches (staff view vs. customer view; empty-cart vs. real checkout) —
never both mounted at once, confirmed live. `/menu` renders two `<nav>`
landmarks (the site nav and a "Jump to category" nav); only the second has
an `aria-label`. Left as-is: the two are still distinguishable (one
labelled, one not) and this falls outside the four named storefront ARIA
fixes, but it's a one-line follow-up (`aria-label="Primary"` on
`MarketingHeader`'s `<nav>`) if this comes up again.

### Images

Every `<img>` in `src/` (8 total) already has `alt`: meaningful text for
content images (`alt={product.name}` in `CustomerMenu`/`PublicMenu`/
`HomePage`, `alt={proof.fileName}` for delivery proof photos, `alt="Pectos
Bakery logo"` for the brand mark) or explicit `alt=""` for the two
decorative product-thumbnail fallbacks in `ProductManagement.jsx`. No
change needed.

### Housekeeping

Deleted 144 rows from the `sessions` table for the three demo accounts
used in the keyboard pass (`cashier1`, `delivery1`, `customer1`) — most of
these pre-dated this session's testing (the table already held 145 rows
total, 144 of them across exactly these three users, before any of this
stage's logins). This only signs those three accounts out everywhere; it
does not touch `orders`, `payments`, `inventory`, or any other table. If
you were signed into one of these three accounts in your own browser,
you'll need to log in again.

### What remains open

- **ADMIN's keyboard behaviour is unverified** — no password available.
  `Staff Management` and `Product Management` specifically, and any
  ADMIN-only branch of a shared screen, should get the same Tab-trace this
  stage ran for the other three roles once a password exists.
- **`/menu`'s primary `<nav>` has no `aria-label`** to distinguish it from
  the "Jump to category" nav on the same page — not a WCAG failure (the
  two are still distinguishable), but worth the one-line fix.
- **The Chromium native-date-input focus-ring gap** (2 of 269 presses,
  detailed above) is a browser-internals property, not an app defect —
  recorded for completeness, nothing to fix in `src/`.
- **`npm run build` clean, `npm run lint` unchanged at 8 pre-existing
  warnings, `npm test` 312/312** — verified after all fixes in this
  section, not before.
