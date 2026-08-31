// Inventory management (Phase 5). Every product has exactly one inventory
// row (products.js creates it on product creation), so this router is
// about the STOCK side of that row — quantity, minimum level, expiry —
// not the product's own name/price/description, which stay in
// routes/products.js.
//
// Admin and cashier only: customers have no reason to see stock numbers,
// and delivery personnel have no inventory concern at all. Mounted at
// /api/inventory in app.js.
//
// See PHASE5_PLAN.md for the full design (the movement ledger, the
// conditional-update deduction pattern, the observed-vs-proposed stock
// change request shape) — this file starts with Step 1 from that plan:
// a read-only list, before anything that touches stock_quantity.
import express from 'express'
import { pool } from '../db.js'
import { requireAuth, requireRole } from '../lib/auth.js'

const router = express.Router()

const mapInventoryRow = (row) => ({
  productId: row.product_id,
  productName: row.product_name,
  categoryId: row.category_id,
  categoryName: row.category_name,
  stockQuantity: row.stock_quantity,
  minStockLevel: row.min_stock_level,
  expirationDate: row.expiration_date,
  lastUpdated: row.last_updated,
  // Computed rather than stored: it's always exactly this comparison, so
  // storing it would just be a second place it could go stale relative to
  // stock_quantity and min_stock_level.
  lowStock: row.stock_quantity <= row.min_stock_level,
})

const inventorySelectQuery = `SELECT i.inventory_id, i.product_id, p.product_name, p.category_id, c.category_name,
            i.stock_quantity, i.min_stock_level, i.expiration_date, i.last_updated
     FROM inventory i
     JOIN products p ON p.product_id = i.product_id
     JOIN categories c ON c.category_id = p.category_id`

router.use(requireAuth, requireRole('ADMIN', 'CASHIER'))

router.get('/', async (_request, response) => {
  const result = await pool.query(`${inventorySelectQuery} ORDER BY p.product_name`)
  return response.json({ inventory: result.rows.map(mapInventoryRow) })
})

export default router
