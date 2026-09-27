import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Order } from '@shared/types.js'
import { dateOnly, isStuck, maskCustomer, maskedLabel, rupees, when } from '../src/lib/format.js'

function order(over: Partial<Order> = {}): Order {
  return {
    id: 'F2C1043',
    farmerId: 's1',
    customerId: 'c-9011223344',
    customerName: 'प्रिया देशमुख',
    customerPhone: '9011223344',
    address: 'फ्लॅट 302, शिवसागर अपार्टमेंट, विमाननगर',
    landmark: 'सिम्बायोसिस कॉलेजजवळ',
    pincode: '413601',
    items: [],
    itemsTotal: 0,
    deliveryFee: 0,
    total: 240,
    paymentMode: 'COD',
    paymentStatus: 'PENDING',
    status: 'ACCEPTED',
    placedAt: '2026-09-04T08:00:00.000Z',
    events: [{ to: 'ACCEPTED', at: '2026-09-04T08:00:00.000Z', by: 'farmer' }],
    ...over,
  } as Order
}

/* ---------------- the PII rule ---------------- */

test('the orders list never prints a buyer\'s name, phone or address', () => {
  const o = order()
  const label = maskedLabel(o)

  assert.ok(!label.includes('प्रिया देशमुख'), 'full name leaked')
  assert.ok(!label.includes('9011223344'), 'full phone leaked')
  assert.ok(!label.includes('शिवसागर'), 'home address leaked')
  assert.ok(!label.includes(o.landmark!), 'landmark leaked')
})

test('what is left is enough to tell two orders apart', () => {
  const m = maskCustomer(order())

  assert.equal(m.initial, 'प')
  assert.equal(m.phoneTail, '44')
  assert.equal(m.pincode, '413601', 'the pincode identifies an area, not a person')
})

test('masking survives a missing name or phone without throwing', () => {
  const m = maskCustomer(order({ customerName: '', customerPhone: '' }))

  assert.equal(m.initial, '?')
  assert.equal(m.phoneTail, '')
})

test('a Devanagari initial is one character, not one byte', () => {
  // 'प्रिया'[0] would slice a combining mark off and render broken.
  assert.equal(maskCustomer(order({ customerName: 'अर्पिता' })).initial, 'अ')
})

/* ---------------- stuck orders ---------------- */

test('stuck matches the thresholds /admin/stats already uses', () => {
  const now = new Date('2026-09-04T10:00:00.000Z').getTime()
  const at = (iso: string, status: Order['status']) =>
    order({ status, events: [{ to: status, at: iso, by: 'farmer' }] })

  assert.equal(isStuck(at('2026-09-03T09:00:00.000Z', 'ACCEPTED'), now), true, '25h accepted')
  assert.equal(isStuck(at('2026-09-03T11:00:00.000Z', 'ACCEPTED'), now), false, '23h accepted')
  assert.equal(isStuck(at('2026-09-03T21:00:00.000Z', 'OUT_FOR_DELIVERY'), now), true, '13h out')
  assert.equal(isStuck(at('2026-09-04T00:00:00.000Z', 'OUT_FOR_DELIVERY'), now), false, '10h out')
})

test('a delivered order is never stuck, however old', () => {
  const now = new Date('2027-01-01T00:00:00.000Z').getTime()
  assert.equal(isStuck(order({ status: 'DELIVERED' }), now), false)
})

test('an order with no events does not throw', () => {
  assert.equal(isStuck(order({ events: [] })), false)
})

/* ---------------- money and dates ---------------- */

test('money uses Indian digit grouping', () => {
  assert.equal(rupees(1240), '₹1,240')
  assert.equal(rupees(150000), '₹1,50,000', 'not ₹150,000 - this is an Indian product')
  assert.equal(rupees(0), '₹0')
})

test('an unparseable date renders as a dash rather than Invalid Date', () => {
  assert.equal(when('not a date'), '-')
})

/* ---------------- how long a request has waited ---------------- */

test('dateOnly keeps the year, in IST', () => assert.equal(dateOnly('2027-03-14T19:00:00.000Z'), '15 Mar 2027'))

test('a wait is told in the largest whole unit', async () => {
  const { waited } = await import('../src/lib/format.js')
  const at = Date.parse('2026-09-26T06:00:00Z')
  const iso = new Date(at).toISOString()
  assert.deepEqual(waited(iso, at + 5 * 60_000), { n: 5, unit: 'min' })
  assert.deepEqual(waited(iso, at + 3 * 3_600_000 + 59 * 60_000), { n: 3, unit: 'hour' })
  assert.deepEqual(waited(iso, at + 50 * 3_600_000), { n: 2, unit: 'day' })
  assert.deepEqual(waited(iso, at - 1000), { n: 0, unit: 'min' }, 'a clock slightly ahead is not a negative wait')
})
