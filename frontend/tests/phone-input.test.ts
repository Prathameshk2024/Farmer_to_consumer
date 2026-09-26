import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isValidPhone, normalizePhone } from '@shared/farmer.js'
import { PHONE_INPUT_MAX } from '../src/lib/phone.js'

/**
 * The login, register and forgot-password boxes take the number as typed and
 * let `isValidPhone` (here) and `normalizePhone` (on the server) make ten
 * digits of it. They used to stop at ten characters and strip non-digits as
 * they typed, which turned "+91 98220 11223" into "9198220112" - a different
 * person's number, and a sign-in that could never work.
 */

const typed = ['+91 98220 11223', '+919822011223', '98220 11223', '09822011223', '9822011223']

test('every way they type their number fits in the box', () => {
  for (const t of typed) assert.ok(t.length <= PHONE_INPUT_MAX, t)
})

test('and every one of them is the same valid number', () => {
  for (const t of typed) {
    assert.ok(isValidPhone(t), t)
    assert.equal(normalizePhone(t), '9822011223', t)
  }
})

test('the old ten-character cut turned the +91 form into another number', () => {
  const cut = '+91 98220 11223'.replace(/\D/g, '').slice(0, 10)
  assert.equal(cut, '9198220112')
  assert.notEqual(normalizePhone(cut), '9822011223', "somebody else's number - why the box no longer strips and truncates")
})
