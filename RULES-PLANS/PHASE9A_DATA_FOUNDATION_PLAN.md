# Phase 9A — Ingredients, recipes, production: the data foundation

This document is the agreed design for the work that must exist BEFORE any
predictive analysis is attempted: ingredient inventory, product recipes,
production recording with automatic ingredient deduction, production
costing, and the analytics-ready shape of the data that results. It is
written before any Phase 9A code exists, under the same discipline as
`PHASE5_PLAN.md` through `PHASE8_PLAN.md`. Read it before writing code.

**Predictive analysis itself is out of scope here.** The adviser's guidance
is that a demand model may need around two years of sales history; whether
the client can supply that is unconfirmed. Nothing in this phase forecasts,
predicts, or assumes. It records what the bakery does — buys, bakes, loses,
sells — in a shape a model can read later, and it marks every row with
where it came from so real client data and any future assumed data can
never be mixed without saying so. See Decision 9.

---

## Part 1 — What exists today, and where the seams are

Checked against `database/schema.sql` (as of migration 010) and the live
database, not assumed.

### The finished-goods side is complete and must not be rebuilt

| Table | Role today | Rows |
| --- | --- | --- |
| `products` | The catalogue: name, variant, price, category, availability, photo | 41 |
| `inventory` | One row per product: `stock_quantity`, `min_stock_level`, `expiration_date` | 41 |
| `inventory_movements` | Signed ledger of every stock change, with `reason` (`stock_movement_reason`), optional `order_id` / `request_id`, `changed_by` | ledger |
| `inventory_change_requests` | Cashier proposes a recount or loss; admin approves; approval writes a ledger row | — |
| `stock_alerts` | At most one open low-stock alert per `inventory_id` | — |
| `order_details` | Line items with `unit_price` snapshotted at order time | sales history |
| `order_status_history` | Every status transition with actor and timestamp | sales history |

The two rules that make this side trustworthy, both already enforced:

1. **Stock never changes without a ledger row** (`lib/inventory.js`,
   `routes/orders.js`, `routes/inventory.js`). `SUM(quantity_change)`
   reconciles to `stock_quantity`.
2. **Money and quantity are snapshotted at the moment of the event**
   (`order_details.unit_price`), so later price edits never rewrite history.

Phase 9A copies both rules onto the ingredient side rather than inventing a
third pattern.

### The gap: finished goods appear from nowhere

Today the only way stock *enters* `inventory` is an admin typing a number
with reason `RESTOCK` (`routes/inventory.js` PATCH `/:productId`). The live
ledger shows it: 97 `ORDER_PLACED` rows, 10 `ORDER_CANCELLED`, 4 `SPOILAGE`,
2 `CORRECTION`, and **one** `RESTOCK`. Nothing records:

- what was baked, when, by whom, how many were planned versus came out;
- what ingredients went into it, or how much they cost;
- therefore what a Pandesal costs to make, or what margin its price carries.

`INVENTORY_REVIEW.md` §8 already names the analytics consequence: yield
(`produced` vs `PRODUCTION_LOSS`) is one of the three streams a demand model
needs kept separate, and today "produced" is an untyped `RESTOCK`.

### Where Phase 9A plugs in — one seam, not several

Production is the *source* of finished-goods stock. So the integration
point is exactly one: **recording a production batch writes the
`inventory_movements` row that `RESTOCK` writes today**, with a new reason
that says what it is. Everything downstream — orders deducting stock, low-
stock alerts, cancellation restores, the inventory report — keeps working
unchanged, because it only ever reads `inventory.stock_quantity` and the
ledger. Nothing in `routes/orders.js`, `routes/payments.js`,
`routes/deliveries.js` or `lib/billing.js` changes.

What Phase 9A must NOT do:

- **Not put ingredients in `inventory`.** `inventory.product_id` is `NOT
  NULL` and references `products`; an ingredient is not a product, is not
  sold, has no price, and is measured in kilograms and litres, not pieces.
  Forcing it into the same table would give the storefront and the order
  form 60 "products" nobody can buy.
- **Not reuse `stock_movement_reason` for ingredients.** `ORDER_PLACED`
  and `READY_FOR_PICKUP`-era reasons mean nothing for flour. Separate enum,
  separate ledger (Decision 2).
- **Not extend `inventory_change_requests` to ingredients.** That workflow
  exists because a cashier may not touch finished stock directly. Ingredient
  corrections are an admin action (Decision 7); one table for two unrelated
  approval flows would need a discriminator and two validation shapes.
- **Not write `RESTOCK` from production.** `RESTOCK` keeps one narrow
  meaning after this phase: finished goods received *without* a recipe
  (bought-in items). Production gets its own reason (Decision 5).
- **Not store computed cost on `products`.** Unit cost changes every batch;
  the truth is per batch, and a "current cost" is a query over batches, not
  a column that goes stale (Decision 6).
- **Not add `stock_alerts` rows for ingredients.** `stock_alerts.inventory_id`
  is a hard FK to `inventory`. Ingredient low-stock is computed on read from
  `ingredients.min_stock_level` (Decision 7) — the same "computed, never
  stored" rule `lowStock` already follows on the inventory list.

---

## Part 2 — Decisions

### Decision 1 — `ingredients` is a table in its own right, mirroring the products/inventory split in ONE table

```sql
CREATE TABLE ingredients (
  ingredient_id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name              VARCHAR(150) NOT NULL UNIQUE,
  unit              VARCHAR(20)  NOT NULL,            -- 'kg', 'g', 'L', 'mL', 'pc' — free text, validated in code
  stock_quantity    NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  min_stock_level   NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (min_stock_level >= 0),
  average_unit_cost NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (average_unit_cost >= 0),
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at / updated_at TIMESTAMPTZ (trigger set_updated_at)
);
```

Products needed two tables because the catalogue (what customers see) and
the stock (what staff count) have different readers and different
permissions. Ingredients have one reader — staff. One table.

`NUMERIC(12,3)`, not `INTEGER`: flour is 12.5 kg, not 12. Three decimals
covers grams within a kilogram and millilitres within a litre.

`is_active` rather than DELETE: an ingredient referenced by a recipe or a
past batch must stay readable. Same reasoning as addresses (Phase 7,
Decision 1).

### Decision 2 — `ingredient_movements` is a second ledger with its own reason enum, same shape as the first

```sql
CREATE TYPE ingredient_movement_reason AS ENUM (
  'PURCHASE',        -- stock in, with a cost
  'PRODUCTION_USE',  -- stock out, written by a production batch
  'WASTE',           -- stock out, spoiled/expired/spilled
  'CORRECTION'       -- either direction, a recount
);

CREATE TABLE ingredient_movements (
  movement_id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ingredient_id   BIGINT NOT NULL REFERENCES ingredients(ingredient_id),
  batch_id        BIGINT REFERENCES production_batches(batch_id),   -- set for PRODUCTION_USE
  changed_by      BIGINT NOT NULL REFERENCES users(user_id),
  quantity_change NUMERIC(12,3) NOT NULL CHECK (quantity_change <> 0),
  unit_cost       NUMERIC(12,4),        -- PURCHASE: the price paid per unit; PRODUCTION_USE: the average cost consumed
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

Same invariant as `inventory_movements`: `ingredients.stock_quantity` is
never written without a row here, in the same transaction, and
`SUM(quantity_change)` per ingredient reconciles to it. The same test that
proves this for products (`inventory.test.js` "reconcile with the raw
ledger") is written again for ingredients.

`unit_cost` on the movement is the cost snapshot — the ingredient analogue
of `order_details.unit_price`. A purchase records what was actually paid;
a production use records the average cost at the moment of use, so a
batch's cost is reproducible from its movements forever, however prices
move later.

### Decision 3 — Ingredient cost is a moving average, updated on PURCHASE

On every `PURCHASE` of quantity `q` at unit cost `c`, inside the same
transaction that locks the ingredient row:

```
new_average = (stock_quantity × average_unit_cost + q × c) / (stock_quantity + q)
```

Then `stock_quantity += q`, `average_unit_cost = new_average`. Production
consumes at `average_unit_cost`. Waste and corrections do not change the
average.

Why not FIFO lots: `INVENTORY_REVIEW.md` §4 already declined lot tracking
for finished goods, for the same reason it is declined here — it is
warehouse machinery a bakery does not need, and the panel question it
answers ("what did this batch cost?") is answered exactly as well by the
snapshot on `ingredient_movements.unit_cost`. Why not "last purchase
price": one unusually priced sack would swing every batch's cost until the
next purchase. The moving average is the standard small-business method
and is one line of arithmetic.

`NUMERIC(12,4)` for cost: flour at ₱48.50/kg used at 0.125 kg is ₱6.0625;
four decimals keeps that exact until the batch total is rounded to
centavos.

### Decision 4 — A recipe belongs to a product; batch lines snapshot it

```sql
CREATE TABLE recipes (
  recipe_id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id     BIGINT NOT NULL UNIQUE REFERENCES products(product_id),
  yield_quantity INTEGER NOT NULL CHECK (yield_quantity > 0),   -- units of the product one batch makes
  note           TEXT,
  created_at / updated_at TIMESTAMPTZ
);

CREATE TABLE recipe_ingredients (
  recipe_id     BIGINT NOT NULL REFERENCES recipes(recipe_id) ON DELETE CASCADE,
  ingredient_id BIGINT NOT NULL REFERENCES ingredients(ingredient_id),
  quantity      NUMERIC(12,3) NOT NULL CHECK (quantity > 0),   -- in the ingredient's unit, per batch
  PRIMARY KEY (recipe_id, ingredient_id)
);
```

One recipe per product (`UNIQUE`). A product without a recipe cannot be
produced through this system — it can still be restocked (bought-in), and
the production form says so rather than guessing.

**No recipe versioning table.** When a recipe is edited, the current
recipe changes; history is preserved because every production batch
*snapshots* the quantities it actually used into
`production_batch_ingredients` (Decision 5). This is the `order_details`
pattern again: the catalogue is mutable, the event record is not. A
version table would duplicate what the batch lines already hold.

Recipe quantities are **per batch**, and `yield_quantity` says how many
finished units a batch makes. Recording a batch of a different size scales
the ingredient quantities proportionally (`planned_quantity / yield_quantity`)
and lets the baker adjust any line before saving — the recipe is the
default, the batch is the truth.

### Decision 5 — A production batch is one transaction that writes both ledgers

```sql
CREATE TABLE production_batches (
  batch_id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id        BIGINT NOT NULL REFERENCES products(product_id),
  recipe_id         BIGINT REFERENCES recipes(recipe_id) ON DELETE SET NULL,  -- nullable: the recipe may be deleted later; lines below are the record
  recorded_by       BIGINT NOT NULL REFERENCES users(user_id),
  planned_quantity  INTEGER NOT NULL CHECK (planned_quantity > 0),   -- what the batch was meant to make
  produced_quantity INTEGER NOT NULL CHECK (produced_quantity >= 0),  -- good units that reached the shelf
  loss_quantity     INTEGER NOT NULL DEFAULT 0 CHECK (loss_quantity >= 0),  -- burned/defective, never sellable
  total_cost        NUMERIC(12,2) NOT NULL DEFAULT 0,               -- SUM(lines.quantity_used × lines.unit_cost), rounded
  produced_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  note              TEXT,
  data_source       data_source NOT NULL DEFAULT 'RECORDED',         -- Decision 9
  CHECK (produced_quantity + loss_quantity <= planned_quantity * 2)   -- a sanity bound, not a rule: yield can exceed plan slightly
);

CREATE TABLE production_batch_ingredients (
  batch_id      BIGINT NOT NULL REFERENCES production_batches(batch_id) ON DELETE CASCADE,
  ingredient_id BIGINT NOT NULL REFERENCES ingredients(ingredient_id),
  quantity_used NUMERIC(12,3) NOT NULL CHECK (quantity_used > 0),
  unit_cost     NUMERIC(12,4) NOT NULL,      -- ingredient.average_unit_cost at the moment
  PRIMARY KEY (batch_id, ingredient_id)
);
```

`POST /api/production` does, in ONE transaction, in this order (lock order
matters — see Pattern C in `PHASE5_PLAN.md`):

1. Lock the product's `inventory` row `FOR UPDATE`.
2. Lock every ingredient row `FOR UPDATE`, **ordered by `ingredient_id`**
   — the same deadlock-avoidance ordering `routes/orders.js` uses for
   products.
3. For each line: `UPDATE ingredients SET stock_quantity = stock_quantity − $q WHERE ingredient_id = $1 AND stock_quantity >= $q` — the conditional-write idiom. `rowCount = 0` means insufficient stock: ROLLBACK, 409 naming the ingredient. Insert the `ingredient_movements` row (`PRODUCTION_USE`, `−q`, `unit_cost = average_unit_cost`, `batch_id`).
4. Insert `production_batches` and its lines; `total_cost` summed in
   Postgres from the lines.
5. `UPDATE inventory SET stock_quantity = stock_quantity + produced_quantity`;
   insert `inventory_movements` (`reason = 'PRODUCTION'`, `+produced_quantity`,
   `batch_id`); `syncStockAlert` — exactly what a cancellation restore does
   today, with a different reason.
6. COMMIT.

`inventory_movements` gains two things (migration): `'PRODUCTION'` in
`stock_movement_reason`, and a nullable `batch_id` column next to
`order_id` / `request_id` — the ledger points at its cause, as it already
does for orders and requests.

**Loss is a column on the batch, not a ledger row.** `loss_quantity` never
entered `inventory`, so deducting it from `inventory` would be wrong. The
yield stream (`INVENTORY_REVIEW.md` §8) reads
`SUM(produced_quantity)` vs `SUM(loss_quantity)` from `production_batches`
directly — a cleaner source than the ledger. The existing
`PRODUCTION_LOSS` reason keeps its current meaning: goods that were counted
into stock and were later found defective. The two are different events
and stay separate.

**A batch is immutable once recorded.** No PATCH, no DELETE. A mistake is
corrected the way every other ledger mistake is: a `CORRECTION` on the
ingredient or the product, with a note. This is the same rule that makes
`inventory_movements` trustworthy, and it is what an auditor (or a panel)
expects from a production log.

### Decision 6 — Costing is derived, never stored on the product

- **Batch cost**: `production_batches.total_cost`, stored at record time
  from the snapshotted lines (it cannot change, so storing it is safe).
- **Batch unit cost**: `total_cost / produced_quantity` — computed in the
  query. A batch with `produced_quantity = 0` (everything burned) has a
  cost and no unit cost; the report shows the loss, not a division.
- **Product current cost**: the unit cost of its **most recent batch**.
  A SQL view, `product_costing`, joins each product to its latest batch and
  its price: `unit_cost`, `price`, `margin = price − unit_cost`,
  `margin_percent`. `routes/reports.js` reads the view; nothing writes it.
- **Recipe theoretical cost** (what one batch *should* cost at today's
  average ingredient costs): computed in `GET /api/recipes/:productId` from
  `recipe_ingredients × ingredients.average_unit_cost`, shown on the recipe
  editor so an admin sees the effect of a price change before baking.

### Decision 7 — Roles

| Action | Who | Why |
| --- | --- | --- |
| Create/edit/deactivate ingredients | ADMIN | Master data, like products |
| Record a purchase (stock in + cost) | ADMIN | Money enters the books |
| Record ingredient waste / correction | ADMIN | Same as the finished-goods direct edit today |
| View ingredient stock and movements | ADMIN, CASHIER | Same as finished-goods inventory |
| Create/edit recipes | ADMIN | Master data |
| **Record a production batch** | **ADMIN, CASHIER** | A batch is a fact that happened, like a sale — the cashier records sales without approval today. Requiring approval would mean stock stays wrong until an admin arrives, which is worse than the risk. Every batch names `recorded_by`. |
| View production history and costing | ADMIN, CASHIER | Reports are already both |

This is the one place Phase 9A departs from Phase 5's "cashier proposes,
admin approves". It is deliberate and should be stated in the paper: the
approval workflow exists for *disputed counts*; production is a *recorded
event*. If the adviser disagrees, the fallback is a `PENDING` status on
`production_batches` with admin approval writing the ledgers — the table
shape above does not need to change for that, only the route.

Ingredient low-stock is computed on read (`stock_quantity <=
min_stock_level`) and surfaced in `GET /api/reports/summary` as
`lowIngredients` — no `stock_alerts` rows.

### Decision 8 — `products.shelf_life_days`, now, because the batch gives it meaning

`INVENTORY_REVIEW.md` §4 proposed it for Phase 9. With `produced_at` on
every batch it becomes computable: units produced more than
`shelf_life_days` ago and still in stock are the expected-waste figure,
without lot tracking. Nullable; NULL means "not set", never a guess. Shown
and editable in Product Management. Nothing in this phase acts on it
beyond display — it is captured now so the data exists when the model
needs it.

`inventory.expiration_date` stays as it is (already wired to the
catalogue and checkout since commit 29bbd5a).

### Decision 9 — Every event row says where it came from, so real and assumed data never mix silently

```sql
CREATE TYPE data_source AS ENUM ('RECORDED', 'IMPORTED', 'ASSUMED');
ALTER TABLE orders             ADD COLUMN data_source data_source NOT NULL DEFAULT 'RECORDED';
ALTER TABLE production_batches ADD COLUMN data_source data_source NOT NULL DEFAULT 'RECORDED';
ALTER TABLE ingredient_movements ADD COLUMN data_source data_source NOT NULL DEFAULT 'RECORDED';
```

- `RECORDED` — written by the application as the event happened. Every
  route sets this and only this; the application has no code path that
  writes anything else.
- `IMPORTED` — client-supplied history loaded by a script, if the client
  provides it. Real, but not observed by this system.
- `ASSUMED` — synthetic or assumption-based rows, if the adviser decides
  they are needed. **No script for this exists in this phase.** The value
  is in the enum so the decision, when it is made, is a flag on the row and
  a `WHERE data_source = ...` in the model — not a second database.

The analytics views (Decision 10) carry `data_source` through, and the
demo seed (`scripts/seed-demo-data.mjs`) is changed to write `ASSUMED`
for the orders it creates — it is exactly the kind of data this flag
exists to separate, and today it is indistinguishable from real orders.

### Decision 10 — Analytics-ready means views over the ledgers, not new tables

Three SQL views, in `database/schema.sql` and a migration, all keyed by
`(local_date, product_id)` in `Asia/Manila` (the same `dateRangeSql` /
`localDateSql` discipline `lib/reporting.js` already enforces):

- **`analytics_daily_sales`** — `units_sold` (`ORDER_PLACED` − `ORDER_CANCELLED`
  from `inventory_movements`), `revenue` (from `order_details`, non-cancelled),
  `orders`, `data_source`, and `stocked_out` (BOOLEAN: the running stock for
  that product reached 0 at any point that day, computed from the ledger).
  The stockout flag is the censoring signal `INVENTORY_REVIEW.md` §8 calls
  the single most important input.
- **`analytics_daily_production`** — `batches`, `planned`, `produced`,
  `loss`, `total_cost`, `data_source` from `production_batches`.
- **`analytics_daily_waste`** — `expired`, `spoiled`, `damaged`,
  `production_loss` (post-stocking), `correction` from `inventory_movements`
  by reason.

Views, not materialised tables: nothing to keep in sync, nothing to drift,
and a future model reads them with one `SELECT`. If they are ever slow on a
bakery's data volume, that is the moment to materialise — not before
(Phase 8's Decision 9, unchanged).

`GET /api/reports/analytics?from=&to=&format=csv` exports the three joined
by date and product — the file an adviser or a notebook can read without
touching the database.

---

## Part 3 — Migrations, in order

| # | File | Contents |
| --- | --- | --- |
| 011 | `011_ingredients.sql` | `ingredients`, `ingredient_movement_reason`, `ingredient_movements` (without `batch_id` FK yet), `updated_at` trigger |
| 012 | `012_recipes.sql` | `recipes`, `recipe_ingredients`, `products.shelf_life_days` |
| 013 | `013_production.sql` | `data_source` enum; `production_batches`, `production_batch_ingredients`; `ingredient_movements.batch_id` FK; `stock_movement_reason` `+ 'PRODUCTION'`; `inventory_movements.batch_id`; `orders.data_source` |
| 014 | `014_analytics_views.sql` | `product_costing`, `analytics_daily_sales`, `analytics_daily_production`, `analytics_daily_waste` |

Each folded into `schema.sql` and listed in `database/README.md`, as
migrations 001–010 are. Each idempotent (`IF NOT EXISTS`, `DO $$ … duplicate_object`).

---

## Part 4 — API surface

All under `requireAuth`; roles per Decision 7.

```
GET    /api/ingredients                     list (stock, min, average cost, lowStock computed)
POST   /api/ingredients                     create            ADMIN
PATCH  /api/ingredients/:id                 name/unit/min/is_active   ADMIN
POST   /api/ingredients/:id/purchase        { quantity, unitCost, note }   ADMIN — PURCHASE movement, average updated
POST   /api/ingredients/:id/adjust          { quantity, reason: WASTE|CORRECTION, note }   ADMIN
GET    /api/ingredients/:id/movements       ledger, newest first

GET    /api/recipes/:productId              recipe + lines + theoretical cost (404 if none)
PUT    /api/recipes/:productId              { yieldQuantity, note, ingredients: [{ ingredientId, quantity }] }   ADMIN — replaces lines atomically
DELETE /api/recipes/:productId              ADMIN — allowed at any time: batch lines are snapshotted, and production_batches.recipe_id is ON DELETE SET NULL

POST   /api/production                      { productId, plannedQuantity, producedQuantity, lossQuantity, note, ingredients?: [{ ingredientId, quantityUsed }] }
                                            ingredients omitted = scale the recipe; supplied = the baker's adjusted lines (each must be a recipe ingredient)
GET    /api/production?from=&to=&productId= batches with lines
GET    /api/production/:id                  one batch

GET    /api/reports/production?from=&to=    per-product totals: batches, planned, produced, loss, yield %, total cost, unit cost
GET    /api/reports/costing                 product_costing view + recipe theoretical cost
GET    /api/reports/analytics?from=&to=&format=csv   the three views joined
GET    /api/reports/summary                 + lowIngredients (list, total)
```

Validation follows `lib/validation.js` conventions (`parseId`, 422 with
`errors` per field). Quantities: `NUMERIC` strings in, `Number.isFinite`
and range-checked, three decimals; never JavaScript arithmetic on money —
sums in Postgres, as everywhere else.

---

## Part 5 — UI

Fits the existing shell; no new design.

- **Ingredients** (new module; ADMIN, CASHIER): table — name, unit, stock,
  min, average cost, low-stock badge — with column priorities; ADMIN gets
  "Purchase" (quantity, unit cost, note) and "Adjust" (waste/correction)
  forms, and add/edit ingredient. Movements per ingredient in the detail
  overlay, same list/detail shape as Order Management.
- **Recipes**: inside Product Management (ADMIN) — a "Recipe" action per
  product opening the editor: yield, lines (ingredient select + quantity +
  unit shown), theoretical cost per batch and per unit next to the price.
- **Production** (new module; ADMIN, CASHIER): "Record a batch" form —
  product (only those with a recipe; others say "no recipe yet"), planned
  quantity, the scaled ingredient lines editable, produced and loss
  quantities, note. Below it, the batch history with cost and yield.
- **Product Management**: `shelf_life_days` field; current unit cost and
  margin column from `product_costing`.
- **Reporting & Analytics**: a "Production" tab (yield and cost per
  product over the range) and the CSV export of the analytics views.
- **Dashboard**: "Low ingredients" tile and list next to low stock.

---

## Part 6 — Tests

`node:test` against the real database, as every route has. The ones that
matter:

- Ingredient ledger reconciles: after purchase, waste, correction and
  production, `SUM(ingredient_movements.quantity_change) = stock_quantity`.
- Moving average: two purchases at different prices give the expected
  average to four decimals; waste does not change it.
- Production is atomic: a batch whose second ingredient is short leaves
  `inventory`, every ingredient, and both ledgers untouched (rowCount = 0
  → ROLLBACK → 409 naming the ingredient).
- Production writes exactly one `PRODUCTION` movement with `batch_id`, and
  `syncStockAlert` closes an open low-stock alert when the batch clears it.
- Lines snapshot: editing the recipe after a batch does not change the
  batch's lines or `total_cost`.
- Recipe scaling: planned 60 on a yield-30 recipe doubles every line;
  supplied lines override; a line for an ingredient not in the recipe is 422.
- Roles: CASHIER can record a batch and cannot purchase; CUSTOMER and
  DELIVERY_PERSONNEL reach none of it.
- Views: a known day of seeded events produces the expected
  `analytics_daily_sales` row, including `stocked_out = true` on a day the
  ledger hit zero, and `data_source` carried through.
- Seed: orders and batches it creates are `ASSUMED`; `clear-demo-data.mjs`
  removes them and their ingredient movements.

---

## Part 7 — What this phase deliberately leaves out

- Any forecast, prediction, trend line, or "recommended restock" figure.
- Any script that generates assumed history. The `ASSUMED` value exists;
  nothing writes it except the demo seed, which is clearly not client data.
- Supplier records, purchase orders, or invoices — a purchase is a
  movement with a cost and a note.
- Batch editing or deletion (Decision 5).
- FIFO / lots (declined in `INVENTORY_REVIEW.md` §4; unchanged).
- Unit conversion between ingredients' units — a recipe line is in the
  ingredient's own unit; entering it in another unit is the baker's
  arithmetic, not the system's.

---

## Open questions for the adviser / client before implementation

1. **Approval on production** (Decision 7): direct recording by cashier
   acceptable, or must an admin approve?
2. **Cost method** (Decision 3): moving average acceptable for the paper?
3. **Recipe scope**: one recipe per product+variant is what `products`
   supports (each variant is its own product row). Confirm the bakery
   thinks of "Broas 1 Gallon" and "Broas Pack" as separate recipes, or as
   one dough with different packaging — if the latter, a `packaging`
   step is a later phase, not this one.
4. **Historical data**: if the client's production history arrives as a
   spreadsheet, it will be loaded as `IMPORTED` batches through a one-off
   script against these tables — confirm the columns they can supply
   (date, product, quantity made, quantity lost, ingredients?) so the
   tables above are shaped to receive them.
