// Which of the recent migrations a local database is missing — read-only.
// After a `git pull`, run:
//
//   node scripts/check-migrations.mjs
//
// It prints the psql command for each missing one, in the order to run
// them. The repo has no migration table, so each is recognised by what it
// creates. 030 and 031 only fix old rows, so running them again is
// harmless.
import { pool } from '../server/db.js'

const exists = async (sql, params = []) => (await pool.query(sql, params)).rowCount > 0
const column = (table, name) => exists('SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2', [table, name])
const table = (name) => exists('SELECT 1 FROM information_schema.tables WHERE table_name = $1', [name])
const enumValue = (type, value) => exists('SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = $1 AND e.enumlabel = $2', [type, value])

const checks = [
  ['024_daily_order_numbers', () => column('orders', 'order_day')],
  ['025_ingredient_stock', () => table('ingredients')],
  ['026_customer_first_last_name', () => column('customers', 'first_name')],
  ['027_remove_bulk_order_approval', async () => !(await column('orders', 'requires_admin_approval'))],
  ['028_system_actions', () => exists(`SELECT 1 FROM information_schema.columns WHERE table_name = 'order_status_history' AND column_name = 'updated_by' AND is_nullable = 'YES'`)],
  ['029_payment_first_statuses', () => enumValue('order_status', 'READY_FOR_DELIVERY')],
  ['030_paid_orders_ready', () => enumValue('order_status', 'READY_FOR_DELIVERY')],
  ['031_failed_deliveries_requeued', () => exists(`SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM deliveries d JOIN orders o ON o.order_id = d.order_id WHERE d.status = 'FAILED' AND o.status NOT IN ('COMPLETED', 'CANCELLED'))`)],
  ['032_phone_codes_and_reservations', () => table('phone_verifications')],
  ['033_trusted_devices', () => table('trusted_devices')],
  ['034_cash_tendered', () => column('payments', 'amount_tendered')],
  ['035_soft_hard_breads', () => column('products', 'stock_type')],
  ['036_events', () => table('events')],
  ['037_payment_mode', () => column('orders', 'payment_mode')],
]

const missing = []
for (const [name, check] of checks) {
  let applied = false
  try {
    applied = await check()
  } catch {
    applied = false
  }
  console.log(`${applied ? 'ok     ' : 'MISSING'}  ${name}`)
  if (!applied) missing.push(name)
}
// 030 rides on 029: if 029 was missing, 030 must run right after it.
if (missing.includes('029_payment_first_statuses') && !missing.includes('030_paid_orders_ready')) missing.splice(missing.indexOf('029_payment_first_statuses') + 1, 0, '030_paid_orders_ready')

if (missing.length === 0) console.log('\nThis database is up to date.')
else {
  console.log('\nRun these, in this order (from the project folder):\n')
  for (const name of missing) console.log(`  psql -U postgres -d pectrack -v ON_ERROR_STOP=1 -f database/migrations/${name}.sql`)
}
await pool.end()
