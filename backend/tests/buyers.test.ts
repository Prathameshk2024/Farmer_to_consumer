import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Order } from '@shared/types.js'
import type { Db } from '../src/db/seed.js'
import { buyersForSeller } from '../src/db/customers.js'

/**
 * A seller may only ever see buyers who have ordered from HER. The aggregation
 * is the enforcement point, so these tests are the proof: an order belonging to
 * another seller must not leak a name, a phone number or a rupee into her list.
 */

function order(over: Partial<Order>): Order {
  return {
    id: 'SMB0000',
    sellerId: 's1',
    customerId: 'c-9011223344',
    customerName: 'प्रिया देशमुख',
    customerPhone: '9011223344',
    address: 'पत्ता 1',
    pincode: '413601',
    items: [],
    itemsTotal: 0,
    deliveryFee: 0,
    total: 100,
    paymentMode: 'COD',
    paymentStatus: 'PENDING',
    status: 'DELIVERED',
    placedAt: '2026-09-01T00:00:00.000Z',
    events: [],
    ...over,
  } as Order
}

function dbWith(orders: Order[], customers: Db['customers'] = []): Db {
  return { sellers: [], products: [], orders, payments: [], customers } as unknown as Db
}

test('a seller sees only buyers who ordered from her', () => {
  const db = dbWith([
    order({ id: 'A1', sellerId: 's1', customerId: 'c-1', customerName: 'माझी ग्राहक', customerPhone: '9000000001' }),
    order({ id: 'B1', sellerId: 's2', customerId: 'c-2', customerName: 'दुसरीची ग्राहक', customerPhone: '9000000002' }),
  ])

  const mine = buyersForSeller(db, 's1')

  assert.equal(mine.length, 1)
  assert.equal(mine[0]!.customerId, 'c-1')
  assert.ok(
    !JSON.stringify(mine).includes('9000000002'),
    "another seller's customer must not leak, not even a phone number",
  )
})

test('a repeat buyer is one row carrying her order count', () => {
  const db = dbWith([
    order({ id: 'A1', total: 300, placedAt: '2026-09-01T00:00:00.000Z' }),
    order({ id: 'A2', total: 250, placedAt: '2026-09-04T00:00:00.000Z' }),
  ])

  const [buyer] = buyersForSeller(db, 's1')

  assert.equal(buyersForSeller(db, 's1').length, 1)
  assert.equal(buyer!.orderCount, 2)
  assert.equal(buyer!.totalSpent, 550)
})

test('cancelled and rejected orders count for neither total nor tally', () => {
  const db = dbWith([
    order({ id: 'A1', total: 300, status: 'DELIVERED' }),
    order({ id: 'A2', total: 999, status: 'CANCELLED' }),
    order({ id: 'A3', total: 777, status: 'REJECTED' }),
  ])

  const [buyer] = buyersForSeller(db, 's1')

  assert.equal(buyer!.orderCount, 1, 'a cancelled order is not a sale')
  assert.equal(buyer!.totalSpent, 300)
})

test('a buyer whose every order was cancelled still appears, at zero', () => {
  const db = dbWith([order({ id: 'A1', total: 300, status: 'CANCELLED' })])

  const [buyer] = buyersForSeller(db, 's1')

  assert.ok(buyer, 'she still tried to buy - hiding her would be misleading')
  assert.equal(buyer.orderCount, 0)
  assert.equal(buyer.totalSpent, 0)
})

test('buyers are sorted with the most recent first', () => {
  const db = dbWith([
    order({ id: 'A1', customerId: 'c-old', customerPhone: '9000000001', placedAt: '2026-08-01T00:00:00.000Z' }),
    order({ id: 'A2', customerId: 'c-new', customerPhone: '9000000002', placedAt: '2026-09-04T00:00:00.000Z' }),
  ])

  assert.deepEqual(
    buyersForSeller(db, 's1').map((b) => b.customerId),
    ['c-new', 'c-old'],
  )
})

test('the last order supplies the area shown next to her name', () => {
  const db = dbWith([
    order({ id: 'A1', address: 'जुना पत्ता', pincode: '413601', placedAt: '2026-08-01T00:00:00.000Z' }),
    order({ id: 'A2', address: 'नवा पत्ता', pincode: '413603', placedAt: '2026-09-04T00:00:00.000Z' }),
  ])

  const [buyer] = buyersForSeller(db, 's1')

  assert.equal(buyer!.lastAddress, 'नवा पत्ता')
  assert.equal(buyer!.pincode, '413603')
  assert.equal(buyer!.lastOrderAt, '2026-09-04T00:00:00.000Z')
})

test('the customer record supplies the name when there is one', () => {
  const db = dbWith(
    [order({ customerId: 'c-9011223344', customerName: 'ग्राहक' })],
    [
      {
        id: 'c-9011223344', phone: '9011223344', name: 'प्रिया देशमुख',
        addresses: [], createdAt: 'x', updatedAt: 'y',
      },
    ],
  )

  assert.equal(buyersForSeller(db, 's1')[0]!.name, 'प्रिया देशमुख')
})

test('a buyer with no customer record still shows, using the order name', () => {
  const db = dbWith([order({ customerName: 'अनोळखी ग्राहक' })], [])

  assert.equal(buyersForSeller(db, 's1')[0]!.name, 'अनोळखी ग्राहक')
})

test('a seller with no orders gets an empty list, not an error', () => {
  assert.deepEqual(buyersForSeller(dbWith([]), 's1'), [])
})
