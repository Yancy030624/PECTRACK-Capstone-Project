// ============================================================================
// PECTRACK API — config.js (annotated for learning)
// One object holding every setting the server reads from the environment.
// Everything else imports { config } from here instead of touching
// process.env directly — one place to look, one place to add a default.
// ============================================================================

// Loads variables from a ".env" file into process.env (e.g. PORT,
// PGPASSWORD). This MUST run before the object below is built, since that
// object reads process.env synchronously at module-load time. Because this
// is the only file that imports 'dotenv/config' anymore, and because every
// other file gets its settings by importing THIS file, .env is guaranteed
// to be loaded before anything else needs it — without every file having
// to remember to import 'dotenv/config' itself.
import 'dotenv/config'

export const config = {
  // process.env.PORT ?? 3001 — if PORT isn't set in .env, fall back to
  // 3001 so the app still boots with a sane local default. process.env
  // values are always strings, so Number(...) converts "3001" to 3001.
  port: Number(process.env.PORT ?? 3001),

  // NODE_ENV is a de facto standard env var (not Express-specific) used to
  // distinguish "developing on my machine" from "running for real users."
  // It's not set in local dev, so this is false unless a deployment
  // explicitly sets NODE_ENV=production. Used to decide whether the
  // session cookie requires HTTPS (see lib/auth.js) — requiring HTTPS
  // locally would silently break login, since the dev server is plain http.
  isProduction: process.env.NODE_ENV === 'production',

  // Which frontend origin is allowed to call this API with credentials
  // (cookies) attached. Defaults to the Vite dev server so nothing extra
  // needs configuring locally; would need to be set to the real deployed
  // frontend URL in production.
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',

  // Grouped separately since these all describe one thing (the database
  // connection) and are consumed together by db.js's Pool constructor.
  db: {
    host: process.env.PGHOST ?? 'localhost',
    port: Number(process.env.PGPORT ?? 5432),
    database: process.env.PGDATABASE ?? 'pectrack',
    user: process.env.PGUSER ?? 'postgres',
    // No fallback for the password — if it's missing, the connection
    // should fail loudly (wrong credentials) rather than silently trying
    // some guessed default password.
    password: process.env.PGPASSWORD,
  },
}
