import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { AdminNotice, Order, Farmer } from '@shared/types.js'
import {
  adminFeed, buildFeed, daysAgo, mergeFeeds, noticeLabelKey, splitFeed, visibleFeed,
  whenKey, type Notice,
} from '../src/lib/notifications.js'
import { dictionaries } from '../src/i18n/strings.js'

/**
 * The updates list is read by a buyer waiting at home, not by the state
 * machine. It used to print the machine's own label - "Packed", "Accepted" -
 * which says what the ORDER is, and leaves them to work out who did what to it.
 * Each side now gets a sentence aimed at itself.
 */

test('the customer is told what happened to THEIR order', () => {
  assert.equal(
    dictionaries.en[noticeLabelKey('ACCEPTED', 'customer')],
    'Your order has been accepted',
  )
  assert.equal(
    dictionaries.en[noticeLabelKey('DELIVERED', 'customer')],
    'Your order has been delivered',
  )
})

/** The same event, the other way round: for the farmer it is work to do. */
test('the farmer is told there is something to do', () => {
  assert.equal(dictionaries.en[noticeLabelKey('PLACED', 'farmer')], 'You have a new order')
  assert.notEqual(
    noticeLabelKey('CANCELLED', 'farmer'),
    noticeLabelKey('CANCELLED', 'customer'),
  )
})

/** A state nobody wrote a sentence for still reads as words, not as a key. */
test('an unmapped state falls back to the plain status label', () => {
  const key = noticeLabelKey('PACKED', 'farmer')
  assert.equal(key, 'ord.status.PACKED')
  assert.ok(dictionaries.mr[key], 'the fallback has to exist in both dictionaries')
  assert.ok(dictionaries.en[key])
})

test('every line the feed can print exists in both languages', () => {
  const states = [
    'PLACED', 'ACCEPTED', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'REJECTED', 'CANCELLED',
  ] as const
  const missing: string[] = []
  for (const role of ['farmer', 'customer'] as const) {
    for (const s of states) {
      for (const f of ['delivery', 'pickup'] as const) {
        const key = noticeLabelKey(s, role, f)
        if (!dictionaries.mr[key] || !dictionaries.en[key]) missing.push(`${role}/${s}/${f}: ${key}`)
      }
    }
  }
  assert.deepEqual(missing, [])
})

/** Pickup is ready to collect, then collected - never "on its way". */
test('a pickup order speaks of collecting, not delivering', () => {
  assert.equal(dictionaries.en[noticeLabelKey('PACKED', 'customer', 'pickup')], 'Your order is ready to collect')
  assert.equal(dictionaries.en[noticeLabelKey('DELIVERED', 'customer', 'pickup')], 'You collected your order')
  assert.equal(noticeLabelKey('PACKED', 'farmer', 'pickup'), 'ord.status.PACKED_PICKUP')
})

/* ------------------------------------------------------------------ */
/* One row per order                                                   */
/* ------------------------------------------------------------------ */

/**
 * An order walking its four states used to announce itself four times, the
 * rows identical apart from the verb and the same total printed on each. What
 * a buyer waiting at home wants is one answer to "where is my order", not its
 * history read back to them as four separate pieces of news.
 */
function order(events: Order['events'], status: Order['status'] = 'DELIVERED'): Order {
  return {
    id: 'F2C5013',
    status,
    total: 444,
    customerName: 'रेखा',
    items: [
      { productId: 'p1', name: 'आंब्याचे लोणचे', emoji: '🫙', qty: 1, price: 220 },
      { productId: 'p2', name: 'कांदा लसूण मसाला', emoji: '🌶️', qty: 2, price: 180 },
    ],
    events,
  } as Order
}

const WALK: Order['events'] = [
  { to: 'PLACED', at: '2026-09-09T10:00:00.000Z', by: 'customer' },
  { to: 'ACCEPTED', at: '2026-09-09T11:00:00.000Z', by: 'farmer' },
  { to: 'PACKED', at: '2026-09-09T12:00:00.000Z', by: 'farmer' },
  { to: 'OUT_FOR_DELIVERY', at: '2026-09-09T13:00:00.000Z', by: 'farmer' },
  { to: 'DELIVERED', at: '2026-09-09T14:00:00.000Z', by: 'farmer' },
]

test('four events on one order are one row, not four', () => {
  const feed = buildFeed([order(WALK)], 'customer')
  assert.equal(feed.length, 1)
  assert.equal(feed[0]?.id, 'F2C5013', 'the order IS the row, so it keys on the order')
})

test('the row shows where the order is NOW', () => {
  const [row] = buildFeed([order(WALK)], 'customer')
  assert.equal(row?.status, 'DELIVERED')
  assert.equal(row?.at, '2026-09-09T14:00:00.000Z', 'timed by the latest move, so it reads as new again')
})

/** Out-of-order events must not make an older timestamp win. */
test('the row is timed by the latest event however they are ordered', () => {
  const shuffled = [WALK[4]!, WALK[1]!, WALK[3]!, WALK[2]!]
  assert.equal(buildFeed([order(shuffled)], 'customer')[0]?.at, '2026-09-09T14:00:00.000Z')
})

/**
 * The farmer's tag is the ORDER's state, not their buyer's last move.
 *
 * A customer only ever causes PLACED and CANCELLED, so a tag drawn from the
 * other side's last event left every row on the farmer's list reading "new
 * order" for ever - including the ones they had packed and handed over themselves.
 */
test("the farmer's row shows where the order actually is", () => {
  const [row] = buildFeed([order(WALK, 'OUT_FOR_DELIVERY')], 'farmer')
  assert.equal(row?.status, 'OUT_FOR_DELIVERY')
  assert.notEqual(row?.status, 'PLACED', 'not frozen at what the buyer did')
})

test('the row is named after what is in the order, with the rest counted', () => {
  assert.equal(buildFeed([order(WALK)], 'customer')[0]?.title, 'आंब्याचे लोणचे +1')
})

/** Their own actions are not news to them - the farmer placed nothing. */
test('an order with nothing from the other side is not a row at all', () => {
  const mineOnly = [{ to: 'ACCEPTED' as const, at: '2026-09-09T11:00:00.000Z', by: 'farmer' as const }]
  assert.deepEqual(buildFeed([order(mineOnly)], 'farmer'), [])
})

/* ------------------------------------------------------------------ */
/* Admin decisions                                                     */
/* ------------------------------------------------------------------ */

/**
 * An admin decision is told, not left to be noticed. These lines come off their
 * own farmer record, written by the admin handler.
 */
function farmer(notices: AdminNotice[]): Farmer {
  return { id: 's1', notices } as Farmer
}

test('being verified is a sentence of its own', () => {
  const [row] = adminFeed(farmer([
    { id: 'a1', at: '2026-09-08T10:00:00.000Z', kind: 'VERIFIED' },
  ]))

  assert.equal(row?.labelKey, 'notif.verified')
  assert.equal(dictionaries.en[row!.labelKey], 'You are verified. Your produce is now on sale.')
})

/** No order behind it, so nothing may render an order id or a rupee amount. */
test('an admin line carries no order and no money', () => {
  const [row] = adminFeed(farmer([
    { id: 'a2', at: '2026-09-08T10:00:00.000Z', kind: 'UNBLOCKED' },
  ]))

  assert.equal(row?.orderId, undefined)
  assert.equal(row?.total, undefined)
})

test('a rejection carries its reason across', () => {
  const [row] = adminFeed(farmer([
    { id: 'a3', at: '2026-09-08T10:00:00.000Z', kind: 'PRODUCT_REJECTED', note: 'Photo unclear' },
  ]))

  assert.equal(row?.who, 'Photo unclear')
})

test('both halves of the list are one list, newest first', () => {
  const merged = mergeFeeds(
    [{ id: 'o1', at: '2026-09-01T00:00:00.000Z', labelKey: 'x', who: '' }],
    adminFeed(farmer([
      { id: 'a4', at: '2026-09-08T00:00:00.000Z', kind: 'VERIFIED' },
    ])),
  )

  assert.deepEqual(merged.map((n) => n.id), ['a4', 'o1'])
})

test('every admin line exists in both languages', () => {
  const kinds: AdminNotice['kind'][] = ['VERIFIED', 'BLOCKED', 'UNBLOCKED', 'PRODUCT_REJECTED']
  const missing = kinds
    .map((k) => adminFeed(farmer([{ id: k, at: '2026-09-08T00:00:00.000Z', kind: k }]))[0]!.labelKey)
    .filter((key) => !dictionaries.mr[key] || !dictionaries.en[key])

  assert.deepEqual(missing, [])
})

/* ------------------------------------------------------------------ */
/* A list that forgets                                                 */
/* ------------------------------------------------------------------ */

/**
 * THE FEED IS THE NEWS, NOT THE ARCHIVE.
 *
 * It kept every row for ever, so in the third week of September a farmer
 * opened it and read about the 8th: orders they had packed, delivered and been
 * paid for, pushing today's news off the screen. A list where nothing leaves
 * teaches you that nothing in it is urgent.
 */

const DAY = 86_400_000
const NOW = new Date('2026-09-19T12:00:00+05:30').getTime()
const ago = (days: number) => new Date(NOW - days * DAY).toISOString()
const row = (over: Partial<Notice> = {}): Notice =>
  ({ id: 'n1', at: ago(1), labelKey: 'x', who: '', ...over })

test('what they have read is kept a week, what they have not is kept a month', () => {
  // The farmer who was away at a wedding still finds what they missed; the
  // delivered order from a fortnight ago is not news and does not come back.
  const seen = ago(0)
  const feed = [
    row({ id: 'read-recent', at: ago(3) }),
    row({ id: 'read-old', at: ago(9) }),
    row({ id: 'unread-old', at: ago(9) }),
    row({ id: 'unread-ancient', at: ago(40) }),
  ]
  const kept = visibleFeed(feed, seen, NOW).map((n) => n.id)

  assert.deepEqual(kept.sort(), ['read-recent'], 'only the week they have read')

  const keptUnread = visibleFeed(feed, ago(60), NOW).map((n) => n.id).sort()
  assert.deepEqual(keptUnread, ['read-old', 'read-recent', 'unread-old'])
  assert.ok(!keptUnread.includes('unread-ancient'), 'a month is the ceiling even unread')
})

/**
 * "Your shop is paused" is not something that happened on a Tuesday. It is
 * what is true about their shop until they renew, so it outlives both windows.
 */
test('a standing row stays however old it is', () => {
  const paused = row({ id: 'sub-expired', at: ago(90), standing: true })
  assert.deepEqual(visibleFeed([paused], ago(0), NOW).map((n) => n.id), ['sub-expired'])
})

test('new and earlier are split on the mark from before they opened it', () => {
  const feed = [row({ id: 'after', at: ago(0) }), row({ id: 'before', at: ago(4) })]
  const { fresh, earlier } = splitFeed(feed, ago(2))
  assert.deepEqual(fresh.map((n) => n.id), ['after'])
  assert.deepEqual(earlier.map((n) => n.id), ['before'])
})

/**
 * "8/9/2026 11:01 pm" is a thing to decode. Past a week the count stops
 * helping in its turn - "23 days ago" is arithmetic again - so it prints the
 * date instead.
 */
test('the time is said the way they would say it', () => {
  assert.deepEqual(whenKey(ago(0), NOW), { key: 'when.today' })
  assert.deepEqual(whenKey(ago(1), NOW), { key: 'when.yesterday' })
  assert.deepEqual(whenKey(ago(3), NOW), { key: 'when.daysAgo', vars: { n: 3 } })
  assert.match(whenKey(ago(20), NOW).text ?? '', /2026/, 'a date once counting stops helping')
})

/** Yesterday is the day before today, not 24 hours ago. */
test('days are counted on the calendar, not on the clock', () => {
  const lateLastNight = new Date('2026-09-18T23:30:00+05:30').toISOString()
  const earlyToday = new Date('2026-09-19T00:30:00+05:30').getTime()
  assert.equal(daysAgo(lateLastNight, earlyToday), 1, 'an hour apart, but a day apart')
})
