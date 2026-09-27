import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Farmer, SubscriptionPayment } from '@shared/types.js'
import { addProductBlock } from '@shared/subscription.js'
import { addRefusal } from '../src/routes/products.routes.js'

/**
 * NOTHING IS ADDED UNTIL THE ₹50 IS APPROVED - NOT EVEN A DRAFT.
 *
 * Drafts used to be free, so a farmer who had not paid could fill the whole
 * wizard and only then meet "pay first", and the owner saw "it still lets me
 * add a product". POST /products now asks this before it reads `asDraft`, so
 * one refusal covers a draft and a listing sent in alike - which is why these
 * tests never mention either.
 *
 * The three refusals name the one thing the farmer can do next: pay, wait for
 * the admin, or renew.
 */

const DAY = 86_400_000
const now = Date.parse('2026-10-01T06:30:00.000Z')

function farmer(over: Partial<Farmer> = {}): Farmer {
  return { id: 'f1', status: 'ACTIVE', notices: [], ...over } as Farmer
}
const waiting = [{ farmerId: 'f1', status: 'PENDING' }] as SubscriptionPayment[]

test('a farmer who never paid is told to take the subscription', () => {
  assert.equal(addRefusal(farmer(), [], now)?.error, 'SUBSCRIPTION_UNPAID')
  // Nor does verification stand in for the ₹50.
  assert.equal(addRefusal(farmer({ status: 'PENDING_VERIFICATION' }), [], now)?.error, 'SUBSCRIPTION_UNPAID')
})

test('a farmer whose ₹50 is in the queue is told to wait, not to pay again', () => {
  assert.equal(addRefusal(farmer(), waiting, now)?.error, 'SUBSCRIPTION_AWAITING_APPROVAL')
  // Someone else's payment waiting says nothing about this farmer.
  assert.equal(addRefusal(farmer(), [{ ...waiting[0]!, farmerId: 'f2' }], now)?.error, 'SUBSCRIPTION_UNPAID')
  // A rejected payment is no payment: pay again.
  assert.equal(addRefusal(farmer(), [{ ...waiting[0]!, status: 'REJECTED' }], now)?.error, 'SUBSCRIPTION_UNPAID')
})

test('an expired shop is told to renew - unless the renewal is already sent', () => {
  const ended = farmer({ packsApproved: 1, subscriptionEndsAt: new Date(now - DAY).toISOString() })
  assert.equal(addRefusal(ended, [], now)?.error, 'SUBSCRIPTION_EXPIRED')
  assert.equal(addRefusal(ended, waiting, now)?.error, 'SUBSCRIPTION_AWAITING_APPROVAL')
})

test('every refusal carries its Marathi sentence', () => {
  for (const [f, p] of [
    [farmer(), []],
    [farmer(), waiting],
    [farmer({ subscriptionEndsAt: new Date(now - DAY).toISOString() }), []],
  ] as const) {
    assert.match(addRefusal(f, [...p], now)!.messageMr, /₹50/)
  }
})

test('once approved the farmer may add, reminder week included', () => {
  const open = farmer({ packsApproved: 1, subscriptionEndsAt: new Date(now + 90 * DAY).toISOString() })
  assert.equal(addRefusal(open, [], now), null)
  const lastWeek = farmer({ packsApproved: 1, subscriptionEndsAt: new Date(now + 3 * DAY).toISOString() })
  assert.equal(addRefusal(lastWeek, [], now), null)
  // A pack bought mid-term waiting in the queue does not shut an open shop.
  assert.equal(addRefusal(open, waiting, now), null)
})

/**
 * Approved before the field visit: the packs are there but the six months
 * start at verification (startTermOnVerify). The farmer has paid and been
 * approved; the visit is not theirs to fix, so drafts are open to them.
 */
test('approved packs waiting for verification count as paid', () => {
  assert.equal(addProductBlock({ packsApproved: 1 }, false, now), null)
  assert.equal(addProductBlock({ packsApproved: 0 }, false, now), 'unpaid')
})
