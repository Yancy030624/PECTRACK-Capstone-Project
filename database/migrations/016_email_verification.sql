-- Migration 016 — customer email verification
--
-- Apply with:
--   psql -U postgres -d pectrack -f database/migrations/016_email_verification.sql
--
-- Registration used to check that an email was well-formed and not
-- already taken, and nothing else. It never checked the address existed
-- or belonged to the person typing it — so a customer who mistyped
-- "gmial.com" got an account that worked until the day they forgot their
-- password, when the only recovery path pointed at a mailbox nobody owns.
--
-- Customers only. Staff accounts are created by an admin, and the one
-- staff role with a second factor (ADMIN) already proves its mailbox on
-- every sign-in.

BEGIN;

-- A timestamp, not a boolean: "when" is worth keeping, and NULL reads as
-- exactly what it means — never verified.
--
-- Every customer who existed before this migration is treated as
-- verified. They registered under rules that never asked, and turning
-- verification on must not suddenly block people who were ordering
-- yesterday.
--
-- The backfill runs ONLY in the same step that creates the column. A
-- plain "UPDATE ... WHERE email_verified_at IS NULL" would be wrong on a
-- re-run: by then NULL also means "registered after verification existed
-- and has not verified yet", and re-running the file would silently
-- verify every one of them.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'customers' AND column_name = 'email_verified_at'
  ) THEN
    ALTER TABLE customers ADD COLUMN email_verified_at TIMESTAMPTZ;
    UPDATE customers SET email_verified_at = CURRENT_TIMESTAMP;
  END IF;
END$$;

-- The same shape as password_reset_tokens (migration 010), for the same
-- reasons: only a SHA-256 hash of the token is stored, it is single-use
-- (consumed_at), and it expires. The address it was sent to is recorded
-- so that changing the email afterwards invalidates a link sent to the
-- old one — a link must verify the address it was mailed to, not
-- whatever the account says now.
CREATE TABLE IF NOT EXISTS email_verification_tokens (
  token_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  email VARCHAR(254) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS email_verification_tokens_user_id_idx ON email_verification_tokens (user_id, created_at DESC);

-- Two events for the audit trail (migration 015).
ALTER TYPE security_event_type ADD VALUE IF NOT EXISTS 'EMAIL_VERIFICATION_SENT';
ALTER TYPE security_event_type ADD VALUE IF NOT EXISTS 'EMAIL_VERIFIED';

COMMIT;
