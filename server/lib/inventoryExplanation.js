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
  // the moment to restock).
  //
  // The product's name is only needed for the message text, and only on
  // this branch — the healthy branch above never touches it. Fetching it
  // here, lazily, rather than asking all three call sites to look it up
  // and pass it in, keeps their code simpler: none of them otherwise need
  // the product's name at the point they call this.
  const product = await client.query('SELECT p.product_name FROM inventory i JOIN products p ON p.product_id = i.product_id WHERE i.inventory_id = $1', [inventoryId])
  const alertMessage = `${product.rows[0].product_name} is low on stock: ${stockQuantity} remaining (minimum ${minStockLevel}).`

  // UPDATE-FIRST, INSERT-ONLY-IF-NOTHING-WAS-UPDATED. Two rules are being
  // satisfied at once here, and it's worth separating them.
  //
  // Rule one, "at most one open alert per product": this UPDATE targets
  // is_resolved = FALSE rows, and the INSERT below runs only when it
  // matched nothing. So an already-open alert is never joined by a
  // second one. That is what stops the flood described above.
  //
  // Rule two, "the open alert must stay TRUE". Simply returning early
  // when an alert already existed — the obvious way to satisfy rule one —
  // was wrong, because the message is written in the present tense: "is
  // low on stock: 5 remaining". An alert opened when stock hit 5 and
  // never touched again would still say 5 after stock fell to 1. The
  // number an admin reads while deciding how urgently to restock would be
  // the number from whenever the problem STARTED, not the number now.
  // Refreshing the message in place keeps one row per problem AND keeps
  // that row honest.
  //
  // Using rowCount to decide between update and insert (rather than a
  // SELECT first) also means one fewer round trip, and no window between
  // checking and acting — though the window would be harmless here
  // anyway, since every caller holds the inventory row lock.
  const refreshed = await client.query(
    'UPDATE stock_alerts SET alert_message = $2 WHERE inventory_id = $1 AND is_resolved = FALSE',
    [inventoryId, alertMessage],
  )
  if (refreshed.rowCount > 0) return

  await client.query('INSERT INTO stock_alerts (inventory_id, alert_message) VALUES ($1, $2)', [inventoryId, alertMessage])
}
