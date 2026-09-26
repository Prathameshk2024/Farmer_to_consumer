import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  clearDraft, draftKey, EMPTY, readDraft, writeDraft, TOTAL_STEPS,
} from '../src/screens/auth/sellerDraft.js'

/**
 * The registration wizard keeps a half-filled form on the device, so that
 * leaving it does not throw six screens of answers away - and, more to the
 * point, does not force a second OTP on a number she verified two minutes ago.
 *
 * It is keyed by PHONE for the same reason the product draft is keyed by
 * seller: on a field coordinator's handset one woman registers after another,
 * and a single shared key would show the next one a stranger's name, village
 * and UPI id already filled in.
 */

/** A Map stands in for sessionStorage - the rules are about keys, not a browser. */
function fakeStore() {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    keys: () => [...m.keys()],
  }
}

const typed = { ...EMPTY, name: 'सुनीता पाटील', villagePreset: 'चिवरी', upiId: 'sunita@ybl' }

test('a draft one woman typed is invisible to the next on the same phone', () => {
  const store = fakeStore()
  writeDraft(store, '9822011223', 3, typed)

  assert.equal(readDraft(store, '9764455661'), null)
})

test('the same woman gets her answers back, on the step she left', () => {
  const store = fakeStore()
  writeDraft(store, '9822011223', 3, typed)

  const back = readDraft(store, '9822011223')
  assert.equal(back?.step, 3)
  assert.equal(back?.d.name, 'सुनीता पाटील')
  assert.equal(back?.d.upiId, 'sunita@ybl')
})

test('the key is the phone, however it was spelled', () => {
  // The number arrives from a ticket and from a query string; one of those
  // could carry spaces or a +91 and must not open a second drawer.
  assert.equal(draftKey('+91 98220 11223'), draftKey('9822011223'))
})

test('no phone means no draft, rather than a shared one', () => {
  const store = fakeStore()
  writeDraft(store, '', 2, typed)

  assert.deepEqual(store.keys(), [], 'nothing should be written without an identity')
  assert.equal(readDraft(store, ''), null)
})

test('finishing registration clears it', () => {
  // Otherwise her details sit in the tab until it is closed, and re-entering
  // the wizard after registering would restore a form she already submitted.
  const store = fakeStore()
  writeDraft(store, '9822011223', 5, typed)
  clearDraft(store, '9822011223')

  assert.equal(readDraft(store, '9822011223'), null)
})

test('a draft from an older build is filled in rather than trusted', () => {
  // A stored draft written before a field existed must not hand the wizard an
  // object with holes in it - every field has to be present and typed.
  const store = fakeStore()
  store.setItem(draftKey('9822011223'), JSON.stringify({ step: 1, d: { name: 'फक्त नाव' } }))

  const back = readDraft(store, '9822011223')
  assert.equal(back?.d.name, 'फक्त नाव')
  assert.equal(back?.d.upiId, '', 'a field added later still comes back defined')
  assert.equal(back?.d.sellsFood, null)
})

test('a stored step beyond the wizard is clamped, not obeyed', () => {
  const store = fakeStore()
  store.setItem(draftKey('9822011223'), JSON.stringify({ step: 99, d: typed }))

  assert.equal(readDraft(store, '9822011223')?.step, TOTAL_STEPS - 1)
})

test('corrupt storage reads as no draft rather than throwing', () => {
  const store = fakeStore()
  store.setItem(draftKey('9822011223'), 'not json at all')

  assert.equal(readDraft(store, '9822011223'), null)
})
