-- Migration 039 — the sales the forecast learns from, and the nightly run
--
-- Apply with psql:
--   psql -U postgres -d pectrack -f database/migrations/039_sales_view_real_sales.sql
--
-- RULES-PLANS/ANALYTICS_PLAN.md, A2 and A4 (the user, 2026-10-25).
--
-- 1. analytics_daily_sales (migration 014) counted every order that was not
--    cancelled, dated by when it was placed. Since payment first that took
--    in checkout holds still waiting for GCash, and since cash at pickup,
--    orders nobody has collected. And an advanced order counted on the day
--    it was booked, not the day it was baked and picked up. The forecast
--    learns from this view (forecast_training_data), so it learned from
--    sales that never happened, on the wrong days.
--
--    Now an order counts once it is a real sale — a PAID payment exists or
--    it is COMPLETED — and on its own day: the requested time when it has
--    one, else when it was placed (the same "order's day" lib/staleOrders.js
--    uses). The columns are unchanged.
--
-- 2. forecast_nightly_runs: the Manila days the automatic forecast has
--    claimed, so a restart or a second server never runs it twice.
--
-- Run this before the push: the new code writes forecast_nightly_runs.

BEGIN;

CREATE OR REPLACE VIEW analytics_daily_sales AS
WITH running AS (
  SELECT i.product_id,
         (im.created_at AT TIME ZONE 'Asia/Manila')::date AS local_date,
         i.stock_quantity - COALESCE(SUM(im.quantity_change) OVER (
           PARTITION BY im.inventory_id ORDER BY im.created_at, im.movement_id
           ROWS BETWEEN 1 FOLLOWING AND UNBOUNDED FOLLOWING), 0) AS balance_after
    FROM inventory_movements im
    JOIN inventory i ON i.inventory_id = im.inventory_id
),
stockouts AS (
  SELECT product_id, local_date, BOOL_OR(balance_after <= 0) AS stocked_out
    FROM running
   GROUP BY product_id, local_date
),
sales AS (
  SELECT (COALESCE(o.requested_fulfillment_time, o.order_date) AT TIME ZONE 'Asia/Manila')::date AS local_date,
         od.product_id,
         o.data_source,
         SUM(od.quantity)::int AS units_sold,
         SUM(od.quantity * od.unit_price)::numeric(12, 2) AS revenue,
         COUNT(DISTINCT o.order_id)::int AS orders
    FROM order_details od
    JOIN orders o ON o.order_id = od.order_id
   WHERE o.status <> 'CANCELLED'
     AND (o.status = 'COMPLETED' OR EXISTS (SELECT 1 FROM payments p WHERE p.order_id = o.order_id AND p.status = 'PAID'))
   GROUP BY 1, 2, 3
)
SELECT s.local_date, s.product_id, s.data_source, s.units_sold, s.revenue, s.orders,
       COALESCE(so.stocked_out, FALSE) AS stocked_out
  FROM sales s
  LEFT JOIN stockouts so ON so.product_id = s.product_id AND so.local_date = s.local_date;

CREATE TABLE IF NOT EXISTS forecast_nightly_runs (
  day DATE PRIMARY KEY,
  run_id BIGINT REFERENCES forecast_runs(run_id) ON DELETE SET NULL,
  ran_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMIT;
