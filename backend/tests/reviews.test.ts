import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Order, OrderStatus, Review } from '@shared/types.js'
import {
  REVIEW_COMMENT_MAX, REVIEW_WINDOW_DAYS, canReview, needsRating, publicName, ratingsProblem,
  reviewProblem, summarizeReviews, toPublicReview,
} from '@shared/review.js'
import {
  ordersToRate, productReviewsFor, ratingsByProduct, ratingsBySeller, sellerProductReviews,
  sellerRating, splitOrderReviews,
  writeRatings,
} from '../src/db/reviews.js'

/**
 * RATING WHAT ARRIVED.
 *
 * Once an order is delivered, the buyer rates every product in it - stars
 * required, words optional - before the app lets them do anything else. The
 * ratings belong to the products; a seller's rating is her products' ratings
 * taken together.
 */

const DAY = 86_400_000
const DELIVERED_AT = '2026-09-10T10:00:00.000Z'

function order(status: OrderStatus = 'DELIVERED', id = 'SMB1234'): Order {
  return {
    id,
    sellerId: 's1',
    customerId: 'c-9876543210',
    customerName: 'सविता भोसले',
    status,
    placedAt: '2026-09-08T10:00:00.000Z',
    items: [
      { productId: 'p1', name: 'आंबा लोणचे', emoji: '🫙', qty: 1, price: 120 },
      { productId: 'p2', name: 'पापड', emoji: '🥠', qty: 2, price: 60 },
    ],
    events: [
      { to: 'PLACED', at: '2026-09-08T10:00:00.000Z', by: 'customer' },
      ...(status === 'DELIVERED' ? [{ to: 'DELIVERED' as const, at: DELIVERED_AT, by: 'seller' as const }] : []),
    ],
  } as Order
}

const both = [{ productId: 'p1', rating: 5 }, { productId: 'p2', rating: 3, comment: 'थोडे तुटलेले' }]
const soon = new Date(new Date(DELIVERED_AT).getTime() + 2 * DAY)

test('only a delivered order can be rated - a rival with no order has nothing to rate', () => {
  for (const s of ['PLACED', 'ACCEPTED', 'PACKED', 'OUT_FOR_DELIVERY', 'CANCELLED', 'REJECTED'] as const) {
    const db = { reviews: [] as Review[] }
    assert.equal(writeRatings(db, order(s), both, soon).ok, false, s)
    assert.equal(db.reviews.length, 0)
  }
})

test('each product on the order gets its own review, named after the product', () => {
  const db = { reviews: [] as Review[] }
  const r = writeRatings(db, order(), both, soon)
  assert.ok(r.ok)
  assert.deepEqual(
    db.reviews.map((x) => [x.productId, x.productName, x.rating, x.comment]).sort(),
    [['p1', 'आंबा लोणचे', 5, undefined], ['p2', 'पापड', 3, 'थोडे तुटलेले']],
  )
})

/** All at once is what makes the gate one screen, and what lets it close. */
test('every product must be rated, once, and nothing that was not on the order', () => {
  const o = order()
  assert.notEqual(ratingsProblem(o, [{ productId: 'p1', rating: 5 }]), null)
  assert.notEqual(ratingsProblem(o, [...both, { productId: 'p1', rating: 4 }]), null)
  assert.notEqual(ratingsProblem(o, [...both, { productId: 'pX', rating: 4 }]), null)
  assert.notEqual(ratingsProblem(o, [{ productId: 'p1', rating: 5 }, { productId: 'p2', rating: 0 }]), null)
  assert.notEqual(ratingsProblem(o, undefined), null)
  assert.equal(ratingsProblem(o, both), null)
  // Nothing is written when any of it is wrong.
  const db = { reviews: [] as Review[] }
  assert.equal(writeRatings(db, o, [{ productId: 'p1', rating: 5 }], soon).ok, false)
  assert.equal(db.reviews.length, 0)
})

test('a product listed twice on one order is rated once', () => {
  const o = order()
  o.items.push({ ...o.items[0]!, qty: 3 })
  assert.equal(ratingsProblem(o, both), null)
})

test('the stars must be a whole number from one to five; words are optional and capped', () => {
  for (const bad of [0, 6, 3.5, '5', null, undefined]) {
    assert.notEqual(reviewProblem(bad, undefined), null, String(bad))
  }
  assert.equal(reviewProblem(1, ''), null)
  assert.notEqual(reviewProblem(3, 'x'.repeat(REVIEW_COMMENT_MAX + 1)), null)
})

test('rating again replaces the review of that product on that order', () => {
  const db = { reviews: [] as Review[] }
  writeRatings(db, order(), both, soon)
  writeRatings(db, order(), [{ productId: 'p1', rating: 2 }, { productId: 'p2', rating: 4 }], soon)
  assert.equal(db.reviews.length, 2)
  assert.equal(db.reviews.find((r) => r.productId === 'p1')!.rating, 2)
  assert.ok(db.reviews.every((r) => r.updatedAt))
})

/**
 * What the gate asks. An order waits until every product on it is rated, and
 * only inside the window - an old order does not stop anybody at the door.
 */
test('an order needs rating until every product is rated, and only for a month', () => {
  const o = order()
  const at = new Date(DELIVERED_AT).getTime()
  assert.equal(needsRating(o, [], at + DAY), true)
  assert.equal(needsRating(o, [{ orderId: o.id, productId: 'p1' }], at + DAY), true)
  assert.equal(needsRating(o, [{ orderId: o.id, productId: 'p1' }, { orderId: o.id, productId: 'p2' }], at + DAY), false)
  assert.equal(needsRating(o, [], at + (REVIEW_WINDOW_DAYS + 1) * DAY), false)
  assert.equal(needsRating(order('OUT_FOR_DELIVERY'), [], at + DAY), false)
  assert.equal(canReview(o, at + REVIEW_WINDOW_DAYS * DAY), true)
})

test('the orders still to rate, newest first, and none once they are rated', () => {
  const a = order('DELIVERED', 'A')
  const b = { ...order('DELIVERED', 'B'), placedAt: '2026-09-09T10:00:00.000Z' }
  const db = { reviews: [] as Review[] }
  const now = soon.getTime()
  assert.deepEqual(ordersToRate(db, [a, b, order('PACKED', 'C')], now), ['B', 'A'])
  writeRatings(db, a, both, soon)
  writeRatings(db, b, both, soon)
  assert.deepEqual(ordersToRate(db, [a, b], now), [])
})

test('a review is shown under the first name only, with no buyer or seller id', () => {
  const db = { reviews: [] as Review[] }
  const r = writeRatings(db, order(), both, soon)
  assert.ok(r.ok)
  assert.equal(r.reviews[0]!.customerName, 'सविता')
  assert.equal(publicName('ग्राहक'), '')
  const pub = toPublicReview({ ...r.reviews[0]!, hidden: true, hiddenReason: 'phone number' })
  for (const secret of ['customerId', 'sellerId', 'hiddenReason']) assert.equal(secret in pub, false)
})

test('a product shows its own stars; hidden reviews leave both the list and the average', () => {
  const db = { reviews: [] as Review[] }
  writeRatings(db, order('DELIVERED', 'A'), both, soon)
  writeRatings(db, order('DELIVERED', 'B'), [{ productId: 'p1', rating: 1 }, { productId: 'p2', rating: 3 }], soon)
  db.reviews.find((r) => r.orderId === 'B' && r.productId === 'p1')!.hidden = true

  const p1 = productReviewsFor(db, 'p1')
  assert.deepEqual(p1.reviews.map((r) => r.orderId), ['A'])
  assert.deepEqual(p1.summary, { average: 5, count: 1, byStars: [0, 0, 0, 0, 1] })
  assert.equal(ratingsByProduct(db).get('p2')?.count, 2)
  // Her own list: every visible review of her products, nothing hidden.
  assert.equal(sellerProductReviews(db, 's1').length, 3)
})

test('the average is rounded to one decimal place, and zero with nothing to average', () => {
  assert.deepEqual(summarizeReviews([]), { average: 0, count: 0, byStars: [0, 0, 0, 0, 0] })
  assert.equal(summarizeReviews([{ rating: 5 }, { rating: 4 }, { rating: 4 }]).average, 4.3)
})

/**
 * Reviews from when a whole order got one rating. The buyer said it about
 * everything in the order, so each product gets it - and nothing is deleted.
 */
test('an old whole-order review becomes one review per product, once', () => {
  const legacy = {
    id: 'rv1', orderId: 'SMB1234', sellerId: 's1', customerId: 'c-1', customerName: 'सविता',
    rating: 4, comment: 'छान', createdAt: '2026-09-11T00:00:00.000Z',
    items: [{ productId: 'p1', name: 'आंबा लोणचे' }, { productId: 'p2', name: 'पापड' }],
  } as unknown as Review
  const db = { reviews: [legacy], orders: [order()] }

  assert.equal(splitOrderReviews(db), 1)
  assert.equal(db.reviews.length, 2)
  assert.equal(db.reviews[0]!.id, 'rv1')
  assert.deepEqual(db.reviews.map((r) => [r.productId, r.rating, r.comment]), [['p1', 4, 'छान'], ['p2', 4, 'छान']])
  assert.equal('items' in db.reviews[0]!, false)
  assert.equal(splitOrderReviews(db), 0)
})

/**
 * A seller's rating is every visible review of her products, each counted
 * once - a product rated often weighs more than one rated once.
 */
test('a seller is rated by all her products\' reviews together, hidden ones left out', () => {
  const db = { reviews: [] as Review[] }
  writeRatings(db, order('DELIVERED', 'A'), [{ productId: 'p1', rating: 5 }, { productId: 'p2', rating: 5 }], soon)
  writeRatings(db, order('DELIVERED', 'B'), [{ productId: 'p1', rating: 5 }, { productId: 'p2', rating: 2 }], soon)
  // Three reviews of five stars and one of two: (5+5+5+2)/4 = 4.25 -> 4.3.
  assert.deepEqual(sellerRating(db, 's1'), { average: 4.3, count: 4, byStars: [0, 1, 0, 0, 3] })
  assert.equal(ratingsBySeller(db).get('s1')?.count, 4)

  db.reviews.find((r) => r.orderId === 'B' && r.productId === 'p2')!.hidden = true
  assert.deepEqual(sellerRating(db, 's1'), { average: 5, count: 3, byStars: [0, 0, 0, 0, 3] })
  assert.equal(sellerRating(db, 'nobody').count, 0)
})
