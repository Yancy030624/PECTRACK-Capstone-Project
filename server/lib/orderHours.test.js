// Ordering dates and hours (lib/orderHours.js, the adviser 2026-10-16):
// today or later, Asia/Manila. Pickup and delivery times are 6:00 AM to
// 10:00 PM inclusive (the user, 2026-10-29: the hour after the 5:00 AM
// bake is for cooling); a walk-in for now is taken from 5:00 AM. `now` is
// fixed in every case, so the results do not depend on when the suite runs.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkOrderTime, manilaClock } from './orderHours.js'

// A Manila wall-clock time as a Date: '2026-10-20T05:00' -> 2026-10-19T21:00Z.
const manila = (local) => new Date(`${local}:00+08:00`)
const noon = manila('2026-10-20T12:00')

test('the Manila day and time are read in Manila, not UTC', () => {
  assert.deepEqual(manilaClock(manila('2026-10-20T07:00')), { day: '2026-10-20', seconds: 7 * 3600 })
  // 7:00 AM in Manila is still the day before in UTC.
  assert.equal(manila('2026-10-20T07:00').toISOString(), '2026-10-19T23:00:00.000Z')
})

test('a named time on a later day: 6:00 AM to 10:00 PM, both ends included', () => {
  const at = (time) => checkOrderTime(manila(`2026-10-22T${time}`), { now: noon })
  assert.ok(at('04:59'), '4:59 AM is refused')
  assert.ok(at('05:00'), '5:00 AM is refused: the breads are still cooling')
  assert.ok(at('05:59'), '5:59 AM is refused')
  assert.equal(at('06:00'), null, '6:00 AM is allowed')
  assert.equal(at('21:59'), null, '9:59 PM is allowed')
  assert.equal(at('22:00'), null, '10:00 PM is allowed')
  assert.ok(at('22:01'), '10:01 PM is refused')
  assert.ok(at('22:30'), '10:30 PM is refused')
  assert.ok(at('23:00'), '11:00 PM is refused')
  assert.ok(at('00:30'), 'after midnight is refused')
})

test('past dates are refused; today and later days are not', () => {
  assert.match(checkOrderTime(manila('2026-10-19T10:00'), { now: noon }), /today or a later date/)
  assert.equal(checkOrderTime(manila('2026-10-20T15:00'), { now: noon }), null, 'later today')
  assert.equal(checkOrderTime(manila('2026-11-01T08:00'), { now: noon }), null, 'a later day')
})

test('today: a time that has already passed is refused', () => {
  assert.match(checkOrderTime(manila('2026-10-20T11:00'), { now: noon }), /already passed/)
  assert.equal(checkOrderTime(manila('2026-10-20T12:00'), { now: noon }), null, 'this minute still counts')
})

test('early morning (Manila 00:00-07:59 is the UTC day before) is today, not yesterday', () => {
  const now = manila('2026-10-20T04:30')
  assert.equal(checkOrderTime(manila('2026-10-20T06:00'), { now }), null, 'the earliest time today is 6:00 AM')
  assert.ok(checkOrderTime(manila('2026-10-20T05:30'), { now }), 'not before 6:00 AM')
  assert.ok(checkOrderTime(manila('2026-10-20T05:30'), { now, walkIn: true }), 'not even for a cashier\'s advanced order')
})

test('an online order for now is only taken from 6:00 AM to 10:00 PM', () => {
  const forNowAt = (time) => checkOrderTime(null, { now: manila(`2026-10-20T${time}`) })
  assert.match(forNowAt('04:59'), /6:00 AM/)
  assert.match(forNowAt('05:00'), /6:00 AM/)
  assert.match(forNowAt('05:59'), /6:00 AM/)
  assert.equal(forNowAt('06:00'), null)
  assert.equal(forNowAt('21:59'), null)
  assert.equal(forNowAt('22:00'), null)
  assert.match(forNowAt('22:01'), /close at 10:00 PM/)
  assert.match(forNowAt('22:30'), /later day/)
  // After 10:00 PM a later day is still open.
  assert.equal(checkOrderTime(manila('2026-10-21T08:00'), { now: manila('2026-10-20T22:30') }), null)
})

test('a walk-in for now is taken from 5:00 AM to 10:00 PM: the shelf is open before pickup starts', () => {
  const walkInAt = (time) => checkOrderTime(null, { now: manila(`2026-10-20T${time}`), walkIn: true })
  assert.match(walkInAt('04:59'), /5:00 AM/)
  assert.equal(walkInAt('05:00'), null)
  assert.equal(walkInAt('05:30'), null)
  assert.equal(walkInAt('22:00'), null)
  assert.match(walkInAt('22:01'), /close at 10:00 PM/)
})
