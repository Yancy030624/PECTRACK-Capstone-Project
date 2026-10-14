-- Migration 023 — stock losses are "rejects"; no expiry tracking
--
-- Apply with psql (NOT inside one transaction — see the first statement):
--   psql -U postgres -d pectrack -f database/migrations/023_rejects_no_expiry.sql
--
-- CLIENT_REVISIONS_PLAN.md, R3. The client (2026-10-15): bread past its
-- best is toasted and sold again, or rejected; only rejects are written
-- down, and burned or dropped bread is not recorded. So:
--
--   - stock losses have one reason, REJECT. The old loss reasons
--     (SPOILAGE, PRODUCTION_LOSS, EXPIRED, DAMAGED) stay in the enum because
--     past ledger rows carry them; nothing writes them any more.
--   - expiry dates and shelf life are gone. Nothing is hidden from the menu
--     or refused at checkout for being "expired".
--   - analytics_daily_waste gains a `rejected` column (appended, so the
--     view can be replaced in place) and counts REJECT rows.

-- ALTER TYPE ... ADD VALUE cannot be used by later statements in the SAME
-- transaction, and the view below compares against 'REJECT'. Run on its
-- own (psql commits each statement), before the BEGIN.
ALTER TYPE stock_movement_reason ADD VALUE IF NOT EXISTS 'REJECT';

BEGIN;

CREATE OR REPLACE VIEW analytics_daily_waste AS
SELECT (im.created_at AT TIME ZONE 'Asia/Manila')::date AS local_date,
       i.product_id,
       im.data_source,
       SUM(CASE WHEN im.reason = 'EXPIRED' THEN -im.quantity_change ELSE 0 END)::int AS expired,
       SUM(CASE WHEN im.reason = 'SPOILAGE' THEN -im.quantity_change ELSE 0 END)::int AS spoiled,
       SUM(CASE WHEN im.reason = 'DAMAGED' THEN -im.quantity_change ELSE 0 END)::int AS damaged,
       SUM(CASE WHEN im.reason = 'PRODUCTION_LOSS' THEN -im.quantity_change ELSE 0 END)::int AS production_loss,
       SUM(CASE WHEN im.reason = 'CORRECTION' THEN im.quantity_change ELSE 0 END)::int AS correction,
       SUM(CASE WHEN im.reason = 'REJECT' THEN -im.quantity_change ELSE 0 END)::int AS rejected
  FROM inventory_movements im
  JOIN inventory i ON i.inventory_id = im.inventory_id
 WHERE im.reason IN ('EXPIRED', 'SPOILAGE', 'DAMAGED', 'PRODUCTION_LOSS', 'CORRECTION', 'REJECT')
 GROUP BY 1, 2, 3;

ALTER TABLE inventory DROP COLUMN IF EXISTS expiration_date;
ALTER TABLE products DROP COLUMN IF EXISTS shelf_life_days;

COMMIT;
