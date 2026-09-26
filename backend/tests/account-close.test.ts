import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Order, Review, Seller, SubscriptionPayment } from '@shared/types.js'
import {
  SELLER_PII_FIELDS, UNDO_DAYS, closeReasonProblem, confirmProblem, daysUntilScrub, openOrders,
} from '@shared/accountClose.js'
import {
  closeCustomer, openOrdersForSeller, publicIdFromUrl, requestSellerClose, restoreSeller,
  scrubSeller, sweepClosedAccounts,
} from '../src/db/accountClose.js'
import { emptyDb, type Db } from '../src/db/seed.js'
import { canSellNow } from '@shared/subscription.js'

/**
 * DELETING AN ACCOUNT.
 *
 * Google Play requires the option; this file holds what it must actually do,
 * and - more importantly - what it must refuse to do. Three failures would
 * each be worse than not shipping the feature at all:
 *
 *   1. A woman loses her shop to a stray tap.
 *   2. A buyer is left waiting on an order whose seller has vanished.
 *   3. A deletion runs and a phone number survives it.
 *
 * The tests below are those three, in that order.
 */

const DAY = 24 * 60 * 60 * 1000

function seller(over: Partial<Seller> = {}): Seller {
  return {
    id: 's1',
    womenBizId: 'SMB-ANADUR-01',
    name: 'सुनीता पाटील',
    photo: 'https://res.cloudinary.com/x/image/upload/v1/smb/seller/her.jpg',
    phone: '9822011223',
    whatsapp: '9822011223',
    age: 38,
    education: 'secondary',
    village: 'आणदुर',
    villageCode: 'ANADUR',
    taluka: 'तुळजापूर',
    district: 'धाराशिव',
    pincode: '413601',
    shopName: 'सुनीता गृहउद्योग',
    shopSlug: 'sunita',
    about: 'घरचे लोणचे',
    businessType: 'individual',
    sellsFood: true,
    upiId: '9822011223@ybl',
    upiVerified: true,
    upiQrUrl: 'https://res.cloudinary.com/x/image/upload/v1/smb/qr/her.jpg',
    upiQrPublicId: 'smb/qr/her',
    upiQrReady: true,
    digital: {
      smartphone: true, internet: true, upi: true,
      whatsappBusiness: false, socialMedia: false, digitalMarketing: false,
    },
    readinessScore: 60,
    readinessBand: 'basic',
    isOpen: true,
    deliveryFee: 20,
    freeDeliveryAbove: 500,
    minOrder: 100,
    dispatch: '1',
    pincodes: ['413601'],
    status: 'ACTIVE',
    subscriptionEndsAt: new Date(Date.now() + 100 * DAY).toISOString(),
    packsApproved: 1,
    notices: [{ id: 'n1', kind: 'BLOCKED', at: '2026-01-01T00:00:00.000Z' }],
    rating: 0,
    ratingCount: 0,
    qrScans: 0,
    qrOrders: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
  } as Seller
}

function dbWith(s: Seller): Db {
  const db = emptyDb()
  db.sellers.push(s)
  return db
}

/* ------------------------------------------------------------------ */
/* 1. A stray tap must not be enough                                   */
/* ------------------------------------------------------------------ */

test('the last four digits of her own number are what confirm it', () => {
  assert.equal(confirmProblem('9822011223', '1223'), null)
  assert.equal(confirmProblem('98220 11223', '1223'), null, 'a stored space is not her mistake')

  assert.ok(confirmProblem('9822011223', ''), 'an empty box is refused')
  assert.ok(confirmProblem('9822011223', '122'), 'three digits are refused')
  assert.ok(confirmProblem('9822011223', '9822'), 'the FIRST four are not the last four')
  assert.ok(confirmProblem('9822011223', '0000'), 'and a guess is refused')
})

test('a reason is required, and only "other" needs words', () => {
  assert.equal(closeReasonProblem('not_selling', undefined), null)
  assert.ok(closeReasonProblem('', undefined), 'no reason is a problem')
  assert.ok(closeReasonProblem('because', undefined), 'an invented code is a problem')
  assert.ok(closeReasonProblem('other', 'ok'), 'two letters are not a reason')
  assert.equal(closeReasonProblem('other', 'दुकान बंद केले'), null)
})

test('asking closes the shop today and erases her in seven days', () => {
  const now = Date.parse('2026-09-25T10:00:00.000Z')
  const s = seller()
  const db = dbWith(s)

  requestSellerClose(db, s, { reason: 'not_selling' }, now)

  assert.equal(s.status, 'CLOSED')
  assert.equal(canSellNow(s, now), false, 'her shop leaves the catalogue at once')
  assert.equal(s.phone, '9822011223', 'but she is still here, for a week')
  assert.equal(daysUntilScrub(s.closingAt!, now), UNDO_DAYS)
  assert.equal(sweepClosedAccounts(db, now + 6 * DAY, () => true), 0, 'nothing on day six')
})

test('signing in inside the week puts everything back', () => {
  const now = Date.parse('2026-09-25T10:00:00.000Z')
  const s = seller()
  const db = dbWith(s)

  requestSellerClose(db, s, { reason: 'too_hard' }, now)
  restoreSeller(s)

  assert.equal(s.status, 'ACTIVE')
  assert.equal(s.closingAt, undefined)
  assert.equal(canSellNow(s, now), true, 'the shop is exactly as it was')
  // canSellNow does not read the open/closed switch, but the catalogue does.
  // Closing used to flip it off and restoring never flipped it back, so a
  // woman who came back found her shop still missing from every buyer's list.
  assert.equal(s.isOpen, true, 'her open/closed switch is untouched')
  assert.equal(sweepClosedAccounts(db, now + 30 * DAY, () => true), 0, 'and the sweep forgets her')
})

/* ------------------------------------------------------------------ */
/* 2. Nobody is left waiting                                           */
/* ------------------------------------------------------------------ */

test('an order still in flight blocks the close', () => {
  const db = dbWith(seller())
  db.orders.push(
    { id: 'o1', sellerId: 's1', customerId: 'c-98', customerPhone: '98', status: 'PACKED' } as Order,
    { id: 'o2', sellerId: 's1', customerId: 'c-98', customerPhone: '98', status: 'DELIVERED' } as Order,
  )

  const open = openOrdersForSeller(db, 's1')
  assert.deepEqual(open.map((o) => o.id), ['o1'], 'only the one somebody is waiting on')
})

test('delivered, rejected and cancelled orders are nobody\'s business any more', () => {
  const finished = ['DELIVERED', 'REJECTED', 'CANCELLED'].map(
    (status, i) => ({ id: `o${i}`, status } as Order),
  )
  assert.deepEqual(openOrders(finished), [])
})

/* ------------------------------------------------------------------ */
/* 3. Nothing personal survives the erasing                            */
/* ------------------------------------------------------------------ */

test('the sweep empties her on the seventh day, and only then', () => {
  const now = Date.parse('2026-09-25T10:00:00.000Z')
  const s = seller()
  const db = dbWith(s)

  requestSellerClose(db, s, { reason: 'personal' }, now)
  assert.equal(sweepClosedAccounts(db, now + UNDO_DAYS * DAY, () => true), 1)
  assert.ok(s.closedAt, 'and the row says when it emptied')
})

test('every field that is HER is gone', () => {
  const s = seller()
  const db = dbWith(s)
  scrubSeller(db, s, Date.now(), () => true)

  for (const field of SELLER_PII_FIELDS) {
    const left = (s as unknown as Record<string, unknown>)[field]
    const emptied =
      left === undefined || left === '' ||
      (Array.isArray(left) && left.length === 0) ||
      (field === 'digital' && Object.values(left as object).every((v) => v === false))
    assert.ok(emptied, `${field} survived the deletion: ${JSON.stringify(left)}`)
  }
})

test('no session outlives the erasing, and none keeps her number', () => {
  const s = seller()
  const db = dbWith(s)
  const now = Date.now()
  const session = (id: string, revokedAt?: string) => ({
    id, role: 'seller' as const, userId: 's1', sellerId: 's1', phone: '9822011223',
    pushToken: 'fcm-her-phone', createdAt: '', lastSeenAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 90 * DAY).toISOString(), revokedAt,
  })
  // One revoked when she asked; one from signing in during the week to look
  // at the notice, never restored and never logged out of.
  db.sessions.push(session('asked', new Date(now - 7 * DAY).toISOString()), session('peeked'))

  scrubSeller(db, s, now, () => true)

  for (const x of db.sessions) {
    assert.ok(x.revokedAt, `session ${x.id} still signs somebody in as an erased shop`)
    assert.equal(x.phone ?? '', '', `session ${x.id} kept her phone number`)
    assert.equal(x.pushToken, undefined, `session ${x.id} would still buzz her phone`)
  }
})

test('a closing buyer leaves no phone number on her sessions either', () => {
  const db = emptyDb()
  db.sessions.push({
    id: 'b1', role: 'customer', userId: 'c-9876543210', customerId: 'c-9876543210',
    phone: '9876543210', pushToken: 'fcm-buyer', createdAt: '', lastSeenAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 90 * DAY).toISOString(),
  })

  closeCustomer(db, 'c-9876543210', '9876543210')

  assert.ok(db.sessions[0].revokedAt)
  assert.equal(db.sessions[0].phone ?? '', '')
  assert.equal(db.sessions[0].pushToken, undefined)
})

test('her phone number goes back into circulation', () => {
  const s = seller()
  const db = dbWith(s)
  scrubSeller(db, s, Date.now(), () => true)

  // This is the check `POST /sellers/register` makes. If a blank phone did not
  // free the number, a woman who closed her account could never come back.
  assert.equal(db.sellers.some((x) => x.phone === '9822011223'), false)
})

test('the money trail stays, the payer does not', () => {
  const s = seller()
  const db = dbWith(s)
  db.payments.push({
    id: 'sp1', sellerId: 's1', sellerName: 'सुनीता पाटील', womenBizId: 'SMB-ANADUR-01',
    phone: '9822011223', amount: 50, utr: '123456789012', payerUpi: '9822011223@ybl',
    screenshotUrl: 'https://res.cloudinary.com/x/image/upload/v1/smb/payment/proof.jpg',
    submittedAt: '2026-02-01T00:00:00.000Z', status: 'APPROVED', duplicateUtr: false,
  } as SubscriptionPayment)

  const destroyed: (string | undefined)[] = []
  scrubSeller(db, s, Date.now(), (id) => destroyed.push(id))

  const p = db.payments[0]!
  assert.equal(p.amount, 50, 'the college still has to account for the money')
  assert.equal(p.utr, '123456789012', 'and for the reference it arrived under')
  assert.equal(p.phone, '')
  assert.equal(p.payerUpi, '')
  assert.equal(p.screenshotUrl, undefined)
  assert.ok(
    destroyed.includes('smb/payment/proof'),
    'the screenshot of her UPI app is destroyed, not merely unlinked',
  )
  assert.ok(destroyed.includes('smb/qr/her'), 'so is her bank QR')
})

test('a Cloudinary URL yields the id the delete needs', () => {
  assert.equal(
    publicIdFromUrl('https://res.cloudinary.com/demo/image/upload/v1699/smb/payment/a1.jpg'),
    'smb/payment/a1',
  )
  assert.equal(publicIdFromUrl(undefined), undefined)
  assert.equal(publicIdFromUrl('not a url'), undefined, 'and nonsense names nothing')
})

/* ------------------------------------------------------------------ */
/* The buyer's side                                                    */
/* ------------------------------------------------------------------ */

test('closing a buyer account takes her off the orders she placed', () => {
  const db = emptyDb()
  db.customers.push({
    id: 'c-9876543210', phone: '9876543210', name: 'आशा',
    addresses: [{ id: 'a1', line: 'घर क्र. 4', pincode: '413601', isDefault: true }],
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  })
  db.orders.push({
    id: 'o1', sellerId: 's1', customerId: 'c-9876543210', customerName: 'आशा',
    customerPhone: '9876543210', address: 'घर क्र. 4, आणदुर', pincode: '413601',
    status: 'DELIVERED', total: 220,
  } as Order)
  db.reviews.push({
    id: 'r1', customerId: 'c-9876543210', customerName: 'आशा', sellerId: 's1',
    productId: 'p1', rating: 5,
  } as Review)

  closeCustomer(db, 'c-9876543210', '9876543210')

  assert.equal(db.customers.length, 0, 'her record is gone')
  const o = db.orders[0]!
  assert.equal(o.customerPhone, '')
  assert.equal(o.address, '')
  assert.equal(o.customerName, 'ग्राहक', 'the seller keeps a sale, not a person')
  assert.equal(o.total, 220, 'and the sale itself is untouched')
  assert.equal(o.pincode, '413601', 'the village stays - it is a delivery area, not a doorstep')
  assert.equal(db.reviews[0]!.customerName, 'ग्राहक', 'her name leaves her reviews too')
  assert.equal(db.reviews[0]!.rating, 5, 'the stars stay: they are about the product')
})
