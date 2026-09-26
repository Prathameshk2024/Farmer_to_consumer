import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

process.env.SESSION_SECRET = 'test-secret-for-unit-tests'
delete process.env.NODE_ENV

const { emptyDb } = await import('../src/db/seed.js')
const { consumeTicket, issueTicket, resetSpentTickets } = await import('../src/auth/tickets.js')
const {
  authenticateAdmin, createAdmin, findAdminByEmail, MIN_ADMIN_PASSWORD, passwordProblem,
} = await import('../src/auth/admins.js')
const { hashPassword, maskPhone, randomCode, timingEqual, verifyPassword } =
  await import('../src/auth/crypto.js')
const { hit, LIMITS, resetAllLimits, sweep } = await import('../src/auth/rateLimit.js')

/* ================================================================== */
/* The verified-phone ticket                                           */
/* ================================================================== */

/**
 * `POST /sellers/register` used to read a phone number out of the request body
 * and mint a seller session for it. No OTP, no session, no check of any kind -
 * so anybody who could reach the API could create an account against any
 * unregistered number and be signed in as her. The client walked through the
 * OTP screen first, which is not the same thing as the server requiring it.
 */

beforeEach(() => {
  resetSpentTickets()
  resetAllLimits()
})

test('a ticket hands back the phone it was issued for', () => {
  assert.equal(consumeTicket('seller-register', issueTicket('seller-register', '9822011223')), '9822011223')
})

test('a ticket is single use', () => {
  // Otherwise one OTP could register any number of accounts.
  const ticket = issueTicket('seller-register', '9822011223')

  assert.equal(consumeTicket('seller-register', ticket), '9822011223')
  assert.equal(consumeTicket('seller-register', ticket), null)
})

test('a ticket expires', () => {
  const now = Date.now()
  const ticket = issueTicket('seller-register', '9822011223', now)

  assert.equal(consumeTicket('seller-register', ticket, now + 20 * 60_000), null)
})

test('the phone inside a ticket cannot be rewritten', () => {
  // The attack the signature exists to stop: pass the OTP on your own number,
  // then swap in hers before registering.
  const ticket = issueTicket('seller-register', '9822011223')
  const [, sig] = ticket.split('.')
  const forged = Buffer.from(
    JSON.stringify({ purpose: 'seller-register', phone: '9764455661', exp: Date.now() + 60_000, jti: 'x' }),
    'utf8',
  ).toString('base64url')

  assert.equal(consumeTicket('seller-register', `${forged}.${sig}`), null)
})

test('garbage is refused without throwing', () => {
  for (const bad of ['', '.', 'a.b', 'not base64!.nope']) {
    assert.equal(consumeTicket('seller-register', bad), null)
  }
})

/* ================================================================== */
/* Admin passwords                                                     */
/* ================================================================== */

/**
 * The admin login used to be `password !== process.env.ADMIN_PASSWORD`, with a
 * default of `changeme`, and the EMAIL was never checked at all - so any string
 * plus the right password got in, and that string was written into `verifiedBy`
 * on approved payments. The audit trail was attacker-controlled.
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

test('an OTP guessing run is cut off well before the code space is', () => {
  // Ten attempts per fifteen minutes against a million-wide code. The point is
  // to make the arithmetic hopeless rather than merely slow.
  const limit = LIMITS.otpVerifyPerPhone
  for (let i = 0; i < limit.max; i++) {
    assert.equal(hit('otp:verify:phone:9822011223', limit).ok, true, `attempt ${i + 1}`)
  }
  const blocked = hit('otp:verify:phone:9822011223', limit)

  assert.equal(blocked.ok, false)
  assert.ok(blocked.retryAfterSec > 0, 'the client is told when to come back')
})

test('the window reopens, so a mistyped code is not a permanent lockout', () => {
  const limit = LIMITS.adminLoginPerEmail
  const now = Date.now()

  for (let i = 0; i <= limit.max; i++) hit('admin:login:email:rekha', limit, now)
  assert.equal(hit('admin:login:email:rekha', limit, now).ok, false)
  assert.equal(hit('admin:login:email:rekha', limit, now + limit.windowMs + 1).ok, true)
})

test('one subject being blocked does not block anybody else', () => {
  // Per-phone and per-IP keys are separate on purpose: a whole village behind
  // one carrier NAT must not be locked out by one bad actor, and one attacker
  // must not be able to lock a specific woman out of her own account.
  const limit = LIMITS.otpVerifyPerPhone
  for (let i = 0; i <= limit.max; i++) hit('otp:verify:phone:9822011223', limit)

  assert.equal(hit('otp:verify:phone:9764455661', limit).ok, true)
})

test('a number gets three codes a day, and the fourth is refused', () => {
  /**
   * Three per number per twenty-four hours, and every SMS counts against it -
   * the first send and every "send again" alike, because each one is a message
   * somebody pays for.
   *
   * This limit is only real if the widget path goes through /auth/otp/send as
   * well. It does not deliver anything there - the browser already sent the
   * SMS - so it was skipped for a while, and while it was skipped this rule
   * existed only as a sentence in a comment. Auth.tsx now calls it BEFORE
   * asking the widget to send, which is the difference between a limit and a
   * counter.
   */
  const limit = LIMITS.otpSendPerPhone
  const now = Date.now()

  assert.equal(limit.max, 3)
  assert.equal(limit.windowMs, 24 * 60 * 60 * 1000)

  for (let i = 0; i < limit.max; i++) {
    assert.equal(hit('otp:send:phone:9764455662', limit, now).ok, true, `code ${i + 1}`)
  }

  const fourth = hit('otp:send:phone:9764455662', limit, now)
  assert.equal(fourth.ok, false)
  assert.ok(fourth.retryAfterSec > 20 * 60 * 60, 'she is told to come back tomorrow, not in a minute')

  // And tomorrow she can, because a quota is not a ban.
  assert.equal(hit('otp:send:phone:9764455662', limit, now + limit.windowMs + 1).ok, true)
})

test('expired windows are swept, so the limiter is not a log of everyone who tried', () => {
  const now = Date.now()
  hit('otp:send:phone:9822011223', LIMITS.otpSendPerPhone, now)

  assert.equal(sweep(now + LIMITS.otpSendPerPhone.windowMs + 1000), 1)
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

test('codes are drawn across the whole range, including leading zeros', () => {
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
