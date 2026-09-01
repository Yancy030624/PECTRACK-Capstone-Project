import cors from 'cors'
import express from 'express'
import { config } from './config.js'
import { pool } from './db.js'
import authRouter from './routes/auth.js'
import categoriesRouter from './routes/categories.js'
import customersRouter from './routes/customers.js'
import inventoryRouter from './routes/inventory.js'
import ordersRouter from './routes/orders.js'
import paymentsRouter from './routes/payments.js'
import productsRouter from './routes/products.js'
import staffRouter from './routes/staff.js'

const app = express()

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

app.get('/api/health', async (_request, response) => {
  await pool.query('SELECT 1')
  response.json({ status: 'ok' })
})

app.use('/api/auth', authRouter)
app.use('/api/staff', staffRouter)
app.use('/api/categories', categoriesRouter)
app.use('/api/products', productsRouter)
app.use('/api/customers', customersRouter)
app.use('/api/inventory', inventoryRouter)
app.use('/api/orders', ordersRouter)
app.use('/api/payments', paymentsRouter)

app.use((error, _request, response, _next) => {
  console.error(error)
  if (error.type === 'entity.parse.failed') return response.status(400).json({ message: 'Malformed JSON in request body.' })
  response.status(500).json({ message: 'The service could not process your request. Please try again later.' })
})

export default app
