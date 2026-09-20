// ============================================================================
// PECTRACK API — routes/ingredients.js (annotated for learning)
// The raw-materials ledger — Phase 9A, Decisions 1–3 of
// RULES-PLANS/PHASE9A_DATA_FOUNDATION_PLAN.md. Mounted at /api/ingredients.
//
// Flour, sugar, eggs. They are NOT products: nothing sells them, no
// inventory row exists for them, and stock_alerts never points at them.
// They have their own two tables — `ingredients` (current stock, minimum,
// average cost) and `ingredient_movements` (every signed change) — and the
// same invariant inventory.js already enforces for finished goods:
// stock_quantity never changes without a movement row written in the same
// transaction, so SUM(quantity_change) always equals the stock.
//
// Three writes, three routes, no free "set stock to X":
//   POST /:id/purchase — stock goes up by q, and the price paid folds into
//     average_unit_cost as a moving average, (stock×avg + q×cost)/(stock+q),
//     computed in Postgres NUMERIC, never in JavaScript floats (Decision 3).
//     This is where a real ingredient cost enters the system; everything
//     downstream (recipe previews, batch costing, product margins) reads it.
//   POST /:id/adjust — WASTE (must be negative) or CORRECTION (either way).
//     A correction is a recount, so it never touches the average cost. Going
//     below zero is refused by the conditional UPDATE, not by a read-then-
//     write check.
//   Production use is NOT a route here — routes/production.js writes the
//     PRODUCTION_USE rows inside its approval transaction, with the batch id
//     on them, so the two ledgers reconcile through one key.
//
// Reads are ADMIN and CASHIER; writes ADMIN. Low stock is computed on the
// way out (stock <= minimum), never stored — the dashboard's "Low
// ingredients" tile and the report summary do the same in SQL.
// ============================================================================
// The live implementation is server/routes/ingredients.js, commented in
// place. It is short and every rule above is visible at the line that
// enforces it, so it is not copied here.
