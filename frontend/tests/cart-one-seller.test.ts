import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { CartItem } from '@shared/types.js'
import { canAddFrom, cartSeller, cartSellerName } from '../src/store/cartRules.js'

/**
 * ONE SELLER OWNS THE CART.
 *
 * A cart that mixed sellers was honest about the data - each seller is her
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
  productId: 'p1', sellerId: 's1', sellerName: 'हंजगी गृह उद्योग',
  name: 'लोणचं', emoji: '🥭', price: 200, unit: 'kg', qty: 1, ...over,
})

test('an empty cart accepts anybody', () => {
  assert.equal(cartSeller([]), null)
  assert.equal(canAddFrom([], 's1'), true)
  assert.equal(canAddFrom([], 's2'), true)
})

test('the first item decides whose cart it is', () => {
  const cart = [item()]
  assert.equal(cartSeller(cart), 's1')
  assert.equal(canAddFrom(cart, 's1'), true)
  assert.equal(canAddFrom(cart, 's2'), false)
})

test('more from the same shop is always allowed', () => {
  // The limit is one SELLER, not one product. Five jars from one shop is
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
  assert.equal(cartSellerName([item()]), 'हंजगी गृह उद्योग')
  assert.equal(cartSellerName([]), undefined)
})

test('a cart saved before the name was stored still locks', () => {
  // Rows in localStorage from the old cart carry no sellerName. The lock is
  // keyed on sellerId, so it still holds; only the shop's name is missing.
  const legacy = [item({ sellerName: undefined })]
  assert.equal(canAddFrom(legacy, 's2'), false)
  assert.equal(cartSellerName(legacy), undefined)
})
