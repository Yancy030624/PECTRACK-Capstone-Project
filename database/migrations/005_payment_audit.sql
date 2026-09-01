-- Migration 005 — payment audit: recorded_by on users, and refund tracking
--
-- Apply with:
--   psql -U postgres -d pectrack -f database/migrations/005_payment_audit.sql
--
-- Prepares the schema for Phase 6 (Payment & Billing). See PHASE6_PLAN.md
-- for the full reasoning; the short version of each change is below.
--
-- Both changes were dry-run against this database during planning: applied,
-- verified, re-run to confirm idempotency, then rolled back. payments,
-- deliveries, delivery_proofs, and report_logs were all confirmed EMPTY at
-- that time, so neither change here needs to remap any existing data. If
-- payments already holds rows by the time this actually runs, STOP and
-- re-check recorded_by's values before applying — a cashier_id there would
-- silently mean something different once the column points at users
-- instead.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. recorded_by should reference users, not cashiers.
--
-- An ADMIN can record a payment, and MUST be able to record a refund
-- (PHASE6_PLAN.md, Decision 8) — but admins have no cashier_id, so the
-- current FK forces their audit trail to be NULL. Same reasoning that put
-- users(user_id) on order_status_history.updated_by and
-- inventory_movements.changed_by: when an action can be taken by more than
-- one kind of staff, the audit column has to point at the table they share.
-- ---------------------------------------------------------------------------
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_recorded_by_fkey;
ALTER TABLE payments
  ALTER COLUMN recorded_by TYPE BIGINT,
  ADD CONSTRAINT payments_recorded_by_fkey
    FOREIGN KEY (recorded_by) REFERENCES users(user_id);

-- ---------------------------------------------------------------------------
-- 2. Refund audit.
--
-- A refund flips PAID -> REFUNDED. Changing a money figure's meaning without
-- recording who and why is the same defect the inventory_movements ledger
-- exists to prevent (PHASE5_PLAN.md, Decision 1). A payment has exactly one
-- transition worth auditing (PAID -> REFUNDED), so three columns cover it
-- completely without a full history table.
-- ---------------------------------------------------------------------------
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS refunded_by BIGINT REFERENCES users(user_id),
  ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refund_reason TEXT;

COMMIT;
