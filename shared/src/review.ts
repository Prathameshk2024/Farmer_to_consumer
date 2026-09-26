import type {
  Order, ProductRatingInput, PublicReview, RatingSummary, Review,
} from './types.js'

/**
 * RATING WHAT ARRIVED
 * ===================
 * Once an order is delivered, the buyer rates each product in it: one to five
 * stars each, words optional. The public reads those ratings on the product -
 * what a jar of pickle was actually like - and never as a score for the woman
 * who made it.
 *
 * THE BUYER CANNOT SKIP IT. While a delivered order is unrated, the customer
 * app shows the rating screen over everything else (`RateOrderGate`). That is
 * a product decision: a rural seller has nothing a stranger can check except
 * what her last buyers said, and a rating asked for "later" is a rating never
 * given.
 *
 * ONLY A BUYER WHO RECEIVED IT. A review belongs to one product on one
 * DELIVERED order, written by the customer on that order. No order, no
 * review: that stops a rival's one-stars and a seller's own five-stars.
 *
 * ONE VOICE PER PRODUCT PER ORDER. Writing again replaces the earlier review
 * of that product on that order rather than adding one.
 *
 * FOR A MONTH. Ratings can be given or changed for REVIEW_WINDOW_DAYS after
 * delivery, and the gate asks only inside that window - a buyer returning
 * after a year is not stopped at the door over an order she has forgotten.
 *
 * STARS ARE REQUIRED, WORDS ARE NOT. A tap per product is a complete rating.
 *
 * FIRST NAME ONLY IN PUBLIC. See `publicName`.
 */

export const REVIEW_WINDOW_DAYS = 30
export const REVIEW_COMMENT_MAX = 500
export const RATING_MIN = 1
export const RATING_MAX = 5

/** When the seller marked it delivered, or undefined if she has not. */
export function deliveredAt(order: Pick<Order, 'status' | 'events'>): string | undefined {
  if (order.status !== 'DELIVERED') return undefined
  return [...(order.events ?? [])].reverse().find((e) => e.to === 'DELIVERED')?.at
}

/**
 * May the buyer rate (or re-rate) this order right now?
 *
 * An order delivered before events were stamped has no date to count from;
 * it is let in rather than locked out.
 */
export function canReview(order: Pick<Order, 'status' | 'events'>, now = Date.now()): boolean {
  if (order.status !== 'DELIVERED') return false
  const at = deliveredAt(order)
  if (!at) return true
  return now - new Date(at).getTime() <= REVIEW_WINDOW_DAYS * 86_400_000
}

/** The distinct products on an order - a product listed twice is rated once. */
export function orderProducts(order: Pick<Order, 'items'>): { productId: string; name: string }[] {
  const seen = new Map<string, string>()
  for (const i of order.items ?? []) if (!seen.has(i.productId)) seen.set(i.productId, i.name)
  return [...seen].map(([productId, name]) => ({ productId, name }))
}

/**
 * Does this order still need rating before the buyer may carry on?
 *
 * True while it is inside the window and at least one of its products has no
 * review from this order. What the gate asks, and what the server lists.
 */
export function needsRating(
  order: Pick<Order, 'id' | 'status' | 'events' | 'items'>,
  reviews: Pick<Review, 'orderId' | 'productId'>[],
  now = Date.now(),
): boolean {
  if (!canReview(order, now)) return false
  const rated = new Set(reviews.filter((r) => r.orderId === order.id).map((r) => r.productId))
  return orderProducts(order).some((p) => !rated.has(p.productId))
}

/** What is wrong with ONE product's rating, in Marathi, or null. */
export function reviewProblem(rating: unknown, comment: unknown): string | null {
  if (typeof rating !== 'number' || !Number.isInteger(rating) || rating < RATING_MIN || rating > RATING_MAX) {
    return 'तारे निवडा'
  }
  if (comment !== undefined && comment !== null && typeof comment !== 'string') {
    return 'अभिप्राय पुन्हा लिहा'
  }
  if (typeof comment === 'string' && comment.trim().length > REVIEW_COMMENT_MAX) {
    return `अभिप्राय ${REVIEW_COMMENT_MAX} अक्षरांपेक्षा लहान लिहा`
  }
  return null
}

/**
 * What is wrong with the whole submission, in Marathi, or null.
 *
 * Every product on the order must be there, rated, exactly once, and nothing
 * that is not on the order. All of them at once is what makes the gate one
 * screen and one tap, and what lets it close.
 */
export function ratingsProblem(order: Pick<Order, 'items'>, ratings: unknown): string | null {
  if (!Array.isArray(ratings) || ratings.length === 0) return 'प्रत्येक वस्तूला तारे द्या'
  const wanted = new Set(orderProducts(order).map((p) => p.productId))
  const seen = new Set<string>()
  for (const r of ratings as Partial<ProductRatingInput>[]) {
    if (!r || typeof r.productId !== 'string' || !wanted.has(r.productId) || seen.has(r.productId)) {
      return 'प्रत्येक वस्तूला तारे द्या'
    }
    seen.add(r.productId)
    const problem = reviewProblem(r.rating, r.comment)
    if (problem) return problem
  }
  return seen.size === wanted.size ? null : 'प्रत्येक वस्तूला तारे द्या'
}

/**
 * The name a review is shown under: the first word of the buyer's name.
 *
 * Reviews are public, and a full name next to the seller's village is enough
 * to find someone's house. Empty when there is no name, and each app prints
 * its own word for "a customer".
 */
export function publicName(name: string | undefined): string {
  const first = (name ?? '').trim().split(/\s+/)[0] ?? ''
  // The placeholder checkout writes when she gave no name is not a name.
  return first === 'ग्राहक' ? '' : first
}

/** Stars across the reviews the public is allowed to see. */
export function summarizeReviews(reviews: Pick<Review, 'rating' | 'hidden'>[]): RatingSummary {
  const byStars: RatingSummary['byStars'] = [0, 0, 0, 0, 0]
  let sum = 0
  let count = 0
  for (const r of reviews) {
    if (r.hidden) continue
    if (r.rating < RATING_MIN || r.rating > RATING_MAX) continue
    byStars[r.rating - 1]! += 1
    sum += r.rating
    count += 1
  }
  return { average: count ? Math.round((sum / count) * 10) / 10 : 0, count, byStars }
}

/** Strip what the public must not see: the buyer's id, the seller's, and any moderation. */
export function toPublicReview(r: Review): PublicReview {
  return {
    id: r.id,
    orderId: r.orderId,
    productId: r.productId,
    productName: r.productName,
    customerName: r.customerName,
    rating: r.rating,
    comment: r.comment,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }
}

/** Dictionary key for the word under a star count - the star is never alone. */
export function ratingWordKey(rating: number): string {
  return `rev.word.${Math.min(RATING_MAX, Math.max(RATING_MIN, Math.round(rating)))}`
}
