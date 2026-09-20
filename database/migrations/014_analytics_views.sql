-- Migration 014 — costing and analytics views
--
-- Apply with:
--   psql -U postgres -d pectrack -f database/migrations/014_analytics_views.sql
--
-- Phase 9A, Decisions 6 and 10. Views, not tables: nothing to keep in
-- sync, nothing to drift, and a future model reads them with one SELECT.
-- Every date here is the Asia/Manila calendar day (the same rule
-- server/lib/reporting.js enforces for reports), and every event view
-- carries data_source so real and assumed rows can be told apart with a
-- WHERE clause rather than a second database.
--
-- CREATE OR REPLACE so re-running this file after a definition change is
-- safe; a view has no data of its own to migrate.

BEGIN;

-- ---------------------------------------------------------------------------
-- product_costing — each product's cost per item from its most recent
-- APPROVED batch, against its current price. Cost per base unit is the
-- batch's total_cost over its produced_quantity; cost per item multiplies
-- by the packaging ratio snapshotted on the output line, so a gallon of
-- 120 pieces costs ten times a pack of 12 from the same batch.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW product_costing AS
WITH latest AS (
  SELECT DISTINCT ON (o.product_id)
         o.product_id, b.batch_id, b.produced_at, b.total_cost, b.produced_quantity, o.units_per_item
    FROM production_batch_outputs o
    JOIN production_batches b ON b.batch_id = o.batch_id
   WHERE b.status = 'APPROVED' AND b.produced_quantity > 0
   ORDER BY o.product_id, b.produced_at DESC, b.batch_id DESC
)
SELECT p.product_id,
       p.product_name,
       p.variant,
       p.price,
       p.recipe_id,
       p.units_per_item,
       l.batch_id AS costed_from_batch_id,
       l.produced_at AS costed_at,
       (l.total_cost / l.produced_quantity * l.units_per_item)::numeric(12, 2) AS unit_cost,
       (p.price - l.total_cost / l.produced_quantity * l.units_per_item)::numeric(12, 2) AS margin,
       CASE WHEN p.price > 0
            THEN ((p.price - l.total_cost / l.produced_quantity * l.units_per_item) / p.price * 100)::numeric(6, 2)
            END AS margin_percent
  FROM products p
  LEFT JOIN latest l ON l.product_id = p.product_id;

-- ---------------------------------------------------------------------------
-- analytics_daily_sales — units and revenue per product per day, from
-- orders that were not cancelled, dated by order_date. stocked_out is the
-- censoring flag INVENTORY_REVIEW.md §8 names as the single most important
-- input for demand work: TRUE when the product's running ledger balance
-- touched zero at any point that day, so that day's sales are a floor on
-- demand, not a measurement of it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW analytics_daily_sales AS
WITH running AS (
  -- The balance AFTER each movement, anchored on today's stock_quantity
  -- and walked backwards: stock now minus everything that moved after
  -- this row. Anchoring on the present rather than summing from zero
  -- means stock that entered before the ledger existed (Phase 4 data,
  -- test fixtures written with a direct UPDATE) does not make every
  -- later day look like a stockout.
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
  SELECT (o.order_date AT TIME ZONE 'Asia/Manila')::date AS local_date,
         od.product_id,
         o.data_source,
         SUM(od.quantity)::int AS units_sold,
         SUM(od.quantity * od.unit_price)::numeric(12, 2) AS revenue,
         COUNT(DISTINCT o.order_id)::int AS orders
    FROM order_details od
    JOIN orders o ON o.order_id = od.order_id
   WHERE o.status <> 'CANCELLED'
   GROUP BY 1, 2, 3
)
SELECT s.local_date, s.product_id, s.data_source, s.units_sold, s.revenue, s.orders,
       COALESCE(so.stocked_out, FALSE) AS stocked_out
  FROM sales s
  LEFT JOIN stockouts so ON so.product_id = s.product_id AND so.local_date = s.local_date;

-- ---------------------------------------------------------------------------
-- analytics_daily_production — yield per recipe (dough) per day from
-- APPROVED batches: what was planned, what came out, what was lost
-- before packing, what it cost. The production-yield stream.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW analytics_daily_production AS
SELECT (b.produced_at AT TIME ZONE 'Asia/Manila')::date AS local_date,
       b.recipe_id,
       b.recipe_name,
       b.base_unit,
       b.data_source,
       COUNT(*)::int AS batches,
       SUM(b.planned_quantity)::numeric(12, 3) AS planned,
       SUM(b.produced_quantity)::numeric(12, 3) AS produced,
       SUM(b.loss_quantity)::numeric(12, 3) AS loss,
       SUM(b.total_cost)::numeric(12, 2) AS total_cost
  FROM production_batches b
 WHERE b.status = 'APPROVED'
 GROUP BY 1, 2, 3, 4, 5;

-- ---------------------------------------------------------------------------
-- analytics_daily_output — items packed per product per day, with the
-- share of batch cost they carry. This is the supply side a demand model
-- compares against analytics_daily_sales.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW analytics_daily_output AS
SELECT (b.produced_at AT TIME ZONE 'Asia/Manila')::date AS local_date,
       o.product_id,
       b.data_source,
       COUNT(DISTINCT b.batch_id)::int AS batches,
       SUM(o.quantity)::int AS items_produced,
       SUM(o.quantity * o.units_per_item)::numeric(12, 3) AS base_units,
       SUM(CASE WHEN b.produced_quantity > 0
                THEN b.total_cost * (o.quantity * o.units_per_item / b.produced_quantity)
                ELSE 0 END)::numeric(12, 2) AS allocated_cost
  FROM production_batch_outputs o
  JOIN production_batches b ON b.batch_id = o.batch_id
 WHERE b.status = 'APPROVED'
 GROUP BY 1, 2, 3;

-- ---------------------------------------------------------------------------
-- analytics_daily_waste — finished goods lost after stocking, per product
-- per day, by cause, as positive magnitudes. correction is the signed net
-- of CORRECTION rows (a recount can go either way).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW analytics_daily_waste AS
SELECT (im.created_at AT TIME ZONE 'Asia/Manila')::date AS local_date,
       i.product_id,
       SUM(CASE WHEN im.reason = 'EXPIRED' THEN -im.quantity_change ELSE 0 END)::int AS expired,
       SUM(CASE WHEN im.reason = 'SPOILAGE' THEN -im.quantity_change ELSE 0 END)::int AS spoiled,
       SUM(CASE WHEN im.reason = 'DAMAGED' THEN -im.quantity_change ELSE 0 END)::int AS damaged,
       SUM(CASE WHEN im.reason = 'PRODUCTION_LOSS' THEN -im.quantity_change ELSE 0 END)::int AS production_loss,
       SUM(CASE WHEN im.reason = 'CORRECTION' THEN im.quantity_change ELSE 0 END)::int AS correction
  FROM inventory_movements im
  JOIN inventory i ON i.inventory_id = im.inventory_id
 WHERE im.reason IN ('EXPIRED', 'SPOILAGE', 'DAMAGED', 'PRODUCTION_LOSS', 'CORRECTION')
 GROUP BY 1, 2;

COMMIT;
