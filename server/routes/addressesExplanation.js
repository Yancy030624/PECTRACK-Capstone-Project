// ============================================================================
// PECTRACK API — routes/addresses.js (annotated for learning)
// Customer address management — Phase 7 (see PHASE7_PLAN.md, Decision 1).
// This is the hard prerequisite for delivery orders: a DELIVERY order needs
// an address_id, and until this file existed nothing in the app had ever
// written a row to customer_addresses. Mounted at /api/addresses.
//
// Why is this its OWN router instead of living inside routes/customers.js?
// routes/customers.js is ADMIN/CASHIER only — the staff-facing customer
// RECORD screen — and a customer managing their own saved addresses can't
// reach it at all (that router's guard would 403 them). This router instead
// admits CUSTOMER (their own addresses only) plus ADMIN/CASHIER (acting for
// a customer taking a phone order), the same mixed-role shape
// routes/payments.js already uses for the same reason: two different kinds
// of caller need the same underlying operations, scoped differently.
// ============================================================================

import express from 'express'
import { pool } from '../db.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { normalize, parseId, validateContactNumberField, validateName } from '../lib/validation.js'

const router = express.Router()

// Mirrors each column's own VARCHAR width in the approved thesis schema —
// named constants so the validation below and the schema can be seen to
// agree, the same reasoning gatewayReferenceMaxLength uses in
// routes/payments.js.
const addressFieldLimits = { label: 50, addressLine1: 255, addressLine2: 255, barangay: 100, municipality: 100, province: 100, postalCode: 20 }
// delivery_notes is TEXT (unbounded) in the schema, but a freeform note
// field with no practical cap invites abuse — same reasoning
// instructionsMaxLength uses in routes/orders.js for a column that is
// also TEXT.
const deliveryNotesMaxLength = 500

const mapAddressRow = (row) => ({
  id: row.address_id,
  customerId: row.customer_id,
  label: row.label,
  recipientName: row.recipient_name,
  contactNumber: row.contact_num,
  addressLine1: row.address_line_1,
  addressLine2: row.address_line_2,
  barangay: row.barangay,
  municipality: row.municipality,
  province: row.province,
  postalCode: row.postal_code,
  deliveryNotes: row.delivery_notes,
  isDefault: row.is_default,
  isActive: row.is_active,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const addressSelectQuery = `SELECT address_id, customer_id, label, recipient_name, contact_num, address_line_1, address_line_2,
            barangay, municipality, province, postal_code, delivery_notes, is_default, is_active, created_at, updated_at
       FROM customer_addresses`

// Validates whichever of these fields are present in the body — same
// { errors, values } / has(field) shape routes/products.js's
// validateProductFields uses, for the same reason: one function serves
// both full creation (partial: false) and a partial PATCH. `has(field)`
// means "this field is required to be checked right now": always true on a
// full POST (every field is either supplied or defaulted below), and only
// true on a PATCH if the caller actually sent that key — a PATCH that
// never mentions `label` must leave the stored label untouched, not
// overwrite it with an empty-string validation failure.
function validateAddressFields(body, { partial }) {
  const errors = {}
  const values = {}
  const has = (field) => !partial || field in body

  if (has('label')) {
    const label = normalize(body.label) || 'Home'
    if (label.length > addressFieldLimits.label) errors.label = `Label must be ${addressFieldLimits.label} characters or fewer.`
    else values.label = label
  }
  if (has('recipientName')) {
    const recipientName = normalize(body.recipientName)
    // validateName's own regex already caps length well within VARCHAR(150)
    // (max 149 characters), so no separate length check is needed here.
    const error = !recipientName ? 'Enter who should receive this delivery.' : validateName(recipientName)
    if (error) errors.recipientName = error
    else values.recipientName = recipientName
  }
  if (has('contactNumber')) {
    const contactNumber = normalize(body.contactNumber).replace(/[\s()-]/g, '')
    const error = validateContactNumberField(contactNumber)
    if (error) errors.contactNumber = error
    else values.contactNumber = contactNumber
  }
  if (has('addressLine1')) {
    const addressLine1 = normalize(body.addressLine1)
    if (!addressLine1) errors.addressLine1 = 'Enter the street address.'
    else if (addressLine1.length > addressFieldLimits.addressLine1) errors.addressLine1 = `Address line 1 must be ${addressFieldLimits.addressLine1} characters or fewer.`
    else values.addressLine1 = addressLine1
  }
  // addressLine2, barangay, postalCode: optional and NULLABLE — an empty
  // string is stored as NULL, not as an empty string, so the receipt-style
  // display elsewhere ("addressLine2 && <span>...") doesn't render a blank
  // line for a field that was never filled in.
  for (const field of ['addressLine2', 'barangay', 'postalCode']) {
    if (has(field)) {
      const value = normalize(body[field])
      if (value.length > addressFieldLimits[field]) errors[field] = `${field} must be ${addressFieldLimits[field]} characters or fewer.`
      else values[field] = value || null
    }
  }
  // municipality/province: unlike recipientName/addressLine1, these have a
  // DEFAULT at the column level ('Lucban'/'Quezon' — a bakery in Lucban,
  // Quezon), so omitting them is never an error, in EITHER a full POST or
  // a partial PATCH — checked against `field in body` directly rather than
  // has(), which for a full POST would treat every field's absence as an
  // error. Explicitly sending an EMPTY value, though, is treated as a
  // mistake rather than silently falling back to the default — a request
  // that touches the field at all should say something real.
  //
  // This is a real bug this codebase actually shipped and caught during
  // Phase 7: `has('municipality')` is `true` on every full POST regardless
  // of whether the field was sent (that's what `!partial ||` means), so a
  // perfectly valid request that just relies on the column default was
  // being rejected with "Enter the municipality." The fix is checking
  // `field in body` — the caller's INTENT — instead of has()'s "should
  // this field be validated at all" question, which are different
  // questions for any field that has its own database-level default.
  for (const field of ['municipality', 'province']) {
    if (field in body) {
      const value = normalize(body[field])
      if (!value) errors[field] = `Enter the ${field}.`
      else if (value.length > addressFieldLimits[field]) errors[field] = `${field} must be ${addressFieldLimits[field]} characters or fewer.`
      else values[field] = value
    }
  }
  if (has('deliveryNotes')) {
    const deliveryNotes = normalize(body.deliveryNotes).slice(0, deliveryNotesMaxLength)
    values.deliveryNotes = deliveryNotes || null
  }
  // isDefault/isActive: like municipality/province above, these have a
  // DEFAULT at the column level (FALSE/TRUE), so omitting them is never an
  // error on a full POST — checked against `field in body` directly rather
  // than has(), which for partial: false would treat every field's absence
  // as an error. Same bug, same fix, caught by the same test run: a
  // validAddress() test fixture that never mentions isDefault/isActive was
  // getting "isDefault must be true or false." because has() said "check
  // it" and typeof undefined !== 'boolean' said "reject it."
  if ('isDefault' in body) {
    if (typeof body.isDefault !== 'boolean') errors.isDefault = 'isDefault must be true or false.'
    else values.isDefault = body.isDefault
  }
  if ('isActive' in body) {
    if (typeof body.isActive !== 'boolean') errors.isActive = 'isActive must be true or false.'
    else values.isActive = body.isActive
  }

  return { errors, values }
}

router.use(requireAuth, requireRole('ADMIN', 'CASHIER', 'CUSTOMER'))

// GET /api/addresses — a customer sees their OWN addresses with no query
// param needed; staff must specify ?customerId= (acting "for" a specific
// customer), since an unfiltered dump of every saved address in the system
// is not a screen anyone needs. Only ACTIVE addresses by default — the
// picker a customer uses at checkout should not offer a retired address —
// with ?includeInactive=true as the opt-in for an address-BOOK view where
// seeing (and potentially reactivating) an old one is the point.
router.get('/', async (request, response) => {
  let customerId
  if (request.user.role === 'CUSTOMER') {
    const customerResult = await pool.query('SELECT customer_id FROM customers WHERE user_id = $1', [request.user.id])
    customerId = customerResult.rows[0]?.customer_id
  } else {
    customerId = parseId(request.query.customerId)
    if (!customerId) return response.status(422).json({ message: 'Select a customer to view addresses for.', errors: { customerId: 'Select a customer.' } })
  }

  const includeInactive = request.query.includeInactive === 'true'
  const query = includeInactive
    ? `${addressSelectQuery} WHERE customer_id = $1 ORDER BY is_default DESC, created_at`
    : `${addressSelectQuery} WHERE customer_id = $1 AND is_active = TRUE ORDER BY is_default DESC, created_at`
  const result = await pool.query(query, [customerId])
  return response.json({ addresses: result.rows.map(mapAddressRow) })
})

// POST /api/addresses — a customer creates their own; staff must supply
// customerId (taking a phone order on a customer's behalf).
router.post('/', async (request, response) => {
  let customerId
  if (request.user.role === 'CUSTOMER') {
    const customerResult = await pool.query('SELECT customer_id FROM customers WHERE user_id = $1', [request.user.id])
    customerId = customerResult.rows[0]?.customer_id
  } else {
    customerId = parseId(request.body.customerId)
    if (!customerId) return response.status(422).json({ message: 'Select a customer.', errors: { customerId: 'Select a customer.' } })
    const customerCheck = await pool.query('SELECT customer_id FROM customers WHERE customer_id = $1', [customerId])
    if (!customerCheck.rows[0]) return response.status(422).json({ message: 'Selected customer does not exist.', errors: { customerId: 'Selected customer does not exist.' } })
  }

  const { errors, values } = validateAddressFields(request.body, { partial: false })
  if (Object.keys(errors).length) return response.status(422).json({ message: 'Please correct the highlighted fields.', errors })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Locks the CUSTOMER row, not the address rows — this could be the
    // customer's FIRST address, so there is nothing in customer_addresses
    // yet to lock. Locking the parent is what serializes two concurrent
    // "am I the default" decisions for the same customer, the same
    // reasoning PHASE6_PLAN.md's Decision 2 uses for locking orders rather
    // than payments: the thing being protected is a fact about a
    // COLLECTION (does this customer already have a default?), and only
    // the parent row is guaranteed to exist to lock.
    const customerLock = await client.query('SELECT customer_id FROM customers WHERE customer_id = $1 FOR UPDATE', [customerId])
    if (!customerLock.rows[0]) {
      await client.query('ROLLBACK')
      return response.status(422).json({ message: 'Selected customer does not exist.', errors: { customerId: 'Selected customer does not exist.' } })
    }

    const isActive = values.isActive ?? true
    const existingDefault = await client.query('SELECT 1 FROM customer_addresses WHERE customer_id = $1 AND is_default = TRUE AND is_active = TRUE', [customerId])
    // A customer's FIRST address is auto-defaulted, so they are never left
    // with saved addresses and no default — the client doesn't have to
    // remember to set one. Otherwise, default-ness is exactly what the
    // client asked for.
    // `isActive &&` because an INACTIVE address must never be the default
    // — see PATCH /:id below for why the partial unique index cannot catch
    // that state on its own. It has to gate the WHOLE expression, not just
    // the value written into the row: the clearing UPDATE just below runs
    // off this same flag, so computing them separately would let an
    // inactive address clear the customer's real default and then decline
    // to replace it, leaving them with none at all.
    const makeDefault = isActive && (values.isDefault === true || existingDefault.rowCount === 0)
    if (makeDefault) {
      await client.query('UPDATE customer_addresses SET is_default = FALSE WHERE customer_id = $1 AND is_default = TRUE', [customerId])
    }

    let inserted
    try {
      // is_active is written from the request rather than left to the
      // column default. validateAddressFields accepts and validates
      // isActive here, and a field that is validated and then silently
      // discarded is worse than one that was never accepted at all — it
      // reads as supported and quietly isn't.
      inserted = await client.query(
        `INSERT INTO customer_addresses (customer_id, label, recipient_name, contact_num, address_line_1, address_line_2, barangay, municipality, province, postal_code, delivery_notes, is_default, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, 'Lucban'), COALESCE($9, 'Quezon'), $10, $11, $12, $13)
         RETURNING address_id`,
        [customerId, values.label ?? 'Home', values.recipientName, values.contactNumber, values.addressLine1, values.addressLine2 ?? null, values.barangay ?? null, values.municipality ?? null, values.province ?? null, values.postalCode ?? null, values.deliveryNotes ?? null, makeDefault, isActive],
      )
    } catch (error) {
      // Defense-in-depth, not the primary mechanism — the customer-row
      // lock above already serializes this for every request going
      // through this route. Kept anyway because a real constraint
      // backstopping an application-level lock is this codebase's
      // established shape everywhere else (see routes/payments.js's
      // Pattern B alongside its own order lock), and it is what makes the
      // rule true even if a future bug ever bypassed the lock.
      if (error.code === '23505' && error.constraint === 'customer_addresses_one_default_per_customer') {
        await client.query('ROLLBACK')
        return response.status(409).json({ message: 'Another address was just set as default — try again.' })
      }
      throw error
    }

    await client.query('COMMIT')
    const created = await pool.query(`${addressSelectQuery} WHERE address_id = $1`, [inserted.rows[0].address_id])
    return response.status(201).json({ address: mapAddressRow(created.rows[0]) })
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
})

// PATCH /api/addresses/:id — a customer may only edit their OWN address
// (404 otherwise, the same "don't confirm it exists" shape
// GET /api/orders/:id uses for another customer's order); staff may edit
// any address, matching their "acting for a customer" role in POST above.
//
// No DELETE route. PHASE7_PLAN.md, Decision 1: addresses are deactivated,
// never deleted — an old order must always still be able to say where it
// went, and orders.address_id has no ON DELETE behavior defined for
// exactly that reason.
router.patch('/:id', async (request, response) => {
  const addressId = parseId(request.params.id)
  if (!addressId) return response.status(404).json({ message: 'Address not found.' })

  const existing = await pool.query('SELECT address_id, customer_id, is_active FROM customer_addresses WHERE address_id = $1', [addressId])
  const current = existing.rows[0]
  if (!current) return response.status(404).json({ message: 'Address not found.' })

  if (request.user.role === 'CUSTOMER') {
    const customerResult = await pool.query('SELECT customer_id FROM customers WHERE user_id = $1', [request.user.id])
    if (current.customer_id !== customerResult.rows[0]?.customer_id) return response.status(404).json({ message: 'Address not found.' })
  }

  const { errors, values } = validateAddressFields(request.body, { partial: true })
  if (Object.keys(errors).length) return response.status(422).json({ message: 'Please correct the highlighted fields.', errors })
  if (Object.keys(values).length === 0) return response.status(422).json({ message: 'Provide at least one field to update.' })

  // Deactivating an address also clears is_default — an inactive default
  // is a contradiction the partial unique index's own WHERE clause
  // (is_default AND is_active) already treats as "not really default", so
  // this just makes the stored data say the same honest thing rather than
  // leaving a stale flag that would reappear if the address were
  // reactivated later.
  if (values.isActive === false) values.isDefault = false

  // ------------------------------------------------------------------
  // ...AND THE MIRROR OF THAT RULE, WHICH THE DATABASE CANNOT ENFORCE.
  //
  // customer_addresses_one_default_per_customer is a PARTIAL index — its
  // own WHERE clause is `is_default AND is_active` — so a row that is
  // default but INACTIVE is invisible to it and violates nothing.
  //
  // That made "set a deactivated address as the default" a way to walk
  // straight through the one rule this table has: the clearing UPDATE
  // below unsets the customer's real default unconditionally, and then
  // the flag lands on a row the index cannot see. The customer ends up
  // with NO active default at all, plus a stale one waiting to spring
  // back the moment that address is reactivated.
  //
  // Everywhere else in this codebase the friendly precheck is a courtesy
  // and the constraint is the real guarantee. This is the one case where
  // the application check IS the enforcement, because the index
  // deliberately does not cover it — so it has to be right here.
  // ------------------------------------------------------------------
  const willBeActive = values.isActive ?? current.is_active
  if (values.isDefault === true && !willBeActive) {
    return response.status(422).json({ message: 'A deactivated address cannot be the default one.', errors: { isDefault: 'Reactivate this address before making it the default.' } })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Only needed when THIS update would make the address the default —
    // see POST /'s own comment for why the customer row (not the address
    // rows) is what gets locked.
    if (values.isDefault === true) {
      await client.query('SELECT customer_id FROM customers WHERE customer_id = $1 FOR UPDATE', [current.customer_id])
      await client.query('UPDATE customer_addresses SET is_default = FALSE WHERE customer_id = $1 AND is_default = TRUE AND address_id != $2', [current.customer_id, addressId])
    }

    try {
      await client.query(
        `UPDATE customer_addresses SET
           label = COALESCE($1, label), recipient_name = COALESCE($2, recipient_name), contact_num = COALESCE($3, contact_num),
           address_line_1 = COALESCE($4, address_line_1),
           address_line_2 = CASE WHEN $5 THEN $6 ELSE address_line_2 END,
           barangay = CASE WHEN $7 THEN $8 ELSE barangay END,
           municipality = COALESCE($9, municipality), province = COALESCE($10, province),
           postal_code = CASE WHEN $11 THEN $12 ELSE postal_code END,
           delivery_notes = CASE WHEN $13 THEN $14 ELSE delivery_notes END,
           is_default = COALESCE($15, is_default), is_active = COALESCE($16, is_active)
         WHERE address_id = $17`,
        [
          values.label ?? null, values.recipientName ?? null, values.contactNumber ?? null,
          values.addressLine1 ?? null,
          'addressLine2' in values, values.addressLine2 ?? null,
          'barangay' in values, values.barangay ?? null,
          values.municipality ?? null, values.province ?? null,
          'postalCode' in values, values.postalCode ?? null,
          'deliveryNotes' in values, values.deliveryNotes ?? null,
          values.isDefault ?? null, values.isActive ?? null,
          addressId,
        ],
      )
    } catch (error) {
      if (error.code === '23505' && error.constraint === 'customer_addresses_one_default_per_customer') {
        await client.query('ROLLBACK')
        return response.status(409).json({ message: 'Another address was just set as default — try again.' })
      }
      throw error
    }

    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }

  const updated = await pool.query(`${addressSelectQuery} WHERE address_id = $1`, [addressId])
  return response.json({ address: mapAddressRow(updated.rows[0]) })
})

export default router
