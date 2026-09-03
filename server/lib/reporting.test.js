// Unit tests for the Phase 8 foundation (see PHASE8_PLAN.md, Step 1) —
// written and run BEFORE any report route exists, because every figure
// this phase computes inherits its correctness from the boundary logic
// here. Run with: npm test
import assert from 'node:assert/strict'
import { after, describe, test } from 'node:test'
import { pool } from '../db.js'
import { bucketSql, dateRangeSql, maxReportRangeDays, parseDateRange, parseGroupBy } from './reporting.js'

describe('parseDateRange', () => {
  test('accepts a valid range', () => {
    const result = parseDateRange({ from: '2026-08-01', to: '2026-08-31' })
    assert.deepEqual(result, { from: '2026-08-01', to: '2026-08-31', errors: {} })
  })

  test('accepts a single-day range (from === to)', () => {
    const result = parseDateRange({ from: '2026-09-02', to: '2026-09-02' })
    assert.equal(Object.keys(result.errors).length, 0)
  })

  test('rejects a missing from or to', () => {
    assert.ok(parseDateRange({ to: '2026-08-31' }).errors.from)
    assert.ok(parseDateRange({ from: '2026-08-01' }).errors.to)
    assert.ok(parseDateRange({}).errors.from)
  })

  test('rejects a malformed date string', () => {
    assert.ok(parseDateRange({ from: 'not-a-date', to: '2026-08-31' }).errors.from)
    assert.ok(parseDateRange({ from: '2026-08-01', to: '08/31/2026' }).errors.to)
  })

  // Date's own rollover (2026-02-30 -> 2026-03-02) is exactly the kind of
  // silent wrongness this file exists to refuse — a date that doesn't
  // survive re-serialization unchanged was never real.
  test('rejects a calendar-impossible date like February 30th', () => {
    const result = parseDateRange({ from: '2026-02-30', to: '2026-03-01' })
    assert.ok(result.errors.from)
  })

  test('rejects from after to', () => {
    const result = parseDateRange({ from: '2026-08-31', to: '2026-08-01' })
    assert.ok(result.errors.to)
  })

  test('rejects a range wider than the cap, accepts one at exactly the cap', () => {
    const tooWide = parseDateRange({ from: '2026-01-01', to: '2027-01-02' }) // 367 days
    assert.ok(tooWide.errors.to)

    const atCap = parseDateRange({ from: '2026-01-01', to: '2027-01-01' }) // exactly 366 (2026 is not a leap year, but the cap itself is what's under test)
    // Recompute the exact boundary explicitly rather than trusting the
    // constant's value not to drift from what the function enforces.
    const from = new Date('2026-01-01T00:00:00Z')
    const to = new Date(from.getTime() + (maxReportRangeDays - 1) * 86400000)
    const exact = parseDateRange({ from: '2026-01-01', to: to.toISOString().slice(0, 10) })
    assert.equal(Object.keys(exact.errors).length, 0, 'a range of exactly maxReportRangeDays must be accepted')
    void atCap
  })
})

describe('parseGroupBy', () => {
  test('defaults to day when omitted', () => {
    assert.deepEqual(parseGroupBy(undefined), { groupBy: 'day', error: null })
  })
  test('accepts day, week, month', () => {
    for (const value of ['day', 'week', 'month']) assert.equal(parseGroupBy(value).groupBy, value)
  })
  test('rejects anything else', () => {
    const result = parseGroupBy('year')
    assert.equal(result.groupBy, null)
    assert.ok(result.error)
  })
})

// The tests this whole phase exists for — Pattern I's boundary table,
// proven against a REAL query, not just the SQL-string builders in
// isolation. A test that only checks the generated SQL text is a string
// comparison; a test that runs it against real timestamptz rows is the
// one that actually catches a wrong-by-one-offset bug.
describe('Pattern I — the day boundary, against real data', () => {
  const rows = [
    { label: '2026-09-01 23:30 Manila', instant: '2026-09-01 23:30:00+08' },
    { label: '2026-09-02 00:30 Manila', instant: '2026-09-02 00:30:00+08' },
    { label: '2026-09-02 23:30 Manila', instant: '2026-09-02 23:30:00+08' },
    { label: '2026-09-03 00:10 Manila', instant: '2026-09-03 00:10:00+08' },
  ]

  const runQuery = async (client) => {
    const range = dateRangeSql('ts')
    const result = await client.query(
      `SELECT label, ts, ${range} AS in_range
         FROM (VALUES ${rows.map((_row, index) => `($${index * 2 + 3}, $${index * 2 + 4}::timestamptz)`).join(', ')}) AS sample(label, ts)`,
      ['2026-09-02', '2026-09-02', ...rows.flatMap((row) => [row.label, row.instant])],
    )
    return Object.fromEntries(result.rows.map((row) => [row.label, row.in_range]))
  }

  test('a half-open Manila-local range includes both boundary instants and excludes the neighbours, on this machine\'s own session timezone', async () => {
    const inRange = await runQuery(pool)
    assert.equal(inRange['2026-09-01 23:30 Manila'], false, 'the previous local day must be excluded')
    assert.equal(inRange['2026-09-02 00:30 Manila'], true, 'the first instant of the local day must be included')
    assert.equal(inRange['2026-09-02 23:30 Manila'], true, 'the last instant of the local day must be included — this is the one BETWEEN silently drops')
    assert.equal(inRange['2026-09-03 00:10 Manila'], false, 'the next local day must be excluded')
  })

  // THE test that proves Decision 1 is real rather than inherited from
  // this machine's own Asia/Kuala_Lumpur session setting. Without forcing
  // a different session timezone, this whole suite would pass just as
  // happily with the AT TIME ZONE conversions missing entirely — UTC+8
  // would silently stand in for Manila's own UTC+8 and nobody would know.
  test('the same boundaries hold with the session timezone forced to UTC', async () => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query("SET LOCAL TimeZone = 'UTC'")
      const inRange = await runQuery(client)
      assert.equal(inRange['2026-09-01 23:30 Manila'], false)
      assert.equal(inRange['2026-09-02 00:30 Manila'], true)
      assert.equal(inRange['2026-09-02 23:30 Manila'], true)
      assert.equal(inRange['2026-09-03 00:10 Manila'], false)
    } finally {
      await client.query('ROLLBACK')
      client.release()
    }
  })

  // And again with a session timezone that is neither Manila's nor UTC —
  // a US timezone chosen specifically because its offset sign is opposite
  // Manila's, so a latent bug that merely swapped a sign would still show
  // up here even if it happened to cancel out under UTC.
  test('the same boundaries hold with the session timezone forced to America/New_York', async () => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query("SET LOCAL TimeZone = 'America/New_York'")
      const inRange = await runQuery(client)
      assert.equal(inRange['2026-09-01 23:30 Manila'], false)
      assert.equal(inRange['2026-09-02 00:30 Manila'], true)
      assert.equal(inRange['2026-09-02 23:30 Manila'], true)
      assert.equal(inRange['2026-09-03 00:10 Manila'], false)
    } finally {
      await client.query('ROLLBACK')
      client.release()
    }
  })

  test('bucketSql groups by the correct local calendar day, independent of session timezone', async () => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query("SET LOCAL TimeZone = 'UTC'")
      const bucket = bucketSql('ts', 'day')
      const result = await client.query(
        `SELECT label, ${bucket} AS bucket
           FROM (VALUES ${rows.map((_row, index) => `($${index * 2 + 1}, $${index * 2 + 2}::timestamptz)`).join(', ')}) AS sample(label, ts)`,
        rows.flatMap((row) => [row.label, row.instant]),
      )
      const buckets = Object.fromEntries(result.rows.map((row) => [row.label, row.bucket]))
      assert.equal(buckets['2026-09-01 23:30 Manila'], '2026-09-01')
      assert.equal(buckets['2026-09-02 00:30 Manila'], '2026-09-02')
      assert.equal(buckets['2026-09-02 23:30 Manila'], '2026-09-02')
      assert.equal(buckets['2026-09-03 00:10 Manila'], '2026-09-03')
    } finally {
      await client.query('ROLLBACK')
      client.release()
    }
  })

  test('bucketSql week/month truncate to the start of the local ISO week/month', async () => {
    // 2026-09-02 is a Wednesday; its ISO week starts Monday 2026-08-31.
    const result = await pool.query(
      `SELECT ${bucketSql('$1::timestamptz', 'week')} AS week_bucket, ${bucketSql('$1::timestamptz', 'month')} AS month_bucket`,
      ['2026-09-02 12:00:00+08'],
    )
    assert.equal(result.rows[0].week_bucket, '2026-08-31')
    assert.equal(result.rows[0].month_bucket, '2026-09-01')
  })
})

after(async () => {
  await pool.end()
})
