import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Product, ProductStatus, Seller, SellerStatus } from '@shared/types.js'
import { publiclyVisible } from '../src/routes/catalog.routes.js'

/**
 * WHAT THE PUBLIC MAY SEE.
 *
 * The catalogue list and the by-id lookup each used to decide this for
 * themselves, in two separate expressions. A listing hidden from the list but
 * readable by id is not hidden at all - it is findable by anyone who tries the
 * id, and ids are short and sequential enough to try.
 *
 * This matters most for the states a seller chose: a DRAFT she has not
 * finished, a REJECTED listing she is still fixing, a PAUSED one she has taken
 * down for the week. Those are her decisions about her own shop, and a
 * stranger reading them out of the API is the same failure whichever way round
 * it happens.
 */

const HIDDEN_STATES: ProductStatus[] = ['DRAFT', 'PENDING', 'REJECTED', 'PAUSED', 'ARCHIVED']

function product(status: ProductStatus): Product {
  return { id: 'p4', sellerId: 's1', status } as Product
}

function seller(over: Partial<Seller> = {}): Seller {
  return { id: 's1', status: 'ACTIVE', isOpen: true, ...over } as Seller
}

test('a live product from an open, approved shop is public', () => {
  assert.equal(publiclyVisible(product('LIVE'), seller()), true)
})

test('nothing but LIVE is readable, however the id was come by', () => {
  for (const status of HIDDEN_STATES) {
    assert.equal(publiclyVisible(product(status), seller()), false, status)
  }
})

/**
 * The shop's state overrides the listing's. A blocked seller's products are
 * off the shelf even though each one still says LIVE - otherwise blocking
 * removes her from the list and leaves her whole catalogue readable by id.
 */
test('a blocked or unapproved shop takes its live listings with it', () => {
  const states: SellerStatus[] = ['REGISTERED', 'PAYMENT_SUBMITTED', 'BLOCKED']
  for (const status of states) {
    assert.equal(publiclyVisible(product('LIVE'), seller({ status })), false, status)
  }
})

/** Closed for the afternoon closes the window, not just the order button. */
test('a closed shop shows nothing', () => {
  assert.equal(publiclyVisible(product('LIVE'), seller({ isOpen: false })), false)
})

/**
 * A missing record is not an accidental yes. `find()` returns undefined for an
 * id that does not exist, and the answer to "may the public see this" must be
 * no rather than a crash or a true.
 */
test('an unknown product or a missing seller is not visible', () => {
  assert.equal(publiclyVisible(undefined, seller()), false)
  assert.equal(publiclyVisible(product('LIVE'), undefined), false)
  assert.equal(publiclyVisible(undefined, undefined), false)
})
