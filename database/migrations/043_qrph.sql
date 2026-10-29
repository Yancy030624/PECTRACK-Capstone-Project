-- Migration 043 — QR Ph payments
--
-- Apply with psql:
--   psql -U postgres -d pectrack -f database/migrations/043_qrph.sql
--
-- RULES-PLANS/QRPH_PLAN.md (the adviser, 2026-10-28; the user, 2026-10-29).
-- Online orders are paid by scanning the bakery's QR Ph code; the customer
-- types the reference number and staff confirm it. What that needs:
--
-- - payments.verified_by / verified_at: who confirmed or rejected a QR Ph
--   payment, and when.
-- - payments.rejected_reason: why one was rejected (shown to the customer).
-- - payments.proof_image / proof_type: the customer's optional screenshot.
-- - app_settings: the bakery's QR Ph image and account name, set by the
--   admin. A key/value table, so a later setting needs no new migration.
--
-- Both images are kept IN the database, not in uploads/: Railway's disk is
-- replaced on every deploy, and the QR code must never disappear from the
-- checkout because of a push. They are small (5 MB at most, a QR code a
-- few KB).
--
-- Run this before the push.

BEGIN;

ALTER TABLE payments ADD COLUMN IF NOT EXISTS verified_by BIGINT REFERENCES users(user_id);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS rejected_reason TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS proof_image BYTEA;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS proof_type VARCHAR(20);

CREATE TABLE IF NOT EXISTS app_settings (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT,
  -- A file setting's bytes (the QR image); value then holds its MIME type.
  data BYTEA,
  updated_by BIGINT REFERENCES users(user_id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- The staff list "Payments to confirm" reads pending QR Ph payments oldest
-- first.
CREATE INDEX IF NOT EXISTS payments_qrph_pending_idx ON payments (created_at) WHERE payment_method = 'QRPH' AND status = 'PENDING';

COMMIT;
