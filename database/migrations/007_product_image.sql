-- Migration 007 — a product may have one photo
--
-- Apply with:
--   psql -U postgres -d pectrack -f database/migrations/007_product_image.sql
--
-- Prepares the schema for the customer storefront's Menu page
-- (STOREFRONT_PLAN.md, Decision 5 / Step 5). See that plan for the full
-- reasoning; the short version:
--
-- Phase 8's review already found `report_logs` sitting unused for three
-- phases before anything read it — this column is added the opposite way,
-- only once the feature that uses it (an ADMIN-only upload endpoint, a
-- public serving endpoint, and the Menu page rendering real photos
-- instead of a placeholder tile) exists in the same change.
--
-- Nullable, and stays that way: not every product needs a photo before
-- the bakery has one for it, and NULL simply means "show the placeholder
-- tile" — never an empty string, which would ambiguously mean either
-- "no photo" or "a photo whose key happens to be blank".
--
-- Holds a storage_key exactly like delivery_proofs.storage_key already
-- does (PHASE7_PLAN.md, Decision 8) — a random UUID+extension that
-- server/lib/storage.js generates, never a client-supplied filename or a
-- filesystem path. Same reasoning, same module, second caller.

BEGIN;

ALTER TABLE products ADD COLUMN IF NOT EXISTS image_key VARCHAR(255) NULL;

COMMIT;
