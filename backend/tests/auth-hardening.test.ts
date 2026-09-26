import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

process.env.SESSION_SECRET = 'test-secret-for-unit-tests'
delete process.env.NODE_ENV

const { emptyDb } = await import('../src/db/seed.js')
const {
  authenticateAdmin, createAdmin, findAdminByEmail, MIN_ADMIN_PASSWORD, passwordProblem,
} = await import('../src/auth/admins.js')
const { hashPassword, maskPhone, randomCode, timingEqual, verifyPassword } =
  await import('../src/auth/crypto.js')
const { hit, LIMITS, resetAllLimits, sweep } = await import('../src/auth/rateLimit.js')

beforeEach(() => {
  resetAllLimits()
})

/* ================================================================== */
/* Admin passwords                                                     */
/* ================================================================== */

/**
 * The admin login used to be `password !== process.env.ADMIN_PASSWORD`, with a
 * default of `changeme`, and the EMAIL was never checked at all - so any string
 * plus the right password got in, and that string was written into `verifiedBy`
 * on admin decisions. The audit trail was attacker-controlled.
 */

test('a password verifies against its own hash and nothing else', () => {
  const hash = hashPassword('correct horse battery staple')

  assert.equal(verifyPassword('correct horse battery staple', hash), true)
  assert.equal(verifyPassword('Correct horse battery staple', hash), false)
})

test('the same password hashes differently every time', () => {
  // Per-password salt. Without it, two coordinators who chose the same
  // password would be visibly identical in the database, and one rainbow table
  // would open both.
  assert.notEqual(hashPassword('same-password-twice'), hashPassword('same-password-twice'))
})

test('a stored hash reveals neither the password nor a usable prefix', () => {
  const hash = hashPassword('a-very-secret-passphrase')

  assert.ok(hash.startsWith('scrypt$'), 'the parameters travel with the hash')
  assert.ok(!hash.includes('a-very-secret-passphrase'))
})

test('a malformed or empty stored hash never authenticates', () => {
  // A record damaged in migration must fail closed, not open.
  for (const bad of ['', 'changeme', 'scrypt$', 'scrypt$1$2$3', 'md5$x$y']) {
    assert.equal(verifyPassword('anything', bad), false, `expected refusal for ${JSON.stringify(bad)}`)
  }
})

test('an unknown email is refused, and so is the wrong password', () => {
  const db = emptyDb()
  createAdmin(db, { email: 'Rekha@College.in', name: 'Rekha', password: 'a-long-enough-passphrase' })

  assert.equal(authenticateAdmin(db, 'nobody@college.in', 'a-long-enough-passphrase').ok, false)
  assert.equal(authenticateAdmin(db, 'rekha@college.in', 'wrong').ok, false)
  assert.equal(authenticateAdmin(db, 'rekha@college.in', 'a-long-enough-passphrase').ok, true)
})

test('the email is matched case-insensitively but stored as typed', () => {
  const db = emptyDb()
  createAdmin(db, { email: 'Rekha@College.in', name: 'Rekha', password: 'a-long-enough-passphrase' })

  assert.equal(findAdminByEmail(db, 'REKHA@college.IN')?.email, 'Rekha@College.in')
})

test('a disabled administrator cannot sign in, and is not deleted', () => {
  // Disabled rather than removed, so past approvals keep pointing at a name.
  const db = emptyDb()
  const admin = createAdmin(db, { email: 'rekha@college.in', name: 'Rekha', password: 'a-long-enough-passphrase' })
  admin.disabledAt = new Date().toISOString()

  const result = authenticateAdmin(db, 'rekha@college.in', 'a-long-enough-passphrase')
  assert.equal(result.ok, false)
  assert.equal(db.admins.length, 1)
})

test('short passwords are refused before they are ever hashed', () => {
  assert.ok(passwordProblem('short'))
  assert.equal(passwordProblem('x'.repeat(MIN_ADMIN_PASSWORD)), null)
})

/* ================================================================== */
/* Rate limiting                                                       */
/* ================================================================== */

test('a password guessing run is cut off well before the space is', () => {
  // Five attempts per fifteen minutes against a six-digit password. The point
  // is to make the arithmetic hopeless rather than merely slow.
  const limit = LIMITS.loginPerPhone
  for (let i = 0; i < limit.max; i++) {
    assert.equal(hit('login:phone:9822011223', limit).ok, true, `attempt ${i + 1}`)
  }
  const blocked = hit('login:phone:9822011223', limit)

  assert.equal(blocked.ok, false)
  assert.ok(blocked.retryAfterSec > 0, 'the client is told when to come back')
})

test('the window reopens, so a mistyped password is not a permanent lockout', () => {
  const limit = LIMITS.adminLoginPerEmail
  const now = Date.now()

  for (let i = 0; i <= limit.max; i++) hit('admin:login:email:rekha', limit, now)
  assert.equal(hit('admin:login:email:rekha', limit, now).ok, false)
  assert.equal(hit('admin:login:email:rekha', limit, now + limit.windowMs + 1).ok, true)
})

test('one subject being blocked does not block anybody else', () => {
  // Per-phone and per-IP keys are separate on purpose: a whole village behind
  // one carrier NAT must not be locked out by one bad actor, and one attacker
  // must not be able to lock a specific person out of their own account.
  const limit = LIMITS.loginPerPhone
  for (let i = 0; i <= limit.max; i++) hit('login:phone:9822011223', limit)

  assert.equal(hit('login:phone:9764455661', limit).ok, true)
})

test('a number gets three forgot-password requests a day, and the fourth is refused', () => {
  const limit = LIMITS.resetRequestPerPhone
  const now = Date.now()

  for (let i = 0; i < limit.max; i++) {
    assert.equal(hit('reset:phone:9764455662', limit, now).ok, true, `request ${i + 1}`)
  }

  const fourth = hit('reset:phone:9764455662', limit, now)
  assert.equal(fourth.ok, false)
  assert.ok(fourth.retryAfterSec > 20 * 60 * 60, 'they are told to come back tomorrow, not in a minute')

  // And tomorrow they can, because a quota is not a ban.
  assert.equal(hit('reset:phone:9764455662', limit, now + limit.windowMs + 1).ok, true)
})

test('expired windows are swept, so the limiter is not a log of everyone who tried', () => {
  const now = Date.now()
  hit('reset:phone:9822011223', LIMITS.resetRequestPerPhone, now)

  assert.equal(sweep(now + LIMITS.resetRequestPerPhone.windowMs + 1000), 1)
})

/* ================================================================== */
/* Primitives                                                          */
/* ================================================================== */

test('a masked phone is recognisable but not dialable', () => {
  // The audit trail has to answer "which number?" for someone who already
  // knows it, without being a phone-number dump if the log itself leaks.
  assert.equal(maskPhone('9822011223'), '98******23')
  assert.equal(maskPhone(''), '****')
})

test('temporary passwords are drawn across the whole range, including leading zeros', () => {
  const seen = new Set<string>()
  for (let i = 0; i < 500; i++) seen.add(randomCode(6))

  assert.ok(seen.size > 450, 'codes should not repeat much over 500 draws')
  for (const code of seen) assert.match(code, /^\d{6}$/)
})

test('timingEqual is false for mismatched and empty input, and never throws', () => {
  assert.equal(timingEqual('abc', 'abc'), true)
  assert.equal(timingEqual('abc', 'abd'), false)
  assert.equal(timingEqual('abc', 'abcd'), false, 'a length mismatch must not throw')
  assert.equal(timingEqual('', ''), false, 'empty is never a match')
})
