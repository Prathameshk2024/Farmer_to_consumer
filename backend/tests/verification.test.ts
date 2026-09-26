import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canSellNow, initialListingStatus } from '@shared/seller.js'

process.env.SESSION_SECRET = 'test-secret-for-unit-tests'
const { publiclyVisible } = await import('../src/routes/catalog.routes.js')

/**
 * A farmer is checked once, by a person, and after that his produce goes
 * straight on sale. Produce changes daily; a queue per listing would sell
 * yesterday's tomatoes. The check that remains is on the farmer.
 */

test('only a verified, unblocked farmer can sell', () => {
  assert.equal(canSellNow({ status: 'PENDING_VERIFICATION' }), false)
  assert.equal(canSellNow({ status: 'ACTIVE' }), true)
  assert.equal(canSellNow({ status: 'BLOCKED' }), false)
  assert.equal(canSellNow({ status: 'CLOSED' }), false)
})

test('a submitted listing is live at once; a draft stays a draft', () => {
  assert.equal(initialListingStatus(false), 'LIVE')
  assert.equal(initialListingStatus(true), 'DRAFT')
})

test('an unverified farmer\'s live listing is not public', () => {
  const product = { status: 'LIVE' as const }
  assert.equal(publiclyVisible(product, { status: 'PENDING_VERIFICATION', isOpen: true }), false)
  assert.equal(publiclyVisible(product, { status: 'ACTIVE', isOpen: true }), true)
  assert.equal(publiclyVisible(product, { status: 'ACTIVE', isOpen: false }), false)
})
