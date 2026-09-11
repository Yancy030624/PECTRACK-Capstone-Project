-- Migration 008 — structured inventory-loss reasons
--
-- Apply with:
--   psql -U postgres -d pectrack -f database/migrations/008_inventory_loss_reasons.sql
--
-- See RULES-PLANS/INVENTORY_REVIEW.md for the full reasoning (the capstone
-- adviser's question: what happens to stock lost for a reason other than a
-- sale — burned, expired, damaged?). Short version: every loss a cashier
-- reports today becomes CORRECTION on approval, because
-- inventory_change_requests only ever stores an absolute recount
-- (proposed_stock_quantity) with the real reason buried as free text in
-- `note`. That makes a burned batch and an expired batch indistinguishable
-- on the ledger, and any analysis trained on it would read a production
-- accident the same way it reads unsold stock — opposite problems with
-- opposite remedies (Section 8 of that review).
--
-- This migration does two things:
--   1. Widens stock_movement_reason with three loss-specific values.
--   2. Gives inventory_change_requests a second, delta-shaped way to
--      propose a change — quantity_change — alongside the existing
--      absolute proposed_stock_quantity. A recount says "I count 20"; a
--      loss report says "10 fewer, because PRODUCTION_LOSS", and needs no
--      observed baseline to apply correctly — it composes with concurrent
--      sales the same way routes/orders.js's own relative deduction
--      already does, for the same reason.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Three new reasons, chosen by what an owner would DO about the loss,
-- not by what the product looks like on the shelf: PRODUCTION_LOSS means
-- fix the oven, EXPIRED means bake less, DAMAGED means fix handling or
-- storage. SPOILAGE (already existed) and CORRECTION (already existed, for
-- an unexplained discrepancy) round out the vocabulary. RESTOCK,
-- ORDER_PLACED, and ORDER_CANCELLED are untouched.
--
-- ALTER TYPE ... ADD VALUE is transactional as of PostgreSQL 12, so this is
-- safe inside the same BEGIN/COMMIT as the rest of this file — the
-- restriction that remains is that a value cannot be USED in the same
-- transaction that adds it, and nothing here does that (this migration only
-- changes shape; it never writes a row).
-- ---------------------------------------------------------------------------
ALTER TYPE stock_movement_reason ADD VALUE IF NOT EXISTS 'PRODUCTION_LOSS';
ALTER TYPE stock_movement_reason ADD VALUE IF NOT EXISTS 'EXPIRED';
ALTER TYPE stock_movement_reason ADD VALUE IF NOT EXISTS 'DAMAGED';

-- ---------------------------------------------------------------------------
-- 2. A delta-shaped proposal, alongside the existing absolute one.
--
-- proposed_stock_quantity says "stock should read N" — correct for a
-- recount, where the cashier is disputing the number itself. A loss isn't a
-- disputed count; it's a known quantity leaving a shelf that was otherwise
-- correct, and reporting it as a recount means someone doing subtraction in
-- their head (stock shows 24, 10 burned, type 14) instead of just saying
-- "10". quantity_change stores that "10" directly — always negative for a
-- loss, matching inventory_movements' own signed convention — so the
-- quantity actually lost is recorded on the request itself, not merely
-- recoverable afterward as the difference between two counts nobody typed
-- as a count.
--
-- movement_reason carries the cashier's STRUCTURED reason (PRODUCTION_LOSS,
-- EXPIRED, DAMAGED, or SPOILAGE — restricted by application code the same
-- way manualMovementReasons already narrows the admin's direct-edit
-- reasons, not by a database CHECK) through to the movement row an
-- approval writes. Without this column, every approved cashier proposal
-- becomes CORRECTION on the ledger — that route had no other reason to
-- write, regardless of what the cashier actually reported.
--
-- Both columns are nullable. A request has EITHER a recount
-- (proposed_stock_quantity set; movement_reason and quantity_change both
-- NULL) OR a loss report (quantity_change and movement_reason both set;
-- proposed_stock_quantity NULL) — the two shapes are never mixed on one
-- row, enforced by routes/inventory.js's POST /requests validation, the
-- only code path that ever writes this table.
-- ---------------------------------------------------------------------------
ALTER TABLE inventory_change_requests
  ADD COLUMN IF NOT EXISTS movement_reason stock_movement_reason,
  ADD COLUMN IF NOT EXISTS quantity_change INTEGER CHECK (quantity_change <> 0);

-- Replaces the table's original CHECK (added in schema.sql, before this
-- column existed) so an INVENTORY request can satisfy it with
-- quantity_change alone, without also proposing a stock or minimum-level
-- recount. DROP + re-ADD under the SAME name rather than trying to widen an
-- existing constraint in place — Postgres has no ALTER CONSTRAINT for
-- changing a CHECK's definition, and keeping the original name means
-- nothing else needs to know this constraint was ever touched.
ALTER TABLE inventory_change_requests
  DROP CONSTRAINT IF EXISTS inventory_change_requests_check;
ALTER TABLE inventory_change_requests
  ADD CONSTRAINT inventory_change_requests_check CHECK (
    (request_type = 'INVENTORY' AND (proposed_stock_quantity IS NOT NULL OR proposed_min_stock_level IS NOT NULL OR quantity_change IS NOT NULL))
    OR (request_type = 'PRODUCT_DETAILS' AND (proposed_price IS NOT NULL OR proposed_description IS NOT NULL OR proposed_availability_status IS NOT NULL))
  );

COMMIT;
