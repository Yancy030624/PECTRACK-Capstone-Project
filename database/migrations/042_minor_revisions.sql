-- Migration 042 — the panel's minor revisions (data only)
--
-- Apply with psql:
--   psql -U postgres -d pectrack -f database/migrations/042_minor_revisions.sql
--
-- RULES-PLANS/MINOR_REVISIONS_PLAN.md (the panel, 2026-10-26; the user,
-- 2026-10-27). Two one-time updates; no table changes.
--
-- M1. Email confirmation is gone: a customer who registered and never
--     clicked the link could not order. Their email now counts as
--     confirmed, like every new account's.
-- M13. Delivery accounts are gone: staff move delivery orders themselves.
--     Existing rider accounts are deactivated, not deleted, so their past
--     deliveries stay in the records. Their open sessions end with them.
--
-- Run this before the push.

BEGIN;

UPDATE customers SET email_verified_at = CURRENT_TIMESTAMP WHERE email_verified_at IS NULL;

UPDATE users SET is_active = FALSE WHERE user_type = 'DELIVERY_PERSONNEL' AND is_active;
DELETE FROM sessions WHERE user_id IN (SELECT user_id FROM users WHERE user_type = 'DELIVERY_PERSONNEL');

COMMIT;
