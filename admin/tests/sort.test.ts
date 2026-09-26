import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { SubscriptionPayment } from '@shared/types.js'
import type { OrderRow, ProductRow, SellerRow } from '../src/lib/api.js'
import {
  ORDER_SORTS, PAYMENT_SORTS, PRODUCT_SORTS, SELLER_SORTS, sortRows,
} from '../src/lib/sort.js'

/**
 * Every list in the console can be reordered: newest or oldest, by name, and
 * by whichever number "highest" means on that list. These hold the orderings
 * an admin will actually rely on - the queue read oldest-first, the woman who
 * has earned most at the top - and the two ways sorting quietly goes wrong:
 * mixed-script names, and reordering the fetched array in place.
 */

const seller = (id: string, over: Partial<SellerRow>) =>
  ({ id, name: id, createdAt: '2026-01-01T00:00:00Z', packsApproved: 0, earned: 0, ...over }) as SellerRow
const ids = (rows: { id: string }[]) => rows.map((r) => r.id)

test('every list offers newest and oldest first, newest by default', () => {
  for (const list of [SELLER_SORTS, PRODUCT_SORTS, ORDER_SORTS, PAYMENT_SORTS]) {
    assert.equal(list[0]?.id, 'newest')
    assert.ok(list.some((o) => o.id === 'oldest'))
  }
})

test('sellers: newest joined, oldest joined', () => {
  const rows = [
    seller('b', { createdAt: '2026-02-01T00:00:00Z' }),
    seller('a', { createdAt: '2026-01-01T00:00:00Z' }),
    seller('c', { createdAt: '2026-03-01T00:00:00Z' }),
  ]
  assert.deepEqual(ids(sortRows(rows, SELLER_SORTS, 'newest')), ['c', 'b', 'a'])
  assert.deepEqual(ids(sortRows(rows, SELLER_SORTS, 'oldest')), ['a', 'b', 'c'])
})

/**
 * A plain `<` puts every Latin name before every Devanagari one, and "asha"
 * after "Zarina". A collator gets both right.
 */
test('names sort alphabetically, ignoring case, in both scripts', () => {
  const rows = [
    seller('1', { name: 'zarina' }),
    seller('2', { name: 'Asha' }),
    seller('3', { name: 'bharati' }),
  ]
  assert.deepEqual(sortRows(rows, SELLER_SORTS, 'nameAZ').map((s) => s.name), ['Asha', 'bharati', 'zarina'])
  assert.deepEqual(sortRows(rows, SELLER_SORTS, 'nameZA').map((s) => s.name), ['zarina', 'bharati', 'Asha'])

  const marathi = [seller('1', { name: 'सुनीता' }), seller('2', { name: 'अनिता' }), seller('3', { name: 'कविता' })]
  assert.deepEqual(sortRows(marathi, SELLER_SORTS, 'nameAZ').map((s) => s.name), ['अनिता', 'कविता', 'सुनीता'])
})

test('sellers: highest earnings first, and most packs first', () => {
  const rows = [
    seller('low', { earned: 100, packsApproved: 3 }),
    seller('high', { earned: 5000, packsApproved: 1 }),
    seller('none', { earned: undefined, packsApproved: 0 }),
  ]
  assert.deepEqual(ids(sortRows(rows, SELLER_SORTS, 'earnedHigh')), ['high', 'low', 'none'])
  assert.deepEqual(ids(sortRows(rows, SELLER_SORTS, 'packsHigh')), ['low', 'high', 'none'])
})

test('products: by price both ways', () => {
  const rows = [
    { id: 'mid', price: 150 }, { id: 'cheap', price: 40 }, { id: 'dear', price: 900 },
  ] as ProductRow[]
  assert.deepEqual(ids(sortRows(rows, PRODUCT_SORTS, 'priceHigh')), ['dear', 'mid', 'cheap'])
  assert.deepEqual(ids(sortRows(rows, PRODUCT_SORTS, 'priceLow')), ['cheap', 'mid', 'dear'])
})

test('orders: by amount, and by shop name', () => {
  const rows = [
    { id: 'o1', total: 300, seller: 'Sunita Masale' },
    { id: 'o2', total: 1200, seller: 'Asha Papad' },
    { id: 'o3', total: 80, seller: undefined },
  ] as OrderRow[]
  assert.deepEqual(ids(sortRows(rows, ORDER_SORTS, 'amountHigh')), ['o2', 'o1', 'o3'])
  assert.deepEqual(ids(sortRows(rows, ORDER_SORTS, 'nameAZ')).slice(-2), ['o2', 'o1'])
})

/** The payment queue read as a queue: whoever has waited longest. */
test('payments: oldest first puts the longest wait at the top', () => {
  const rows = [
    { id: 'today', submittedAt: '2026-09-15T09:00:00Z' },
    { id: 'monday', submittedAt: '2026-09-13T09:00:00Z' },
  ] as SubscriptionPayment[]
  assert.deepEqual(ids(sortRows(rows, PAYMENT_SORTS, 'oldest')), ['monday', 'today'])
})

test('sorting returns a copy and leaves the fetched list as it was', () => {
  const rows = [seller('a', { earned: 1 }), seller('b', { earned: 2 })]
  sortRows(rows, SELLER_SORTS, 'earnedHigh')
  assert.deepEqual(ids(rows), ['a', 'b'])
})

test('an unknown saved choice falls back to the default rather than failing', () => {
  const rows = [
    seller('old', { createdAt: '2026-01-01T00:00:00Z' }),
    seller('new', { createdAt: '2026-05-01T00:00:00Z' }),
  ]
  assert.deepEqual(ids(sortRows(rows, SELLER_SORTS, 'no-such-sort')), ['new', 'old'])
})
