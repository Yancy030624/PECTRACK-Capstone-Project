-- Migration 034 — the cash a customer handed over
--
-- Apply with psql:
--   psql -U postgres -d pectrack -f database/migrations/034_cash_tendered.sql
--
-- The adviser, 2026-10-23: a walk-in's receipt said "Cash 35.00" for a
-- 35-peso bavarian the customer paid for with a 100-peso bill. The payment
-- (amount) is still the order's total — that is what the bakery received —
-- and the bill handed over is kept beside it, so every receipt can show
-- "Cash received 100.00 · Change 65.00". NULL for GCash and for payments
-- from before this migration.
--
-- Additive only.

BEGIN;

ALTER TABLE payments ADD COLUMN IF NOT EXISTS amount_tendered NUMERIC(12,2)
  CHECK (amount_tendered IS NULL OR amount_tendered >= amount);

COMMIT;
