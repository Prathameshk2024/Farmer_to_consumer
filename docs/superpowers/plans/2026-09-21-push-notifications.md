# Push Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A seller or buyer using the Android APK gets a phone notification (tray, sound, even with the app closed) for every order step and admin decision, and a tap opens that order.

**Architecture:** The APK wrapper gets an FCM device token and hands it to the web page. The page registers it against the signed-in session (`POST /api/push/token`). The API stores it on the session row and sends through `firebase-admin/messaging` at five existing event points. Message text lives in `shared/src/pushText.ts`, held equal to the in-app updates wording by a test.

**Tech Stack:** Express + `firebase-admin` 13 (`sendEach`), React/Vite frontend, `node:test` via tsx, Expo SDK 54 + `expo-notifications` + `react-native-webview` (wrapper, outside this repo).

**Spec:** `docs/superpowers/specs/2026-09-21-push-notifications-design.md`. Read it first; this plan argues from it.

## Global Constraints

- Cross-workspace imports are `@shared/<file>.js` (a `.js` extension on a `.ts` file); local imports in `frontend/` also end in `.js`.
- No new Firestore collection. Tokens live on `SessionRecord` (`pushToken?`, `pushLang?`).
- Sending never throws into a route, and never delays or changes a route's response.
- One phone, one person: registering a token removes it from every other session.
- Notification language = the app's `wb.lang` (`'mr' | 'en'`, default `'mr'`), never the phone's.
- Every notification title is the existing `notif.*` dictionary sentence; the only new line ("buyer says I paid") is lifted from `cancel.sel.q3Paid` / `refund.claimedBody`.
- Errors are `{ error, messageMr }`. No emoji. Marathi follows `docs/MARATHI-STYLE.md` (`ॲ` is U+0972).
- Tests are `node:test` + `node:assert/strict`, written as prose explaining *why*. Backend tests set `process.env.SESSION_SECRET` before a dynamic import, as `tests/session-registry.test.ts` does.
- **Tests must never call the real `save()`** (with no Firestore it writes `backend/data/db.json`). Push code takes a `persist` parameter; tests pass a no-op.
- **Commits:** the user commits only when they say so. Each task ends with a checkpoint listing the files; run `git commit` only after the user approves.
- CLAUDE.md changes land in the same change as the code (Task 7).

## File Structure

| File | Responsibility |
|---|---|
| `shared/src/pushText.ts` (new) | Title, body and tap path for every notification, in both languages; `orderItemSummary`, `shortDate` and `ADMIN_NOTICE_PATH` (moved here from the frontend so both sides use one copy). |
| `frontend/src/lib/notifications.ts` (modify) | Imports the three moved helpers instead of defining them. |
| `backend/src/auth/types.ts` (modify) | `SessionRecord.pushToken?`, `pushLang?`. |
| `backend/src/push/register.ts` (new) | Validate and store a token on a session; take it off every other session. |
| `backend/src/push/targets.ts` (new) | The live sessions (with tokens) of one seller or one buyer. |
| `backend/src/push/send.ts` (new) | Pluggable transport, the FCM transport, and `sendPush` (dead-token cleanup, never throws). |
| `backend/src/push/notify.ts` (new) | One function per trigger: who to tell and what to say. |
| `backend/src/routes/push.routes.ts` (new) | `POST /api/push/token`. |
| `backend/src/db/notices.ts` (modify) | `onNotice()` listener called by `appendNotice()`. |
| `backend/src/routes/orders.routes.ts` (modify) | Four `void notify…()` calls. |
| `backend/src/auth/rateLimit.ts`, `config.ts`, `index.ts` (modify) | Limits, the `Push` banner line, wiring. |
| `frontend/src/lib/pushBridge.ts` (new) | Pure: when to ask the wrapper, and what to do with a token. |
| `frontend/src/components/PushBridge.tsx` (new) | Thin React mount of the bridge. |
| `frontend/src/lib/api.ts`, `App.tsx` (modify) | `api.registerPush`, mount `<PushBridge />`. |
| `frontend/src/i18n/strings.ts`, `screens/seller/Misc.tsx` (modify) | The battery-settings help card. |
| `appgold-main/…` (outside the repo) | `expo-notifications`, `google-services.json`, token hand-off, tap handling. |

---

### Task 1: Shared notification text

**Files:**
- Create: `shared/src/pushText.ts`
- Modify: `frontend/src/lib/notifications.ts` (delete the local `itemSummary`, `shortDate`, `ADMIN_ROW`; import them)
- Test: `frontend/tests/pushText.test.ts`

**Interfaces:**
- Consumes: `Order`, `OrderStatus`, `AdminNotice`, `AdminNoticeKind` from `shared/src/types.ts`.
- Produces:
  - `type PushLang = 'mr' | 'en'`
  - `interface PushText { title: string; body: string; path: string }`
  - `const PUSH_LINES: Record<PushLang, Record<string, string>>`
  - `const ADMIN_NOTICE_PATH: Record<AdminNoticeKind, string | undefined>`
  - `function orderItemSummary(o: Pick<Order, 'id' | 'items'>): string`
  - `function shortDate(iso: string | undefined): string`
  - `function sellerOrderPush(order: Order, event: 'PLACED' | 'CANCELLED', lang: PushLang): PushText`
  - `function customerOrderPush(order: Order, to: OrderStatus, lang: PushLang): PushText | null`
  - `function paymentClaimedPush(order: Order, lang: PushLang): PushText`
  - `function adminNoticePush(notice: AdminNotice, lang: PushLang): PushText`

- [ ] **Step 1: Write the failing test** — `frontend/tests/pushText.test.ts`

```ts
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
    assert.ok(!/[\u0900-\u097F]/.test(value), `en ${key} has Devanagari`)
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

/** COMPLETED has no row in the updates list, so it has no notification either. */
test('a state with no updates-list line sends nothing', () => {
  assert.equal(customerOrderPush(order(), 'COMPLETED', 'mr'), null)
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
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd frontend && node --import tsx --test tests/pushText.test.ts`
Expected: FAIL, `Cannot find module '@shared/pushText.js'`.

- [ ] **Step 3: Write `shared/src/pushText.ts`**

Copy each `notif.*` value **character for character** from `frontend/src/i18n/strings.ts` (Marathi block around lines 73–98, English around 774–798). The test in Step 1 fails on any difference.

```ts
import type { AdminNotice, AdminNoticeKind, Order, OrderStatus } from './types.js'

/**
 * WHAT HER PHONE SAYS WHEN THE APP IS CLOSED.
 *
 * The same sentences her updates list prints (frontend/src/lib/notifications.ts),
 * because a notification and a row are two views of one event. They are copied
 * here rather than imported because the API cannot import the frontend's
 * dictionary; frontend/tests/pushText.test.ts holds every `notif.*` line equal
 * to its dictionary twin, so the two cannot drift.
 */
export type PushLang = 'mr' | 'en'

export interface PushText {
  title: string
  body: string
  /** Where a tap opens the app. Always a path on our own site, never a URL. */
  path: string
}

export const PUSH_LINES: Record<PushLang, Record<string, string>> = {
  mr: {
    'notif.sel.PLACED': 'नवीन ऑर्डर आले आहे',
    'notif.sel.CANCELLED': 'ग्राहकाने ऑर्डर रद्द केले',
    'notif.cus.ACCEPTED': 'तुमचे ऑर्डर स्वीकारले आहे',
    'notif.cus.PACKED': 'तुमचे ऑर्डर तयार झाले आहे',
    'notif.cus.OUT_FOR_DELIVERY': 'तुमचे ऑर्डर पोहोचवायला निघाले आहे',
    'notif.cus.DELIVERED': 'तुमचे ऑर्डर पोहोचले',
    'notif.cus.REJECTED': 'विक्रेतीला हे ऑर्डर घेता आले नाही',
    'notif.cus.CANCELLED': 'तुमचे ऑर्डर रद्द झाले',
    'notif.adm.SLOTS_GRANTED': 'तुम्हाला {n} नवीन जागा मिळाल्या आहेत',
    'notif.adm.SLOTS_REVOKED': 'तुमच्या {n} जागा काढून घेतल्या आहेत',
    'notif.adm.PAYMENT_APPROVED': 'तुमचा ₹50 चा भरणा मंजूर झाला — {n} जागा मिळाल्या',
    'notif.adm.PAYMENT_REJECTED': 'तुमचा भरणा तपासणीत जुळला नाही',
    'notif.adm.BLOCKED': 'तुमचे दुकान सध्या बंद केले आहे',
    'notif.adm.UNBLOCKED': 'तुमचे दुकान पुन्हा सुरू झाले आहे',
    'notif.adm.PRODUCT_APPROVED': 'तुमचे उत्पादन मंजूर झाले आणि आता दिसत आहे',
    'notif.adm.PRODUCT_REJECTED': 'तुमचे उत्पादन मंजूर झाले नाही — {n} तासांनी ते काढून टाकले जाईल',
    'notif.adm.SUBSCRIPTION_RENEWED': 'नूतनीकरण मंजूर झाले — तुमचे दुकान {date} पर्यंत सुरू राहील',
    // Lifted from 'cancel.sel.q3Paid' and 'refund.claimedBody' - see the test.
    'push.paid.title': 'ग्राहकाने या ऑर्डरसाठी ₹{total} भरल्याचे कळवले आहे',
    'push.paid.body': 'हे पैसे तुमच्या खात्यात आले आहेत का, ते तुमच्या UPI ॲपमध्ये पहा.',
  },
  en: {
    'notif.sel.PLACED': 'You have a new order',
    'notif.sel.CANCELLED': 'The customer cancelled the order',
    'notif.cus.ACCEPTED': 'Your order has been accepted',
    'notif.cus.PACKED': 'Your order is packed and ready',
    'notif.cus.OUT_FOR_DELIVERY': 'Your order is on the way',
    'notif.cus.DELIVERED': 'Your order has been delivered',
    'notif.cus.REJECTED': 'The seller could not take this order',
    'notif.cus.CANCELLED': 'Your order was cancelled',
    'notif.adm.SLOTS_GRANTED': 'You have been given {n} more product slots',
    'notif.adm.SLOTS_REVOKED': '{n} product slots were taken back',
    'notif.adm.PAYMENT_APPROVED': 'Your ₹50 payment was approved - {n} slots added',
    'notif.adm.PAYMENT_REJECTED': 'Your payment could not be matched',
    'notif.adm.BLOCKED': 'Your shop has been closed for now',
    'notif.adm.UNBLOCKED': 'Your shop is open again',
    'notif.adm.PRODUCT_APPROVED': 'Your product was approved and is live',
    'notif.adm.PRODUCT_REJECTED': 'Your product was not approved - it will be removed in {n} hours',
    'notif.adm.SUBSCRIPTION_RENEWED': 'Renewal approved - your shop is open until {date}',
    'push.paid.title': 'The customer says they have paid ₹{total} for this order',
    'push.paid.body': 'Check your UPI app to see whether it arrived.',
  },
}

/** Where tapping an admin decision goes - the same page its updates row opens. */
export const ADMIN_NOTICE_PATH: Record<AdminNoticeKind, string | undefined> = {
  SLOTS_GRANTED: '/seller/products',
  SLOTS_REVOKED: '/seller/subscription',
  PAYMENT_APPROVED: '/seller/products',
  PAYMENT_REJECTED: '/seller/subscription',
  BLOCKED: undefined,
  UNBLOCKED: undefined,
  PRODUCT_APPROVED: '/seller/products',
  PRODUCT_REJECTED: '/seller/products',
  SUBSCRIPTION_RENEWED: '/seller',
}

/** What the order is, in the words on the listing. "+2" counts the rest. */
export function orderItemSummary(o: Pick<Order, 'id' | 'items'>): string {
  const [first, ...rest] = o.items ?? []
  if (!first) return o.id
  return rest.length ? `${first.name} +${rest.length}` : first.name
}

/** "15 Mar 2027" - Latin digits, the way every other date in the app is printed. */
export function shortDate(iso: string | undefined): string {
  const d = new Date(iso ?? '')
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })
}

function line(lang: PushLang, key: string, vars: Record<string, string | number> = {}): string {
  const raw = PUSH_LINES[lang][key] ?? PUSH_LINES.mr[key] ?? key
  return raw.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole))
}

/** The only states the buyer hears about: the ones her updates list has a line for. */
const CUSTOMER_LINE: Partial<Record<OrderStatus, string>> = {
  ACCEPTED: 'notif.cus.ACCEPTED',
  PACKED: 'notif.cus.PACKED',
  OUT_FOR_DELIVERY: 'notif.cus.OUT_FOR_DELIVERY',
  DELIVERED: 'notif.cus.DELIVERED',
  REJECTED: 'notif.cus.REJECTED',
  CANCELLED: 'notif.cus.CANCELLED',
}

export function sellerOrderPush(order: Order, event: 'PLACED' | 'CANCELLED', lang: PushLang): PushText {
  const items = orderItemSummary(order)
  return {
    title: line(lang, `notif.sel.${event}`),
    body: event === 'PLACED'
      ? [items, `₹${order.total}`, order.customerName].filter(Boolean).join(' · ')
      : `${items} · ${order.id}`,
    path: `/seller/orders/${order.id}`,
  }
}

export function customerOrderPush(order: Order, to: OrderStatus, lang: PushLang): PushText | null {
  const key = CUSTOMER_LINE[to]
  if (!key) return null
  return {
    title: line(lang, key),
    body: `${orderItemSummary(order)} · ₹${order.total}`,
    path: `/shop/orders/${order.id}`,
  }
}

export function paymentClaimedPush(order: Order, lang: PushLang): PushText {
  return {
    title: line(lang, 'push.paid.title', { total: order.total }),
    body: `${line(lang, 'push.paid.body')} · ${order.id}`,
    path: `/seller/orders/${order.id}`,
  }
}

export function adminNoticePush(notice: AdminNotice, lang: PushLang): PushText {
  const path = ADMIN_NOTICE_PATH[notice.kind] ?? '/seller'
  // A renewal's note is the new end date, which belongs IN the sentence.
  if (notice.kind === 'SUBSCRIPTION_RENEWED') {
    return { title: line(lang, 'notif.adm.SUBSCRIPTION_RENEWED', { date: shortDate(notice.note) }), body: '', path }
  }
  return {
    title: line(lang, `notif.adm.${notice.kind}`, notice.n == null ? {} : { n: notice.n }),
    body: notice.note ?? '',
    path,
  }
}
```

- [ ] **Step 4: Point the frontend at the moved helpers**

In `frontend/src/lib/notifications.ts`:
1. Add `import { ADMIN_NOTICE_PATH, orderItemSummary, shortDate } from '@shared/pushText.js'` and `export { shortDate }`. `Subscription.tsx` and `SubscriptionNotice.tsx` import `shortDate` from here.
2. Delete the local `function itemSummary`, and replace its one call with `orderItemSummary(o)`.
3. Delete the local `export function shortDate` (and its doc comment).
4. Delete `const ADMIN_ROW` and replace `ADMIN_ROW[n.kind].to` / `ADMIN_ROW[n.kind]?.to` with `ADMIN_NOTICE_PATH[n.kind]`. Keep ADMIN_ROW's doc comment, moved above the import line and reworded to say the table now lives in `shared/src/pushText.ts`.

- [ ] **Step 5: Run the new test and the existing ones**

Run: `cd frontend && node --import tsx --test tests/pushText.test.ts tests/notifications.test.ts tests/i18n.test.ts tests/marathi.test.ts`
Expected: all PASS. Then `npm run typecheck` from the repo root: no errors.

- [ ] **Step 6: Checkpoint** — files: `shared/src/pushText.ts`, `frontend/src/lib/notifications.ts`, `frontend/tests/pushText.test.ts`. Commit only after the user approves: `git commit -m "feat(push): shared notification text held equal to the updates list"`.

---

### Task 2: Token on the session, and who to notify

**Files:**
- Modify: `backend/src/auth/types.ts` (`SessionRecord`)
- Create: `backend/src/push/register.ts`, `backend/src/push/targets.ts`
- Test: `backend/tests/push-token.test.ts`, `backend/tests/push-targets.test.ts`

**Interfaces:**
- Consumes: `Db` (`backend/src/db/seed.ts`), `findLiveSession(db, id, now)` (`auth/sessions.ts`), `PushLang` (Task 1).
- Produces:
  - `SessionRecord.pushToken?: string`, `SessionRecord.pushLang?: 'mr' | 'en'`
  - `registerPushToken(db: Db, sessionId: string, body: unknown): RegisterResult`, where `RegisterResult = { ok: true; changed: boolean } | { ok: false; status: 400 | 404; error: string; messageMr: string }`
  - `interface PushTarget { sessionId: string; token: string; lang: PushLang }`
  - `type Recipient = { sellerId: string } | { customerId: string }`
  - `pushTargets(db: Db, to: Recipient, now?: number): PushTarget[]`

- [ ] **Step 1: Write the failing tests**

`backend/tests/push-token.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.SESSION_SECRET = 'test-secret-for-unit-tests'

const { emptyDb } = await import('../src/db/seed.js')
const { createSession } = await import('../src/auth/sessions.js')
const { registerPushToken } = await import('../src/push/register.js')

/**
 * ONE PHONE, ONE PERSON.
 *
 * A notification token belongs to a phone, and on these phones a mother hands
 * the handset to her daughter, and a field coordinator registers seller after
 * seller on one device. The token is therefore kept on the SESSION, and the
 * newest session to register a token takes it from every other one - so the
 * phone only ever buzzes for whoever is signed in on it now.
 */

const TOKEN = 'fcm-token-aaaaaaaaaaaaaaaaaaaaaaaa'

test('a token is kept on the session that registered it, with her language', () => {
  const db = emptyDb()
  const s = createSession(db, { role: 'seller', userId: 's1', sellerId: 's1' })
  const r = registerPushToken(db, s.id, { token: TOKEN, lang: 'en' })
  assert.deepEqual(r, { ok: true, changed: true })
  assert.equal(s.pushToken, TOKEN)
  assert.equal(s.pushLang, 'en')
})

test('the language defaults to Marathi, like the app', () => {
  const db = emptyDb()
  const s = createSession(db, { role: 'customer', userId: 'c1', customerId: 'c1' })
  registerPushToken(db, s.id, { token: TOKEN })
  assert.equal(s.pushLang, 'mr')
})

test('the daughter signing in takes the phone from her mother', () => {
  const db = emptyDb()
  const mother = createSession(db, { role: 'seller', userId: 's1', sellerId: 's1' })
  const daughter = createSession(db, { role: 'customer', userId: 'c9', customerId: 'c9' })
  registerPushToken(db, mother.id, { token: TOKEN })
  registerPushToken(db, daughter.id, { token: TOKEN })
  assert.equal(mother.pushToken, undefined)
  assert.equal(daughter.pushToken, TOKEN)
})

test('registering the same thing again is not a change worth a write', () => {
  const db = emptyDb()
  const s = createSession(db, { role: 'seller', userId: 's1', sellerId: 's1' })
  registerPushToken(db, s.id, { token: TOKEN, lang: 'mr' })
  assert.deepEqual(registerPushToken(db, s.id, { token: TOKEN, lang: 'mr' }), { ok: true, changed: false })
})

test('junk is refused with a Marathi message', () => {
  const db = emptyDb()
  const s = createSession(db, { role: 'seller', userId: 's1', sellerId: 's1' })
  for (const body of [{}, { token: 42 }, { token: 'short' }, { token: 'has a space in it aaaaaaaaaa' }, { token: TOKEN, lang: 'hi' }]) {
    const r = registerPushToken(db, s.id, body)
    assert.equal(r.ok, false, JSON.stringify(body))
    if (!r.ok) {
      assert.equal(r.status, 400)
      assert.ok(r.messageMr.length > 0)
    }
  }
  assert.equal(s.pushToken, undefined)
})
```

`backend/tests/push-targets.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.SESSION_SECRET = 'test-secret-for-unit-tests'

const { emptyDb } = await import('../src/db/seed.js')
const { createSession, revokeSession } = await import('../src/auth/sessions.js')
const { registerPushToken } = await import('../src/push/register.js')
const { pushTargets } = await import('../src/push/targets.js')

/**
 * WHO HEARS ABOUT IT.
 *
 * Only the phones where that seller (or that buyer) is signed in right now.
 * A session she logged out of, or one that expired, is not her any more, even
 * though its row is still in the table until pruning clears it.
 */

const T1 = 'fcm-token-1111111111111111111111'
const T2 = 'fcm-token-2222222222222222222222'

test("a seller's live sessions with a token are her targets, in their language", () => {
  const db = emptyDb()
  const a = createSession(db, { role: 'seller', userId: 's1', sellerId: 's1' })
  const b = createSession(db, { role: 'seller', userId: 's1', sellerId: 's1' })
  createSession(db, { role: 'seller', userId: 's2', sellerId: 's2' })
  registerPushToken(db, a.id, { token: T1, lang: 'mr' })
  registerPushToken(db, b.id, { token: T2, lang: 'en' })
  const got = pushTargets(db, { sellerId: 's1' }).sort((x, y) => x.token.localeCompare(y.token))
  assert.deepEqual(got.map((t) => [t.token, t.lang]), [[T1, 'mr'], [T2, 'en']])
})

test('a buyer is never sent a seller notification, or the reverse', () => {
  const db = emptyDb()
  const c = createSession(db, { role: 'customer', userId: 'c1', customerId: 'c1' })
  registerPushToken(db, c.id, { token: T1 })
  assert.deepEqual(pushTargets(db, { sellerId: 'c1' }), [])
  assert.equal(pushTargets(db, { customerId: 'c1' }).length, 1)
})

test('a logged-out session hears nothing', () => {
  const db = emptyDb()
  const s = createSession(db, { role: 'seller', userId: 's1', sellerId: 's1' })
  registerPushToken(db, s.id, { token: T1 })
  revokeSession(db, s.id, 'logout')
  assert.deepEqual(pushTargets(db, { sellerId: 's1' }), [])
})

test('an expired session hears nothing', () => {
  const db = emptyDb()
  const s = createSession(db, { role: 'seller', userId: 's1', sellerId: 's1' })
  registerPushToken(db, s.id, { token: T1 })
  const aYearOn = Date.now() + 365 * 24 * 3_600_000
  assert.deepEqual(pushTargets(db, { sellerId: 's1' }, aYearOn), [])
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd backend && node --import tsx --test tests/push-token.test.ts tests/push-targets.test.ts`
Expected: FAIL, `Cannot find module '../src/push/register.js'`.

- [ ] **Step 3: Add the session fields** — in `backend/src/auth/types.ts`, inside `interface SessionRecord`, after `client?: string`:

```ts
  /**
   * The phone's FCM token, set by POST /api/push/token. It lives on the
   * session, not on the person, so logging out stops the notifications, and
   * the next woman to sign in on the same phone takes it over (push/register.ts).
   */
  pushToken?: string
  /** The language she reads notifications in: the app's choice, not the phone's. */
  pushLang?: 'mr' | 'en'
```

- [ ] **Step 4: Write `backend/src/push/register.ts`**

```ts
import type { PushLang } from '@shared/pushText.js'
import type { Db } from '../db/seed.js'

/** An FCM token is one unbroken string; anything else did not come from the wrapper. */
const TOKEN_RE = /^\S{20,4096}$/

export type RegisterResult =
  | { ok: true; changed: boolean }
  | { ok: false; status: 400 | 404; error: string; messageMr: string }

/**
 * Keep a phone's token on the session that sent it - and take it off every
 * other session. One phone buzzes for one person: whoever signed in on it last.
 */
export function registerPushToken(db: Db, sessionId: string, body: unknown): RegisterResult {
  const b = (body ?? {}) as { token?: unknown; lang?: unknown }
  if (typeof b.token !== 'string' || !TOKEN_RE.test(b.token)) {
    return { ok: false, status: 400, error: 'Invalid push token', messageMr: 'सूचना चालू करता आल्या नाहीत. ॲप बंद करून पुन्हा उघडा.' }
  }
  if (b.lang !== undefined && b.lang !== 'mr' && b.lang !== 'en') {
    return { ok: false, status: 400, error: 'Invalid lang', messageMr: 'सूचना चालू करता आल्या नाहीत. ॲप बंद करून पुन्हा उघडा.' }
  }
  const lang: PushLang = b.lang === 'en' ? 'en' : 'mr'

  const session = db.sessions.find((s) => s.id === sessionId)
  if (!session) return { ok: false, status: 404, error: 'Session not found', messageMr: 'पुन्हा लॉगिन करा.' }

  let changed = false
  for (const s of db.sessions) {
    if (s.id !== sessionId && s.pushToken === b.token) {
      delete s.pushToken
      delete s.pushLang
      changed = true
    }
  }
  if (session.pushToken !== b.token || session.pushLang !== lang) {
    session.pushToken = b.token
    session.pushLang = lang
    changed = true
  }
  return { ok: true, changed }
}
```

- [ ] **Step 5: Write `backend/src/push/targets.ts`**

```ts
import type { PushLang } from '@shared/pushText.js'
import { findLiveSession } from '../auth/sessions.js'
import type { SessionRecord } from '../auth/types.js'
import type { Db } from '../db/seed.js'

export interface PushTarget {
  sessionId: string
  token: string
  lang: PushLang
}

export type Recipient = { sellerId: string } | { customerId: string }

/**
 * The phones to buzz for one seller or one buyer: live sessions of the right
 * role that carry a token. One entry per token, the newest session winning.
 */
export function pushTargets(db: Db, to: Recipient, now = Date.now()): PushTarget[] {
  const byToken = new Map<string, SessionRecord>()
  for (const s of db.sessions) {
    if (!s.pushToken) continue
    const mine = 'sellerId' in to
      ? s.role === 'seller' && s.sellerId === to.sellerId
      : s.role === 'customer' && s.customerId === to.customerId
    if (!mine || !findLiveSession(db, s.id, now)) continue
    const seen = byToken.get(s.pushToken)
    if (!seen || s.lastSeenAt > seen.lastSeenAt) byToken.set(s.pushToken, s)
  }
  return [...byToken.values()].map((s) => ({ sessionId: s.id, token: s.pushToken!, lang: s.pushLang ?? 'mr' }))
}
```

- [ ] **Step 6: Run the tests and watch them pass**

Run: `cd backend && node --import tsx --test tests/push-token.test.ts tests/push-targets.test.ts`
Expected: 9 PASS. Then `npm run typecheck` from the root: no errors.

- [ ] **Step 7: Checkpoint** — files: `backend/src/auth/types.ts`, `backend/src/push/register.ts`, `backend/src/push/targets.ts`, both tests. Commit after user approval: `git commit -m "feat(push): token on the session, one phone for one person"`.

---

### Task 3: Sending, and forgetting dead phones

**Files:**
- Create: `backend/src/push/send.ts`
- Test: `backend/tests/push-send.test.ts`

**Interfaces:**
- Consumes: `PushTarget` (Task 2), `PushLang`, `PushText` (Task 1).
- Produces:
  - `interface PushMessage { token: string; title: string; body: string; path: string }`
  - `interface SendOutcome { token: string; ok: boolean; dead: boolean }`
  - `type PushTransport = (messages: PushMessage[]) => Promise<SendOutcome[]>`
  - `setPushTransport(t: PushTransport | null): void`
  - `pushEnabled(): boolean`
  - `fcmTransport(): PushTransport`
  - `sendPush(db: Db, targets: PushTarget[], build: (lang: PushLang) => PushText | null, persist: () => void): Promise<number>` (resolves to how many were accepted; never rejects)

- [ ] **Step 1: Write the failing test** — `backend/tests/push-send.test.ts`

```ts
import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'

process.env.SESSION_SECRET = 'test-secret-for-unit-tests'

const { emptyDb } = await import('../src/db/seed.js')
const { createSession } = await import('../src/auth/sessions.js')
const { registerPushToken } = await import('../src/push/register.js')
const { pushTargets } = await import('../src/push/targets.js')
const { sendPush, setPushTransport } = await import('../src/push/send.js')

/**
 * A NOTIFICATION IS A COURTESY, NEVER A DEPENDENCY.
 *
 * The order is saved before anything is sent, and nothing that goes wrong on
 * the way to her phone - no network, a phone that uninstalled the app, Firebase
 * refusing - may reach back and fail the thing she actually did.
 */

afterEach(() => setPushTransport(null))

const TOKEN = 'fcm-token-aaaaaaaaaaaaaaaaaaaaaaaa'
const text = () => ({ title: 'नवीन ऑर्डर आले आहे', body: 'लोणचे · ₹220', path: '/seller/orders/SMB1' })

function world() {
  const db = emptyDb()
  const s = createSession(db, { role: 'seller', userId: 's1', sellerId: 's1' })
  registerPushToken(db, s.id, { token: TOKEN })
  return { db, s, targets: pushTargets(db, { sellerId: 's1' }) }
}

test('with no transport configured nothing is sent and nothing breaks', async () => {
  const { db, targets } = world()
  assert.equal(await sendPush(db, targets, text, () => assert.fail('no write')), 0)
})

test('each target gets the message built in its language', async () => {
  const { db, targets } = world()
  const sent: unknown[] = []
  setPushTransport(async (msgs) => { sent.push(...msgs); return msgs.map((m) => ({ token: m.token, ok: true, dead: false })) })
  assert.equal(await sendPush(db, targets, text, () => {}), 1)
  assert.deepEqual(sent, [{ token: TOKEN, ...text() }])
})

test('a phone that uninstalled the app is forgotten, and that is saved', async () => {
  const { db, s, targets } = world()
  let writes = 0
  setPushTransport(async (msgs) => msgs.map((m) => ({ token: m.token, ok: false, dead: true })))
  await sendPush(db, targets, text, () => { writes++ })
  assert.equal(s.pushToken, undefined)
  assert.equal(writes, 1)
})

test('a transport that throws is swallowed', async () => {
  const { db, targets } = world()
  setPushTransport(async () => { throw new Error('network down') })
  assert.equal(await sendPush(db, targets, text, () => {}), 0)
})

test('a message the builder declines is not sent at all', async () => {
  const { db, targets } = world()
  setPushTransport(async () => assert.fail('nothing to send'))
  assert.equal(await sendPush(db, targets, () => null, () => {}), 0)
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd backend && node --import tsx --test tests/push-send.test.ts`
Expected: FAIL, `Cannot find module '../src/push/send.js'`.

- [ ] **Step 3: Write `backend/src/push/send.ts`**

```ts
import { getApps } from 'firebase-admin/app'
import { getMessaging } from 'firebase-admin/messaging'
import type { PushLang, PushText } from '@shared/pushText.js'
import type { Db } from '../db/seed.js'
import type { PushTarget } from './targets.js'

export interface PushMessage {
  token: string
  title: string
  body: string
  path: string
}

export interface SendOutcome {
  token: string
  ok: boolean
  /** The phone no longer has the app (or cleared its data): forget the token. */
  dead: boolean
}

export type PushTransport = (messages: PushMessage[]) => Promise<SendOutcome[]>

/** Null until index.ts installs FCM - so tests and local development send nothing. */
let transport: PushTransport | null = null

export function setPushTransport(t: PushTransport | null): void {
  transport = t
}

export function pushEnabled(): boolean {
  return transport !== null
}

const DEAD_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
])

/** Sends through the Firebase app store.ts already initialised for Firestore. */
export function fcmTransport(): PushTransport {
  return async (messages) => {
    const app = getApps()[0]
    if (!app) return messages.map((m) => ({ token: m.token, ok: false, dead: false }))
    const res = await getMessaging(app).sendEach(messages.map((m) => ({
      token: m.token,
      notification: m.body ? { title: m.title, body: m.body } : { title: m.title },
      data: { path: m.path },
      android: {
        priority: 'high' as const,
        notification: { channelId: 'orders', color: '#7b1e2e', sound: 'default' },
      },
    })))
    return res.responses.map((r, i) => ({
      token: messages[i]!.token,
      ok: r.success,
      dead: !r.success && DEAD_CODES.has(r.error?.code ?? ''),
    }))
  }
}

/**
 * Build each target's message in her language, send, and forget any phone
 * that has uninstalled the app. Resolves to how many were accepted. Never
 * rejects: a notification is a courtesy, and the order it describes is
 * already saved.
 */
export async function sendPush(
  db: Db,
  targets: PushTarget[],
  build: (lang: PushLang) => PushText | null,
  persist: () => void,
): Promise<number> {
  if (!transport || targets.length === 0) return 0
  const messages: PushMessage[] = []
  for (const t of targets) {
    const text = build(t.lang)
    if (text) messages.push({ token: t.token, ...text })
  }
  if (messages.length === 0) return 0

  try {
    const outcomes = await transport(messages)
    const dead = new Set(outcomes.filter((o) => o.dead).map((o) => o.token))
    if (dead.size > 0) {
      for (const s of db.sessions) {
        if (s.pushToken && dead.has(s.pushToken)) {
          delete s.pushToken
          delete s.pushLang
        }
      }
      persist()
    }
    const failed = outcomes.filter((o) => !o.ok && !o.dead).length
    if (failed > 0) console.warn(`[push] ${failed} of ${messages.length} not delivered`)
    return outcomes.filter((o) => o.ok).length
  } catch (err) {
    console.warn('[push] send failed:', err instanceof Error ? err.message : err)
    return 0
  }
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `cd backend && node --import tsx --test tests/push-send.test.ts`
Expected: 5 PASS.

- [ ] **Step 5: Checkpoint** — files: `backend/src/push/send.ts`, `backend/tests/push-send.test.ts`. Commit after user approval: `git commit -m "feat(push): FCM transport; dead phones are forgotten"`.

---

### Task 4: The five triggers, the route, and the wiring

**Files:**
- Create: `backend/src/push/notify.ts`, `backend/src/routes/push.routes.ts`
- Modify: `backend/src/db/notices.ts`, `backend/src/routes/orders.routes.ts` (create ≈ line 228, advance ≈ 293, cancel ≈ 321, pay ≈ 385), `backend/src/auth/rateLimit.ts` (`LIMITS`), `backend/src/config.ts` (`describeConfig`), `backend/src/index.ts`
- Test: `backend/tests/push-triggers.test.ts`, add to `backend/tests/notices.test.ts`

**Interfaces:**
- Consumes: `pushTargets` (Task 2), `sendPush`, `setPushTransport`, `fcmTransport` (Task 3), `sellerOrderPush`, `customerOrderPush`, `paymentClaimedPush`, `adminNoticePush` (Task 1), `registerPushToken` (Task 2).
- Produces:
  - `notifyOrderPlaced(db: Db, order: Order, persist?: () => void): Promise<number>`
  - `notifyOrderAdvanced(db: Db, order: Order, to: OrderStatus, persist?): Promise<number>`
  - `notifyOrderCancelled(db: Db, order: Order, by: 'seller' | 'customer', persist?): Promise<number>`
  - `notifyPaymentClaimed(db: Db, order: Order, persist?): Promise<number>`
  - `notifyAdminNotice(db: Db, sellerId: string, notice: AdminNotice, persist?): Promise<number>`
  - `onNotice(fn: ((seller: Seller, notice: AdminNotice) => void) | null): void` in `db/notices.ts`
  - `pushRouter` mounted at `/api/push`; `LIMITS.pushTokenPerSession`, `LIMITS.pushTokenPerIp`

- [ ] **Step 1: Write the failing tests**

`backend/tests/push-triggers.test.ts`:

```ts
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

test('COMPLETED sends nothing', async () => {
  const { db, sent, order } = world()
  await notify.notifyOrderAdvanced(db, order, 'COMPLETED', none)
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
```

Append to `backend/tests/notices.test.ts` (it imports `appendNotice` statically; add `onNotice` to that import):

```ts
/**
 * The phone notification rides on the same moment the notice is written, so
 * no admin handler can record a decision and forget to tell her.
 */
test('every appended notice is handed to the listener', () => {
  const heard: string[] = []
  onNotice((_seller, notice) => heard.push(notice.kind))
  appendNotice({ id: 's1', notices: [] } as unknown as Seller, 'SLOTS_GRANTED', { n: 5 })
  onNotice(null)
  assert.deepEqual(heard, ['SLOTS_GRANTED'])
})

test('a listener that throws does not stop the notice being written', () => {
  onNotice(() => { throw new Error('boom') })
  const seller = { id: 's1', notices: [] } as unknown as Seller
  appendNotice(seller, 'UNBLOCKED')
  onNotice(null)
  assert.equal(seller.notices?.length, 1)
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd backend && node --import tsx --test tests/push-triggers.test.ts tests/notices.test.ts`
Expected: FAIL, `Cannot find module '../src/push/notify.js'`; `onNotice` is not exported.

- [ ] **Step 3: Write `backend/src/push/notify.ts`**

```ts
import type { AdminNotice, Order, OrderStatus } from '@shared/types.js'
import {
  adminNoticePush, customerOrderPush, paymentClaimedPush, sellerOrderPush,
} from '@shared/pushText.js'
import type { Db } from '../db/seed.js'
import { save } from '../db/store.js'
import { sendPush } from './send.js'
import { pushTargets } from './targets.js'

/**
 * ONE FUNCTION PER TRIGGER: who hears about it, and what they are told.
 *
 * The routes call these with `void` after `save()`, so the response never
 * waits on Firebase. `persist` is `save` in the server and a no-op in tests,
 * which must never write backend/data/db.json.
 */

export function notifyOrderPlaced(db: Db, order: Order, persist: () => void = save): Promise<number> {
  return sendPush(db, pushTargets(db, { sellerId: order.sellerId }), (lang) => sellerOrderPush(order, 'PLACED', lang), persist)
}

export function notifyOrderAdvanced(db: Db, order: Order, to: OrderStatus, persist: () => void = save): Promise<number> {
  return sendPush(db, pushTargets(db, { customerId: order.customerId }), (lang) => customerOrderPush(order, to, lang), persist)
}

export function notifyOrderCancelled(
  db: Db, order: Order, by: 'seller' | 'customer', persist: () => void = save,
): Promise<number> {
  return by === 'customer'
    ? sendPush(db, pushTargets(db, { sellerId: order.sellerId }), (lang) => sellerOrderPush(order, 'CANCELLED', lang), persist)
    : sendPush(db, pushTargets(db, { customerId: order.customerId }), (lang) => customerOrderPush(order, 'CANCELLED', lang), persist)
}

export function notifyPaymentClaimed(db: Db, order: Order, persist: () => void = save): Promise<number> {
  return sendPush(db, pushTargets(db, { sellerId: order.sellerId }), (lang) => paymentClaimedPush(order, lang), persist)
}

export function notifyAdminNotice(db: Db, sellerId: string, notice: AdminNotice, persist: () => void = save): Promise<number> {
  return sendPush(db, pushTargets(db, { sellerId }), (lang) => adminNoticePush(notice, lang), persist)
}
```

- [ ] **Step 4: Add the listener to `backend/src/db/notices.ts`**

Change the type import to `import type { AdminNotice, AdminNoticeKind, Seller } from '@shared/types.js'` (it already is). Above `appendNotice`, add:

```ts
type NoticeListener = (seller: Seller, notice: AdminNotice) => void
let listener: NoticeListener | null = null

/**
 * Hear every notice as it is written. index.ts sets this once at boot, to send
 * the phone notification; tests leave it unset. A listener that throws never
 * stops the notice itself being recorded.
 */
export function onNotice(fn: NoticeListener | null): void {
  listener = fn
}
```

In `appendNotice`, after the `seller.notices = …` line and before `return`:

```ts
  try {
    listener?.(seller, notice)
  } catch (err) {
    console.warn('[notices] listener failed:', err instanceof Error ? err.message : err)
  }
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `cd backend && node --import tsx --test tests/push-triggers.test.ts tests/notices.test.ts`
Expected: all PASS.

- [ ] **Step 6: Call the triggers from `backend/src/routes/orders.routes.ts`**

Add the import: `import { notifyOrderAdvanced, notifyOrderCancelled, notifyOrderPlaced, notifyPaymentClaimed } from '../push/notify.js'`.

- Create (`POST /`), after `save()`, before `res.status(201)…`:
  ```ts
  // The seller hears about each order she now has. Never awaited: the buyer's
  // reply must not wait on Firebase.
  for (const o of created) void notifyOrderPlaced(db, o)
  ```
- Advance (`POST /:id/advance`), after `save()`: `void notifyOrderAdvanced(db, order, to)`
- Cancel (`POST /:id/cancel`), after `save()`: `void notifyOrderCancelled(db, order, by)`
- Pay (`POST /:id/pay`), after `save()`: `void notifyPaymentClaimed(db, order)`

- [ ] **Step 7: Rate limits** — add to `LIMITS` in `backend/src/auth/rateLimit.ts`:

```ts
  /** A phone registers a handful of times a day; ten an hour is already generous. */
  pushTokenPerSession: { max: 10, windowMs: 60 * 60 * 1000 },
  /** Wider per IP: a village's buyers share their carrier's address. */
  pushTokenPerIp: { max: 200, windowMs: 60 * 60 * 1000 },
```

(A refinement of the spec's "10 an hour": per session it is 10; per IP it has to be wider, because carrier NAT puts many phones behind one address.)

- [ ] **Step 8: Write `backend/src/routes/push.routes.ts`**

```ts
import { Router } from 'express'
import { hashIp } from '../auth/crypto.js'
import { hit, LIMITS } from '../auth/rateLimit.js'
import { getDb, save } from '../db/store.js'
import { callerIp, requireRole } from '../middleware/auth.js'
import { registerPushToken } from '../push/register.js'

export const pushRouter = Router()

/**
 * The APK hands the page its phone's notification token; the page sends it
 * here. It is kept on THIS session (see push/register.ts), so logging out stops
 * the notifications and a second person signing in on the phone takes it over.
 */
pushRouter.post('/token', requireRole('seller', 'customer'), (req, res) => {
  const auth = req.auth!
  const perSession = hit(`push:session:${auth.sessionId}`, LIMITS.pushTokenPerSession)
  const perIp = hit(`push:ip:${hashIp(callerIp(req))}`, LIMITS.pushTokenPerIp)
  if (!perSession.ok || !perIp.ok) {
    res.setHeader('Retry-After', String(Math.max(perSession.retryAfterSec, perIp.retryAfterSec)))
    res.status(429).json({ error: 'Too many requests', messageMr: 'थोड्या वेळाने पुन्हा प्रयत्न करा.' })
    return
  }

  const result = registerPushToken(getDb(), auth.sessionId, req.body)
  if (!result.ok) {
    res.status(result.status).json({ error: result.error, messageMr: result.messageMr })
    return
  }
  if (result.changed) save()
  res.json({ ok: true })
})
```

- [ ] **Step 9: Wire it in `backend/src/index.ts`**

Imports: `import { pushRouter } from './routes/push.routes.js'`, `import { fcmTransport, setPushTransport } from './push/send.js'`, `import { notifyAdminNotice } from './push/notify.js'`, `import { onNotice } from './db/notices.js'`, and add `usingFirestore` to the existing `./config.js` import.

After `app.use('/api/orders', ordersRouter)`: `app.use('/api/push', pushRouter)`.

In `main()`, immediately after `await initStore()`:

```ts
  // Phone notifications go through the same Firebase project as the database.
  // Without Firestore (local development) the transport stays unset and every
  // send is a no-op.
  if (usingFirestore) setPushTransport(fcmTransport())
  // Admin decisions are written from eight handlers; hearing them here means
  // none of them can forget to tell her. setImmediate runs it after the
  // handler has saved and replied.
  onNotice((seller, notice) => setImmediate(() => void notifyAdminNotice(getDb(), seller.id, notice)))
```

- [ ] **Step 10: Banner line** — in `describeConfig()` (`backend/src/config.ts`), add after the `OTP` line:

```ts
    `  Push           ${usingFirestore ? 'Firebase Cloud Messaging' : 'off'}`,
```

- [ ] **Step 11: Full backend suite and typecheck**

Run: `cd backend && npm test`, then `npm run typecheck` from the root.
Expected: all PASS, no type errors. Run `npm run dev:api` and check that the banner prints `Push` and that the server starts.

- [ ] **Step 12: Checkpoint** — files: `push/notify.ts`, `routes/push.routes.ts`, `db/notices.ts`, `routes/orders.routes.ts`, `auth/rateLimit.ts`, `config.ts`, `index.ts`, both tests. Commit after user approval: `git commit -m "feat(push): notify the other side at every order step and admin decision"`.

---

### Task 5: The web app hands the token over

**Files:**
- Create: `frontend/src/lib/pushBridge.ts`, `frontend/src/components/PushBridge.tsx`
- Modify: `frontend/src/lib/api.ts` (add `registerPush`), `frontend/src/App.tsx` (mount)
- Test: `frontend/tests/pushBridge.test.ts`

**Interfaces:**
- Consumes: `POST /api/push/token` (Task 4); `Session` (`shared/src/types.ts`); `LangCode` (`frontend/src/i18n/strings.ts`).
- Produces:
  - `interface PushWindow { ReactNativeWebView?: { postMessage(message: string): void }; __smbPushToken?: (token: string) => void }`
  - `wantsPush(session: Pick<Session, 'role'> | null): boolean`
  - `startPushBridge(opts: { w: PushWindow; session: Session | null; lang: LangCode; register: (token: string, lang: LangCode) => Promise<unknown> }): () => void`
  - The wrapper contract: the page posts `JSON.stringify({ type: 'push:enable' })`; the wrapper calls `window.__smbPushToken('<token>')`.

- [ ] **Step 1: Write the failing test** — `frontend/tests/pushBridge.test.ts`

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Session } from '@shared/types.js'
import { startPushBridge, type PushWindow } from '../src/lib/pushBridge.js'

/**
 * THE PAGE ONLY ASKS FOR NOTIFICATIONS WHEN THEY CAN BE FOR SOMEBODY.
 *
 * Outside the APK there is no phone to buzz; before sign-in there is nobody to
 * buzz for, and Android's permission prompt on the landing page would arrive
 * before she knows what the app is.
 */

const seller = { token: 't', role: 'seller', userId: 's1', sellerId: 's1' } as Session

function apk() {
  const posted: string[] = []
  const w: PushWindow = { ReactNativeWebView: { postMessage: (m) => { posted.push(m) } } }
  return { w, posted }
}

test('in a plain browser nothing is asked', () => {
  const w: PushWindow = {}
  startPushBridge({ w, session: seller, lang: 'mr', register: async () => assert.fail('no register') })
  assert.equal(w.__smbPushToken, undefined)
})

test('signed out, or an admin, nothing is asked', () => {
  for (const session of [null, { ...seller, role: 'admin' } as Session]) {
    const { w, posted } = apk()
    startPushBridge({ w, session, lang: 'mr', register: async () => assert.fail('no register') })
    assert.deepEqual(posted, [])
  }
})

test('a signed-in seller in the APK asks, and her token is registered in her language', async () => {
  const { w, posted } = apk()
  const got: [string, string][] = []
  const stop = startPushBridge({ w, session: seller, lang: 'en', register: async (t, l) => { got.push([t, l]) } })
  assert.deepEqual(posted.map((m) => JSON.parse(m)), [{ type: 'push:enable' }])
  w.__smbPushToken?.('fcm-token-x')
  assert.deepEqual(got, [['fcm-token-x', 'en']])
  stop()
  assert.equal(w.__smbPushToken, undefined)
})

test('a registration that fails is swallowed', async () => {
  const { w } = apk()
  startPushBridge({ w, session: seller, lang: 'mr', register: async () => { throw new Error('offline') } })
  w.__smbPushToken?.('fcm-token-x')
  await new Promise((r) => setTimeout(r, 0))
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd frontend && node --import tsx --test tests/pushBridge.test.ts`
Expected: FAIL, `Cannot find module '../src/lib/pushBridge.js'`.

- [ ] **Step 3: Write `frontend/src/lib/pushBridge.ts`**

```ts
import type { Session } from '@shared/types.js'
import type { LangCode } from '../i18n/strings.js'

/**
 * THE HANDSHAKE WITH THE APK.
 *
 * The page cannot get a notification token itself - Android System WebView has
 * no push - so it asks the wrapper (`{ type: 'push:enable' }`), and the wrapper
 * answers by calling `window.__smbPushToken(token)`. This file is pure so it
 * can be tested in Node; components/PushBridge.tsx mounts it.
 */

export interface PushWindow {
  /** Present only inside the APK, and only because the wrapper sets onMessage. */
  ReactNativeWebView?: { postMessage(message: string): void }
  __smbPushToken?: (token: string) => void
}

export function wantsPush(session: Pick<Session, 'role'> | null): boolean {
  return session?.role === 'seller' || session?.role === 'customer'
}

/**
 * Ask the wrapper for the token, and register whatever it hands back in her
 * current language. Run again on sign-in and on a language change. Returns the
 * cleanup. Logout needs nothing: the server drops the token with the session.
 */
export function startPushBridge(opts: {
  w: PushWindow
  session: Session | null
  lang: LangCode
  register: (token: string, lang: LangCode) => Promise<unknown>
}): () => void {
  const { w, session, lang, register } = opts
  const bridge = w.ReactNativeWebView
  if (!bridge || !wantsPush(session)) return () => {}

  w.__smbPushToken = (token) => {
    register(token, lang).catch(() => {
      // A notification is a courtesy. The bell list still works without it.
    })
  }
  bridge.postMessage(JSON.stringify({ type: 'push:enable' }))
  return () => {
    delete w.__smbPushToken
  }
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `cd frontend && node --import tsx --test tests/pushBridge.test.ts`
Expected: 4 PASS.

- [ ] **Step 5: `api.registerPush`** — in `frontend/src/lib/api.ts`, add `import type { LangCode } from '../i18n/strings.js'` and, inside `export const api = {`, next to `myOrders`:

```ts
  /** The APK's notification token, kept on this session (see lib/pushBridge.ts). */
  registerPush: (token: string, lang: LangCode) => post<{ ok: true }>('/push/token', { token, lang }),
```

- [ ] **Step 6: Mount it** — create `frontend/src/components/PushBridge.tsx`:

```tsx
import { useEffect } from 'react'
import { useI18n } from '../i18n/I18nProvider.js'
import { api } from '../lib/api.js'
import { startPushBridge, type PushWindow } from '../lib/pushBridge.js'
import { useAuth } from '../store/AuthContext.js'

/** Mounted once in App.tsx. Renders nothing; see lib/pushBridge.ts. */
export default function PushBridge() {
  const { session } = useAuth()
  const { lang } = useI18n()
  useEffect(
    () => startPushBridge({ w: window as unknown as PushWindow, session, lang, register: api.registerPush }),
    [session, lang],
  )
  return null
}
```

In `frontend/src/App.tsx`, add `import PushBridge from './components/PushBridge.js'` and place `<PushBridge />` on the line after `<ScrollMemory />` (inside `Router`, `AuthProvider` and `I18nProvider`).

- [ ] **Step 7: Frontend suite, typecheck, build**

Run: `cd frontend && npm test`, then `npm run typecheck` and `npm run build` from the root.
Expected: all PASS; the build succeeds.

- [ ] **Step 8: Checkpoint** — files: `lib/pushBridge.ts`, `components/PushBridge.tsx`, `lib/api.ts`, `App.tsx`, the test. Commit after user approval: `git commit -m "feat(push): the page hands the APK's token to the API"`.

---

### Task 6: The battery-settings help card

**Files:**
- Modify: `frontend/src/i18n/strings.ts` (both dictionaries, beside `help.faq3`), `frontend/src/screens/seller/Misc.tsx` (the help screen, after the FAQ card ≈ line 235)
- Test: the existing `frontend/tests/i18n.test.ts` and `frontend/tests/marathi.test.ts`

- [ ] **Step 1: Add the strings.** Marathi, after `'help.faq3'` (type `ॲ` as U+0972):

```ts
  'help.pushTitle': 'फोनवर सूचना येत नसतील तर',
  'help.pushBody': 'फोनच्या सेटिंगमध्ये या ॲपसाठी सूचना चालू करा. Xiaomi, Oppo, Vivo किंवा Realme फोन असल्यास बॅटरी वापर "No restrictions" करा आणि Autostart चालू करा.',
```

English, after its `'help.faq3'`:

```ts
  'help.pushTitle': 'Not getting notifications on your phone?',
  'help.pushBody': 'Turn notifications on for this app in your phone settings. On a Xiaomi, Oppo, Vivo or Realme phone, also set battery use to "No restrictions" and turn on Autostart.',
```

- [ ] **Step 2: Render it** in `Misc.tsx`, after the FAQ `</Card>`:

```tsx
        {/* Phones that kill closed apps to save battery also kill their notifications. */}
        <Card>
          <SectionTitle>{t('help.pushTitle')}</SectionTitle>
          <div className="small">{t('help.pushBody')}</div>
        </Card>
```

- [ ] **Step 3: Run the dictionary and Marathi tests**

Run: `cd frontend && node --import tsx --test tests/i18n.test.ts tests/marathi.test.ts`
Expected: PASS. If `marathi.test.ts` flags the Marathi line, fix it per `docs/MARATHI-STYLE.md` and re-run. Do not edit the English line to match; the two are written independently.

- [ ] **Step 4: Checkpoint** — files: `strings.ts`, `Misc.tsx`. Commit after user approval: `git commit -m "feat(push): help card for phones that block notifications"`.

---

### Task 7: Documentation

**Files:**
- Modify: `CLAUDE.md`, `docs/DEPLOY.md` (§6 "The Android build"), `docs/MANUAL-TEST-PLAN.md` (new Suite Q after Suite P, §16)

- [ ] **Step 1: CLAUDE.md** — add a section `### Push notifications` after `### The updates list`:

```markdown
### Push notifications

Phone notifications (tray, sound, app closed) for the APK, sent by the API through `firebase-admin/messaging`. Spec: `docs/superpowers/specs/2026-09-21-push-notifications-design.md`.

- **The token lives on the session** (`SessionRecord.pushToken`, `pushLang`), not on the person and not in a collection of its own. So logging out or a 401 stops the notifications at once, and the boot read count is unchanged. `registerPushToken()` (`push/register.ts`) **takes the token off every other session**: one phone buzzes for whoever signed in on it last — the mother and daughter, the field coordinator's handset.
- **Five triggers, each telling the other side only:** order created → seller; advance (accept, pack, send, deliver, reject) → buyer; cancel → whoever did not cancel; UTR submitted → seller; any `appendNotice()` → seller (through `onNotice()`, set in `index.ts`). `COMPLETED` and the subscription reminder week are not sent.
- **The text is the updates list's text.** `shared/src/pushText.ts` copies the `notif.*` lines, and `frontend/tests/pushText.test.ts` holds them equal to the dictionary. The one new line ("buyer says I paid") is lifted word for word from `cancel.sel.q3Paid` / `refund.claimedBody`. It is sent in the app's language (`wb.lang`), not the phone's.
- **A send never fails a route.** Routes call `void notify…()` after `save()`; `sendPush()` never rejects; dead tokens are cleared on the first failed send. Without Firestore the transport is unset and every send is a no-op (`Push  off` in the banner).
- **The handshake:** the page posts `{ type: 'push:enable' }` (`lib/pushBridge.ts`, only inside the APK and only when a seller or buyer is signed in); the wrapper asks Android's permission, gets the FCM token and calls `window.__smbPushToken(token)`; the page registers it with `POST /api/push/token`. A tap loads `data.path`, which the wrapper accepts only if it starts with `/` and not `//`.
- Tests must never call the real `save()`: push functions take `persist`, and tests pass a no-op.
```

In *Not built yet*, remove `push notifications · `. Under *Deployment shape*, in the APK bullets, add: `**It carries expo-notifications and google-services.json** for push; a change to either needs a rebuild, and phones on an older APK simply get no notifications.` Update the `npm test` counts in *Commands* to what `npm test` prints.

- [ ] **Step 2: DEPLOY.md §6** — add a subsection "Push notifications": the Firebase console steps (Task 8), `google-services.json` at the wrapper root, `npx expo prebuild --platform android` without `--clean` after committing, the `orders` channel, and the battery-settings note for Xiaomi, Oppo, Vivo and Realme.

- [ ] **Step 3: MANUAL-TEST-PLAN.md** — add "Suite Q — Push notifications (APK)" with the six checks from the spec's *Testing → Manual* section, each with steps and the expected result, in the existing suite format.

- [ ] **Step 4: Checkpoint** — files: `CLAUDE.md`, `docs/DEPLOY.md`, `docs/MANUAL-TEST-PLAN.md`. Commit after user approval: `git commit -m "docs(push): how notifications work and how to test them"`.

---

### Task 8: Firebase console (the user does this; the agent gives the steps)

- [ ] **Step 1:** Find the project id: `npm run dev:api` prints `Database  Firestore (<project-id>)`. Production uses the project in the `FIREBASE_SERVICE_ACCOUNT` secret.
- [ ] **Step 2:** In console.firebase.google.com, open that project → ⚙ **Project settings** → **General** → **Your apps** → **Add app** → **Android**. Package name: `com.siddharam_sutar.mywebviewapp` (exactly as in the wrapper's `app.json`). Nickname: `SMB APK`. Leave SHA-1 empty (FCM does not need it). Click **Register app**.
- [ ] **Step 3:** Download `google-services.json`. Skip the SDK steps (Expo does them) and finish.
- [ ] **Step 4:** **Project settings → Cloud Messaging**: check that "Firebase Cloud Messaging API (V1)" says **Enabled**. If it does not, use the ⋮ menu → *Manage API in Google Cloud Console* → **Enable**.
- [ ] **Step 5:** Hand the file to the wrapper step (Task 9). It is not a secret (the key inside is restricted to this app), but keep it out of this repo; it belongs to the wrapper.

---

### Task 9: The APK wrapper (`appgold-main`, outside this repo)

**Precondition:** the other machine's `appgold-main` folder has been copied to this machine (the user does this). Do not start on this machine's older copy.

**Files (in `appgold-main`):**
- Modify: `app.json`, `app/index.tsx`
- Create: `google-services.json` (from Task 8), `assets/images/notification-icon.png`
- Regenerated: `android/` (by prebuild)

- [ ] **Step 1: Put it under git first.** In the wrapper folder: `git init`, `git add -A`, `git commit -m "wrapper as received from the other machine"`. Prebuild in Step 5 rewrites `android/`; this commit is the only way back.
- [ ] **Step 2: Install:** `npx expo install expo-notifications`
- [ ] **Step 3: Notification icon.** Android draws a small icon as a white silhouette, so it must be white on transparent. Generate a 96×96 icon of the letter "श" (the market's initial) with Python and Windows' Nirmala UI:

```python
from PIL import Image, ImageDraw, ImageFont
img = Image.new('RGBA', (96, 96), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
f = ImageFont.truetype(r'C:\Windows\Fonts\NirmalaB.ttf', 78)
box = d.textbbox((0, 0), 'श', font=f)
d.text(((96 - (box[2] - box[0])) / 2 - box[0], (96 - (box[3] - box[1])) / 2 - box[1]), 'श', font=f, fill=(255, 255, 255, 255))
img.save('assets/images/notification-icon.png')
```

- [ ] **Step 4: `app.json`** — under `expo.android`, add `"googleServicesFile": "./google-services.json"`. In `expo.plugins`, add:

```json
["expo-notifications", { "icon": "./assets/images/notification-icon.png", "color": "#7b1e2e", "defaultChannel": "orders" }]
```

Copy `google-services.json` from Task 8 into the wrapper root.

- [ ] **Step 5: Prebuild** — `npx expo prebuild --platform android` (**not** `--clean`, which throws away the existing `android/`). Then `git diff --stat android/` and read the changes. They should be the google-services Gradle plugin, the `POST_NOTIFICATIONS` permission, the notification icon and colour, and nothing that undoes an earlier fix. Restore any hand-made native change prebuild removed.
- [ ] **Step 6: `app/index.tsx`** — add at the top, beside the existing imports:

```tsx
import * as Notifications from 'expo-notifications'

const BASE_URL = 'https://shantai-mahila-bajar-app-frontend.vercel.app'

// Show the notification even while the app is open on another screen.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false,
  }),
})

/**
 * A tap may only open one of OUR pages: a path, never a URL, never "//host"
 * and never "/\host" either - `location.assign` (and every browser) treats a
 * leading backslash as a slash, so "/\evil.com" is "//evil.com" in disguise.
 */
function safePath(p: unknown): string | null {
  return typeof p === 'string' && /^\/(?![\/\\])/.test(p) ? p : null
}

/** FCM data can arrive in either place depending on how Android delivered it. */
function tapPath(r: Notifications.NotificationResponse | null): string | null {
  const req = r?.notification.request
  const fromContent = (req?.content.data as { path?: unknown } | undefined)?.path
  const fromTrigger = (req?.trigger as { remoteMessage?: { data?: { path?: unknown } } } | undefined)?.remoteMessage?.data?.path
  return safePath(fromContent ?? fromTrigger)
}
```

Inside `AppScreen`, after the existing `useState`s:

```tsx
  // Where the WebView opens: the home page, or the order a tapped notification is about.
  const [startUrl, setStartUrl] = useState<string | null>(null)

  const sendTokenToPage = (token: string) => {
    webViewRef.current?.injectJavaScript(
      `window.__smbPushToken && window.__smbPushToken(${JSON.stringify(token)}); true;`,
    )
  }

  const enablePush = async () => {
    try {
      const perm = await Notifications.requestPermissionsAsync()
      if (perm.status !== 'granted') return
      const t = await Notifications.getDevicePushTokenAsync()
      sendTokenToPage(String(t.data))
    } catch (err) {
      console.warn('push setup failed', err)
    }
  }

  useEffect(() => {
    // Android 13 asks permission only for an app that has a channel.
    void Notifications.setNotificationChannelAsync('orders', {
      name: 'ऑर्डर व सूचना',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      lightColor: '#7b1e2e',
    })
    Notifications.getLastNotificationResponseAsync().then((r) => {
      setStartUrl(BASE_URL + (tapPath(r) ?? '/'))
    })
    const tap = Notifications.addNotificationResponseReceivedListener((r) => {
      const p = tapPath(r)
      if (p) webViewRef.current?.injectJavaScript(`window.location.assign(${JSON.stringify(p)}); true;`)
    })
    const rotate = Notifications.addPushTokenListener((t) => sendTokenToPage(String(t.data)))
    return () => {
      tap.remove()
      rotate.remove()
    }
  }, [])
```

On the `<WebView …>`, change `source={{ uri: 'https://shantai-mahila-bajar-app-frontend.vercel.app/' }}` to `source={{ uri: startUrl ?? BASE_URL + '/' }}`, and add:

```tsx
        // Also what makes window.ReactNativeWebView exist in the page at all.
        onMessage={(e) => {
          try {
            if (JSON.parse(e.nativeEvent.data)?.type === 'push:enable') void enablePush()
          } catch {
            // Not ours.
          }
        }}
```

Wrap the WebView so it renders only once `startUrl` is known (`{startUrl && (<WebView … />)}`), so a tap from a closed app does not load the home page first.

- [ ] **Step 7: Build and install** — `npm run android` (the same `expo run:android` as before, debug keystore). Install the APK on the user's own phone.
- [ ] **Step 8: Manual checks** — run Suite Q from `docs/MANUAL-TEST-PLAN.md` on that phone, with the backend from Task 4 deployed. Pay particular attention to check 3 (a tap from a closed app opens the order); `tapPath()` covers both places Android can put `data`, and this is the check that proves it.
- [ ] **Step 9: Checkpoint (wrapper repo)** — `git add -A && git commit -m "feat: push notifications (expo-notifications, token hand-off, tap to order)"` after user approval.

---

### Task 10: Rollout (the user runs these; the agent checks each)

- [ ] **Step 1:** With Tasks 1–7 committed, push `prathamesh2`; Vercel builds the frontend. Deploy the API when nobody is ordering (`docs/DEPLOY.md` §1, `--max-instances=1`). The boot log must print `Push  Firebase Cloud Messaging`.
- [ ] **Step 2:** Confirm harmlessness: place a test order before anyone has the new APK. Nothing is sent and nothing errors (no session has a token).
- [ ] **Step 3:** Install the Task 9 APK on the user's phone and run Suite Q.
- [ ] **Step 4:** Share the APK on WhatsApp **as a document** (so it is not recompressed), with the one-line battery-settings note for Xiaomi, Oppo, Vivo and Realme.
- [ ] **Step 5:** Rollback, if needed: stop sharing the APK. Old APKs keep working; the API sends nothing to sessions without tokens.
