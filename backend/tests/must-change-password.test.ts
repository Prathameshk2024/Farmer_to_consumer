import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.SESSION_SECRET = 'test-secret-for-unit-tests'
const { requireRole } = await import('../src/middleware/auth.js')
const { emptyDb } = await import('../src/db/seed.js')
const { createSession, revokeAllForUser } = await import('../src/auth/sessions.js')

/**
 * After an admin reset, the temporary password has been read out over the
 * phone, so two people know it. Until she replaces it, the session opens only
 * the door that replaces it (and the one that leaves).
 */

function call(url: string, mustChangePassword: boolean, role: 'farmer' | 'admin' = 'farmer') {
  const req = { originalUrl: url, auth: { role, userId: 'f1', sessionId: 's', mustChangePassword } }
  let status = 200
  let body: { code?: string } = {}
  let passed = false
  const res = {
    status(n: number) { status = n; return this },
    json(b: typeof body) { body = b; return this },
  }
  requireRole('farmer', 'customer', 'admin')(req as never, res as never, () => { passed = true })
  return { status, body, passed }
}

test('a must-change session is refused everywhere but the password change', () => {
  const r = call('/api/farmers/me', true)
  assert.equal(r.passed, false)
  assert.equal(r.status, 403)
  assert.equal(r.body.code, 'MUST_CHANGE_PASSWORD', 'the client tells this 403 apart and sends her to /password')

  assert.equal(call('/api/auth/password', true).passed, true)
  assert.equal(call('/api/auth/logout?x=1', true).passed, true)
})

test('an ordinary session is not held up', () => {
  assert.equal(call('/api/farmers/me', false).passed, true)
})

test('changing a password signs out every other phone, not this one', () => {
  const db = emptyDb()
  const here = createSession(db, { role: 'farmer', userId: 'f1' })
  const other = createSession(db, { role: 'farmer', userId: 'f1' })

  assert.equal(revokeAllForUser(db, 'f1', 'password-change', Date.now(), here.id), 1)
  assert.equal(here.revokedAt, undefined)
  assert.equal(other.revokedReason, 'password-change')
})
