-- Migration 012 — recipes (doughs) and how products pack onto them
--
-- Apply with:
--   psql -U postgres -d pectrack -f database/migrations/012_recipes.sql
--
-- Phase 9A, Decisions 4 and 8. Confirmed with the bakery: "Broas 1 Gallon",
-- "Broas Pack" and "Broas Plate" are ONE dough packed three ways, and
-- "Pandesal Small" / "Pandesal Big" are one dough portioned two ways. So a
-- recipe is a dough with a yield in a base unit of its own choosing
-- (pieces, grams of dough, trays), and each sellable product says how many
-- base units one item holds. A batch then runs one recipe and packs into
-- several products, and cost per item follows from the ratio.
--
-- There is no recipe-version table on purpose: every approved batch
-- snapshots the ingredient quantities and packaging ratios it actually
-- used (migration 013), the same way order_details snapshots unit_price.
-- The recipe is the default; the batch is the record.

BEGIN;

CREATE TABLE IF NOT EXISTS recipes (
  recipe_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(150) NOT NULL UNIQUE,
  base_unit VARCHAR(30) NOT NULL,
  yield_quantity NUMERIC(12, 3) NOT NULL CHECK (yield_quantity > 0),
  note TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DROP TRIGGER IF EXISTS recipes_set_updated_at ON recipes;
CREATE TRIGGER recipes_set_updated_at
  BEFORE UPDATE ON recipes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Quantities are per batch, in the ingredient's own unit.
CREATE TABLE IF NOT EXISTS recipe_ingredients (
  recipe_id BIGINT NOT NULL REFERENCES recipes(recipe_id) ON DELETE CASCADE,
  ingredient_id BIGINT NOT NULL REFERENCES ingredients(ingredient_id),
  quantity NUMERIC(12, 3) NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (recipe_id, ingredient_id)
);

-- A product with recipe_id NULL is bought-in (or not yet mapped): it can
-- be restocked but not produced. A recipe always comes with a ratio (the
-- CHECK); the reverse is deliberately NOT enforced, because recipes.recipe_id
-- is ON DELETE SET NULL and a two-way CHECK would make deleting a recipe
-- fail on every product that still carried its ratio. A ratio with no
-- recipe is inert — routes/products.js clears both together anyway.
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS recipe_id BIGINT REFERENCES recipes(recipe_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS units_per_item NUMERIC(12, 3) CHECK (units_per_item > 0),
  -- Decision 8 — captured now so the data exists when analytics needs it;
  -- NULL means "not set", never a guess. Nothing acts on it yet.
  ADD COLUMN IF NOT EXISTS shelf_life_days INTEGER CHECK (shelf_life_days > 0);

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_packaging_check;
ALTER TABLE products
  ADD CONSTRAINT products_packaging_check CHECK (recipe_id IS NULL OR units_per_item IS NOT NULL);

CREATE INDEX IF NOT EXISTS products_recipe_id_idx ON products (recipe_id);

COMMIT;
