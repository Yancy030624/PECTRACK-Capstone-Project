-- Migration 019 — when a delivery failed (Phase 10, B4)
--
-- Apply with:
--   psql -U postgres -d pectrack -f database/migrations/019_delivery_failed_at.sql
--
-- A driver's delivery history (GET /api/deliveries/mine/history) lists what
-- they finished in a date range. A delivered one has delivered_at; a failed
-- one had no timestamp at all, so it could not be placed in any range.
-- failed_at is set when a delivery becomes FAILED, and cleared when an
-- admin sends it back to the queue for another try.

BEGIN;

ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ;

-- Deliveries that failed before this column existed: the time they were
-- assigned is the closest known moment, and is always on the right day or
-- earlier. Only rows still NULL, so running this twice changes nothing.
UPDATE deliveries SET failed_at = assigned_at
 WHERE status = 'FAILED' AND failed_at IS NULL;

COMMIT;
