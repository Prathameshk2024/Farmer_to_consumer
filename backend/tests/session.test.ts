import { test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'

process.env.SESSION_SECRET = 'test-secret-for-unit-tests'

const { signToken, verifyToken, shouldRefresh, SESSION_IDLE_MS } =
  await import('../src/auth/tokens.js')

/**
 * Sessions expire on inactivity.
 *
 * The window differs by role because the risk does. An admin token approves
 * payments, blocks sellers and reads every buyer's address, and it is used at
 * a desk where signing in again costs nothing - so it is short. A seller's
 * token is on a phone in a village, and re-issuing it costs an SMS and a
 * literacy hurdle, so it lives longer.
 *
 * The window is IDLE, not absolute: every authenticated request slides it
 * forward, so someone using the app daily is never signed out mid-task.
 *
 * This file covers the TOKEN half of that. The session record enforces the
 * same window server-side and adds the absolute ceiling - see sessions.test.ts
 * - because a client that simply refuses to hand its token back could
 * otherwise keep an old one alive by never letting it be re-stamped.
 */

const HOUR = 3_600_000
const DAY = 24 * HOUR

const admin = { sid: 'sess_admin', role: 'admin' as const }
const seller = { sid: 'sess_seller', role: 'seller' as const }

test('the idle windows are the ones we intend', () => {
  assert.equal(SESSION_IDLE_MS.admin, 8 * HOUR, 'admin: one working day at most')
  // Inactive for more than 15 days: signed out. Asked for by the programme.
  assert.equal(SESSION_IDLE_MS.seller, 15 * DAY)
  assert.equal(SESSION_IDLE_MS.customer, 15 * DAY)
})

test('a fresh token verifies', () => {
  const now = Date.now()
  assert.equal(verifyToken(signToken(admin, now), now)?.sid, 'sess_admin')
})

test('an admin token dies after eight idle hours', () => {
  const issued = Date.now()
  const token = signToken(admin, issued)

  assert.ok(verifyToken(token, issued + 7 * HOUR), 'still good at 7h')
  assert.equal(verifyToken(token, issued + 9 * HOUR), null, 'gone at 9h')
})

test('a seller is not signed out overnight the way an admin is', () => {
  const issued = Date.now()
  const token = signToken(seller, issued)

  assert.ok(verifyToken(token, issued + 3 * DAY), 'a seller may not open the app for days')
  assert.ok(verifyToken(token, issued + 14 * DAY), 'two weeks away is still signed in')
  assert.equal(verifyToken(token, issued + 16 * DAY), null, 'gone after 15 idle days')
})

test('a token with no issue time is refused', () => {
  // The pre-expiry format. Accepting it would leave every existing session
  // immortal, which is the bug this whole change exists to fix.
  const legacy = Buffer.from(JSON.stringify(admin), 'utf8').toString('base64url')
  const sig = crypto
    .createHmac('sha256', process.env.SESSION_SECRET!)
    .update(`session-v2 ${legacy}`)
    .digest('base64url')

  assert.equal(verifyToken(`${legacy}.${sig}`, Date.now()), null)
})

test('a tampered issue time does not buy more time', () => {
  const issued = Date.now() - 10 * HOUR
  const token = signToken(admin, issued)
  const [, sig] = token.split('.')

  // Re-date the payload to now, keep the real signature.
  const forged = Buffer.from(
    JSON.stringify({ ...admin, iat: Date.now() }), 'utf8',
  ).toString('base64url')

  assert.equal(verifyToken(`${forged}.${sig}`, Date.now()), null)
})

test('a clock-skewed future timestamp is refused too', () => {
  // Otherwise a forged-but-somehow-signed token dated next year would be
  // accepted for a year rather than rejected outright.
  const now = Date.now()
  assert.equal(verifyToken(signToken(admin, now + 10 * HOUR), now), null)
})

/* ---------------- sliding the window ---------------- */

test('a token past halfway through its window is refreshed', () => {
  const issued = Date.now()
  const claims = verifyToken(signToken(admin, issued), issued + 5 * HOUR)!

  assert.equal(shouldRefresh(claims, issued + 5 * HOUR), true)
})

test('a token still early in its window is left alone', () => {
  // Re-issuing on every request would mean a new token on every page load for
  // no benefit, and a client that loses one mid-flight signs the user out.
  const issued = Date.now()
  const claims = verifyToken(signToken(admin, issued), issued + 1 * HOUR)!

  assert.equal(shouldRefresh(claims, issued + 1 * HOUR), false)
})

test('a seller browsing daily is never signed out', () => {
  // Uses the app every 2 days for a month; each visit slides the window.
  let token = signToken(seller, Date.now())
  let now = Date.now()

  for (let visit = 0; visit < 15; visit++) {
    now += 2 * DAY
    const claims = verifyToken(token, now)
    assert.ok(claims, `signed out on visit ${visit}`)
    if (shouldRefresh(claims, now)) token = signToken(claims, now)
  }
})
