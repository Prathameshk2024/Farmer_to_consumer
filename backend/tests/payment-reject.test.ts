import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Farmer, SubscriptionPayment } from '@shared/types.js'
import { rejectPayment } from '../src/db/subscription.js'

/**
 * Rejecting a payment used to set the whole account to PAYMENT_REJECTED,
 * which once locked out a farmer whose duplicate submission was cleared off
 * the queue after the first copy had been approved. The account now carries
 * no payment status at all: a rejection changes the payment and tells the
 * farmer why, and that is all it does.
 */
function farmer(over: Partial<Farmer> = {}): Farmer {
  return { id: 'f1', status: 'ACTIVE', packsApproved: 1, subscriptionEndsAt: '2027-03-15T06:30:00.000Z', notices: [], ...over } as Farmer
}
function payment(over: Partial<SubscriptionPayment> = {}): SubscriptionPayment {
  return { id: 'p2', farmerId: 'f1', status: 'PENDING', utr: '512309887711', ...over } as SubscriptionPayment
}

test('a rejection marks the payment, keeps the reason, and tells the farmer', () => {
  const f = farmer()
  const p = payment()
  rejectPayment(f, p, 'UTR not on the statement', 'Asha <asha@example.com>', '2026-09-20T10:00:00.000Z')
  assert.equal(p.status, 'REJECTED')
  assert.equal(p.rejectReason, 'UTR not on the statement')
  assert.equal(p.verifiedBy, 'Asha <asha@example.com>')
  assert.deepEqual(f.notices!.map((n) => [n.kind, n.note]), [['PAYMENT_REJECTED', 'UTR not on the statement']])
})

test('rejecting a duplicate leaves the account exactly as the approved one left it', () => {
  const f = farmer()
  rejectPayment(f, payment(), 'duplicate', 'admin')
  assert.equal(f.status, 'ACTIVE')
  assert.equal(f.packsApproved, 1)
  assert.equal(f.subscriptionEndsAt, '2027-03-15T06:30:00.000Z')
})

test('a rejection is not the way a block is lifted', () => {
  const f = farmer({ status: 'BLOCKED' })
  rejectPayment(f, payment(), 'x', 'admin')
  assert.equal(f.status, 'BLOCKED')
})
