// GET/PATCH /api/settings — PHASE10 D3. The settings an admin can change;
// for now, the bulk-order threshold. Staff may read it (the order screen
// explains why an order is waiting); only an admin may change it.
import express from 'express'
import { pool } from '../db.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { bulkOrderThresholdKey, bulkOrderThresholdLimits, getBulkOrderThreshold } from '../lib/settings.js'

const router = express.Router()

router.use(requireAuth, requireRole('ADMIN', 'CASHIER'))

router.get('/', async (_request, response) => {
  return response.json({ settings: { bulkOrderThreshold: await getBulkOrderThreshold() } })
})

router.patch('/', requireRole('ADMIN'), async (request, response) => {
  const raw = request.body.bulkOrderThreshold
  const value = Number(raw)
  const { min, max } = bulkOrderThresholdLimits
  if (raw == null || raw === '' || !Number.isInteger(value) || value < min || value > max) {
    const message = `Enter a whole number of items from ${min} to ${max.toLocaleString('en-US')}.`
    return response.status(422).json({ message, errors: { bulkOrderThreshold: message } })
  }
  await pool.query(
    `INSERT INTO app_settings (setting_key, setting_value, updated_by, updated_at)
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
     ON CONFLICT (setting_key) DO UPDATE
       SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at`,
    [bulkOrderThresholdKey, String(value), request.user.id],
  )
  return response.json({ message: 'Setting saved.', settings: { bulkOrderThreshold: value } })
})

export default router
