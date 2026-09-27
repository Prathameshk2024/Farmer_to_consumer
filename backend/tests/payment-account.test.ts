import { test } from 'node:test'
import assert from 'node:assert/strict'
import { upiProblem } from '@shared/payment.js'
import { ADMIN_PAYMENT_ACCOUNT } from '../src/config.js'

/**
 * WHERE EVERY ₹50 GOES.
 *
 * One string decides that, it is typed by hand, and nothing downstream can
 * catch it being wrong: the QR is generated from it, so a typo produces a
 * perfectly scannable code that pays a stranger - and the farmer who paid has
 * a valid UTR for a transaction that never reached the programme.
 *
 * It once sat in `db/seed.ts` as a placeholder handle, invented alongside
 * invented farmers, which is the last place a real payee should live.
 */

test('the admin payee is a UPI address that can actually be paid', () => {
  assert.equal(upiProblem(ADMIN_PAYMENT_ACCOUNT.upiId), null)
})

test('the payee is named, so a UPI app can be checked against the screen', () => {
  assert.ok(ADMIN_PAYMENT_ACCOUNT.label.trim().length > 0)
  assert.ok(ADMIN_PAYMENT_ACCOUNT.bankName.trim().length > 0)
})

/** The demo account must never be what a real farmer is asked to pay. */
test('the placeholder account is gone', () => {
  assert.notEqual(ADMIN_PAYMENT_ACCOUNT.upiId, 'demo-payee@okaxis')
  assert.doesNotMatch(ADMIN_PAYMENT_ACCOUNT.upiId, /demo|example|placeholder/i)
})

/**
 * No account number or IFSC. The farmer pays by UPI, so those lines would
 * never be used, and a wrong account number printed under a QR is worse than
 * none - it sends a careful payer to the wrong bank account.
 */
test('the payee carries a name, a UPI ID and a bank name - no account number, no IFSC', () => {
  assert.deepEqual(Object.keys(ADMIN_PAYMENT_ACCOUNT).sort(), ['bankName', 'label', 'upiId'])
})
