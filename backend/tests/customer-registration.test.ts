import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Order } from '@shared/types.js'
import type { Db } from '../src/db/seed.js'
import {
  customerIdFor, ensureCustomer, isRegisteredCustomer, PLACEHOLDER_NAME,
  recordOrderCustomer,
} from '../src/db/customers.js'

/**
 * CUSTOMER REGISTRATION = PHONE + OTP + NAME
 * ==========================================
 * The OTP proves whose phone it is. It does not finish an account, because a
 * seller packing an order needs a name to put on it and someone to ask for at
 * the door - and "ग्राहक" is not a name.
 *
 * So login answers two separate questions: is she authenticated (always, once
 * the OTP checks out) and is she REGISTERED. Only the second decides whether
 * she goes to the shop or to the screen that asks her name, and this is the
 * predicate that answers it.
 */

function emptyDb(): Db {
  return { sellers: [], products: [], orders: [], payments: [], customers: [] } as unknown as Db
}

const PHONE = '9011223344'
const ID = customerIdFor(PHONE)

test('a phone that has never been seen is not registered', () => {
  assert.equal(isRegisteredCustomer(emptyDb(), ID), false)
})

test('a record with no name is not registered', () => {
  // This is the state a customer used to be left in for ever: the old login
  // created her row and declared her registered, so she was never asked.
  const db = emptyDb()
  ensureCustomer(db, ID, PHONE)

  assert.equal(db.customers.length, 1)
  assert.equal(isRegisteredCustomer(db, ID), false)
})

test('giving a name completes the registration', () => {
  const db = emptyDb()
  ensureCustomer(db, ID, PHONE)

  ensureCustomer(db, ID, PHONE, 'प्रिया देशमुख')

  assert.equal(isRegisteredCustomer(db, ID), true)
})

test('the checkout placeholder does not count as a registration', () => {
  // An order placed without a name stores ग्राहक. Treating that as registered
  // would mean she is never asked for a real one.
  const db = emptyDb()
  ensureCustomer(db, ID, PHONE, PLACEHOLDER_NAME)

  assert.equal(isRegisteredCustomer(db, ID), false)
})

test('whitespace is not a name', () => {
  const db = emptyDb()
  ensureCustomer(db, ID, PHONE)
  db.customers[0]!.name = '   '

  assert.equal(isRegisteredCustomer(db, ID), false)
})

test('one customer being registered says nothing about another', () => {
  const db = emptyDb()
  ensureCustomer(db, ID, PHONE, 'प्रिया देशमुख')

  assert.equal(isRegisteredCustomer(db, customerIdFor('9922334455')), false)
})

test('a name that arrived with an order counts - she gave it once already', () => {
  // She typed her name at checkout before ever seeing the name screen. Asking
  // again would be the app forgetting something she told it.
  const db = emptyDb()
  const order = {
    id: 'o1',
    sellerId: 's1',
    customerId: ID,
    customerName: 'प्रिया देशमुख',
    customerPhone: PHONE,
    address: 'घर क्र. 12, गणेश नगर',
    pincode: '413601',
    placedAt: new Date().toISOString(),
  } as unknown as Order

  recordOrderCustomer(db, order)

  assert.equal(isRegisteredCustomer(db, ID), true)
})
