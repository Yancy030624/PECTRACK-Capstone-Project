import { config } from './config.js'
import app from './app.js'
import { pruneExpiredAuthRows } from './lib/auth.js'
import { cancelUnpaidOrders, closeStaleOrders } from './lib/staleOrders.js'
import { runDailyStockReset } from './lib/dailyStock.js'
import { runNightlyForecast } from './lib/forecastRun.js'

// Expired sessions and old OTP codes are already ignored wherever they're
// read, so this is housekeeping rather than a correctness fix — but neither
// table ever removes a row on its own, so without it both grow forever.
const pruneIntervalMs = 60 * 60 * 1000

async function pruneExpiredRows() {
  try {
    const removed = await pruneExpiredAuthRows()
    if (removed.sessions || removed.otpCodes || removed.resetTokens) console.log(`Pruned ${removed.sessions} expired session(s), ${removed.otpCodes} old OTP code(s), and ${removed.resetTokens} old password reset token(s).`)
  } catch (error) {
    // Housekeeping failing must never take the API down with it — the
    // server serves requests perfectly well with stale rows sitting in
    // those tables.
    console.error('Could not prune expired sessions/OTP codes:', error)
  }
}

// Order housekeeping (lib/staleOrders.js, the adviser 2026-10-16), at
// start-up and then every minute:
// - orders whose day has passed and that are still open are closed;
// - online checkouts not paid within 15 minutes are released, and unpaid
//   orders from before payment first are cancelled.
const staleOrdersIntervalMs = 60 * 1000

async function closeStaleOrdersQuietly() {
  try {
    const closed = await closeStaleOrders()
    if (closed.completed || closed.cancelled) console.log(`Closed old orders: ${closed.completed} completed, ${closed.cancelled} cancelled.`)
    if (closed.partPaid) console.log(`${closed.partPaid} old order(s) are part paid and stay open for staff.`)
    const released = await cancelUnpaidOrders()
    if (released.cancelled) console.log(`Released ${released.cancelled} unpaid order(s).`)
    // Soft breads back up to their standard at 5:00 AM (lib/dailyStock.js).
    const toppedUp = await runDailyStockReset()
    if (toppedUp != null) console.log(`5:00 AM top-up: ${toppedUp} soft bread(s) back to their standard stock.`)
    // The nightly forecast from 12:05 AM (lib/forecastRun.js,
    // ANALYTICS_PLAN.md A4), once per Manila day.
    const forecast = await runNightlyForecast()
    if (forecast) console.log(`Nightly forecast run ${forecast.id} on ${forecast.source} history: ${forecast.productsForecast} product(s).`)
  } catch (error) {
    // Like the pruning above: a failed run is retried on the next one and
    // never takes the API down.
    console.error('Could not close old orders:', error)
  }
}

app.listen(config.port, () => {
  console.log(`PECTRACK API listening on http://localhost:${config.port}`)
  pruneExpiredRows()
  closeStaleOrdersQuietly()
})
setInterval(closeStaleOrdersQuietly, staleOrdersIntervalMs).unref()

// .unref() so this timer alone can never be the reason the process stays
// alive — the HTTP server decides that.
setInterval(pruneExpiredRows, pruneIntervalMs).unref()
