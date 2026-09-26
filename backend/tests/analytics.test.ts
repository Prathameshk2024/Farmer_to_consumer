import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Order } from '@shared/types.js'
import { emptyDb } from '../src/db/seed.js'
import { sellerWeek, startOfWeek } from '../src/db/analytics.js'

/**
 * "My growth" showed "not enough information yet" to every real seller on the
 * platform, however much she had sold.
 *
 * Two separate reasons, and both are covered here:
 *
 *  1. the endpoint answered out of a hard-coded table that held one invented
 *     week for the demo seller `s1` and nothing for anybody else, so a real
 *     woman's own orders were never read;
 *  2. the screen then hid itself below FIVE orders in the current week -
 *     which is to say it hid itself at exactly the moment a first sale would
 *     have been worth showing her.
 *
 * The rule that decides every number below: money is counted on DELIVERY, not
 * on the order being placed, because delivery is when she was paid. The
 * "earned today" tile on My Business uses the same rule, and if the two ever
 * disagree she will trust neither.
 */

const DAY = 86_400_000

function order(o: Partial<Order> & { id: string; total: number }): Order {
  return {
    sellerId: 's1',
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
    events: [{ to: 'DELIVERED', at: new Date(at).toISOString(), by: 'seller' }],
    ...extra,
  })
}

function dbWith(orders: Order[]) {
  const db = emptyDb()
  db.orders = orders
  return db
}

test('a seller who has never sold anything gets null, not a week of zeroes', () => {
  // Seven empty bars read as failure to somebody who has not started. The
  // screen shows an encouraging empty state instead.
  assert.equal(sellerWeek(dbWith([]), 's1'), null)
})

test('ONE delivered order is enough to have a growth chart', () => {
  // The regression test. This is the case that used to say "not enough
  // information yet" - the single most discouraging moment to say it.
  const now = Date.now()
  const week = sellerWeek(dbWith([delivered('o1', 90, startOfWeek(now) + 2 * DAY)]), 's1', now)

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
      events: [{ to: 'DELIVERED', at: new Date(weekStart + 2 * DAY).toISOString(), by: 'seller' }],
    }),
  ])

  const week = sellerWeek(db, 's1', now)!
  assert.equal(week.days[0]!.v, 0, 'Monday, when it was ordered')
  assert.equal(week.days[2]!.v, 500, 'Wednesday, when she was paid')
})

test('an order that was cancelled or rejected is not earnings', () => {
  const now = Date.now()
  const at = startOfWeek(now) + DAY
  const db = dbWith([
    delivered('o1', 100, at),
    delivered('o2', 999, at, { status: 'CANCELLED' }),
    delivered('o3', 999, at, { status: 'REJECTED' }),
  ])

  const week = sellerWeek(db, 's1', now)!
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

  const week = sellerWeek(db, 's1', now)!
  assert.equal(week.days.reduce((n, d) => n + d.v, 0), 300, 'this week')
  assert.equal(week.lastWeekTotal, 200)
  assert.equal(week.ordersLastWeek, 1)
})

test('an order older than two weeks is in neither total', () => {
  const now = Date.now()
  const db = dbWith([delivered('old', 700, startOfWeek(now) - 30 * DAY)])

  const week = sellerWeek(db, 's1', now)!
  assert.equal(week.days.reduce((n, d) => n + d.v, 0), 0)
  assert.equal(week.lastWeekTotal, 0)
  // She has still earned before, so she still gets a chart rather than null.
  assert.equal(week.ordered, 1)
})

test('another seller orders never reach her chart', () => {
  const now = Date.now()
  const at = startOfWeek(now) + DAY
  const db = dbWith([
    delivered('mine', 100, at),
    delivered('hers', 5000, at, { sellerId: 's2' }),
  ])

  assert.equal(sellerWeek(db, 's1', now)!.days.reduce((n, d) => n + d.v, 0), 100)
})

test('a buyer who ordered twice counts once as a repeat customer', () => {
  const now = Date.now()
  const at = startOfWeek(now) + DAY
  const db = dbWith([
    delivered('o1', 100, at),
    delivered('o2', 100, at),
    delivered('o3', 100, at, { customerId: 'c-9922334455' }),
  ])

  assert.equal(sellerWeek(db, 's1', now)!.repeatCustomers, 1)
})

test('the week starts on Monday', () => {
  // Sunday must belong to the week that is ending, not the one starting.
  const sunday = new Date('2026-09-06T18:00:00').getTime()
  const start = new Date(startOfWeek(sunday))

  assert.equal(start.getDay(), 1, 'Monday')
  assert.equal(start.getDate(), 31, '31 August 2026 is that Monday')
})
