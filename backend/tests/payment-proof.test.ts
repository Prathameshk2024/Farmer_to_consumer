import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PAID_AT_MAX_AGE_DAYS, allChecksDone, paidAtProblem } from '@shared/payment.js'
import type { SubscriptionPayment } from '@shared/types.js'
import {
  PAYER_UPI_MAX, isDuplicateUtr, payerUpiProblem, screenshotProblem, storedScreenshot,
} from '../src/db/payments.js'

/**
 * THE ₹50 NEEDS PROOF, NOT JUST TWELVE DIGITS.
 *
 * Anybody can type a twelve-digit number, and approving it grants five slots.
 * So a subscription payment arrives with a screenshot of the UPI app's success
 * screen and the time the farmer paid, and an admin cannot approve it without saying
 * they matched the UTR, the date and time, and found the money.
 */

const cloud = { cloudName: 'f2c-demo', folder: 'f2c' }
const ours = 'https://res.cloudinary.com/f2c-demo/image/upload/v1726400000/f2c/payment/abc123.jpg'

test('with uploads on, a submission without a screenshot is refused', () => {
  assert.notEqual(screenshotProblem(undefined, cloud), null)
  assert.notEqual(screenshotProblem('', cloud), null)
})

test('a screenshot from our own payment folder is accepted', () => {
  assert.equal(screenshotProblem(ours, cloud), null)
})

/**
 * The proof has to be the upload we signed, not a link somebody pasted: a
 * receipt from anywhere on the internet, or a product photo from this same
 * account, must not stand in for the farmer's payment.
 */
test('a link from anywhere else is not a payment screenshot', () => {
  assert.notEqual(screenshotProblem('https://i.imgur.com/receipt.jpg', cloud), null)
  assert.notEqual(
    screenshotProblem('https://res.cloudinary.com/someone-else/image/upload/f2c/payment/x.jpg', cloud),
    null,
  )
  assert.notEqual(
    screenshotProblem('https://res.cloudinary.com/f2c-demo/image/upload/f2c/product/pickle.jpg', cloud),
    null,
  )
})

/** With uploads off there is no way to attach one, so none can be demanded. */
test('with uploads switched off, a screenshot is not required', () => {
  assert.equal(screenshotProblem(undefined, null), null)
})

test('the payment time must be a real time, not in the future, and recent', () => {
  const now = Date.parse('2026-09-15T12:00:00Z')
  assert.notEqual(paidAtProblem(undefined, now), null)
  assert.notEqual(paidAtProblem('yesterday', now), null)
  assert.equal(paidAtProblem('2026-09-15T11:40:00Z', now), null)
  // A phone clock a few minutes fast is not a lie.
  assert.equal(paidAtProblem('2026-09-15T12:05:00Z', now), null)
  assert.notEqual(paidAtProblem('2026-09-15T14:00:00Z', now), null)
  const tooOld = new Date(now - (PAID_AT_MAX_AGE_DAYS + 1) * 86_400_000).toISOString()
  assert.notEqual(paidAtProblem(tooOld, now), null)
})

test('approval needs all three checks, not some of them', () => {
  assert.equal(allChecksDone(undefined), false)
  assert.equal(allChecksDone([]), false)
  assert.equal(allChecksDone(['utr', 'dateTime']), false)
  assert.equal(allChecksDone('utr,dateTime,received'), false)
  assert.equal(allChecksDone(['received', 'utr', 'dateTime']), true)
})

/**
 * One UTR is one payment. A farmer resending their own approved UTR would
 * turn one ₹50 into a second pack, so their own rows count too. A rejected
 * row does not: resending after a rejection is the correction we asked for.
 */
test('a UTR already used, even by the same farmer, is flagged; a rejected one is not', () => {
  const rows = (status: SubscriptionPayment['status']) => [{ utr: '512309887711', status }]
  assert.equal(isDuplicateUtr(rows('APPROVED'), '512309887711'), true, 'own approved UTR again')
  assert.equal(isDuplicateUtr(rows('PENDING'), '512309887711'), true)
  assert.equal(isDuplicateUtr(rows('REJECTED'), '512309887711'), false, 'a correction after rejection')
  assert.equal(isDuplicateUtr(rows('APPROVED'), '999999999999'), false)
})

/** The payer UPI is reconciled against a bank statement: it has to be an address, and short. */
test('the payer UPI ID must look like one and stay short; absent is fine', () => {
  assert.equal(payerUpiProblem(undefined), null)
  assert.equal(payerUpiProblem(''), null)
  assert.equal(payerUpiProblem('9822011223@ybl'), null)
  assert.notEqual(payerUpiProblem('not an address'), null)
  assert.notEqual(payerUpiProblem(`${'a'.repeat(PAYER_UPI_MAX)}@ybl`), null)
  assert.notEqual(payerUpiProblem(42), null)
})

/** With uploads off nothing was signed, so a client-sent link is not stored as proof. */
test('a screenshot URL is only kept when uploads are on', () => {
  assert.equal(storedScreenshot(ours, null), undefined)
  assert.equal(storedScreenshot(ours, cloud), ours)
  assert.equal(storedScreenshot('', cloud), undefined)
})
