-- Migration 020 — sign staff out after inactivity (Phase 10, B6)
--
-- Apply with:
--   psql -U postgres -d pectrack -f database/migrations/020_session_idle_timeout.sql
--
-- The thesis (p.92) says a session "expires after a defined period of
-- inactivity" and "idle accounts are automatically logged out". Sessions
-- had only a fixed 7-day expiry. last_seen_at records the last request a
-- person made; server/lib/auth.js ends a staff session idle for more than
-- 30 minutes (Decision D1). Customers keep the 7-day session.

-- ADD VALUE cannot share a transaction with a statement that uses the new
-- value, so it runs on its own, before the BEGIN.
ALTER TYPE security_event_type ADD VALUE IF NOT EXISTS 'SESSION_EXPIRED';

BEGIN;

-- Existing sessions start counting from now, not from when they were
-- created — nobody is signed out the moment this migration runs.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

COMMIT;
