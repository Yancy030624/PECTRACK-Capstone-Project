-- Migration 038 — the delivery fee on an order
--
-- Apply with psql:
--   psql -U postgres -d pectrack -f database/migrations/038_delivery_fee.sql
--
-- The user, 2026-10-25 (RULES-PLANS/DELIVERY_FEE_PLAN.md, D1): a delivery
-- order carries a flat delivery fee, ₱50 for now, set at checkout. It is
-- part of total_amount and is paid with GCash along with the bread, and it
-- is kept here on its own so reports can keep it apart from bread sales.
-- Older orders and pickup orders have 0.
--
-- Additive only. The new code reads the column, so run this before the push.

BEGIN;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC(12,2) NOT NULL DEFAULT 0
  CHECK (delivery_fee >= 0);

COMMIT;
