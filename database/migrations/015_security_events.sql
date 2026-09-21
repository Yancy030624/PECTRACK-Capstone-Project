-- Migration 015 — the security audit trail
--
-- Apply with:
--   psql -U postgres -d pectrack -f database/migrations/015_security_events.sql
--
-- RULES-PLANS/SECURITY_REVIEW.md finding J. The system already records
-- what happened to the BUSINESS — order_status_history, both stock
-- ledgers, report_logs — but nothing recorded what happened to an
-- ACCOUNT. There was no way to answer "has anyone been trying to get in,
-- and did they succeed", which is the question a security review exists
-- to make answerable.
--
-- Three rules this table is built around:
--
-- 1. It never holds a secret. No password, no OTP code, no session id, no
--    reset token. A log that leaks the thing it is logging is worse than
--    no log, because it concentrates every secret in one table.
--
-- 2. user_id is nullable and ON DELETE SET NULL. A failed login against a
--    username that does not exist has no user to point at, and deleting an
--    account must not erase the record that it once did something — the
--    event outlives the account, which is exactly when it matters most.
--
-- 3. It is append-only by convention: nothing in the application updates
--    or deletes a row. Enforcing that in the database would need a
--    role-grant scheme this project does not have, so it is stated here
--    and honoured in routes/auth.js rather than pretended.

BEGIN;

-- A fixed list rather than free text, so a query for "failed sign-ins
-- this week" cannot miss rows because two call sites spelled the same
-- event differently.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'security_event_type') THEN
    CREATE TYPE security_event_type AS ENUM (
      'LOGIN_SUCCESS',
      'LOGIN_FAILURE',
      'LOGIN_LOCKED_OUT',
      'LOGOUT',
      'OTP_ISSUED',
      'OTP_SUCCESS',
      'OTP_FAILURE',
      'PASSWORD_RESET_REQUESTED',
      'PASSWORD_RESET_COMPLETED',
      'PASSWORD_CHANGED',
      'ACCOUNT_CREATED',
      'ACCOUNT_DEACTIVATED',
      'ACCOUNT_REACTIVATED',
      'STAFF_PASSWORD_RESET'
    );
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS security_events (
  event_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_type security_event_type NOT NULL,
  -- Null when the event has no account behind it (a sign-in attempt on a
  -- username nobody owns) or when the account has since been deleted.
  user_id BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
  -- What the caller TYPED, kept even when it matches no account — that is
  -- the whole value of a failed-login record. Never a password.
  username VARCHAR(50),
  -- The client address as Express resolved it. Stored as text, not INET:
  -- behind a proxy this can be an IPv4-mapped IPv6 form or, when
  -- TRUST_PROXY_HOPS is misconfigured, something that is not an address at
  -- all. A log that throws on a malformed value loses exactly the events
  -- worth keeping.
  ip_address VARCHAR(64),
  -- Truncated by the application. A browser sends ~150 characters; an
  -- attacker can send kilobytes, and this table must not become a place to
  -- store them.
  user_agent VARCHAR(255),
  -- Short, non-secret context: which role, which door, why a reset failed.
  -- Anything that might be a credential belongs nowhere near this column.
  detail VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- "What happened to this account" and "what happened recently", the two
-- questions this table exists to answer.
CREATE INDEX IF NOT EXISTS security_events_user_id_idx ON security_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS security_events_type_idx ON security_events (event_type, created_at DESC);
-- Answers "is one address hammering us", which is how the rate limiter's
-- in-memory counters get corroborated after the fact.
CREATE INDEX IF NOT EXISTS security_events_ip_idx ON security_events (ip_address, created_at DESC);

COMMIT;
