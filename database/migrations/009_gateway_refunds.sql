-- Migration 009 — gateway payment id and refund reference on payments
--
-- Apply with:
--   psql -U postgres -d pectrack -f database/migrations/009_gateway_refunds.sql
--
-- Until now a refund was a ledger status only: cancelling a paid order
-- flipped the row PAID -> REFUNDED and nothing told PayMongo, so for an
-- online GCash payment the customer's money never actually moved back.
-- Issuing a real refund needs two things this table did not hold:
--
--   1. gateway_payment_id — PayMongo's own Payment id (pay_...), which is
--      what its Refunds API refunds. The checkout session id already in
--      gateway_reference is a different object and cannot be refunded.
--      Learned from the payment.paid webhook, the only place PayMongo
--      ever tells us which Payment settled which session. NULL for every
--      cash and counter-GCash row, which have no gateway side at all.
--
--   2. refund_reference — the PayMongo Refund id (ref_...) once one has
--      been created. NULL on a REFUNDED row that HAS a gateway_payment_id
--      is the signal "the books say refunded, the gateway does not yet":
--      the call failed, or credentials were not configured at the time.
--      server/lib/refunds.js retries exactly those rows.
--
-- Both nullable, both additive; nothing existing changes meaning.

BEGIN;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS gateway_payment_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS refund_reference VARCHAR(255);

COMMIT;
