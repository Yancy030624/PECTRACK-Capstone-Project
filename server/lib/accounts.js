// Shared account-creation helpers — used by both self-registration
// (routes/auth.js) and admin-created staff accounts (routes/staff.js).

export const bcryptRounds = 12

// Maps every role to its profile table. Used by self-service profile
// editing (PATCH /api/auth/me), which needs to update whichever table the
// requesting user's own role lives in, regardless of which role that is —
// unlike routes/staff.js's own narrower map, which deliberately only
// covers the two roles an admin is allowed to create.
export const roleTables = {
  ADMIN: 'admins',
  CASHIER: 'cashiers',
  CUSTOMER: 'customers',
  DELIVERY_PERSONNEL: 'delivery_personnel',
}

// Checked across every role table, not just one, because email uniqueness
// isn't enforced by a single database-wide constraint — each role table
// only has its OWN UNIQUE(email). Must run on the same `client` as the
// transaction that follows it, so pass the connection in rather than using
// the shared pool directly.
//
// excludeUserId lets an EDIT (not just creation) reuse this same check:
// when updating an existing account's own email/contact number, that
// account's own rows shouldn't count as a "duplicate" of itself. Any
// field left as null (e.g. an edit that isn't touching contactNumber)
// simply never matches — `contact_num = NULL` is never true in SQL — so
// passing null for an unchanged field correctly skips checking it.
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
  return result.rowCount > 0
}
