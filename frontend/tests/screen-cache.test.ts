import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  clearScreenCache, dropCache, openScreen, readCache, screenIdentity, shownFor,
  writeCache, type Shown,
} from '../src/lib/screenCache.js'

/**
 * WHAT A SCREEN DRAWS IN ITS FIRST FRAME.
 *
 * The cache exists so Back looks like nothing happened: the list she left is
 * on screen at full height before the browser paints, and the scroll can go
 * back to where she was. It saves no server reads - every screen still fetches
 * - and it must never show one screen's answer at another screen's address.
 *
 * That last rule is the one that broke. Product A and product B are the same
 * component; tapping a card under "More from this shop" changes only the id.
 * Keeping "whatever is on screen" through the fetch left A's page, and A's
 * Add button, standing at B's address until B arrived.
 */

beforeEach(() => clearScreenCache())

const productA = screenIdentity(['A'], 'product:A')
const productB = screenIdentity(['B'], 'product:B')
const onA: Shown<string> = { for: productA, data: 'mango pickle', loading: false }

test('moving to a product never seen before shows the spinner, not the last one', () => {
  const shown = shownFor(onA, productB, 'product:B')
  assert.equal(shown.data, null)
  assert.equal(shown.loading, true)
})

test('moving to a product seen before shows its own last answer at once', () => {
  writeCache('product:B', 'lemon pickle')
  const shown = shownFor(onA, productB, 'product:B')
  assert.equal(shown.data, 'lemon pickle')
  assert.equal(shown.loading, false)
})

/**
 * The refetch of the screen she is on keeps what she is reading. A spinner in
 * its place collapses the page and the browser clamps her scroll to the top.
 */
test('the same screen keeps what it holds while it refetches', () => {
  assert.equal(shownFor(onA, productA, 'product:A'), onA)
})

test('a screen with no cache key still drops the previous id', () => {
  const reviewsA: Shown<string> = { for: screenIdentity(['A']), data: 'A reviews', loading: false }
  const shown = shownFor(reviewsA, screenIdentity(['B']))
  assert.equal(shown.data, null)
  assert.equal(shown.loading, true)
})

test('Back to a screen she has seen paints its last answer in the first frame', () => {
  writeCache('catalog', ['p1', 'p2'])
  const shown = openScreen<string[]>(screenIdentity([], 'catalog'), 'catalog')
  assert.deepEqual(shown.data, ['p1', 'p2'])
  assert.equal(shown.loading, false)
})

test('an answer whose refetch failed is not offered to the next visit', () => {
  writeCache('orders:mine', ['o1'])
  dropCache('orders:mine')
  assert.equal(openScreen(screenIdentity([], 'orders:mine'), 'orders:mine').loading, true)
})

/** A browsing session touches a few dozen screens; the cache holds 40. */
test('past 40 screens the one visited longest ago goes first', () => {
  for (let i = 0; i < 40; i++) writeCache(`s${i}`, i)
  writeCache('s0', 0) // visited again: now the most recent
  writeCache('s40', 40)
  assert.equal(readCache('s0'), 0)
  assert.equal(readCache('s1'), undefined)
  assert.equal(readCache('s40'), 40)
})

/** On a field coordinator's phone the next woman must not see this one's shop. */
test('ending a session forgets every screen', () => {
  writeCache('seller:products', ['her pickle'])
  clearScreenCache()
  assert.equal(readCache('seller:products'), undefined)
})
