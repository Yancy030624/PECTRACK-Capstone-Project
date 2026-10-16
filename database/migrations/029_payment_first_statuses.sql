-- Migration 029 — statuses for payment first (RULES-PLANS/PAYMENT_FIRST_PLAN.md)
--
-- Apply with psql:
--   psql -U postgres -d pectrack -f database/migrations/029_payment_first_statuses.sql
--
-- The adviser (2026-10-16): the bakery is paid first and bakes its stock
-- before opening, so a paid order is ready at once.
-- - READY_FOR_DELIVERY: a paid delivery order waiting for its driver (the
--   delivery counterpart of READY_FOR_PICKUP).
-- - AWAITING_PAYMENT: an online checkout held for 15 minutes while the
--   customer pays with GCash. Hidden from staff, reports and the bell;
--   cancelled by the system if not paid in time.
-- PLACED, CONFIRMED and IN_PRODUCTION stay in the type for old rows; no new
-- order uses them. ADD VALUE runs outside a transaction block, and the new
-- values are used only from migration 030 on.
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'READY_FOR_DELIVERY' AFTER 'READY_FOR_PICKUP';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'AWAITING_PAYMENT' BEFORE 'PLACED';
