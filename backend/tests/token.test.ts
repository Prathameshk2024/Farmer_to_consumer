import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'

// config.ts reads the environment once at module load, so this must be set
// before the module under test is imported.
process.env.SESSION_SECRET = 'test-secret-for-unit-tests'

const { signToken, verifyToken } = await import('../src/auth/tokens.js')

/**
 * The token is a POINTER plus a signature, and that is the whole design.
 *
 * It used to carry the userId, the sellerId and the customerId, which made it
 * a self-contained claim about who you are - and a claim is only as good as
 * the checking around it. Now it carries a session id, and identity is read
 * from that session record on every request. These tests hold the signature
 * honest; sessions.test.ts holds the record honest.
 */

const CLAIMS = { sid: 'sess_abc123', role: 'customer' as const }

test('a token carries no identity at all', () => {
  // The property that makes the rest of the auth stack safe: there is nothing
  // in here to tamper with, because nothing in here says who you are.
  const payload = signToken(CLAIMS).split('.')[0]!
  const body = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>

  assert.deepEqual(Object.keys(body).sort(), ['iat', 'role', 'sid'])
  for (const leaked of ['userId', 'customerId', 'sellerId', 'phone']) {
    assert.equal(body[leaked], undefined, `${leaked} must not be in the token`)
  }
})

test('rejects a hand-forged token that carries no signature', () => {
  // Exactly what an attacker would craft: the old unsigned format.
  const forged = Buffer.from(JSON.stringify(CLAIMS), 'utf8').toString('base64url')

  assert.equal(verifyToken(forged), null)
})

test('a valid token round-trips back to the same claims', () => {
  const back = verifyToken(signToken(CLAIMS))!

  // `iat` is stamped by signToken - sessions expire on inactivity, so every
  // token carries the moment it was issued.
  const { iat, ...claims } = back
  assert.equal(typeof iat, 'number')
  assert.deepEqual(claims, CLAIMS)
})

test('rejects a token whose payload was swapped for another session', () => {
  // The attack the signature exists to stop: keep a real signature, point the
  // payload at somebody else's session.
  const mine = signToken(CLAIMS)
  const signature = mine.slice(mine.indexOf('.') + 1)
  const hers = Buffer.from(
    JSON.stringify({ ...CLAIMS, sid: 'sess_somebody_else' }),
    'utf8',
  ).toString('base64url')

  assert.equal(verifyToken(`${hers}.${signature}`), null)
})

test('rejects a token whose signature was altered', () => {
  const token = signToken(CLAIMS)
  const flipped = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A')

  assert.equal(verifyToken(flipped), null)
})

test('rejects a signature of the right shape but the wrong key', () => {
  const payload = Buffer.from(JSON.stringify(CLAIMS), 'utf8').toString('base64url')
  const wrong = createHmac('sha256', 'not-the-real-secret').update(payload).digest('base64url')

  assert.equal(verifyToken(`${payload}.${wrong}`), null)
})

test('rejects a signature made with the right key but the wrong purpose', () => {
  // Domain separation. Every signature in the auth stack is HMAC over the same
  // secret, so without a purpose baked in, a phone-verification ticket could
  // be presented where a session token was expected.
  const payload = Buffer.from(JSON.stringify(CLAIMS), 'utf8').toString('base64url')
  const asTicket = createHmac('sha256', process.env.SESSION_SECRET!)
    .update(`ticket:seller-register ${payload}`)
    .digest('base64url')

  assert.equal(verifyToken(`${payload}.${asTicket}`), null)
})

test('rejects a token with no session id', () => {
  // Nothing to look up means nothing to authenticate as.
  const payload = Buffer.from(JSON.stringify({ role: 'customer', iat: Date.now() }), 'utf8')
    .toString('base64url')
  const sig = createHmac('sha256', process.env.SESSION_SECRET!)
    .update(`session-v2 ${payload}`)
    .digest('base64url')

  assert.equal(verifyToken(`${payload}.${sig}`), null)
})

test('rejects empty and malformed tokens without throwing', () => {
  for (const bad of ['', '.', 'a.', '.b', 'no-dot-at-all', 'not base64!.also not']) {
    assert.equal(verifyToken(bad), null, `expected null for ${JSON.stringify(bad)}`)
  }
})
