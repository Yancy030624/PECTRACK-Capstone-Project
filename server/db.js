import pg from 'pg'
import { config } from './config.js'

const { Pool } = pg

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
