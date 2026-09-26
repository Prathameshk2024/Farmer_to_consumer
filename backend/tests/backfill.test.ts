import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Order } from '@shared/types.js'
import { deriveCustomersFromOrders, planBackfill } from '../src/db/customers.js'

/**
 * The fixtures mirror the five orders actually in Firestore on 2026-09-04,
 * including the two details that make the migration non-trivial: प्रिया has
 * two orders to two different pincodes, and रेखा's order carries no landmark.
 *
 * Note the customerIds - c1..c4, the seeded format. Login issues `c-<phone>`,
 * so these never match and her order history comes back empty. Rewriting them
 * is half the point of the backfill.
 */
function order(over: Partial<Order>): Order {
  return {
    id: 'SMB0000',
    sellerId: 's1',
    customerId: 'c1',
    customerName: 'कोणीतरी',
    customerPhone: '9000000000',
    address: 'पत्ता',
    pincode: '413601',
    items: [],
    itemsTotal: 0,
    deliveryFee: 0,
    total: 0,
    paymentMode: 'COD',
    paymentStatus: 'PENDING',
    status: 'PLACED',
    placedAt: '2026-09-01T00:00:00.000Z',
    events: [],
    ...over,
  } as Order
}

const LIVE_ORDERS: Order[] = [
  order({
    id: 'SMB1043', customerId: 'c1', customerName: 'प्रिया देशमुख', customerPhone: '9011223344',
    address: 'फ्लॅट 302, शिवसागर अपार्टमेंट, विमाननगर, पुणे',
    landmark: 'सिम्बायोसिस कॉलेजजवळ', pincode: '413601',
    placedAt: '2026-09-04T09:00:00.000Z',
  }),
  order({
    id: 'SMB1042', customerId: 'c2', customerName: 'अनिता कुलकर्णी', customerPhone: '9922334455',
    address: 'घर क्र. 12, गणेश नगर, आणदुर',
    landmark: 'ग्रामपंचायत ऑफिससमोर', pincode: '413601',
    placedAt: '2026-09-04T08:00:00.000Z',
  }),
  order({
    id: 'SMB1031', customerId: 'c4', customerName: 'रेखा भोसले', customerPhone: '9834455667',
    address: 'सर्वे नं. 45, तुळजापूर रोड, आणदुर',
    pincode: '413601',
    placedAt: '2026-09-03T10:00:00.000Z',
  }),
  order({
    id: 'SMB1044', customerId: 'c1', customerName: 'प्रिया देशमुख', customerPhone: '9011223344',
    address: 'फ्लॅट 302, शिवसागर अपार्टमेंट, विमाननगर, पुणे',
    landmark: 'सिम्बायोसिस कॉलेजजवळ', pincode: '413603',
    placedAt: '2026-09-03T09:00:00.000Z',
  }),
  order({
    id: 'SMB1039', customerId: 'c3', customerName: 'सविता मोरे', customerPhone: '9765544332',
    address: 'मु. पो. रांजणगाव, ता. तुळजापूर',
    landmark: 'शाळेजवळ', pincode: '413602',
    placedAt: '2026-09-03T08:00:00.000Z',
  }),
]

test('five orders collapse into four customers', () => {
  const customers = deriveCustomersFromOrders(LIVE_ORDERS)

  assert.equal(customers.length, 4)
  assert.deepEqual(
    customers.map((c) => c.id).sort(),
    ['c-9011223344', 'c-9765544332', 'c-9834455667', 'c-9922334455'],
  )
})

test("प्रिया's two orders become one customer holding two addresses", () => {
  const priya = deriveCustomersFromOrders(LIVE_ORDERS).find((c) => c.id === 'c-9011223344')!

  assert.equal(priya.name, 'प्रिया देशमुख')
  assert.equal(priya.addresses.length, 2, 'same line but different pincodes are different places')
  assert.deepEqual(priya.addresses.map((a) => a.pincode).sort(), ['413601', '413603'])
  assert.equal(priya.addresses.filter((a) => a.isDefault).length, 1)
})

test('the most recently used address is the default', () => {
  const priya = deriveCustomersFromOrders(LIVE_ORDERS).find((c) => c.id === 'c-9011223344')!

  // SMB1043 (413601) is newer than SMB1044 (413603).
  assert.equal(priya.addresses.find((a) => a.isDefault)!.pincode, '413601')
})

test('an order with no landmark still yields a usable address', () => {
  const rekha = deriveCustomersFromOrders(LIVE_ORDERS).find((c) => c.id === 'c-9834455667')!

  assert.equal(rekha.addresses.length, 1)
  assert.equal(rekha.addresses[0]!.landmark, undefined)
  assert.equal(rekha.addresses[0]!.line, 'सर्वे नं. 45, तुळजापूर रोड, आणदुर')
})

test('createdAt is the earliest order and updatedAt the latest', () => {
  const priya = deriveCustomersFromOrders(LIVE_ORDERS).find((c) => c.id === 'c-9011223344')!

  assert.equal(priya.createdAt, '2026-09-03T09:00:00.000Z')
  assert.equal(priya.updatedAt, '2026-09-04T09:00:00.000Z')
})

test('an order with no phone is reported, not silently dropped', () => {
  const orders = [...LIVE_ORDERS, order({ id: 'SMB9999', customerPhone: '' })]

  const plan = planBackfill(orders)

  assert.equal(plan.customers.length, 4, 'the phoneless order creates no customer')
  assert.deepEqual(plan.skipped, ['SMB9999'])
})

test('the plan rewrites every mismatched order id', () => {
  const plan = planBackfill(LIVE_ORDERS)

  assert.equal(plan.orderUpdates.length, 5)
  assert.deepEqual(
    plan.orderUpdates.find((u) => u.orderId === 'SMB1043'),
    { orderId: 'SMB1043', from: 'c1', to: 'c-9011223344' },
  )
})

test('running the backfill a second time changes nothing', () => {
  const first = planBackfill(LIVE_ORDERS)

  // Apply the rewrite, exactly as the script would.
  const migrated = LIVE_ORDERS.map((o) => {
    const update = first.orderUpdates.find((u) => u.orderId === o.id)
    return update ? { ...o, customerId: update.to } : o
  })

  const second = planBackfill(migrated)

  assert.equal(second.orderUpdates.length, 0, 'no order should need rewriting twice')
  assert.deepEqual(
    second.customers.map((c) => c.id).sort(),
    first.customers.map((c) => c.id).sort(),
  )
})
