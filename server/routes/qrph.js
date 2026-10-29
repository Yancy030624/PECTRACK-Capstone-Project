// QR Ph payments (RULES-PLANS/QRPH_PLAN.md; the adviser 2026-10-28, the
// user 2026-10-29). Mounted at /api/qrph.
//
// An online order is paid by scanning the bakery's own QR Ph code with any
// bank or e-wallet. A plain QR code tells the system nothing, so the
// customer types the reference number from their app, and a person at the
// bakery — the admin or a cashier — finds that payment in the bakery's app
// and confirms it. Nothing here is automatic on purpose: that is the price
// of not paying a gateway's fee on every payment.
//
// The order itself is the payment-first hold it always was
// (PAYMENT_FIRST_PLAN.md): AWAITING_PAYMENT, hidden from staff, its stock
// reserved, released after 15 minutes if nothing is sent. Sending a
// reference records a PENDING payment (method QRPH, the reference in
// gateway_reference, whose UNIQUE refuses one reference used twice), and a
// hold with one is never released by the system (lib/staleOrders.js): the
// customer may really have paid, so only a person decides.
//
// Lock order, as everywhere money moves: the ORDER row first, then the
// payment (memory: cross-table lock ordering).
//
// The QR image and the screenshots are kept in the database (migration
// 043), not in uploads/: Railway replaces its disk on every deploy.
import express from 'express'
import { getBillingSummary } from '../lib/billing.js'
import { pool } from '../db.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { applyCancellationEffects, readyIfPaid } from '../lib/orderStatus.js'
import { sendInBackground, sendQrPaymentDecisionEmail } from '../lib/notices.js'
import { qrphOverdueMinutes as overdueMinutes } from '../lib/qrph.js'
import { normalize, parseId } from '../lib/validation.js'

const router = express.Router()

// The QR image and a payment screenshot: what a phone saves or screenshots.
const allowedImageTypes = new Set(['image/jpeg', 'image/png'])
const imageUploadLimit = '5mb'
// GCash and bank references are 10–20 characters; anything from 6 to 40
// letters, digits and hyphens is accepted, spaces dropped.
const referencePattern = /^[A-Za-z0-9-]{6,40}$/
const reasonMaxLength = 300

router.use(requireAuth)

const staffOnly = requireRole('ADMIN', 'CASHIER')

const readImage = (request) => {
  const contentType = String(request.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase()
  if (!allowedImageTypes.has(contentType) || !Buffer.isBuffer(request.body) || request.body.length === 0) return null
  return { contentType, bytes: request.body }
}

const putSetting = (key, value, data, userId) => pool.query(
  `INSERT INTO app_settings (key, value, data, updated_by, updated_at) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, data = EXCLUDED.data, updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at`,
  [key, value, data, userId],
)

// GET /api/qrph — what the checkout and the receipt page show. The image
// URL carries a version (when it was saved) so a replaced code is never
// served from cache.
router.get('/', async (_request, response) => {
  const result = await pool.query(
    `SELECT key, value, (extract(epoch FROM updated_at) * 1000)::bigint AS version
       FROM app_settings WHERE key IN ('qrph_image', 'qrph_account_name')`,
  )
  const setting = Object.fromEntries(result.rows.map((row) => [row.key, row]))
  const image = setting.qrph_image
  return response.json({
    configured: Boolean(image),
    accountName: setting.qrph_account_name?.value ?? null,
    imageUrl: image ? `/api/qrph/image?v=${image.version}` : null,
  })
})

router.get('/image', async (_request, response) => {
  const found = await pool.query(`SELECT value, data FROM app_settings WHERE key = 'qrph_image'`)
  const image = found.rows[0]
  if (!image?.data) return response.status(404).json({ message: 'The bakery has not set up its QR Ph code yet.' })
  response.set('Cache-Control', 'private, max-age=86400')
  return response.type(image.value).send(image.data)
})

// PUT /api/qrph/image — the admin uploads the bakery's QR Ph code.
router.put('/image', requireRole('ADMIN'), express.raw({ type: [...allowedImageTypes], limit: imageUploadLimit }), async (request, response) => {
  const image = readImage(request)
  if (!image) return response.status(422).json({ message: 'Upload the QR code as a JPEG or PNG image.', errors: { file: 'Upload a JPEG or PNG image.' } })
  await putSetting('qrph_image', image.contentType, image.bytes, request.user.id)
  return response.json({ message: 'QR Ph code saved.' })
})

// PATCH /api/qrph — the account name shown under the code.
router.patch('/', requireRole('ADMIN'), async (request, response) => {
  const accountName = normalize(request.body.accountName)
  if (!accountName || accountName.length > 100) return response.status(422).json({ message: 'Enter the account name, up to 100 characters.', errors: { accountName: 'Enter the account name, up to 100 characters.' } })
  await putSetting('qrph_account_name', accountName, null, request.user.id)
  return response.json({ accountName })
})

// POST /api/qrph — the customer sends the reference number of the payment
// they made, for the full amount owed. The order must still be their hold.
router.post('/', requireRole('CUSTOMER'), async (request, response) => {
  const orderId = parseId(request.body.orderId)
  if (!orderId) return response.status(422).json({ message: 'Select a valid order.', errors: { orderId: 'Select a valid order.' } })
  const reference = normalize(request.body.reference).replace(/\s+/g, '')
  if (!referencePattern.test(reference)) {
    return response.status(422).json({ message: 'Enter the reference number from your payment app.', errors: { reference: 'Enter the reference number shown in your payment app (letters and numbers).' } })
  }

  const customer = await pool.query('SELECT customer_id FROM customers WHERE user_id = $1', [request.user.id])
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const locked = await client.query('SELECT customer_id, status, payment_mode FROM orders WHERE order_id = $1 FOR UPDATE', [orderId])
    const order = locked.rows[0]
    if (!order || order.customer_id == null || order.customer_id !== customer.rows[0]?.customer_id) {
      await client.query('ROLLBACK')
      return response.status(404).json({ message: 'Order not found.' })
    }
    if (order.status !== 'AWAITING_PAYMENT') {
      await client.query('ROLLBACK')
      return response.status(409).json({ message: order.status === 'CANCELLED' ? 'This order was not paid in time and was cancelled. Please order again.' : 'This order does not need a payment.' })
    }
    const billing = await getBillingSummary(client, orderId)
    if (billing.isFullyPaid) {
      await client.query('ROLLBACK')
      return response.status(409).json({ message: 'This order is already paid.' })
    }
    let inserted
    try {
      inserted = await client.query(
        `INSERT INTO payments (order_id, recorded_by, payment_method, amount, status, gateway_reference)
         VALUES ($1, $2, 'QRPH', $3, 'PENDING', $4)
         RETURNING payment_id`,
        [orderId, request.user.id, billing.balanceDue, reference],
      )
    } catch (error) {
      if (error.code === '23505' && error.constraint === 'payments_one_pending_per_order_idx') {
        await client.query('ROLLBACK')
        return response.status(409).json({ message: 'A reference number was already sent for this order. The bakery is checking it.' })
      }
      if (error.code === '23505') {
        await client.query('ROLLBACK')
        return response.status(409).json({ message: 'This reference number was already used for another payment.', errors: { reference: 'This reference number was already used for another payment.' } })
      }
      throw error
    }
    await client.query('COMMIT')
    return response.status(201).json({ paymentId: inserted.rows[0].payment_id })
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
})

// POST /api/qrph/payments/:id/proof — the customer's optional screenshot,
// while their payment is still waiting. Replaces an earlier one.
router.post('/payments/:id/proof', requireRole('CUSTOMER'), express.raw({ type: [...allowedImageTypes], limit: imageUploadLimit }), async (request, response) => {
  const paymentId = parseId(request.params.id)
  if (!paymentId) return response.status(404).json({ message: 'Payment not found.' })
  const image = readImage(request)
  if (!image) return response.status(422).json({ message: 'Upload the screenshot as a JPEG or PNG image.', errors: { file: 'Upload a JPEG or PNG image.' } })

  const found = await pool.query(
    `SELECT p.status, p.payment_method, c.user_id
       FROM payments p JOIN orders o ON o.order_id = p.order_id LEFT JOIN customers c ON c.customer_id = o.customer_id
      WHERE p.payment_id = $1`,
    [paymentId],
  )
  const payment = found.rows[0]
  if (!payment || payment.user_id !== request.user.id || payment.payment_method !== 'QRPH') return response.status(404).json({ message: 'Payment not found.' })
  if (payment.status !== 'PENDING') return response.status(409).json({ message: 'This payment has already been checked.' })

  const saved = await pool.query(
    `UPDATE payments SET proof_image = $1, proof_type = $2 WHERE payment_id = $3 AND status = 'PENDING' RETURNING payment_id`,
    [image.bytes, image.contentType, paymentId],
  )
  if (saved.rowCount === 0) return response.status(409).json({ message: 'This payment has already been checked.' })
  return response.status(201).json({ message: 'Screenshot attached.' })
})

// GET /api/qrph/payments/:id/proof — staff only: a customer's payment
// screenshot is not public.
router.get('/payments/:id/proof', staffOnly, async (request, response) => {
  const paymentId = parseId(request.params.id)
  if (!paymentId) return response.status(404).json({ message: 'Payment not found.' })
  const found = await pool.query('SELECT proof_image, proof_type FROM payments WHERE payment_id = $1', [paymentId])
  const proof = found.rows[0]
  if (!proof?.proof_image) return response.status(404).json({ message: 'No screenshot was attached.' })
  response.set('Cache-Control', 'private, no-store')
  return response.type(proof.proof_type).send(proof.proof_image)
})

// GET /api/qrph/to-confirm — staff: every QR Ph payment waiting to be
// checked, oldest first, with how long it has waited.
router.get('/to-confirm', staffOnly, async (_request, response) => {
  const result = await pool.query(
    `SELECT p.payment_id, p.amount, p.gateway_reference, p.created_at, p.proof_image IS NOT NULL AS has_proof,
            o.order_id, o.daily_number, o.order_day, o.order_type, COALESCE(c.name, o.guest_name) AS customer_name, c.contact_num,
            p.created_at < CURRENT_TIMESTAMP - make_interval(mins => $1::int) AS overdue
       FROM payments p
       JOIN orders o ON o.order_id = p.order_id
       LEFT JOIN customers c ON c.customer_id = o.customer_id
      WHERE p.payment_method = 'QRPH' AND p.status = 'PENDING'
      ORDER BY p.created_at, p.payment_id`,
    [overdueMinutes],
  )
  return response.json({
    overdueMinutes,
    payments: result.rows.map((row) => ({
      id: row.payment_id,
      amount: row.amount,
      reference: row.gateway_reference,
      sentAt: row.created_at,
      hasProof: row.has_proof,
      overdue: row.overdue,
      orderId: row.order_id,
      orderNumber: row.order_id,
      orderDay: row.order_day,
      dailyNumber: row.daily_number,
      orderType: row.order_type,
      customerName: row.customer_name,
      contactNumber: row.contact_num,
    })),
  })
})

// POST /api/qrph/payments/:id/verify — staff confirm or reject.
//   CONFIRM: the payment is PAID and the order Ready for pickup or for
//            delivery (lib/orderStatus.js readyIfPaid).
//   REJECT:  the payment FAILED with the reason; a hold is cancelled and
//            its stock returned, so the customer can order again.
// The customer is emailed either way, after the commit.
router.post('/payments/:id/verify', staffOnly, async (request, response) => {
  const paymentId = parseId(request.params.id)
  if (!paymentId) return response.status(404).json({ message: 'Payment not found.' })
  const decision = normalize(request.body.decision).toUpperCase()
  if (decision !== 'CONFIRM' && decision !== 'REJECT') return response.status(422).json({ message: 'Choose confirm or reject.', errors: { decision: 'Choose confirm or reject.' } })
  const reason = normalize(request.body.reason)
  if (decision === 'REJECT' && (reason.length < 3 || reason.length > reasonMaxLength)) {
    return response.status(422).json({ message: 'Say why the payment is not accepted.', errors: { reason: 'Say why the payment is not accepted, for example "No payment with this reference number".' } })
  }

  const existing = await pool.query(`SELECT order_id FROM payments WHERE payment_id = $1 AND payment_method = 'QRPH'`, [paymentId])
  const orderId = existing.rows[0]?.order_id
  if (!orderId) return response.status(404).json({ message: 'Payment not found.' })

  const client = await pool.connect()
  let outcome
  try {
    await client.query('BEGIN')
    const orderLock = await client.query('SELECT status FROM orders WHERE order_id = $1 FOR UPDATE', [orderId])
    const orderStatus = orderLock.rows[0].status
    const claimed = await client.query(
      `UPDATE payments
          SET status = $2::payment_status, verified_by = $3, verified_at = CURRENT_TIMESTAMP,
              payment_date = CASE WHEN $2::payment_status = 'PAID' THEN CURRENT_TIMESTAMP ELSE payment_date END,
              rejected_reason = CASE WHEN $2::payment_status = 'FAILED' THEN $4 ELSE rejected_reason END
        WHERE payment_id = $1 AND status = 'PENDING'
      RETURNING payment_id`,
      [paymentId, decision === 'CONFIRM' ? 'PAID' : 'FAILED', request.user.id, reason || null],
    )
    if (claimed.rowCount === 0) {
      await client.query('ROLLBACK')
      return response.status(409).json({ message: 'This payment was already checked by someone else. Reload the list.' })
    }
    if (decision === 'CONFIRM') {
      outcome = (await readyIfPaid(client, orderId, request.user.id)) ?? orderStatus
    } else if (orderStatus === 'AWAITING_PAYMENT') {
      await client.query(`UPDATE orders SET status = 'CANCELLED' WHERE order_id = $1`, [orderId])
      await applyCancellationEffects(client, orderId, request.user.id)
      await client.query(
        'INSERT INTO order_status_history (order_id, updated_by, status, note) VALUES ($1, $2, $3, $4)',
        [orderId, request.user.id, 'CANCELLED', `QR Ph payment not accepted: ${reason}`],
      )
      outcome = 'CANCELLED'
    } else {
      outcome = orderStatus
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }

  sendInBackground('QR Ph decision', () => sendQrPaymentDecisionEmail({ orderId, confirmed: decision === 'CONFIRM', reason }))
  return response.json({ status: decision === 'CONFIRM' ? 'PAID' : 'FAILED', orderStatus: outcome })
})

export default router
