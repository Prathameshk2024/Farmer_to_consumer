import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Order } from '@shared/types.js'
import { emptyDb } from '../src/db/seed.js'
import { activeFarmerCount, farmerWeek, fdriBandCounts, startOfWeek } from '../src/db/analytics.js'

/**
 * "My growth" showed "not enough information yet" to every real farmer on the
 * platform, however much they had sold.
 *
 * Two separate reasons, and both are covered here:
 *
 *  1. the endpoint answered out of a hard-coded table that held one invented
 *     week for the demo farmer `s1` and nothing for anybody else, so a real
 *     farmer's own orders were never read;
 *  2. the screen then hid itself below FIVE orders in the current week -
 *     which is to say it hid itself at exactly the moment a first sale would
 *     have been worth showing them.
 *
 * The rule that decides every number below: money is counted on DELIVERY, not
 * on the order being placed, because delivery is when the farmer was paid. The
 * "earned today" tile on My Business uses the same rule, and if the two ever
 * disagree the farmer will trust neither.
 */

const DAY = 86_400_000

function order(o: Partial<Order> & { id: string; total: number }): Order {
  return {
    farmerId: 's1',
    customerId: 'c-9011223344',
    customerName: 'प्रिया',
    customerPhone: '9011223344',
    address: 'घर क्र. 12',
    pincode: '413601',
    items: [],
    itemsTotal: o.total,
    deliveryFee: 0,
    paymentMode: 'COD',
    paymentStatus: 'COD_COLLECTED',
    status: 'DELIVERED',
    placedAt: new Date().toISOString(),
    events: [],
    ...o,
  } as unknown as Order
}

/** An order delivered `daysAgo` days back, which is when it counts. */
function delivered(id: string, total: number, at: number, extra: Partial<Order> = {}): Order {
  return order({
    id,
    total,
    placedAt: new Date(at - DAY).toISOString(),
    events: [{ to: 'DELIVERED', at: new Date(at).toISOString(), by: 'farmer' }],
    ...extra,
  })
}

function dbWith(orders: Order[]) {
  const db = emptyDb()
  db.orders = orders
  return db
}

test('a farmer who has never sold anything gets null, not a week of zeroes', () => {
  // Seven empty bars read as failure to somebody who has not started. The
  // screen shows an encouraging empty state instead.
  assert.equal(farmerWeek(dbWith([]), 's1'), null)
})

test('ONE delivered order is enough to have a growth chart', () => {
  // The regression test. This is the case that used to say "not enough
  // information yet" - the single most discouraging moment to say it.
  const now = Date.now()
  const week = farmerWeek(dbWith([delivered('o1', 90, startOfWeek(now) + 2 * DAY)]), 's1', now)

  assert.ok(week, 'one delivered order must produce a week')
  assert.equal(week.ordersThisWeek, 1)
  assert.equal(week.days.reduce((n, d) => n + d.v, 0), 90)
})

test('money lands on the day it was DELIVERED, not the day it was ordered', () => {
  // An order placed Monday and handed over Wednesday is Wednesday's earnings.
  const now = Date.now()
  const weekStart = startOfWeek(now)
  const db = dbWith([
    order({
      id: 'o1',
      total: 500,
      placedAt: new Date(weekStart).toISOString(),
      events: [{ to: 'DELIVERED', at: new Date(weekStart + 2 * DAY).toISOString(), by: 'farmer' }],
    }),
  ])

  const week = farmerWeek(db, 's1', now)!
  assert.equal(week.days[0]!.v, 0, 'Monday, when it was ordered')
  assert.equal(week.days[2]!.v, 500, 'Wednesday, when the farmer was paid')
})

test('an order that was cancelled or rejected is not earnings', () => {
  const now = Date.now()
  const at = startOfWeek(now) + DAY
  const db = dbWith([
    delivered('o1', 100, at),
    delivered('o2', 999, at, { status: 'CANCELLED' }),
    delivered('o3', 999, at, { status: 'REJECTED' }),
  ])

  const week = farmerWeek(db, 's1', now)!
  assert.equal(week.days.reduce((n, d) => n + d.v, 0), 100)
  assert.equal(week.ordersThisWeek, 1)
})

test('last week is counted separately, so the comparison means something', () => {
  const now = Date.now()
  const weekStart = startOfWeek(now)
  const db = dbWith([
    delivered('o1', 300, weekStart + DAY),
    delivered('o2', 200, weekStart - 3 * DAY),
  ])

  const week = farmerWeek(db, 's1', now)!
  assert.equal(week.days.reduce((n, d) => n + d.v, 0), 300, 'this week')
  assert.equal(week.lastWeekTotal, 200)
  assert.equal(week.ordersLastWeek, 1)
})

test('an order older than two weeks is in neither total', () => {
  const now = Date.now()
  const db = dbWith([delivered('old', 700, startOfWeek(now) - 30 * DAY)])

  const week = farmerWeek(db, 's1', now)!
  assert.equal(week.days.reduce((n, d) => n + d.v, 0), 0)
  assert.equal(week.lastWeekTotal, 0)
  // The farmer has still earned before, so they still get a chart rather than null.
  assert.equal(week.ordered, 1)
})

test('another farmer orders never reach their chart', () => {
  const now = Date.now()
  const at = startOfWeek(now) + DAY
  const db = dbWith([
    delivered('mine', 100, at),
    delivered('theirs', 5000, at, { farmerId: 's2' }),
  ])

  assert.equal(farmerWeek(db, 's1', now)!.days.reduce((n, d) => n + d.v, 0), 100)
})

test('a buyer who ordered twice counts once as a repeat customer', () => {
  const now = Date.now()
  const at = startOfWeek(now) + DAY
  const db = dbWith([
    delivered('o1', 100, at),
    delivered('o2', 100, at),
    delivered('o3', 100, at, { customerId: 'c-9922334455' }),
  ])

  assert.equal(farmerWeek(db, 's1', now)!.repeatCustomers, 1)
})

test('the week starts on Monday', () => {
  // Sunday must belong to the week that is ending, not the one starting.
  const sunday = new Date('2026-09-06T18:00:00').getTime()
  const start = new Date(startOfWeek(sunday))

  assert.equal(start.getDay(), 1, 'Monday')
  assert.equal(start.getDate(), 31, '31 August 2026 is that Monday')
})

/**
 * A closed account's FDRI answers are erased to zero. Counted, each one
 * would be a "low" nobody gave, skewing the research chart.
 */
test('FDRI band counts leave closed accounts out', () => {
  const counts = fdriBandCounts([
    { fdriBand: 'moderate', status: 'ACTIVE' },
    { fdriBand: 'low', status: 'PENDING_VERIFICATION' },
    { fdriBand: 'low', status: 'CLOSED' },
  ])
  assert.deepEqual(counts, [
    { band: 'low', v: 1 }, { band: 'moderate', v: 1 }, { band: 'high', v: 0 },
  ])
})

/**
 * "Active" on the impact report used to mean verified, while the dashboard
 * meant verified and subscribed - two numbers for one word. A verified farmer
 * whose term has lapsed, or who never paid, is not reachable by a buyer.
 */
test('active farmers are the ones a buyer can reach: verified and subscribed', () => {
  const future = '2099-01-01T00:00:00.000Z'
  const farmers = [
    { status: 'ACTIVE' as const, subscriptionEndsAt: future },
    { status: 'ACTIVE' as const },
    { status: 'ACTIVE' as const, subscriptionEndsAt: '2000-01-01T00:00:00.000Z' },
    { status: 'PENDING_VERIFICATION' as const, subscriptionEndsAt: future },
  ]
  assert.equal(activeFarmerCount(farmers), 1)
})
