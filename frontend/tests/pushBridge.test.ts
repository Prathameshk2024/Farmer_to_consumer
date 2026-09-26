import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Session } from '@shared/types.js'
import { openPushSettings, startPushBridge, type PushWindow } from '../src/lib/pushBridge.js'

/**
 * THE PAGE ONLY ASKS FOR NOTIFICATIONS WHEN THEY CAN BE FOR SOMEBODY.
 *
 * Outside the APK there is no phone to buzz; before sign-in there is nobody to
 * buzz for, and Android's permission prompt on the landing page would arrive
 * before she knows what the app is.
 */

const seller = { token: 't', role: 'seller', userId: 's1', sellerId: 's1' } as Session

function apk() {
  const posted: string[] = []
  const w: PushWindow = { ReactNativeWebView: { postMessage: (m) => { posted.push(m) } } }
  return { w, posted }
}

test('in a plain browser nothing is asked', () => {
  const w: PushWindow = {}
  startPushBridge({ w, session: seller, lang: 'mr', register: async () => assert.fail('no register') })
  assert.equal(w.__smbPushToken, undefined)
})

test('signed out, or an admin, nothing is asked', () => {
  for (const session of [null, { ...seller, role: 'admin' } as Session]) {
    const { w, posted } = apk()
    startPushBridge({ w, session, lang: 'mr', register: async () => assert.fail('no register') })
    assert.deepEqual(posted, [])
  }
})

test('a signed-in seller in the APK asks, and her token is registered in her language', async () => {
  const { w, posted } = apk()
  const got: [string, string][] = []
  const stop = startPushBridge({ w, session: seller, lang: 'en', register: async (t, l) => { got.push([t, l]) } })
  assert.deepEqual(posted.map((m) => JSON.parse(m)), [{ type: 'push:enable' }])
  w.__smbPushToken?.('fcm-token-x')
  assert.deepEqual(got, [['fcm-token-x', 'en']])
  stop()
  assert.equal(w.__smbPushToken, undefined)
})

test('a registration that fails is swallowed', async () => {
  const { w } = apk()
  startPushBridge({ w, session: seller, lang: 'mr', register: async () => { throw new Error('offline') } })
  w.__smbPushToken?.('fcm-token-x')
  await new Promise((r) => setTimeout(r, 0))
})

test('a refused permission reaches the page, and the settings button asks the wrapper', () => {
  const { w, posted } = apk()
  const seen: boolean[] = []
  const stop = startPushBridge({ w, session: seller, lang: 'mr', register: async () => {}, onStatus: (g) => { seen.push(g) } })
  w.__smbPushStatus?.(false)
  w.__smbPushStatus?.(true)
  assert.deepEqual(seen, [false, true])
  openPushSettings(w)
  assert.deepEqual(JSON.parse(posted.at(-1)!), { type: 'push:settings' })
  stop()
  assert.equal(w.__smbPushStatus, undefined)
})

test('signed out, no status is listened for', () => {
  const { w } = apk()
  startPushBridge({ w, session: null, lang: 'mr', register: async () => {}, onStatus: () => assert.fail('no status') })
  assert.equal(w.__smbPushStatus, undefined)
})
