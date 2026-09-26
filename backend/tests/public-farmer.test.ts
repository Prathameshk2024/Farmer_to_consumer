import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Farmer } from '@shared/types.js'
import { publicFarmer } from '../src/db/publicFarmer.js'
import { NO_RATING } from '../src/db/reviews.js'
import { cleanFdri } from '@shared/fdri.js'

/**
 * WHAT A STRANGER MAY LEARN ABOUT A FARMER.
 *
 * The product page used to send the farmer's entire record to anyone holding a product
 * id - phone, admin notices, the reason they were blocked, their answers to the
 * questionnaire - while the comment on the orders route promised
 * their number was on no public endpoint. The public card is an allow-list now,
 * and this file is the list.
 */

function farmer(): Farmer {
  return {
    id: 's1', farmerCode: 'F2C-ANADUR-001', name: 'सुनीता पाटील', photo: '', phone: '9822011223',
    whatsapp: '9822011223', ageGroup: '36-50', education: 'secondary', landholding: 'small',
    village: 'अणदूर', villageCode: 'ANADUR', taluka: 'तुळजापूर', district: 'धाराशिव', pincode: '413603',
    lat: 17.99364, lng: 76.23361, locationConsent: true,
    shopName: 'सुनीता गृहउद्योग', shopSlug: 'sunita', about: 'जिजाऊ शेतमाल',
    crops: ['tomato', 'onion'], farmerTypes: ['vegetable'], sellingChannels: ['trader'], problems: ['lowPrice'],
    upiId: 'sunita@ybl', upiVerified: true, upiQrUrl: 'https://example.test/qr.png', upiQrPublicId: 'qr/1',
    upiQrReady: true,
    fdri: cleanFdri({ smartphone: true, internet: true, whatsapp: true, digitalPayment: true }),
    fdriScore: 4, fdriBand: 'moderate',
    offersDelivery: true, pickup: { place: 'अणदूर बस स्थानकाजवळ', lat: 17.99123, lng: 76.23187 },
    isOpen: true, deliveryFee: 30, freeDeliveryAbove: 500, minOrder: 100, dispatch: '1', pincodes: ['413603'],
    status: 'ACTIVE', blockedAt: undefined, blockReason: 'old reason', verifiedAt: '2026-08-02T00:00:00Z', verifiedBy: 'admin',
    notices: [{ id: 'n1', at: '2026-09-01T00:00:00Z', kind: 'BLOCKED', note: 'private' }],
    rating: 4.9, ratingCount: 99, qrScans: 12, qrOrders: 3, createdAt: '2026-08-01T00:00:00Z',
  }
}

/**
 * The exact set of keys, so a field added to the card is added HERE too - by
 * somebody who has had to think about whether a stranger should see it.
 */
test('the public card carries exactly the allow-listed fields', () => {
  assert.deepEqual(Object.keys(publicFarmer(farmer(), NO_RATING)).sort(), [
    'crops', 'deliveryFee', 'farmerCode', 'freeDeliveryAbove', 'id', 'lat', 'lng', 'minOrder', 'name',
    'offersDelivery', 'photo', 'pickup', 'pincodes', 'rating', 'ratingCount', 'shopName', 'shopSlug', 'upiId', 'upiQrReady', 'upiQrUrl',
    'village',
  ])
})

/**
 * The farmer's questionnaire answers are research data, not a shop window: a buyer
 * has no business knowing their age group, their land or how they scored.
 */
test('the questionnaire and the phone stay off the card', () => {
  const card = publicFarmer(farmer(), NO_RATING) as unknown as Record<string, unknown>
  for (const key of ['phone', 'fdri', 'fdriScore', 'fdriBand', 'ageGroup', 'education', 'landholding', 'locationConsent']) {
    assert.equal(key in card, false, key)
  }
})

/** Two decimals is the village, not the house (global constraint). */
test('the public point is rounded; the exact one never leaves', () => {
  const card = publicFarmer(farmer(), NO_RATING)
  assert.equal(card.lat, 17.99)
  assert.equal(card.lng, 76.23)
  assert.equal(JSON.stringify(card).includes('17.99364'), false)
})

/** The pickup spot is published by choice, so no consent is asked - but it is rounded all the same. */
test('the pickup place is public with a rounded point, even without home-location consent', () => {
  const card = publicFarmer({ ...farmer(), locationConsent: false }, NO_RATING)
  assert.deepEqual(card.pickup, { place: 'अणदूर बस स्थानकाजवळ', lat: 17.99, lng: 76.23 })
  assert.equal(JSON.stringify(card).includes('17.99123'), false)
})

test('no pickup, no pickup key; an old row without offersDelivery still delivers', () => {
  const { pickup: _p, offersDelivery: _o, ...old } = farmer()
  const card = publicFarmer(old, NO_RATING)
  assert.equal('pickup' in card, false)
  assert.equal(card.offersDelivery, true)
})

test('no consent, no point on the card', () => {
  const card = publicFarmer({ ...farmer(), locationConsent: false }, NO_RATING)
  assert.equal('lat' in card, false)
  assert.equal('lng' in card, false)
})

test('the phone, admin notices and block reason never reach the public', () => {
  const card = JSON.stringify(publicFarmer(farmer(), NO_RATING))
  for (const secret of ['9822011223', 'private', 'old reason', 'जिजाऊ', 'qr/1']) {
    assert.equal(card.includes(secret), false, secret)
  }
})

/**
 * The rating is what the farmer's products earned, passed in - never the numbers
 * stored on their record (4.9 from 99 here), which nothing keeps up to date.
 */
test('the rating on the card is the products\' ratings, not the stored fields', () => {
  const card = publicFarmer(farmer(), { average: 3.5, count: 2, byStars: [0, 0, 1, 1, 0] })
  assert.equal(card.rating, 3.5)
  assert.equal(card.ratingCount, 2)
  assert.equal(publicFarmer(farmer(), NO_RATING).ratingCount, 0)
})
