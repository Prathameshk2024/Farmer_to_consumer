import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.SESSION_SECRET = 'test-secret-for-unit-tests'

const { emptyDb } = await import('../src/db/seed.js')
const { createSession } = await import('../src/auth/sessions.js')
const { registerPushToken } = await import('../src/push/register.js')

/**
 * ONE PHONE, ONE PERSON.
 *
 * A notification token belongs to a phone, and on these phones a mother hands
 * the handset to her daughter, and a field coordinator registers seller after
 * seller on one device. The token is therefore kept on the SESSION, and the
 * newest session to register a token takes it from every other one - so the
 * phone only ever buzzes for whoever is signed in on it now.
 */

const TOKEN = 'fcm-token-aaaaaaaaaaaaaaaaaaaaaaaa'

test('a token is kept on the session that registered it, with her language', () => {
  const db = emptyDb()
  const s = createSession(db, { role: 'seller', userId: 's1', sellerId: 's1' })
  const r = registerPushToken(db, s.id, { token: TOKEN, lang: 'en' })
  assert.deepEqual(r, { ok: true, changed: true })
  assert.equal(s.pushToken, TOKEN)
  assert.equal(s.pushLang, 'en')
})

test('the language defaults to Marathi, like the app', () => {
  const db = emptyDb()
  const s = createSession(db, { role: 'customer', userId: 'c1', customerId: 'c1' })
  registerPushToken(db, s.id, { token: TOKEN })
  assert.equal(s.pushLang, 'mr')
})

test('the daughter signing in takes the phone from her mother', () => {
  const db = emptyDb()
  const mother = createSession(db, { role: 'seller', userId: 's1', sellerId: 's1' })
  const daughter = createSession(db, { role: 'customer', userId: 'c9', customerId: 'c9' })
  registerPushToken(db, mother.id, { token: TOKEN })
  registerPushToken(db, daughter.id, { token: TOKEN })
  assert.equal(mother.pushToken, undefined)
  assert.equal(daughter.pushToken, TOKEN)
})

test('registering the same thing again is not a change worth a write', () => {
  const db = emptyDb()
  const s = createSession(db, { role: 'seller', userId: 's1', sellerId: 's1' })
  registerPushToken(db, s.id, { token: TOKEN, lang: 'mr' })
  assert.deepEqual(registerPushToken(db, s.id, { token: TOKEN, lang: 'mr' }), { ok: true, changed: false })
})

test('junk is refused with a Marathi message', () => {
  const db = emptyDb()
  const s = createSession(db, { role: 'seller', userId: 's1', sellerId: 's1' })
  for (const body of [{}, { token: 42 }, { token: 'short' }, { token: 'has a space in it aaaaaaaaaa' }, { token: TOKEN, lang: 'hi' }]) {
    const r = registerPushToken(db, s.id, body)
    assert.equal(r.ok, false, JSON.stringify(body))
    if (!r.ok) {
      assert.equal(r.status, 400)
      assert.ok(r.messageMr.length > 0)
    }
  }
  assert.equal(s.pushToken, undefined)
})
