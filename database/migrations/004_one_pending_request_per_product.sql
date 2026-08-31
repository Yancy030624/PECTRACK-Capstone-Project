-- Migration 004 — at most one PENDING change request per product
--
-- Apply with:
--   psql -U postgres -d pectrack -f database/migrations/004_one_pending_request_per_product.sql
--
-- Approving a proposal applies the difference the cashier OBSERVED to
-- whatever stock is current (PHASE5_PLAN.md, Decision 2). That arithmetic is
-- only correct while one proposal is outstanding. Two pending proposals for
-- the same product each capture the SAME observed baseline, so approving
-- both applies BOTH deltas to that one starting point and compounds into a
-- figure nobody proposed:
--
--   stock 10.  Cashier proposes 18  (observed 10, delta +8).
--              Recounts, proposes 20 (observed 10, delta +10).
--   Approving both -> 28, when the cashier's own latest belief was 20.
--
-- routes/inventory.js refuses the second submission with a 409, but that
-- check is a SELECT followed by an INSERT on a pooled connection: several
-- concurrent submissions can all find nothing pending and all proceed.
-- Measured, four cashiers proposing at once: four PENDING rows, 24 times out
-- of 25 trials. Only the database can make "one pending row" actually true.
--
-- A PARTIAL unique index, not a plain one: the constraint applies to PENDING
-- rows only. A product accumulates any number of APPROVED and REJECTED rows
-- over its life, and that history must stay in the table.
--
-- Reconciles the whole table first, so the index can be built on a database
-- that already raced its way into duplicates. The oldest pending row per
-- product is the one kept — it is the one whose observed baseline is the
-- furthest from current stock, so leaving it open surfaces the discrepancy
-- for a human to decide rather than silently discarding it.

BEGIN;

UPDATE inventory_change_requests
   SET status = 'REJECTED',
       reviewed_at = CURRENT_TIMESTAMP,
       reviewer_note = 'Automatically closed by migration 004: another proposal for this product was already open.'
 WHERE status = 'PENDING'
   AND request_id NOT IN (
     SELECT MIN(request_id) FROM inventory_change_requests WHERE status = 'PENDING' GROUP BY product_id
   );

CREATE UNIQUE INDEX IF NOT EXISTS inventory_change_requests_one_pending_per_product_idx
  ON inventory_change_requests (product_id)
  WHERE status = 'PENDING';

COMMIT;
