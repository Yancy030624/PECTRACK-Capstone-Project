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

  // This used to be generated per run and printed once, on the reasoning
  // that a guessable default is a bad idea for the one role that can do
  // anything in this app. That reasoning still holds for a deployed
  // system — but this script exists to stand a DEMO machine up, and a
  // password that only appears in one line of console output is a
  // password someone loses five minutes before a panel starts. Fixed, at
  // the user's instruction (2026-09-21), and chosen to satisfy
  // validatePasswordField: 12+ characters with upper, lower, digit and
  // symbol, and not containing the username. Change it before this is
  // ever deployed anywhere real.
  const adminPassword = 'ymataAdmin#1'

  await createAdmin({
    username: 'admin1',
    password: adminPassword,
    name: 'Pectrack Admin',
    email: 'admin1@pectrack.local',
    contactNumber: '09170000000',
  })

  await createStaffOrCustomer({
    username: 'cashier1',
    password: 'carlaCashier#1',
    userType: 'CASHIER',
    table: 'cashiers',
    name: 'Carla Zoleta',
    email: 'carlazoleta@gmail.com',
    contactNumber: '09175540118',
  })

  await createStaffOrCustomer({
    username: 'delivery1',
    password: 'luzaDelivery#1',
    userType: 'DELIVERY_PERSONNEL',
    table: 'delivery_personnel',
    name: 'Christian Luza',
    email: 'christianluza@gmail.com',
    contactNumber: '09183327764',
  })

  await createStaffOrCustomer({
    username: 'customer1',
    password: 'valenciaCustomer#1',
    userType: 'CUSTOMER',
    table: 'customers',
    name: 'Christian Valencia',
    email: 'christianvalencia@gmail.com',
    contactNumber: '09209948613',
  })

  console.log('\nDone. Credentials:')
  console.log('  admin1    /', adminPassword)
  console.log('  cashier1  / carlaCashier#1')
  console.log('  delivery1 / luzaDelivery#1')
  console.log('  customer1 / valenciaCustomer#1')
  console.log('\nAdmin login no longer needs an OTP step (see routes/auth.js) — a correct password signs in immediately.')
  console.log('Next: with the API server running, `node scripts/seed-demo-data.mjs` to populate orders/payments/deliveries.')

  await pool.end()
}

main().catch((error) => {
  console.error('Account creation failed:', error)
  pool.end()
  process.exit(1)
})
