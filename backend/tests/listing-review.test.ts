import { test } from 'node:test'
import assert from 'node:assert/strict'
import { initialListingStatus } from '@shared/farmer.js'

/**
 * NOTHING GOES LIVE WITHOUT AN ADMIN SAYING SO.
 *
 * A listing carries a photograph, a price, a harvest date and a claim about
 * how the crop was grown, and it goes out under the programme's name. So a
 * person looks before a buyer does. The farmer still writes the listing and
 * still owns it; what changed is when a buyer can see it.
 */
test('submitting a listing asks for review, it does not publish', () => {
  assert.equal(initialListingStatus(false), 'PENDING')
})

test('saving a draft is not submitting anything', () => {
  assert.equal(initialListingStatus(true), 'DRAFT')
})

/** The regression this exists to catch: a listing that publishes itself. */
test('no path from the farmer ends at LIVE', () => {
  for (const asDraft of [true, false]) assert.notEqual(initialListingStatus(asDraft), 'LIVE')
})
