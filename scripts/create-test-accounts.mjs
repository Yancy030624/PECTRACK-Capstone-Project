// Creates the four accounts a fresh database needs before anything else
// works — schema.sql and the migrations build empty tables only, and
// nothing creates a first account automatically. Written for exactly
// this situation: a new machine (a laptop for a demo, a fresh clone for
// a panelist) with the schema loaded but no data yet.
//
// Uses the real account-creation helpers (bcryptRounds, roleTables) —
// the same ones routes/auth.js and routes/staff.js use — so these are
// ordinary accounts, not a special "test mode" shortcut. ADMIN is
// created directly via SQL because there is no API endpoint for it
// (confirmed in routes/customersExplanation.js's own header comment —
// admin accounts are seeded manually, on purpose).
//
// Safe to re-run: each account is skipped, not duplicated, if its
// username already exists.
//
// Run with the database reachable, the API server does NOT need to be
// running (this writes directly to Postgres): node scripts/create-test-accounts.mjs
import crypto from 'node:crypto'
import bcrypt from 'bcrypt'
import { bcryptRounds } from '../server/lib/accounts.js'
import { pool } from '../server/db.js'

async function userExists(username) {
  const result = await pool.query('SELECT 1 FROM users WHERE username = $1', [username])
  return result.rowCount > 0
}

async function createStaffOrCustomer({ username, password, userType, table, name, email, contactNumber }) {
  if (await userExists(username)) {
    console.log(`  skipped ${username} — already exists`)
    return
  }
  const passwordHash = await bcrypt.hash(password, bcryptRounds)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const userResult = await client.query(
      `INSERT INTO users (username, password_hash, user_type) VALUES ($1, $2, $3) RETURNING user_id`,
      [username, passwordHash, userType],
    )
    const userId = userResult.rows[0].user_id
    await client.query(
      `INSERT INTO ${table} (user_id, name, contact_num, email) VALUES ($1, $2, $3, $4)`,
      [userId, name, contactNumber, email],
    )
    await client.query('COMMIT')
    console.log(`  created ${username} (${userType}) — user_id ${userId}`)
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

async function createAdmin({ username, password, name, email, contactNumber }) {
  if (await userExists(username)) {
    console.log(`  skipped ${username} — already exists`)
    return
  }
  const passwordHash = await bcrypt.hash(password, bcryptRounds)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const userResult = await client.query(
      `INSERT INTO users (username, password_hash, user_type) VALUES ($1, $2, 'ADMIN') RETURNING user_id`,
      [username, passwordHash],
    )
    const userId = userResult.rows[0].user_id
    await client.query(
      `INSERT INTO admins (user_id, name, contact_num, email) VALUES ($1, $2, $3, $4)`,
      [userId, name, contactNumber, email],
    )
    await client.query('COMMIT')
    console.log(`  created ${username} (ADMIN) — user_id ${userId}`)
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

async function main() {
  console.log('Creating accounts...')

  // A generated password, printed once below — there is no "the real
  // admin password" for a script to reuse, and generating one beats
  // hardcoding a guessable default for the one role that can do
  // anything in this app.
  const adminPassword = `Admin-${crypto.randomBytes(6).toString('base64url')}!`

  await createAdmin({
    username: 'admin1',
    password: adminPassword,
    name: 'Pectrack Admin',
    email: 'admin1@pectrack.local',
    contactNumber: '09170000000',
  })

  await createStaffOrCustomer({
    username: 'cashier1',
    password: 'Cashier@Pectrack1',
    userType: 'CASHIER',
    table: 'cashiers',
    name: 'Carla Zoleta',
    email: 'carlazoleta@gmail.com',
    contactNumber: '09175540118',
  })

  await createStaffOrCustomer({
    username: 'delivery1',
    password: 'Delivery@Pectrack1',
    userType: 'DELIVERY_PERSONNEL',
    table: 'delivery_personnel',
    name: 'Christian Luza',
    email: 'christianluza@gmail.com',
    contactNumber: '09183327764',
  })

  await createStaffOrCustomer({
    username: 'customer1',
    password: 'Customer@Pectrack1',
    userType: 'CUSTOMER',
    table: 'customers',
    name: 'Christian Valencia',
    email: 'christianvalencia@gmail.com',
    contactNumber: '09209948613',
  })

  console.log('\nDone. Credentials:')
  console.log('  admin1    /', adminPassword, '  <- write this down, it is not stored anywhere else')
  console.log('  cashier1  / Cashier@Pectrack1')
  console.log('  delivery1 / Delivery@Pectrack1')
  console.log('  customer1 / Customer@Pectrack1')
  console.log('\nAdmin login no longer needs an OTP step (see routes/auth.js) — a correct password signs in immediately.')
  console.log('Next: with the API server running, `node scripts/seed-demo-data.mjs` to populate orders/payments/deliveries.')

  await pool.end()
}

main().catch((error) => {
  console.error('Account creation failed:', error)
  pool.end()
  process.exit(1)
})
