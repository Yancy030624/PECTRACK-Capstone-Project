// ============================================================================
// PECTRACK API — lib/inventory.js (annotated for learning)
// Shared low-stock alerting (Phase 5, Step 5 — see PHASE5_PLAN.md). Stock
// can change in THREE different places in this app: an order being placed
// (routes/orders.js), an order being cancelled (also routes/orders.js,
// which credits stock back), and an admin editing stock directly
// (routes/inventory.js). All three need the exact same alerting rule
// applied the exact same way, so it lives once here instead of being
// reimplemented three times — reimplementing it three times would also
// mean three chances for the rule to drift out of sync with itself.
// ============================================================================

// Keeps stock_alerts in sync with the stock level it's watching.
//
// WHY THIS TAKES A `client` PARAMETER RATHER THAN IMPORTING `pool` ITSELF.
// Every call site runs this INSIDE an existing transaction (BEGIN ...
// COMMIT), right after the same transaction's write to stock_quantity or
// min_stock_level. If this function used the shared `pool` directly
// instead of the caller's `client`, its queries would run on a SEPARATE
// connection, outside that transaction — meaning it could observe stock
// values that haven't been committed yet (or, just as bad, be unable to
// see writes the transaction just made, since a not-yet-committed write
// is invisible to any other connection). Accepting `client` guarantees
// this function sees exactly what its caller just wrote, immediately.
//
// WHY THE RULE IS "AT MOST ONE OPEN ALERT PER PRODUCT". Without checking
// for an existing one first, a popular product sitting below its minimum
// would get a brand new stock_alerts ROW every single time an order
// nudged it lower — ten orders in an afternoon, ten identical alerts,
// each saying the same thing with a slightly different number. Whatever
// screen eventually reads this table should show ONE actionable fact
// ("bread is low"), not a flood of near-duplicates of it.
export async function syncStockAlert(client, { inventoryId, stockQuantity, minStockLevel }) {
  if (stockQuantity > minStockLevel) {
    // Stock is healthy again — close out whatever alert was open. The
    // WHERE is_resolved = FALSE means this UPDATE is a harmless no-op
    // when nothing was open, which is WHY this function can be called
    // unconditionally after every stock-affecting write, rather than only
    // when the caller already knows a low-stock event might have
    // happened. Letting the query itself decide "is there anything to do
    // here" is simpler than every caller re-deriving that answer.
    await client.query('UPDATE stock_alerts SET is_resolved = TRUE WHERE inventory_id = $1 AND is_resolved = FALSE', [inventoryId])
    return
  }

  // At or below the minimum (stockQuantity <= minStockLevel — "at" counts
  // as low, not just "below", since sitting exactly on the line is still
  // the moment to restock). Only write a NEW row if one isn't ALREADY
  // open for this product — this SELECT is the entire mechanism behind
  // the "at most one open alert" rule described above.
  const existing = await client.query('SELECT 1 FROM stock_alerts WHERE inventory_id = $1 AND is_resolved = FALSE', [inventoryId])
  if (existing.rowCount > 0) return

  // The product's name is only needed for THIS one message, and only on
  // this branch (opening a brand new alert) — every other path through
  // this function never touches it. Fetching it here, lazily, rather than
  // asking all three call sites to look it up and pass it in, keeps their
  // code simpler: none of them otherwise need the product's name at the
  // point they call this.
  const product = await client.query('SELECT p.product_name FROM inventory i JOIN products p ON p.product_id = i.product_id WHERE i.inventory_id = $1', [inventoryId])
  await client.query(
    'INSERT INTO stock_alerts (inventory_id, alert_message) VALUES ($1, $2)',
    [inventoryId, `${product.rows[0].product_name} is low on stock: ${stockQuantity} remaining (minimum ${minStockLevel}).`],
  )
}
