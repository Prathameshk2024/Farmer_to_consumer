import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PAID_AT_MAX_AGE_DAYS, allChecksDone, paidAtProblem } from '@shared/payment.js'
import { screenshotProblem } from '../src/db/payments.js'

/**
 * THE ₹50 NEEDS PROOF, NOT JUST TWELVE DIGITS.
 *
 * Anybody can type a twelve-digit number, and approving it grants five slots.
 * So a subscription payment arrives with a screenshot of the UPI app's success
 * screen and the time she paid, and an admin cannot approve it without saying
 * they matched the UTR, the date and time, and found the money.
 */

const cloud = { cloudName: 'shantai', folder: 'shanta-mahila-bazar' }
const ours = 'https://res.cloudinary.com/shantai/image/upload/v1726400000/shanta-mahila-bazar/payment/abc123.jpg'

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
 * account, must not stand in for her payment.
 */
test('a link from anywhere else is not a payment screenshot', () => {
  assert.notEqual(screenshotProblem('https://i.imgur.com/receipt.jpg', cloud), null)
  assert.notEqual(
    screenshotProblem('https://res.cloudinary.com/someone-else/image/upload/shanta-mahila-bazar/payment/x.jpg', cloud),
    null,
  )
  assert.notEqual(
    screenshotProblem('https://res.cloudinary.com/shantai/image/upload/shanta-mahila-bazar/product/pickle.jpg', cloud),
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
