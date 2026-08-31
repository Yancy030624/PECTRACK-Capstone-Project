// ============================================================================
// PECTRACK API — index.js (annotated for learning)
// The real entry point when you run `npm run server` or `npm start`. Kept
// deliberately tiny: all the actual app configuration lives in app.js (see
// appExplanation.js) so that file can be imported by tests without also
// starting a real server on the real PORT. This file's only job is the one
// thing tests should NOT do automatically: bind a port and start listening.
// ============================================================================

import { config } from './config.js'
import app from './app.js'
import { pruneExpiredAuthRows } from './lib/auth.js'

// How often to clear out rows nobody can use any more. Hourly is far more
// often than necessary for a bakery's traffic, but it's cheap (two indexed
// DELETEs) and it means the tables never drift far from tidy.
const pruneIntervalMs = 60 * 60 * 1000

// WHY THIS LIVES IN index.js AND NOT app.js. app.js is imported by every
// test file, which then starts its own throwaway server. If the cleanup
// timer were registered there, all six test files would each spin up a
// background timer touching the database — noise at best, and a source of
// mysterious interference at worst. index.js runs ONLY for a real server,
// which is exactly the scope this belongs in. It's the same reasoning that
// put app.listen() here rather than in app.js.
async function pruneExpiredRows() {
  try {
    const removed = await pruneExpiredAuthRows()
    if (removed.sessions || removed.otpCodes) console.log(`Pruned ${removed.sessions} expired session(s) and ${removed.otpCodes} old OTP code(s).`)
  } catch (error) {
    // Deliberately swallowed after logging. This is housekeeping: if the
    // cleanup query fails, the API still serves every request perfectly
    // well with some stale rows sitting in those tables. Letting this
    // throw would turn a tidiness problem into an outage. (Note it can't
    // reach app.js's error handler either way — that only catches errors
    // raised while handling a REQUEST, and this runs on a timer.)
    console.error('Could not prune expired sessions/OTP codes:', error)
  }
}

// Start listening for HTTP requests on the configured port. Everything
// that happens for each request (middleware, routing, error handling) was
// already wired up inside app.js — this line is the only thing that
// actually turns the configured app into a running server.
app.listen(config.port, () => {
  console.log(`PECTRACK API listening on http://localhost:${config.port}`)
  // Run once at startup too, not just on the interval — otherwise a server
  // that's restarted more often than once an hour would never clean up.
  pruneExpiredRows()
})

// .unref() tells Node this timer must never, by itself, be a reason to keep
// the process alive. Without it, a repeating timer holds the event loop
// open forever, so the process would refuse to exit even after the HTTP
// server closed. With it, the server decides the lifetime and the timer
// just comes along for the ride.
setInterval(pruneExpiredRows, pruneIntervalMs).unref()
