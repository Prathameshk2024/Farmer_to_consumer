import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

process.env.SESSION_SECRET = 'test-secret-for-unit-tests'
const { emptyDb } = await import('../src/db/seed.js')
const { setCredential, checkPassword, findCredential, removeCredential } =
  await import('../src/auth/credentials.js')
const { passwordProblemMr, MIN_PASSWORD } = await import('@shared/password.js')
const { hit, LIMITS, resetAllLimits } = await import('../src/auth/rateLimit.js')

/**
 * No SMS, so the password is the whole proof of who is signing in. It is
 * stored apart from the farmer and customer rows because those rows are
 * sent to their owners' phones whole; a hash on them would travel too.
 */

let db = emptyDb()
beforeEach(() => { db = emptyDb(); resetAllLimits() })

test('six digits are enough; five are not', () => {
  assert.equal(MIN_PASSWORD, 6)
  assert.equal(passwordProblemMr('123456'), null, 'a PIN is what a farmer remembers')
  assert.ok(passwordProblemMr('12345'))
  assert.ok(passwordProblemMr(' 123456'), 'a leading space is a typo nobody can see')
})

test('the right password signs in; the wrong one does not', () => {
  setCredential(db, { role: 'farmer', userId: 'f1', phone: '9822011223', password: '482913' })
  assert.equal(checkPassword(db, 'farmer', '9822011223', '482913')?.userId, 'f1')
  assert.equal(checkPassword(db, 'farmer', '9822011223', '482914'), null)
})

test('a phone typed with +91 and spaces is the same account', () => {
  setCredential(db, { role: 'farmer', userId: 'f1', phone: '9822011223', password: '482913' })
  assert.equal(checkPassword(db, 'farmer', '+91 98220 11223', '482913')?.userId, 'f1')
})

test('a farmer password does not open a buyer account on the same phone', () => {
  setCredential(db, { role: 'farmer', userId: 'f1', phone: '9822011223', password: '482913' })
  assert.equal(checkPassword(db, 'customer', '9822011223', '482913'), null)
})

test('the hash is never the password', () => {
  setCredential(db, { role: 'customer', userId: 'c-9822011223', phone: '9822011223', password: '482913' })
  const row = findCredential(db, 'customer', '9822011223')!
  assert.ok(row.passwordHash.startsWith('scrypt$'))
  assert.ok(!row.passwordHash.includes('482913'))
})

test('setting a password again replaces it rather than adding a row', () => {
  setCredential(db, { role: 'farmer', userId: 'f1', phone: '9822011223', password: '482913' })
  setCredential(db, { role: 'farmer', userId: 'f1', phone: '9822011223', password: '111222', mustChange: true })
  assert.equal(db.credentials.length, 1)
  assert.equal(db.credentials[0].mustChangePassword, true)
  assert.equal(checkPassword(db, 'farmer', '9822011223', '482913'), null)
})

test('closing an account removes its credential', () => {
  setCredential(db, { role: 'farmer', userId: 'f1', phone: '9822011223', password: '482913' })
  removeCredential(db, 'f1')
  assert.equal(db.credentials.length, 0)
})

test('five wrong guesses per phone, then a wait', () => {
  assert.deepEqual(LIMITS.loginPerPhone, { max: 5, windowMs: 15 * 60 * 1000 })
  for (let i = 0; i < 5; i++) assert.ok(hit('login:phone:9822011223', LIMITS.loginPerPhone).ok)
  assert.equal(hit('login:phone:9822011223', LIMITS.loginPerPhone).ok, false)
})
