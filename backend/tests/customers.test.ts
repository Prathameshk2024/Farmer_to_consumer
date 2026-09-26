import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Order } from '@shared/types.js'
import type { Db } from '../src/db/seed.js'
import {
  addAddress,
  customerIdFor,
  deleteAddress,
  ensureCustomer,
  findCustomer,
  recordOrderCustomer,
  updateAddress,
} from '../src/db/customers.js'

/**
 * These functions carry the whole privacy rule: every one of them takes the
 * customer id the caller is *authenticated as*, and refuses to touch anything
 * filed under a different id. The routes are thin wrappers that pass
 * `req.auth.customerId` straight through, so proving it here proves it there.
 */

function emptyDb(): Db {
  return { sellers: [], products: [], orders: [], payments: [], customers: [] } as unknown as Db
}

const PRIYA = 'c-9011223344'
const ANITA = 'c-9922334455'

function dbWithBoth(): Db {
  const db = emptyDb()
  ensureCustomer(db, PRIYA, '9011223344', 'प्रिया देशमुख')
  ensureCustomer(db, ANITA, '9922334455', 'अनिता कुलकर्णी')
  return db
}

test('derives a customer id from a phone number', () => {
  assert.equal(customerIdFor('9011223344'), 'c-9011223344')
})

test('creates a customer on first use and returns the same one after', () => {
  const db = emptyDb()

  const first = ensureCustomer(db, PRIYA, '9011223344', 'प्रिया देशमुख')
  const second = ensureCustomer(db, PRIYA, '9011223344')

  assert.equal(db.customers.length, 1)
  assert.equal(second.id, first.id)
  assert.equal(second.name, 'प्रिया देशमुख')
})

test('the first address a customer adds becomes her default', () => {
  const db = emptyDb()
  ensureCustomer(db, PRIYA, '9011223344')

  const addr = addAddress(db, PRIYA, { line: 'घर क्र. 12, गणेश नगर', pincode: '413601' })

  assert.ok(addr)
  assert.equal(addr.isDefault, true)
  assert.equal(findCustomer(db, PRIYA)!.addresses.length, 1)
})

test('setting a new default clears the previous one', () => {
  const db = emptyDb()
  ensureCustomer(db, PRIYA, '9011223344')
  const first = addAddress(db, PRIYA, { line: 'पहिला पत्ता', pincode: '413601' })!
  const second = addAddress(db, PRIYA, { line: 'दुसरा पत्ता', pincode: '413603' })!

  updateAddress(db, PRIYA, second.id, { isDefault: true })

  const addrs = findCustomer(db, PRIYA)!.addresses
  assert.equal(addrs.find((a) => a.id === first.id)!.isDefault, false)
  assert.equal(addrs.find((a) => a.id === second.id)!.isDefault, true)
})

test('deleting the last address leaves the customer record intact', () => {
  const db = emptyDb()
  ensureCustomer(db, PRIYA, '9011223344')
  const addr = addAddress(db, PRIYA, { line: 'एकमेव पत्ता', pincode: '413601' })!

  assert.equal(deleteAddress(db, PRIYA, addr.id), true)

  const customer = findCustomer(db, PRIYA)
  assert.ok(customer)
  assert.equal(customer.addresses.length, 0)
})

test('deleting a default address promotes another to default', () => {
  const db = emptyDb()
  ensureCustomer(db, PRIYA, '9011223344')
  const first = addAddress(db, PRIYA, { line: 'पहिला', pincode: '413601' })!
  addAddress(db, PRIYA, { line: 'दुसरा', pincode: '413603' })

  deleteAddress(db, PRIYA, first.id)

  const addrs = findCustomer(db, PRIYA)!.addresses
  assert.equal(addrs.length, 1)
  assert.equal(addrs[0]!.isDefault, true, 'the surviving address should become the default')
})

/* ---------------- the privacy rule ---------------- */

test('a customer cannot read another customer\'s addresses', () => {
  const db = dbWithBoth()
  addAddress(db, ANITA, { line: 'अनिताचा पत्ता', pincode: '413601' })

  assert.deepEqual(findCustomer(db, PRIYA)!.addresses, [])
})

test('a customer cannot edit another customer\'s address', () => {
  const db = dbWithBoth()
  const hers = addAddress(db, ANITA, { line: 'अनिताचा पत्ता', pincode: '413601' })!

  // Priya guesses Anita's address id and tries to overwrite it.
  const result = updateAddress(db, PRIYA, hers.id, { line: 'बदललेला पत्ता' })

  assert.equal(result, null)
  assert.equal(findCustomer(db, ANITA)!.addresses[0]!.line, 'अनिताचा पत्ता')
})

test('a customer cannot delete another customer\'s address', () => {
  const db = dbWithBoth()
  const hers = addAddress(db, ANITA, { line: 'अनिताचा पत्ता', pincode: '413601' })!

  assert.equal(deleteAddress(db, PRIYA, hers.id), false)
  assert.equal(findCustomer(db, ANITA)!.addresses.length, 1)
})

test('operations on an unknown customer do not throw', () => {
  const db = emptyDb()

  assert.equal(updateAddress(db, 'c-0000000000', 'a1', { line: 'x' }), null)
  assert.equal(deleteAddress(db, 'c-0000000000', 'a1'), false)
  assert.equal(findCustomer(db, 'c-0000000000'), undefined)
})

/* ---------------- placing an order records the customer ---------------- */

function orderFrom(over: Partial<Order> = {}): Order {
  return {
    id: 'SMB0001',
    sellerId: 's1',
    customerId: PRIYA,
    customerName: 'प्रिया देशमुख',
    customerPhone: '9011223344',
    address: 'फ्लॅट 302, शिवसागर अपार्टमेंट',
    landmark: 'कॉलेजजवळ',
    pincode: '413601',
    items: [],
    itemsTotal: 0,
    deliveryFee: 0,
    total: 0,
    paymentMode: 'COD',
    paymentStatus: 'PENDING',
    status: 'PLACED',
    placedAt: '2026-09-04T10:00:00.000Z',
    events: [],
    ...over,
  } as Order
}

test('a first order creates the customer and saves the address she used', () => {
  const db = emptyDb()

  recordOrderCustomer(db, orderFrom())

  const customer = findCustomer(db, PRIYA)!
  assert.equal(customer.name, 'प्रिया देशमुख')
  assert.equal(customer.phone, '9011223344')
  assert.equal(customer.addresses.length, 1)
  assert.equal(customer.addresses[0]!.isDefault, true)
})

test('ordering twice to the same address does not duplicate it', () => {
  const db = emptyDb()

  recordOrderCustomer(db, orderFrom())
  recordOrderCustomer(db, orderFrom({ id: 'SMB0002' }))

  assert.equal(findCustomer(db, PRIYA)!.addresses.length, 1)
})

test('ordering to a new address appends it', () => {
  const db = emptyDb()

  recordOrderCustomer(db, orderFrom())
  recordOrderCustomer(db, orderFrom({ id: 'SMB0002', address: 'नवीन पत्ता', pincode: '413603' }))

  assert.equal(findCustomer(db, PRIYA)!.addresses.length, 2)
})

test('an order updates a name we did not have', () => {
  const db = emptyDb()
  ensureCustomer(db, PRIYA, '9011223344')

  recordOrderCustomer(db, orderFrom({ customerName: 'प्रिया देशमुख' }))

  assert.equal(findCustomer(db, PRIYA)!.name, 'प्रिया देशमुख')
})

test('the ग्राहक placeholder never overwrites a real stored name', () => {
  const db = emptyDb()
  ensureCustomer(db, PRIYA, '9011223344', 'प्रिया देशमुख')

  recordOrderCustomer(db, orderFrom({ customerName: 'ग्राहक' }))

  assert.equal(
    findCustomer(db, PRIYA)!.name,
    'प्रिया देशमुख',
    'one anonymous order must not erase the name she gave us',
  )
})
