import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  BLANK, LEGACY_DRAFT_KEY, clearDraft, draftKey, hasStarted, readDraft, writeDraft,
} from '../src/screens/farmer/productDraft.js'

/**
 * The upload wizard keeps a half-filled product on the device so that leaving
 * the screen - to change the language, to answer a call - does not throw the
 * work away.
 *
 * The first version of that keyed the draft on nothing at all, so ONE key held
 * whatever the last woman had typed. On a field coordinator's phone, where
 * farmer after farmer registers on the same handset, the next woman opened
 * "New product" and found a stranger's photo already on step 1. These tests
 * exist so that never happens again: a draft belongs to exactly one farmer.
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

const typed = { ...BLANK, cropId: 'onion', name: 'लाल कांदा', price: '28' }

test('a draft one farmer typed is invisible to the next farmer on the same phone', () => {
  const store = fakeStore()
  writeDraft(store, 'sel_sunita', 3, typed)

  assert.equal(readDraft(store, 'sel_rekha'), null)
})

test('the same farmer gets her own draft back, on the step she left', () => {
  const store = fakeStore()
  writeDraft(store, 'sel_sunita', 3, typed)

  const back = readDraft(store, 'sel_sunita')
  assert.equal(back?.step, 3)
  assert.equal(back?.d.name, 'लाल कांदा')
  assert.equal(back?.d.price, '28')
})

test('two farmers on one phone keep two separate drafts', () => {
  const store = fakeStore()
  writeDraft(store, 'sel_sunita', 1, { ...BLANK, name: 'कांदा' })
  writeDraft(store, 'sel_rekha', 4, { ...BLANK, name: 'भेंडी' })

  assert.equal(readDraft(store, 'sel_sunita')?.d.name, 'कांदा')
  assert.equal(readDraft(store, 'sel_rekha')?.d.name, 'भेंडी')
})

/**
 * The key carries the farmer id and so does the payload. Belt and braces: a
 * mismatch means the row was moved or hand-edited, and the safe reading of an
 * ambiguous draft is no draft at all.
 */
test('a draft whose stored owner disagrees with its key is thrown away', () => {
  const store = fakeStore()
  store.setItem(
    draftKey('sel_rekha'),
    JSON.stringify({ farmerId: 'sel_sunita', step: 2, d: typed }),
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

test('choosing a crop counts as started', () => {
  assert.equal(hasStarted({ ...BLANK, cropId: 'tomato' }), true)
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
    JSON.stringify({ farmerId: 'sel_sunita', step: 1, d: { name: 'भेंडी' } }),
  )

  const back = readDraft(store, 'sel_sunita')
  assert.equal(back?.d.name, 'भेंडी')
  assert.equal(back?.d.unit, BLANK.unit, 'filled in from BLANK, not left undefined')
  assert.equal(back?.d.minOrder, '1')
})

test('a step number outside the wizard is clamped rather than trusted', () => {
  const store = fakeStore()
  store.setItem(
    draftKey('sel_sunita'),
    JSON.stringify({ farmerId: 'sel_sunita', step: 99, d: typed }),
  )

  const back = readDraft(store, 'sel_sunita')
  assert.ok(back && back.step >= 0 && back.step <= 8)
})

test('unreadable JSON is treated as no draft, never as a crash', () => {
  const store = fakeStore()
  store.setItem(draftKey('sel_sunita'), '{not json')

  assert.equal(readDraft(store, 'sel_sunita'), null)
})

test('publishing clears only her own draft', () => {
  const store = fakeStore()
  writeDraft(store, 'sel_sunita', 2, typed)
  writeDraft(store, 'sel_rekha', 2, { ...BLANK, name: 'भेंडी' })

  clearDraft(store, 'sel_sunita')

  assert.equal(readDraft(store, 'sel_sunita'), null)
  assert.equal(readDraft(store, 'sel_rekha')?.d.name, 'भेंडी', 'hers is untouched')
})

/** No farmer id yet - the wizard must not fall back to a shared bucket. */
test('with no farmer id there is no draft to read and nothing is written', () => {
  const store = fakeStore()
  writeDraft(store, undefined, 2, typed)

  assert.equal(store.size(), 0)
  assert.equal(readDraft(store, undefined), null)
})

/** The packaged-goods build sold by the gram and the set; produce does not. */
test('a draft holding a unit that no longer exists falls back to kg', () => {
  const store = fakeStore()
  store.setItem(
    draftKey('sel_sunita'),
    JSON.stringify({ farmerId: 'sel_sunita', step: 2, d: { name: 'कांदा', unit: 'g' } }),
  )
  assert.equal(readDraft(store, 'sel_sunita')?.d.unit, 'kg')
})
