import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Farmer } from '@shared/types.js'
import { normalizePhone, samePhone } from '@shared/farmer.js'

/**
 * Why an already-registered farmer was being asked to register again.
 *
 * Registration stored the phone exactly as she typed it. Login normalised the
 * number to digits before looking it up. "98765 43210" and "+91 9876543210"
 * therefore never matched the stored value, the lookup found nobody, and the
 * app concluded she was new - sending her back through registration, where
 * the duplicate check compared raw strings too and happily let her through.
 *
 * The fix is to compare normalised numbers on both sides, so old records
 * stored in any format still resolve without a migration.
 */

function farmer(phone: string): Farmer {
  return { id: 's1', name: 'अर्पिता', phone } as Farmer
}

test('a phone number reduces to its ten digits', () => {
  assert.equal(normalizePhone('9876543210'), '9876543210')
  assert.equal(normalizePhone('98765 43210'), '9876543210')
  assert.equal(normalizePhone('+91 98765-43210'), '9876543210')
  assert.equal(normalizePhone('  8625981133  '), '8625981133')
})

test('a country code does not become part of the number', () => {
  // Otherwise "+919876543210" stores as 12 digits and never matches the 10
  // she types at login.
  assert.equal(normalizePhone('+919876543210'), '9876543210')
  assert.equal(normalizePhone('919876543210'), '9876543210')
  assert.equal(normalizePhone('09876543210'), '9876543210')
})

test('rubbish in does not throw', () => {
  assert.equal(normalizePhone(undefined), '')
  assert.equal(normalizePhone(''), '')
  assert.equal(normalizePhone('abc'), '')
})

test('two spellings of the same number are the same number', () => {
  assert.equal(samePhone('98765 43210', '9876543210'), true)
  assert.equal(samePhone('+91 9876543210', '9876543210'), true)
  assert.equal(samePhone('9876543210', '9876543211'), false)
})

test('an empty number never matches another empty one', () => {
  // Otherwise a farmer with no phone stored would match every login attempt
  // that also had no phone, and hand over her account.
  assert.equal(samePhone('', ''), false)
  assert.equal(samePhone(undefined, ''), false)
})

test('a farmer stored with a formatted number is still found at login', () => {
  const farmers = [farmer('98765 43210')]
  const typedAtLogin = '9876543210'

  const found = farmers.find((s) => samePhone(s.phone, typedAtLogin))

  assert.ok(found, 'this is the bug: she was told to register again')
})

test('a farmer stored with a country code is still found at login', () => {
  const farmers = [farmer('+91 9876543210')]

  assert.ok(farmers.find((s) => samePhone(s.phone, '9876543210')))
})

test('a different number still does not match', () => {
  const farmers = [farmer('9876543210')]

  assert.equal(farmers.find((s) => samePhone(s.phone, '9000000000')), undefined)
})
