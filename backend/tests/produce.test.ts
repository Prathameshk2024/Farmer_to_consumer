import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cartStep, categoryFor, harvestAgeDays, listingProblems, orderQtyProblem } from '@shared/produce.js'

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
  assert.ok(listingProblems({ ...good, minOrder: 300 }, now).minOrder, 'more than the farmer has')
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
  assert.equal(cartStep(p, 12, 1), 12, 'no more than the farmer has')
  assert.equal(cartStep(p, 0, 1), 5, 'the first tap adds the minimum')
})

test('the category comes from the crop, except for other', () => {
  assert.equal(categoryFor('onion', 'fruits'), 'vegetables', 'the crop wins over what was sent')
  assert.equal(categoryFor('other', 'spices'), 'spices', 'other: the farmer picks')
  assert.equal(categoryFor(undefined, undefined), undefined)
})

/** '2026-13-45' has the right shape, so only the calendar can refuse it. */
test('a date that does not exist is refused, not aged as NaN', () => {
  assert.equal(listingProblems({ ...good, harvestDate: '2026-13-45' }, now).harvestDate, 'काढणीची तारीख टाका')
})

/**
 * Less on the shelf than the farmer's minimum is nothing a buyer may order - a line of
 * 0, or of 3 when they send 5, would be refused at checkout.
 */
test('the first tap adds nothing when the stock is below the minimum', () => {
  assert.equal(cartStep({ minOrder: 5, stock: 0 }, 0, 1), 0)
  assert.equal(cartStep({ minOrder: 5, stock: 3 }, 0, 1), 0)
  assert.equal(cartStep({ minOrder: 1, stock: 0 }, 0, 1), 0)
})

/** The same cap as a review comment: a listing is a few lines, not a pamphlet. */
test('a description past 500 characters is refused', () => {
  assert.ok(listingProblems({ ...good, description: 'अ'.repeat(501) }, now).description)
  assert.deepEqual(listingProblems({ ...good, description: 'अ'.repeat(500) }, now), {})
})

/**
 * The cart steps between the minimum and the stock on the buyer's phone; the
 * server holds the same rule, because a phone can send anything. The message
 * names the product, the number and the unit, so the farmer knows what to change.
 */
test('an order quantity must be whole, at least the minimum, at most the stock', () => {
  const tomato = { name: 'टोमॅटो', unit: 'kg' as const, minOrder: 2, stock: 150 }
  assert.equal(orderQtyProblem(tomato, 1), 'टोमॅटो: किमान 2 किलो ऑर्डर करा', 'below the minimum')
  assert.equal(orderQtyProblem(tomato, 151), 'टोमॅटो: फक्त 150 किलो उपलब्ध आहे', 'above the stock')
  assert.ok(orderQtyProblem(tomato, 2.5), 'fractional')
  assert.ok(orderQtyProblem(tomato, NaN), 'not a number')
  assert.ok(orderQtyProblem(tomato, '5'), 'a string is not a quantity')
  assert.equal(orderQtyProblem(tomato, 2), null, 'a valid order')
  assert.equal(orderQtyProblem(tomato, 150), null)
  assert.ok(orderQtyProblem({ ...tomato, minOrder: 0 }, 0), 'never below 1, whatever the listing says')
})
