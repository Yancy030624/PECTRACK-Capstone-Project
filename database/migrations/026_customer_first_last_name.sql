-- Migration 026 — customers get a first name and a last name
--
-- Apply with psql:
--   psql -U postgres -d pectrack -f database/migrations/026_customer_first_last_name.sql
--
-- The adviser (2026-10-16) asked for First name and Last name on the
-- Create Account form, saved separately. customers.name stays: some thirty
-- queries, the analytics views and every receipt read it, so it is kept
-- as the full name, maintained by the trigger below and never written on
-- its own by the app any more.
--
-- Existing accounts keep working without registering again. Their full
-- name is split once: the last word is the last name, together with any
-- Filipino or Spanish particles in front of it ("Juan Dela Cruz" -> Juan /
-- Dela Cruz, "Ana de los Reyes" -> Ana / de los Reyes). A one-word name
-- keeps it as the first name and leaves the last name empty. A customer
-- whose name was split wrongly corrects it in My Profile.
--
-- Staff accounts keep a single name; the adviser's request is about the
-- customer's Create Account page.

BEGIN;

ALTER TABLE customers
  ADD COLUMN first_name VARCHAR(70),
  ADD COLUMN last_name VARCHAR(70);

-- {first, last} from a full name. Used by the backfill and by the trigger
-- when only the full name is written (the demo seed, older scripts).
CREATE FUNCTION split_person_name(full_name TEXT) RETURNS TEXT[] AS $$
DECLARE
  cleaned TEXT := regexp_replace(btrim(COALESCE(full_name, '')), '\s+', ' ', 'g');
  parts TEXT[];
BEGIN
  parts := regexp_match(
    cleaned,
    '^(.+?) ((?:(?:de|dela|del|delos|da|di|san|sta\.?|santa|la|las|los|van|von) )*[^ ]+)$',
    'i'
  );
  IF parts IS NULL THEN
    RETURN ARRAY[NULLIF(cleaned, ''), NULL];
  END IF;
  RETURN parts;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Keeps the three columns in step, whichever side was written:
-- - first_name / last_name given (the app): name is built from them;
-- - only name changed (a script): first_name / last_name are split from it.
CREATE FUNCTION customers_sync_name() RETURNS trigger AS $$
DECLARE
  parts TEXT[];
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.first_name IS NOT DISTINCT FROM OLD.first_name
     AND NEW.last_name IS NOT DISTINCT FROM OLD.last_name
     AND NEW.name IS DISTINCT FROM OLD.name THEN
    parts := split_person_name(NEW.name);
    NEW.first_name := parts[1];
    NEW.last_name := parts[2];
  ELSIF NULLIF(btrim(NEW.first_name), '') IS NOT NULL THEN
    NEW.first_name := btrim(NEW.first_name);
    NEW.last_name := NULLIF(btrim(NEW.last_name), '');
  ELSE
    parts := split_person_name(NEW.name);
    NEW.first_name := parts[1];
    NEW.last_name := parts[2];
  END IF;
  NEW.name := concat_ws(' ', NEW.first_name, NEW.last_name);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Backfill every existing customer before the trigger exists.
UPDATE customers
   SET first_name = (split_person_name(name))[1],
       last_name = (split_person_name(name))[2];

ALTER TABLE customers ALTER COLUMN first_name SET NOT NULL;

CREATE TRIGGER customers_sync_name
  BEFORE INSERT OR UPDATE OF name, first_name, last_name ON customers
  FOR EACH ROW EXECUTE FUNCTION customers_sync_name();

COMMIT;
