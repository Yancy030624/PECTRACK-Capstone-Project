// Shared low-stock alerting, used by every place stock_quantity can change:
// order placement and cancellation (routes/orders.js) and the admin direct
// edit (routes/inventory.js). Kept here rather than duplicated three times,
// since all three need the exact same rule applied the exact same way.

// Keeps stock_alerts in sync with the stock level it's watching. Call this
// inside the SAME transaction as whatever write changed stock_quantity or
// min_stock_level, right after that write — so the alert can never observe
// a state the database itself hasn't committed to yet.
//
// The invariant this maintains: AT MOST ONE unresolved (is_resolved =
// FALSE) alert per inventory_id, not one alert per movement. Without that
// check, a popular product sitting below its minimum would get a fresh row
// every time an order nudged it lower, flooding whatever screen reads this
// table with duplicates of the same fact rather than one actionable alert.
export async function syncStockAlert(client, { inventoryId, stockQuantity, minStockLevel }) {
  if (stockQuantity > minStockLevel) {
    // Healthy again — close out whatever was open. UPDATE ... WHERE
    // is_resolved = FALSE is naturally a no-op if nothing was open, so
    // this is safe to call unconditionally on every write, not just ones
    // that follow a low-stock write.
    await client.query('UPDATE stock_alerts SET is_resolved = TRUE WHERE inventory_id = $1 AND is_resolved = FALSE', [inventoryId])
    return
  }

  // At or below the minimum. Only write a NEW row if one isn't already
  // open for this product — this is the check that prevents the
  // one-alert-per-order flood described above.
  const existing = await client.query('SELECT 1 FROM stock_alerts WHERE inventory_id = $1 AND is_resolved = FALSE', [inventoryId])
  if (existing.rowCount > 0) return

  // The product name is only needed for this one message, so it's fetched
  // here rather than asking every call site to plumb it through — none of
  // the three callers otherwise need it at the point they call this.
  const product = await client.query('SELECT p.product_name FROM inventory i JOIN products p ON p.product_id = i.product_id WHERE i.inventory_id = $1', [inventoryId])
  await client.query(
    'INSERT INTO stock_alerts (inventory_id, alert_message) VALUES ($1, $2)',
    [inventoryId, `${product.rows[0].product_name} is low on stock: ${stockQuantity} remaining (minimum ${minStockLevel}).`],
  )
}
