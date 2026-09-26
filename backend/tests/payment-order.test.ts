import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Order } from '@shared/types.js'
import {
  awaitingCustomerPayment, awaitingPaymentConfirmation, initialPaymentStatus,
} from '@shared/orderFlow.js'

/**
 * MONEY AFTER ACCEPTANCE, NOT BEFORE.
 *
 * A buyer used to pay by UPI at checkout, before the seller had seen the
 * order. If the seller then rejected it - too far, out of stock, a pincode she
 * cannot reach - the money was already in her account and this app has no
 * refund path. Since her delivery-area list stopped being a gate, rejection is
 * a normal outcome rather than a rare one, so prepaying became untenable.
 *
 * The order now reaches her unpaid. She accepts, THEN the buyer pays, then she
 * confirms it in her own UPI app and only then packs.
 */

function order(over: Partial<Order> = {}): Order {
  return {
    id: 'SMB1234',
    paymentMode: 'UPI',
    paymentStatus: 'UPI_PENDING',
    status: 'ACCEPTED',
    ...over,
  } as Order
}

test('a new UPI order owes money and has not paid it', () => {
  assert.equal(initialPaymentStatus('UPI'), 'UPI_PENDING')
})

/** Cash is unchanged: collected at the doorstep, nothing to submit. */
test('a cash order is still pending collection', () => {
  assert.equal(initialPaymentStatus('COD'), 'COD_PENDING')
})

test('the buyer is asked for money only once the seller has accepted', () => {
  assert.equal(awaitingCustomerPayment(order({ status: 'PLACED' })), false)
  assert.equal(awaitingCustomerPayment(order({ status: 'ACCEPTED' })), true)
})

test('a rejected order never asks the buyer for money', () => {
  assert.equal(awaitingCustomerPayment(order({ status: 'REJECTED' })), false)
  assert.equal(awaitingCustomerPayment(order({ status: 'CANCELLED' })), false)
})

test('nobody is asked to pay twice', () => {
  assert.equal(awaitingCustomerPayment(order({ paymentStatus: 'UPI_SUBMITTED' })), false)
  assert.equal(awaitingCustomerPayment(order({ paymentStatus: 'UPI_CONFIRMED' })), false)
})

test('a cash order asks the buyer for nothing', () => {
  assert.equal(
    awaitingCustomerPayment(order({ paymentMode: 'COD', paymentStatus: 'COD_PENDING' })),
    false,
  )
})

/**
 * The gate that makes the flip safe: she does not pack goods she has not been
 * paid for, and "the buyer typed a reference number" is not payment - only her
 * own confirmation is.
 */
test('a UPI order is not packed until she has confirmed the money', () => {
  assert.equal(awaitingPaymentConfirmation(order({ paymentStatus: 'UPI_PENDING' })), true)
  assert.equal(awaitingPaymentConfirmation(order({ paymentStatus: 'UPI_SUBMITTED' })), true)
  assert.equal(awaitingPaymentConfirmation(order({ paymentStatus: 'UPI_CONFIRMED' })), false)
})

test('a cash order is never held up waiting for money', () => {
  assert.equal(
    awaitingPaymentConfirmation(order({ paymentMode: 'COD', paymentStatus: 'COD_PENDING' })),
    false,
  )
})
