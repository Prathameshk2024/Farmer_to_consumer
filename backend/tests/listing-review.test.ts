import { test } from 'node:test'
import assert from 'node:assert/strict'
import { initialListingStatus } from '@shared/seller.js'

/**
 * NOTHING GOES LIVE WITHOUT AN ADMIN SAYING SO.
 *
 * Listings published themselves for a while - moderation after the fact, on
 * the grounds that a queue puts a desk between a seller and her first
 * customer. That is reversed: a photograph, a price and an FSSAI-relevant food
 * claim now reach a person before they reach a shopper, so what carries the
 * market's name has been looked at by someone.
 *
 * She still writes the listing, and she still owns it. What changed is when a
 * shopper can see it.
 */

test('submitting a listing asks for review, it does not publish', () => {
  assert.equal(initialListingStatus(false), 'PENDING')
})

test('saving a draft is not submitting anything', () => {
  assert.equal(initialListingStatus(true), 'DRAFT')
})

/** The regression this exists to catch: a listing that publishes itself. */
test('no path from the seller ends at LIVE', () => {
  for (const asDraft of [true, false]) {
    assert.notEqual(initialListingStatus(asDraft), 'LIVE')
  }
})
