-- Migration 011 — ingredient inventory and its movement ledger
--
-- Apply with:
--   psql -U postgres -d pectrack -f database/migrations/011_ingredients.sql
--
-- Phase 9A (RULES-PLANS/PHASE9A_DATA_FOUNDATION_PLAN.md, Decisions 1–3).
-- Finished goods have had a reconciled ledger since Phase 5; what goes
-- INTO them had no record at all. This adds the raw-material side with the
-- same shape: a row per ingredient holding the current figure, and a
-- signed ledger that must always sum to it.
--
-- Ingredients are NOT products: not sold, no price, measured in kilograms
-- and litres rather than pieces — so they get their own table rather than
-- rows in `inventory` (whose product_id is NOT NULL and would put flour on
-- the storefront), and their own reason enum rather than
-- stock_movement_reason (whose ORDER_PLACED means nothing for flour).
--
-- NUMERIC(12,3) for quantities — flour is 12.5 kg — and NUMERIC(12,4) for
-- unit cost so 0.125 kg at ₱48.50/kg stays exact until a batch total is
-- rounded to centavos.

BEGIN;

DO $$
BEGIN
  CREATE TYPE ingredient_movement_reason AS ENUM ('PURCHASE', 'PRODUCTION_USE', 'WASTE', 'CORRECTION');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS ingredients (
  ingredient_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(150) NOT NULL UNIQUE,
  -- 'kg', 'g', 'L', 'mL', 'pc' — validated by routes/ingredients.js, not
  -- an enum, so a unit the bakery uses that this list did not anticipate
  -- does not need a migration.
  unit VARCHAR(20) NOT NULL,
  stock_quantity NUMERIC(12, 3) NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  min_stock_level NUMERIC(12, 3) NOT NULL DEFAULT 0 CHECK (min_stock_level >= 0),
  -- Moving average, updated on every PURCHASE (Decision 3). Production
  -- consumes at this figure; waste and corrections leave it alone.
  average_unit_cost NUMERIC(12, 4) NOT NULL DEFAULT 0 CHECK (average_unit_cost >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DROP TRIGGER IF EXISTS ingredients_set_updated_at ON ingredients;
CREATE TRIGGER ingredients_set_updated_at
  BEFORE UPDATE ON ingredients
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Same invariant as inventory_movements: ingredients.stock_quantity is
-- never written without a row here in the same transaction, and
-- SUM(quantity_change) per ingredient equals stock_quantity.
-- batch_id is added by migration 013 once production_batches exists.
CREATE TABLE IF NOT EXISTS ingredient_movements (
  movement_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ingredient_id BIGINT NOT NULL REFERENCES ingredients(ingredient_id),
  changed_by BIGINT NOT NULL REFERENCES users(user_id),
  quantity_change NUMERIC(12, 3) NOT NULL CHECK (quantity_change <> 0),
  reason ingredient_movement_reason NOT NULL,
  -- The cost snapshot — the ingredient analogue of order_details.unit_price.
  -- PURCHASE: the price paid per unit. PRODUCTION_USE: the average cost
  -- consumed. NULL for WASTE and CORRECTION.
  unit_cost NUMERIC(12, 4) CHECK (unit_cost >= 0),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ingredient_movements_ingredient_id_idx
  ON ingredient_movements (ingredient_id, created_at DESC);

COMMIT;
