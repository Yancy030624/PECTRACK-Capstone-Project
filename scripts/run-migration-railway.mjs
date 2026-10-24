// Runs one migration file against the Railway database named by
// RAILWAY_DATABASE_URL in .env, and prints only what changed — never the URL.
//
//   node scripts/run-migration-railway.mjs database/migrations/037_payment_mode.sql
import 'dotenv/config'
import fs from 'node:fs'
import pg from 'pg'

const file = process.argv[2]
if (!file) throw new Error('Name the migration file to run.')
const url = process.env.RAILWAY_DATABASE_URL
if (!url) throw new Error('RAILWAY_DATABASE_URL is not set in .env.')

const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } })
try {
  await pool.query(fs.readFileSync(file, 'utf8'))
  console.log(`Ran ${file} on Railway.`)
  const check = await pool.query(`SELECT payment_mode, count(*)::int AS orders FROM orders GROUP BY 1 ORDER BY 1`).catch(() => null)
  if (check) console.table(check.rows)
} finally {
  await pool.end()
}
