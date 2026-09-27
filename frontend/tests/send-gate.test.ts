import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sendBlock } from '../src/screens/farmer/sendGate.js'

/**
 * PAST THE ₹50, A LISTING GOES TO THE ADMIN. The wizard opens only once the
 * payment is approved (addProductBlock). A farmer still waiting for the field
 * visit has packs but no term (`none`), and must still be able to send: the
 * admin publishing the listing is the check, and it verifies them. Only a
 * term that ran out mid-wizard or no free slot keeps a listing a draft.
 */
test('an approved farmer with a free slot can send, verified or not', () => {
  assert.equal(sendBlock('active', false), null)
  assert.equal(sendBlock('expiring', false), null, 'the reminder week still sells')
  assert.equal(sendBlock('none', false), null, 'paid, waiting for the visit: the admin checks the listing')
})

test('otherwise sending waits, and the first reason is named', () => {
  assert.equal(sendBlock('expired', true), 'expired', 'renewing comes before buying slots')
  assert.equal(sendBlock('active', true), 'slotsFull')
  assert.equal(sendBlock('none', true), 'slotsFull')
})
