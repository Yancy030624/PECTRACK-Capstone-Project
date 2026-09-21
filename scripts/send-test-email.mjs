// Proves the SMTP settings in .env actually work, without having to
// trigger a login or a password reset to find out.
//
// Written because "the code still appears in the terminal" is the same
// symptom for four different causes — a missing value, an app password
// Google rejected, a From address Gmail will not send as, or a server
// that was started before .env was edited. Guessing between them costs
// more time than this script took to write.
//
// Usage, with the API server NOT needing to be running:
//   node scripts/send-test-email.mjs                  (sends to SMTP_USER)
//   node scripts/send-test-email.mjs you@example.com  (sends somewhere else)
//   node scripts/send-test-email.mjs --accounts       (no send; lists the
//                                                      address each account
//                                                      would receive at)
import { config } from '../server/config.js'
import { sendMail } from '../server/lib/mail.js'
import { pool } from '../server/db.js'

// Never print a password, not even to a local terminal that is about to
// be screenshared into a defence.
const mask = (value) => (value ? `set (${value.length} characters)` : 'NOT SET')

function reportConfig() {
  console.log('Mail settings as the server resolves them:\n')
  console.log(`  SMTP_HOST   ${config.mail.host ?? 'NOT SET'}`)
  console.log(`  SMTP_PORT   ${config.mail.port}`)
  console.log(`  SMTP_USER   ${config.mail.user ?? 'NOT SET'}`)
  console.log(`  SMTP_PASS   ${mask(config.mail.password)}`)
  console.log(`  MAIL_FROM   ${config.mail.from}`)
  console.log('')
}

// Each of these is a real way this goes wrong, with the fix rather than
// the symptom.
function reportProblems() {
  const problems = []
  if (!config.mail.host) problems.push('SMTP_HOST is unset — mail is printed to the server console instead of sent. Set it to smtp.gmail.com.')
  if (!config.mail.user) problems.push('SMTP_USER is empty — Gmail refuses anonymous relay. Set it to the Gmail address sending the mail.')
  if (!config.mail.password) problems.push('SMTP_PASS is empty — set it to a 16-character Google App Password, NOT the account password.')
  if (config.mail.user && config.mail.password && config.mail.password.replace(/\s/g, '').length !== 16) {
    problems.push('SMTP_PASS is not 16 characters — a Google App Password is exactly 16. An ordinary Gmail password will be rejected.')
  }
  // Gmail will only send as the authenticated account. A From address on
  // another domain is refused outright, which reads as a confusing
  // authentication error rather than "you do not own that domain".
  if (config.mail.user && config.mail.from && !config.mail.from.includes(config.mail.user)) {
    problems.push(`MAIL_FROM does not contain ${config.mail.user} — Gmail only sends as the account it authenticated with. Use: PECTRACK <${config.mail.user}>`)
  }
  return problems
}

// Which mailbox each account's password reset — and, for an admin, each
// sign-in code — would actually land in. A wrong address here is silent
// until the day someone needs it.
async function listAccountEmails() {
  const result = await pool.query(
    `SELECT u.username, u.user_type, u.is_active,
            COALESCE(a.email, c.email, ca.email, d.email) AS email
       FROM users u
       LEFT JOIN admins a ON a.user_id = u.user_id
       LEFT JOIN customers c ON c.user_id = u.user_id
       LEFT JOIN cashiers ca ON ca.user_id = u.user_id
       LEFT JOIN delivery_personnel d ON d.user_id = u.user_id
      WHERE u.is_active = TRUE
      ORDER BY u.user_type, u.username`,
  )
  console.log('Where each active account would receive its mail:\n')
  for (const row of result.rows) {
    const note = row.user_type === 'ADMIN' ? '  <- sign-in codes go here' : ''
    console.log(`  ${row.username.padEnd(22)} ${row.user_type.padEnd(20)} ${row.email ?? '(no email on file)'}${note}`)
  }
  console.log('')
}

async function main() {
  const argument = process.argv[2]
  reportConfig()

  if (argument === '--accounts') {
    await listAccountEmails()
    await pool.end()
    return
  }

  const problems = reportProblems()
  if (problems.length > 0) {
    console.error('Problems found:\n')
    for (const problem of problems) console.error(`  - ${problem}`)
    console.error('\nFix .env, then RESTART the API server — dotenv reads .env once at startup,')
    console.error('and `node --watch` does not notice changes to it.\n')
    // Keep going anyway when a host is set: the attempt's own error is
    // often more specific than anything guessed from the settings alone.
    if (!config.mail.host) {
      process.exitCode = 1
      await pool.end()
      return
    }
  }

  const to = argument ?? config.mail.user
  if (!to) {
    console.error('No recipient. Pass one: node scripts/send-test-email.mjs you@example.com')
    process.exitCode = 1
    await pool.end()
    return
  }

  console.log(`Sending a test message to ${to} ...\n`)
  try {
    const result = await sendMail({
      to,
      subject: 'PECTRACK test email',
      text: [
        'This is a test message from PECTRACK.',
        '',
        'If you are reading this in a real inbox, SMTP is configured correctly:',
        'admin sign-in codes and password-reset links will be delivered.',
      ].join('\n'),
    })

    if (result.delivered) {
      console.log('Sent. Check the inbox (and the spam folder the first time).')
      console.log('If it arrived, restart the API server and the admin sign-in code will arrive by email too.')
    } else {
      console.log('NOT sent — the message was printed to this console instead.')
      console.log('That is the "SMTP_HOST unset" path in server/lib/mail.js. See the settings above.')
      process.exitCode = 1
    }
  } catch (error) {
    console.error('Sending failed.\n')
    console.error(`  ${error.message}\n`)
    // The three failures that account for almost every case, each with
    // the actual remedy.
    if (error.code === 'EAUTH') {
      console.error('  EAUTH means Gmail rejected the credentials. Almost always one of:')
      console.error('    - SMTP_PASS is an ordinary Gmail password, not a 16-character App Password')
      console.error('    - 2-Step Verification is off on that Google account, so App Passwords do not exist')
      console.error('    - SMTP_USER is not the account the App Password was generated for')
    } else if (error.code === 'ESOCKET' || error.code === 'ETIMEDOUT' || error.code === 'ECONNECTION') {
      console.error('  The connection never completed. Check SMTP_HOST and SMTP_PORT (smtp.gmail.com / 587),')
      console.error('  and whether a firewall or the network blocks outbound port 587.')
    } else if (error.responseCode === 553 || error.responseCode === 550) {
      console.error(`  Gmail refused the From address. It only sends as the authenticated account:`)
      console.error(`  set MAIL_FROM to  PECTRACK <${config.mail.user}>`)
    }
    process.exitCode = 1
  }

  await pool.end()
}

main().catch((error) => {
  console.error('The test failed unexpectedly:', error)
  pool.end()
  process.exit(1)
})
