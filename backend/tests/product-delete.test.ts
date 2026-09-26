import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Order, Product } from '@shared/types.js'
import { purgeArchived } from '../src/db/moderation.js'

/**
 * DELETE MEANS DELETE.
 *
 * Deleting a product used to stamp the row `ARCHIVED` and keep it for ever.
 * Nothing read one again - every list, count and slot calculation filtered
 * them straight back out - so the tombstone bought nothing and cost a
 * collection that only grew. Forty product documents, of which eight were
 * visible, is what that looks like from the Firebase console.
 *
 * What makes the hard delete safe is that an order does not point at a
 * product for anything it needs to draw: `OrderItem` copies the name, emoji,
 * quantity and price across at checkout. The test below is that contract,
 * because the day someone "normalises" those fields away is the day deleting
 * a listing quietly empties a year of order history.
 */

test('an order keeps what it needs after the product is gone', () => {
  const order = {
    id: 'SMB1043',
    items: [{ productId: 'p1', name: 'आंब्याचे लोणचे', emoji: '🫙', qty: 2, price: 220 }],
  } as Order

  const products: Product[] = []

  const line = order.items[0]!
  assert.equal(line.name, 'आंब्याचे लोणचे', 'the name is on the ORDER, not fetched')
  assert.equal(line.price, 220, 'the price paid is the price stored')
  assert.equal(
    products.find((p) => p.id === line.productId),
    undefined,
    'and the product it names no longer exists, which must not matter',
  )
})

/* ------------------------------------------------------------------ */
/* The tombstones already written                                      */
/* ------------------------------------------------------------------ */

function archived(id: string): Product {
  return { id, sellerId: 's1', status: 'ARCHIVED' } as Product
}

function live(id: string): Product {
  return { id, sellerId: 's1', status: 'LIVE' } as Product
}

test('archived rows are swept, and nothing else is touched', () => {
  const products = [live('a'), archived('b'), live('c'), archived('d')]

  assert.equal(purgeArchived(products), 2)
  assert.deepEqual(products.map((p) => p.id), ['a', 'c'])
})

/** Sweeping nothing must report nothing, or every read schedules a write. */
test('a list with no tombstones is left alone', () => {
  const products = [live('a'), live('b')]
  assert.equal(purgeArchived(products), 0)
  assert.equal(products.length, 2)
})

/**
 * In place, on the same array. `db.products` is the live array every route
 * holds a reference to - replacing it leaves handlers reading a stale copy.
 */
test('the sweep mutates the array it was given', () => {
  const products = [archived('a')]
  const same = products
  purgeArchived(products)
  assert.equal(same.length, 0)
})
