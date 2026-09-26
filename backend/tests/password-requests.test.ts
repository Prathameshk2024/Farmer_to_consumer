import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

process.env.SESSION_SECRET = 'test-secret-for-unit-tests'
const { emptyDb } = await import('../src/db/seed.js')
const { setCredential, checkPassword } = await import('../src/auth/credentials.js')
const { submitPasswordRequest, closePasswordRequest, resetUserPassword, removePasswordRequests } =
  await import('../src/auth/passwordRequests.js')
const { hit, LIMITS, resetAllLimits } = await import('../src/auth/rateLimit.js')

/**
 * "Forgot password" is a request to a person: the farmer leaves his number,
 * an admin calls that number and reads out a temporary password. The page is
 * public, so it must not answer the question "does this number have an
 * account?", and a farmer who taps the button five times must still be one
 * row in the admin's queue.
 */

let db = emptyDb()
beforeEach(() => { db = emptyDb(); resetAllLimits() })

const T0 = Date.parse('2026-09-26T06:00:00Z')
const ask = (phone: string, now = T0) =>
  submitPasswordRequest(db, { role: 'farmer', phone, name: 'राजेश पाटील', village: 'अणदूर' }, now)

test('an unknown phone gets exactly the answer a known one gets', () => {
  setCredential(db, { role: 'farmer', userId: 'f1', phone: '9822011223', password: '482913' })
  const known = ask('9822011223')
  const unknown = ask('9822099999')
  assert.deepEqual(known, { status: 200, body: { ok: true } })
  assert.deepEqual(unknown, known, 'any difference would tell a stranger which numbers are registered')
})

test('the account is noted only when there is one', () => {
  setCredential(db, { role: 'farmer', userId: 'f1', phone: '9822011223', password: '482913' })
  ask('9822011223')
  ask('9822099999')
  const byPhone = (p: string) => db.passwordRequests.find((r) => r.phone === p)!
  assert.equal(byPhone('9822011223').matchedUserId, 'f1')
  assert.equal(byPhone('9822099999').matchedUserId, undefined)
  assert.equal(byPhone('9822099999').status, 'OPEN', 'still queued: he may have registered on another number')
})

test('a farmer request does not match a buyer account on the same phone', () => {
  setCredential(db, { role: 'customer', userId: 'c1', phone: '9822011223', password: '482913' })
  ask('9822011223')
  assert.equal(db.passwordRequests[0].matchedUserId, undefined)
})

test('asking again while one is open refreshes it instead of adding a row', () => {
  ask('9822011223', T0)
  ask('+91 98220 11223', T0 + 3_600_000)
  assert.equal(db.passwordRequests.length, 1, 'the same phone typed differently is the same person')
  assert.equal(db.passwordRequests[0].at, new Date(T0 + 3_600_000).toISOString())
})

test('after the first is closed, a new request is a new row', () => {
  ask('9822011223')
  closePasswordRequest(db, db.passwordRequests[0].id, 'DISMISSED', 'admin@college', 'called, he remembered it')
  ask('9822011223')
  assert.equal(db.passwordRequests.length, 2)
  assert.equal(db.passwordRequests[0].closeReason, 'called, he remembered it')
})

test('a bad phone, or a missing name or village, is refused and nothing is stored', () => {
  assert.equal(ask('12345').status, 400)
  assert.equal(submitPasswordRequest(db, { role: 'farmer', phone: '9822011223', name: ' ', village: 'अणदूर' }).status, 400)
  assert.equal(submitPasswordRequest(db, { role: 'farmer', phone: '9822011223', name: 'राजेश पाटील' }).status, 400,
    'a farmer also gives his village, so the admin can tell two Rajesh Patils apart')
  assert.equal(db.passwordRequests.length, 0)
})

test('three requests per phone a day; the fourth is refused', () => {
  assert.deepEqual(LIMITS.resetRequestPerPhone, { max: 3, windowMs: 24 * 60 * 60 * 1000 })
  assert.deepEqual(LIMITS.resetRequestPerIp, { max: 20, windowMs: 60 * 60 * 1000 })
  for (let i = 0; i < 3; i++) assert.ok(hit('reset:phone:9822011223', LIMITS.resetRequestPerPhone).ok)
  assert.equal(hit('reset:phone:9822011223', LIMITS.resetRequestPerPhone).ok, false, 'the route answers this with 429')
})

test('a reset from the queue marks the request done and forces a new password', () => {
  db.farmers.push({ id: 'f1', phone: '9822011223', name: 'राजेश पाटील', status: 'ACTIVE' } as never)
  setCredential(db, { role: 'farmer', userId: 'f1', phone: '9822011223', password: '482913' })
  ask('9822011223')
  const request = db.passwordRequests[0]

  const r = resetUserPassword(db, { role: 'farmer', userId: 'f1', requestId: request.id, by: 'admin@college' }, T0)!
  assert.match(r.tempPassword, /^\d{6}$/)
  assert.equal(request.status, 'DONE')
  assert.equal(request.closedBy, 'admin@college')
  assert.equal(request.closedAt, new Date(T0).toISOString())
  assert.equal(checkPassword(db, 'farmer', '9822011223', '482913'), null, 'the old password stops working')
  assert.equal(checkPassword(db, 'farmer', '9822011223', r.tempPassword)?.mustChangePassword, true)
})

test('a reset for someone who does not exist does nothing', () => {
  assert.equal(resetUserPassword(db, { role: 'farmer', userId: 'nobody', by: 'admin@college' }), null)
})

test('closing an account takes its password requests with it', () => {
  ask('9822011223')
  removePasswordRequests(db, 'f1', '9822011223')
  assert.equal(db.passwordRequests.length, 0)
})
