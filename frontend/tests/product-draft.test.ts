import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  BLANK, LEGACY_DRAFT_KEY, clearDraft, draftKey, hasStarted, readDraft, writeDraft,
} from '../src/screens/seller/productDraft.js'

/**
 * The upload wizard keeps a half-filled product on the device so that leaving
 * the screen - to change the language, to answer a call - does not throw the
 * work away.
 *
 * The first version of that keyed the draft on nothing at all, so ONE key held
 * whatever the last woman had typed. On a field coordinator's phone, where
 * seller after seller registers on the same handset, the next woman opened
 * "New product" and found a stranger's photo already on step 1. These tests
 * exist so that never happens again: a draft belongs to exactly one seller.
 */

/** localStorage stands in as a Map - the rules are about keys, not about a browser. */
function fakeStore() {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    size: () => m.size,
    keys: () => [...m.keys()],
  }
}

const typed = { ...BLANK, name: 'आंब्याचे लोणचे', price: '220' }

test('a draft one seller typed is invisible to the next seller on the same phone', () => {
  const store = fakeStore()
  writeDraft(store, 'sel_sunita', 3, typed)

  assert.equal(readDraft(store, 'sel_rekha'), null)
})

test('the same seller gets her own draft back, on the step she left', () => {
  const store = fakeStore()
  writeDraft(store, 'sel_sunita', 3, typed)

  const back = readDraft(store, 'sel_sunita')
  assert.equal(back?.step, 3)
  assert.equal(back?.d.name, 'आंब्याचे लोणचे')
  assert.equal(back?.d.price, '220')
})

test('two sellers on one phone keep two separate drafts', () => {
  const store = fakeStore()
  writeDraft(store, 'sel_sunita', 1, { ...BLANK, name: 'लोणचे' })
  writeDraft(store, 'sel_rekha', 4, { ...BLANK, name: 'पापड' })

  assert.equal(readDraft(store, 'sel_sunita')?.d.name, 'लोणचे')
  assert.equal(readDraft(store, 'sel_rekha')?.d.name, 'पापड')
})

/**
 * The key carries the seller id and so does the payload. Belt and braces: a
 * mismatch means the row was moved or hand-edited, and the safe reading of an
 * ambiguous draft is no draft at all.
 */
test('a draft whose stored owner disagrees with its key is thrown away', () => {
  const store = fakeStore()
  store.setItem(
    draftKey('sel_rekha'),
    JSON.stringify({ sellerId: 'sel_sunita', step: 2, d: typed }),
  )

  assert.equal(readDraft(store, 'sel_rekha'), null)
})

test('nothing is stored until she has actually typed something', () => {
  const store = fakeStore()

  assert.equal(hasStarted(BLANK), false)
  writeDraft(store, 'sel_sunita', 0, BLANK)
  assert.equal(store.size(), 0, 'opening the wizard and walking away leaves no trace')

  assert.equal(hasStarted(typed), true)
  writeDraft(store, 'sel_sunita', 1, typed)
  assert.equal(store.size(), 1)
})

/** A photo alone is a start - she may well upload before she names anything. */
test('a photo with no words counts as started', () => {
  assert.equal(hasStarted({ ...BLANK, imageUrl: 'https://res.cloudinary.com/x/a.jpg' }), true)
})

test('choosing made-to-order counts as started, even though it is a boolean', () => {
  assert.equal(hasStarted({ ...BLANK, madeToOrder: true }), true)
})

/**
 * Existing installs still hold the old shared key. Left alone it would keep
 * showing a stranger's product to whoever opens the wizard next, which is the
 * exact bug - so reading clears it rather than waiting for a reinstall.
 */
test('the old shared key is deleted the first time a draft is read', () => {
  const store = fakeStore()
  store.setItem(LEGACY_DRAFT_KEY, JSON.stringify({ step: 2, d: typed }))

  assert.equal(readDraft(store, 'sel_rekha'), null, 'and it is never handed to anyone')
  assert.equal(store.getItem(LEGACY_DRAFT_KEY), null, 'and it is gone for good')
})

/** A draft written by an older build is missing whatever field was added since. */
test('a draft from an older build loads with the new fields blank', () => {
  const store = fakeStore()
  store.setItem(
    draftKey('sel_sunita'),
    JSON.stringify({ sellerId: 'sel_sunita', step: 1, d: { name: 'पापड' } }),
  )

  const back = readDraft(store, 'sel_sunita')
  assert.equal(back?.d.name, 'पापड')
  assert.equal(back?.d.unit, BLANK.unit, 'filled in from BLANK, not left undefined')
  assert.equal(back?.d.madeToOrder, false)
})

test('a step number outside the wizard is clamped rather than trusted', () => {
  const store = fakeStore()
  store.setItem(
    draftKey('sel_sunita'),
    JSON.stringify({ sellerId: 'sel_sunita', step: 99, d: typed }),
  )

  const back = readDraft(store, 'sel_sunita')
  assert.ok(back && back.step >= 0 && back.step <= 6)
})

test('unreadable JSON is treated as no draft, never as a crash', () => {
  const store = fakeStore()
  store.setItem(draftKey('sel_sunita'), '{not json')

  assert.equal(readDraft(store, 'sel_sunita'), null)
})

test('publishing clears only her own draft', () => {
  const store = fakeStore()
  writeDraft(store, 'sel_sunita', 2, typed)
  writeDraft(store, 'sel_rekha', 2, { ...BLANK, name: 'पापड' })

  clearDraft(store, 'sel_sunita')

  assert.equal(readDraft(store, 'sel_sunita'), null)
  assert.equal(readDraft(store, 'sel_rekha')?.d.name, 'पापड', 'hers is untouched')
})

/** No seller id yet - the wizard must not fall back to a shared bucket. */
test('with no seller id there is no draft to read and nothing is written', () => {
  const store = fakeStore()
  writeDraft(store, undefined, 2, typed)

  assert.equal(store.size(), 0)
  assert.equal(readDraft(store, undefined), null)
})
