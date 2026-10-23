-- Migration 035 — soft breads and hard breads (RULES-PLANS/DAILY_STOCK_PLAN.md)
--
-- Apply with psql:
--   psql -U postgres -d pectrack -f database/migrations/035_soft_hard_breads.sql
--
-- The client, 2026-10-23: soft breads (keep ~3 days) start every day at a
-- standard stock and are never restocked during the day; hard breads keep
-- and are produced while at or below a minimum (~200) until a stop level
-- (~500–700).
--
--   products.stock_type        SOFT or HARD (existing products: SOFT)
--   inventory.standard_stock   soft breads: the daily standard (0 = not set)
--   inventory.target_stock     hard breads: the stop level (0 = not set)
--   daily_stock_resets         one row per Manila day the 5:00 AM top-up ran
--   reason DAILY_STOCK         the top-up's ledger rows
--
-- Additive only. ADD VALUE cannot run inside a transaction block, so it
-- comes first, on its own.

ALTER TYPE stock_movement_reason ADD VALUE IF NOT EXISTS 'DAILY_STOCK';

BEGIN;

ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_type VARCHAR(4) NOT NULL DEFAULT 'SOFT'
  CHECK (stock_type IN ('SOFT', 'HARD'));

ALTER TABLE inventory ADD COLUMN IF NOT EXISTS standard_stock INTEGER NOT NULL DEFAULT 0 CHECK (standard_stock >= 0);
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS target_stock INTEGER NOT NULL DEFAULT 0 CHECK (target_stock >= 0);

CREATE TABLE IF NOT EXISTS daily_stock_resets (
  day DATE PRIMARY KEY,
  done_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  products_topped_up INTEGER NOT NULL DEFAULT 0
);

COMMIT;
