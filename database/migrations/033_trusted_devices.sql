-- Migration 033 — "Trust this device for 30 days" for the admin sign-in code
--
-- Apply with psql:
--   psql -U postgres -d pectrack -f database/migrations/033_trusted_devices.sql
--
-- The user, 2026-10-20: entering the emailed code at every admin sign-in is
-- a chore. After a correct code the admin may tick "Trust this device for
-- 30 days"; that browser then gets a long random token in an HttpOnly
-- cookie, and this table keeps only its SHA-256 hash. A sign-in from that
-- browser, with the right password, skips the code until the trust expires.
-- A password change or reset forgets every trusted device of the account.
--
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction block, so the
-- event type is added first, on its own.

ALTER TYPE security_event_type ADD VALUE IF NOT EXISTS 'OTP_SKIPPED_TRUSTED_DEVICE';

BEGIN;

CREATE TABLE IF NOT EXISTS trusted_devices (
  trusted_device_id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  user_agent TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS trusted_devices_user_idx ON trusted_devices (user_id);

COMMIT;
