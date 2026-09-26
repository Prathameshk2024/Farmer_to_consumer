import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EDIT_COUNTED_FIELDS, needsPieceCount, sizeProblems } from '@shared/seller.js'

/**
 * A PRICE WITHOUT A SIZE IS NOT A PRICE.
 *
 * "₹80 for pickle" tells a buyer nothing until she knows whether that is a
 * 200g jar or a kilo, and she cannot compare two sellers without it. So every
 * listing says how much one of them is, counted in its own unit.
 */

test('a listing has to say how much one of them is', () => {
  assert.equal('packSize' in sizeProblems({ unit: 'g' }), true)
  assert.equal('packSize' in sizeProblems({ unit: 'g', packSize: 0 }), true)
  assert.deepEqual(sizeProblems({ unit: 'g', packSize: 500 }), {})
})

/**
 * A set of four ladoos and a set of twenty are the same word, so a set needs
 * a second number. Weight and volume do not: "500 g" is already an amount.
 */
test('a set says how many are inside it', () => {
  assert.equal(needsPieceCount('set'), true)
  assert.equal(needsPieceCount('kg'), false)
  assert.equal(needsPieceCount('piece'), false)

  assert.equal('piecesPerPack' in sizeProblems({ unit: 'set', packSize: 1 }), true)
  assert.deepEqual(sizeProblems({ unit: 'set', packSize: 1, piecesPerPack: 6 }), {})
})

/**
 * Changing 500g to 250g at the same price is a different product, not a
 * correction - so the size is counted like the unit beside it. The PRICE
 * stays free to change, for the reason it always was: a seller who cannot
 * correct a price stops keeping it honest.
 */
test('the size counts as a change to what the product is', () => {
  const counted: readonly string[] = EDIT_COUNTED_FIELDS
  assert.ok(counted.includes('packSize'))
  assert.ok(counted.includes('piecesPerPack'))
  assert.ok(!counted.includes('price'))
  assert.ok(!counted.includes('stock'))
})
