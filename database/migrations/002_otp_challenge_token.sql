-- Migration 002 — bind the admin OTP to the password step that issued it
--
-- Apply with:
--   psql -U postgres -d pectrack -f database/migrations/002_otp_challenge_token.sql
--
-- WHAT IT FIXES
-- POST /api/auth/verify-otp accepted { username, code }. Nothing in that
-- request proved the caller had passed the password step — the two halves
-- of the login shared no state at all. A username is public-ish and
-- guessable, so in practice possession of the SMS code ALONE was a complete
-- admin session, and the password contributed nothing at the second step.
-- A code read off a lock screen, forwarded, or shoulder-surfed was the
-- whole login.
--
-- The fix gives each OTP a challenge_token. /login generates one and
-- returns it ONLY after the password verifies; /verify-otp looks the code
-- up BY that token and refuses to work without it. The two steps are now
-- one flow.
--
-- A side benefit: because the token identifies the row (and therefore the
-- user), /verify-otp no longer takes a username at all. There is one less
-- guessable input on the endpoint.
--
-- WHY NULLABLE
-- The column has to be addable to a table that already contains rows, and
-- there is no correct token to invent for them. Leaving them NULL is the
-- safe outcome: SQL equality against NULL is never true, so those old codes
-- can no longer be redeemed by anyone, rather than staying redeemable under
-- the weaker rule. Any admin mid-login when this is applied simply signs in
-- again.

BEGIN;

-- IF NOT EXISTS so re-running this file is harmless.
ALTER TABLE otp_codes ADD COLUMN IF NOT EXISTS challenge_token TEXT;

-- UNIQUE because this is the lookup key for redeeming a code, and the index
-- it creates is what makes that lookup fast. Postgres permits many NULLs in
-- a unique index, so the pre-existing rows above don't collide with each
-- other.
CREATE UNIQUE INDEX IF NOT EXISTS otp_codes_challenge_token_key
  ON otp_codes (challenge_token);

COMMIT;
