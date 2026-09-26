import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Product } from '@shared/types.js'
import { hardRefusal, patchProblems } from '../src/routes/products.routes.js'

const DAY = 86_400_000
const now = Date.parse('2026-09-26T06:00:00Z')
const old = new Date(now - 61 * DAY).toISOString().slice(0, 10)
/** Wheat harvested 61 days ago: fine, grain keeps. */
const wheat: Partial<Product> = {
  cropId: 'wheat', name: 'गहू', categoryId: 'grains', unit: 'kg', price: 30, stock: 100,
  minOrder: 5, harvestDate: old, cultivation: 'chemical', status: 'LIVE',
}

/**
 * An edit on a live listing judges only what it touched, so an old listing
 * can still be paused or repriced...
 */
test('a price change on an old fresh listing is not blocked by its harvest date', () => {
  const tomato = { ...wheat, cropId: 'tomato', categoryId: 'vegetables', price: 45 }
  assert.deepEqual(patchProblems(tomato, ['price'], now), {})
})

/**
 * ...but changing the crop re-judges the harvest date. Otherwise grain
 * relabelled as tomatoes turns a 61-day-old listing into "fresh" produce.
 */
test('changing the crop re-judges the harvest date', () => {
  const relabelled = { ...wheat, cropId: 'tomato', categoryId: 'vegetables' }
  assert.ok(patchProblems(relabelled, ['cropId'], now).harvestDate)
})

/** The minimum is judged against the stock, so lowering the stock judges both. */
test('lowering the stock below the minimum is refused', () => {
  assert.ok(patchProblems({ ...wheat, stock: 3 }, ['stock'], now).minOrder)
})

/** A junk category falls out of every filter; a huge description has no place to show. */
test('an unknown category or an over-long description is refused outright', () => {
  assert.ok(hardRefusal({ categoryId: 'pickles' }))
  assert.ok(hardRefusal({ description: 'x'.repeat(501) }))
  assert.equal(hardRefusal({ categoryId: 'grains', description: 'x'.repeat(500) }), null)
  assert.equal(hardRefusal({}), null, 'absent is not unknown')
})
