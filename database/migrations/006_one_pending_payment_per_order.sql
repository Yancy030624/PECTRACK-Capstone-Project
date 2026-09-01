-- Migration 006 — at most one PENDING gateway-initiated payment per order
--
-- Apply with:
--   psql -U postgres -d pectrack -f database/migrations/006_one_pending_payment_per_order.sql
--
-- Prepares the schema for Phase 6.5 (live PayMongo integration). See
-- PHASE6.5_PLAN.md, Decision 3, for the full reasoning; the short version:
--
-- A customer paying via PayMongo Checkout Session gets a PENDING payments
-- row the moment the checkout link is created, before they've actually
-- paid. Without a constraint, a double-click on "Pay with GCash" (or the
-- checkout link opened in two tabs) could create TWO PENDING rows for the
-- same order. If both were somehow completed, the order would be
-- overpaid with no guard rail at all -- unlike the manual cash/GCash-
-- reference path (Phase 6, Pattern B), a webhook confirming a completed
-- gateway payment cannot simply refuse to record it once the customer's
-- money has already moved (PHASE6.5_PLAN.md, Decision 9). So the guard
-- has to stop the SECOND intent from ever being created, not rely on
-- refusing it after the fact.
--
-- Same shape as migration 004's
-- inventory_change_requests_one_pending_per_product_idx: a PARTIAL unique
-- index, not a plain one, so it constrains only PENDING rows and never
-- touches the PAID/FAILED/REFUNDED history an order accumulates over its
-- life.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS payments_one_pending_per_order_idx
  ON payments (order_id)
  WHERE status = 'PENDING';

COMMIT;
