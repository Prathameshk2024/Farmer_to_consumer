import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Product, ProductStatus, Farmer, FarmerStatus } from '@shared/types.js'
import { publiclyVisible } from '../src/routes/catalog.routes.js'

/**
 * WHAT THE PUBLIC MAY SEE.
 *
 * The catalogue list and the by-id lookup each used to decide this for
 * themselves, in two separate expressions. A listing hidden from the list but
 * readable by id is not hidden at all - it is findable by anyone who tries the
 * id, and ids are short and sequential enough to try.
 *
 * This matters most for the states a farmer chose: a DRAFT they have not
 * finished, a PAUSED one they have taken
 * down for the week. Those are the farmer's decisions about their own shop, and a
 * stranger reading them out of the API is the same failure whichever way round
 * it happens.
 */

const HIDDEN_STATES: ProductStatus[] = ['DRAFT', 'PAUSED']

function product(status: ProductStatus): Product {
  return { id: 'p4', farmerId: 's1', status } as Product
}

function farmer(over: Partial<Farmer> = {}): Farmer {
  return { id: 's1', status: 'ACTIVE', isOpen: true, ...over } as Farmer
}

test('a live product from an open, approved shop is public', () => {
  assert.equal(publiclyVisible(product('LIVE'), farmer()), true)
})

test('nothing but LIVE is readable, however the id was come by', () => {
  for (const status of HIDDEN_STATES) {
    assert.equal(publiclyVisible(product(status), farmer()), false, status)
  }
})

/**
 * The shop's state overrides the listing's. A blocked farmer's products are
 * off the shelf even though each one still says LIVE - otherwise blocking
 * removes the farmer from the list and leaves their whole catalogue readable by id.
 */
test('a blocked or unverified shop takes its live listings with it', () => {
  const states: FarmerStatus[] = ['PENDING_VERIFICATION', 'BLOCKED', 'CLOSED']
  for (const status of states) {
    assert.equal(publiclyVisible(product('LIVE'), farmer({ status })), false, status)
  }
})

/** Closed for the afternoon closes the window, not just the order button. */
test('a closed shop shows nothing', () => {
  assert.equal(publiclyVisible(product('LIVE'), farmer({ isOpen: false })), false)
})

/**
 * A missing record is not an accidental yes. `find()` returns undefined for an
 * id that does not exist, and the answer to "may the public see this" must be
 * no rather than a crash or a true.
 */
test('an unknown product or a missing farmer is not visible', () => {
  assert.equal(publiclyVisible(undefined, farmer()), false)
  assert.equal(publiclyVisible(product('LIVE'), undefined), false)
  assert.equal(publiclyVisible(undefined, undefined), false)
})
