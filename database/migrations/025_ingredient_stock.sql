-- Migration 025 — ingredient stock
--
-- Apply with psql:
--   psql -U postgres -d pectrack -f database/migrations/025_ingredient_stock.sql
--
-- CLIENT_REVISIONS_PLAN.md, R5. The client (2026-10-15) wants the bakery's
-- ingredients counted too: flour, sugar, eggs and the rest. STOCK ONLY —
-- no recipes, no production batches and no costing, which stay out of
-- scope (migration 022 removed them). Nothing deducts an ingredient
-- automatically; staff record what came in, what was used and what was
-- thrown out.
--
-- Same rule as finished goods: ingredients.stock_quantity is never changed
-- without an ingredient_movements row in the same transaction, so the
-- ledger always sums to the figure on the shelf.

BEGIN;

CREATE TYPE ingredient_movement_reason AS ENUM ('RESTOCK', 'USAGE', 'REJECT', 'CORRECTION');

CREATE TABLE ingredients (
  ingredient_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(150) NOT NULL UNIQUE,
  -- kg, g, L, mL, pc, pack, sack, tray — checked by routes/ingredients.js,
  -- not an enum, so a new unit is a line of code, not a migration.
  unit VARCHAR(20) NOT NULL,
  -- NUMERIC(12,3): flour is 12.5 kg.
  stock_quantity NUMERIC(12, 3) NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  min_stock_level NUMERIC(12, 3) NOT NULL DEFAULT 0 CHECK (min_stock_level >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER ingredients_set_updated_at
  BEFORE UPDATE ON ingredients
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RESTOCK adds, USAGE and REJECT remove, CORRECTION (a recount) goes
-- either way. data_source keeps the demo seed's rows separable, as on the
-- product ledger.
CREATE TABLE ingredient_movements (
  movement_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ingredient_id BIGINT NOT NULL REFERENCES ingredients(ingredient_id),
  changed_by BIGINT NOT NULL REFERENCES users(user_id),
  quantity_change NUMERIC(12, 3) NOT NULL CHECK (quantity_change <> 0),
  reason ingredient_movement_reason NOT NULL,
  note TEXT,
  data_source data_source NOT NULL DEFAULT 'RECORDED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (reason = 'RESTOCK' AND quantity_change > 0)
    OR (reason IN ('USAGE', 'REJECT') AND quantity_change < 0)
    OR reason = 'CORRECTION'
  )
);

CREATE INDEX ingredient_movements_ingredient_id_idx ON ingredient_movements (ingredient_id, created_at DESC);
CREATE INDEX ingredient_movements_created_at_idx ON ingredient_movements (created_at DESC);

COMMIT;
