// Integration tests for customer address management (Phase 7 — see
// PHASE7_PLAN.md, Decision 1). Same approach as the rest of the suite:
// real Express app on an ephemeral port, real database. Run with: npm test
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { after, before, describe, test } from 'node:test'
import bcrypt from 'bcrypt'
import app from '../app.js'
import { pool } from '../db.js'

const runId = crypto.randomUUID().slice(0, 8)
const randomContactNumber = () => `09${Math.floor(100000000 + Math.random() * 899999999)}`

describe('customer address management', () => {
  let server
  let baseUrl
  let adminCookie
  let cashierCookie
  let customerCookie
  let customerId
  let secondCustomerCookie
  let secondCustomerId
  const createdUserIds = []
  const createdAddressIds = []

  const admin = { username: `addrtest_admin_${runId}`, password: 'Admin-Only-Password-9!' }
  const cashier = { role: 'CASHIER', name: 'Addr Test Cashier', username: `addrtest_cash_${runId}`, email: `addrtest_cash_${runId}@example.com`, contactNumber: randomContactNumber(), password: 'Cashier-Password-9!' }
  const customer = { name: 'Addr Test Customer', username: `addrtest_cust_${runId}`, email: `addrtest_cust_${runId}@example.com`, contactNumber: randomContactNumber(), password: 'Correct-Horse-Battery-9!' }
  const secondCustomer = { name: 'Second Addr Customer', username: `addrtest_cust2_${runId}`, email: `addrtest_cust2_${runId}@example.com`, contactNumber: randomContactNumber(), password: 'Correct-Horse-Battery-9!' }

  const validAddress = () => ({
    recipientName: 'Juan Dela Cruz',
    contactNumber: randomContactNumber(),
    addressLine1: '123 Rizal Street',
    barangay: 'Poblacion',
  })

  before(async () => {
    server = app.listen(0)
    await new Promise((resolve) => server.once('listening', resolve))
    baseUrl = `http://localhost:${server.address().port}`

    const adminPasswordHash = await bcrypt.hash(admin.password, 4)
    const adminResult = await pool.query(`INSERT INTO users (username, password_hash, user_type) VALUES ($1, $2, 'ADMIN') RETURNING user_id`, [admin.username, adminPasswordHash])
    createdUserIds.push(adminResult.rows[0].user_id)
    await pool.query('INSERT INTO admins (user_id, name, contact_num, email) VALUES ($1, $2, $3, $4)', [adminResult.rows[0].user_id, 'Addr Test Admin', randomContactNumber(), `addrtest_admin_${runId}@example.com`])
    await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: admin.username, password: admin.password }) })
    const rawCode = '112233'
    const challengeToken = `test-challenge-${crypto.randomUUID()}`
    await pool.query(`INSERT INTO otp_codes (user_id, code_hash, challenge_token, expires_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP + INTERVAL '5 minutes')`, [adminResult.rows[0].user_id, crypto.createHash('sha256').update(rawCode).digest('hex'), challengeToken])
    const otpResponse = await fetch(`${baseUrl}/api/auth/verify-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ challengeToken, code: rawCode }) })
    adminCookie = otpResponse.headers.get('set-cookie').split(';')[0]

    const cashierCreate = await fetch(`${baseUrl}/api/staff`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ ...cashier, confirmPassword: cashier.password }) })
    assert.equal(cashierCreate.status, 201)
    const cashierRow = await pool.query('SELECT user_id FROM users WHERE username = $1', [cashier.username])
    createdUserIds.push(cashierRow.rows[0].user_id)
    const cashierLogin = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: cashier.username, password: cashier.password }) })
    cashierCookie = cashierLogin.headers.get('set-cookie').split(';')[0]

    await fetch(`${baseUrl}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...customer, confirmPassword: customer.password }) })
    const customerRow = await pool.query('SELECT user_id, (SELECT customer_id FROM customers WHERE user_id = users.user_id) AS customer_id FROM users WHERE username = $1', [customer.username])
    createdUserIds.push(customerRow.rows[0].user_id)
    customerId = customerRow.rows[0].customer_id
    const customerLogin = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: customer.username, password: customer.password }) })
    customerCookie = customerLogin.headers.get('set-cookie').split(';')[0]

    await fetch(`${baseUrl}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...secondCustomer, confirmPassword: secondCustomer.password }) })
    const secondCustomerRow = await pool.query('SELECT user_id, (SELECT customer_id FROM customers WHERE user_id = users.user_id) AS customer_id FROM users WHERE username = $1', [secondCustomer.username])
    createdUserIds.push(secondCustomerRow.rows[0].user_id)
    secondCustomerId = secondCustomerRow.rows[0].customer_id
    const secondCustomerLogin = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: secondCustomer.username, password: secondCustomer.password }) })
    secondCustomerCookie = secondCustomerLogin.headers.get('set-cookie').split(';')[0]
  })

  after(async () => {
    await pool.query('DELETE FROM customer_addresses WHERE customer_id = ANY($1)', [[customerId, secondCustomerId]]).catch(() => {})
    await pool.query('DELETE FROM otp_codes WHERE user_id = ANY($1)', [createdUserIds]).catch(() => {})
    await pool.query('DELETE FROM sessions WHERE user_id = ANY($1)', [createdUserIds]).catch(() => {})
    for (const table of ['admins', 'cashiers', 'customers']) {
      await pool.query(`DELETE FROM ${table} WHERE user_id = ANY($1)`, [createdUserIds]).catch(() => {})
    }
    await pool.query('DELETE FROM users WHERE user_id = ANY($1)', [createdUserIds]).catch(() => {})
    await new Promise((resolve) => server.close(resolve))
  })

  const createAddress = async (body, cookie = customerCookie) => {
    const response = await fetch(`${baseUrl}/api/addresses`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(body) })
    if (response.status === 201) createdAddressIds.push((await response.clone().json()).address.id)
    return response
  }

  test('GET /api/addresses requires authentication', async () => {
    const response = await fetch(`${baseUrl}/api/addresses`)
    assert.equal(response.status, 401)
  })

  test('a customer creating their first address gets it auto-defaulted', async () => {
    const response = await createAddress(validAddress())
    assert.equal(response.status, 201)
    const body = await response.json()
    assert.equal(body.address.isDefault, true, 'the first address must become the default automatically')
    assert.equal(body.address.isActive, true)
    assert.equal(body.address.municipality, 'Lucban', 'unspecified municipality should fall back to the schema default')
    assert.equal(body.address.province, 'Quezon')
  })

  test('a second address is NOT default unless explicitly requested, and setting it clears the first', async () => {
    const second = await createAddress({ ...validAddress(), label: 'Work' })
    assert.equal(second.status, 201)
    const secondBody = await second.json()
    assert.equal(secondBody.address.isDefault, false, 'a second address must not silently steal default status')

    const third = await createAddress({ ...validAddress(), label: 'Girlfriend\'s house', isDefault: true })
    assert.equal(third.status, 201)
    const thirdBody = await third.json()
    assert.equal(thirdBody.address.isDefault, true)

    const list = await (await fetch(`${baseUrl}/api/addresses`, { headers: { Cookie: customerCookie } })).json()
    const defaults = list.addresses.filter((a) => a.isDefault)
    assert.equal(defaults.length, 1, 'exactly one address may be default at a time')
    assert.equal(defaults[0].id, thirdBody.address.id)
  })

  test('a customer sees and edits only their own addresses — another customer\'s address 404s', async () => {
    const mine = await createAddress(validAddress())
    const mineId = (await mine.json()).address.id

    const theirs = await createAddress(validAddress(), secondCustomerCookie)
    const theirsId = (await theirs.json()).address.id

    const listAsMe = await (await fetch(`${baseUrl}/api/addresses`, { headers: { Cookie: customerCookie } })).json()
    assert.ok(listAsMe.addresses.some((a) => a.id === mineId))
    assert.ok(!listAsMe.addresses.some((a) => a.id === theirsId), 'must never see another customer\'s address')

    const patchTheirs = await fetch(`${baseUrl}/api/addresses/${theirsId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: customerCookie }, body: JSON.stringify({ label: 'Hijacked' }) })
    assert.equal(patchTheirs.status, 404, 'editing someone else\'s address must 404, not reveal it exists via 403')
  })

  test('staff must specify customerId — GET without one is 422, POST without one is 422', async () => {
    const getResponse = await fetch(`${baseUrl}/api/addresses`, { headers: { Cookie: cashierCookie } })
    assert.equal(getResponse.status, 422)

    const postResponse = await fetch(`${baseUrl}/api/addresses`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cashierCookie }, body: JSON.stringify(validAddress()) })
    assert.equal(postResponse.status, 422)
  })

  test('a cashier can create and view an address on behalf of a customer taking a phone order', async () => {
    const created = await createAddress({ ...validAddress(), customerId: secondCustomerId }, cashierCookie)
    assert.equal(created.status, 201)
    const body = await created.json()
    assert.equal(body.address.customerId, secondCustomerId)

    const list = await (await fetch(`${baseUrl}/api/addresses?customerId=${secondCustomerId}`, { headers: { Cookie: cashierCookie } })).json()
    assert.ok(list.addresses.some((a) => a.id === body.address.id))
  })

  test('a cashier supplying a nonexistent customerId is refused with 422', async () => {
    const response = await createAddress({ ...validAddress(), customerId: 999999999 }, cashierCookie)
    assert.equal(response.status, 422)
  })

  test('POST rejects missing required fields', async () => {
    const response = await createAddress({ recipientName: '', addressLine1: '' })
    assert.equal(response.status, 422)
    const body = await response.json()
    assert.ok(body.errors.recipientName)
    assert.ok(body.errors.addressLine1)
  })

  test('POST rejects an invalid contact number', async () => {
    const response = await createAddress({ ...validAddress(), contactNumber: '123' })
    assert.equal(response.status, 422)
    assert.ok((await response.json()).errors.contactNumber)
  })

  test('a malformed or nonexistent address id is treated as "not found"', async () => {
    for (const badId of ['abc', 'undefined', '1.5', '999999999999999999999', '999999999']) {
      const response = await fetch(`${baseUrl}/api/addresses/${badId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: customerCookie }, body: JSON.stringify({ label: 'x' }) })
      assert.equal(response.status, 404, `id "${badId}"`)
    }
  })

  // The partial unique index is `WHERE is_default AND is_active`, so a row
  // that is default but INACTIVE is invisible to it and violates nothing.
  // That made "set a deactivated address as the default" a way to clear
  // the customer's real default (the UPDATE does that unconditionally) and
  // park the flag somewhere the database cannot see it — leaving them with
  // NO active default and a stale one waiting to spring back on
  // reactivation. This is the one case where the application check IS the
  // enforcement, so it gets its own test.
  test('a deactivated address cannot be made the default, and the real default survives the attempt', async () => {
    const active = (await (await createAddress({ ...validAddress(), label: 'Still Active' }, customerCookie)).json()).address
    const retired = (await (await createAddress({ ...validAddress(), label: 'Retired' }, customerCookie)).json()).address
    await fetch(`${baseUrl}/api/addresses/${retired.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: customerCookie }, body: JSON.stringify({ isActive: false }) })
    await fetch(`${baseUrl}/api/addresses/${active.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: customerCookie }, body: JSON.stringify({ isDefault: true }) })

    const attempt = await fetch(`${baseUrl}/api/addresses/${retired.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: customerCookie }, body: JSON.stringify({ isDefault: true }) })
    assert.equal(attempt.status, 422, 'a deactivated address must not be settable as the default')

    const rows = await pool.query('SELECT address_id, is_default, is_active FROM customer_addresses WHERE customer_id = $1', [customerId])
    const activeDefaults = rows.rows.filter((row) => row.is_default && row.is_active)
    assert.equal(activeDefaults.length, 1, 'the customer must still have exactly one ACTIVE default')
    assert.equal(String(activeDefaults[0].address_id), String(active.id), 'and it must still be the one they actually chose')
    assert.ok(!rows.rows.some((row) => row.is_default && !row.is_active), 'no default flag may be parked on an inactive row')
  })

  // isActive was validated on POST and then silently dropped from the
  // INSERT — and worse, the auto-default of a customer's FIRST address
  // ignored it too, so creating an inactive first address produced exactly
  // the default-on-an-inactive-row state the rule above forbids.
  test('creating an inactive address honours isActive and never auto-defaults it', async () => {
    const created = (await (await createAddress({ ...validAddress(), label: 'Born Retired', isActive: false }, secondCustomerCookie)).json()).address
    assert.equal(created.isActive, false, 'isActive must be honoured, not silently discarded')
    assert.equal(created.isDefault, false, 'an inactive address must never be auto-defaulted')
  })

  test('deactivating an address clears its default flag, and it disappears from the default (active-only) list', async () => {
    const created = await createAddress({ ...validAddress(), isDefault: true })
    const addressId = (await created.json()).address.id

    const beforeList = await (await fetch(`${baseUrl}/api/addresses`, { headers: { Cookie: customerCookie } })).json()
    assert.ok(beforeList.addresses.some((a) => a.id === addressId))

    const deactivated = await fetch(`${baseUrl}/api/addresses/${addressId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: customerCookie }, body: JSON.stringify({ isActive: false }) })
    assert.equal(deactivated.status, 200)
    const deactivatedBody = await deactivated.json()
    assert.equal(deactivatedBody.address.isActive, false)
    assert.equal(deactivatedBody.address.isDefault, false, 'an inactive address must not still claim to be the default')

    const afterList = await (await fetch(`${baseUrl}/api/addresses`, { headers: { Cookie: customerCookie } })).json()
    assert.ok(!afterList.addresses.some((a) => a.id === addressId), 'a deactivated address must disappear from the default (active-only) picker')

    const includingInactive = await (await fetch(`${baseUrl}/api/addresses?includeInactive=true`, { headers: { Cookie: customerCookie } })).json()
    assert.ok(includingInactive.addresses.some((a) => a.id === addressId), 'includeInactive=true must still show it — deactivated, not deleted')
  })

  // The route's own customer-row lock (POST /'s comment explains why) is
  // what serializes this in normal operation. This proves the SECOND,
  // independent layer: migration-free though it is, the partial unique
  // index customer_addresses_one_default_per_customer is what actually
  // makes "at most one default" true even if the lock were ever bypassed
  // — driven directly through two concurrent transactions, bypassing the
  // route (and therefore its lock) entirely, the same technique
  // inventory.test.js uses for "the database itself refuses a second
  // pending row".
  test('the database itself refuses a second default address, even when the route\'s own lock is bypassed', async () => {
    const thirdCustomer = { name: 'Third Addr Customer', username: `addrtest_cust3_${runId}`, email: `addrtest_cust3_${runId}@example.com`, contactNumber: randomContactNumber(), password: 'Correct-Horse-Battery-9!' }
    await fetch(`${baseUrl}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...thirdCustomer, confirmPassword: thirdCustomer.password }) })
    const thirdRow = await pool.query('SELECT user_id, (SELECT customer_id FROM customers WHERE user_id = users.user_id) AS customer_id FROM users WHERE username = $1', [thirdCustomer.username])
    createdUserIds.push(thirdRow.rows[0].user_id)
    const thirdCustomerId = thirdRow.rows[0].customer_id

    const insertDefault = (client, label) => client.query(
      `INSERT INTO customer_addresses (customer_id, label, recipient_name, contact_num, address_line_1, is_default)
       VALUES ($1, $2, 'Race Tester', $3, '1 Race St', TRUE)`,
      [thirdCustomerId, label, randomContactNumber()],
    )

    const first = await pool.connect()
    const second = await pool.connect()
    try {
      await first.query('BEGIN')
      await second.query('BEGIN')

      await insertDefault(first, 'First')
      // Started, not awaited — blocks on the index until `first` commits.
      const contended = insertDefault(second, 'Second')
      await first.query('COMMIT')

      await assert.rejects(contended, (error) => error.code === '23505' && error.constraint === 'customer_addresses_one_default_per_customer', 'the second default row must be refused by the unique index')
      await second.query('ROLLBACK')
    } finally {
      first.release()
      second.release()
    }

    const remaining = (await pool.query(`SELECT COUNT(*)::int AS n FROM customer_addresses WHERE customer_id = $1 AND is_default = TRUE AND is_active = TRUE`, [thirdCustomerId])).rows[0].n
    assert.equal(remaining, 1, 'exactly one default address may survive two concurrent inserts')
  })
})
