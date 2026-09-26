import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Order } from '@shared/types.js'

process.env.SESSION_SECRET = 'test-secret-for-unit-tests'
const { emptyDb } = await import('../src/db/seed.js')
const { customerIdFor, PLACEHOLDER_NAME, recordOrderCustomer, registerCustomer } =
  await import('../src/db/customers.js')
const { checkPassword, setCredential } = await import('../src/auth/credentials.js')

/**
 * CUSTOMER REGISTRATION = PHONE + NAME + PASSWORD, ONE SCREEN
 * ===========================================================
 * `registerCustomer` is the body of POST /customers/register; the route only
 * adds the rate limit and the session. The name is required because a farmer
 * packing an order needs a name to put on it - and "ग्राहक" is not a name.
 */

const PHONE = '9011223344'
const ID = customerIdFor(PHONE)
const body = (over: Record<string, unknown> = {}) =>
  ({ phone: PHONE, name: 'प्रिया देशमुख', password: '482913', ...over })

test('a phone, a name and a password make an account she can sign in to', () => {
  const db = emptyDb()
  const r = registerCustomer(db, body())

  assert.equal(r.status, 201)
  assert.equal(db.customers.length, 1)
  assert.equal(db.customers[0]!.id, ID)
  assert.equal(db.customers[0]!.name, 'प्रिया देशमुख')
  assert.equal(checkPassword(db, 'customer', PHONE, '482913')?.userId, ID)
})

test('the password is never on the customer row', () => {
  const db = emptyDb()
  registerCustomer(db, body())
  assert.ok(!JSON.stringify(db.customers).includes('scrypt$'))
  assert.ok(!JSON.stringify(db.customers).includes('482913'))
})

test('a bad phone, no name or a short password is refused and nothing is stored', () => {
  const db = emptyDb()
  const r = registerCustomer(db, body({ phone: '12345', name: '   ', password: '123' }))

  assert.equal(r.status, 400)
  assert.ok(r.status === 400 && r.body.fields?.phone && r.body.fields.name && r.body.fields.password)
  assert.equal(db.customers.length, 0)
  assert.equal(db.credentials.length, 0)
})

test('the checkout placeholder is not a name', () => {
  const db = emptyDb()
  assert.equal(registerCustomer(db, body({ name: PLACEHOLDER_NAME })).status, 400)
})

test('a number that already has a buyer password is refused, typed any way', () => {
  const db = emptyDb()
  registerCustomer(db, body())
  const again = registerCustomer(db, body({ phone: '+91 90112 23344', password: '999999' }))

  assert.equal(again.status, 409)
  assert.equal(checkPassword(db, 'customer', PHONE, '482913')?.userId, ID, 'the first password still works')
})

test('a farmer password on the same number does not block a buyer account', () => {
  const db = emptyDb()
  setCredential(db, { role: 'farmer', userId: 'f1', phone: PHONE, password: '111111' })
  assert.equal(registerCustomer(db, body()).status, 201)
})

test('a buyer who ordered before registering keeps her row and its addresses', () => {
  const db = emptyDb()
  recordOrderCustomer(db, {
    id: 'o1', farmerId: 's1', customerId: ID, customerName: PLACEHOLDER_NAME, customerPhone: PHONE,
    address: 'घर क्र. 12, गणेश नगर', pincode: '413601', placedAt: new Date().toISOString(),
  } as unknown as Order)

  assert.equal(registerCustomer(db, body()).status, 201)
  assert.equal(db.customers.length, 1)
  assert.equal(db.customers[0]!.name, 'प्रिया देशमुख')
  assert.equal(db.customers[0]!.addresses.length, 1)
})
