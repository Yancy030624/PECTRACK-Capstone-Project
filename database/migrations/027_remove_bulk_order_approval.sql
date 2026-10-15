-- Migration 027 — no more admin approval for large orders
--
-- Apply with psql:
--   psql -U postgres -d pectrack -f database/migrations/027_remove_bulk_order_approval.sql
--
-- The adviser (2026-10-16) asked to remove the "Orders over [100] items
-- need an admin's approval" setting. That setting was the only thing that
-- ever set orders.requires_admin_approval (migration 021, PHASE10 D3), so
-- the whole approval step goes with it: the threshold, the flag, and the
-- index of orders waiting for approval. app_settings held nothing but the
-- threshold.
--
-- An order still waiting for approval when this runs simply becomes an
-- ordinary PLACED order: staff confirm it, and it can be paid, as any
-- other. Its status history keeps the old "Bulk order …" notes.
--
-- Drops columns the previous code reads: apply it to Railway right before
-- pushing the code that no longer reads them, as with migration 023.

BEGIN;

DROP INDEX IF EXISTS orders_awaiting_approval_idx;
ALTER TABLE orders DROP COLUMN IF EXISTS requires_admin_approval;
DROP TABLE IF EXISTS app_settings;

COMMIT;
