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
}
