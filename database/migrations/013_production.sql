-- Migration 013 — production batches, and the seam into the finished-goods ledger
--
-- Apply with:
--   psql -U postgres -d pectrack -f database/migrations/013_production.sql
--
-- Phase 9A, Decisions 5, 7 and 9. A production batch runs one recipe,
-- consumes ingredients, and packs base units into sellable products. It is
-- PROPOSED by whoever is at the oven and APPROVED by an admin (confirmed
-- with the adviser — the same propose/approve gate inventory_change_requests
-- already has), and only approval moves stock: ingredient_movements
-- (PRODUCTION_USE) and inventory_movements (the new PRODUCTION reason)
-- are written in one transaction by routes/production.js.
--
-- This is the ONE integration point with the existing order/inventory
-- modules: a batch writes the inventory_movements row an admin's RESTOCK
-- writes today, with a reason that says what it is and a batch_id that
-- says which batch. Everything downstream — order deduction, low-stock
-- alerts, cancellation restores, the inventory report — reads
-- inventory.stock_quantity and the ledger exactly as before.

BEGIN;

-- ---------------------------------------------------------------------------
-- Decision 9 — where a row came from. The application writes only
-- RECORDED. IMPORTED is for client history loaded by a script; ASSUMED is
-- for synthetic rows if the adviser decides they are needed (no such
-- script exists). The demo seed writes ASSUMED, because that is exactly
-- what it is. A model filters on this column rather than guessing.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  CREATE TYPE data_source AS ENUM ('RECORDED', 'IMPORTED', 'ASSUMED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE production_batch_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS production_batches (
  batch_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  recipe_id BIGINT REFERENCES recipes(recipe_id) ON DELETE SET NULL,
  -- Snapshots: the recipe may be renamed or deleted later; the batch
  -- still has to say what it was.
  recipe_name VARCHAR(150) NOT NULL,
  base_unit VARCHAR(30) NOT NULL,
  planned_quantity NUMERIC(12, 3) NOT NULL CHECK (planned_quantity > 0),
  produced_quantity NUMERIC(12, 3) NOT NULL CHECK (produced_quantity >= 0),
  -- Base units baked and discarded before packing. Never entered
  -- inventory, so never a ledger row: the yield stream reads it from here.
  loss_quantity NUMERIC(12, 3) NOT NULL DEFAULT 0 CHECK (loss_quantity >= 0),
  -- SUM(lines.quantity_used * lines.unit_cost), filled on approval.
  total_cost NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (total_cost >= 0),
  status production_batch_status NOT NULL DEFAULT 'PENDING',
  recorded_by BIGINT NOT NULL REFERENCES users(user_id),
  reviewed_by BIGINT REFERENCES users(user_id),
  reviewed_at TIMESTAMPTZ,
  reviewer_note TEXT,
  -- When it was baked. May be earlier than created_at (recorded after the
  -- morning bake), never later.
  produced_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  note TEXT,
  data_source data_source NOT NULL DEFAULT 'RECORDED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS production_batches_status_idx ON production_batches (status, created_at DESC);
CREATE INDEX IF NOT EXISTS production_batches_produced_at_idx ON production_batches (produced_at DESC);

-- What went in: the recipe scaled to planned_quantity by default, adjusted
-- by the baker before submitting. unit_cost is NULL while PENDING and set
-- from ingredients.average_unit_cost at approval — cost is a fact of the
-- moment stock moved, not the moment the form was filled.
CREATE TABLE IF NOT EXISTS production_batch_ingredients (
  batch_id BIGINT NOT NULL REFERENCES production_batches(batch_id) ON DELETE CASCADE,
  ingredient_id BIGINT NOT NULL REFERENCES ingredients(ingredient_id),
  quantity_used NUMERIC(12, 3) NOT NULL CHECK (quantity_used > 0),
  unit_cost NUMERIC(12, 4) CHECK (unit_cost >= 0),
  PRIMARY KEY (batch_id, ingredient_id)
);

-- What came out, packed. units_per_item is snapshotted so a later change
-- to a product's packaging ratio cannot restate an old batch's yield.
-- routes/production.js enforces SUM(quantity * units_per_item) =
-- produced_quantity at submission.
CREATE TABLE IF NOT EXISTS production_batch_outputs (
  batch_id BIGINT NOT NULL REFERENCES production_batches(batch_id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES products(product_id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  units_per_item NUMERIC(12, 3) NOT NULL CHECK (units_per_item > 0),
  PRIMARY KEY (batch_id, product_id)
);

-- Both ledgers point at the batch that caused a row, the way
-- inventory_movements already points at order_id / request_id.
ALTER TABLE ingredient_movements
  ADD COLUMN IF NOT EXISTS batch_id BIGINT REFERENCES production_batches(batch_id),
  ADD COLUMN IF NOT EXISTS data_source data_source NOT NULL DEFAULT 'RECORDED';

ALTER TYPE stock_movement_reason ADD VALUE IF NOT EXISTS 'PRODUCTION';

-- data_source on this ledger too: the demo seed's RESTOCK / SPOILAGE
-- rows and the ORDER_PLACED rows of its orders are not real waste or
-- real demand, and analytics_daily_waste must be able to say so.
ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS batch_id BIGINT REFERENCES production_batches(batch_id),
  ADD COLUMN IF NOT EXISTS data_source data_source NOT NULL DEFAULT 'RECORDED';

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS data_source data_source NOT NULL DEFAULT 'RECORDED';

COMMIT;
