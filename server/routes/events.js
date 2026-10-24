// /api/events — the events calendar (migration 036): Holy Week, Pahiyas,
// Christmas, New Year, long weekends… Each raises production by its
// multiplier (lib/dailyStock.js boostsFor). Staff read it; the admin keeps it.
import express from 'express'
import { pool } from '../db.js'
import { requireAuth, requireRole } from '../lib/auth.js'
import { normalize, parseId } from '../lib/validation.js'

const router = express.Router()
router.use(requireAuth, requireRole('ADMIN', 'CASHIER'))

const mapEvent = (row) => ({
  id: row.event_id,
  name: row.name,
  startsOn: row.starts_on,
  endsOn: row.ends_on,
  multiplier: Number(row.multiplier),
  appliesTo: row.applies_to,
  leadDays: row.lead_days,
})
const select = `SELECT event_id, name, to_char(starts_on, 'YYYY-MM-DD') AS starts_on, to_char(ends_on, 'YYYY-MM-DD') AS ends_on, multiplier, applies_to, lead_days FROM events`
const isoDate = /^\d{4}-\d{2}-\d{2}$/

function validate(body, partial) {
  const errors = {}
  const values = {}
  const has = (field) => !partial || field in body
  if (has('name')) {
    const name = normalize(body.name)
    if (!name || name.length > 100) errors.name = 'Enter the event name.'
    else values.name = name
  }
  for (const field of ['startsOn', 'endsOn']) {
    if (has(field)) {
      if (!isoDate.test(String(body[field] ?? ''))) errors[field] = 'Choose a date.'
      else values[field] = body[field]
    }
  }
  if (values.startsOn && values.endsOn && values.endsOn < values.startsOn) errors.endsOn = 'The last day cannot be before the first.'
  if (has('multiplier')) {
    const multiplier = Number(body.multiplier ?? 4)
    if (!Number.isFinite(multiplier) || multiplier < 1 || multiplier > 10) errors.multiplier = 'Enter how many times the usual, from 1 to 10.'
    else values.multiplier = Math.round(multiplier * 100) / 100
  }
  if (has('appliesTo')) {
    const appliesTo = body.appliesTo ?? 'HARD'
    if (!['HARD', 'SOFT', 'BOTH'].includes(appliesTo)) errors.appliesTo = 'Choose hard breads, soft breads, or both.'
    else values.appliesTo = appliesTo
  }
  if (has('leadDays')) {
    const leadDays = Number(body.leadDays ?? 7)
    if (!Number.isInteger(leadDays) || leadDays < 0 || leadDays > 30) errors.leadDays = 'Enter 0 to 30 days.'
    else values.leadDays = leadDays
  }
  return { errors, values }
}

// GET /api/events — upcoming and recent (from 30 days ago), soonest first.
router.get('/', async (_request, response) => {
  const result = await pool.query(`${select} WHERE ends_on >= CURRENT_DATE - 30 ORDER BY starts_on, event_id`)
  return response.json({ events: result.rows.map(mapEvent) })
})

router.post('/', requireRole('ADMIN'), async (request, response) => {
  const { errors, values } = validate(request.body, false)
  if (Object.keys(errors).length) return response.status(422).json({ message: 'Please correct the highlighted fields.', errors })
  const created = await pool.query(
    `INSERT INTO events (name, starts_on, ends_on, multiplier, applies_to, lead_days) VALUES ($1, $2, $3, $4, $5, $6) RETURNING event_id`,
    [values.name, values.startsOn, values.endsOn, values.multiplier, values.appliesTo, values.leadDays],
  )
  const row = await pool.query(`${select} WHERE event_id = $1`, [created.rows[0].event_id])
  return response.status(201).json({ event: mapEvent(row.rows[0]) })
})

router.patch('/:id', requireRole('ADMIN'), async (request, response) => {
  const id = parseId(request.params.id)
  if (!id) return response.status(404).json({ message: 'Event not found.' })
  const current = await pool.query(`${select} WHERE event_id = $1`, [id])
  if (!current.rows[0]) return response.status(404).json({ message: 'Event not found.' })
  const { errors, values } = validate(request.body, true)
  const merged = { ...mapEvent(current.rows[0]), ...values }
  if (merged.endsOn < merged.startsOn) errors.endsOn = 'The last day cannot be before the first.'
  if (Object.keys(errors).length) return response.status(422).json({ message: 'Please correct the highlighted fields.', errors })
  await pool.query(
    `UPDATE events SET name = $2, starts_on = $3, ends_on = $4, multiplier = $5, applies_to = $6, lead_days = $7 WHERE event_id = $1`,
    [id, merged.name, merged.startsOn, merged.endsOn, merged.multiplier, merged.appliesTo, merged.leadDays],
  )
  const row = await pool.query(`${select} WHERE event_id = $1`, [id])
  return response.json({ event: mapEvent(row.rows[0]) })
})

router.delete('/:id', requireRole('ADMIN'), async (request, response) => {
  const id = parseId(request.params.id)
  if (!id) return response.status(404).json({ message: 'Event not found.' })
  const removed = await pool.query('DELETE FROM events WHERE event_id = $1', [id])
  if (removed.rowCount === 0) return response.status(404).json({ message: 'Event not found.' })
  return response.status(204).end()
})

export default router
