import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Order, Product } from '@shared/types.js'

/**
 * DELETE MEANS DELETE.
 *
 * Deleting a product used to stamp the row `ARCHIVED` and keep it for ever.
 * Nothing read one again - every list and count filtered
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
    id: 'F2C1043',
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
