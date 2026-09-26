import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Seller, SubscriptionPayment } from '@shared/types.js'
import { sellerStatusAfterReject } from '../src/db/payments.js'

/**
 * Rejecting a payment used to set the seller to PAYMENT_REJECTED no matter
 * what. That is wrong in the case we actually have: अर्पिता submitted the same
 * UTR twice, one was approved and activated her, and clearing the leftover
 * duplicate off the admin queue would have locked her out of the account she
 * had already paid for.
 */

function seller(over: Partial<Seller> = {}): Seller {
  return { id: 's1', name: 'अर्पिता', status: 'PAYMENT_SUBMITTED', packsApproved: 0, ...over } as Seller
}

function payment(over: Partial<SubscriptionPayment> = {}): SubscriptionPayment {
  return { id: 'p1', sellerId: 's1', status: 'PENDING', ...over } as SubscriptionPayment
}

test('rejecting her only payment leaves her rejected', () => {
  const status = sellerStatusAfterReject(
    seller({ status: 'PAYMENT_SUBMITTED' }),
    [payment({ id: 'p1' })],
    'p1',
  )

  assert.equal(status, 'PAYMENT_REJECTED')
})

test('rejecting a duplicate does not undo an approved payment', () => {
  const status = sellerStatusAfterReject(
    seller({ status: 'ACTIVE', packsApproved: 1 }),
    [payment({ id: 'p1', status: 'APPROVED' }), payment({ id: 'p2', status: 'PENDING' })],
    'p2',
  )

  assert.equal(status, 'ACTIVE', 'she paid, she was approved, she stays active')
})

test('a blocked seller is not quietly un-blocked by a rejection', () => {
  const status = sellerStatusAfterReject(
    seller({ status: 'BLOCKED' }),
    [payment({ id: 'p1' })],
    'p1',
  )

  assert.equal(status, 'BLOCKED')
})

test('another seller\'s approved payment does not protect her', () => {
  const status = sellerStatusAfterReject(
    seller({ id: 's1', status: 'PAYMENT_SUBMITTED' }),
    [payment({ id: 'p9', sellerId: 's2', status: 'APPROVED' }), payment({ id: 'p1' })],
    'p1',
  )

  assert.equal(status, 'PAYMENT_REJECTED')
})

test('the payment being rejected is ignored even if it was approved', () => {
  // Re-rejecting an approved payment must not count that same payment as the
  // thing keeping her active.
  const status = sellerStatusAfterReject(
    seller({ status: 'ACTIVE', packsApproved: 1 }),
    [payment({ id: 'p1', status: 'APPROVED' })],
    'p1',
  )

  assert.equal(status, 'PAYMENT_REJECTED')
})
