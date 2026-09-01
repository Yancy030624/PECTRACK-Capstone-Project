// ============================================================================
// PECTRACK API — lib/billing.js (annotated for learning)
// Shared "what does this order owe" calculation (Phase 6 — see
// PHASE6_PLAN.md). FIVE call sites need this exact figure: POST
// /api/payments (the response after recording one), GET /api/orders/:id
// (the receipt view), both the COMPLETED and CANCELLED branches of
// PATCH /api/orders/:id, and GET /api/orders (the LIST, so staff can see
// which orders still owe without opening each one). Writing SUM(amount)
// five times would violate "avoid duplicated business logic across
// routes" (PHASES-RULES-PLANNING.md) — worse, it would risk one of the
// five getting the status filter wrong (PAID only, never PENDING/FAILED/
// REFUNDED) and silently treating an unrelated row as money in hand.
//
// The list was added last, in review, and is the clearest illustration of
// why this module exists: the obvious way to add a balance column would
// have been a second SUM inside routes/orders.js's own list query, which
// would have looked correct and quietly shipped WITHOUT the
// ::numeric(12,2) fix described below — reintroducing a formatting bug
// that had already been found and fixed once, in a place no test was
// watching. Sharing the SQL fragments makes that mistake impossible
// rather than merely discouraged.
// ============================================================================

// WHY THIS TAKES A `client` PARAMETER RATHER THAN IMPORTING `pool` ITSELF.
// Same reasoning as lib/inventory.js's syncStockAlert. A caller INSIDE a
// transaction (both branches of PATCH /api/orders/:id) passes its OWN
// client, so this function's queries run on the SAME connection that
// already holds whatever row lock protects the order — meaning it sees a
// consistent picture, and specifically sees writes that transaction has
// already made but not yet committed. A caller OUTSIDE any transaction (a
// plain GET, or the POST /api/payments response built after COMMIT) passes
// the shared `pool`, and pg handles connect/query/release for it
// automatically.
//
// WHY "IS THIS PAID?" IS A SUM, NEVER A COLUMN. payments.order_id has NO
// UNIQUE constraint (PHASE6_PLAN.md, Decision 1) — deliberately. One order
// legitimately produces several payment rows: a deposit then the balance,
// or a failed GCash attempt followed by a successful one. Storing a single
// "amount paid" figure on the orders table would be a SECOND place that
// number could live, and the two could drift apart the moment a payment
// was recorded and that column wasn't updated to match — the exact
// problem orders.total_amount already avoids by being summed from
// order_details rather than stored and hand-maintained (see the long
// comment on that in routes/orders.js). Same reasoning here: whatever was
// really written to the payments table is what gets counted, every time,
// by re-deriving it rather than trusting a cached figure.
// THE ONE DEFINITION of what an order's money columns mean, split into
// the join that supplies them and the columns themselves so two different
// queries — the single-order summary below, and the multi-order list in
// routes/orders.js — can each splice them into their own SELECT.
//
// WHY RAW SQL FRAGMENTS RATHER THAN A FUNCTION. getBillingSummary runs one
// query per order, which is exactly right for a receipt but would be an
// N+1 disaster if the order list called it once per row. The list needs
// these figures computed for every order in a SINGLE query — so what has
// to be shared is the SQL itself, not a function that runs it.
//
// The cost of sharing raw SQL is a coupling that a function would not
// have: both fragments assume the orders table is aliased `o`, and the
// columns assume the join is present. That contract is stated here rather
// than left for a third caller to discover through a syntax error.
const billingJoinSql = `LEFT JOIN (
         -- A SEPARATE subquery, not a scalar correlated subquery repeated
         -- once per column — computed ONCE, then joined in. GROUP BY here
         -- is fine specifically because this fragment never carries FOR
         -- UPDATE itself: it is a plain read, issued (for every
         -- transactional caller) on a client that ALREADY holds the
         -- order's row lock from an earlier statement in the same
         -- transaction. PATTERN A in PHASE6_PLAN.md is explicit that FOR
         -- UPDATE cannot be combined with GROUP BY in the SAME statement
         -- (Postgres rejects it outright, error 0A000), which is exactly
         -- why the lock and the aggregation are kept as two separate
         -- statements rather than folded into one.
         SELECT order_id, SUM(amount) AS amount FROM payments WHERE status = 'PAID' GROUP BY order_id
       ) paid ON paid.order_id = o.order_id`

// ::numeric(12,2) matters, and not for the reason it might look like at
// first. COALESCE(paid.amount, 0) is correct ARITHMETIC either way — the
// bug is purely about DISPLAY. When an order has NO PAID rows yet (every
// order, until its first payment), the join above produces paid.amount =
// NULL, and COALESCE falls back to the bare integer literal 0 — which
// Postgres formats over the wire as the string '0', not '0.00'. Every
// OTHER money figure here (total_amount, balance_due, and amount_paid once
// a real SUM exists) formats with exactly two decimal places, because each
// of those expressions has a NUMERIC(12,2) operand (total_amount itself)
// to inherit its scale from. amount_paid, on its OWN, has nothing to
// inherit from when the fallback fires — so the explicit cast is what
// forces it to match. This was an actual bug caught by payments.test.js's
// "an unpaid order reports amountPaid as '0.00', not '0'" test, not a
// hypothetical one.
//
// is_fully_paid and has_payments are returned as ready-made BOOLEANS,
// decided here in Postgres rather than by a caller comparing strings in
// JavaScript — see the note inside getBillingSummary for why even the
// "looks safe" version of that comparison is a habit worth avoiding.
const billingColumnsSql = `COALESCE(paid.amount, 0)::numeric(12,2) AS amount_paid,
            o.total_amount - COALESCE(paid.amount, 0) AS balance_due,
            (o.total_amount - COALESCE(paid.amount, 0)) <= 0 AS is_fully_paid,
            COALESCE(paid.amount, 0) > 0 AS has_payments`

// Exported as a pair so routes/orders.js can splice the same money columns
// into its own list query without restating them.
export const billingListSql = { columns: billingColumnsSql, join: billingJoinSql }

// Maps those four columns out of any row that selected them. Shared for
// the same reason the SQL is: it keeps the camelCase field names identical
// between the single-order response and the list response, so the frontend
// reads `balanceDue` the same way in both places.
export const mapBillingColumns = (row) => ({
  amountPaid: row.amount_paid,
  balanceDue: row.balance_due,
  isFullyPaid: row.is_fully_paid,
  hasPayments: row.has_payments,
})

export async function getBillingSummary(client, orderId) {
  // Every money DECISION here (isFullyPaid, hasPayments) is computed in
  // POSTGRES, using NUMERIC arithmetic, and returned as a ready-made
  // boolean — never as a NUMERIC string a caller then has to compare in
  // JavaScript. This matters more than it looks: pg returns NUMERIC
  // columns as STRINGS specifically because JS numbers are binary
  // floating point and would silently lose precision on money. But even
  // the "looks safe" case of comparing a NUMERIC string against the
  // literal 0 (e.g. `balanceDue > 0` in JS) is a habit not worth forming,
  // because the moment that same code is copied to compare TWO NUMERIC
  // strings against each other, '500.00' > '1000.00' is TRUE under plain
  // string (lexicographic) comparison. Deciding the boolean once, here,
  // correctly, removes the temptation to ever do that comparison
  // anywhere else in the app.
  const summaryResult = await client.query(
    `SELECT o.total_amount, ${billingColumnsSql}
       FROM orders o
       ${billingJoinSql}
      WHERE o.order_id = $1`,
    [orderId],
  )
  const summary = summaryResult.rows[0]
  // NULL, not a thrown error, when the order itself doesn't exist. Every
  // call site already knows how to turn "the order isn't there" into the
  // right HTTP response for its own context (a 404 in GET /api/orders/:id,
  // a ROLLBACK-then-409 inside a transaction) — this function's job is
  // only to compute a figure, not to decide what an absent order means to
  // whichever route asked.
  if (!summary) return null

  const paymentsResult = await client.query(paymentsForOrderSelectQuery, [orderId])

  return {
    totalAmount: summary.total_amount,
    ...mapBillingColumns(summary),
    payments: paymentsResult.rows.map(mapPaymentRow),
  }
}

// WHY THE JOIN IS NARROWER THAN order_status_history's FOUR-WAY ONE.
// order_status_history.updated_by can genuinely be ANY of the four role
// tables — a customer cancelling their own order, a cashier moving it
// through the kitchen, or an admin overriding something — so that query
// has to COALESCE across admins/cashiers/customers/delivery_personnel to
// find whichever one matches.
//
// recorded_by and refunded_by are narrower BY CONSTRUCTION, not by
// coincidence: routes/payments.js's POST / requires CASHIER or ADMIN
// (never CUSTOMER or DELIVERY_PERSONNEL) before a row can even be
// inserted, and routes/orders.js's refund branch (Decision 8) only ever
// runs for an ADMIN. So a payment's recorded_by is always a cashier or an
// admin, and its refunded_by is always an admin — joining against exactly
// those tables (and no others) is enough to name whoever did it, the same
// reasoning routes/inventory.js already uses for requested_by (cashiers
// only) and reviewed_by (admins only) on inventory_change_requests.
const paymentsForOrderSelectQuery = `SELECT p.payment_id, p.payment_method, p.amount, p.status, p.gateway_reference, p.payment_date, p.created_at,
            COALESCE(ra.name, rc.name) AS recorded_by_name,
            p.refunded_at, p.refund_reason, fa.name AS refunded_by_name
       FROM payments p
       LEFT JOIN admins ra ON ra.user_id = p.recorded_by
       LEFT JOIN cashiers rc ON rc.user_id = p.recorded_by
       LEFT JOIN admins fa ON fa.user_id = p.refunded_by
      WHERE p.order_id = $1
      ORDER BY p.created_at`

// Reshapes one payments row into the camelCase shape the frontend
// consumes — same purpose as mapInventoryRow/mapChangeRequestRow in
// routes/inventory.js, just living here instead because THIS mapping is
// shared (GET /api/orders/:id and POST /api/payments's response both need
// it), where those two are each used by exactly one route file.
const mapPaymentRow = (row) => ({
  id: row.payment_id,
  method: row.payment_method,
  amount: row.amount,
  status: row.status,
  gatewayReference: row.gateway_reference,
  paymentDate: row.payment_date,
  recordedByName: row.recorded_by_name,
  refundedAt: row.refunded_at,
  refundReason: row.refund_reason,
  refundedByName: row.refunded_by_name,
  createdAt: row.created_at,
})
