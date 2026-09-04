// COUNTER_ORDER_PLAN.md, Part B — the other half of Decision 9
// ("removable, and invisible"). Reads the manifest seed-demo-data.mjs
// wrote and removes EXACTLY those orders — nothing guessed by date
// range or by account, only the ids the seed itself created.
//
// Deliberately does NOT touch:
//   - the RESTOCK/SPOILAGE inventory_movements rows Decision 10's pass
//     wrote, or the stock levels they set. Those are real inventory
//     corrections the seed made NECESSARY, not fake sales activity —
//     undoing them would leave stock in a state nothing ever actually
//     verified, which is worse than leaving it alone.
//   - the helper admin account seed-demo-data.mjs created. See that
//     script's own createTempAdmin() comment: it's invisible to every
//     screen in this app (Staff Management filters it out structurally),
//     and inventory_movements.changed_by still references it because of
//     the point directly above — so deleting it would fail on that
//     foreign key even if this script wanted to.
//
// Run with the database reachable (the API server does not need to be
// running — this deletes directly, in FK-safe order, the same way
// reports.test.js's own teardown does): node scripts/clear-demo-data.mjs
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pool } from '../server/db.js'

const manifestPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'demo-data-manifest.json')

async function main() {
  let manifest
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
  } catch {
    console.log(`No manifest found at ${manifestPath} — nothing to clear.`)
    return
  }

  const orderIds = manifest.orderIds ?? []
  if (orderIds.length === 0) {
    console.log('Manifest has no order ids — nothing to clear.')
    return
  }

  console.log(`Clearing ${orderIds.length} seeded orders (seeded at ${manifest.seededAt})...`)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Restore the stock each seeded order deducted, BEFORE its
    // order_details rows are deleted — mirrors exactly what a real
    // cancellation does (orders.js's own CANCELLED branch), just as a
    // bulk operation since these rows are being hard-deleted, not
    // walked through the cancel workflow one at a time. Only PICKUP/
    // DELIVERY orders that actually deducted stock need this — a
    // CANCELLED seeded order already had its stock restored for real
    // when the seed cancelled it, so restoring it AGAIN would over-credit
    // it. Only order_details tied to a NON-cancelled seeded order are
    // summed back in.
    const toRestore = await client.query(
      `SELECT od.product_id, SUM(od.quantity)::int AS quantity
         FROM order_details od
         JOIN orders o ON o.order_id = od.order_id
        WHERE o.order_id = ANY($1) AND o.status != 'CANCELLED'
        GROUP BY od.product_id`,
      [orderIds],
    )
    for (const row of toRestore.rows) {
      await client.query('UPDATE inventory SET stock_quantity = stock_quantity + $1 WHERE product_id = $2', [row.quantity, row.product_id])
    }
    console.log(`  Restored stock for ${toRestore.rows.length} products.`)

    // FK-safe order — the same sequence the reports.test.js/customers.
    // test.js teardowns already use throughout this codebase's own test
    // suites: payments and inventory_movements first (both reference
    // orders directly), then the order's own children, then the order.
    // deliveries.order_id has no FK from anything else, so it can go
    // alongside order_details.
    await client.query('DELETE FROM payments WHERE order_id = ANY($1)', [orderIds])
    // Only the ORDER_PLACED/ORDER_CANCELLED movements this seed's own
    // orders created — never a RESTOCK/SPOILAGE row (those have no
    // order_id at all, so ANY($1) against order_id can't match them
    // regardless).
    await client.query('DELETE FROM inventory_movements WHERE order_id = ANY($1)', [orderIds])
    await client.query('DELETE FROM order_status_history WHERE order_id = ANY($1)', [orderIds])
    await client.query('DELETE FROM order_details WHERE order_id = ANY($1)', [orderIds])
    await client.query('DELETE FROM deliveries WHERE order_id = ANY($1)', [orderIds])
    const deleted = await client.query('DELETE FROM orders WHERE order_id = ANY($1) RETURNING order_id', [orderIds])

    await client.query('COMMIT')
    console.log(`  Deleted ${deleted.rowCount} orders.`)
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }

  await fs.unlink(manifestPath)
  console.log('Manifest removed. Demo data cleared.')

  await pool.end()
}

main().catch((error) => {
  console.error('Clearing demo data failed:', error)
  pool.end()
  process.exit(1)
})
