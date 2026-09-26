import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.SESSION_SECRET = 'test-secret-for-unit-tests'

const { emptyDb } = await import('../src/db/seed.js')
const { createSession, revokeSession } = await import('../src/auth/sessions.js')
const { registerPushToken } = await import('../src/push/register.js')
const { pushTargets } = await import('../src/push/targets.js')

/**
 * WHO HEARS ABOUT IT.
 *
 * Only the phones where that seller (or that buyer) is signed in right now.
 * A session she logged out of, or one that expired, is not her any more, even
 * though its row is still in the table until pruning clears it.
 */

const T1 = 'fcm-token-1111111111111111111111'
const T2 = 'fcm-token-2222222222222222222222'

test("a seller's live sessions with a token are her targets, in their language", () => {
  const db = emptyDb()
  const a = createSession(db, { role: 'seller', userId: 's1', sellerId: 's1' })
  const b = createSession(db, { role: 'seller', userId: 's1', sellerId: 's1' })
  createSession(db, { role: 'seller', userId: 's2', sellerId: 's2' })
  registerPushToken(db, a.id, { token: T1, lang: 'mr' })
  registerPushToken(db, b.id, { token: T2, lang: 'en' })
  const got = pushTargets(db, { sellerId: 's1' }).sort((x, y) => x.token.localeCompare(y.token))
  assert.deepEqual(got.map((t) => [t.token, t.lang]), [[T1, 'mr'], [T2, 'en']])
})

test('a buyer is never sent a seller notification, or the reverse', () => {
  const db = emptyDb()
  const c = createSession(db, { role: 'customer', userId: 'c1', customerId: 'c1' })
  registerPushToken(db, c.id, { token: T1 })
  assert.deepEqual(pushTargets(db, { sellerId: 'c1' }), [])
  assert.equal(pushTargets(db, { customerId: 'c1' }).length, 1)
})

test('a logged-out session hears nothing', () => {
  const db = emptyDb()
  const s = createSession(db, { role: 'seller', userId: 's1', sellerId: 's1' })
  registerPushToken(db, s.id, { token: T1 })
  revokeSession(db, s.id, 'logout')
  assert.deepEqual(pushTargets(db, { sellerId: 's1' }), [])
})

/**
 * `registerPushToken` itself keeps a token unique by taking it off every
 * other session, but two rows can still end up sharing one FCM token - a
 * race between two logins on the same phone, or an old APK that registers
 * without going through that path. One phone must buzz once, for whoever is
 * using it now, so dedup falls back to whichever session was seen last.
 */
test('two live sessions sharing one token dedupe to the one seen more recently', () => {
  const db = emptyDb()
  const now = Date.now()
  const older = createSession(db, { role: 'seller', userId: 's1', sellerId: 's1' }, now)
  const newer = createSession(db, { role: 'seller', userId: 's1', sellerId: 's1' }, now)
  // Set directly, bypassing registerPushToken, which is exactly what would
  // stop this from happening in practice.
  older.pushToken = T1
  older.pushLang = 'mr'
  older.lastSeenAt = new Date(now - 60_000).toISOString()
  newer.pushToken = T1
  newer.pushLang = 'en'
  newer.lastSeenAt = new Date(now).toISOString()
  const got = pushTargets(db, { sellerId: 's1' }, now)
  assert.equal(got.length, 1)
  assert.equal(got[0]!.sessionId, newer.id)
  assert.equal(got[0]!.lang, 'en')
})

test('an expired session hears nothing', () => {
  const db = emptyDb()
  const s = createSession(db, { role: 'seller', userId: 's1', sellerId: 's1' })
  registerPushToken(db, s.id, { token: T1 })
  const aYearOn = Date.now() + 365 * 24 * 3_600_000
  assert.deepEqual(pushTargets(db, { sellerId: 's1' }, aYearOn), [])
})
