import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Order, Review, Farmer, SubscriptionPayment } from '@shared/types.js'
import {
  FARMER_PII_FIELDS, UNDO_DAYS, closeReasonProblem, confirmProblem, daysUntilScrub, openOrders,
} from '@shared/accountClose.js'
import {
  closeCustomer, openOrdersForFarmer, publicIdFromUrl, requestFarmerClose, restoreFarmer,
  scrubFarmer, sweepClosedAccounts,
} from '../src/db/accountClose.js'
import { emptyDb, type Db } from '../src/db/seed.js'
import { canSellNow } from '@shared/subscription.js'
import { cleanFdri } from '@shared/fdri.js'

/**
 * DELETING AN ACCOUNT.
 *
 * Google Play requires the option; this file holds what it must actually do,
 * and - more importantly - what it must refuse to do. Three failures would
 * each be worse than not shipping the feature at all:
 *
 *   1. A farmer loses their shop to a stray tap.
 *   2. A buyer is left waiting on an order whose farmer has vanished.
 *   3. A deletion runs and a phone number survives it.
 *
 * The tests below are those three, in that order.
 */

const DAY = 24 * 60 * 60 * 1000

function farmer(over: Partial<Farmer> = {}): Farmer {
  return {
    id: 's1',
    farmerCode: 'F2C-ANADUR-001',
    name: 'सुनीता पाटील',
    photo: 'https://res.cloudinary.com/x/image/upload/v1/f2c/farmer/photo.jpg',
    phone: '9822011223',
    whatsapp: '9822011223',
    ageGroup: '36-50',
    education: 'secondary',
    landholding: 'small',
    farmerTypes: ['vegetable'],
    sellingChannels: ['trader', 'weekly'],
    problems: ['lowPrice'],
    crops: ['tomato'],
    village: 'अणदूर',
    villageCode: 'ANADUR',
    taluka: 'तुळजापूर',
    district: 'धाराशिव',
    pincode: '413601',
    lat: 17.99364,
    lng: 76.23361,
    locationConsent: true,
    shopName: 'सुनीता गृहउद्योग',
    shopSlug: 'sunita',
    about: 'घरचे लोणचे',
    upiId: '9822011223@ybl',
    upiVerified: true,
    upiQrUrl: 'https://res.cloudinary.com/x/image/upload/v1/f2c/qr/farmer.jpg',
    upiQrPublicId: 'f2c/qr/farmer',
    upiQrReady: true,
    fdri: cleanFdri({ smartphone: true, internet: true, whatsapp: true, digitalPayment: true }),
    fdriScore: 4,
    fdriBand: 'moderate',
    isOpen: true,
    deliveryFee: 20,
    freeDeliveryAbove: 500,
    minOrder: 100,
    dispatch: '1',
    pincodes: ['413601'],
    status: 'ACTIVE',
    verifiedAt: '2026-01-02T00:00:00.000Z',
    packsApproved: 1,
    subscriptionEndsAt: new Date(Date.now() + 100 * DAY).toISOString(),
    notices: [{ id: 'n1', kind: 'BLOCKED', at: '2026-01-01T00:00:00.000Z' }],
    rating: 0,
    ratingCount: 0,
    qrScans: 0,
    qrOrders: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
  } as Farmer
}

function dbWith(s: Farmer): Db {
  const db = emptyDb()
  db.farmers.push(s)
  return db
}

/* ------------------------------------------------------------------ */
/* 1. A stray tap must not be enough                                   */
/* ------------------------------------------------------------------ */

test('the last four digits of their own number are what confirm it', () => {
  assert.equal(confirmProblem('9822011223', '1223'), null)
  assert.equal(confirmProblem('98220 11223', '1223'), null, 'a stored space is not their mistake')

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

test('asking closes the shop today and erases them in seven days', () => {
  const now = Date.parse('2026-09-25T10:00:00.000Z')
  const s = farmer()
  const db = dbWith(s)

  requestFarmerClose(db, s, { reason: 'not_selling' }, now)

  assert.equal(s.status, 'CLOSED')
  assert.equal(canSellNow(s), false, 'the shop leaves the catalogue at once')
  assert.equal(s.phone, '9822011223', 'but the farmer is still here, for a week')
  assert.equal(daysUntilScrub(s.closingAt!, now), UNDO_DAYS)
  assert.equal(sweepClosedAccounts(db, now + 6 * DAY, () => true), 0, 'nothing on day six')
})

test('signing in inside the week puts everything back', () => {
  const now = Date.parse('2026-09-25T10:00:00.000Z')
  const s = farmer()
  const db = dbWith(s)

  requestFarmerClose(db, s, { reason: 'too_hard' }, now)
  restoreFarmer(s)

  assert.equal(s.status, 'ACTIVE')
  assert.equal(s.closingAt, undefined)
  assert.equal(canSellNow(s), true, 'the shop is exactly as it was')
  // canSellNow does not read the open/closed switch, but the catalogue does.
  // Closing used to flip it off and restoring never flipped it back, so a
  // farmer who came back found the shop still missing from every buyer's list.
  assert.equal(s.isOpen, true, 'the open/closed switch is untouched')
  assert.equal(sweepClosedAccounts(db, now + 30 * DAY, () => true), 0, 'and the sweep forgets them')
})

test('restoring never skips the verification', () => {
  const s = farmer({ status: 'PENDING_VERIFICATION', verifiedAt: undefined })
  requestFarmerClose(dbWith(s), s, { reason: 'too_hard' })
  restoreFarmer(s)
  assert.equal(s.status, 'PENDING_VERIFICATION')
})

/* ------------------------------------------------------------------ */
/* 2. Nobody is left waiting                                           */
/* ------------------------------------------------------------------ */

test('an order still in flight blocks the close', () => {
  const db = dbWith(farmer())
  db.orders.push(
    { id: 'o1', farmerId: 's1', customerId: 'c-98', customerPhone: '98', status: 'PACKED' } as Order,
    { id: 'o2', farmerId: 's1', customerId: 'c-98', customerPhone: '98', status: 'DELIVERED' } as Order,
  )

  const open = openOrdersForFarmer(db, 's1')
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

test('the sweep empties the record on the seventh day, and only then', () => {
  const now = Date.parse('2026-09-25T10:00:00.000Z')
  const s = farmer()
  const db = dbWith(s)

  requestFarmerClose(db, s, { reason: 'personal' }, now)
  assert.equal(sweepClosedAccounts(db, now + UNDO_DAYS * DAY, () => true), 1)
  assert.ok(s.closedAt, 'and the row says when it emptied')
})

test('every field that is THE PERSON is gone', () => {
  const s = farmer()
  const db = dbWith(s)
  scrubFarmer(db, s, Date.now(), () => true)

  for (const field of FARMER_PII_FIELDS) {
    const left = (s as unknown as Record<string, unknown>)[field]
    const emptied =
      left === undefined || left === '' ||
      (Array.isArray(left) && left.length === 0) ||
      (field === 'fdri' && Object.values(left as object).every((v) => v === false))
    assert.ok(emptied, `${field} survived the deletion: ${JSON.stringify(left)}`)
  }
  assert.equal(s.fdriScore, 0, 'a score is their answers, summed')
})

test('a questionnaire linked to them loses the phone, the point and the photo, and keeps the answers', () => {
  const s = farmer()
  const db = dbWith(s)
  const place = { phone: '9822011223', lat: 17.99, lng: 76.23, photoUrl: 'https://example.com/p.jpg' }
  db.surveys.push(
    { id: 'sv1', village: 'अणदूर', linkedFarmerId: 's1', fdri: { smartphone: true }, ...place } as never,
    { id: 'sv2', village: 'अणदूर', fdri: {}, ...place } as never,
  )
  scrubFarmer(db, s, Date.now(), () => true)

  const [mine, other] = db.surveys
  for (const k of ['phone', 'lat', 'lng', 'photoUrl'] as const) assert.equal(mine![k], undefined, `${k} survived`)
  assert.deepEqual(mine!.fdri, { smartphone: true }, 'the answers are the research, not the person')
  assert.equal(other!.phone, '9822011223', "somebody else's questionnaire is left alone")
})

test('no session outlives the erasing, and none keeps their number', () => {
  const s = farmer()
  const db = dbWith(s)
  const now = Date.now()
  const session = (id: string, revokedAt?: string) => ({
    id, role: 'farmer' as const, userId: 's1', farmerId: 's1', phone: '9822011223',
    createdAt: '', lastSeenAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 90 * DAY).toISOString(), revokedAt,
  })
  // One revoked when they asked; one from signing in during the week to look
  // at the notice, never restored and never logged out of.
  db.sessions.push(session('asked', new Date(now - 7 * DAY).toISOString()), session('peeked'))

  scrubFarmer(db, s, now, () => true)

  for (const x of db.sessions) {
    assert.ok(x.revokedAt, `session ${x.id} still signs somebody in as an erased shop`)
    assert.equal(x.phone ?? '', '', `session ${x.id} kept their phone number`)
  }
})

test('a closing buyer leaves no phone number on their sessions either', () => {
  const db = emptyDb()
  db.sessions.push({
    id: 'b1', role: 'customer', userId: 'c-9876543210', customerId: 'c-9876543210',
    phone: '9876543210', createdAt: '', lastSeenAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 90 * DAY).toISOString(),
  })

  closeCustomer(db, 'c-9876543210', '9876543210')

  assert.ok(db.sessions[0].revokedAt)
  assert.equal(db.sessions[0].phone ?? '', '')
})

test('the password and forgot-password requests go with the account', async () => {
  const { setCredential } = await import('../src/auth/credentials.js')
  const { submitPasswordRequest } = await import('../src/auth/passwordRequests.js')
  const s = farmer()
  const db = dbWith(s)
  setCredential(db, { role: 'farmer', userId: 's1', phone: '9822011223', password: '482913' })
  submitPasswordRequest(db, { role: 'farmer', phone: '9822011223', name: 'सुनीता पाटील', village: 'अणदूर' })
  setCredential(db, { role: 'customer', userId: 'c-9876543210', phone: '9876543210', password: '482913' })

  scrubFarmer(db, s, Date.now(), () => true)
  closeCustomer(db, 'c-9876543210', '9876543210')

  assert.equal(db.credentials.length, 0)
  assert.equal(db.passwordRequests.length, 0)
})

test('the phone number goes back into circulation', () => {
  const s = farmer()
  const db = dbWith(s)
  scrubFarmer(db, s, Date.now(), () => true)

  // This is the check `POST /farmers/register` makes. If a blank phone did not
  // free the number, a farmer who closed their account could never come back.
  assert.equal(db.farmers.some((x) => x.phone === '9822011223'), false)
})

test('the bank QR is destroyed, not merely unlinked', () => {
  const s = farmer()
  const destroyed: (string | undefined)[] = []
  scrubFarmer(dbWith(s), s, Date.now(), (id) => destroyed.push(id))
  assert.ok(destroyed.includes('f2c/qr/farmer'))
})

test('the money trail stays, the payer does not', () => {
  const s = farmer()
  const db = dbWith(s)
  db.payments.push({
    id: 'sp1', farmerId: 's1', farmerName: 'सुनीता पाटील', farmerCode: 'F2C-ANADUR-001',
    phone: '9822011223', amount: 50, utr: '123456789012', payerUpi: '9822011223@ybl',
    screenshotUrl: 'https://res.cloudinary.com/x/image/upload/v1/f2c/payment/proof.jpg',
    submittedAt: '2026-02-01T00:00:00.000Z', status: 'APPROVED', duplicateUtr: false,
  } as SubscriptionPayment)

  const destroyed: (string | undefined)[] = []
  scrubFarmer(db, s, Date.now(), (id) => destroyed.push(id))

  const p = db.payments[0]!
  assert.equal(p.amount, 50, 'the college still has to account for the money')
  assert.equal(p.utr, '123456789012', 'and for the reference it arrived under')
  assert.equal(p.phone, '')
  assert.equal(p.payerUpi, '')
  assert.equal(p.screenshotUrl, undefined)
  assert.ok(
    destroyed.includes('f2c/payment/proof'),
    'the screenshot of their UPI app is destroyed, not merely unlinked',
  )
  assert.ok(destroyed.includes('f2c/qr/farmer'), 'so is their bank QR')
})

test('a Cloudinary URL yields the id the delete needs', () => {
  assert.equal(
    publicIdFromUrl('https://res.cloudinary.com/demo/image/upload/v1699/f2c/payment/a1.jpg'),
    'f2c/payment/a1',
  )
  assert.equal(publicIdFromUrl(undefined), undefined)
  assert.equal(publicIdFromUrl('not a url'), undefined, 'and nonsense names nothing')
})

/* ------------------------------------------------------------------ */
/* The buyer's side                                                    */
/* ------------------------------------------------------------------ */

test('closing a buyer account takes them off the orders they placed', () => {
  const db = emptyDb()
  db.customers.push({
    id: 'c-9876543210', phone: '9876543210', name: 'आशा',
    addresses: [{ id: 'a1', line: 'घर क्र. 4', pincode: '413601', isDefault: true }],
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  })
  db.orders.push({
    id: 'o1', farmerId: 's1', customerId: 'c-9876543210', customerName: 'आशा',
    customerPhone: '9876543210', address: 'घर क्र. 4, अणदूर', pincode: '413601',
    status: 'DELIVERED', total: 220,
  } as Order)
  db.reviews.push({
    id: 'r1', customerId: 'c-9876543210', customerName: 'आशा', farmerId: 's1',
    productId: 'p1', rating: 5,
  } as Review)

  closeCustomer(db, 'c-9876543210', '9876543210')

  assert.equal(db.customers.length, 0, 'their record is gone')
  const o = db.orders[0]!
  assert.equal(o.customerPhone, '')
  assert.equal(o.address, '')
  assert.equal(o.customerName, 'ग्राहक', 'the farmer keeps a sale, not a person')
  assert.equal(o.total, 220, 'and the sale itself is untouched')
  assert.equal(o.pincode, '413601', 'the village stays - it is a delivery area, not a doorstep')
  assert.equal(db.reviews[0]!.customerName, 'ग्राहक', 'their name leaves their reviews too')
  assert.equal(db.reviews[0]!.rating, 5, 'the stars stay: they are about the product')
})
