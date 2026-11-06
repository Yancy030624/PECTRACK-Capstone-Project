-- First sign-in setup (a colleague's suggestion, approved 2026-11-06). An
-- account handed to someone by another person must choose its own username
-- and password before it can do anything else.
--
-- Set for a new staff account and after an admin resets a staff password.
-- Existing accounts stay as they are. For the admin, the group turns it on at
-- handover with scripts/require-credential-setup.mjs.
--
-- Run this before the push.

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS must_set_credentials BOOLEAN NOT NULL DEFAULT FALSE;

COMMIT;
