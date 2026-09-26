import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { CartItem } from '@shared/types.js'
import { addLine, canAddFrom, cartFarmer, cartFarmerName, lineMinOrder, stepLine } from '../src/store/cartRules.js'

/**
 * ONE FARMER OWNS THE CART.
 *
 * A cart that mixed farmers was honest about the data - each farmer is her
 * own order, her own delivery, her own UPI - and hard on the woman holding
 * the phone, who put three things in one basket and was asked to make three
 * payments. The first shop she adds from now owns the cart until she empties
 * it or orders from it.
 *
 * What must never happen is the cart clearing itself: these tests pin that
 * the rule only ever REFUSES, and that the refusal can name the shop she is
 * already buying from.
 */

const item = (over: Partial<CartItem> = {}): CartItem => ({
  productId: 'p1', farmerId: 's1', farmerName: 'हंजगी गृह उद्योग',
  name: 'टोमॅटो', emoji: '🍅', price: 40, unit: 'kg', minOrder: 1, qty: 1, ...over,
})

test('an empty cart accepts anybody', () => {
  assert.equal(cartFarmer([]), null)
  assert.equal(canAddFrom([], 's1'), true)
  assert.equal(canAddFrom([], 's2'), true)
})

test('the first item decides whose cart it is', () => {
  const cart = [item()]
  assert.equal(cartFarmer(cart), 's1')
  assert.equal(canAddFrom(cart, 's1'), true)
  assert.equal(canAddFrom(cart, 's2'), false)
})

test('more from the same shop is always allowed', () => {
  // The limit is one FARMER, not one product. Five crops from one farm is
  // exactly the cart this rule is trying to produce.
  const cart = [item(), item({ productId: 'p2' }), item({ productId: 'p3' })]
  assert.equal(canAddFrom(cart, 's1'), true)
})

test('emptying the cart hands it back to anybody', () => {
  // Her way out, and the reason the refusal points at the cart: removing the
  // last item is what unlocks the rest of the market.
  assert.equal(canAddFrom([], 's2'), true)
})

test('the cart can name the shop that holds it', () => {
  // The refusal has to say WHOSE cart it is, and it cannot wait on the
  // catalogue to load to find out - so the name is copied in on the way in.
  assert.equal(cartFarmerName([item()]), 'हंजगी गृह उद्योग')
  assert.equal(cartFarmerName([]), undefined)
})

test('a cart saved before the name was stored still locks', () => {
  // Rows in localStorage from the old cart carry no farmerName. The lock is
  // keyed on farmerId, so it still holds; only the shop's name is missing.
  const legacy = [item({ farmerName: undefined })]
  assert.equal(canAddFrom(legacy, 's2'), false)
  assert.equal(cartFarmerName(legacy), undefined)
})

test('a line steps between the farmer\'s minimum and his stock', () => {
  const line = item({ minOrder: 5, qty: 5 })
  assert.equal(stepLine(line, 12, 1), 6)
  assert.equal(stepLine(line, 12, -1), 0, 'below the minimum the line goes, because she tapped −')
  assert.equal(stepLine(item({ minOrder: 5, qty: 12 }), 12, 1), 12, 'no more than he has')
})

test('a line saved before the minimum existed is read as minimum 1', () => {
  const legacy = { ...item({ qty: 2 }), minOrder: undefined } as unknown as CartItem
  assert.equal(lineMinOrder(legacy), 1)
  assert.equal(stepLine(legacy, 10, -1), 1)
})

const tomato = {
  id: 'p1', farmerId: 's1', name: 'टोमॅटो', emoji: '🍅', price: 40, unit: 'kg' as const, minOrder: 2, stock: 150,
}

test('the first add puts in the farmer\'s minimum', () => {
  const r = addLine([], tomato)
  assert.equal(r.ok, true)
  assert.equal(r.items[0]?.qty, 2)
})

/**
 * Stock below the minimum is nothing to sell. A line of 0 would be an order
 * the server refuses, and saying "added" about nothing is a lie on screen.
 */
test('adding when there is nothing to add inserts no line and reports false', () => {
  for (const p of [{ ...tomato, stock: 0 }, { ...tomato, stock: 1 }]) {
    const r = addLine([], p)
    assert.equal(r.ok, false)
    assert.deepEqual(r.items, [])
  }
})

test('another shop\'s product is refused and the cart is untouched', () => {
  const cart = [item()]
  const r = addLine(cart, { ...tomato, id: 'p9', farmerId: 's2' })
  assert.equal(r.ok, false)
  assert.equal(r.items, cart)
})
