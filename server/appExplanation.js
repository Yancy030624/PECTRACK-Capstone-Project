// ============================================================================
// PECTRACK API — app.js (annotated for learning)
// Builds and configures the Express application — middleware, routes, error
// handling — but does NOT call app.listen(). That's deliberately left to
// index.js. Splitting "build the app" from "start listening" is what makes
// the app testable: a test file can import this app and bind it to a
// throwaway port itself (see routes/auth.test.js), without also needing to
// avoid colliding with the real PORT=3001 the dev server uses.
// ============================================================================

// CORS = Cross-Origin Resource Sharing. Browsers block a webpage on one
// origin (e.g. http://localhost:5173, your React dev server) from calling
// an API on a different origin (e.g. http://localhost:3001) unless the API
// explicitly allows it. This middleware adds the headers that grant that
// permission.
import cors from 'cors'

// The web framework itself — handles HTTP routing, request parsing, etc.
import express from 'express'

// Centralized environment configuration (port, CORS origin, DB settings).
// Importing this is also what triggers 'dotenv/config' to run (config.js
// imports it at its own top) — ES modules only execute once no matter how
// many files import them, so .env only gets loaded a single time even
// though several files end up depending on config.js.
import { config } from './config.js'

// Your own module that sets up and exports a PostgreSQL connection pool.
// Only needed directly in this file for the health-check route below —
// every other route gets `pool` by importing it in its own route file.
import { pool } from './db.js'

// An Express Router — think of it as a self-contained mini-app that knows
// how to handle everything under /api/auth (register, login, logout, etc.)
// but doesn't know or care what prefix it'll be mounted at. See the
// `app.use('/api/auth', authRouter)` line below and routes/authExplanation.js
// for what's actually inside it.
import authRouter from './routes/auth.js'
// Same idea, for the admin-only staff account routes added in Phase 3 —
// see routes/staffExplanation.js.
import staffRouter from './routes/staff.js'
// Phase 4 additions: the product catalog (admin CRUD, everyone can view)
// and admin/cashier-facing customer record management — see
// routes/categoriesExplanation.js, routes/productsExplanation.js, and
// routes/customersExplanation.js.
import categoriesRouter from './routes/categories.js'
import customersRouter from './routes/customers.js'
// Order management (create/list/detail/status) — see
// routes/ordersExplanation.js.
import ordersRouter from './routes/orders.js'
import productsRouter from './routes/products.js'

// Create the Express application instance. Every route and middleware
// attaches to this object.
const app = express()

// --- Middleware setup -------------------------------------------------
// Middleware = functions that run on EVERY incoming request before it
// reaches your route handlers below.

// Only allow requests from the configured frontend origin. `credentials:
// true` is required because this app uses cookie-based sessions — without
// it, the browser would refuse to attach the session cookie to
// cross-origin requests even though the origin itself is allowed.
app.use(cors({ origin: config.clientOrigin, credentials: true }))

// Automatically parses incoming JSON request bodies (e.g. from
// fetch(..., { body: JSON.stringify(...) })) into `request.body` as a
// plain JS object. `limit: '10kb'` caps body size to prevent someone
// from sending a huge payload to exhaust server memory (a basic DoS
// defense).
app.use(express.json({ limit: '10kb' }))

// --- Routes ---------------------------------------------------------------

// GET /api/health — a simple "is the server (and database) alive?" check,
// commonly used by uptime monitors, load balancers, or deployment tools
// to confirm the service is ready before routing traffic to it.
//
// Notice there's no try/catch here, even though pool.query can reject. In
// Express 4 you needed one (with a manual `next(error)` in the catch) or
// an unhandled rejection could crash the process. Express 5 (this app's
// version — see package.json) automatically catches a rejected promise
// returned by an async route handler and forwards it to the error handler
// below, exactly as if you'd called next(error) yourself. So this route
// can just `await` and let a failure propagate naturally.
app.get('/api/health', async (_request, response) => {
  // A trivial query that doesn't touch real tables — if this succeeds,
  // the database connection itself is working.
  await pool.query('SELECT 1')
  response.json({ status: 'ok' })
})

// Mount the auth router. Any request whose path starts with "/api/auth"
// gets handed to authRouter with that prefix stripped — so a request to
// POST /api/auth/login matches `router.post('/login', ...)` inside
// routes/auth.js, even though that file never mentions "/api/auth" itself.
// This is also why the mount point is the ONLY place that needs to know
// the prefix — if we ever renamed it to /api/v1/auth, only this one line
// would change.
app.use('/api/auth', authRouter)
// Same mounting mechanism for the staff routes. Every route inside
// staffRouter is gated by requireAuth + requireRole('ADMIN') — but that
// gating is applied INSIDE routes/staff.js (via router.use(...) there),
// not here, so this line looks identical to the one above even though
// everything behind it requires being logged in as an admin.
app.use('/api/staff', staffRouter)
// Phase 4: catalog and customer-record routes. Unlike staffRouter,
// categoriesRouter/productsRouter/customersRouter each mix open routes
// (any logged-in user can GET) with admin-or-cashier-only ones — see
// each file's own router.use(...) and per-route requireRole calls for
// exactly where those lines are drawn.
app.use('/api/categories', categoriesRouter)
app.use('/api/products', productsRouter)
app.use('/api/customers', customersRouter)
// Order creation/listing/detail/status — see routes/ordersExplanation.js.
// Excludes delivery personnel entirely for now (no "assigned to me"
// concept exists until a later phase), and admin can't create orders
// through it — see that file for why.
app.use('/api/orders', ordersRouter)

// --- Global error handler --------------------------------------------
// Express recognizes this as error-handling middleware specifically
// because it takes FOUR arguments (error, request, response, next) — that's
// how Express tells it apart from normal middleware. Every error ends up
// here one of three ways: a route explicitly calls next(error) (still used
// in routes/auth.js's /register, which needs its catch block to run a
// ROLLBACK before reporting the error), a route THROWS inside an async
// function and Express 5 auto-forwards it here, or built-in middleware
// (like express.json() below) fails on its own and forwards its own error.
// It must be registered AFTER every route/router it's meant to catch
// errors from; anything mounted below this line wouldn't be covered.
app.use((error, _request, response, _next) => {
  // Log the full error server-side for debugging...
  console.error(error)
  // express.json() throws a SyntaxError with this `type` when the request
  // body isn't valid JSON — that's a mistake on the CLIENT's end (bad
  // request), not a server failure, so it deserves its own 400 response
  // rather than falling into the generic 500 below.
  if (error.type === 'entity.parse.failed') return response.status(400).json({ message: 'Malformed JSON in request body.' })
  // ...but for anything else, never leak internal error details (stack
  // traces, SQL errors, etc.) to the client — that could expose sensitive
  // implementation details to an attacker. Just a generic 500.
  response.status(500).json({ message: 'The service could not process your request. Please try again later.' })
})

// Exported (not listened on) — index.js is what actually starts the
// server; test files import this instead and call app.listen(0) themselves
// to get a random free port per test run.
export default app
