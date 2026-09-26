import { Router } from 'express'
import type { Product, Seller } from '@shared/types.js'
import { getDb } from '../db/store.js'
import { CATEGORIES } from '../db/seed.js'
import {
  NO_RATING, productReviewsFor, ratingsByProduct, ratingsBySeller, sellerRating,
} from '../db/reviews.js'
import { publicSeller } from '../db/publicSeller.js'
import { canSellNow } from '@shared/subscription.js'
import { requireRole } from '../middleware/auth.js'

/** Public, unauthenticated. This is what a shopper and a scanned QR both hit. */
export const catalogRouter: Router = Router()

/**
 * WHAT THE PUBLIC MAY SEE, IN ONE PLACE.
 *
 * The list and the by-id lookup each decided this for themselves, and a
 * listing hidden from one but readable from the other is not hidden - it is
 * findable by anyone who tries the id. A draft, a rejected product and a
 * paused one are all things a seller has chosen not to show, and a blocked or
 * closed shop is a decision about the whole shop.
 *
 * Both conditions matter. A LIVE product under a BLOCKED seller is still off
 * the shelf, and a shop that has closed for the afternoon takes its whole
 * window with it.
 */
export function publiclyVisible(
  product: Pick<Product, 'status'> | undefined,
  seller: Pick<Seller, 'status' | 'isOpen' | 'subscriptionEndsAt'> | undefined,
  now = Date.now(),
): boolean {
  if (!product || !seller) return false
  // `canSellNow` is the account and the six months together: a shop whose
  // subscription ran out comes off the shelf the moment the date passes, with
  // nothing about her products or her open/closed switch rewritten.
  return product.status === 'LIVE' && canSellNow(seller, now) && !!seller.isOpen
}

catalogRouter.get('/categories', (_req, res) => {
  res.json({ categories: CATEGORIES })
})

catalogRouter.get('/products', (req, res) => {
  const db = getDb()
  const { categoryId, q, pincode, sellerId } = req.query as Record<string, string | undefined>

  const sellerById = new Map(db.sellers.map((s) => [s.id, s]))

  let list = db.products.filter((p) => publiclyVisible(p, sellerById.get(p.sellerId)))

  if (categoryId) list = list.filter((p) => p.categoryId === categoryId)

  // One shop's window: the "more from this shop" strip and the shop page.
  // Filtered here rather than in the browser because a phone on rural 4G
  // should not download the whole catalogue to show three products.
  if (sellerId) list = list.filter((p) => p.sellerId === sellerId)

  if (pincode) {
    const serviceable = new Set(
      db.sellers.filter((s) => s.pincodes.includes(pincode)).map((s) => s.id),
    )
    list = list.filter((p) => serviceable.has(p.sellerId))
  }

  if (q?.trim()) {
    const needle = q.trim().toLowerCase()
    list = list.filter(
      (p) =>
        p.name.toLowerCase().includes(needle) ||
        (p.nameEn ?? '').toLowerCase().includes(needle),
    )
  }

  // Attach the seller card each listing needs, which the law requires to be
  // displayed on every food listing. The cart and checkout run entirely off
  // it. What is on it, and why, is in db/publicSeller.ts.
  //
  // Each product carries its OWN stars, from the ratings of buyers who
  // received it - worked out here on every request, never stored.
  // Her card carries HER rating: every product of hers, taken together.
  const ratings = ratingsByProduct(db)
  const sellerRatings = ratingsBySeller(db)
  const withSeller = list.map((p) => {
    const s = sellerById.get(p.sellerId)
    const r = ratings.get(p.id) ?? NO_RATING
    return {
      ...p,
      rating: r.average,
      ratingCount: r.count,
      seller: s && publicSeller(s, sellerRatings.get(s.id) ?? NO_RATING),
    }
  })

  res.json({ products: withSeller })
})

catalogRouter.get('/products/:id', (req, res) => {
  const db = getDb()
  const product = db.products.find((p) => p.id === req.params.id)
  const seller = product && db.sellers.find((s) => s.id === product.sellerId)

  // 404, not 403, and the same 404 whether the id is unknown or merely not
  // public: telling the difference confirms that a hidden listing exists.
  if (!publiclyVisible(product, seller)) {
    res.status(404).json({ error: 'Product not found', messageMr: 'हे उत्पादन सापडले नाही' })
    return
  }

  // The card, never the record. This route used to send her whole document -
  // phone, admin notices, block reason - to anyone holding a product id.
  const { summary } = productReviewsFor(db, product!.id)
  res.json({
    product: { ...product!, rating: summary.average, ratingCount: summary.count },
    seller: publicSeller(seller!, sellerRating(db, seller!.id)),
  })
})

/**
 * WHAT BUYERS SAID ABOUT ONE PRODUCT. Public, exactly as far as the product
 * is: the same `publiclyVisible` rule, and the same 404 for a listing that is
 * hidden as for one that never existed.
 */
catalogRouter.get('/products/:id/reviews', (req, res) => {
  const db = getDb()
  const product = db.products.find((p) => p.id === req.params.id)
  const seller = product && db.sellers.find((s) => s.id === product.sellerId)
  if (!publiclyVisible(product, seller)) {
    res.status(404).json({ error: 'Product not found', messageMr: 'हे उत्पादन सापडले नाही' })
    return
  }
  res.json(productReviewsFor(db, product!.id))
})

// GET /addresses used to live here. It had no auth check and returned the same
// two seeded addresses to every caller, which checkout then showed as "your
// saved addresses". Addresses belong to a customer now: GET /api/customers/me.

/**
 * Share-QR landing. Records the scan, then the client redirects to the shop.
 * In production this endpoint also stamps the Play Store referrer so the
 * Install Referrer API can route a fresh install to her shop.
 */
catalogRouter.post('/share/:slug/scan', (req, res) => {
  const db = getDb()
  const seller = db.sellers.find((s) => s.shopSlug === req.params.slug)
  if (!seller) {
    res.status(404).json({ error: 'Shop not found' })
    return
  }
  seller.qrScans += 1
  res.json({ ok: true, shopSlug: seller.shopSlug })
})

/**
 * Pincode serviceability.
 *
 * Derived from the sellers who actually cover the pincode, never a static
 * list: a pincode is "serviceable" exactly when at least one ACTIVE, open
 * seller delivers there and has something live to sell. The customer app asks
 * this once, stores the answer, and every later screen reuses it.
 */
/**
 * HER NUMBER, TO ASK WHAT DELIVERY COSTS - AND NOT A DIGIT SOONER.
 *
 * Delivery is a hint rather than a price for most sellers: she writes one
 * pincode at registration and works the rest out per order, so the cart says
 * "ask the seller" and the buyer had no way to ask until she had committed to
 * an order. This is that way.
 *
 * It is NOT on the public seller card (`publicSeller` is an allow-list and
 * her phone is deliberately absent): the catalogue is readable by anyone at
 * all, and a village woman's phone number attached to her name and village is
 * not something to hand out with a product listing. Here it takes a signed-in
 * buyer asking for one seller, one at a time, which is the difference between
 * answering a customer and publishing a directory.
 *
 * Only for a shop that is actually open for orders - the same rule the
 * listings use.
 */
catalogRouter.get('/sellers/:id/contact', requireRole('customer'), (req, res) => {
  const db = getDb()
  const seller = db.sellers.find((s) => s.id === req.params.id)
  if (!seller || !canSellNow(seller) || !seller.isOpen) {
    res.status(404).json({ error: 'Seller not found', messageMr: 'ही विक्रेती सापडली नाही' })
    return
  }
  res.json({ phone: seller.phone, whatsapp: seller.whatsapp || seller.phone })
})

catalogRouter.get('/serviceability', (req, res) => {
  const pincode = String(req.query.pincode ?? '').trim()

  if (!/^[1-9]\d{5}$/.test(pincode)) {
    res.status(400).json({
      error: 'Invalid pincode',
      messageMr: '6 अंकी पिनकोड टाका',
      fields: { pincode: 'invalid' },
    })
    return
  }

  const db = getDb()
  const sellers = db.sellers.filter(
    (s) => canSellNow(s) && s.isOpen && s.pincodes.includes(pincode),
  )
  const sellerIds = new Set(sellers.map((s) => s.id))
  const productCount = db.products.filter(
    (p) => p.status === 'LIVE' && sellerIds.has(p.sellerId),
  ).length

  res.json({
    pincode,
    serviceable: sellers.length > 0 && productCount > 0,
    sellerCount: sellers.length,
    productCount,
    // Shown when nothing is available, so she knows where the platform HAS
    // reached rather than just being told "no".
    nearbyVillages: [
      ...new Set(
        db.sellers
          .filter((s) => canSellNow(s) && s.isOpen)
          .flatMap((s) => s.pincodes.map((pc) => `${s.village} (${pc})`)),
      ),
    ].slice(0, 6),
  })
})
