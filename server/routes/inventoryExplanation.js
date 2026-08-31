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
// This file now implements every Phase 5 step that touches this router:
// Step 1 (the read-only list), Step 2 (admin editing stock directly, with
// a movement-ledger row alongside every change), Step 5 (low-stock
// alerting on every edit), and Step 6 (the cashier-proposes/admin-approves
// workflow, at the bottom of this file). See PHASE5_PLAN.md for the full
// design, including Pattern A — the conditional-update deduction that
// keeps overselling from crashing as a 500 — which lives in
// routes/orders.js instead, since only order placement can oversell.
// ============================================================================

import express from 'express'
import { pool } from '../db.js'
import { requireAuth, requireRole } from '../lib/auth.js'
// syncStockAlert is shared with routes/orders.js — every place stock can
// change (order placement/cancellation, and this file's direct edit)
// needs the exact same low-stock rule applied the exact same way, so it
// lives once in lib/inventory.js rather than being reimplemented here.
// See that file for the full reasoning.
import { syncStockAlert } from '../lib/inventory.js'
import { normalize, parseId } from '../lib/validation.js'

const router = express.Router()

// The reasons a DIRECT admin edit is allowed to record. Deliberately a
// SUBSET of the full stock_movement_reason database enum (which also has
// ORDER_PLACED and ORDER_CANCELLED) — those two are written by the system
// itself when an order is placed or cancelled (Steps 3–4), and must never
// be something a person can type into this form. If they could, the
// ledger would no longer reliably distinguish "the system moved this
// stock because of an order" from "an admin claims this was an order" —
// which defeats the entire point of having a reason column.
const manualMovementReasons = new Set(['RESTOCK', 'SPOILAGE', 'CORRECTION'])
// The only two outcomes an admin can decide a change request has —
// separate from manualMovementReasons above, which is about WHY stock
// changed, not the yes/no decision on a proposal.
const requestDecisions = new Set(['APPROVED', 'REJECTED'])
// Same 500-character cap used for order instructions/notes elsewhere in
// this app — plenty of room for a real explanation, short enough to keep
// the column from growing unbounded. Shared by the request's own `reason`
// and an admin's `reviewerNote`, so both use the same constant rather than
// two separate magic numbers that would need to be kept in sync by hand.
const requestReasonMaxLength = 500

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

// Same reshaping idea as mapInventoryRow, for a row from
// inventory_change_requests instead. Deliberately does NOT include
// proposed_price / proposed_description / proposed_availability_status —
// this router only ever creates INVENTORY-type requests (see POST
// /requests below), so those PRODUCT_DETAILS-only columns are always NULL
// on every row this file produces, and there is no reason to expose
// columns that can never hold a value here.
const mapChangeRequestRow = (row) => ({
  id: row.request_id,
  productId: row.product_id,
  productName: row.product_name,
  requestedByName: row.requested_by_name,
  observedStockQuantity: row.observed_stock_quantity,
  proposedStockQuantity: row.proposed_stock_quantity,
  proposedMinStockLevel: row.proposed_min_stock_level,
  reason: row.reason,
  status: row.status,
  reviewedByName: row.reviewed_by_name,
  reviewedAt: row.reviewed_at,
  reviewerNote: row.reviewer_note,
  createdAt: row.created_at,
})

// Three JOINs: products for the name (same reason as inventorySelectQuery
// above), cashiers for who REQUESTED it (requested_by is NOT NULL — every
// request has exactly one requester), and a LEFT JOIN to admins for who
// REVIEWED it (reviewed_by is nullable — a PENDING request has no reviewer
// yet, so this must be a LEFT JOIN, not an inner one, or pending rows
// would vanish from the result entirely).
const changeRequestSelectQuery = `SELECT r.request_id, r.product_id, p.product_name, r.requested_by, rc.name AS requested_by_name,
            r.observed_stock_quantity, r.proposed_stock_quantity, r.proposed_min_stock_level,
            r.reason, r.status, r.reviewed_by, ra.name AS reviewed_by_name, r.reviewed_at, r.reviewer_note, r.created_at
     FROM inventory_change_requests r
     JOIN products p ON p.product_id = r.product_id
     JOIN cashiers rc ON rc.cashier_id = r.requested_by
     LEFT JOIN admins ra ON ra.admin_id = r.reviewed_by`

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

// ============================================================================
// PHASE 5, STEP 6 — the cashier-proposes / admin-approves workflow.
//
// Everything below this point in the file exists because of ONE
// constraint from the thesis paper: an admin has full access to inventory
// (create, edit, delete, approve), but a cashier can only PROPOSE a stock
// change — they can never apply one directly. PATCH /:productId further
// down is the admin's "apply immediately" path; the three routes here are
// the cashier's "ask first" path. Both paths write to the exact same
// `inventory` table and the exact same `inventory_movements` ledger; they
// differ only in who is allowed to trigger the write, and whether a
// review happens first.
// ============================================================================

// GET /api/inventory/requests — role-scoped the same way GET /api/orders
// is: a cashier sees only requests THEY submitted (so they can check
// whether their own proposal was approved or rejected), an admin sees
// EVERYONE's (reviewing them is the entire point of this screen for that
// role).
router.get('/requests', async (request, response) => {
  if (request.user.role === 'CASHIER') {
    // Resolve the logged-in user to their cashier_id — requested_by
    // references cashiers(cashier_id), not users(user_id) directly, the
    // same indirection routes/orders.js goes through for processed_by.
    const cashierResult = await pool.query('SELECT cashier_id FROM cashiers WHERE user_id = $1', [request.user.id])
    const cashierId = cashierResult.rows[0]?.cashier_id
    const result = await pool.query(`${changeRequestSelectQuery} WHERE r.requested_by = $1 ORDER BY r.created_at DESC`, [cashierId])
    return response.json({ requests: result.rows.map(mapChangeRequestRow) })
  }
  const result = await pool.query(`${changeRequestSelectQuery} ORDER BY r.created_at DESC`)
  return response.json({ requests: result.rows.map(mapChangeRequestRow) })
})

// POST /api/inventory/requests — cashier-only. This is the ONLY route in
// the entire app where a cashier can influence stock in any way; every
// other stock-affecting action (PATCH /:productId here, and both
// deduction/restoration in routes/orders.js) is either admin-only or
// system-driven.
//
// ------------------------------------------------------------------------
// HOW "CASHIERS MAY ONLY SUBMIT INVENTORY REQUESTS, NEVER PRODUCT_DETAILS"
// IS ACTUALLY ENFORCED.
//
// The database CHECK constraint on inventory_change_requests (see
// database/schema.sql) allows EITHER request_type, as long as the right
// proposed_* columns are filled in for that type. It has no concept of
// WHO is submitting — it can't, a CHECK constraint only sees the row
// being written, not the session that wrote it. So the schema alone
// cannot prevent a cashier from creating a PRODUCT_DETAILS request; that
// has to be an application-level rule.
//
// The rule here isn't "validate that requestType equals INVENTORY,
// otherwise reject". It's simpler and stronger than that: request_type is
// hardcoded to the literal string 'INVENTORY' in the INSERT below, and
// request.body.requestType (or proposedPrice, proposedDescription, any
// PRODUCT_DETAILS-shaped field) is never read at any point in this
// handler. An input that is never looked at cannot be misused — there is
// no validation to bypass, because there is no code path that would ever
// consult that field. See the test in routes/inventory.test.js that sends
// requestType: 'PRODUCT_DETAILS' and confirms the row created is
// INVENTORY regardless.
// ------------------------------------------------------------------------
router.post('/requests', requireRole('CASHIER'), async (request, response) => {
  const productId = parseId(request.body.productId)
  if (!productId) return response.status(422).json({ message: 'Select a valid product.', errors: { productId: 'Select a valid product.' } })

  const errors = {}
  const values = {}

  // Both proposed fields are OPTIONAL individually — a cashier might only
  // want to flag that the minimum should be higher, without touching
  // stock at all, or vice versa. `!= null` (not `in request.body`) is
  // used here, unlike PATCH /:productId's partial-update checks below,
  // because this is a CREATE, not a partial update: there is no existing
  // value to "leave unchanged" by omitting a key, so treating an absent
  // or explicit-null field the same way is simpler and correct for this
  // route specifically.
  if (request.body.proposedStockQuantity != null) {
    const proposedStockQuantity = Number(request.body.proposedStockQuantity)
    if (!Number.isInteger(proposedStockQuantity) || proposedStockQuantity < 0) errors.proposedStockQuantity = 'Enter a whole number, zero or greater.'
    else values.proposedStockQuantity = proposedStockQuantity
  }
  if (request.body.proposedMinStockLevel != null) {
    const proposedMinStockLevel = Number(request.body.proposedMinStockLevel)
    if (!Number.isInteger(proposedMinStockLevel) || proposedMinStockLevel < 0) errors.proposedMinStockLevel = 'Enter a whole number, zero or greater.'
    else values.proposedMinStockLevel = proposedMinStockLevel
  }
  // Mirrors the table's own CHECK constraint for an INVENTORY request
  // exactly: at least one of the two proposed fields is required. Without
  // this, a request with NEITHER field set would sail through this
  // handler's validation and then fail deep inside Postgres as a CHECK
  // violation — a confusing 500 rather than a clear 422, the same class of
  // bug the rest of this app is careful to avoid.
  if (values.proposedStockQuantity === undefined && values.proposedMinStockLevel === undefined) {
    errors.proposedStockQuantity = 'Propose a new stock quantity, a new minimum level, or both.'
  }

  const reason = normalize(request.body.reason).slice(0, requestReasonMaxLength)
  if (!reason) errors.reason = 'Explain why this change is needed.'

  if (Object.keys(errors).length) return response.status(422).json({ message: 'Please correct the highlighted fields.', errors })

  const cashierResult = await pool.query('SELECT cashier_id FROM cashiers WHERE user_id = $1', [request.user.id])
  const cashierId = cashierResult.rows[0]?.cashier_id

  const inventoryResult = await pool.query('SELECT stock_quantity FROM inventory WHERE product_id = $1', [productId])
  const inventoryRow = inventoryResult.rows[0]
  if (!inventoryRow) return response.status(404).json({ message: 'Product not found.' })

  // ------------------------------------------------------------------------
  // WHY observed_stock_quantity IS READ HERE, SERVER-SIDE, AND NEVER
  // ACCEPTED FROM THE CLIENT.
  //
  // The whole point of this column (PHASE5_PLAN.md, Decision 2) is that it
  // records the TRUTH at the moment of proposing — "this is what stock
  // genuinely was when I asked for this change". If the client supplied
  // this value instead, it could already be stale by the time the request
  // reaches the server: the cashier's screen might have loaded a minute
  // ago, and orders could have sold through in the meantime. A client
  // cannot know, with certainty, what the server's stock_quantity is at
  // the instant its own request is being processed — only the server can
  // know that, because it's the server that's about to read it.
  //
  // Reading it here, in the same request that inserts the row, means
  // observed_stock_quantity is never wrong by construction: it IS whatever
  // stock_quantity was, measured at the moment this proposal was created,
  // full stop.
  // ------------------------------------------------------------------------
  const created = await pool.query(
    `INSERT INTO inventory_change_requests (product_id, requested_by, request_type, observed_stock_quantity, proposed_stock_quantity, proposed_min_stock_level, reason)
     VALUES ($1, $2, 'INVENTORY', $3, $4, $5, $6)
     RETURNING request_id`,
    [productId, cashierId, inventoryRow.stock_quantity, values.proposedStockQuantity ?? null, values.proposedMinStockLevel ?? null, reason],
  )

  const full = await pool.query(`${changeRequestSelectQuery} WHERE r.request_id = $1`, [created.rows[0].request_id])
  return response.status(201).json({ request: mapChangeRequestRow(full.rows[0]) })
})

// PATCH /api/inventory/requests/:requestId — admin-only approve/reject.
router.patch('/requests/:requestId', requireRole('ADMIN'), async (request, response) => {
  const requestId = parseId(request.params.requestId)
  if (!requestId) return response.status(404).json({ message: 'Request not found.' })

  const decision = normalize(request.body.status).toUpperCase()
  if (!requestDecisions.has(decision)) return response.status(422).json({ message: 'Enter a valid decision.', errors: { status: 'status must be APPROVED or REJECTED.' } })

  const reviewerNote = request.body.reviewerNote == null ? null : normalize(request.body.reviewerNote).slice(0, requestReasonMaxLength) || null

  // A request can be reviewed exactly ONCE — there is no path back to
  // PENDING from either APPROVED or REJECTED. This pre-check exists
  // purely to give a clear, specific error (404 for "never existed", 409
  // for "already decided") before opening a transaction; the CONDITIONAL
  // UPDATE further down enforces the same rule for real, against the
  // genuine race of two admins reviewing the same request at once.
  const existing = await pool.query('SELECT status FROM inventory_change_requests WHERE request_id = $1', [requestId])
  if (!existing.rows[0]) return response.status(404).json({ message: 'Request not found.' })
  if (existing.rows[0].status !== 'PENDING') return response.status(409).json({ message: 'This request has already been reviewed.' })

  // reviewed_by references admins(admin_id), not users(user_id) — the
  // same table-vs-role indirection as requested_by above, resolved the
  // same way.
  const adminResult = await pool.query('SELECT admin_id FROM admins WHERE user_id = $1', [request.user.id])
  const adminId = adminResult.rows[0]?.admin_id

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // THE REAL GUARD AGAINST DOUBLE-REVIEWING. WHERE status = 'PENDING'
    // means this UPDATE matches ZERO rows if the request was already
    // decided by anyone, at any point — including a fraction of a second
    // ago, by a different admin, in a different request that's still
    // mid-transaction right now. The pre-check above catches the common,
    // non-racing case with a clean error; this catches the genuine race,
    // and answers it the same way (409), just discovered slightly later.
    // This is the exact same "conditional UPDATE, check rowCount" shape
    // used for stock deduction in routes/orders.js — different table,
    // identical reasoning: never trust a value you read a moment ago to
    // still be true right now.
    const reviewed = await client.query(
      `UPDATE inventory_change_requests
       SET status = $1, reviewed_by = $2, reviewed_at = CURRENT_TIMESTAMP, reviewer_note = $3
       WHERE request_id = $4 AND status = 'PENDING'
       RETURNING product_id, observed_stock_quantity, proposed_stock_quantity, proposed_min_stock_level, reason`,
      [decision, adminId, reviewerNote, requestId],
    )
    if (reviewed.rowCount === 0) {
      await client.query('ROLLBACK')
      return response.status(409).json({ message: 'This request has already been reviewed.' })
    }
    const changeRequest = reviewed.rows[0]

    // A REJECTION touches nothing else. No inventory row, no movement
    // row, no alert re-check — the request's own status is the entire
    // outcome. Only an APPROVAL goes on to actually change anything.
    if (decision === 'APPROVED') {
      const inventoryResult = await client.query('SELECT inventory_id, stock_quantity, min_stock_level FROM inventory WHERE product_id = $1', [changeRequest.product_id])
      const inventoryRow = inventoryResult.rows[0]

      let newStockQuantity = inventoryRow.stock_quantity
      if (changeRequest.proposed_stock_quantity != null) {
        // ==================================================================
        // THE OBSERVED-DELTA CALCULATION. This is the payoff for capturing
        // observed_stock_quantity back in POST /requests above — the
        // entire reason PHASE5_PLAN.md's Decision 2 exists.
        //
        // Two numbers matter here, and they can disagree:
        //   changeRequest.observed_stock_quantity — what stock WAS when
        //     the cashier proposed this (captured at submission time).
        //   inventoryRow.stock_quantity — what stock genuinely IS right
        //     now, at the moment of this approval. Orders may have been
        //     placed or cancelled in between; this request could have sat
        //     PENDING for hours.
        //
        // Applying changeRequest.proposed_stock_quantity DIRECTLY would
        // silently erase whatever happened in that gap:
        //   09:00  stock 12.  Cashier proposes 20 (a delivery).
        //   11:00  5 sell.    stock is genuinely 7 now.
        //   14:00  Admin approves -> naive approach sets stock to 20.
        //          Those 5 real sales are gone without a trace.
        //
        // Applying the DIFFERENCE the cashier observed to CURRENT stock
        // avoids that entirely: newStock = current + (proposed - observed)
        //                                = 7 + (20 - 12) = 15 — correct.
        // The delivery of +8 units is preserved; the 5 sales are too.
        // ==================================================================
        newStockQuantity = changeRequest.observed_stock_quantity != null
          ? inventoryRow.stock_quantity + (changeRequest.proposed_stock_quantity - changeRequest.observed_stock_quantity)
          : // Falls back to the OLD, simpler behaviour — treating the
            // proposal as an absolute value — only for a row whose
            // observed_stock_quantity is NULL. Every row THIS route ever
            // creates always has one (see POST /requests), so this branch
            // exists purely as the documented safety net for hypothetical
            // rows from before that column existed (see migration 003),
            // not something normal use of this route ever exercises.
            changeRequest.proposed_stock_quantity

        // Even the OBSERVED delta can go wrong: if stock dropped further
        // than the delta assumes (a lot sold, or a separate correction
        // happened) between proposal and review, applying it here could
        // still drive stock negative. inventory has
        // CHECK (stock_quantity >= 0) — rather than let that CHECK reject
        // the query as a raw 500 deep inside Postgres, it's checked here
        // first and answered as a clear 409, with NOTHING applied and the
        // request left PENDING so an admin can make a real decision
        // (reject it and ask for a fresh count, most likely).
        if (newStockQuantity < 0) {
          await client.query('ROLLBACK')
          return response.status(409).json({ message: 'Approving this would drive stock negative — stock has changed since the request was submitted. Reject it and ask for a fresh count instead.' })
        }
      }
      // min_stock_level has no observed_* counterpart in the schema at
      // all — nothing else in this app decrements it automatically the
      // way orders continuously drain stock_quantity, so there is no
      // "staleness" risk for it to protect against. A proposed minimum is
      // simply applied as-is.
      const newMinStockLevel = changeRequest.proposed_min_stock_level ?? inventoryRow.min_stock_level

      const updated = await client.query(
        'UPDATE inventory SET stock_quantity = $1, min_stock_level = $2, last_updated = CURRENT_TIMESTAMP WHERE inventory_id = $3 RETURNING stock_quantity, min_stock_level',
        [newStockQuantity, newMinStockLevel, inventoryRow.inventory_id],
      )

      if (newStockQuantity !== inventoryRow.stock_quantity) {
        // CORRECTION, not RESTOCK or SPOILAGE — this movement originates
        // from a cashier's physical recount being confirmed by an admin,
        // which is precisely what CORRECTION means in the
        // stock_movement_reason enum. request_id (not order_id) is this
        // movement's cause; changed_by is the APPROVING ADMIN's user_id —
        // they're the one who actually authorized the change to take
        // effect, even though a cashier is the one who proposed it. The
        // cashier's own reasoning is preserved too, copied into this
        // movement's note, so the ledger doesn't lose it once the request
        // itself is just one more reviewed row among many.
        await client.query(
          'INSERT INTO inventory_movements (inventory_id, request_id, changed_by, quantity_change, reason, note) VALUES ($1, $2, $3, $4, $5, $6)',
          [inventoryRow.inventory_id, requestId, request.user.id, newStockQuantity - inventoryRow.stock_quantity, 'CORRECTION', changeRequest.reason],
        )
      }

      // Same call, same reasoning as every other stock-affecting write in
      // this app — see lib/inventoryExplanation.js.
      await syncStockAlert(client, { inventoryId: inventoryRow.inventory_id, stockQuantity: updated.rows[0].stock_quantity, minStockLevel: updated.rows[0].min_stock_level })
    }

    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }

  const full = await pool.query(`${changeRequestSelectQuery} WHERE r.request_id = $1`, [requestId])
  return response.json({ request: mapChangeRequestRow(full.rows[0]) })
})

// PATCH /api/inventory/:productId — the ADMIN-ONLY direct stock edit.
//
// requireRole('ADMIN') is applied AGAIN here, even though the router-wide
// router.use(...) above already lets a cashier this far for GET. That's
// deliberate, not redundant: a cashier needs read access to this router
// (GET /requests just above needs it too), but writing stock immediately,
// with no approval step, is an admin-only power. Cashiers can only
// PROPOSE a change (POST /requests, above), which an admin then reviews
// via PATCH /requests/:requestId before anything actually moves. This
// route is the admin path that skips that review because the admin IS the
// review.
router.patch('/:productId', requireRole('ADMIN'), async (request, response) => {
  // parseId (see lib/validationExplanation.js) rejects a malformed id
  // before it can reach Postgres as an invalid bigint literal — the same
  // 404-not-500 pattern used by every other :id route in this app.
  const productId = parseId(request.params.productId)
  if (!productId) return response.status(404).json({ message: 'Product not found.' })

  // Needed for two things below: inventory_id (the foreign key any
  // movement row must reference) and the CURRENT stock_quantity (to
  // compute how much it's changing by — the movement ledger stores a
  // DELTA, not an absolute value, so the old value has to be read first).
  const existing = await pool.query('SELECT inventory_id, stock_quantity FROM inventory WHERE product_id = $1', [productId])
  const current = existing.rows[0]
  if (!current) return response.status(404).json({ message: 'Product not found.' })

  // Partial update: validate only whichever fields are actually present in
  // the body, same `'field' in request.body` pattern products.js's own
  // PATCH uses for exactly the same reason — a request that only wants to
  // bump minStockLevel shouldn't be forced to also resend a valid
  // stockQuantity.
  const errors = {}
  const values = {}

  if ('stockQuantity' in request.body) {
    const stockQuantity = Number(request.body.stockQuantity)
    // Number.isInteger rejects 4.5, NaN, and Infinity all at once — stock
    // is always a whole count of items, never a fraction.
    if (!Number.isInteger(stockQuantity) || stockQuantity < 0) errors.stockQuantity = 'Enter a whole number, zero or greater.'
    else values.stockQuantity = stockQuantity
  }
  if ('minStockLevel' in request.body) {
    const minStockLevel = Number(request.body.minStockLevel)
    if (!Number.isInteger(minStockLevel) || minStockLevel < 0) errors.minStockLevel = 'Enter a whole number, zero or greater.'
    else values.minStockLevel = minStockLevel
  }
  if ('expirationDate' in request.body) {
    const rawExpirationDate = request.body.expirationDate
    // Clearing the expiry (no batch currently tracked) is a real, valid
    // edit — an empty string from a cleared date input is treated the
    // same as an explicit null, so the frontend doesn't have to know the
    // difference.
    if (rawExpirationDate == null || rawExpirationDate === '') values.expirationDate = null
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(rawExpirationDate)) errors.expirationDate = 'Enter a valid date (YYYY-MM-DD).'
    else values.expirationDate = rawExpirationDate
  }

  // WHY A CHANGE TO stockQuantity SPECIFICALLY NEEDS A REASON, WHEN THE
  // OTHER TWO FIELDS DON'T. This is the entire point of the
  // inventory_movements ledger (PHASE5_PLAN.md, Decision 1): without it,
  // stock_quantity is just a number that changes with no record of why.
  // minStockLevel and expirationDate are thresholds/metadata about the
  // product, not stock ITSELF moving in or out, so they have nothing for
  // the ledger to explain.
  let reason = null
  if ('stockQuantity' in values) {
    reason = normalize(request.body.reason).toUpperCase()
    if (!manualMovementReasons.has(reason)) errors.reason = 'Select why stock is changing: restock, spoilage, or correction.'
  }

  if (Object.keys(errors).length) return response.status(422).json({ message: 'Please correct the highlighted fields.', errors })
  if (Object.keys(values).length === 0) return response.status(422).json({ message: 'Provide at least one field to update.' })

  // Optional free-text explanation stored alongside the movement — e.g.
  // "delivery from supplier" or "5 units past expiry". Capped at 500
  // characters, same limit used for order instructions/notes elsewhere in
  // this app, purely to keep the column from growing unbounded.
  const note = request.body.note == null ? null : normalize(request.body.note).slice(0, 500) || null

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // expiration_date is nullable, and clearing it to NULL is a real edit
    // — plain COALESCE can't tell "field not sent" apart from "field sent
    // as null" (COALESCE(NULL, existing) would just keep the old value,
    // silently ignoring an intentional clear). So it uses a CASE keyed on
    // whether the field was present at all — the exact pattern
    // products.js's description/variant fields use for the same reason.
    // stock_quantity and min_stock_level are NOT NULL columns where an
    // omitted field is never intentionally null, so plain COALESCE is
    // correct and simpler for those two.
    // RETURNING the post-update figures rather than reading them back with
    // a separate SELECT — cheaper, and immune to a theoretical race where
    // something else touches this row between the UPDATE and a follow-up
    // read (not possible here anyway, since both happen inside the same
    // transaction, but RETURNING is the idiom that makes that true by
    // construction rather than by reasoning about it).
    const updated = await client.query(
      `UPDATE inventory
       SET stock_quantity = COALESCE($1, stock_quantity),
           min_stock_level = COALESCE($2, min_stock_level),
           expiration_date = CASE WHEN $3 THEN $4 ELSE expiration_date END,
           last_updated = CURRENT_TIMESTAMP
       WHERE product_id = $5
       RETURNING stock_quantity, min_stock_level`,
      [values.stockQuantity ?? null, values.minStockLevel ?? null, 'expirationDate' in values, values.expirationDate ?? null, productId],
    )

    // Only a stockQuantity change gets a ledger row. inventory_movements
    // exists to explain changes IN STOCK — min_stock_level and
    // expiration_date aren't stock, so there's nothing for it to say
    // about them, the same reasoning that decided which field needs a
    // `reason` above.
    if ('stockQuantity' in values) {
      const quantityChange = values.stockQuantity - current.stock_quantity
      // Guards against writing a movement row for a "change" that isn't
      // one — an admin submitting the SAME value stock already has. Two
      // reasons this matters: inventory_movements has
      // CHECK (quantity_change <> 0), so a 0 would fail the constraint
      // outright; and more fundamentally, nothing actually happened, so
      // there is nothing true to log. A ledger with false entries would
      // be worse than no ledger at all.
      if (quantityChange !== 0) {
        await client.query(
          'INSERT INTO inventory_movements (inventory_id, changed_by, quantity_change, reason, note) VALUES ($1, $2, $3, $4, $5)',
          [current.inventory_id, request.user.id, quantityChange, reason, note],
        )
      }
    }

    // Called UNCONDITIONALLY here — not only when stockQuantity changed.
    // That's deliberate: an admin editing minStockLevel ALONE can just as
    // easily move the product across the low-stock line. Example: stock
    // sits at 8 with a minimum of 10 (already low, alert open); the admin
    // corrects the minimum down to 5 without touching stock at all — now
    // 8 > 5, and the alert should close even though stock_quantity itself
    // never moved. syncStockAlert re-evaluates against whatever the
    // CURRENT threshold actually is, using the values this same UPDATE
    // just returned.
    await syncStockAlert(client, { inventoryId: current.inventory_id, stockQuantity: updated.rows[0].stock_quantity, minStockLevel: updated.rows[0].min_stock_level })

    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }

  const updated = await pool.query(`${inventorySelectQuery} WHERE i.product_id = $1`, [productId])
  // { item: ... } rather than { inventory: ... } — GET / above already
  // uses "inventory" for the ARRAY, so reusing that key here for a single
  // object would mean the same field name sometimes holds a list and
  // sometimes holds one row, depending purely on which endpoint answered.
  // A distinct key removes that ambiguity for whatever reads this response.
  return response.json({ item: mapInventoryRow(updated.rows[0]) })
})

export default router
