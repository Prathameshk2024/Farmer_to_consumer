import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.SESSION_SECRET = 'test-secret-for-unit-tests'

const { emptyDb } = await import('../src/db/seed.js')
const {
  createSession, findLiveSession, liveSessionsForUser, MAX_SESSIONS_PER_USER,
  pruneSessions, revokeAllForUser, revokeSession, touchSession,
  TOUCH_RESOLUTION_MS,
} = await import('../src/auth/sessions.js')

/**
 * THE REGISTRY IS WHAT MAKES A SESSION REVOCABLE.
 *
 * Before it existed, "log out" cleared localStorage and nothing else: the
 * token stayed valid for its whole seven-day window, so a woman who signed out
 * on a borrowed phone had not signed out of anything, and a stolen token could
 * not be killed at all without changing the signing key and ejecting every
 * user on the platform at once.
 *
 * Every test below is one property of that promise.
 */

const HOUR = 3_600_000
const DAY = 24 * HOUR

function dbWithSeller(now = Date.now()) {
  const db = emptyDb()
  const session = createSession(db, { role: 'seller', userId: 's1', sellerId: 's1', phone: '9822011223' }, now)
  return { db, session }
}

test('a fresh session resolves', () => {
  const now = Date.now()
  const { db, session } = dbWithSeller(now)

  assert.equal(findLiveSession(db, session.id, now)?.userId, 's1')
})

test('an unknown session id resolves to nothing', () => {
  const { db } = dbWithSeller()
  assert.equal(findLiveSession(db, 'sess_not_a_real_id'), null)
})

test('logging out kills the session immediately', () => {
  // The whole point. A token pointing here is worthless from this moment,
  // however well signed it is and however much of its window is left.
  const now = Date.now()
  const { db, session } = dbWithSeller(now)

  assert.equal(revokeSession(db, session.id, 'logout', now), true)
  assert.equal(findLiveSession(db, session.id, now), null)
})

test('revoking twice is not an error the second time', () => {
  // A client tidying up after an expired session must not be handed a failure
  // for doing the right thing.
  const { db, session } = dbWithSeller()

  assert.equal(revokeSession(db, session.id, 'logout'), true)
  assert.equal(revokeSession(db, session.id, 'logout'), false)
})

test('her phone was stolen: every device signs out at once', () => {
  const db = emptyDb()
  for (let i = 0; i < 3; i++) {
    createSession(db, { role: 'seller', userId: 's1', sellerId: 's1' })
  }
  createSession(db, { role: 'customer', userId: 'c-9011223344', customerId: 'c-9011223344' })

  assert.equal(revokeAllForUser(db, 's1', 'admin'), 3)
  assert.equal(liveSessionsForUser(db, 's1').length, 0)
  // Somebody else's session is not collateral damage.
  assert.equal(liveSessionsForUser(db, 'c-9011223344').length, 1)
})

test('a session idles out on the server, not only in the token', () => {
  // A client that simply never hands its token back for re-stamping could
  // otherwise keep an old one alive. The record is the authority.
  const issued = Date.now()
  const { db, session } = dbWithSeller(issued)

  assert.ok(findLiveSession(db, session.id, issued + 14 * DAY))
  assert.equal(findLiveSession(db, session.id, issued + 16 * DAY), null)
})

test('an absolute ceiling ends even a session in constant use', () => {
  // Idle expiry alone means a quietly copied token can be kept alive forever
  // simply by being used. Ninety days is the hard stop for a seller.
  const issued = Date.now()
  const { db, session } = dbWithSeller(issued)

  // Kept perfectly warm the whole time.
  let now = issued
  for (let i = 0; i < 200; i++) {
    now += DAY
    touchSession(session, now)
  }

  assert.equal(findLiveSession(db, session.id, now), null, 'should be past its absolute expiry')
})

test('lastSeenAt is only worth persisting every few minutes', () => {
  // Every authenticated request slides the window; writing each one would turn
  // a page load into a database write per request.
  const now = Date.now()
  const { session } = dbWithSeller(now)

  assert.equal(touchSession(session, now + 60_000), false, 'a minute later: not worth a write')
  assert.equal(touchSession(session, now + TOUCH_RESOLUTION_MS + 1000), true)
})

test('signing in on an eleventh device retires the oldest, not the newest', () => {
  // Being unable to sign in on the phone in your hand is a far worse failure
  // than an old session on a device you have forgotten about ending.
  const db = emptyDb()
  const start = Date.now()

  const first = createSession(db, { role: 'customer', userId: 'c1', customerId: 'c1' }, start)
  for (let i = 1; i <= MAX_SESSIONS_PER_USER; i++) {
    createSession(db, { role: 'customer', userId: 'c1', customerId: 'c1' }, start + i * 1000)
  }

  const live = liveSessionsForUser(db, 'c1', start + 60_000)
  assert.equal(live.length, MAX_SESSIONS_PER_USER)
  assert.equal(findLiveSession(db, first.id, start + 60_000), null, 'the oldest went')
})

test('pruning drops what nothing can use, and keeps recent revocations', () => {
  // Revoked rows are kept a week so "was this token used after she logged
  // out?" is still answerable.
  const now = Date.now()
  const db = emptyDb()

  const idled = createSession(db, { role: 'seller', userId: 's1' }, now - 30 * DAY)
  const justRevoked = createSession(db, { role: 'seller', userId: 's2' }, now)
  const longRevoked = createSession(db, { role: 'seller', userId: 's3' }, now - 30 * DAY)

  revokeSession(db, justRevoked.id, 'logout', now)
  revokeSession(db, longRevoked.id, 'logout', now - 20 * DAY)

  pruneSessions(db, now)
  const ids = db.sessions.map((s) => s.id)

  assert.ok(!ids.includes(idled.id), 'an idled-out session is gone')
  assert.ok(ids.includes(justRevoked.id), 'a recent revocation is kept for the audit trail')
  assert.ok(!ids.includes(longRevoked.id), 'an old revocation is gone')
})

test('the admin ceiling is far shorter than them one', () => {
  // The role that releases money should not hold a session for three months.
  const now = Date.now()
  const db = emptyDb()

  const admin = createSession(db, { role: 'admin', userId: 'adm1' }, now)
  const seller = createSession(db, { role: 'seller', userId: 's1' }, now)

  assert.ok(Date.parse(admin.expiresAt) < Date.parse(seller.expiresAt))
})
