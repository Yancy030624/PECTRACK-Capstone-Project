-- Migration 021 — bulk orders need an admin's approval (Phase 10, D3)
--
-- Apply with:
--   psql -U postgres -d pectrack -f database/migrations/021_bulk_order_approval.sql
--
-- The thesis (p.15): "bulk order requests requiring administrator
-- approval." orders.requires_admin_approval has existed since the first
-- schema and was never set. It is now set when an order's item count is
-- above a threshold, and such an order stays PLACED until an admin
-- confirms it (routes/orders.js) — no payment before then
-- (routes/payments.js). Rejecting is cancelling, with a reason.
--
-- The threshold is a setting an admin can change, kept in app_settings:
-- one row per setting, the value as text, parsed by the code that owns it.

BEGIN;

CREATE TABLE IF NOT EXISTS app_settings (
  setting_key VARCHAR(100) PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_by BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 100 items: the size of order the bakery owner describes as the hard
-- case in the interview (thesis p.9).
INSERT INTO app_settings (setting_key, setting_value)
VALUES ('bulk_order_threshold', '100')
ON CONFLICT (setting_key) DO NOTHING;

-- The admin's queue: orders waiting for approval.
CREATE INDEX IF NOT EXISTS orders_awaiting_approval_idx
  ON orders (order_date) WHERE requires_admin_approval AND status = 'PLACED';

COMMIT;
