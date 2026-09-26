import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { OrderRow, ProductRow, FarmerRow } from '../src/lib/api.js'
import {
  ORDER_SORTS, PRODUCT_SORTS, FARMER_SORTS, sortRows,
} from '../src/lib/sort.js'

/**
 * Every list in the console can be reordered: newest or oldest, by name, and
 * by whichever number "highest" means on that list. These hold the orderings
 * an admin will actually rely on - the farmer who
 * has earned most at the top - and the two ways sorting quietly goes wrong:
 * mixed-script names, and reordering the fetched array in place.
 */

const farmer = (id: string, over: Partial<FarmerRow>) =>
  ({ id, name: id, createdAt: '2026-01-01T00:00:00Z', earned: 0, ...over }) as FarmerRow
const ids = (rows: { id: string }[]) => rows.map((r) => r.id)

test('every list offers newest and oldest first, newest by default', () => {
  for (const list of [FARMER_SORTS, PRODUCT_SORTS, ORDER_SORTS]) {
    assert.equal(list[0]?.id, 'newest')
    assert.ok(list.some((o) => o.id === 'oldest'))
  }
})

test('farmers: newest joined, oldest joined', () => {
  const rows = [
    farmer('b', { createdAt: '2026-02-01T00:00:00Z' }),
    farmer('a', { createdAt: '2026-01-01T00:00:00Z' }),
    farmer('c', { createdAt: '2026-03-01T00:00:00Z' }),
  ]
  assert.deepEqual(ids(sortRows(rows, FARMER_SORTS, 'newest')), ['c', 'b', 'a'])
  assert.deepEqual(ids(sortRows(rows, FARMER_SORTS, 'oldest')), ['a', 'b', 'c'])
})

/**
 * A plain `<` puts every Latin name before every Devanagari one, and "asha"
 * after "Zarina". A collator gets both right.
 */
test('names sort alphabetically, ignoring case, in both scripts', () => {
  const rows = [
    farmer('1', { name: 'zarina' }),
    farmer('2', { name: 'Asha' }),
    farmer('3', { name: 'bharati' }),
  ]
  assert.deepEqual(sortRows(rows, FARMER_SORTS, 'nameAZ').map((s) => s.name), ['Asha', 'bharati', 'zarina'])
  assert.deepEqual(sortRows(rows, FARMER_SORTS, 'nameZA').map((s) => s.name), ['zarina', 'bharati', 'Asha'])

  const marathi = [farmer('1', { name: 'सुनीता' }), farmer('2', { name: 'अनिता' }), farmer('3', { name: 'कविता' })]
  assert.deepEqual(sortRows(marathi, FARMER_SORTS, 'nameAZ').map((s) => s.name), ['अनिता', 'कविता', 'सुनीता'])
})

test('farmers: highest earnings first', () => {
  const rows = [
    farmer('low', { earned: 100 }),
    farmer('high', { earned: 5000 }),
    farmer('none', { earned: undefined }),
  ]
  assert.deepEqual(ids(sortRows(rows, FARMER_SORTS, 'earnedHigh')), ['high', 'low', 'none'])
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
    { id: 'o1', total: 300, farmer: 'Sunita Masale' },
    { id: 'o2', total: 1200, farmer: 'Asha Papad' },
    { id: 'o3', total: 80, farmer: undefined },
  ] as OrderRow[]
  assert.deepEqual(ids(sortRows(rows, ORDER_SORTS, 'amountHigh')), ['o2', 'o1', 'o3'])
  assert.deepEqual(ids(sortRows(rows, ORDER_SORTS, 'nameAZ')).slice(-2), ['o2', 'o1'])
})

test('sorting returns a copy and leaves the fetched list as it was', () => {
  const rows = [farmer('a', { earned: 1 }), farmer('b', { earned: 2 })]
  sortRows(rows, FARMER_SORTS, 'earnedHigh')
  assert.deepEqual(ids(rows), ['a', 'b'])
})

test('an unknown saved choice falls back to the default rather than failing', () => {
  const rows = [
    farmer('old', { createdAt: '2026-01-01T00:00:00Z' }),
    farmer('new', { createdAt: '2026-05-01T00:00:00Z' }),
  ]
  assert.deepEqual(ids(sortRows(rows, FARMER_SORTS, 'no-such-sort')), ['new', 'old'])
})
