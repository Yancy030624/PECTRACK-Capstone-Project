// Live stock (RULES-PLANS/LIVE_STOCK_PLAN.md): the server side of
// "inventory updates without a refresh".
//
// The database announces every stock change itself — migration 041's
// trigger sends NOTIFY stock_changed with 'inventory' or 'ingredients' —
// so this file only has to LISTEN on one connection and pass each
// announcement on to the screens that are open. Those are Server-Sent
// Events streams: plain HTTP responses kept open, one line per event.
//
// One dedicated connection, not one from the pool: a LISTEN belongs to the
// connection that ran it, and a pooled connection is handed to other
// queries between uses. It is opened on the first viewer, not at startup,
// so the tests and a server nobody is watching never hold it.
import pg from 'pg'
import { config } from '../config.js'

const channel = 'stock_changed'
const heartbeatMs = 25_000
const maxRetryMs = 30_000

const streams = new Set()
let client = null
let connecting = null
let retryMs = 1000
let retryTimer = null
let everConnected = false

function connectionSettings() {
  return config.db.connectionString
    ? { connectionString: config.db.connectionString, ssl: config.db.ssl ? { rejectUnauthorized: false } : undefined }
    : { host: config.db.host, port: config.db.port, database: config.db.database, user: config.db.user, password: config.db.password }
}

// Sends one event to every open stream. The payload is only the table's
// name — never stock numbers: the screen re-reads them through the normal,
// permission-checked API, so a stream left open after sign-out learns
// nothing but "something changed".
function broadcast(table) {
  for (const response of streams) response.write(`event: stock\ndata: ${table}\n\n`)
}

function scheduleReconnect() {
  client = null
  if (retryTimer || streams.size === 0) return
  retryTimer = setTimeout(() => {
    retryTimer = null
    listen().catch(() => {})
  }, retryMs)
  retryTimer.unref()
  retryMs = Math.min(retryMs * 2, maxRetryMs)
}

// Opens the LISTEN connection if it is not open yet. A dropped connection
// (Postgres restarted, a network blip) is retried with a growing delay,
// 1 s up to 30 s, for as long as any screen is open.
async function listen() {
  if (client) return
  if (connecting) return connecting
  connecting = (async () => {
    const next = new pg.Client(connectionSettings())
    next.on('notification', (message) => {
      if (message.channel === channel) broadcast(message.payload)
    })
    next.on('error', (error) => {
      console.error('Live stock connection lost:', error.message)
      next.end().catch(() => {})
      if (client === next) scheduleReconnect()
    })
    try {
      await next.connect()
      await next.query(`LISTEN ${channel}`)
      client = next
      retryMs = 1000
      // After a reconnect, anything that changed while the connection was
      // down was missed: tell every screen to re-read once.
      if (everConnected) {
        broadcast('inventory')
        broadcast('ingredients')
      }
      everConnected = true
    } catch (error) {
      console.error('Could not listen for stock changes:', error.message)
      next.end().catch(() => {})
      scheduleReconnect()
    }
  })()
  try {
    await connecting
  } finally {
    connecting = null
  }
}

// Express handler body for GET /api/inventory/live: keeps the response
// open as an event stream until the browser goes away.
export function openStockStream(request, response) {
  response.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Tells a buffering proxy (nginx and the like) to pass each line on
    // at once instead of collecting them.
    'X-Accel-Buffering': 'no',
  })
  response.flushHeaders()
  // The browser waits this long before reconnecting after a drop.
  response.write('retry: 3000\n\n')
  streams.add(response)
  listen().catch(() => {})

  // A comment line now and then, so a proxy (Railway's) never closes the
  // connection for being quiet.
  const heartbeat = setInterval(() => response.write(': still here\n\n'), heartbeatMs)
  heartbeat.unref()
  request.on('close', () => {
    clearInterval(heartbeat)
    streams.delete(response)
  })
}

// For the tests: how many screens are listening, and a way to close the
// LISTEN connection so the test process can exit.
export const openStreamCount = () => streams.size
export async function stopListening() {
  if (retryTimer) clearTimeout(retryTimer)
  retryTimer = null
  const current = client
  client = null
  if (current) await current.end().catch(() => {})
}
