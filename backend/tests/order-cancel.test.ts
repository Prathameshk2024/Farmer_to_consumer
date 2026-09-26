import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Order, OrderStatus } from '@shared/types.js'
import {
  CUSTOMER_CANCEL_REASONS, SELLER_CANCEL_REASONS, cancelProblem, customerCanCancel,
  endingEvent, refundOwed, sellerCanCancel,
} from '@shared/orderCancel.js'
import { cancelOrder } from '../src/db/orderCancel.js'

/**
 * CALLING AN ORDER OFF.
 *
 * The buyer may back out while nothing has happened yet - before the seller
 * accepts, when no money has moved and nothing is cooking. The seller may call
 * it off at any step after she accepts, up to the doorstep. Both have to say
 * why, and the why is kept on the order for the other side to read.
 */

function order(status: OrderStatus): Order {
  return {
    id: 'SMB1234',
    status,
    paymentMode: 'UPI',
    paymentStatus: 'UPI_PENDING',
    events: [{ to: 'PLACED', at: '2026-09-15T10:00:00Z', by: 'customer' }],
  } as Order
}

const ALL: OrderStatus[] = [
  'PLACED', 'ACCEPTED', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'REJECTED', 'CANCELLED',
]

test('the buyer can back out only before the seller has accepted', () => {
  assert.deepEqual(ALL.filter(customerCanCancel), ['PLACED'])
})

/**
 * Before acceptance she has Reject; after delivery the goods are in the
 * buyer's hand and a button does not take them back.
 */
test('the seller can cancel at any step after accepting, up to the doorstep', () => {
  assert.deepEqual(ALL.filter(sellerCanCancel), ['ACCEPTED', 'PACKED', 'OUT_FOR_DELIVERY'])
})

test('a buyer who picks a listed reason is cancelled, and the code is kept', () => {
  const o = order('PLACED')
  const r = cancelOrder(o, 'customer', { reason: 'changed_mind' }, '2026-09-15T10:05:00Z')
  assert.equal(r.ok, true)
  assert.equal(o.status, 'CANCELLED')
  assert.deepEqual(o.events.at(-1), {
    to: 'CANCELLED', at: '2026-09-15T10:05:00Z', by: 'customer', reason: 'changed_mind', note: undefined,
  })
})

/**
 * The code, not a sentence: the seller reads the buyer's reason in her own
 * language, whatever language the buyer had switched on.
 */
test('the reason is stored as a code so each side reads it in their own language', () => {
  const o = order('PACKED')
  cancelOrder(o, 'seller', { reason: 'out_of_stock', note: 'ignored for a listed reason' })
  assert.equal(o.events.at(-1)?.reason, 'out_of_stock')
  assert.equal(o.events.at(-1)?.note, undefined)
})

test('a buyer cannot cancel once the seller has said yes, and is told to ring her', () => {
  const o = order('ACCEPTED')
  const r = cancelOrder(o, 'customer', { reason: 'changed_mind' })
  assert.equal(r.ok, false)
  assert.equal(!r.ok && r.status, 409)
  assert.match(!r.ok ? r.messageMr : '', /फोन/)
  assert.equal(o.status, 'ACCEPTED', 'a refused cancel changes nothing')
})

test('a delivered order cannot be cancelled by anyone', () => {
  for (const by of ['customer', 'seller'] as const) {
    const o = order('DELIVERED')
    assert.equal(cancelOrder(o, by, { reason: 'other', note: 'too late now' }).ok, false)
    assert.equal(o.status, 'DELIVERED')
  }
})

test('no reason, or a reason from the other side\'s list, is refused', () => {
  assert.notEqual(cancelProblem('customer', undefined, undefined), null)
  assert.notEqual(cancelProblem('customer', 'out_of_stock', undefined), null)
  assert.notEqual(cancelProblem('seller', 'changed_mind', undefined), null)
  const o = order('PLACED')
  assert.equal(cancelOrder(o, 'customer', {}).ok, false)
  assert.equal(o.status, 'PLACED')
})

/** "Other" is the escape hatch, and the only one that needs words. */
test('"other" needs a few real words, trimmed', () => {
  assert.notEqual(cancelProblem('seller', 'other', ''), null)
  assert.notEqual(cancelProblem('seller', 'other', '   ab   '), null)
  assert.notEqual(cancelProblem('seller', 'other', 'x'.repeat(201)), null)
  assert.equal(cancelProblem('seller', 'other', 'Gas cylinder ran out'), null)

  const o = order('OUT_FOR_DELIVERY')
  cancelOrder(o, 'seller', { reason: 'other', note: '  Scooter broke down  ' })
  assert.equal(o.events.at(-1)?.note, 'Scooter broke down')
})

test('both lists end with "other"', () => {
  assert.equal(CUSTOMER_CANCEL_REASONS.at(-1), 'other')
  assert.equal(SELLER_CANCEL_REASONS.at(-1), 'other')
})

test('the order screen can find who called it off and why', () => {
  const o = order('PLACED')
  assert.equal(endingEvent(o), undefined)
  cancelOrder(o, 'customer', { reason: 'wrong_address' })
  assert.equal(endingEvent(o)?.by, 'customer')
  assert.equal(endingEvent(o)?.reason, 'wrong_address')
})

/**
 * The app refunds nobody, so after a seller cancels, her screen has to say
 * whether money is sitting in her account that belongs to the buyer. A UTR the
 * buyer typed is a claim, not money - she is told to check, not told it came.
 */
test('what the seller owes back follows what was reported about the payment', () => {
  const o = order('PACKED')
  assert.equal(refundOwed(o), 'none')
  o.paymentStatus = 'UPI_SUBMITTED'
  assert.equal(refundOwed(o), 'claimed')
  o.paymentStatus = 'UPI_CONFIRMED'
  assert.equal(refundOwed(o), 'confirmed')
  o.paymentMode = 'COD'
  o.paymentStatus = 'COD_PENDING'
  assert.equal(refundOwed(o), 'none')
})

test('cancelling leaves the payment as it was, so the refund is still known afterwards', () => {
  const o = order('PACKED')
  o.paymentStatus = 'UPI_CONFIRMED'
  cancelOrder(o, 'seller', { reason: 'out_of_stock' })
  assert.equal(o.status, 'CANCELLED')
  assert.equal(refundOwed(o), 'confirmed')
})
