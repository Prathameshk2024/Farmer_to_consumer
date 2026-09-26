import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Product } from '@shared/types.js'
import { purgeRejected } from '../src/db/moderation.js'

/**
 * A REJECTION IS A REMOVAL, THE MOMENT IT IS MADE.
 *
 * A rejected listing used to stay in her app for 48 hours so that she could
 * read the reason on the row itself, and a sweeper took it afterwards. That
 * made sense while a rejected listing still held her slot. It no longer does:
 * the slot frees at the moment of the decision, so the grace period left a
 * refused listing sitting on her screen beside the new one she had already
 * put in its place - two listings for one slot, one of them dead.
 *
 * `POST /admin/products/:id/moderate` now deletes on rejection, and the reason
 * reaches her as a notice, where she reads every other admin decision. What is
 * left here is the sweep that clears rows rejected under the old rule.
 */

function product(over: Partial<Product> = {}): Product {
  return { id: 'p1', sellerId: 's1', name: 'लोणचे', status: 'LIVE', ...over } as Product
}

test('a rejected row left by the old rule is swept', () => {
  const products = [
    product({ id: 'live' }),
    product({ id: 'old-rejection', status: 'REJECTED', rejectedAt: '2026-09-08T12:00:00.000Z' }),
    product({ id: 'draft', status: 'DRAFT' }),
  ]

  assert.equal(purgeRejected(products, () => {}), 1)
  assert.deepEqual(products.map((p) => p.id), ['live', 'draft'])
})

/**
 * A rejection with no stamp was swept only once the old clock could read it,
 * which meant never. Nothing is waiting on a timestamp any more.
 */
test('an unstamped rejection goes too', () => {
  const products = [product({ id: 'unstamped', status: 'REJECTED' })]
  assert.equal(purgeRejected(products, () => {}), 1)
  assert.equal(products.length, 0)
})

/**
 * The row is the only record of the image's public id. A photo left behind is
 * one nobody can ever find to delete - Cloudinary storage paid for ever.
 */
test('the photograph goes with the row', () => {
  const destroyed: (string | undefined)[] = []
  const products = [
    product({ id: 'r1', status: 'REJECTED', imagePublicId: 'shanta/p1' }),
    product({ id: 'live', imagePublicId: 'shanta/keep' }),
  ]

  purgeRejected(products, (id) => destroyed.push(id))

  assert.deepEqual(destroyed, ['shanta/p1'])
  assert.deepEqual(products.map((p) => p.id), ['live'], 'and nothing else is touched')
})

/** Sweeping nothing must report nothing, or every read schedules a write. */
test('a list with nothing to sweep is left alone', () => {
  const products = [product({ id: 'a' }), product({ id: 'b', status: 'PENDING' })]
  assert.equal(purgeRejected(products, () => {}), 0)
  assert.equal(products.length, 2)
})

/**
 * In place, on the same array: `db.products` is the live array every route
 * holds a reference to - replacing it leaves handlers reading a stale copy.
 */
test('the sweep mutates the array it was given', () => {
  const products = [product({ id: 'r', status: 'REJECTED' })]
  const same = products
  purgeRejected(products, () => {})
  assert.equal(same.length, 0)
})
