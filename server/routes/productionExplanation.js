// ============================================================================
// PECTRACK API — routes/production.js (annotated for learning)
// Production batches — Phase 9A, Decisions 5–7 and 9 of
// RULES-PLANS/PHASE9A_DATA_FOUNDATION_PLAN.md. Mounted at /api/production.
//
// A batch is the one event that joins the two ledgers. When it is
// APPROVED, in one transaction:
//   1. the batch row is claimed PENDING -> APPROVED with a conditional
//      UPDATE (rowCount 0 means someone else got there first: 409);
//   2. its ingredient lines are locked in a fixed order (ingredient_id
//      ascending, FOR UPDATE) and each is deducted with `stock_quantity -
//      used >= 0` in the WHERE clause — the first shortfall aborts with
//      "Not enough {name}…" and nothing has moved;
//   3. every deduction is written as an ingredient_movements
//      PRODUCTION_USE row carrying the batch id AND the ingredient's
//      average_unit_cost at that moment — that snapshot is the batch's
//      cost, and it never changes afterwards even if flour gets cheaper;
//   4. total_cost = SUM(quantity_used × unit_cost), in SQL;
//   5. the packed outputs are added to `inventory` (locked in product_id
//      order) with an inventory_movements row whose reason is PRODUCTION —
//      the same row a RESTOCK writes, with batch_id set — and the existing
//      syncStockAlert() runs, so a low-stock alert closes the way it
//      always has.
// Lock order is batch, then ingredients, then inventory, always — the
// cross-table rule feedback_cross_table_lock_ordering exists for.
//
// Who applies it: an ADMIN's own POST applies immediately in the same
// transaction (recorded and approved by the same person, which the row
// says). A CASHIER's POST lands PENDING; an ADMIN PATCHes it APPROVED or
// REJECTED, and the cashier may PATCH their own pending one CANCELLED
// (withdraw). Rejected and withdrawn batches move nothing and stay for
// the record.
//
// What the form must say: the recipe, the planned size (recipe lines are
// scaled to it in Postgres, ROUND(q × planned / yield, 3), unless the
// caller sends its own lines — the baker who used more flour is the only
// one who knows), the good output, the loss, and how the good output was
// packed. Outputs must be products mapped to this recipe, and
// SUM(quantity × units_per_item) must equal the produced quantity within
// 0.0005 — the route refuses a mismatch rather than guessing where the
// difference went.
//
// data_source is always RECORDED here (Decision 9). Only the demo seed
// writes ASSUMED, and only by direct UPDATE after the fact; the API has no
// way to say "this is made up".
// ============================================================================
// The live implementation is server/routes/production.js, commented in
// place — applyBatch() is the transaction above, step by step. It is not
// copied here.
