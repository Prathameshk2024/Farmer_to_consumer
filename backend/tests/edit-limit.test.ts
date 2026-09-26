import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Product } from '@shared/types.js'
import {
  MAX_EDITS, countsAsEdit, editsAreLimited, editsLeft,
} from '@shared/seller.js'

/**
 * TWO EDITS, AND WHAT THEY ARE FOR.
 *
 * A slot is one listing live at a time, so editing never wins a seller a
 * second listing - but it does let one paid slot become a different product
 * every season. The limit draws the line between fixing a listing and
 * replacing it, and everything here is about keeping that line in the right
 * place: the price she changes weekly must never be what runs her out.
 */

function product(over: Partial<Product> = {}): Product {
  return {
    id: 'p1', sellerId: 's1', name: 'आंब्याचं लोणचं', categoryId: 'pickle',
    price: 200, stock: 10, unit: 'kg', status: 'LIVE', ...over,
  } as Product
}

test('changing the price spends nothing, however many times', () => {
  // The rule sellers meet every week. A woman whose input costs moved cannot
  // be made to choose between a correct price and a future correction.
  const before = product({ price: 200 })
  assert.equal(countsAsEdit(before, { ...before, price: 240 }), false)
  assert.equal(countsAsEdit(before, { ...before, stock: 3 }), false)
})

test('changing what the product IS spends one', () => {
  const before = product()
  assert.equal(countsAsEdit(before, { ...before, name: 'लिंबाचं लोणचं' }), true)
  assert.equal(countsAsEdit(before, { ...before, categoryId: 'masala' }), true)
  assert.equal(countsAsEdit(before, { ...before, imageUrl: 'https://x/y.jpg' }), true)
})

test('saving without changing anything spends nothing', () => {
  // The edit form posts the whole product on every save, so a seller who
  // opens the screen, changes her mind and taps Save would otherwise lose an
  // edit to a save that changed nothing at all.
  const before = product()
  assert.equal(countsAsEdit(before, { ...before }), false)
})

test('an edit is spent on saving a change, and on nothing else', () => {
  // The whole promise of the counter: it moves when she changes something and
  // presses save, never because she opened the screen or looked at it.
  const before = product({ name: 'आंब्याचं लोणचं' })

  // Opened, nothing touched, saved.
  assert.equal(countsAsEdit(before, { ...before }), false)
  // Typed a new name, then typed the old one back before saving.
  assert.equal(countsAsEdit(before, { ...before, name: 'आंब्याचं लोणचं' }), false)
  // Whitespace is not a change to a name.
  assert.equal(countsAsEdit(before, { ...before, name: '  आंब्याचं लोणचं  ' }), false)
  // Actually renamed.
  assert.equal(countsAsEdit(before, { ...before, name: 'लिंबाचं लोणचं' }), true)
})

test('a listing from before MRP was posted does not lose an edit to a zero', () => {
  // Older rows carry no `mrp`; the form now posts 0 for "none". Both mean the
  // same thing, and a seller who fixed her stock must not pay for the
  // difference between two spellings of empty.
  const legacy = product({ mrp: undefined })
  assert.equal(countsAsEdit(legacy, { ...legacy, mrp: 0 }), false)
  assert.equal(countsAsEdit(legacy, { ...legacy, mrp: 250 }), true)
})

test('price and stock stay free at the limit, not only before it', () => {
  // The rule that keeps the shop honest. A listing with both edits spent must
  // still take a new price on a market day.
  const spent = product({ editCount: MAX_EDITS, price: 200, stock: 10 })
  assert.equal(editsLeft(spent), 0)
  assert.equal(countsAsEdit(spent, { ...spent, price: 260, stock: 4 }), false)
})

test('a listing published before this rule starts with every edit', () => {
  // `editCount` is absent on those rows. Reading it as zero is the only
  // honest choice: nobody may lose an edit to a change made when editing was
  // free.
  assert.equal(editsLeft(product()), MAX_EDITS)
  assert.equal(editsLeft(product({ editCount: 1 })), MAX_EDITS - 1)
  assert.equal(editsLeft(product({ editCount: 99 })), 0)
})

test('drafts and rejected listings are not rationed', () => {
  // A rejected listing is being FIXED - an admin took it down and said why.
  // Charging an edit to answer that could leave a slot she paid ₹50 for
  // holding something she is not allowed to repair.
  assert.equal(editsAreLimited('LIVE'), true)
  assert.equal(editsAreLimited('PAUSED'), true)
  assert.equal(editsAreLimited('DRAFT'), false)
  assert.equal(editsAreLimited('REJECTED'), false)
})
