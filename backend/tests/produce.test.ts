import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cartStep, categoryFor, harvestAgeDays, listingProblems } from '@shared/produce.js'

const DAY = 86_400_000
const now = Date.parse('2026-09-26T06:00:00Z')
const good = {
  cropId: 'tomato', name: 'टोमॅटो', categoryId: 'vegetables', unit: 'kg' as const,
  price: 40, stock: 200, minOrder: 5, harvestDate: '2026-09-25', cultivation: 'organic' as const,
}

test('a complete listing has no problems', () => {
  assert.deepEqual(listingProblems(good, now), {})
})

test('price, stock and minimum order must make sense together', () => {
  assert.ok(listingProblems({ ...good, price: 0 }, now).price)
  assert.ok(listingProblems({ ...good, stock: -1 }, now).stock)
  assert.ok(listingProblems({ ...good, minOrder: 0 }, now).minOrder)
  assert.ok(listingProblems({ ...good, minOrder: 300 }, now).minOrder, 'more than he has')
})

test('a harvest date cannot be tomorrow', () => {
  assert.ok(listingProblems({ ...good, harvestDate: '2026-09-27' }, now).harvestDate)
})

test('fresh produce older than 60 days is refused; grain is not', () => {
  const old = new Date(now - 61 * DAY).toISOString().slice(0, 10)
  assert.ok(listingProblems({ ...good, harvestDate: old }, now).harvestDate)
  assert.deepEqual(listingProblems({ ...good, cropId: 'wheat', categoryId: 'grains', harvestDate: old }, now), {})
})

test('unknown unit, crop or cultivation is refused', () => {
  assert.ok(listingProblems({ ...good, unit: 'g' as never }, now).unit)
  assert.ok(listingProblems({ ...good, cropId: 'nonsense' }, now).cropId)
  assert.ok(listingProblems({ ...good, cultivation: 'magic' as never }, now).cultivation)
})

test('harvest age in whole days', () => {
  assert.equal(harvestAgeDays('2026-09-25', now), 1)
  assert.equal(harvestAgeDays('2026-09-26', now), 0)
})

test('the cart steps between the minimum and the stock', () => {
  const p = { minOrder: 5, stock: 12 }
  assert.equal(cartStep(p, 5, -1), 0, 'below the minimum the line goes')
  assert.equal(cartStep(p, 5, 1), 6)
  assert.equal(cartStep(p, 12, 1), 12, 'no more than he has')
  assert.equal(cartStep(p, 0, 1), 5, 'the first tap adds the minimum')
})

test('the category comes from the crop, except for other', () => {
  assert.equal(categoryFor('onion', 'fruits'), 'vegetables', 'the crop wins over what was sent')
  assert.equal(categoryFor('other', 'spices'), 'spices', 'other: the farmer picks')
  assert.equal(categoryFor(undefined, undefined), undefined)
})
