// Makes one Railway account choose a new username and password at its next
// sign-in, and signs it out now. For handing the admin account to the bakery.
// Prints only what changed, never the database URL.
//
//   node scripts/require-credential-setup.mjs <username>
import 'dotenv/config'
import pg from 'pg'

const username = process.argv[2]?.trim().toLowerCase()
if (!username) throw new Error('Name the account: node scripts/require-credential-setup.mjs <username>')
const url = process.env.RAILWAY_DATABASE_URL
if (!url) throw new Error('RAILWAY_DATABASE_URL is not set in .env.')

const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } })
try {
  const account = await pool.query('SELECT user_id, user_type FROM users WHERE LOWER(username) = $1', [username])
  if (!account.rows[0]) throw new Error(`No account is named ${username}.`)
  if (account.rows[0].user_type === 'CUSTOMER') throw new Error('Customers choose their own details when they register.')
  const userId = account.rows[0].user_id
  await pool.query('UPDATE users SET must_set_credentials = TRUE WHERE user_id = $1', [userId])
  const ended = await pool.query('DELETE FROM sessions WHERE user_id = $1', [userId])
  console.log(`${username} (${account.rows[0].user_type}) must set a new username and password at next sign-in. Sessions ended: ${ended.rowCount}.`)
  const contact = await pool.query(
    `SELECT COALESCE(a.email, ca.email) AS email FROM users u
       LEFT JOIN admins a ON a.user_id = u.user_id
       LEFT JOIN cashiers ca ON ca.user_id = u.user_id
      WHERE u.user_id = $1`,
    [userId],
  )
  if (account.rows[0].user_type === 'ADMIN') console.log(`The admin's sign-in code goes to ${contact.rows[0]?.email}. Check that this is the bakery's email.`)
} finally {
  await pool.end()
}
