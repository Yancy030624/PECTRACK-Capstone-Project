// App-wide settings an admin can change (migration 021, app_settings).
// Each setting is read where it is used, so a change applies to the very
// next request — there is no cache to go stale.
import { pool } from '../db.js'

// Bulk orders — PHASE10 D3. An order with MORE items than this needs an
// admin's approval before it is confirmed or paid.
export const bulkOrderThresholdKey = 'bulk_order_threshold'
export const defaultBulkOrderThreshold = 100
export const bulkOrderThresholdLimits = { min: 1, max: 100000 }

// `db` may be a transaction's client, so the read sees the same snapshot
// as the rest of the transaction.
export async function getBulkOrderThreshold(db = pool) {
  const result = await db.query('SELECT setting_value FROM app_settings WHERE setting_key = $1', [bulkOrderThresholdKey])
  const value = Number(result.rows[0]?.setting_value)
  return Number.isInteger(value) && value >= bulkOrderThresholdLimits.min ? value : defaultBulkOrderThreshold
}
