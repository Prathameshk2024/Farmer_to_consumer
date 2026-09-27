import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Product } from '@shared/types.js'
import { MAX_EDITS, countsAsEdit, editsAreLimited, editsLeft } from '@shared/farmer.js'

/**
 * TWO EDITS, AND WHAT THEY ARE FOR.
 *
 * A slot is one listing live at a time, so editing never wins a second
 * listing - but it does let one paid slot become a different crop every
 * season: tomatoes in winter, onions in summer, out of one ₹50 for ever. Two
 * edits is the line between fixing a listing and replacing it. Everything
 * here keeps that line in the right place: the price and the stock a farmer
 * changes daily must never be what runs them out.
 */
function product(over: Partial<Product> = {}): Product {
  return {
    id: 'p1', farmerId: 'f1', cropId: 'tomato', name: 'टोमॅटो', categoryId: 'vegetables',
    price: 40, stock: 100, minOrder: 5, unit: 'kg', harvestDate: '2026-09-25',
    cultivation: 'organic', status: 'LIVE', ...over,
  } as Product
}

test('the numbers a farmer keeps current spend nothing, however often', () => {
  const before = product()
  assert.equal(countsAsEdit(before, { ...before, price: 45 }), false)
  assert.equal(countsAsEdit(before, { ...before, stock: 3 }), false)
  assert.equal(countsAsEdit(before, { ...before, minOrder: 2 }), false)
  assert.equal(countsAsEdit(before, { ...before, harvestDate: '2026-09-26' }), false)
  assert.equal(countsAsEdit(before, { ...before, description: 'ताजे' }), false)
})

test('changing what the produce IS spends one', () => {
  const before = product()
  assert.equal(countsAsEdit(before, { ...before, cropId: 'onion' }), true)
  assert.equal(countsAsEdit(before, { ...before, name: 'कांदा' }), true)
  assert.equal(countsAsEdit(before, { ...before, imageUrl: 'https://x/y.jpg' }), true)
  assert.equal(countsAsEdit(before, { ...before, categoryId: 'fruits' }), true)
  assert.equal(countsAsEdit(before, { ...before, unit: 'quintal' }), true)
  assert.equal(countsAsEdit(before, { ...before, cultivation: 'chemical' }), true)
})

/** The edit form posts the whole product on every save; a save that changed nothing must cost nothing. */
test('an edit is spent on saving a change, and on nothing else', () => {
  const before = product()
  assert.equal(countsAsEdit(before, { ...before }), false)
  assert.equal(countsAsEdit(before, { ...before, name: 'टोमॅटो' }), false, 'typed the old name back')
  assert.equal(countsAsEdit(before, { ...before, name: '  टोमॅटो  ' }), false, 'whitespace is not a change')
  assert.equal(countsAsEdit(before, { ...before, imageUrl: undefined }), false, 'absent stays absent')
})

test('the pause toggle is not an edit', () => {
  const before = product()
  assert.equal(countsAsEdit(before, { status: 'PAUSED' }), false)
})

test('price and stock stay free at the limit, not only before it', () => {
  const spent = product({ editCount: MAX_EDITS })
  assert.equal(editsLeft(spent), 0)
  assert.equal(countsAsEdit(spent, { ...spent, price: 60, stock: 4 }), false)
})

/** `editCount` is absent on rows from before the rule: nobody loses an edit to a change made when editing was free. */
test('a listing published before this rule starts with every edit', () => {
  assert.equal(editsLeft(product()), MAX_EDITS)
  assert.equal(editsLeft(product({ editCount: 1 })), MAX_EDITS - 1)
  assert.equal(editsLeft(product({ editCount: 99 })), 0)
})

/** Only a listing the public can see is rationed; a draft and a waiting listing are still being written. */
test('drafts and waiting listings are not rationed', () => {
  assert.equal(editsAreLimited('LIVE'), true)
  assert.equal(editsAreLimited('PAUSED'), true)
  assert.equal(editsAreLimited('DRAFT'), false)
  assert.equal(editsAreLimited('PENDING'), false)
})
