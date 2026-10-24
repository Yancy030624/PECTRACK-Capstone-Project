-- Migration 040 — report_logs becomes the export history
--
-- Apply with psql:
--   psql -U postgres -d pectrack -f database/migrations/040_export_history.sql
--
-- RULES-PLANS/REPORTS_UI_PLAN.md, U2 (the user, 2026-10-25). Report History
-- logged a 'SALES' row every time an admin opened the Sales tab: 192 rows
-- reading "SALES", none of them a report anyone took away. It now records
-- only what leaves the system — a CSV downloaded or a PDF printed — by an
-- admin OR a cashier, so:
-- - user_id names whoever exported, any role. generated_by (admins) stays
--   for the old rows and is filled for an admin's, but may now be NULL.
-- - old rows get their admin's user_id;
-- - the page-open rows (report_type 'SALES') are deleted: they are not
--   exports. SALES_CSV rows were real downloads and are kept.
--
-- Run this before the push: the new code writes user_id.

BEGIN;

ALTER TABLE report_logs ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE report_logs ALTER COLUMN generated_by DROP NOT NULL;

UPDATE report_logs rl SET user_id = a.user_id
  FROM admins a
 WHERE a.admin_id = rl.generated_by AND rl.user_id IS NULL;

DELETE FROM report_logs WHERE report_type = 'SALES';

CREATE INDEX IF NOT EXISTS report_logs_generated_at_idx ON report_logs (generated_at DESC);

COMMIT;
