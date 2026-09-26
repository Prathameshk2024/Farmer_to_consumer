import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.SESSION_SECRET = 'test-secret-for-unit-tests'
const { median, perUnitFromQuintal, platformPrice, parseAgmarknet, mandiPrice } =
  await import('../src/insights/price.js')
const { emptyDb } = await import('../src/db/seed.js')

/**
 * Advice, never a default. The farmer sees what others here ask and what
 * the mandi paid, with the source beside each number, and types a price of
 * their own.
 */

test('median of an odd and an even list; nothing for nothing', () => {
  assert.equal(median([30, 10, 20]), 20)
  assert.equal(median([10, 20, 30, 40]), 25)
  assert.equal(median([]), undefined)
})

test('a quintal price becomes a kilo price; dozens and pieces get none', () => {
  assert.equal(perUnitFromQuintal(2800, 'kg'), 28)
  assert.equal(perUnitFromQuintal(2800, 'quintal'), 2800)
  assert.equal(perUnitFromQuintal(2800, 'dozen'), undefined)
  assert.equal(perUnitFromQuintal(2800, 'piece'), undefined)
})

test('platform price counts live listings of the same crop and unit only', () => {
  const db = emptyDb()
  const f = { id: 'f', status: 'ACTIVE', isOpen: true } as never
  db.farmers.push(f)
  const p = (id: string, price: number, unit = 'kg', status = 'LIVE', cropId = 'onion') =>
    ({ id, farmerId: 'f', cropId, unit, price, status }) as never
  db.products.push(p('a', 20), p('b', 30), p('c', 999, 'quintal'), p('d', 999, 'kg', 'DRAFT'), p('e', 999, 'kg', 'LIVE', 'tomato'))
  const r = platformPrice(db, 'onion', 'kg')
  assert.equal(r.median, 25)
  assert.equal(r.listings, 2)
})

test('the newest mandi record wins', () => {
  const r = parseAgmarknet({ records: [
    { market: 'Tuljapur', arrival_date: '20/09/2026', modal_price: '2500' },
    { market: 'Dharashiv', arrival_date: '24/09/2026', modal_price: '2800' },
  ] })
  assert.deepEqual(r, { market: 'Dharashiv', date: '2026-09-24', modal: 2800 })
  assert.equal(parseAgmarknet({ records: [] }), undefined)
  assert.equal(parseAgmarknet('garbage'), undefined)
})

test('a failing feed is an absent line, not an error', async () => {
  const boom = async () => { throw new Error('network') }
  assert.equal(await mandiPrice('onion', boom), undefined)
  assert.equal(await mandiPrice('other', async () => ({ records: [] })), undefined, 'no commodity name, no call')
})
