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
