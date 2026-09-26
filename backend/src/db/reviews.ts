import type {
  Order, ProductRatingInput, PublicReview, RatingSummary, Review,
} from '@shared/types.js'
import {
  canReview, needsRating, orderProducts, publicName, ratingsProblem, summarizeReviews,
  toPublicReview,
} from '@shared/review.js'
import type { Db } from './seed.js'
import { newId } from './ids.js'

export type RatingResult =
  | { ok: true; reviews: Review[] }
  | { ok: false; status: number; error: string; messageMr: string }

/**
 * Write the buyer's ratings for every product on one of their own orders.
 *
 * Kept out of the route so the rules can be tested without a server. The
 * caller has already found the order under THIS customer's id.
 *
 * All products at once, or nothing - see `ratingsProblem`. Rating a product
 * again on the same order REPLACES that review; its moderation fields are left
 * alone, so a review an admin hid does not come back by being edited.
 */
export function writeRatings(
  db: Pick<Db, 'reviews'>,
  order: Order,
  ratings: unknown,
  now = new Date(),
): RatingResult {
  if (order.status !== 'DELIVERED') {
    return {
      ok: false, status: 409, error: 'Only a delivered order can be rated',
      messageMr: 'ऑर्डर पोहोचल्यानंतरच अभिप्राय देता येतो',
    }
  }
  if (!canReview(order, now.getTime())) {
    return {
      ok: false, status: 409, error: 'The rating window for this order has closed',
      messageMr: 'या ऑर्डरसाठी अभिप्राय देण्याची मुदत संपली आहे',
    }
  }
  const problem = ratingsProblem(order, ratings)
  if (problem) return { ok: false, status: 400, error: 'Invalid ratings', messageMr: problem }

  const at = now.toISOString()
  const names = new Map(orderProducts(order).map((p) => [p.productId, p.name]))
  const written: Review[] = []

  for (const r of ratings as ProductRatingInput[]) {
    const comment = typeof r.comment === 'string' && r.comment.trim() ? r.comment.trim() : undefined
    const existing = db.reviews.find((x) => x.orderId === order.id && x.productId === r.productId)
    if (existing) {
      existing.rating = r.rating
      existing.comment = comment
      existing.updatedAt = at
      written.push(existing)
      continue
    }
    const review: Review = {
      id: newId('rv'),
      orderId: order.id,
      productId: r.productId,
      productName: names.get(r.productId) ?? '',
      sellerId: order.sellerId,
      customerId: order.customerId,
      customerName: publicName(order.customerName),
      rating: r.rating,
      comment,
      createdAt: at,
    }
    db.reviews.unshift(review)
    written.push(review)
  }
  return { ok: true, reviews: written }
}

/** Visible reviews, newest first, public copies. */
function visible(list: Review[]): PublicReview[] {
  return list
    .filter((r) => !r.hidden)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(toPublicReview)
}

/** What anyone may read about one product: its visible reviews and its stars. */
export function productReviewsFor(
  db: Pick<Db, 'reviews'>,
  productId: string,
): { reviews: PublicReview[]; summary: RatingSummary } {
  const mine = db.reviews.filter((r) => r.productId === productId)
  return { reviews: visible(mine), summary: summarizeReviews(mine) }
}

/** Every visible review of a seller's products - her own list. */
export function sellerProductReviews(db: Pick<Db, 'reviews'>, sellerId: string): PublicReview[] {
  return visible(db.reviews.filter((r) => r.sellerId === sellerId))
}

/**
 * Stars for every product in one pass. The catalogue prints a rating on every
 * product card, and a scan of `reviews` per card would not be.
 */
export function ratingsByProduct(db: Pick<Db, 'reviews'>): Map<string, RatingSummary> {
  const grouped = new Map<string, Review[]>()
  for (const r of db.reviews) {
    const list = grouped.get(r.productId)
    if (list) list.push(r)
    else grouped.set(r.productId, [r])
  }
  const out = new Map<string, RatingSummary>()
  for (const [id, list] of grouped) out.set(id, summarizeReviews(list))
  return out
}

/**
 * A SELLER'S RATING IS HER PRODUCTS' RATINGS, TAKEN TOGETHER.
 *
 * Buyers rate products, never the woman. Her score is every visible review of
 * every product she sells, each counted once - so a product rated forty times
 * weighs more than one rated twice, which is what a buyer reading "4.3 from 42
 * reviews" expects the number to mean. Averaging each product's average would
 * let one lucky five-star listing count as much as her best-seller.
 *
 * Worked out on every request, like the product ratings: hiding a review
 * changes it at once, and nothing stored can go stale.
 */
export function ratingsBySeller(db: Pick<Db, 'reviews'>): Map<string, RatingSummary> {
  const grouped = new Map<string, Review[]>()
  for (const r of db.reviews) {
    const list = grouped.get(r.sellerId)
    if (list) list.push(r)
    else grouped.set(r.sellerId, [r])
  }
  const out = new Map<string, RatingSummary>()
  for (const [id, list] of grouped) out.set(id, summarizeReviews(list))
  return out
}

/** One seller's rating - see `ratingsBySeller`. */
export function sellerRating(db: Pick<Db, 'reviews'>, sellerId: string): RatingSummary {
  return summarizeReviews(db.reviews.filter((r) => r.sellerId === sellerId))
}

export const NO_RATING: RatingSummary = { average: 0, count: 0, byStars: [0, 0, 0, 0, 0] }

/**
 * The customer's delivered orders still waiting for a rating, newest delivery
 * first. The gate in her app shows the first of these and does not let go
 * until the list is empty.
 */
export function ordersToRate(
  db: Pick<Db, 'reviews'>,
  orders: Order[],
  now = Date.now(),
): string[] {
  const mine = db.reviews.filter((r) => orders.some((o) => o.id === r.orderId))
  return orders
    .filter((o) => needsRating(o, mine, now))
    .sort((a, b) => b.placedAt.localeCompare(a.placedAt))
    .map((o) => o.id)
}

/**
 * Reviews written before products were rated one by one.
 *
 * Those were a single rating for a whole order. Each becomes a review of every
 * product that order held, with the same stars and words - the buyer said it
 * about all of them. The existing document is kept for the first product and
 * new ones are added for the rest, so nothing is deleted: a persist that
 * deletes most of a collection is refused by the bulk-delete guard, and would
 * be the wrong shape of change anyway.
 *
 * Idempotent: a review that already names a product is left alone.
 */
export function splitOrderReviews(db: Pick<Db, 'reviews' | 'orders'>): number {
  let changed = 0
  const legacy = db.reviews.filter((r) => !r.productId) as (Review & {
    items?: { productId: string; name: string }[]
  })[]
  for (const r of legacy) {
    const order = db.orders.find((o) => o.id === r.orderId)
    const products = r.items?.length ? r.items : order ? orderProducts(order) : []
    const [first, ...rest] = products
    if (!first) continue
    r.productId = first.productId
    r.productName = first.name
    delete r.items
    for (const p of rest) {
      db.reviews.push({ ...r, id: newId('rv'), productId: p.productId, productName: p.name })
    }
    changed += 1
  }
  return changed
}
