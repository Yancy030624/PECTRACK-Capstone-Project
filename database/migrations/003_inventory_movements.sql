-- Migration 003 — inventory movement ledger, and observed stock on proposals
--
-- Apply with:
--   psql -U postgres -d pectrack -f database/migrations/003_inventory_movements.sql
--
-- Prepares the schema for Phase 5 (Inventory Management). See PHASE5_PLAN.md
-- for the full reasoning; the short version of each change is below.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. The movement ledger
--
-- inventory.stock_quantity is a single mutable integer. When it is wrong — and
-- it will be, that is normal for real stock — nothing in the system can answer
-- WHY. Sales can be reconstructed from order_details, but spoilage, deliveries
-- received, and manual corrections are recorded nowhere at all.
--
-- That matters beyond bookkeeping: the planned AI feature is meant to assist
-- with restocking decisions, and restocking advice needs exactly the data that
-- currently is not kept.
--
-- Same shape as order_status_history, which is already the best-audited part
-- of the app: never mutate the number alone, always write a row saying what
-- changed and why.
-- ---------------------------------------------------------------------------

-- Postgres has no CREATE TYPE IF NOT EXISTS, so this DO block makes the
-- migration safe to run twice by swallowing the "already exists" error.
DO $$
BEGIN
  CREATE TYPE stock_movement_reason AS ENUM (
    'ORDER_PLACED', 'ORDER_CANCELLED', 'RESTOCK', 'SPOILAGE', 'CORRECTION'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS inventory_movements (
  movement_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  inventory_id BIGINT NOT NULL REFERENCES inventory(inventory_id) ON DELETE CASCADE,
  -- Typically exactly one of these is set — or neither, for a direct admin
  -- edit. They are what let the ledger answer "why did this change" with a
  -- link to the cause rather than a sentence someone typed.
  order_id BIGINT REFERENCES orders(order_id),
  request_id BIGINT REFERENCES inventory_change_requests(request_id),
  -- References users(user_id), not a role table, because a movement can be
  -- caused by a customer placing an order, a cashier, or an admin. Same
  -- reasoning as order_status_history.updated_by.
  changed_by BIGINT NOT NULL REFERENCES users(user_id),
  -- Signed: negative removes stock, positive adds it. A single signed column
  -- rather than a magnitude plus a direction flag, because CORRECTION can go
  -- either way and SUM() over this column must equal the net stock change.
  quantity_change INTEGER NOT NULL CHECK (quantity_change <> 0),
  reason stock_movement_reason NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- The query this table exists to serve: "what happened to this product's
-- stock, most recent first."
CREATE INDEX IF NOT EXISTS inventory_movements_inventory_id_idx
  ON inventory_movements (inventory_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 2. observed_stock_quantity on change requests
--
-- proposed_stock_quantity is an ABSOLUTE value. Applied blindly on approval,
-- it silently erases whatever sold while the request sat pending:
--
--   09:00  stock 12.  Cashier proposes 20.
--   11:00  5 sell.    stock 7.
--   14:00  Admin approves -> stock set to 20.  Those 5 sales vanish.
--
-- Switching to pure deltas would fix that but break the commonest real action
-- — a physical recount, where the cashier is disputing the very number the
-- delta would have to be measured from.
--
-- So the request records BOTH: what the system showed the cashier, and what
-- they say it should be. Approval then applies the difference THEY observed to
-- whatever stock is current: 7 + (20 - 12) = 15, which is correct.
--
-- Nullable because it cannot be invented for rows that already exist. Treat
-- NULL as "apply the absolute value" — the old behaviour.
-- ---------------------------------------------------------------------------
ALTER TABLE inventory_change_requests
  ADD COLUMN IF NOT EXISTS observed_stock_quantity INTEGER CHECK (observed_stock_quantity >= 0);

COMMIT;
