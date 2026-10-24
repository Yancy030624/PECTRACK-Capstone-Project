-- Migration 037 — how an order is paid for: cash at pickup, or GCash
--
-- Apply with psql:
--   psql -U postgres -d pectrack -f database/migrations/037_payment_mode.sql
--
-- The seniors' consultation, 2026-10-24 (RULES-PLANS/SENIOR_CONSULT_PLAN.md,
-- S3): an online pickup may now be paid in cash when it is collected, so it
-- is placed unpaid and shown as Ready for pickup, "Not paid". Delivery stays
-- GCash only. orders.payment_mode is the mode the order was placed with, for
-- the order details; the money itself is still in payments.
--
-- Backfill: a counter order takes the method of its first PAID payment; an
-- online order with a GCash checkout is GCASH. Anything else stays NULL
-- (older rows, shown with no mode).
--
-- Additive only. The new code reads the column, so run this before the push.

BEGIN;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_mode VARCHAR(10)
  CHECK (payment_mode IS NULL OR payment_mode IN ('CASH', 'GCASH'));

UPDATE orders o
   SET payment_mode = first_paid.payment_method::text
  FROM (
    SELECT DISTINCT ON (order_id) order_id, payment_method
      FROM payments
     WHERE status = 'PAID' AND payment_method::text IN ('CASH', 'GCASH')
     ORDER BY order_id, payment_date NULLS LAST, payment_id
  ) first_paid
 WHERE first_paid.order_id = o.order_id AND o.payment_mode IS NULL;

UPDATE orders o
   SET payment_mode = 'GCASH'
 WHERE o.payment_mode IS NULL
   AND EXISTS (SELECT 1 FROM payments p WHERE p.order_id = o.order_id AND p.gateway_reference IS NOT NULL);

COMMIT;
