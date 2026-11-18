-- Password codes (the panel, final defense 2026-11-18;
-- RULES-PLANS/FINAL_DEFENSE_REVISIONS_PLAN.md C3). Forgot password and
-- change password now use a six-digit code sent by email, valid for 5
-- minutes, instead of a link. The codes live in password_reset_tokens:
--
--   purpose       RESET (forgot password) or CHANGE (signed-in change).
--   code_hash     SHA-256 of the six digits; the code itself is only in
--                 the email.
--   attempt_count wrong tries on this code; the fifth ends it.
--
-- token_hash is no longer written (an old link row keeps its own), so it
-- may be NULL. Old reset links stop working: their rows have no code_hash.
--
-- Run this before the push.

BEGIN;

ALTER TABLE password_reset_tokens ALTER COLUMN token_hash DROP NOT NULL;
ALTER TABLE password_reset_tokens ADD COLUMN IF NOT EXISTS code_hash TEXT;
ALTER TABLE password_reset_tokens ADD COLUMN IF NOT EXISTS attempt_count SMALLINT NOT NULL DEFAULT 0 CHECK (attempt_count >= 0);
ALTER TABLE password_reset_tokens ADD COLUMN IF NOT EXISTS purpose VARCHAR(10) NOT NULL DEFAULT 'RESET' CHECK (purpose IN ('RESET', 'CHANGE'));
CREATE INDEX IF NOT EXISTS password_reset_tokens_live_idx ON password_reset_tokens (user_id, purpose) WHERE consumed_at IS NULL;
-- For the security log: a wrong or expired reset code, and a change code sent.
ALTER TYPE security_event_type ADD VALUE IF NOT EXISTS 'PASSWORD_RESET_FAILED';
ALTER TYPE security_event_type ADD VALUE IF NOT EXISTS 'PASSWORD_CHANGE_CODE_SENT';

COMMIT;
