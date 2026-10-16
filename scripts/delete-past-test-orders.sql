-- Delete the test orders from before today (the user, 2026-10-16), so staff
-- only see today's and upcoming orders while testing continues.
--
-- Run with psql, AFTER taking a backup (pg_dump):
--   psql "<database url>" -f scripts/delete-past-test-orders.sql
--
-- What goes: every order that was really placed in the system
-- (data_source = 'RECORDED') whose day — the Manila date it is picked up or
-- delivered, or the day it was placed when it named no time — is before
-- today, whatever its status, with everything hanging off it: items,
-- status history, payments, delivery and its proof records, and its stock
-- ledger rows.
--
-- What stays:
-- - today's and later orders, including reserved ones placed earlier;
-- - the assumed (synthetic) sales history the adviser approved for the
--   forecast (data_source = 'ASSUMED'), already kept out of sales reports;
-- - product stock as it stands now: the shelf count is what staff entered,
--   so it is left alone. The deleted orders' ledger rows go with them.
--
-- Proof-of-delivery photo FILES on disk are not removed here (the rows
-- pointing at them are); they are only reachable through those rows.

BEGIN;

CREATE TEMP TABLE doomed_orders ON COMMIT DROP AS
  SELECT order_id FROM orders
   WHERE data_source = 'RECORDED'
     AND (COALESCE(requested_fulfillment_time, order_date) AT TIME ZONE 'Asia/Manila')::date
         < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date;

SELECT count(*) AS orders_to_delete FROM doomed_orders;

DELETE FROM inventory_movements WHERE order_id IN (SELECT order_id FROM doomed_orders);
DELETE FROM payments WHERE order_id IN (SELECT order_id FROM doomed_orders);
-- delivery_proofs cascade from deliveries.
DELETE FROM deliveries WHERE order_id IN (SELECT order_id FROM doomed_orders);
-- order_details and order_status_history cascade from orders.
DELETE FROM orders WHERE order_id IN (SELECT order_id FROM doomed_orders);

SELECT count(*) AS recorded_orders_left FROM orders WHERE data_source = 'RECORDED';

COMMIT;
