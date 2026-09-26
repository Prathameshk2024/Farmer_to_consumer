import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { AdminNotice, Order } from '@shared/types.js'
import {
  ADMIN_NOTICE_PATH, PUSH_LINES, adminNoticePush, customerOrderPush, paymentClaimedPush,
  sellerOrderPush,
} from '@shared/pushText.js'
import { dictionaries } from '../src/i18n/strings.js'

/**
 * WHAT HER PHONE SAYS IS WHAT HER APP SAYS.
 *
 * The notification and the row in her updates list are two views of one
 * event. If they were written twice they would drift - one day the tray says
 * "order accepted" and the list says something else - so every title here is
 * held equal to the dictionary line the list already prints.
 */

const LANGS = ['mr', 'en'] as const

test('every notification title is the sentence the updates list prints', () => {
  for (const lang of LANGS) {
    for (const [key, value] of Object.entries(PUSH_LINES[lang])) {
      if (!key.startsWith('notif.')) continue
      assert.equal(value, dictionaries[lang][key], `${lang} ${key}`)
    }
  }
})

test('both languages carry exactly the same lines', () => {
  assert.deepEqual(Object.keys(PUSH_LINES.mr).sort(), Object.keys(PUSH_LINES.en).sort())
})

/**
 * `ADMIN_NOTICE_PATH` is a `Record<AdminNoticeKind, ...>`, so TypeScript
 * already refuses to compile it missing a kind - but nothing stopped a new
 * kind's push LINE from being forgotten, since `PUSH_LINES` is just a
 * `Record<string, string>`. Walking every key of the exhaustive record catches
 * that at test time instead of it falling back to the raw key on a phone.
 */
test('every AdminNoticeKind has a push line in both languages', () => {
  for (const kind of Object.keys(ADMIN_NOTICE_PATH)) {
    assert.ok(`notif.adm.${kind}` in PUSH_LINES.mr, `mr missing notif.adm.${kind}`)
    assert.ok(`notif.adm.${kind}` in PUSH_LINES.en, `en missing notif.adm.${kind}`)
  }
})

/**
 * "The buyer says she paid" has no row of its own in the updates list, so it
 * has no dictionary twin. It is lifted word for word from copy the app already
 * shows the seller, which is what keeps it inside the Marathi style guide.
 */
test('the "buyer says I paid" line is lifted from reviewed app copy', () => {
  assert.ok(dictionaries.mr['cancel.sel.q3Paid'].includes(PUSH_LINES.mr['push.paid.title']))
  assert.ok(dictionaries.mr['refund.claimedBody'].includes(PUSH_LINES.mr['push.paid.body']))
  assert.ok(dictionaries.en['cancel.sel.q3Paid'].includes(PUSH_LINES.en['push.paid.title']))
  assert.ok(dictionaries.en['refund.claimedBody'].includes(PUSH_LINES.en['push.paid.body'].replace(/\.$/, '')))
})

test('the English lines are English', () => {
  for (const [key, value] of Object.entries(PUSH_LINES.en)) {
    assert.ok(!/[ऀ-ॿ]/.test(value), `en ${key} has Devanagari`)
  }
})

function order(): Order {
  return {
    id: 'SMB5013',
    status: 'PLACED',
    total: 444,
    customerName: 'रेखा',
    items: [
      { productId: 'p1', name: 'आंब्याचे लोणचे', emoji: '', qty: 1, price: 220 },
      { productId: 'p2', name: 'कांदा लसूण मसाला', emoji: '', qty: 2, price: 112 },
    ],
    events: [],
  } as unknown as Order
}

test('a new order names what is in it, the money and the buyer, and opens the order', () => {
  assert.deepEqual(sellerOrderPush(order(), 'PLACED', 'mr'), {
    title: 'नवीन ऑर्डर आले आहे',
    body: 'आंब्याचे लोणचे +1 · ₹444 · रेखा',
    path: '/seller/orders/SMB5013',
  })
})

test('the buyer is told in her own language, and a tap opens her order', () => {
  const p = customerOrderPush(order(), 'ACCEPTED', 'en')
  assert.equal(p?.title, 'Your order has been accepted')
  assert.equal(p?.path, '/shop/orders/SMB5013')
})

/** PLACED has no row in the buyer's updates list, so it has no notification either. */
test('a state with no updates-list line sends nothing', () => {
  assert.equal(customerOrderPush(order(), 'PLACED', 'mr'), null)
})

test('"I paid" puts the amount in the title and the order id in the body', () => {
  const p = paymentClaimedPush(order(), 'mr')
  assert.ok(p.title.includes('₹444'))
  assert.ok(p.body.endsWith('SMB5013'))
  assert.equal(p.path, '/seller/orders/SMB5013')
})

test('an admin decision opens the page its updates row opens', () => {
  const approved: AdminNotice = { id: 'a1', at: '2026-09-21T10:00:00Z', kind: 'PAYMENT_APPROVED', n: 5 }
  assert.equal(adminNoticePush(approved, 'mr').title, 'तुमचा ₹50 चा भरणा मंजूर झाला — 5 जागा मिळाल्या')
  assert.equal(adminNoticePush(approved, 'mr').path, ADMIN_NOTICE_PATH.PAYMENT_APPROVED)
  const blocked: AdminNotice = { id: 'a2', at: '2026-09-21T10:00:00Z', kind: 'BLOCKED', note: 'फोटो चुकीचा' }
  assert.equal(adminNoticePush(blocked, 'mr').path, '/seller')
  assert.equal(adminNoticePush(blocked, 'mr').body, 'फोटो चुकीचा')
})

test('a renewal says the new end date in the title', () => {
  const renewed: AdminNotice = { id: 'a3', at: '2026-09-21T10:00:00Z', kind: 'SUBSCRIPTION_RENEWED', note: '2027-03-21T00:00:00.000Z' }
  assert.ok(adminNoticePush(renewed, 'en').title.includes('2027'))
})
