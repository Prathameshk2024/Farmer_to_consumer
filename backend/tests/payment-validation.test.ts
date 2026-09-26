import test from 'node:test'
import assert from 'node:assert/strict'
import {
  UTR_LENGTH, isValidUtr, normalizeUtr, normalizeUpi, upiProblem, utrProblem,
} from '@shared/payment.js'
import { isValidUpi } from '@shared/seller.js'

/**
 * Both numbers here are typed by hand off another app, and there is no gateway
 * to catch a mistake afterwards. A wrong UPI ID sends the money to a stranger;
 * a wrong UTR leaves a real payment with nothing to match it against.
 *
 * The rule these replace was `length < 6` on both sides of both flows.
 */

test('a UTR is exactly twelve digits, because that is the RRN a bank statement shows', () => {
  assert.equal(UTR_LENGTH, 12)
  assert.ok(isValidUtr('512309887711'))

  // What the old rule let through.
  assert.ok(!isValidUtr('123456'), 'six digits is not a UTR')
  assert.ok(!isValidUtr('asdfgh'), 'letters are not a UTR')
  assert.ok(!isValidUtr(''), 'empty is not a UTR')
  assert.ok(!isValidUtr(undefined))

  // One digit either side of twelve is the mistake that actually happens -
  // a missed keystroke or a doubled one while reading off a second screen.
  assert.ok(!isValidUtr('51230988771'))
  assert.ok(!isValidUtr('5123098877112'))
})

test('spaces and hyphens are how apps print it, so they are not a mistake', () => {
  assert.equal(normalizeUtr('5123 0988 7711'), '512309887711')
  assert.equal(normalizeUtr('512309-887711'), '512309887711')
  assert.ok(isValidUtr(' 5123 0988 7711 '))
})

test("PhonePe's own long reference is refused rather than trimmed into one", () => {
  /**
   * This is the whole reason `normalizeUtr` strips only spaces and hyphens.
   * Stripping every non-digit would turn this into twelve-plus digits that
   * were never an RRN, and truncating it would invent one that looks perfect
   * and matches no line in any statement - the one failure a seller checking
   * by eye cannot catch.
   */
  const phonePeTxnId = 'T2409141633123456789'
  assert.ok(!isValidUtr(phonePeTxnId))
  assert.match(utrProblem(phonePeTxnId) ?? '', /अंक/)
})

test('a UTR problem says which way it is wrong, not just that it is', () => {
  assert.equal(utrProblem('512309887711'), null)
  assert.match(utrProblem('') ?? '', /12 अंकी/)
  assert.match(utrProblem('51230988') ?? '', /8 अंक/, 'counts back what she typed')
  assert.match(utrProblem('5123098877aa') ?? '', /फक्त अंक/)
})

test('a UPI ID needs a local part and a handle, with exactly one @', () => {
  assert.equal(upiProblem('sunita@ybl'), null)
  assert.equal(upiProblem('9822011223@ybl'), null, 'a phone number VPA is ordinary')
  assert.equal(upiProblem('sunita.aluare@okaxis'), null)

  assert.ok(upiProblem('sunita'), 'no @ at all')
  assert.ok(upiProblem('sunita@ybl@ok'), 'two @')
  assert.ok(upiProblem('@ybl'), 'nothing in front of it')
  assert.ok(upiProblem('sunita@'), 'nothing behind it')
})

test('separators may not lead, trail or double up', () => {
  // A doubled dot is what survives reading an ID aloud down a phone line, and
  // no real VPA has one - so it is safe to refuse and invisible otherwise.
  assert.ok(upiProblem('sunita..k@ybl'))
  assert.ok(upiProblem('.sunita@ybl'))
  assert.ok(upiProblem('sunita.@ybl'))
  assert.ok(upiProblem('sunita_-k@ybl'))
})

test('a handle one character off a real one is a typo, and is named as one', () => {
  /**
   * The half of the address she cannot check herself. "sunita" she can read
   * back; "ybl" she cannot, and "ybll" looks exactly as correct to her.
   */
  const problem = upiProblem('sunita@ybll')
  assert.ok(problem)
  assert.match(problem, /@ybl/, 'offers the real handle back')

  assert.match(upiProblem('sunita@okaxs') ?? '', /@okaxis/)
  assert.match(upiProblem('sunita@payt') ?? '', /@paytm/)
})

test('an unknown handle that is NOT a near miss is allowed through', () => {
  /**
   * This is the deliberate hole in the check, and it has to stay open. New
   * banks and new apps appear and this file does not; refusing a seller's real
   * UPI ID because the list is a year old would cost her every order she
   * takes, which is worse than any typo this catches.
   */
  assert.equal(upiProblem('sunita@newbankofindia'), null)
  assert.equal(upiProblem('sunita@zzqqxx'), null)
})

test('case and surrounding space do not change an address', () => {
  assert.equal(normalizeUpi('  Sunita@YBL  '), 'sunita@ybl')
  assert.equal(upiProblem('Sunita@YBL'), null)
})

test('isValidUpi is the same check, so every caller tightened at once', () => {
  // Seven call sites across registration, profile edit and the QR screen read
  // this rather than upiProblem. They must not be able to disagree with it.
  for (const value of ['sunita@ybl', 'sunita@ybll', 'sunita', '', 'sunita..k@ybl']) {
    assert.equal(isValidUpi(value), upiProblem(value) === null, value)
  }
})
