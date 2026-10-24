// The export history (RULES-PLANS/REPORTS_UI_PLAN.md, U2, migration 040):
// every report that leaves the system — a CSV downloaded, a PDF printed —
// with who did it and when, admin or cashier. Opening a screen is not an
// export and is never logged.
//
// The server logs its own downloads (the sales CSV, the forecast CSV). A
// print is made by the browser, so the screen reports it through
// POST /api/reports/exports with one of the PRINT types.
import { pool } from '../db.js'

export const DOWNLOAD_TYPES = ['SALES_CSV', 'FORECAST_CSV']
export const PRINT_TYPES = ['SALES_PDF', 'PRODUCTS_PDF', 'INVENTORY_PDF', 'FORECAST_PDF', 'PAYMENT_LOG_PDF', 'PRODUCTION_PDF']

// An audit record of a read: if it cannot be written, the export itself
// still went out, so a failure is logged and never thrown.
export async function logExport(userId, type) {
  try {
    await pool.query(
      `INSERT INTO report_logs (user_id, generated_by, report_type)
       VALUES ($1, (SELECT admin_id FROM admins WHERE user_id = $1), $2)`,
      [userId, type],
    )
  } catch (error) {
    console.error(`Could not record a ${type} export:`, error)
  }
}
