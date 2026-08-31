// ============================================================================
// PECTRACK API — routes/inventory.js (annotated for learning)
// Inventory management (Phase 5). Every product already has exactly one
// inventory row — routes/products.js creates it at product-creation time,
// with the table's own defaults (stock_quantity 0, min_stock_level 0).
// This file is about the STOCK side of that same row: quantity, minimum
// level, expiry. The product's own name/price/description stay entirely
// in routes/products.js — the two files own different columns of a
// relationship the schema already ties together 1:1
// (inventory.product_id is NOT NULL UNIQUE).
//
// Admin and cashier only. Customers have no reason to see raw stock
// numbers (they see availability_status on the product itself, which is a
// separate boolean), and delivery personnel have no inventory concern at
// all. Mounted at /api/inventory in app.js.
//
// This file implements Step 1 of PHASE5_PLAN.md: a read-only list, before
// anything in this router is allowed to touch stock_quantity. See that
// document for the full design — the movement ledger, the
// conditional-update deduction pattern that keeps overselling from
// crashing as a 500, and the observed-vs-proposed shape used by the
// cashier-approval workflow that comes later.
// ============================================================================

import express from 'express'
import { pool } from '../db.js'
import { requireAuth, requireRole } from '../lib/auth.js'

const router = express.Router()

// Reshapes one joined row into the camelCase shape the frontend consumes —
// same pattern as mapProductRow, mapOrderSummary, etc. throughout this app.
const mapInventoryRow = (row) => ({
  productId: row.product_id,
  productName: row.product_name,
  categoryId: row.category_id,
  categoryName: row.category_name,
  stockQuantity: row.stock_quantity,
  minStockLevel: row.min_stock_level,
  expirationDate: row.expiration_date,
  lastUpdated: row.last_updated,
  // Computed here rather than stored as its own column. It is ALWAYS
  // exactly this comparison — there is no other rule for "is this low" —
  // so storing it would just create a second place it could go stale
  // relative to stock_quantity and min_stock_level. Deriving it on every
  // read means it can never disagree with the numbers it's based on.
  lowStock: row.stock_quantity <= row.min_stock_level,
})

// JOINs both products (for the name) and categories (for the category
// name), the same two-hop join products.js's own productSelectQuery does —
// inventory doesn't know its own product's name or category, so both
// joins are needed just to build a useful list row.
const inventorySelectQuery = `SELECT i.inventory_id, i.product_id, p.product_name, p.category_id, c.category_name,
            i.stock_quantity, i.min_stock_level, i.expiration_date, i.last_updated
     FROM inventory i
     JOIN products p ON p.product_id = i.product_id
     JOIN categories c ON c.category_id = p.category_id`

// Applies to every route below: must be logged in AND be admin or cashier.
// Unlike routes/products.js (which lets every authenticated role read the
// catalog, just with different visibility rules per role), there is no
// customer-facing reason to expose stock counts at all, so the router
// simply doesn't admit that role.
router.use(requireAuth, requireRole('ADMIN', 'CASHIER'))

// GET /api/inventory — the full stock list. No role-based filtering (unlike
// products.js's customer/staff split) because both roles allowed past the
// requireRole guard above are staff who need to see everything, including
// items that are currently well-stocked — there is no "hide the boring
// ones" rule the way there is a "hide unavailable products from customers"
// rule on the catalog.
router.get('/', async (_request, response) => {
  const result = await pool.query(`${inventorySelectQuery} ORDER BY p.product_name`)
  return response.json({ inventory: result.rows.map(mapInventoryRow) })
})

export default router
