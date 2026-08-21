import 'dotenv/config'
import pg from 'pg'

const { Pool } = pg

export const pool = new Pool({
  host: process.env.PGHOST ?? 'localhost',
  port: Number(process.env.PGPORT ?? 5432),
  database: process.env.PGDATABASE ?? 'pectrack',
  user: process.env.PGUSER ?? 'postgres',
  password: process.env.PGPASSWORD,
})
