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

### Decision 4 — A recipe is a dough, not a product; products map onto it with a packaging ratio

Confirmed with the bakery: "Broas 1 Gallon", "Broas Pack" and "Broas
Plate" are one dough packed three ways; "Pandesal Small" and "Pandesal
Big" are one dough portioned two ways. A recipe per sellable product would
make the baker enter the same flour three times and would put the yield in
the wrong unit. So:

```sql
CREATE TABLE recipes (
  recipe_id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name           VARCHAR(150) NOT NULL UNIQUE,                 -- 'Broas dough', 'Pandesal dough'
  base_unit      VARCHAR(30)  NOT NULL,                        -- what one batch is counted in: 'piece', 'gram', 'tray'
  yield_quantity NUMERIC(12,3) NOT NULL CHECK (yield_quantity > 0),  -- base units one batch makes
  note           TEXT,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at / updated_at TIMESTAMPTZ
);

CREATE TABLE recipe_ingredients (
  recipe_id     BIGINT NOT NULL REFERENCES recipes(recipe_id) ON DELETE CASCADE,
  ingredient_id BIGINT NOT NULL REFERENCES ingredients(ingredient_id),
  quantity      NUMERIC(12,3) NOT NULL CHECK (quantity > 0),   -- in the ingredient's unit, per batch
  PRIMARY KEY (recipe_id, ingredient_id)
);

ALTER TABLE products
  ADD COLUMN recipe_id      BIGINT REFERENCES recipes(recipe_id) ON DELETE SET NULL,
  ADD COLUMN units_per_item NUMERIC(12,3) CHECK (units_per_item > 0),   -- base units in ONE sellable item: gallon = 120 pieces, pack = 12
  ADD CONSTRAINT products_packaging_check CHECK ((recipe_id IS NULL) = (units_per_item IS NULL));
```

A product with `recipe_id` NULL is bought-in or not yet mapped: it can be
restocked (`RESTOCK`) but not produced. A product with a recipe is
produced by running that recipe and packing the base units into items.

`base_unit` is free text chosen per recipe. For Broas the natural unit is
"piece" (gallon = 120, pack = 12, plate = 10). For pandesal it may be
"gram of dough" (small = 30, big = 60) — the ratio does the portioning
arithmetic, so one recipe covers both sizes.

**No recipe versioning table.** Every batch snapshots the ingredient
quantities it used (Decision 5). The recipe is the default; the batch is
the truth — the `order_details` pattern.

### Decision 5 — A production batch runs one recipe, packs into several products, and is applied on admin approval

Confirmed with the adviser: a cashier's batch is **proposed**, an admin
**approves** it, and only approval touches stock — the same
propose/approve shape `inventory_change_requests` already has (Phase 5,
Step 6). An admin recording a batch approves it in the same request.

```sql
CREATE TYPE production_batch_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

CREATE TABLE production_batches (
  batch_id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  recipe_id         BIGINT REFERENCES recipes(recipe_id) ON DELETE SET NULL,
  recipe_name       VARCHAR(150) NOT NULL,                         -- snapshot: the recipe may be renamed or deleted later
  base_unit         VARCHAR(30)  NOT NULL,                         -- snapshot
  planned_quantity  NUMERIC(12,3) NOT NULL CHECK (planned_quantity > 0),   -- base units the batch was meant to make
  produced_quantity NUMERIC(12,3) NOT NULL CHECK (produced_quantity >= 0),  -- base units that came out good
  loss_quantity     NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (loss_quantity >= 0),  -- base units burned/defective, never packed
  total_cost        NUMERIC(12,2) NOT NULL DEFAULT 0,               -- SUM(lines.quantity_used × lines.unit_cost), filled on approval
  status            production_batch_status NOT NULL DEFAULT 'PENDING',
  recorded_by       BIGINT NOT NULL REFERENCES users(user_id),
  reviewed_by       BIGINT REFERENCES users(user_id),
  reviewed_at       TIMESTAMPTZ,
  reviewer_note     TEXT,
  produced_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,   -- when it was baked (the cashier may backdate within the day)
  note              TEXT,
  data_source       data_source NOT NULL DEFAULT 'RECORDED',         -- Decision 9
  created_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- What went in. Quantities are what the baker says was used (the recipe
-- scaled to planned_quantity by default, adjustable before submitting).
-- unit_cost is NULL while PENDING and filled from the ingredient's
-- average at the moment of approval — cost is a fact of when stock moved.
CREATE TABLE production_batch_ingredients (
  batch_id      BIGINT NOT NULL REFERENCES production_batches(batch_id) ON DELETE CASCADE,
  ingredient_id BIGINT NOT NULL REFERENCES ingredients(ingredient_id),
  quantity_used NUMERIC(12,3) NOT NULL CHECK (quantity_used > 0),
  unit_cost     NUMERIC(12,4),
  PRIMARY KEY (batch_id, ingredient_id)
);

-- What came out, packed. units_per_item is snapshotted so a later change
-- to a product's packaging ratio cannot restate an old batch's yield.
CREATE TABLE production_batch_outputs (
  batch_id       BIGINT NOT NULL REFERENCES production_batches(batch_id) ON DELETE CASCADE,
  product_id     BIGINT NOT NULL REFERENCES products(product_id),
  quantity       INTEGER NOT NULL CHECK (quantity > 0),            -- sellable items packed
  units_per_item NUMERIC(12,3) NOT NULL CHECK (units_per_item > 0),
  PRIMARY KEY (batch_id, product_id)
);
```

Rule enforced at submission: `SUM(outputs.quantity × units_per_item) =
produced_quantity` (base units in equals base units packed). A batch that
does not pack everything records the unpacked remainder as an output to a
per-piece product if the bakery sells one, or as loss. The route refuses
a mismatch with 422 rather than guessing where the difference went.

**Approval — `PATCH /api/production/:id` `{ status: 'APPROVED' | 'REJECTED' }`
(ADMIN) — is one transaction, in this order:**

1. Claim the batch: `UPDATE production_batches SET status = 'APPROVED', reviewed_by, reviewed_at WHERE batch_id = $1 AND status = 'PENDING'`. `rowCount = 0` → 409 (already reviewed). The conditional claim, as everywhere else.
2. Lock every ingredient on the batch `FOR UPDATE`, **ordered by `ingredient_id`**.
3. For each line: `UPDATE ingredients SET stock_quantity = stock_quantity − $q WHERE ingredient_id = $1 AND stock_quantity >= $q`. `rowCount = 0` → ROLLBACK (the claim rolls back too), 409 naming the ingredient and the shortfall. Write `ingredient_movements` (`PRODUCTION_USE`, `−q`, `unit_cost = average_unit_cost`, `batch_id`); set the line's `unit_cost`.
4. `total_cost` = SUM over lines, in Postgres.
5. Lock the output products' `inventory` rows **ordered by `product_id`**; for each output `UPDATE inventory SET stock_quantity = stock_quantity + quantity`; write `inventory_movements` (`reason = 'PRODUCTION'`, `+quantity`, `batch_id`); `syncStockAlert` — the same call a cancellation restore makes.
6. COMMIT.

Lock order across the two ledgers is ingredients first, then inventory —
recorded here so a future route touching both takes them the same way
(the ABBA lesson from `PHASE7_PLAN.md`, Decision 2).

A CASHIER may `PATCH` their own PENDING batch to `CANCELLED` (withdraw),
exactly as they may withdraw a change request since commit 29bbd5a.

`inventory_movements` gains `'PRODUCTION'` in `stock_movement_reason` and a
nullable `batch_id` column beside `order_id` / `request_id`.

**Loss never enters `inventory`.** `loss_quantity` is base units that were
baked and discarded before packing; the yield stream reads
`SUM(produced_quantity)` vs `SUM(loss_quantity)` from
`production_batches`. The existing `PRODUCTION_LOSS` ledger reason keeps
its meaning: packed goods later found defective.

**An approved batch is immutable.** Corrections go through the ledgers
(`CORRECTION` on an ingredient or a product, with a note), never by
editing the batch.

### Decision 6 — Costing is derived, never stored on the product

- **Batch cost**: `production_batches.total_cost`, set on approval from
  the snapshotted lines. It cannot change afterwards, so storing it is safe.
- **Cost per base unit**: `total_cost / produced_quantity`. A batch with
  `produced_quantity = 0` (everything burned) has a cost and no unit cost;
  the report shows the loss, not a division.
- **Cost per sellable item** for each output of a batch: cost per base
  unit × `units_per_item`. A gallon of 120 pieces costs ten times a pack of
  12, from the same batch, automatically.
- **Product current cost**: its cost per item from the **most recent
  approved batch** that packed it. A SQL view `product_costing` — product,
  latest batch, `unit_cost`, `price`, `margin`, `margin_percent`.
  `routes/reports.js` reads it; nothing writes it.
- **Recipe theoretical cost** (what one batch *should* cost at today's
  ingredient averages, and per base unit): computed in
  `GET /api/recipes/:id` from `recipe_ingredients × ingredients.average_unit_cost`,
  shown on the recipe editor next to each mapped product's price.

### Decision 7 — Roles

| Action | Who | Why |
| --- | --- | --- |
| Create/edit/deactivate ingredients | ADMIN | Master data, like products |
| Record a purchase (stock in + cost) | ADMIN | Money enters the books |
| Record ingredient waste / correction | ADMIN | Same as the finished-goods direct edit today |
| View ingredient stock and movements | ADMIN, CASHIER | Same as finished-goods inventory |
| Create/edit recipes; map products to a recipe | ADMIN | Master data |
| Propose a production batch | CASHIER, ADMIN | The person at the oven records it |
| Approve / reject a batch (writes both ledgers) | ADMIN | Confirmed with the adviser: the same propose/approve gate finished-goods changes have |
| Withdraw own PENDING batch | CASHIER | Mirrors change-request withdrawal |
| View production history and costing | ADMIN, CASHIER | Reports are already both |

An ADMIN's own `POST /api/production` is created and approved in one
request (status `APPROVED`, `reviewed_by` = self) — there is nobody
above them to wait for.

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
| 011 | `011_ingredients.sql` | `ingredients`, `ingredient_movement_reason`, `ingredient_movements` (no `batch_id` yet), `updated_at` trigger |
| 012 | `012_recipes.sql` | `recipes`, `recipe_ingredients`, `products.recipe_id` / `units_per_item` + packaging CHECK, `products.shelf_life_days` |
| 013 | `013_production.sql` | `data_source` enum; `production_batch_status`; `production_batches`, `production_batch_ingredients`, `production_batch_outputs`; `ingredient_movements.batch_id`; `stock_movement_reason + 'PRODUCTION'`; `inventory_movements.batch_id`; `orders.data_source`, `ingredient_movements.data_source` |
| 014 | `014_analytics_views.sql` | `product_costing`, `analytics_daily_sales`, `analytics_daily_production`, `analytics_daily_waste` |

Each folded into `schema.sql` and listed in `database/README.md`, as
migrations 001–010 are. Each idempotent (`IF NOT EXISTS`, `DO $$ … duplicate_object`).

## Part 4 — API surface

All under `requireAuth`; roles per Decision 7.

```
GET    /api/ingredients                     list (stock, min, average cost, lowStock computed); ?includeInactive=true
POST   /api/ingredients                     { name, unit, minStockLevel }                     ADMIN
PATCH  /api/ingredients/:id                 name / unit / minStockLevel / isActive            ADMIN
POST   /api/ingredients/:id/purchase        { quantity, unitCost, note }                      ADMIN — PURCHASE, average updated
POST   /api/ingredients/:id/adjust          { quantityChange, reason: WASTE|CORRECTION, note } ADMIN — WASTE must be negative
GET    /api/ingredients/:id/movements       ledger, newest first, limit/offset

GET    /api/recipes                         list, with mapped products and theoretical cost
GET    /api/recipes/:id                     recipe + lines + products + theoretical cost per batch and per base unit
POST   /api/recipes                         { name, baseUnit, yieldQuantity, note, ingredients: [{ ingredientId, quantity }] }   ADMIN
PUT    /api/recipes/:id                     same body — replaces lines atomically                                             ADMIN
PATCH  /api/recipes/:id                     { isActive }                                                                       ADMIN
PATCH  /api/products/:id                    + recipeId (nullable) and unitsPerItem — both or neither (the CHECK)              ADMIN, existing route

POST   /api/production                      { recipeId, plannedQuantity, producedQuantity, lossQuantity, producedAt?, note,
                                              ingredients?: [{ ingredientId, quantityUsed }],   omitted = recipe scaled to plannedQuantity
                                              outputs: [{ productId, quantity }] }               products mapped to this recipe; sum must equal producedQuantity
                                            CASHIER → PENDING; ADMIN → APPROVED and applied
PATCH  /api/production/:id                  { status: APPROVED|REJECTED, reviewerNote }  ADMIN;   { status: CANCELLED }  CASHIER, own PENDING
GET    /api/production?status=&from=&to=    batches with lines and outputs
GET    /api/production/:id                  one batch

GET    /api/reports/production?from=&to=    per recipe and per product: batches, planned, produced, loss, yield %, total cost, cost per item
GET    /api/reports/costing                 product_costing view + recipe theoretical cost
GET    /api/reports/analytics?from=&to=&format=csv   the three views joined by (date, product)
GET    /api/reports/summary                 + lowIngredients (list, total), pendingBatches (count)
```

Validation follows `lib/validation.js` conventions (`parseId`, 422 with
`errors` per field). Quantities arrive as strings or numbers, are checked
with `Number.isFinite`, range, and at most three decimals, and are passed
to Postgres as strings so `NUMERIC` stays exact; sums happen in Postgres.

## Part 5 — UI

Fits the existing shell; no new design.

- **Ingredients** (new module; ADMIN, CASHIER): table — name, unit, stock,
  min, average cost, low-stock badge — with column priorities; ADMIN gets
  "Purchase" (quantity, unit cost, note) and "Adjust" (waste/correction)
  forms in the detail overlay, plus add/edit. Movements per ingredient in
  the same overlay. Same list/detail shape as Order Management.
- **Recipes** (new module; ADMIN): recipe list; editor with name, base
  unit, yield, ingredient lines (select + quantity + unit), theoretical
  cost per batch and per base unit; the products mapped to it with their
  `units_per_item` and the resulting cost per item next to the price.
- **Product Management**: "Recipe" and "Units per item" fields on the
  edit form; `shelf_life_days`; current unit cost and margin column from
  `product_costing`.
- **Production** (new module; ADMIN, CASHIER): "Record a batch" —
  recipe select, planned base units, the scaled ingredient lines
  (editable), produced and loss base units, outputs (one row per mapped
  product, quantity of items; a running "packed = produced" check),
  optional produced-at time, note. Below it the batch list with status;
  ADMIN sees Approve/Reject on PENDING, CASHIER sees Withdraw on their own.
- **Reporting & Analytics**: "Production" tab (yield and cost per recipe
  and product over the range) and the analytics CSV export.
- **Dashboard**: "Low ingredients" tile and list; "Batches to approve"
  tile for ADMIN.

## Part 6 — Tests

`node:test` against the real database, as every route has. The ones that
matter:

- Ingredient ledger reconciles: after purchase, waste, correction and an
  approved batch, `SUM(ingredient_movements.quantity_change) = stock_quantity`.
- Moving average: two purchases at different prices give the expected
  average to four decimals; waste does not change it.
- A cashier's batch is PENDING and touches nothing; approval writes both
  ledgers; rejection writes nothing; a second review is 409; a cashier
  cannot approve (403); a cashier can withdraw their own PENDING batch
  and not another cashier's (404).
- Approval is atomic: a batch whose second ingredient is short leaves
  `inventory`, every ingredient, both ledgers and the batch status
  untouched (rowCount = 0 → ROLLBACK → 409 naming the ingredient).
- Outputs must pack the produced quantity exactly (422 otherwise); each
  output product must be mapped to the batch's recipe (422 otherwise).
- Approval writes one `PRODUCTION` movement per output with `batch_id`,
  and `syncStockAlert` closes an open low-stock alert the batch clears.
- Lines snapshot: editing the recipe or a product's `units_per_item` after
  approval changes neither the batch's lines, outputs, nor `total_cost`.
- Recipe scaling: planned 2× yield doubles every line; supplied lines
  override; a line for an ingredient not in the recipe is 422.
- `product_costing`: the latest approved batch's per-item cost, allocated
  by `units_per_item` (gallon = 10 × pack when 120 vs 12).
- Views: a known day of seeded events produces the expected
  `analytics_daily_sales` row, including `stocked_out = true` on a day the
  ledger hit zero, and `data_source` carried through.
- Seed: orders and batches it creates are `ASSUMED`; `clear-demo-data.mjs`
  removes them and their ingredient movements.

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

## Decisions confirmed (2026-09-20)

1. **Production is approved by an admin** — Decision 5 and 7 as written.
2. **Moving-average ingredient cost** — accepted for the paper.
3. **One dough, several packagings** — Decision 4: recipes are doughs;
   products map to a recipe with `units_per_item`.
4. **Historical data import** — deferred. Nothing in this phase depends
   on it; when the client's columns are known, an `IMPORTED` loader is a
   script against these tables, not a schema change.
