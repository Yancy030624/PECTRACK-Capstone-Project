// Sets the password on an existing account, from the command line.
//
// create-test-accounts.mjs deliberately SKIPS a username that already
// exists, so editing the passwords in that file changes nothing for a
// database that was already seeded — it only affects the next fresh
// machine. This is the other half: it re-hashes the password of an
// account that is already there.
//
// It goes through the same checks the app does rather than around them:
// validatePasswordField (12+ characters, upper/lower/digit/symbol, not
// containing the username or the email name) is the exact function
// routes/auth.js and routes/staff.js call, so a password this script
// accepts is one an admin could also set through Staff Management. A
// password it refuses would have been a quiet inconsistency: working at
// login, rejected the moment anyone tried to change it in the app.
//
// Every live session for that account is deleted afterwards, the same
// thing an admin password reset does (staff.js) — a password change that
// leaves old sessions signed in has not really changed anything.
//
// Usage, with the database reachable (the API server need not be running):
//   node scripts/set-account-password.mjs <username> <newPassword>
//   node scripts/set-account-password.mjs --all-demo
//
// --all-demo applies the four demo passwords that create-test-accounts.mjs
// now writes, to whichever of those accounts exist.
import bcrypt from 'bcrypt'
import { bcryptRounds } from '../server/lib/accounts.js'
import { validatePasswordField } from '../server/lib/validation.js'
import { pool } from '../server/db.js'

// Mirrors create-test-accounts.mjs. ymata_admin is the user's own admin
// account on the development machine; admin1 is the one the seeding
// script creates on a fresh one. Both take the same password so there is
// one admin credential to remember, not two.
const demoPasswords = [
  ['ymata_admin', 'ymataAdmin#1'],
  ['admin1', 'ymataAdmin#1'],
  ['cashier1', 'carlaCashier#1'],
  ['delivery1', 'luzaDelivery#1'],
  ['customer1', 'valenciaCustomer#1'],
]

// The email is needed because validatePasswordField also refuses a
// password containing the name part of the account's email address, and
// that address lives in whichever role table the account belongs to.
async function loadAccount(username) {
  const result = await pool.query(
    `SELECT u.user_id, u.user_type,
            COALESCE(a.email, c.email, ca.email, d.email) AS email
       FROM users u
       LEFT JOIN admins a ON a.user_id = u.user_id
       LEFT JOIN customers c ON c.user_id = u.user_id
       LEFT JOIN cashiers ca ON ca.user_id = u.user_id
       LEFT JOIN delivery_personnel d ON d.user_id = u.user_id
      WHERE LOWER(u.username) = LOWER($1)`,
    [username],
  )
  return result.rows[0] ?? null
}

async function setPassword(username, password) {
  const account = await loadAccount(username)
  if (!account) {
    console.log(`  skipped ${username} — no such account`)
    return false
  }

  const error = validatePasswordField(password, { username: username.toLowerCase(), email: account.email })
  if (error) {
    console.error(`  REFUSED ${username} — ${error}`)
    return false
  }

  const passwordHash = await bcrypt.hash(password, bcryptRounds)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      // failed_login_attempts and locked_until are cleared for the same
      // reason staff.js clears them on a reset: a new password should not
      // arrive already locked out by the old one's failed attempts.
      'UPDATE users SET password_hash = $2, failed_login_attempts = 0, locked_until = NULL WHERE user_id = $1',
      [account.user_id, passwordHash],
    )
    const sessions = await client.query('DELETE FROM sessions WHERE user_id = $1 RETURNING session_id', [account.user_id])
    await client.query('COMMIT')
    console.log(`  updated ${username} (${account.user_type})${sessions.rowCount > 0 ? ` — ended ${sessions.rowCount} signed-in session${sessions.rowCount === 1 ? '' : 's'}` : ''}`)
    return true
  } catch (queryError) {
    await client.query('ROLLBACK')
    throw queryError
  } finally {
    client.release()
  }
}

async function main() {
  const [first, second] = process.argv.slice(2)

  if (first === '--all-demo') {
    console.log('Setting the demo account passwords...')
    for (const [username, password] of demoPasswords) await setPassword(username, password)
  } else if (first && second) {
    await setPassword(first, second)
  } else {
    console.error('Usage: node scripts/set-account-password.mjs <username> <newPassword>')
    console.error('   or: node scripts/set-account-password.mjs --all-demo')
    process.exitCode = 1
  }

  await pool.end()
}

main().catch((error) => {
  console.error('Setting the password failed:', error)
  pool.end()
  process.exit(1)
})
