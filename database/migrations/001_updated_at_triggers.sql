-- Migration 001 — keep updated_at columns current
--
-- schema.sql is the definition of a FRESH database. This file is how an
-- ALREADY-CREATED database catches up to it, so nobody has to drop and
-- recreate a database that has real data in it.
--
-- Apply with:
--   psql -U postgres -d pectrack -f database/migrations/001_updated_at_triggers.sql
--
-- WHAT IT FIXES
-- users, customers, and customer_addresses each have an updated_at column
-- that takes its DEFAULT CURRENT_TIMESTAMP when the row is inserted and is
-- then never written again. No UPDATE statement set it and no trigger
-- maintained it, so the column permanently equalled created_at. That is
-- worse than having no column: it looks authoritative while being wrong,
-- and any later report or "recently changed" view built on it would quietly
-- produce nonsense.
--
-- Enforcing this in the database rather than in each UPDATE means it cannot
-- be forgotten by a route written in a later phase.

BEGIN;

-- OR REPLACE so re-running this file is harmless.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- DROP ... IF EXISTS before each CREATE, for the same reason: this file
-- should be safe to run twice without erroring on "trigger already exists".
DROP TRIGGER IF EXISTS users_set_updated_at ON users;
CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS customers_set_updated_at ON customers;
CREATE TRIGGER customers_set_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS customer_addresses_set_updated_at ON customer_addresses;
CREATE TRIGGER customer_addresses_set_updated_at
  BEFORE UPDATE ON customer_addresses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;

-- Note on existing rows: this does NOT backfill them. Rows written before
-- the trigger existed keep updated_at = created_at, which is the honest
-- answer — we genuinely do not know when (or whether) they were last
-- edited. From here on, every UPDATE records the truth.
