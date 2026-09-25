-- Migration 017 — two small follow-ups from the 2026-09-25 review
--
-- Apply with:
--   psql -U postgres -d pectrack -f database/migrations/017_reset_email_and_email_changed.sql
--
-- 1. password_reset_tokens.email — the address the reset link was mailed
--    to. Completing a password reset proves the person owns that mailbox,
--    so for a customer it now also confirms their email (migration 016).
--    That is also how the real owner of an address reclaims an account
--    someone else registered with it: "Forgot password" goes to their
--    inbox, not the squatter's. The address is recorded so a link mailed
--    BEFORE an email change cannot confirm the new, unproven address —
--    the same rule email_verification_tokens follows. Nullable because
--    tokens issued before this migration did not record it; those simply
--    confirm nothing.
--
-- 2. EMAIL_CHANGED in the audit trail. Changing an account's email now
--    requires the current password and notifies the old address; the
--    event records that it happened.

BEGIN;

ALTER TABLE password_reset_tokens ADD COLUMN IF NOT EXISTS email VARCHAR(254);

ALTER TYPE security_event_type ADD VALUE IF NOT EXISTS 'EMAIL_CHANGED';

COMMIT;
