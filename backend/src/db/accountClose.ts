import type { Order, Farmer } from '@shared/types.js'
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
 * apart: `requestFarmerClose` shuts the shop and signs her out the instant she
 * asks, and `sweepClosedAccounts` empties the record a week later. A customer
 * has no week - `closeCustomer` does both at once.
 *
 * Nothing here calls `save()`. The routes and the sweep decide when to write,
 * the same way the moderation sweeps do, so closing nothing never schedules a
 * persist.
 */

/** The name a closed farmer's shop carries on orders that already exist. */
export const CLOSED_SHOP_NAME = 'बंद केलेले दुकान'

export interface CloseRequest {
  reason: string
  note?: string
}

/** Her orders that still need somebody - the reason a close can be refused. */
export function openOrdersForFarmer(db: Db, farmerId: string): Order[] {
  return openOrders(db.orders.filter((o) => o.farmerId === farmerId))
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
 * inside the week, `restoreFarmer` puts the status back and nothing else has
 * to be undone.
 */
export function requestFarmerClose(
  db: Db,
  farmer: Farmer,
  request: CloseRequest,
  now = Date.now(),
): Farmer {
  farmer.status = 'CLOSED'
  farmer.closingAt = scrubDueAt(now)
  farmer.closeReason = request.reason
  if (request.note) farmer.closeNote = request.note
  else delete farmer.closeNote
  // `isOpen` is left alone on purpose. CLOSED already hides the shop, and
  // flipping the switch too meant a restore brought her back with the shop
  // still shut - the one thing restoring promises not to do.

  // Every phone signed in as her, not just this one. She asked for the
  // account to end; a second handset still holding a live token has not.
  revokeAllForUser(db, farmer.id, 'logout', now)
  return farmer
}

/** She changed her mind inside the week. */
export function restoreFarmer(farmer: Farmer): Farmer {
  // Back to what the verification says, not whatever she was before: a
  // farmer who closed before an admin checked him must not come back verified.
  farmer.status = farmer.verifiedAt ? 'ACTIVE' : 'PENDING_VERIFICATION'
  delete farmer.closingAt
  delete farmer.closeReason
  delete farmer.closeNote
  return farmer
}

/**
 * The erasing itself. Everything that is the woman goes; the shop's history
 * stays, holding no way back to her.
 *
 * `FARMER_PII_FIELDS` in the shared rule is the list, and a test walks it
 * against this function - a new field on `Farmer` that nobody adds to the list
 * is a phone number surviving a deletion.
 */
export function scrubFarmer(
  db: Db,
  farmer: Farmer,
  now = Date.now(),
  destroy: (publicId: string | undefined) => unknown = destroyImage,
): Farmer {
  // Her bank's QR is a picture of her account. Best effort and not awaited,
  // like every other image this app destroys: the record is what matters.
  void destroy(farmer.upiQrPublicId)

  farmer.name = CLOSED_SHOP_NAME
  farmer.shopName = CLOSED_SHOP_NAME
  farmer.phone = ''
  farmer.whatsapp = ''
  farmer.photo = ''
  farmer.village = ''
  farmer.villageCode = ''
  farmer.taluka = ''
  farmer.district = ''
  farmer.pincode = ''
  farmer.pincodes = []
  farmer.about = ''
  farmer.shgName = ''
  farmer.upiId = ''
  farmer.upiVerified = false
  farmer.upiQrReady = false
  delete farmer.upiQrUrl
  delete farmer.upiQrPublicId
  delete farmer.age
  delete farmer.education
  delete farmer.yearsInBusiness
  delete farmer.monthlyCapacity
  delete farmer.notices
  delete farmer.blockReason
  farmer.digital = {
    smartphone: false, internet: false, upi: false,
    whatsappBusiness: false, socialMedia: false, digitalMarketing: false,
  }
  farmer.readinessScore = 0
  farmer.readinessBand = 'starter'
  farmer.isOpen = false
  farmer.status = 'CLOSED'
  farmer.closedAt = new Date(now).toISOString()
  delete farmer.closingAt

  forgetSessions(db, farmer.id, now)
  return farmer
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
 * money stay, because they are the farmer's record of a sale that happened.
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
    // farmer's delivery area is measured against.
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
 * carried her full phone all that week. Worse, a farmer who
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
  const due = db.farmers.filter(
    (s) => s.status === 'CLOSED' && s.closingAt && new Date(s.closingAt).getTime() <= now,
  )
  for (const farmer of due) scrubFarmer(db, farmer, now, destroy)
  return due.length
}
