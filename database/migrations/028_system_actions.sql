-- Migration 028 — changes the system makes on its own
--
-- Apply with psql:
--   psql -U postgres -d pectrack -f database/migrations/028_system_actions.sql
--
-- The adviser (2026-10-16) wants statuses to move on their own instead of
-- by hand. One of those moves has no person behind it: an order whose day
-- has passed and that is still open is closed automatically
-- (server/lib/staleOrders.js) — completed if it is paid, cancelled if
-- nothing was paid. Its status history row and, for a cancellation, the
-- stock it returns are recorded with no user: NULL here means "the
-- system", and the screens show it as "System".
--
-- Additive: code that always sets these columns keeps working.

BEGIN;

ALTER TABLE order_status_history ALTER COLUMN updated_by DROP NOT NULL;
ALTER TABLE inventory_movements ALTER COLUMN changed_by DROP NOT NULL;

COMMIT;
