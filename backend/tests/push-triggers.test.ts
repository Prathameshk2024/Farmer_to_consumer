import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import type { Order } from '@shared/types.js'

process.env.SESSION_SECRET = 'test-secret-for-unit-tests'

const { emptyDb } = await import('../src/db/seed.js')
const { createSession } = await import('../src/auth/sessions.js')
const { registerPushToken } = await import('../src/push/register.js')
const { setPushTransport } = await import('../src/push/send.js')
const notify = await import('../src/push/notify.js')

/**
 * EVERY EVENT TELLS THE OTHER SIDE, AND ONLY THE OTHER SIDE.
 *
 * A seller does not need a notification that she accepted an order two
 * seconds ago; the buyer does. Each trigger below is one row of the table in
 * the spec: who caused it, who hears about it, in which language, and where a
 * tap takes them.
 */

afterEach(() => setPushTransport(null))

const SELLER_T = 'fcm-seller-aaaaaaaaaaaaaaaaaaaaaa'
const BUYER_T = 'fcm-buyer-bbbbbbbbbbbbbbbbbbbbbbbb'
const none = () => {}

function world() {
  const db = emptyDb()
  const s = createSession(db, { role: 'seller', userId: 's1', sellerId: 's1' })
  const c = createSession(db, { role: 'customer', userId: 'c1', customerId: 'c1' })
  registerPushToken(db, s.id, { token: SELLER_T, lang: 'mr' })
  registerPushToken(db, c.id, { token: BUYER_T, lang: 'en' })
  const sent: { token: string; title: string; path: string }[] = []
  setPushTransport(async (msgs) => {
    sent.push(...msgs)
    return msgs.map((m) => ({ token: m.token, ok: true, dead: false }))
  })
  const order = {
    id: 'SMB7', sellerId: 's1', customerId: 'c1', customerName: 'Rekha', total: 220,
    items: [{ productId: 'p1', name: 'आंब्याचे लोणचे', emoji: '', qty: 1, price: 220 }],
    status: 'PLACED', events: [],
  } as unknown as Order
  return { db, sent, order }
}

test('a new order buzzes the seller, in Marathi, and opens her order', async () => {
  const { db, sent, order } = world()
  await notify.notifyOrderPlaced(db, order, none)
  assert.deepEqual(sent.map((m) => [m.token, m.title, m.path]), [[SELLER_T, 'नवीन ऑर्डर आले आहे', '/seller/orders/SMB7']])
})

test('the seller accepting buzzes the buyer, in English, and opens her order', async () => {
  const { db, sent, order } = world()
  await notify.notifyOrderAdvanced(db, order, 'ACCEPTED', none)
  assert.deepEqual(sent.map((m) => [m.token, m.title, m.path]), [[BUYER_T, 'Your order has been accepted', '/shop/orders/SMB7']])
})

test('a status the buyer has no line for sends nothing', async () => {
  const { db, sent, order } = world()
  await notify.notifyOrderAdvanced(db, order, 'PLACED', none)
  assert.deepEqual(sent, [])
})

test('the buyer cancelling tells the seller; the seller cancelling tells the buyer', async () => {
  const a = world()
  await notify.notifyOrderCancelled(a.db, a.order, 'customer', none)
  assert.deepEqual(a.sent.map((m) => [m.token, m.title]), [[SELLER_T, 'ग्राहकाने ऑर्डर रद्द केले']])
  setPushTransport(null)
  const b = world()
  await notify.notifyOrderCancelled(b.db, b.order, 'seller', none)
  assert.deepEqual(b.sent.map((m) => [m.token, m.title]), [[BUYER_T, 'Your order was cancelled']])
})

test('"I paid" buzzes the seller with the amount', async () => {
  const { db, sent, order } = world()
  await notify.notifyPaymentClaimed(db, order, none)
  assert.equal(sent.length, 1)
  assert.equal(sent[0]!.token, SELLER_T)
  assert.ok(sent[0]!.title.includes('₹220'))
})

test('an admin decision buzzes only that seller', async () => {
  const { db, sent } = world()
  await notify.notifyAdminNotice(db, 's1', { id: 'n1', at: '2026-09-21T10:00:00Z', kind: 'PAYMENT_APPROVED', n: 5 }, none)
  await notify.notifyAdminNotice(db, 's2', { id: 'n2', at: '2026-09-21T10:00:00Z', kind: 'PAYMENT_APPROVED', n: 5 }, none)
  assert.deepEqual(sent.map((m) => [m.token, m.path]), [[SELLER_T, '/seller/products']])
})

/**
 * A throw here must resolve to 0, never reject. Every route calls these with
 * `void`, so a rejection nobody awaits is an unhandled rejection, and the
 * admin-notice listener in index.ts runs the same call inside a bare
 * `setImmediate`, where an uncaught throw would take the single Cloud Run
 * process down mid-response. An order whose `items` getter throws stands in
 * for any builder that reads a field that turns out not to be there.
 */
test('a builder that throws while building the message resolves to 0, not a rejection', async () => {
  const { db } = world()
  const cursed = {
    id: 'SMB9', sellerId: 's1', customerId: 'c1', customerName: 'Rekha', total: 100,
    status: 'ACCEPTED', events: [],
    get items(): never { throw new Error('boom') },
  } as unknown as Order
  await assert.doesNotReject(async () => {
    assert.equal(await notify.notifyOrderAdvanced(db, cursed, 'ACCEPTED', none), 0)
  })
})
