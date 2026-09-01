// Shared "what does this order owe" calculation (Phase 6 — see
// PHASE6_PLAN.md). Four call sites need this exact figure: POST
// /api/payments (the response after recording one), GET /api/orders/:id
// (the receipt view), and both the COMPLETED and CANCELLED branches of
// PATCH /api/orders/:id (routes/orders.js). Writing SUM(amount) four times
// would violate "avoid duplicated business logic across routes"
// (PHASES-RULES-PLANNING.md) — worse, it would risk one of the four
// getting the status filter wrong (PAID only, never PENDING/FAILED/
// REFUNDED) and silently treating an unrelated row as money in hand.
//
// Takes a client rather than importing `pool` itself — same reasoning as
// lib/inventory.js's syncStockAlert. A caller inside a transaction (both
// branches of PATCH /api/orders/:id) passes its own client so this reads
// through the SAME connection that already holds whatever lock protects
// the order, and therefore sees a consistent picture rather than racing
// against its own transaction. A caller outside one (a plain GET, or the
// POST /api/payments response built after COMMIT) passes the pool.
//
// orders.order_id has no UNIQUE constraint on payments.order_id (Decision
// 1) — one order can legitimately hold several payment rows (a deposit
// then the balance, or a failed attempt then a successful one) — so "is
// this paid?" is answered by summing the PAID rows, never by reading a
// single column.
// The ONE definition of what an order's money columns mean, shared by
// getBillingSummary below (one order, for a receipt) and the order LIST in
// routes/orders.js (every order, so staff can see at a glance who still
// owes). Two consumers, one definition — writing the SUM out a second time
// in the list query is exactly the duplication this module exists to
// prevent, and it would have silently reintroduced the amount_paid
// formatting bug described below in a place no test was looking.
//
// Both fragments require the orders table to be aliased `o` and the join
// below to be present. That coupling is the price of sharing raw SQL; it
// is stated here so a third caller knows the contract rather than
// discovering it through a syntax error.
const billingJoinSql = `LEFT JOIN (
         SELECT order_id, SUM(amount) AS amount FROM payments WHERE status = 'PAID' GROUP BY order_id
       ) paid ON paid.order_id = o.order_id`

// ::numeric(12,2), not left as the bare COALESCE fallback, because that
// fallback is what runs whenever an order has NO PAID rows yet — which is
// every order until its first payment. Without the cast, Postgres's
// untyped integer literal 0 formats over the wire as the string '0', while
// every OTHER figure here (total_amount, balance_due, and amount_paid once
// a real SUM exists) formats as '0.00'. Money displayed with an
// inconsistent number of decimal places depending on whether anything has
// been paid yet is exactly the kind of subtle bug this file exists to
// prevent.
//
// is_fully_paid and has_payments are returned as ready-made BOOLEANS,
// decided here in Postgres NUMERIC arithmetic rather than by a caller
// comparing strings in JavaScript. pg returns NUMERIC as a string
// precisely because JS numbers are binary floating point, and even the
// "safe-looking" case of comparing a NUMERIC string against a literal 0 is
// a habit not worth forming: the moment a caller reuses that comparison
// against another NUMERIC string, '500.00' > '1000.00' is true under
// lexicographic comparison. Deciding it once here removes the temptation
// everywhere else.
const billingColumnsSql = `COALESCE(paid.amount, 0)::numeric(12,2) AS amount_paid,
            o.total_amount - COALESCE(paid.amount, 0) AS balance_due,
            (o.total_amount - COALESCE(paid.amount, 0)) <= 0 AS is_fully_paid,
            COALESCE(paid.amount, 0) > 0 AS has_payments`

// Exported as a pair so routes/orders.js can splice the same money columns
// into its own list query without restating them.
export const billingListSql = { columns: billingColumnsSql, join: billingJoinSql }

// Maps the four columns above out of any row that selected them — used by
// getBillingSummary here and by the order-list mapper in routes/orders.js,
// so the camelCase names stay identical in both responses too.
export const mapBillingColumns = (row) => ({
  amountPaid: row.amount_paid,
  balanceDue: row.balance_due,
  isFullyPaid: row.is_fully_paid,
  hasPayments: row.has_payments,
})

export async function getBillingSummary(client, orderId) {
  // Every money decision (isFullyPaid, hasPayments) is computed HERE, in
  // Postgres NUMERIC arithmetic, and returned as a ready-made boolean —
  // never as a string a caller then has to compare in JavaScript. pg
  // returns NUMERIC as a string precisely because JS numbers are binary
  // floating point, and even the "safe-looking" case of comparing a
  // NUMERIC string against a literal 0 is a habit not worth forming: the
  // moment a caller reuses that comparison against another NUMERIC
  // string, '500.00' > '1000.00' is true under lexicographic comparison.
  // Deciding it once here, correctly, removes the temptation everywhere
  // else.
  const summaryResult = await client.query(
    `SELECT o.total_amount, ${billingColumnsSql}
       FROM orders o
       ${billingJoinSql}
      WHERE o.order_id = $1`,
    [orderId],
  )
  const summary = summaryResult.rows[0]
  if (!summary) return null

  const paymentsResult = await client.query(paymentsForOrderSelectQuery, [orderId])

  return {
    totalAmount: summary.total_amount,
    ...mapBillingColumns(summary),
    payments: paymentsResult.rows.map(mapPaymentRow),
  }
}

// recorded_by is only ever written by POST /api/payments, which requires
// CASHIER or ADMIN — never a customer, delivery person, or a bare user
// row — so joining just those two role tables (rather than all four, the
// way order_status_history.updated_by has to) is enough to name whoever
// took the payment. refunded_by is narrower still: only the admin-only
// branch of PATCH /api/orders/:id ever sets it, so it only ever needs the
// admins table. Same reasoning routes/inventory.js already uses for
// requested_by (cashiers only) and reviewed_by (admins only).
const paymentsForOrderSelectQuery = `SELECT p.payment_id, p.payment_method, p.amount, p.status, p.gateway_reference, p.payment_date, p.created_at,
            COALESCE(ra.name, rc.name) AS recorded_by_name,
            p.refunded_at, p.refund_reason, fa.name AS refunded_by_name
       FROM payments p
       LEFT JOIN admins ra ON ra.user_id = p.recorded_by
       LEFT JOIN cashiers rc ON rc.user_id = p.recorded_by
       LEFT JOIN admins fa ON fa.user_id = p.refunded_by
      WHERE p.order_id = $1
      ORDER BY p.created_at`

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
