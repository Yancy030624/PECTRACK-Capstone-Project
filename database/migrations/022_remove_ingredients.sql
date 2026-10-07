-- Migration 022 — remove ingredients, recipes and production batches
--
-- Apply with:
--   psql -U postgres -d pectrack -f database/migrations/022_remove_ingredients.sql
--
-- The adviser ruled raw-material tracking out of the paper's scope: the
-- system inventories finished products only. Ingredients, recipes,
-- production batches and the costing built on them (migrations 011–014)
-- are removed, and the gap is recorded in the paper's limitations.
--
-- THIS DELETES DATA. Every ingredient, recipe, batch and their ledgers is
-- dropped. Finished-product stock is untouched: inventory, its movement
-- ledger (including rows a production batch once wrote, reason
-- PRODUCTION / PRODUCTION_LOSS), orders and sales all stay.
--
-- Kept on purpose:
--   - the data_source type — orders and inventory_movements still use it;
--   - analytics_daily_sales / analytics_daily_waste — product views the
--     forecaster and reports read;
--   - products.shelf_life_days — a property of the product itself;
--   - the PRODUCTION and PRODUCTION_LOSS values of stock_movement_reason,
--     because past ledger rows carry them and Postgres cannot drop an enum
--     value without rebuilding the type.
--
-- Safe to run twice: every statement is IF EXISTS.

BEGIN;

-- Views built on the batch tables.
DROP VIEW IF EXISTS product_costing;
DROP VIEW IF EXISTS analytics_daily_output;
DROP VIEW IF EXISTS analytics_daily_production;

-- The links from the product ledger and products to what is going away.
ALTER TABLE inventory_movements DROP COLUMN IF EXISTS batch_id;
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_packaging_check;
DROP INDEX IF EXISTS products_recipe_id_idx;
ALTER TABLE products DROP COLUMN IF EXISTS recipe_id;
ALTER TABLE products DROP COLUMN IF EXISTS units_per_item;

-- Children before parents.
DROP TABLE IF EXISTS ingredient_movements;
DROP TABLE IF EXISTS production_batch_ingredients;
DROP TABLE IF EXISTS production_batch_outputs;
DROP TABLE IF EXISTS production_batches;
DROP TABLE IF EXISTS recipe_ingredients;
DROP TABLE IF EXISTS recipes;
DROP TABLE IF EXISTS ingredients;

DROP TYPE IF EXISTS ingredient_movement_reason;
DROP TYPE IF EXISTS production_batch_status;

COMMIT;
