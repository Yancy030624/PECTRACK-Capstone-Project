-- Delete EVERY real (RECORDED) order — the team's test orders — so the
-- website starts clean (the user, 2026-10-22). Same cleanup as
-- delete-past-test-orders.sql, without the "before today" limit.
--
-- Run with psql, AFTER taking a backup (pg_dump):
--   psql "<database url>" -f scripts/delete-all-test-orders.sql
--
-- What goes: every order with data_source = 'RECORDED', whatever its day
-- or status, with its items, status history, payments, delivery (and proof
-- records) and stock ledger rows.
--
-- What stays: the assumed (synthetic) sales history behind the forecast
-- (data_source = 'ASSUMED'), every account, every product, and the stock
-- on the shelf as it stands now.

BEGIN;

CREATE TEMP TABLE doomed_orders ON COMMIT DROP AS
  SELECT order_id FROM orders WHERE data_source = 'RECORDED';

SELECT count(*) AS orders_to_delete FROM doomed_orders;

DELETE FROM inventory_movements WHERE order_id IN (SELECT order_id FROM doomed_orders);
DELETE FROM payments WHERE order_id IN (SELECT order_id FROM doomed_orders);
-- delivery_proofs cascade from deliveries.
DELETE FROM deliveries WHERE order_id IN (SELECT order_id FROM doomed_orders);
-- order_details and order_status_history cascade from orders.
DELETE FROM orders WHERE order_id IN (SELECT order_id FROM doomed_orders);

SELECT count(*) AS recorded_orders_left FROM orders WHERE data_source = 'RECORDED';

COMMIT;
