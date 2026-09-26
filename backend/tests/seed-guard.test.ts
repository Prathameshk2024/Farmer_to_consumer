import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emptyDb, seed } from '../src/db/seed.js'

/**
 * A live database must never grow demo sellers on its own.
 *
 * initStore() seeds when it finds nothing stored, which is right for a fresh
 * clone and wrong for production: one transient empty read would put three
 * invented women and eleven invented products in front of real customers.
 * Seeding is opt-in now, and this is the shape it falls back to instead.
 */

test('an empty database has every collection, all of them empty', () => {
  const db = emptyDb()

  for (const key of ['sellers', 'products', 'orders', 'payments', 'customers'] as const) {
    assert.deepEqual(db[key], [], `${key} should be empty`)
  }
})

test('the demo seed is still available when it is explicitly asked for', () => {
  const db = seed()

  assert.ok(db.sellers.length > 0, 'seed() itself is unchanged - only its automatic use is gated')
  assert.ok(db.products.length > 0)
})

test('an empty database is not the demo seed', () => {
  assert.notDeepEqual(emptyDb().sellers, seed().sellers)
})
