-- Migration 032 — SMS phone codes and counter reservations
--
-- Apply with psql:
--   psql -U postgres -d pectrack -f database/migrations/032_phone_codes_and_reservations.sql
--
-- RULES-PLANS/RESERVE_SMS_PLAN.md (the adviser, 2026-10-19).
--
-- 1. phone_verifications — a 6-digit code texted to a number, to prove the
--    person has that phone: at customer sign-up (REGISTER) and when the
--    cashier takes a reservation (RESERVE). Same shape as otp_codes: only
--    SHA-256 hashes of the code and of the token are kept.
-- 2. customers.contact_verified_at — when the account's number was proven.
-- 3. Orders taken at the counter carry the customer's own details now:
--    a walk-in its name, a reservation its name, contact number and email,
--    plus the hash of the private receipt link emailed to them.
--
-- Additive only; the code before this one reads the tables without trouble.

BEGIN;

CREATE TABLE IF NOT EXISTS phone_verifications (
  verification_id BIGSERIAL PRIMARY KEY,
  phone VARCHAR(20) NOT NULL,
  purpose VARCHAR(20) NOT NULL CHECK (purpose IN ('REGISTER', 'RESERVE')),
  code_hash TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS phone_verifications_phone_idx ON phone_verifications (phone, purpose, created_at DESC);

ALTER TABLE customers ADD COLUMN IF NOT EXISTS contact_verified_at TIMESTAMPTZ;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS guest_name VARCHAR(100);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS guest_contact VARCHAR(20);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS guest_email VARCHAR(255);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS guest_contact_verified_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_reservation BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS receipt_token_hash TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS orders_receipt_token_hash_key ON orders (receipt_token_hash) WHERE receipt_token_hash IS NOT NULL;

COMMIT;
