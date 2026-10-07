import cors from 'cors'
import express from 'express'
import { config } from './config.js'
import { pool } from './db.js'
import { apiLimiter, httpsRedirect, securityHeaders } from './lib/security.js'
import addressesRouter from './routes/addresses.js'
import authRouter from './routes/auth.js'
import categoriesRouter from './routes/categories.js'
import customersRouter from './routes/customers.js'
import deliveriesRouter from './routes/deliveries.js'
import forecastsRouter from './routes/forecasts.js'
import settingsRouter from './routes/settings.js'
import inventoryRouter from './routes/inventory.js'
import ordersRouter from './routes/orders.js'
import paymentsRouter from './routes/payments.js'
import productionRouter from './routes/production.js'
import productsRouter from './routes/products.js'
import reportsRouter from './routes/reports.js'
import staffRouter from './routes/staff.js'

const app = express()

// How many proxy hops to trust when reading request.ip and
// request.secure. Set FIRST, because the two middlewares directly below
// both depend on it: the redirect asks whether the ORIGINAL connection
// was secure, and the rate limiter keys on the ORIGINAL client address.
// See config.js for why this is opt-in rather than defaulted either way.
if (config.trustProxyHops > 0) app.set('trust proxy', config.trustProxyHops)

// Before everything, including CORS: a response that is about to be
// refused, redirected, or rate-limited should still carry the headers
// that protect the browser rendering it.
app.use(securityHeaders)
app.use(httpsRedirect)

app.use(cors({ origin: config.clientOrigin, credentials: true }))
// The `verify` option here exists for exactly one route:
// POST /api/payments/webhook (Phase 6.5 — see PHASE6.5_PLAN.md, Decision
// 5). Verifying a PayMongo webhook signature requires the EXACT raw bytes
// PayMongo hashed, and Express body parsers consume the request stream
// exactly once — by the time a route handler runs, express.json() below
// has already read and parsed it, so a second, route-level raw-body
// parser on just the webhook path would receive an already-drained stream
// and produce nothing. Capturing the raw buffer here, in the ONE global
// parser that actually sees the original bytes, is the standard fix for
// this (the same one Stripe's own Express integration guide recommends
// for the identical problem) — and it is cheaper than it might look: this
// runs on every request, but request.rawBody is a Buffer REFERENCE, not a
// copy, so the ~20 other routes that never read it pay nothing for its
// existence.
app.use(express.json({
  limit: '10kb',
  verify: (request, _response, buffer) => { request.rawBody = buffer },
}))

// A blanket ceiling so no single caller can flood the API. The strict
// per-route limits live on the auth routes themselves (routes/auth.js),
// where the damage from flooding is not load but real email sent to a
// real customer. /api/health is deliberately below this line: it is what
// a hosting platform polls, and rate-limiting a health check into a 429
// reads to that platform as an outage.
app.get('/api/health', async (_request, response) => {
  await pool.query('SELECT 1')
  response.json({ status: 'ok' })
})

app.use(apiLimiter)

app.use('/api/addresses', addressesRouter)
app.use('/api/auth', authRouter)
app.use('/api/staff', staffRouter)
app.use('/api/categories', categoriesRouter)
app.use('/api/products', productsRouter)
app.use('/api/customers', customersRouter)
app.use('/api/inventory', inventoryRouter)
app.use('/api/production', productionRouter)
app.use('/api/orders', ordersRouter)
app.use('/api/payments', paymentsRouter)
app.use('/api/deliveries', deliveriesRouter)
app.use('/api/reports', reportsRouter)
app.use('/api/forecasts', forecastsRouter)
app.use('/api/settings', settingsRouter)

app.use((error, _request, response, _next) => {
  console.error(error)
  if (error.type === 'entity.parse.failed') return response.status(400).json({ message: 'Malformed JSON in request body.' })
  // Both express.json()'s 10kb limit above and express.raw()'s 5mb proof-
  // upload limit (routes/deliveries.js — Phase 7, Decision 8) throw this
  // same error.type when a body exceeds its limit. Without this case it
  // falls through to the generic 500 below — "the service is broken" —
  // when the honest answer is "that file is too large."
  if (error.type === 'entity.too.large') return response.status(413).json({ message: 'The uploaded file is too large.' })
  response.status(500).json({ message: 'The service could not process your request. Please try again later.' })
})

export default app
