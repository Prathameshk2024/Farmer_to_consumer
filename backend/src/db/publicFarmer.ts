import type { PublicFarmer, RatingSummary, Farmer } from '@shared/types.js'
import { publicLocation } from '@shared/geo.js'

/**
 * THE ONLY SHAPE OF A FARMER THAT LEAVES THE API UNAUTHENTICATED.
 *
 * Built field by field rather than by deleting the private ones. The product
 * page used to return the farmer's whole record - phone, admin notices, block reason,
 * questionnaire answers - while a comment elsewhere promised their
 * number was on no public endpoint. A deny-list cannot keep that promise: it
 * is only as current as the last person who remembered to extend it.
 *
 * What is here, and why each is public:
 *  - who and where: name, photo, shop, farmer code, village - what a buyer is
 *    choosing between, and who grew what they are buying.
 *  - delivery terms and pincodes - checkout needs them to price and warn.
 *  - UPI ID, QR image and whether it is set up - the thing a buyer pays to.
 *  - crops and a point rounded to about a kilometre, only with the farmer's consent -
 *    enough to find the village, not the house (`publicLocation`).
 *  - offersDelivery, and the pickup place with its point rounded - a spot
 *    the farmer chose to publish, so it needs no home-location consent.
 *  - rating: the farmer's products' ratings taken together, passed in by the caller
 *    from `ratingsByFarmer` / `farmerRating`. Buyers rate products, never
 *    the farmer directly; the stored `Farmer.rating` fields are never used.
 *
 * The farmer's phone number is NOT here. A buyer gets it on their own order, from the
 * moment the order exists (see GET /orders/:id), and nowhere else.
 */
export function publicFarmer(s: Farmer, rating: RatingSummary): PublicFarmer {
  return {
    id: s.id,
    farmerCode: s.farmerCode,
    name: s.name,
    photo: s.photo,
    shopName: s.shopName,
    shopSlug: s.shopSlug,
    village: s.village,
    deliveryFee: s.deliveryFee,
    freeDeliveryAbove: s.freeDeliveryAbove,
    minOrder: s.minOrder,
    pincodes: s.pincodes,
    upiId: s.upiId,
    upiQrReady: s.upiQrReady,
    upiQrUrl: s.upiQrUrl,
    rating: rating.average,
    ratingCount: rating.count,
    crops: s.crops,
    ...publicLocation(s),
    offersDelivery: s.offersDelivery ?? true,
    // A spot the farmer chose to publish, so it needs no home-location consent - but
    // its point is still rounded like the home one.
    ...(s.pickup
      ? { pickup: { place: s.pickup.place, ...publicLocation({ ...s.pickup, locationConsent: true }) } }
      : {}),
  }
}
