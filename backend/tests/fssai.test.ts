import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FSSAI_DIGITS, fssaiProblem, normalizeFssai } from '@shared/seller.js'

/**
 * A FOOD LICENCE NUMBER, IF SHE HAS ONE.
 *
 * Optional, and that is the design rather than an oversight: a home kitchen
 * under the FSSAI turnover threshold needs no licence, and demanding one as a
 * condition of listing would close this market to most of the women it was
 * built for. Blank is always a complete answer.
 *
 * Wrong, though, is not. A buyer who reads the number off a listing and looks
 * it up learns something only if the digits are real - so a number that cannot
 * be a licence is refused at the door rather than published as if checked.
 */

test('no number at all is a complete answer', () => {
  assert.equal(fssaiProblem(undefined), null)
  assert.equal(fssaiProblem(''), null)
  assert.equal(fssaiProblem('   '), null)
})

test('a real licence is fourteen digits', () => {
  assert.equal(FSSAI_DIGITS, 14)
  assert.equal(fssaiProblem('12345678901234'), null)
})

test('a number that cannot be a licence is refused', () => {
  // Thirteen digits, fifteen digits, or a word: each would look checked on a
  // listing and check out nowhere.
  assert.notEqual(fssaiProblem('1234567890123'), null)
  assert.notEqual(fssaiProblem('123456789012345'), null)
  assert.notEqual(fssaiProblem('FSSAI-12345'), null)
})

/**
 * It is printed on the certificate in groups, and she copies it as she sees
 * it. Spaces and hyphens come out rather than being called a mistake.
 */
test('it is read as she copies it from the certificate', () => {
  assert.equal(normalizeFssai('1234 5678 9012 34'), '12345678901234')
  assert.equal(normalizeFssai('12345678-901234'), '12345678901234')
  assert.equal(fssaiProblem('1234 5678 9012 34'), null)
})

/** The message names the length, because "invalid" tells her nothing to do. */
test('the refusal says what is wrong with it', () => {
  assert.match(String(fssaiProblem('123')), /14/)
})
