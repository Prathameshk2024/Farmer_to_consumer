import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_DELIVERY_ESTIMATE, SELLER_ACTIONS, actionFor, cleanDeliveryEstimate,
} from '@shared/orderFlow.js'

/**
 * "YES" AND "WHEN?" ARE ONE MOMENT.
 *
 * A buyer whose order was accepted used to be told ACCEPTED and nothing about
 * time. The seller is asked as she accepts, because that is the moment she
 * knows: she has just read the address, the quantity and what is on her shelf.
 *
 * Her words, not a date. The honest answer in a village with one bus a day is
 * "two days" or "Thursday, after the market"; a calendar would make her invent
 * a precision she does not have.
 */

test('accepting is where the question belongs, and nowhere else', () => {
  assert.equal(actionFor('PLACED', 'ACCEPTED')?.needsEstimate, true)
  assert.equal(actionFor('ACCEPTED', 'PACKED')?.needsEstimate, undefined)
  assert.equal(
    SELLER_ACTIONS.PLACED.find((a) => a.to === 'REJECTED')?.needsEstimate,
    undefined,
    'a refusal has no delivery time',
  )
})

test('saying nothing stores nothing', () => {
  // Skipping is allowed: a time she was pushed into inventing is worse for
  // the buyer than no time at all.
  assert.equal(cleanDeliveryEstimate(undefined), undefined)
  assert.equal(cleanDeliveryEstimate('   '), undefined)
})

test('what she typed is what the buyer reads', () => {
  assert.equal(cleanDeliveryEstimate('  2 दिवसांत  '), '2 दिवसांत')
  assert.equal(cleanDeliveryEstimate('उद्या\n संध्याकाळी'), 'उद्या संध्याकाळी')
})

/** One line on the buyer's order screen, not a paragraph. */
test('an essay is cut to a phrase', () => {
  const long = cleanDeliveryEstimate('अ'.repeat(MAX_DELIVERY_ESTIMATE + 20))
  assert.equal(long?.length, MAX_DELIVERY_ESTIMATE)
})
