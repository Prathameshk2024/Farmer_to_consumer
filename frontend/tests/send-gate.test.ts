import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sendBlock } from '../src/screens/farmer/sendGate.js'

/**
 * PAST THE ₹50, DRAFTS ARE FREE. The wizard opens only once the payment is
 * approved (addProductBlock); after that, a farmer waiting for the field
 * visit or out of slots can still write a listing down. Only SENDING waits,
 * and this says for what, in the server's order - `noTerm` and `expired`
 * remain for a farmer whose term has not started yet or ran out mid-wizard.
 */
test('a verified farmer with an open term and a free slot can send', () => {
  assert.equal(sendBlock('ACTIVE', 'active', false), null)
  assert.equal(sendBlock('ACTIVE', 'expiring', false), null, 'the reminder week still sells')
})

test('otherwise sending waits, and the first reason is named', () => {
  assert.equal(sendBlock('PENDING_VERIFICATION', 'none', true), 'notVerified')
  assert.equal(sendBlock('ACTIVE', 'none', true), 'noTerm', 'never paid: the term, not the slots')
  assert.equal(sendBlock('ACTIVE', 'expired', false), 'expired')
  assert.equal(sendBlock('ACTIVE', 'active', true), 'slotsFull')
})
