import { test } from 'node:test'
import assert from 'node:assert/strict'
import { upiProblem } from '@shared/payment.js'
import { ADMIN_PAYMENT_ACCOUNT } from '../src/config.js'

/**
 * WHERE EVERY ₹50 GOES.
 *
 * One string decides that, it is typed by hand, and nothing downstream can
 * catch it being wrong: the QR is generated from it, so a typo produces a
 * perfectly scannable code that pays a stranger - and the woman who paid has
 * a valid UTR for a transaction that never reached the programme.
 *
 * It sat in `db/seed.ts` as `shantabazar@okaxis`, invented alongside three
 * invented sellers, which is the last place a real payee should live.
 */

test('the admin payee is a UPI address that can actually be paid', () => {
  assert.equal(upiProblem(ADMIN_PAYMENT_ACCOUNT.upiId), null)
})

test('the payee is named, so her UPI app can be checked against the screen', () => {
  assert.ok(ADMIN_PAYMENT_ACCOUNT.label.trim().length > 0)
  assert.ok(ADMIN_PAYMENT_ACCOUNT.bankName.trim().length > 0)
})

/** The demo account must never be what a real seller is asked to pay. */
test('the placeholder account is gone', () => {
  assert.notEqual(ADMIN_PAYMENT_ACCOUNT.upiId, 'shantabazar@okaxis')
})
