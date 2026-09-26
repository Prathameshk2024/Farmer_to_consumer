import { Router } from 'express'
import type { Product, Farmer } from '@shared/types.js'
import { getDb } from '../db/store.js'
import { CATEGORIES, type Db } from '../db/seed.js'
import { publicLocation } from '@shared/geo.js'
import {
  NO_RATING, productReviewsFor, ratingsByProduct, ratingsByFarmer, farmerRating,
} from '../db/reviews.js'
import { publicFarmer } from '../db/publicFarmer.js'
import { canSellNow } from '@shared/farmer.js'
import { cropById } from '@shared/crops.js'
import { requireRole } from '../middleware/auth.js'

/** Public, unauthenticated. This is what a shopper and a scanned QR both hit. */
export const catalogRouter: Router = Router()

/**
 * WHAT THE PUBLIC MAY SEE, IN ONE PLACE.
 *
 * The list and the by-id lookup each decided this for themselves, and a
 * listing hidden from one but readable from the other is not hidden - it is
 * findable by anyone who tries the id. A draft and a paused one are all things a farmer has chosen not to show, and a blocked or
 * closed shop is a decision about the whole shop.
 *
 * Both conditions matter. A LIVE product under a BLOCKED farmer is still off
 * the shelf, and a shop that has closed for the afternoon takes its whole
 * window with it.
 */
export function publiclyVisible(
  product: Pick<Product, 'status'> | undefined,
  farmer: Pick<Farmer, 'status' | 'isOpen'> | undefined,
): boolean {
  if (!product || !farmer) return false
  // `canSellNow` is the verification: an unverified farmer's live listing
  // stays off the shelf until an admin has checked him once.
  return product.status === 'LIVE' && canSellNow(farmer) && !!farmer.isOpen
}

catalogRouter.get('/categories', (_req, res) => {
  res.json({ categories: CATEGORIES })
})

/**
 * The buyer's map. A pin is a farmer with something a buyer could order right
 * now, through the same `publiclyVisible` as the catalogue, so the map never
 * shows a farm the shop would refuse. The point is `publicLocation`: rounded
 * to about a kilometre, and absent without the farmer's consent.
 */
export function mapPins(db: Db, categoryId: string | undefined) {
  const live = new Map<string, number>()
  const farmers = new Map(db.farmers.map((f) => [f.id, f]))
  for (const p of db.products) {
    if (categoryId && p.categoryId !== categoryId) continue
    if (publiclyVisible(p, farmers.get(p.farmerId))) live.set(p.farmerId, (live.get(p.farmerId) ?? 0) + 1)
  }
  return db.farmers.flatMap((f) => {
    const at = live.get(f.id) ? publicLocation(f) : undefined
    return at ? [{ farmerId: f.id, name: f.name, village: f.village, crops: f.crops, liveCount: live.get(f.id)!, ...at }] : []
  })
}

catalogRouter.get('/map', (req, res) => {
  const categoryId = typeof req.query.categoryId === 'string' && req.query.categoryId ? req.query.categoryId : undefined
  res.json({ pins: mapPins(getDb(), categoryId) })
})

catalogRouter.get('/products', (req, res) => {
  const db = getDb()
  const { categoryId, cropId, cultivation, q, pincode, farmerId } = req.query as Record<string, string | undefined>

  const farmerById = new Map(db.farmers.map((s) => [s.id, s]))

  let list = db.products.filter((p) => publiclyVisible(p, farmerById.get(p.farmerId)))

  if (categoryId) list = list.filter((p) => p.categoryId === categoryId)

  // One shop's window: the "more from this shop" strip and the shop page.
  // Filtered here rather than in the browser because a phone on rural 4G
  // should not download the whole catalogue to show three products.
  if (farmerId) list = list.filter((p) => p.farmerId === farmerId)

  if (pincode) {
    const serviceable = new Set(
      db.farmers.filter((s) => s.pincodes.includes(pincode)).map((s) => s.id),
    )
    list = list.filter((p) => serviceable.has(p.farmerId))
  }

  if (cropId) list = list.filter((p) => p.cropId === cropId)
  if (cultivation) list = list.filter((p) => p.cultivation === cultivation)

  if (q?.trim()) {
    const needle = q.trim().toLowerCase()
    // The crop's own labels too: a buyer typing "onion" finds a listing the
    // farmer named "लाल कांदा".
    list = list.filter((p) => {
      const crop = cropById(p.cropId)
      return [p.name, crop?.mr, crop?.en].some((s) => (s ?? '').toLowerCase().includes(needle))
    })
  }

  // Attach the farmer card each listing needs. The cart and checkout run
  // entirely off it. What is on it, and why, is in db/publicFarmer.ts.
  //
  // Each product carries its OWN stars, from the ratings of buyers who
  // received it - worked out here on every request, never stored.
  // Her card carries HER rating: every product of hers, taken together.
  const ratings = ratingsByProduct(db)
  const farmerRatings = ratingsByFarmer(db)
  const withFarmer = list.map((p) => {
    const s = farmerById.get(p.farmerId)
    const r = ratings.get(p.id) ?? NO_RATING
    return {
      ...p,
      rating: r.average,
      ratingCount: r.count,
      farmer: s && publicFarmer(s, farmerRatings.get(s.id) ?? NO_RATING),
    }
  })

  res.json({ products: withFarmer })
})

catalogRouter.get('/products/:id', (req, res) => {
  const db = getDb()
  const product = db.products.find((p) => p.id === req.params.id)
  const farmer = product && db.farmers.find((s) => s.id === product.farmerId)

  // 404, not 403, and the same 404 whether the id is unknown or merely not
  // public: telling the difference confirms that a hidden listing exists.
  if (!publiclyVisible(product, farmer)) {
    res.status(404).json({ error: 'Product not found', messageMr: 'हे उत्पादन सापडले नाही' })
    return
  }

  // The card, never the record. This route used to send her whole document -
  // phone, admin notices, block reason - to anyone holding a product id.
  const { summary } = productReviewsFor(db, product!.id)
  res.json({
    product: { ...product!, rating: summary.average, ratingCount: summary.count },
    farmer: publicFarmer(farmer!, farmerRating(db, farmer!.id)),
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
  const farmer = product && db.farmers.find((s) => s.id === product.farmerId)
  if (!publiclyVisible(product, farmer)) {
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
  const farmer = db.farmers.find((s) => s.shopSlug === req.params.slug)
  if (!farmer) {
    res.status(404).json({ error: 'Shop not found' })
    return
  }
  farmer.qrScans += 1
  res.json({ ok: true, shopSlug: farmer.shopSlug })
})

/**
 * Pincode serviceability.
 *
 * Derived from the farmers who actually cover the pincode, never a static
 * list: a pincode is "serviceable" exactly when at least one ACTIVE, open
 * farmer delivers there and has something live to sell. The customer app asks
 * this once, stores the answer, and every later screen reuses it.
 */
/**
 * HER NUMBER, TO ASK WHAT DELIVERY COSTS - AND NOT A DIGIT SOONER.
 *
 * Delivery is a hint rather than a price for most farmers: she writes one
 * pincode at registration and works the rest out per order, so the cart says
 * "ask the farmer" and the buyer had no way to ask until she had committed to
 * an order. This is that way.
 *
 * It is NOT on the public farmer card (`publicFarmer` is an allow-list and
 * her phone is deliberately absent): the catalogue is readable by anyone at
 * all, and a village woman's phone number attached to her name and village is
 * not something to hand out with a product listing. Here it takes a signed-in
 * buyer asking for one farmer, one at a time, which is the difference between
 * answering a customer and publishing a directory.
 *
 * Only for a shop that is actually open for orders - the same rule the
 * listings use.
 */
catalogRouter.get('/farmers/:id/contact', requireRole('customer'), (req, res) => {
  const db = getDb()
  const farmer = db.farmers.find((s) => s.id === req.params.id)
  if (!farmer || !canSellNow(farmer) || !farmer.isOpen) {
    res.status(404).json({ error: 'Farmer not found', messageMr: 'हा शेतकरी सापडला नाही' })
    return
  }
  res.json({ phone: farmer.phone, whatsapp: farmer.whatsapp || farmer.phone })
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
  const farmers = db.farmers.filter(
    (s) => canSellNow(s) && s.isOpen && s.pincodes.includes(pincode),
  )
  const farmerIds = new Set(farmers.map((s) => s.id))
  const productCount = db.products.filter(
    (p) => p.status === 'LIVE' && farmerIds.has(p.farmerId),
  ).length

  res.json({
    pincode,
    serviceable: farmers.length > 0 && productCount > 0,
    farmerCount: farmers.length,
    productCount,
    // Shown when nothing is available, so she knows where the platform HAS
    // reached rather than just being told "no".
    nearbyVillages: [
      ...new Set(
        db.farmers
          .filter((s) => canSellNow(s) && s.isOpen)
          .flatMap((s) => s.pincodes.map((pc) => `${s.village} (${pc})`)),
      ),
    ].slice(0, 6),
  })
})
