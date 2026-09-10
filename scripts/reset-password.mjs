// Resets any account's password directly against the database.
//
// This exists because the app has no self-service password recovery: the
// login form's "Forgot password?" link is href="#forgot" and goes nowhere
// (a known gap — see RULES-PLANS/UI_AUDIT.md). Recovering an admin account
// is the case that actually bites, since admin accounts are created by
// hand (there is no create-admin endpoint) and there is no second admin
// to reset the first one.
//
// Also clears the lockout counters, because an account someone has been
// guessing at is usually locked as well as forgotten — routes/auth.js
// refuses a login while locked_until is in the future, so resetting the
// password alone would not be enough.
//
// Usage:
//   node scripts/reset-password.mjs <username>              generates one
//   node scripts/reset-password.mjs <username> <password>   sets yours
//
// The generated password is printed once and stored only as a bcrypt
// hash, so it cannot be recovered afterwards — write it down.
import crypto from 'node:crypto'
import bcrypt from 'bcrypt'
import { bcryptRounds } from '../server/lib/accounts.js'
import { pool } from '../server/db.js'

const [username, providedPassword] = process.argv.slice(2)

if (!username) {
  console.error('Usage: node scripts/reset-password.mjs <username> [password]')
  process.exit(1)
}

// Matches validatePasswordField in server/lib/validation.js: 12+ chars
// with upper, lower, digit and symbol. Generated rather than fixed so a
// reset never lands on a guessable default.
function generatePassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const lower = 'abcdefghijkmnopqrstuvwxyz'
  const digits = '23456789'
  const symbols = '!@#$%^&*'
  const all = upper + lower + digits + symbols
  const pick = (set) => set[crypto.randomInt(set.length)]
  const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)]
  while (chars.length < 16) chars.push(pick(all))
  // Fisher-Yates, so the guaranteed-class characters aren't always first.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

async function main() {
  const found = await pool.query(
    'SELECT user_id, username, user_type, is_active, locked_until FROM users WHERE username = $1',
    [username],
  )
  const user = found.rows[0]
  if (!user) {
    console.error(`No account with username "${username}".`)
    const others = await pool.query('SELECT username, user_type FROM users ORDER BY user_type, username')
    console.error('\nAccounts that do exist:')
    for (const row of others.rows) console.error(`  ${row.username}  (${row.user_type})`)
    await pool.end()
    process.exit(1)
  }

  const password = providedPassword ?? generatePassword()
  const passwordHash = await bcrypt.hash(password, bcryptRounds)

  await pool.query(
    'UPDATE users SET password_hash = $1, failed_login_attempts = 0, locked_until = NULL WHERE user_id = $2',
    [passwordHash, user.user_id],
  )

  // Existing sessions keep working off the session cookie, not the
  // password, so a reset does not sign anyone out. Clearing them is the
  // safe default for an account whose password was unknown: whoever knew
  // the old one loses their foothold too.
  const sessions = await pool.query('DELETE FROM sessions WHERE user_id = $1', [user.user_id])

  console.log(`Reset ${user.username} (${user.user_type}, user_id ${user.user_id}).`)
  if (user.locked_until) console.log('  Cleared a lockout that was also in effect.')
  if (!user.is_active) console.log('  NOTE: this account is deactivated — reactivate it before it can sign in.')
  if (sessions.rowCount > 0) console.log(`  Signed out ${sessions.rowCount} existing session${sessions.rowCount === 1 ? '' : 's'}.`)
  console.log(`\n  username: ${user.username}`)
  console.log(`  password: ${password}`)
  if (!providedPassword) console.log('\nGenerated — printed once, stored only as a hash. Write it down.')

  await pool.end()
}

main().catch((error) => {
  console.error('Password reset failed:', error)
  pool.end()
  process.exit(1)
})
