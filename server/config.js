// Single source of truth for environment configuration. Every other server
// file reads settings from here instead of touching process.env directly,
// so there's one place to check (and one place to add a default) when a new
// setting is needed.
import 'dotenv/config'

export const config = {
  port: Number(process.env.PORT ?? 3001),
  isProduction: process.env.NODE_ENV === 'production',
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  db: {
    host: process.env.PGHOST ?? 'localhost',
    port: Number(process.env.PGPORT ?? 5432),
    database: process.env.PGDATABASE ?? 'pectrack',
    user: process.env.PGUSER ?? 'postgres',
    password: process.env.PGPASSWORD,
  },
  // Phase 6.5 (see PHASE6.5_PLAN.md) — live PayMongo integration. All four
  // are `undefined`, never a placeholder string, when unset: a bare ''
  // default could be mistaken for a working (if empty) credential, where
  // undefined fails loudly and immediately the first time anything tries
  // to use it. None of these exist in this repo's .env yet — see
  // PHASE6.5_PLAN.md's closing note for where to find them in the
  // PayMongo dashboard once ready to wire them in.
  paymongo: {
    secretKey: process.env.PAYMONGO_SECRET_KEY,
    webhookSecret: process.env.PAYMONGO_WEBHOOK_SECRET,
    successUrl: process.env.PAYMONGO_SUCCESS_URL,
    cancelUrl: process.env.PAYMONGO_CANCEL_URL,
  },
}
