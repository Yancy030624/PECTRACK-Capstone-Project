-- Migration 031 — failed deliveries go back to the queue
--
-- Apply with psql:
--   psql -U postgres -d pectrack -f database/migrations/031_failed_deliveries_requeued.sql
--
-- From now on a delivery the driver could not hand over (or an admin took
-- back) returns straight to the assignment queue, and its order to Ready for
-- delivery (routes/deliveries.js, the user 2026-10-16). This moves the
-- deliveries already sitting as FAILED on an order that is still open the
-- same way. failed_at and the note are kept as the record of the attempt.
-- A FAILED delivery on a completed or cancelled order stays as it is.
-- Data only; the code before this one reads the result without trouble.

BEGIN;

WITH requeued AS (
  UPDATE deliveries d
     SET status = 'PENDING_ASSIGNMENT', delivery_personnel_id = NULL, assigned_at = NULL
    FROM orders o
   WHERE o.order_id = d.order_id
     AND d.status = 'FAILED'
     AND o.status NOT IN ('COMPLETED', 'CANCELLED')
  RETURNING d.order_id
), back AS (
  UPDATE orders o
     SET status = 'READY_FOR_DELIVERY'
    FROM requeued
   WHERE o.order_id = requeued.order_id AND o.status = 'OUT_FOR_DELIVERY'
  RETURNING o.order_id
)
INSERT INTO order_status_history (order_id, updated_by, status, note)
SELECT order_id, NULL, 'READY_FOR_DELIVERY', 'Failed delivery returned to the queue.' FROM back;

COMMIT;
