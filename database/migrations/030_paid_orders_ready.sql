-- Migration 030 — old open orders move to the payment-first statuses
--
-- Apply with psql, after 029:
--   psql -U postgres -d pectrack -f database/migrations/030_paid_orders_ready.sql
--
-- A paid order that is still Placed, Confirmed or In production is ready
-- now: the bread is baked before opening (the adviser, 2026-10-16). A
-- delivery whose driver has it is already OUT_FOR_DELIVERY and is left
-- alone. Unpaid open orders are not touched here: they are cancelled by
-- the system on start-up (server/lib/staleOrders.js), which also returns
-- their stock. Each move gets a status history row with no user (the
-- system, migration 028).

BEGIN;

WITH paid AS (
  SELECT o.order_id, o.order_type
    FROM orders o
   WHERE o.status IN ('PLACED', 'CONFIRMED', 'IN_PRODUCTION')
     AND o.total_amount <= COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.order_id = o.order_id AND p.status = 'PAID'), 0)
), moved AS (
  UPDATE orders o
     SET status = CASE WHEN paid.order_type = 'DELIVERY' THEN 'READY_FOR_DELIVERY'::order_status ELSE 'READY_FOR_PICKUP'::order_status END
    FROM paid
   WHERE o.order_id = paid.order_id
  RETURNING o.order_id, o.status
)
INSERT INTO order_status_history (order_id, updated_by, status, note)
SELECT order_id, NULL, status, 'Paid — ready (the bakery bakes before opening; no production step).' FROM moved;

COMMIT;
