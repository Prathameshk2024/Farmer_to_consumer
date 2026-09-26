import { test } from 'node:test'
import assert from 'node:assert/strict'
import { withDefaults } from '../src/db/seed.js'

/**
 * backend/data/db.json was written before customers existed, and a file on
 * someone's disk is not migrated by deploying new code. Loading it must not
 * hand the rest of the app a database whose `customers` is undefined - the
 * first `db.customers.find(...)` would throw on their first request.
 */

test('a database file saved before customers existed still loads', () => {
  const old = {
    sellers: [],
    products: [],
    orders: [],
    payments: [],
    addresses: [{ id: 'a1', label: 'घर', line: 'x', city: 'पुणे', pincode: '413601', isDefault: true }],
  }

  const db = withDefaults(old as never)

  assert.deepEqual(db.customers, [], 'customers must exist as an array, not undefined')
})

test('a completely empty object still yields every collection', () => {
  const db = withDefaults({} as never)

  for (const key of ['sellers', 'products', 'orders', 'payments', 'customers'] as const) {
    assert.ok(Array.isArray(db[key]), `${key} should be an array`)
  }
})

test('existing data is preserved untouched', () => {
  const db = withDefaults({
    sellers: [],
    products: [],
    orders: [],
    payments: [],
    customers: [
      {
        id: 'c-9011223344', phone: '9011223344', name: 'प्रिया देशमुख',
        addresses: [], createdAt: 'x', updatedAt: 'y',
      },
    ],
  } as never)

  assert.equal(db.customers.length, 1)
  assert.equal(db.customers[0]!.name, 'प्रिया देशमुख')
})
