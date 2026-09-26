import type { PublicSeller, RatingSummary, Seller } from '@shared/types.js'

/**
 * THE ONLY SHAPE OF A SELLER THAT LEAVES THE API UNAUTHENTICATED.
 *
 * Built field by field rather than by deleting the private ones. The product
 * page used to return her whole record - phone, admin notices, block reason,
 * her digital-readiness answers - while a comment elsewhere promised her
 * number was on no public endpoint. A deny-list cannot keep that promise: it
 * is only as current as the last person who remembered to extend it.
 *
 * What is here, and why each is public:
 *  - who and where: name, photo, shop, SMB ID, village - what a buyer is
 *    choosing between, and what the law wants beside a food listing.
 *  - delivery terms and pincodes - checkout needs them to price and warn.
 *  - UPI ID, QR image and whether it is set up - the thing a buyer pays to.
 *  - rating: her products' ratings taken together, passed in by the caller
 *    from `ratingsBySeller` / `sellerRating`. Buyers rate products, never
 *    her directly; the stored `Seller.rating` fields are never used.
 *
 * Her phone number is NOT here. A buyer gets it on their own order, from the
 * moment the order exists (see GET /orders/:id), and nowhere else.
 */
export function publicSeller(s: Seller, rating: RatingSummary): PublicSeller {
  return {
    id: s.id,
    womenBizId: s.womenBizId,
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
  }
}
