// ============================================================================
// PECTRACK API — lib/accounts.js (annotated for learning)
// The account-creation logic shared by self-registration (routes/auth.js)
// and admin-created staff accounts (routes/staff.js): the bcrypt cost
// setting, and the cross-role-table duplicate check. Both routes insert
// into `users` plus one role-specific table inside their own transaction —
// what's identical between them lives here.
// ============================================================================

// bcrypt "rounds" controls how many times the hashing algorithm loops —
// higher = slower to compute = harder to brute-force, but also slower for
// your own server to check logins. 12 is a solid, commonly recommended
// default in 2024+ (roughly ~250ms per hash on typical hardware). Both
// account-creation routes hash their password with this same cost.
export const bcryptRounds = 12

// Maps every role to its profile table. Staff creation (routes/staff.js)
// only ever needs two of these (its own staffRoleTables, deliberately a
// separate, narrower whitelist) — this full version exists for code that
// genuinely needs to handle any of the four roles generically, like
// PATCH /api/auth/me, which edits whichever table the CURRENT user
// happens to belong to without caring in advance which one that is.
export const roleTables = {
  ADMIN: 'admins',
  CASHIER: 'cashiers',
  CUSTOMER: 'customers',
  DELIVERY_PERSONNEL: 'delivery_personnel',
}

// Checked across every role table, not just one. Why: email uniqueness
// isn't enforced by a single database-wide constraint — each role table
// (admins, cashiers, customers, delivery_personnel) only has its OWN
// UNIQUE(email). Without this check, the same email could exist as both a
// customer AND a cashier, and the login query (which checks all four role
// tables) would then match TWO rows for one identifier — an ambiguous,
// broken login.
//
// Takes a `client`, not the shared `pool`, because the caller runs this
// INSIDE its own BEGIN/COMMIT transaction — it must run on that exact
// same reserved connection, not a different one borrowed from the pool.
//
// excludeUserId (added when staff/customer EDITING was built, not just
// creation) lets an account update its own email/contact number without
// that update falsely flagging itself as a duplicate of... itself. Every
// branch below is guarded by `($4::bigint IS NULL OR user_id != $4)` —
// when excludeUserId is null (the original creation-only callers), that
// condition is always true and behaves exactly as before; when it's a
// real id, rows belonging to that id are skipped. A field left as null
// (e.g. an edit that isn't touching contactNumber) simply never matches —
// `contact_num = NULL` is never true in SQL — so passing null for an
// unchanged field correctly skips checking it too.
export async function findDuplicateAccount(client, { username, email, contactNumber }, excludeUserId = null) {
  const result = await client.query(
    `SELECT 1 FROM users WHERE LOWER(username) = $1 AND ($4::bigint IS NULL OR user_id != $4)
     UNION ALL
     SELECT 1 FROM customers WHERE (LOWER(email) = $2 OR contact_num = $3) AND ($4::bigint IS NULL OR user_id != $4)
     UNION ALL
     SELECT 1 FROM admins WHERE LOWER(email) = $2 AND ($4::bigint IS NULL OR user_id != $4)
     UNION ALL
     SELECT 1 FROM cashiers WHERE LOWER(email) = $2 AND ($4::bigint IS NULL OR user_id != $4)
     UNION ALL
     SELECT 1 FROM delivery_personnel WHERE LOWER(email) = $2 AND ($4::bigint IS NULL OR user_id != $4)
     LIMIT 1`,
    [username, email, contactNumber, excludeUserId],
  )
  // rowCount > 0 turns "did any of those five SELECTs find a match" into a
  // plain boolean, so callers can write `if (await findDuplicateAccount(...))`
  // instead of poking at a query result object themselves.
  return result.rowCount > 0
}
