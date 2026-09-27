import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canSellNow } from '@shared/subscription.js'

process.env.SESSION_SECRET = 'test-secret-for-unit-tests'
const { publiclyVisible } = await import('../src/routes/catalog.routes.js')

/**
 * A farmer is checked once, by a person. That check is one of two gates: the
 * other is the paid six months. Verification alone sells nothing, because
 * status no longer keeps an unpaid farmer off the shelf - the date has to.
 */

const FUTURE = new Date(Date.now() + 365 * 86_400_000).toISOString()

test('only a verified farmer with an open term can sell', () => {
  assert.equal(canSellNow({ status: 'ACTIVE' }), false, 'verified, never paid')
  assert.equal(canSellNow({ status: 'ACTIVE', subscriptionEndsAt: FUTURE }), true)
  assert.equal(canSellNow({ status: 'PENDING_VERIFICATION', subscriptionEndsAt: FUTURE }), false)
  assert.equal(canSellNow({ status: 'BLOCKED', subscriptionEndsAt: FUTURE }), false)
  assert.equal(canSellNow({ status: 'CLOSED', subscriptionEndsAt: FUTURE }), false)
})

test('an unverified or unpaid farmer\'s live listing is not public', () => {
  const product = { status: 'LIVE' as const }
  assert.equal(publiclyVisible(product, { status: 'PENDING_VERIFICATION', isOpen: true, subscriptionEndsAt: FUTURE }), false)
  assert.equal(publiclyVisible(product, { status: 'ACTIVE', isOpen: true, subscriptionEndsAt: FUTURE }), true)
  assert.equal(publiclyVisible(product, { status: 'ACTIVE', isOpen: false, subscriptionEndsAt: FUTURE }), false)
  assert.equal(publiclyVisible(product, { status: 'ACTIVE', isOpen: true }), false, 'verified, no term')
})
