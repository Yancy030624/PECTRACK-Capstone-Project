-- Migration 041 — the database announces stock changes
--
-- Apply with psql:
--   psql -U postgres -d pectrack -f database/migrations/041_live_stock.sql
--
-- RULES-PLANS/LIVE_STOCK_PLAN.md (the panel, 2026-10-26; the user,
-- 2026-10-27). Every change to a product's or an ingredient's stock row
-- sends NOTIFY stock_changed, with the table's name as the payload. The
-- server LISTENs and pushes it to open Inventory screens, which then re-read
-- the list — so the screens update without a refresh.
--
-- A trigger, not a call in each route: every writer is caught at once —
-- orders, cancellations, the 5:00 AM top-up, Add, Correct count, level
-- edits, ingredient restocks, scripts — and none can forget. NOTIFY is
-- delivered only on COMMIT, so a rolled-back order announces nothing, and
-- identical notifications in one transaction are sent once (the top-up
-- touches many rows but announces once).
--
-- Run this before the push. Without it the live stream opens but never
-- fires, and the screens simply behave as before.

BEGIN;

CREATE OR REPLACE FUNCTION notify_stock_changed() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD IS NOT DISTINCT FROM NEW THEN
    RETURN NULL;
  END IF;
  PERFORM pg_notify('stock_changed', TG_TABLE_NAME);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS inventory_stock_changed ON inventory;
CREATE TRIGGER inventory_stock_changed
  AFTER INSERT OR UPDATE OR DELETE ON inventory
  FOR EACH ROW EXECUTE FUNCTION notify_stock_changed();

DROP TRIGGER IF EXISTS ingredients_stock_changed ON ingredients;
CREATE TRIGGER ingredients_stock_changed
  AFTER INSERT OR UPDATE OR DELETE ON ingredients
  FOR EACH ROW EXECUTE FUNCTION notify_stock_changed();

COMMIT;
