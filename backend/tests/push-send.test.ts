import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'

process.env.SESSION_SECRET = 'test-secret-for-unit-tests'

const { emptyDb } = await import('../src/db/seed.js')
const { createSession } = await import('../src/auth/sessions.js')
const { registerPushToken } = await import('../src/push/register.js')
const { pushTargets } = await import('../src/push/targets.js')
const { sendPush, setPushTransport } = await import('../src/push/send.js')

/**
 * A NOTIFICATION IS A COURTESY, NEVER A DEPENDENCY.
 *
 * The order is saved before anything is sent, and nothing that goes wrong on
 * the way to her phone - no network, a phone that uninstalled the app, Firebase
 * refusing - may reach back and fail the thing she actually did.
 */

afterEach(() => setPushTransport(null))

const TOKEN = 'fcm-token-aaaaaaaaaaaaaaaaaaaaaaaa'
const text = () => ({ title: 'नवीन ऑर्डर आले आहे', body: 'लोणचे · ₹220', path: '/seller/orders/SMB1' })

function world() {
  const db = emptyDb()
  const s = createSession(db, { role: 'seller', userId: 's1', sellerId: 's1' })
  registerPushToken(db, s.id, { token: TOKEN })
  return { db, s, targets: pushTargets(db, { sellerId: 's1' }) }
}

test('with no transport configured nothing is sent and nothing breaks', async () => {
  const { db, targets } = world()
  assert.equal(await sendPush(db, targets, text, () => assert.fail('no write')), 0)
})

test('each target gets the message built in its language', async () => {
  const { db, targets } = world()
  const sent: unknown[] = []
  setPushTransport(async (msgs) => { sent.push(...msgs); return msgs.map((m) => ({ token: m.token, ok: true, dead: false })) })
  assert.equal(await sendPush(db, targets, text, () => {}), 1)
  assert.deepEqual(sent, [{ token: TOKEN, ...text() }])
})

test('a phone that uninstalled the app is forgotten, and that is saved', async () => {
  const { db, s, targets } = world()
  let writes = 0
  setPushTransport(async (msgs) => msgs.map((m) => ({ token: m.token, ok: false, dead: true })))
  await sendPush(db, targets, text, () => { writes++ })
  assert.equal(s.pushToken, undefined)
  assert.equal(writes, 1)
})

test('a failure with an FCM code keeps the token and logs the code, not just a count', async () => {
  const { db, s, targets } = world()
  setPushTransport(async (msgs) => msgs.map((m) => ({
    token: m.token, ok: false, dead: false, code: 'messaging/mismatched-credential',
  })))
  const warnings: unknown[][] = []
  const origWarn = console.warn
  console.warn = (...args: unknown[]) => warnings.push(args)
  try {
    assert.equal(await sendPush(db, targets, text, () => assert.fail('no write for a non-dead failure')), 0)
  } finally {
    console.warn = origWarn
  }
  assert.equal(s.pushToken, TOKEN)
  assert.ok(warnings.some((a) => String(a[0]).includes('messaging/mismatched-credential')))
})

test('a transport that throws is swallowed', async () => {
  const { db, targets } = world()
  setPushTransport(async () => { throw new Error('network down') })
  assert.equal(await sendPush(db, targets, text, () => {}), 0)
})

test('a message the builder declines is not sent at all', async () => {
  const { db, targets } = world()
  setPushTransport(async () => assert.fail('nothing to send'))
  assert.equal(await sendPush(db, targets, () => null, () => {}), 0)
})
