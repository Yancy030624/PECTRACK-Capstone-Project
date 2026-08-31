import pg from 'pg'
import { config } from './config.js'

const { Pool } = pg

// By default, pg parses a DATE column into a JS Date object set to
// LOCAL midnight of that calendar date — not UTC midnight, despite what
// the type's own name suggests. That becomes a real bug the moment the
// value is serialized: Express's response.json() calls .toISOString() on
// any Date, which is always UTC, so a local midnight gets shifted by
// whatever the server's UTC offset is. On this machine (UTC+8, fitting
// for a bakery in Lucban, Quezon) an expiration_date of '2026-12-31'
// round-tripped through the API as '2026-12-30T16:00:00.000Z' — the
// WRONG calendar date, silently, with no error anywhere.
//
// A DATE column has no time-of-day or timezone component in Postgres —
// it's just a calendar date. Overriding the parser to return the raw
// 'YYYY-MM-DD' string pg already receives over the wire removes the
// Date-object detour (and its implicit, ambiguous local-vs-UTC
// assumption) entirely, for every DATE column in this app, not just
// inventory.expiration_date. 1082 is Postgres's fixed OID for the date
// type — `SELECT oid FROM pg_type WHERE typname = 'date'`.
pg.types.setTypeParser(1082, (value) => value)

export const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  database: config.db.database,
  user: config.db.user,
  password: config.db.password,
})

// The pool keeps connections open between queries. When one of those idle
// connections dies through no fault of a request — Postgres restarted, the
// machine slept, a network blip — the Pool emits an 'error' event.
//
// This listener is not optional housekeeping. In Node, an EventEmitter that
// emits 'error' with NO listener attached rethrows it as an uncaught
// exception, which terminates the whole API process. The pool itself
// recovers on its own by discarding the dead connection and handing out a
// fresh one to the next query, so logging is genuinely all that's needed
// here — the listener simply has to exist.
pool.on('error', (error) => console.error('Unexpected error on an idle database client:', error))
