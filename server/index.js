import { config } from './config.js'
import app from './app.js'
import { pruneExpiredAuthRows } from './lib/auth.js'

// Expired sessions and old OTP codes are already ignored wherever they're
// read, so this is housekeeping rather than a correctness fix — but neither
// table ever removes a row on its own, so without it both grow forever.
const pruneIntervalMs = 60 * 60 * 1000

async function pruneExpiredRows() {
  try {
    const removed = await pruneExpiredAuthRows()
    if (removed.sessions || removed.otpCodes) console.log(`Pruned ${removed.sessions} expired session(s) and ${removed.otpCodes} old OTP code(s).`)
  } catch (error) {
    // Housekeeping failing must never take the API down with it — the
    // server serves requests perfectly well with stale rows sitting in
    // those tables.
    console.error('Could not prune expired sessions/OTP codes:', error)
  }
}

app.listen(config.port, () => {
  console.log(`PECTRACK API listening on http://localhost:${config.port}`)
  pruneExpiredRows()
})

// .unref() so this timer alone can never be the reason the process stays
// alive — the HTTP server decides that.
setInterval(pruneExpiredRows, pruneIntervalMs).unref()
