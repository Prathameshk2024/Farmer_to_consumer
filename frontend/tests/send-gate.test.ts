import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sendBlock } from '../src/screens/farmer/sendGate.js'

/**
 * DRAFTS ARE FREE. The upload wizard used to shut entirely for a farmer who
 * had not paid, was not yet verified or had no free slot - although the
 * server accepts a draft from all of them. A farmer waiting for the field
 * visit could not even write their first listing down. Now only SENDING
 * waits, and this says for what, in the server's order.
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
