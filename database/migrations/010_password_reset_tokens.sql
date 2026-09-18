-- Migration 010 — email password reset tokens
--
-- Apply with:
--   psql -U postgres -d pectrack -f database/migrations/010_password_reset_tokens.sql
--
-- A customer who forgets their password had no way back in: the login
-- screen said "Contact the bakery", and an admin can only reset CASHIER
-- and DELIVERY_PERSONNEL passwords (routes/staff.js). This table backs the
-- email-based recovery in routes/auth.js (/forgot-password and
-- /reset-password).
--
-- Same shape and reasoning as otp_codes: the row holds only a SHA-256 hash
-- of the token — the token itself exists once, in the email — so a read of
-- this table is not a way in. expires_at bounds the window (30 minutes,
-- set by the route), consumed_at makes a token single-use, and a new
-- request replaces any earlier unconsumed token for the same account so at
-- most one live link exists per user.
--
-- Its own table rather than otp_codes because the two are different
-- secrets with different lifetimes and different delivery channels, and
-- otp_codes joins to admins only.

BEGIN;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS password_reset_tokens_user_id_idx ON password_reset_tokens (user_id);

COMMIT;
