// ============================================================================
// PECTRACK API — lib/reporting.js (annotated for learning)
// Shared foundation for every Phase 8 report — see PHASE8_PLAN.md. Small on
// purpose (Decision 1's own reasoning): every figure this phase computes
// inherits its correctness from the date-boundary logic here, so it lives
// in exactly one place rather than being re-derived per route.
//
// This is the file Phase 8's whole risk profile hangs off. Phases 5–7 were
// about writing correctly under concurrency; Phase 8 barely writes at all.
// Its danger is different: a report that is confidently wrong. A crash
// announces itself; a revenue figure quietly off by one day's takings does
// not — and the entire failure mode this file exists to close off is a
// TIMESTAMPTZ column bucketed in the wrong timezone, which looks exactly
// like a correct report until someone checks the math by hand.
// ============================================================================
import { normalize } from './validation.js'

// PHASE 8, DECISION 1 — the reporting day is Asia/Manila, stated
// explicitly, never inherited from the database session.
//
// date_trunc('day', ...) and ::date on a TIMESTAMPTZ are both evaluated in
// the SESSION's TimeZone setting. That happens to read Asia/Kuala_Lumpur on
// this machine — UTC+8, the same offset as Manila — so day boundaries land
// correctly today, by coincidence of local Postgres configuration, not by
// design. Under a UTC session (the default on most managed hosts) a 7am
// order would be stored as 11pm the PREVIOUS day and land in yesterday's
// sales, silently, every single morning.
//
// This is the same class of bug as commit 1993c09 (server/db.js), one
// level up: there, a Postgres DATE became a JS Date object and picked up
// an implicit local-vs-UTC conversion nobody asked for; here, a TIMESTAMPTZ
// gets bucketed into whichever timezone the SESSION happens to be
// configured with. Both are the identical mistake — letting an ambient,
// unstated timezone decide a calendar date — just at different layers.
//
// Hardcoded rather than read from config.js: this is a property of the
// business (one bakery, in Lucban, Quezon), not of the deployment
// environment. A second branch in another timezone is a real reason to
// move this to config.js and give reports a per-branch zone — inventing
// that now would be configuration for a requirement that does not exist.
export const reportingTimeZone = 'Asia/Manila'

// A cap on how wide a single report's date range may be. Not a performance
// optimization (Decision 9 explicitly declines those) — it is the one way
// an unbounded range could genuinely hurt: someone requesting the entire
// history of the table by leaving `to` absurdly far in the future. 366
// covers a full year, leap year included, which is generously more than
// any single report a bakery owner would reasonably run at once.
export const maxReportRangeDays = 366

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/

// Validates a from/to pair the way every report route needs it validated —
// real calendar dates, from <= to, within the range cap — so no two routes
// can silently disagree at the boundaries. Returns { from, to, errors }:
// from/to are the raw 'YYYY-MM-DD' strings (never a JS Date — see
// server/db.js's own comment on why a Date object invites exactly the
// local-vs-UTC ambiguity this file exists to avoid) when valid, null when
// not; errors is an { field: message } object, empty when the range is
// valid.
export function parseDateRange(query) {
  const errors = {}
  const fromRaw = normalize(query.from)
  const toRaw = normalize(query.to)

  if (!fromRaw) errors.from = 'Select a start date.'
  else if (!isoDatePattern.test(fromRaw)) errors.from = 'Enter a valid start date (YYYY-MM-DD).'
  if (!toRaw) errors.to = 'Select an end date.'
  else if (!isoDatePattern.test(toRaw)) errors.to = 'Enter a valid end date (YYYY-MM-DD).'
  if (Object.keys(errors).length) return { from: null, to: null, errors }

  // A syntactically valid but calendar-impossible date (2026-02-30) is
  // caught here rather than reaching Postgres as an invalid literal —
  // Date's own rollover behavior (2026-02-30 silently becomes 2026-03-02)
  // is exactly the kind of silent wrongness this whole file exists to
  // refuse, so the round-trip through toISOString() below is what catches
  // it: a date that didn't survive re-serialization unchanged was never
  // real to begin with.
  const fromDate = new Date(`${fromRaw}T00:00:00Z`)
  const toDate = new Date(`${toRaw}T00:00:00Z`)
  if (Number.isNaN(fromDate.getTime()) || fromDate.toISOString().slice(0, 10) !== fromRaw) errors.from = 'Enter a valid start date (YYYY-MM-DD).'
  if (Number.isNaN(toDate.getTime()) || toDate.toISOString().slice(0, 10) !== toRaw) errors.to = 'Enter a valid end date (YYYY-MM-DD).'
  if (Object.keys(errors).length) return { from: null, to: null, errors }

  if (fromDate > toDate) {
    errors.to = 'The end date must be on or after the start date.'
    return { from: null, to: null, errors }
  }

  const rangeDays = Math.round((toDate - fromDate) / 86400000) + 1
  if (rangeDays > maxReportRangeDays) {
    errors.to = `A report can cover at most ${maxReportRangeDays} days — narrow the range.`
    return { from: null, to: null, errors }
  }

  return { from: fromRaw, to: toRaw, errors: {} }
}

// PATTERN I — a half-open [from, to+1day) range built from real instants,
// never a BETWEEN on the timestamptz column itself.
//
// BETWEEN would silently drop the last day: '2026-09-02' as a bare
// timestamp is 2026-09-02 00:00:00, so a 2pm sale on that date is EXCLUDED
// and the report is a day short at the end of every range. The half-open
// range with an exclusive upper bound one day past `to` has no such hole.
//
// $fromParam/$toParam default to $1/$2 because every report route in this
// phase binds from/to as its first two parameters — overridable for the
// rare query that needs the SAME range applied to a second date column
// with different parameter numbers.
//
// `timestamp AT TIME ZONE 'X'` (this direction) means "interpret this wall
// clock as being in X" — it is how a LOCAL calendar date becomes a real
// instant to compare TIMESTAMPTZ values against. See localDateSql below
// for the OTHER direction, which is not interchangeable with this one.
//
// Measured against real rows, with the session TimeZone forced away from
// this machine's own Asia/Kuala_Lumpur setting (both to UTC and to
// America/New_York, an offset of the opposite sign) — see
// reporting.test.js. Range 2026-09-02 to 2026-09-02:
//
//   2026-09-01 23:30 Manila -> excluded (the previous local day)
//   2026-09-02 00:30 Manila -> included (the first instant of the day)
//   2026-09-02 23:30 Manila -> included (the last instant — what BETWEEN drops)
//   2026-09-03 00:10 Manila -> excluded (the next local day)
export function dateRangeSql(column, { fromParam = '$1', toParam = '$2' } = {}) {
  return `${column} >= (${fromParam}::date)::timestamp AT TIME ZONE '${reportingTimeZone}'
      AND ${column} <  ((${toParam}::date + 1)::timestamp AT TIME ZONE '${reportingTimeZone}')`
}

// The other direction of AT TIME ZONE: `timestamptz AT TIME ZONE 'X'` means
// "what did the wall clock in X read at that instant" — used for BUCKETING
// a TIMESTAMPTZ into the local calendar date it belongs to, never for
// building a range bound (dateRangeSql above is that direction, and mixing
// the two up produces an answer wrong by exactly one UTC offset).
export function localDateSql(column) {
  return `(${column} AT TIME ZONE '${reportingTimeZone}')`
}

const groupByUnits = new Set(['day', 'week', 'month'])

// The bucket a row belongs to for a given groupBy granularity, always
// expressed as the FIRST calendar day of that bucket in local time — a day
// is itself, a week is date_trunc('week', ...) (the Monday it falls in,
// Postgres's own ISO-week convention), a month is the 1st. date_trunc on
// the output of localDateSql is timezone-naive by that point, correctly:
// the conversion to local wall-clock time already happened, so there is no
// remaining ambiguity for date_trunc to get wrong.
export function bucketSql(column, groupBy) {
  if (!groupByUnits.has(groupBy)) throw new Error(`Unknown groupBy: ${groupBy}`)
  const local = localDateSql(column)
  if (groupBy === 'day') return `${local}::date`
  return `date_trunc('${groupBy}', ${local})::date`
}

export function parseGroupBy(rawGroupBy) {
  const groupBy = normalize(rawGroupBy) || 'day'
  if (!groupByUnits.has(groupBy)) return { groupBy: null, error: 'groupBy must be day, week, or month.' }
  return { groupBy, error: null }
}

// PATTERN K — one CSV cell, escaped against two separate problems.
//
// 1. CSV quoting: wrap in quotes, double any internal quote. Without it a
//    product named 'Pandesal, large' becomes two columns.
// 2. FORMULA INJECTION: a cell beginning = + - or @ is executed as a
//    formula when the file is opened in Excel or Sheets. A product named
//    '=HYPERLINK("http://evil","click")' is a stored payload that fires
//    on the OWNER's machine, not the server's — so no amount of
//    server-side hardening covers it. Prefixing with a bare single quote
//    neutralises it in every spreadsheet application that opens the file.
//
// Defence in depth, not a live hole: product names are admin-entered, not
// public input. Costs three lines, and the file is opened on someone's
// actual computer — worth it anyway.
export function csvCell(value) {
  const text = value == null ? '' : String(value)
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text
  return `"${safe.replaceAll('"', '""')}"`
}

// One row of CSV cells, comma-joined — csvCell() already quotes each
// cell, so the join itself needs nothing further.
export function csvRow(values) {
  return values.map(csvCell).join(',')
}
