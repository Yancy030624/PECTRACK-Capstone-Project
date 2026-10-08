// ============================================================================
// PECTRACK API — lib/refunds.js (annotated for learning)
// Turns a ledger refund into a gateway refund.
//
// Before migration 009 a refund was only a status: cancelling a paid order
// flipped the payments row PAID -> REFUNDED and nothing told PayMongo, so
// for an online GCash payment the customer's money never moved back. Two
// columns fixed that: gateway_payment_id (PayMongo's own Payment id,
// learned from the payment.paid webhook — the checkout session id cannot
// be refunded) and refund_reference (the Refund id once one exists).
//
// A REFUNDED row with a gateway_payment_id and NO refund_reference is the
// whole definition of "owed at the gateway". settleGatewayRefunds(orderId)
// finds those rows for one order, calls PayMongo for each, and records the
// refund id as each succeeds. A failure leaves the row exactly as it was —
// still owed, still findable next time — and is reported to the caller.
//
// The one rule worth remembering: this runs OUTSIDE any transaction and
// holds no lock. It is a network round trip to a third party, and
// PHASE6.5_PLAN.md's intent route measured what happens when a pooled
// connection waits on one (an unrelated route took 2.3 s). The ledger
// write that made the row REFUNDED committed before this runs; this can
// only ADD a reference, never change a status.
//
// Callers: PATCH /api/orders/:id CANCELLED (after its COMMIT), the
// payment.paid webhook (when it refunds a late payment on a cancelled
// order), and POST /api/payments/:id/refund (an admin retrying one).
// describeGatewayRefunds() phrases the outcome once so those routes cannot
// drift in wording.
// ============================================================================
// The live implementation is server/lib/refunds.js — 60 lines, commented
// in place. It is short enough that copying it here would only make two
// places to keep in step.
