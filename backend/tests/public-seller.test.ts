import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Seller } from '@shared/types.js'
import { publicSeller } from '../src/db/publicSeller.js'
import { NO_RATING } from '../src/db/reviews.js'

/**
 * WHAT A STRANGER MAY LEARN ABOUT A SELLER.
 *
 * The product page used to send her entire record to anyone holding a product
 * id - phone, admin notices, the reason she was blocked, her answers to the
 * digital-readiness questions - while the comment on the orders route promised
 * her number was on no public endpoint. The public card is an allow-list now,
 * and this file is the list.
 */

function seller(): Seller {
  return {
    id: 's1', womenBizId: 'SMB-ANADUR-01', name: 'सुनीता पाटील', photo: '', phone: '9822011223',
    whatsapp: '9822011223', age: 38, education: '10 वी',
    village: 'अणदूर', villageCode: 'ANADUR', taluka: 'तुळजापूर', district: 'धाराशिव', pincode: '413603',
    shopName: 'सुनीता गृहउद्योग', shopSlug: 'sunita', about: 'घरगुती लोणची', businessType: 'shg',
    shgName: 'जिजाऊ बचत गट', yearsInBusiness: 6, monthlyCapacity: 200, sellsFood: true,
    upiId: 'sunita@ybl', upiVerified: true, upiQrUrl: 'https://example.test/qr.png', upiQrPublicId: 'qr/1',
    upiQrReady: true,
    digital: { smartphone: true, internet: true, upi: true, whatsappBusiness: false, socialMedia: false, digitalMarketing: false },
    readinessScore: 4, readinessBand: 'basic',
    isOpen: true, deliveryFee: 30, freeDeliveryAbove: 500, minOrder: 100, dispatch: '1', pincodes: ['413603'],
    status: 'ACTIVE', blockedAt: undefined, blockReason: 'old reason', packsApproved: 2, listingsPublished: 7,
    notices: [{ id: 'n1', at: '2026-09-01T00:00:00Z', kind: 'BLOCKED', note: 'private' }],
    rating: 4.9, ratingCount: 99, qrScans: 12, qrOrders: 3, createdAt: '2026-08-01T00:00:00Z',
  }
}

/**
 * The exact set of keys, so a field added to the card is added HERE too - by
 * somebody who has had to think about whether a stranger should see it.
 */
test('the public card carries exactly the allow-listed fields', () => {
  assert.deepEqual(Object.keys(publicSeller(seller(), NO_RATING)).sort(), [
    'deliveryFee', 'freeDeliveryAbove', 'id', 'minOrder', 'name', 'photo', 'pincodes',
    'rating', 'ratingCount', 'shopName', 'shopSlug', 'upiId', 'upiQrReady', 'upiQrUrl',
    'village', 'womenBizId',
  ])
})

test('her phone, admin notices and block reason never reach the public', () => {
  const card = JSON.stringify(publicSeller(seller(), NO_RATING))
  for (const secret of ['9822011223', 'private', 'old reason', 'जिजाऊ', 'qr/1']) {
    assert.equal(card.includes(secret), false, secret)
  }
})

/**
 * Her rating is what her products earned, passed in - never the numbers
 * stored on her record (4.9 from 99 here), which nothing keeps up to date.
 */
test('the rating on the card is her products\' ratings, not the stored fields', () => {
  const card = publicSeller(seller(), { average: 3.5, count: 2, byStars: [0, 0, 1, 1, 0] })
  assert.equal(card.rating, 3.5)
  assert.equal(card.ratingCount, 2)
  assert.equal(publicSeller(seller(), NO_RATING).ratingCount, 0)
})
