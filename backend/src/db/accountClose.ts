import type { Order, Seller } from '@shared/types.js'
import { openOrders, scrubDueAt } from '@shared/accountClose.js'
import type { Db } from './seed.js'
import { destroyImage } from '../routes/uploads.routes.js'
import { revokeAllForUser } from '../auth/sessions.js'
import { PLACEHOLDER_NAME } from './customers.js'

/**
 * DELETING AN ACCOUNT, APPLIED.
 *
 * `shared/src/accountClose.ts` says what the rule is and why a row survives
 * the person. This file does it, in two moments that are deliberately far
 * apart: `requestSellerClose` shuts the shop and signs her out the instant she
 * asks, and `sweepClosedAccounts` empties the record a week later. A customer
 * has no week - `closeCustomer` does both at once.
 *
 * Nothing here calls `save()`. The routes and the sweep decide when to write,
 * the same way the moderation sweeps do, so closing nothing never schedules a
 * persist.
 */

/** The name a closed seller's shop carries on orders that already exist. */
export const CLOSED_SHOP_NAME = 'बंद केलेले दुकान'

export interface CloseRequest {
  reason: string
  note?: string
}

/** Her orders that still need somebody - the reason a close can be refused. */
export function openOrdersForSeller(db: Db, sellerId: string): Order[] {
  return openOrders(db.orders.filter((o) => o.sellerId === sellerId))
}

export function openOrdersForCustomer(db: Db, customerId: string, phone: string): Order[] {
  // By id AND by phone: a customer row is rebuilt from orders, and an order
  // placed before she had a row carries the phone but not the id.
  const digits = phone.replace(/\D/g, '')
  return openOrders(
    db.orders.filter(
      (o) => o.customerId === customerId || (digits && o.customerPhone.replace(/\D/g, '') === digits),
    ),
  )
}

/**
 * She asked. The shop closes now; the erasing is a week away.
 *
 * CLOSED is not in `canSellNow`, so her listings leave the catalogue, her shop
 * page stops answering and `POST /orders` refuses - all of it from the status
 * alone, with no product touched. If she comes back
 * inside the week, `restoreSeller` puts the status back and nothing else has
 * to be undone.
 */
export function requestSellerClose(
  db: Db,
  seller: Seller,
  request: CloseRequest,
  now = Date.now(),
): Seller {
  seller.status = 'CLOSED'
  seller.closingAt = scrubDueAt(now)
  seller.closeReason = request.reason
  if (request.note) seller.closeNote = request.note
  else delete seller.closeNote
  // `isOpen` is left alone on purpose. CLOSED already hides the shop, and
  // flipping the switch too meant a restore brought her back with the shop
  // still shut - the one thing restoring promises not to do.

  // Every phone signed in as her, not just this one. She asked for the
  // account to end; a second handset still holding a live token has not.
  revokeAllForUser(db, seller.id, 'logout', now)
  return seller
}

/** She changed her mind inside the week. */
export function restoreSeller(seller: Seller): Seller {
  // Back to what the verification says, not whatever she was before: a
  // farmer who closed before an admin checked him must not come back verified.
  seller.status = seller.verifiedAt ? 'ACTIVE' : 'PENDING_VERIFICATION'
  delete seller.closingAt
  delete seller.closeReason
  delete seller.closeNote
  return seller
}

/**
 * The erasing itself. Everything that is the woman goes; the shop's history
 * stays, holding no way back to her.
 *
 * `SELLER_PII_FIELDS` in the shared rule is the list, and a test walks it
 * against this function - a new field on `Seller` that nobody adds to the list
 * is a phone number surviving a deletion.
 */
export function scrubSeller(
  db: Db,
  seller: Seller,
  now = Date.now(),
  destroy: (publicId: string | undefined) => unknown = destroyImage,
): Seller {
  // Her bank's QR is a picture of her account. Best effort and not awaited,
  // like every other image this app destroys: the record is what matters.
  void destroy(seller.upiQrPublicId)

  seller.name = CLOSED_SHOP_NAME
  seller.shopName = CLOSED_SHOP_NAME
  seller.phone = ''
  seller.whatsapp = ''
  seller.photo = ''
  seller.village = ''
  seller.villageCode = ''
  seller.taluka = ''
  seller.district = ''
  seller.pincode = ''
  seller.pincodes = []
  seller.about = ''
  seller.shgName = ''
  seller.upiId = ''
  seller.upiVerified = false
  seller.upiQrReady = false
  delete seller.upiQrUrl
  delete seller.upiQrPublicId
  delete seller.age
  delete seller.education
  delete seller.yearsInBusiness
  delete seller.monthlyCapacity
  delete seller.notices
  delete seller.blockReason
  seller.digital = {
    smartphone: false, internet: false, upi: false,
    whatsappBusiness: false, socialMedia: false, digitalMarketing: false,
  }
  seller.readinessScore = 0
  seller.readinessBand = 'starter'
  seller.isOpen = false
  seller.status = 'CLOSED'
  seller.closedAt = new Date(now).toISOString()
  delete seller.closingAt

  forgetSessions(db, seller.id, now)
  return seller
}

/**
 * A buyer leaving. No week to think it over, because what she loses is a list
 * of addresses rather than her income - and her row is rebuilt from her phone
 * the moment she signs in again, which is what makes that a NEW account rather
 * than the old one handed back.
 *
 * The phone and the address she typed are copied onto every order she placed,
 * and her first name onto every review she wrote. Those copies are the account
 * as far as she is concerned, so they go too; the stars, the words and the
 * money stay, because they are the seller's record of a sale that happened.
 */
export function closeCustomer(db: Db, customerId: string, phone: string, now = Date.now()): void {
  const digits = phone.replace(/\D/g, '')
  const mine = (o: Order): boolean =>
    o.customerId === customerId || (!!digits && o.customerPhone.replace(/\D/g, '') === digits)

  for (const order of db.orders.filter(mine)) {
    order.customerName = PLACEHOLDER_NAME
    order.customerPhone = ''
    order.address = ''
    // The pincode stays. It is a village, not a doorstep, and it is what a
    // seller's delivery area is measured against.
  }

  for (const review of db.reviews.filter((r) => r.customerId === customerId)) {
    review.customerName = PLACEHOLDER_NAME
  }

  const i = db.customers.findIndex((c) => c.id === customerId)
  if (i >= 0) db.customers.splice(i, 1)

  forgetSessions(db, customerId, now)
}

/**
 * Sign her out everywhere and take her number and phone off the session rows.
 *
 * Revoked rows are kept a week for auditing (`pruneSessions`), and each one
 * carried her full phone all that week. Worse, a seller who
 * signed in during her seven days to look at the notice, and neither restored
 * nor logged out, held a LIVE session into an erased shop. Blanking rather
 * than deleting the rows keeps this clear of `isBulkDelete`.
 */
function forgetSessions(db: Db, userId: string, now: number): void {
  revokeAllForUser(db, userId, 'logout', now)
  for (const session of db.sessions) {
    if (session.userId !== userId) continue
    session.phone = ''
  }
}

/**
 * The other half of the seven days: something has to do the erasing when they
 * are up.
 *
 * A sweep rather than a timer, for the reason the old boot sweeps were:
 * timers do not survive the deploy that happens halfway through the week.
 * Called at boot and hourly, and correct however long the server was down.
 * Returns how many rows it emptied so the caller can decide to `save()`.
 */
export function sweepClosedAccounts(
  db: Db,
  now = Date.now(),
  destroy: (publicId: string | undefined) => unknown = destroyImage,
): number {
  const due = db.sellers.filter(
    (s) => s.status === 'CLOSED' && s.closingAt && new Date(s.closingAt).getTime() <= now,
  )
  for (const seller of due) scrubSeller(db, seller, now, destroy)
  return due.length
}
