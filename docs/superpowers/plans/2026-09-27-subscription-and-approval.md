# Subscription and Listing Approval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring back the ₹50 pack-and-slot subscription with payment proof, and per-listing admin approval with a two-edit limit, on top of the one-time farmer verification — as a port into the current farmer/produce code, not a revert.

**Architecture:** `shared/src/subscription.ts` is the one rule for the six-month term and owns `canSellNow` (verified **and** term open); `shared/src/farmer.ts` holds slots and edit limits; `shared/src/payment.ts` holds the proof rules. The backend applies them (`db/subscription.ts`, `db/payments.ts`, the farmer, product and admin routes) and sends every screen its state on the server's clock (`subscriptionView`, `slots`). The frontend regains `Subscription` / `PaymentWaiting` and `SubscriptionNotice`; the admin regains `Payments`, the Pending tab and the subscription pill. `payments` becomes a Firestore collection. Expiry writes nothing; the only stored subscription state is `Farmer.subscriptionEndsAt`.

**Tech Stack:** TypeScript across `shared/`, Express (`backend/`), React + Vite (`frontend/`, `admin/`), `node:test` via tsx. Old code at `git show 5a4fa96:<path>`; the removal is `78d261f`.

**Spec:** `docs/superpowers/specs/2026-09-26-farmer-to-consumer-design.md` §11 (exact values, order of refusals, judgement calls).

## Global Constraints

- `@shared/<x>.js` imports on `.ts` files; `.js` on relative imports in both apps. `shared/` is consumed as source.
- Marathi first in both apps; every string through `t()`, in both dictionaries, written independently; `docs/MARATHI-STYLE.md` (joined postpositions, neuter ऑर्डर, Latin digits, `जागा` not `स्लॉट`, `UPI आयडी`, `पहा`). Server-side Marathi in `products.routes.ts` is scanned by `frontend/tests/marathi.test.ts`.
- Gender-neutral everywhere (no she/her/he/his, no तिला/तिने/ती, no विक्रेती/महिला); no old brand words (Shantai, SMB, Mahila, शांताई), including in UPI notes and test fixtures.
- Website only. No APK twins, no push, no gateway. Personal UPI IDs: no `upi://pay` button, no `tr`.
- Status is colour + icon + word; 16px text, 54px buttons, four bottom tabs (the subscription screen is reached from cards and gates, never a fifth tab); confirmations state the consequence.
- Never add a persist path that rewrites a whole collection; `payments` rows are appended and mutated in place.
- Gate after every task: `npm test && npm run typecheck && npm run build`. Update the three test counts in `CLAUDE.md` § Commands after each gate.

## Review Focus

1. `canSellNow` is asked on the server only, with the server clock: no screen may compute the term from the phone's `Date.now()` — search the frontend for `canSellNow` and `subscriptionEndsAt` after each task.
2. Nothing on expiry writes: grep `subscriptionEndsAt` for writers; only `applyApprovedPayment`, `backfillSubscriptionTerms` and the seed may set it.
3. Order of refusals on submit (403 not verified → 403 no term → 402 no slot) matches the message a farmer sees on the Upload screen's gates.
4. Rejection and take-down delete the row *and* free the slot in one motion; approval is the only path to `LIVE`; `normalizeLegacyRows` no longer touches `PENDING`.
5. Every new dictionary key exists in both languages and passes the i18n/Marathi tests; the English carries no gendered pronoun.

---

### Task 1: Subscription, slots and payment proof

**Files:**
- Create: `shared/src/subscription.ts`, `backend/src/db/subscription.ts`, `backend/src/db/payments.ts`, `backend/tests/subscription.test.ts`, `backend/tests/payment-proof.test.ts`, `backend/tests/payment-reject.test.ts`, `backend/tests/payment-account.test.ts`, `backend/tests/slots.test.ts`, `frontend/src/components/SubscriptionNotice.tsx`, `frontend/src/screens/farmer/Subscription.tsx`, `admin/src/components/Subscription.tsx`, `admin/src/screens/Payments.tsx`
- Modify (shared): `shared/src/types.ts`, `shared/src/farmer.ts`, `shared/src/payment.ts`
- Modify (backend): `backend/src/config.ts`, `backend/.env.example`, `backend/src/db/seed.ts`, `backend/src/db/firestore.ts`, `backend/src/db/moderation.ts`, `backend/src/db/accountClose.ts`, `backend/src/index.ts`, `backend/src/routes/farmers.routes.ts`, `backend/src/routes/products.routes.ts`, `backend/src/routes/catalog.routes.ts`, `backend/src/routes/orders.routes.ts`, `backend/src/routes/admin.routes.ts`, `backend/src/insights/price.ts`, `backend/scripts/admin.ts`, `backend/scripts/purge-demo-data.ts`
- Modify (backend tests): `moderation.test.ts`, `verification.test.ts`, `account-close.test.ts`, `catalog-visibility.test.ts`, `trace.test.ts`, `map.test.ts`, `price-hint.test.ts`
- Modify (frontend): `src/lib/api.ts`, `src/lib/notifications.ts`, `src/lib/tours.ts`, `src/components/ui.tsx`, `src/components/icons.tsx`, `src/components/NotificationBell.tsx`, `src/screens/Notifications.tsx`, `src/screens/farmer/MyBusiness.tsx`, `src/screens/farmer/MyProducts.tsx`, `src/screens/farmer/UploadProduct.tsx`, `src/screens/farmer/Misc.tsx`, `src/screens/auth/FarmerRegister.tsx`, `src/App.tsx`, `src/styles/theme.css`, `src/i18n/strings.ts`, `tests/notifications.test.ts`
- Modify (admin): `src/lib/api.ts`, `src/lib/format.ts`, `src/lib/sort.ts`, `src/components/Shell.tsx`, `src/components/Confirm.tsx`, `src/components/FarmerActions.tsx`, `src/screens/Home.tsx`, `src/screens/Today.tsx`, `src/screens/Farmers.tsx`, `src/screens/FarmerDetail.tsx`, `src/App.tsx`, `src/styles/admin.css`, `src/i18n/strings.ts`, `tests/sort.test.ts`, `tests/format.test.ts`, `tests/i18n.test.ts`
- Modify (docs): `CLAUDE.md`

**Interfaces:**

```ts
// shared/src/subscription.ts
export const SUBSCRIPTION_MONTHS = 6
export const RENEW_REMINDER_DAYS = 7
export function addMonths(iso: string, months: number): string
export type SubscriptionState = 'none' | 'active' | 'expiring' | 'expired'
export function subscriptionState(f: Pick<Farmer, 'subscriptionEndsAt'>, now?: number): SubscriptionState
export function isExpired(f, now?): boolean
export function termOpen(f, now?): boolean                 // active | expiring
export function canSellNow(f: Pick<Farmer, 'status' | 'subscriptionEndsAt'>, now?: number): boolean
export interface SubscriptionView { state; endsAt?; daysLeft?; remindFrom? }
export function subscriptionView(f, now?): SubscriptionView
export type PaymentKind = 'PACK' | 'RENEWAL'
export function renewalOpen(f, now?): boolean
export function payableKinds(f, slotsLeft: number, now?): PaymentKind[]
export function paymentKindProblem(kind, f, slotsLeft, now?): string | null
export function endsAtAfterApproval(f, kind, approvedAt: string): string | undefined

// shared/src/farmer.ts (canSellNow MOVES OUT of this file)
export const PLAN = { price: 50, slotsPerPack: 5, months: SUBSCRIPTION_MONTHS }
export const SLOT_CONSUMING: ProductStatus[] = ['PENDING', 'LIVE', 'PAUSED']
export function countUsedSlots(products: Pick<Product, 'status'>[]): number
export interface SlotInfo { total; used; left; isFull; almostFull }
export function slotInfo(f: Pick<Farmer, 'packsApproved'>, products): SlotInfo

// shared/src/payment.ts
export const PAID_AT_MAX_AGE_DAYS = 7
export function paidAtProblem(value: unknown, now?: number): string | null
export const PAYMENT_CHECKS = ['utr', 'dateTime', 'received'] as const
export type PaymentCheck = (typeof PAYMENT_CHECKS)[number]
export function allChecksDone(checks: unknown): boolean

// backend
export function applyApprovedPayment(farmer: Farmer, payment: SubscriptionPayment, approvedAt: string): void   // db/subscription.ts
export function startTermOnVerify(farmer: Farmer, verifiedAt: string): boolean      // packs, no term → six months from verification
export function grantSlots(farmer: Farmer, packs: number, at?: string): void
export function revokeProblem(farmer: Farmer, products: Pick<Product, 'status'>[], packs: number): { used: number; wouldLeave: number } | null
export function revokeSlots(farmer: Farmer, packs: number, at?: string): void
export function rejectPayment(farmer: Farmer, payment: SubscriptionPayment, reason: string, by: string, at?: string): void
export function backfillSubscriptionTerms(db: Pick<Db, 'farmers' | 'products' | 'payments'>, now?: Date): number
export function screenshotProblem(url: unknown, cloudinary: { cloudName: string; folder: string } | null): string | null  // db/payments.ts
export function publicIdFromUrl(url: string | undefined): string | undefined   // db/accountClose.ts
export const ADMIN_PAYMENT_ACCOUNT: AdminPaymentAccount                        // config.ts
export function publiclyVisible(product, farmer: Pick<Farmer, 'status' | 'isOpen' | 'subscriptionEndsAt'>, now?: number): boolean

// routes
GET  /farmers/me                        → { farmer, slots, subscription }
GET  /farmers/me/subscription           → { plan, account, slots, status, subscription, payable, screenshotRequired, payments }
POST /farmers/me/subscription/payment   { kind?, utr, paidAt, screenshotUrl?, payerUpi? } → 201 { payment }
GET  /products/mine                     → { products, slots, subscription }
DELETE /products/:id                    → { ok, slots }
GET  /admin/payments?status=PENDING|APPROVED|REJECTED|ALL → { payments }
POST /admin/payments/:id/approve        { checks } → { payment, farmer }
POST /admin/payments/:id/reject         { reason } → { payment }
POST /admin/farmers/:id/verify          → also starts the term when packs were approved before verification
POST /admin/farmers/:id/grant-slots     { packs } → { farmer }
POST /admin/farmers/:id/revoke-slots    { packs } → { farmer } | 409 { used, wouldLeave }
GET  /admin/farmers                     → rows + { slots, subscription }
GET  /admin/farmers/:id                 → farmer + { slots, subscription }, payments
GET  /admin/stats                       → + subscriptionsExpiring, subscriptionsExpired, pendingPayments, pendingProducts, subscriptionRevenue, approvedPaymentCount
```

- [ ] **Step 1: Write the failing backend tests.** Create `backend/tests/subscription.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Product, Farmer, SubscriptionPayment } from '@shared/types.js'
import {
  addMonths, canSellNow, endsAtAfterApproval, payableKinds, paymentKindProblem,
  subscriptionState, subscriptionView, termOpen,
} from '@shared/subscription.js'
import { slotInfo } from '@shared/farmer.js'
import {
  applyApprovedPayment, backfillSubscriptionTerms, grantSlots, revokeProblem, revokeSlots, startTermOnVerify,
} from '../src/db/subscription.js'

process.env.SESSION_SECRET = 'test-secret-for-unit-tests'
const { publiclyVisible } = await import('../src/routes/catalog.routes.js')

/**
 * SIX MONTHS PER ₹50, ON TOP OF THE ONE VERIFICATION.
 *
 * The shop is open for six months from approval. When they run out the whole
 * shop pauses; a flat ₹50 renewal puts back exactly what the farmer had. Only
 * the end date is stored, so "exactly what they had" is true by construction:
 * nothing about products, slots or the open/closed switch is ever rewritten.
 * And a verified farmer who has never paid is not on sale: the term has to be
 * there, not merely "not expired".
 */

const DAY = 86_400_000

function farmer(over: Partial<Farmer> = {}): Farmer {
  return {
    id: 'f1', status: 'ACTIVE', isOpen: true, packsApproved: 2, notices: [],
    verifiedAt: '2026-09-01T06:30:00.000Z',
    subscriptionEndsAt: '2027-03-15T06:30:00.000Z',
    ...over,
  } as Farmer
}

function payment(kind: 'PACK' | 'RENEWAL' | undefined): SubscriptionPayment {
  return { id: 'sp1', farmerId: 'f1', kind, status: 'APPROVED', amount: 50 } as SubscriptionPayment
}

test('six calendar months, counted in IST, clamped to the end of a short month', () => {
  assert.equal(addMonths('2026-03-15T06:30:00.000Z', 6), '2026-09-15T06:30:00.000Z')
  // 31 August -> 28 February: a day the month does not have is not March 3rd.
  assert.equal(addMonths('2026-08-31T06:30:00.000Z', 6), '2027-02-28T06:30:00.000Z')
  // 1 am IST on 1 September is still 31 August in UTC; counted in IST it is 1 March.
  assert.equal(addMonths('2026-08-31T19:30:00.000Z', 6), '2027-02-28T19:30:00.000Z')
})

test('active, then the week of reminders, then paused', () => {
  const f = farmer()
  const end = new Date(f.subscriptionEndsAt!).getTime()
  assert.equal(subscriptionState(f, end - 8 * DAY), 'active')
  assert.equal(subscriptionState(f, end - 7 * DAY), 'expiring')
  assert.equal(subscriptionState(f, end - 1), 'expiring')
  assert.equal(subscriptionState(f, end), 'expired')
  assert.equal(subscriptionState(farmer({ subscriptionEndsAt: undefined })), 'none')
  assert.equal(subscriptionView(f, end - 2.5 * DAY).daysLeft, 3)
})

/** Both gates. Verification alone sells nothing; a term alone sells nothing. */
test('only a verified farmer with an open term can sell', () => {
  const now = Date.parse('2026-10-01T00:00:00.000Z')
  assert.equal(canSellNow(farmer(), now), true)
  assert.equal(canSellNow(farmer({ status: 'PENDING_VERIFICATION' }), now), false, 'paid, not yet checked')
  assert.equal(canSellNow(farmer({ subscriptionEndsAt: undefined }), now), false, 'checked, never paid')
  assert.equal(canSellNow(farmer({ status: 'BLOCKED' }), now), false)
  assert.equal(canSellNow(farmer({ status: 'CLOSED' }), now), false)
  assert.equal(termOpen(farmer({ subscriptionEndsAt: undefined })), false, '"none" is not "not expired"')
})

/** Nothing is rewritten on expiry, so the same product that vanishes when the date passes is back when it moves. */
test('a live product leaves the shelf when the six months end, and returns on renewal untouched', () => {
  const f = farmer()
  const product = { status: 'LIVE' } as Pick<Product, 'status'>
  const end = new Date(f.subscriptionEndsAt!).getTime()

  assert.equal(publiclyVisible(product, f, end - 1), true)
  assert.equal(publiclyVisible(product, f, end + DAY), false)

  applyApprovedPayment(f, payment('RENEWAL'), new Date(end + DAY).toISOString())
  assert.equal(publiclyVisible(product, f, end + 2 * DAY), true)
  assert.equal(product.status, 'LIVE')
})

test('renewal keeps the packs exactly as they were - it is time, not slots', () => {
  const f = farmer({ packsApproved: 2 })
  const end = new Date(f.subscriptionEndsAt!).getTime()
  applyApprovedPayment(f, payment('RENEWAL'), new Date(end + 3 * DAY).toISOString())
  assert.equal(f.packsApproved, 2)
  assert.equal(slotInfo(f, []).total, 10)
})

test('a renewal after the shop paused counts six months from the approval', () => {
  const f = farmer()
  applyApprovedPayment(f, payment('RENEWAL'), '2027-04-01T06:30:00.000Z')
  assert.equal(f.subscriptionEndsAt, '2027-10-01T06:30:00.000Z')
  assert.equal(f.notices!.at(-1)!.kind, 'SUBSCRIPTION_RENEWED')
  assert.equal(f.notices!.at(-1)!.note, f.subscriptionEndsAt)
})

/** Renewing in the reminder week must not throw away the days already paid for. */
test('an early renewal adds six months to the end of the current term', () => {
  const f = farmer()
  const approvedAt = new Date(new Date(f.subscriptionEndsAt!).getTime() - 3 * DAY).toISOString()
  assert.equal(endsAtAfterApproval(f, 'RENEWAL', approvedAt), '2027-09-15T06:30:00.000Z')
})

/** Verify before pay: the farmer is already checked, so the approval starts the six months. */
test('the first pack starts the term; another pack mid-term adds slots and leaves the date', () => {
  const fresh = farmer({ packsApproved: 0, subscriptionEndsAt: undefined })
  applyApprovedPayment(fresh, payment('PACK'), '2026-09-15T06:30:00.000Z')
  assert.equal(fresh.packsApproved, 1)
  assert.equal(fresh.subscriptionEndsAt, '2027-03-15T06:30:00.000Z')

  const midTerm = farmer()
  applyApprovedPayment(midTerm, payment('PACK'), '2026-12-01T06:30:00.000Z')
  assert.equal(midTerm.packsApproved, 3)
  assert.equal(midTerm.subscriptionEndsAt, '2027-03-15T06:30:00.000Z')
  assert.equal(midTerm.notices!.some((n) => n.kind === 'SUBSCRIPTION_RENEWED'), false)
})

/** A pack sent in before the date and approved after it still reopens the shop, and says so. */
test('a pack approved after the shop paused reopens it too', () => {
  const f = farmer()
  applyApprovedPayment(f, payment(undefined), '2027-05-01T06:30:00.000Z')
  assert.equal(f.packsApproved, 3)
  assert.equal(f.subscriptionEndsAt, '2027-11-01T06:30:00.000Z')
  assert.deepEqual(f.notices!.map((n) => n.kind), ['PAYMENT_APPROVED', 'SUBSCRIPTION_RENEWED'])
})

/**
 * PAYING IS NOT HOW A FARMER GETS VERIFIED, and not how a block is lifted.
 * The status is never written here.
 */
test('paying neither verifies nor unblocks', () => {
  const waiting = farmer({ status: 'PENDING_VERIFICATION', verifiedAt: undefined, packsApproved: 0, subscriptionEndsAt: undefined })
  applyApprovedPayment(waiting, payment('PACK'), '2026-09-15T06:30:00.000Z')
  assert.equal(waiting.status, 'PENDING_VERIFICATION')
  assert.equal(canSellNow(waiting, Date.parse('2026-09-16T00:00:00Z')), false)

  const blocked = farmer({ status: 'BLOCKED' })
  applyApprovedPayment(blocked, payment('RENEWAL'), '2027-04-01T06:30:00.000Z')
  assert.equal(blocked.status, 'BLOCKED')
  assert.equal(blocked.subscriptionEndsAt, '2027-10-01T06:30:00.000Z', 'a verified farmer\'s renewal moves the date, blocked or not')
})

/**
 * THE TERM NEVER RUNS WHILE THE FARMER IS UNVERIFIED. A farmer who pays first
 * and waits a fortnight for the field visit must not lose a fortnight of a
 * six-month shop. So an approval before verification grants the slots and
 * nothing else, and verifying starts the six months from that moment.
 */
test('pay before verify: no term runs; verification starts six months from itself', () => {
  const f = farmer({ status: 'PENDING_VERIFICATION', verifiedAt: undefined, packsApproved: 0, subscriptionEndsAt: undefined })
  const p = payment('PACK')
  applyApprovedPayment(f, p, '2026-09-15T06:30:00.000Z')
  assert.equal(f.packsApproved, 1)
  assert.equal(f.subscriptionEndsAt, undefined, 'the clock has not started')
  assert.equal(p.termEndsAt, undefined, 'and the payment cannot say when it ends')
  assert.deepEqual(f.notices!.map((n) => n.kind), ['PAYMENT_APPROVED'])

  // The verify route stamps verifiedAt and then asks this.
  f.status = 'ACTIVE'
  f.verifiedAt = '2026-10-01T06:30:00.000Z'
  assert.equal(startTermOnVerify(f, f.verifiedAt), true)
  assert.equal(f.subscriptionEndsAt, '2027-04-01T06:30:00.000Z')
  assert.equal(f.notices!.at(-1)!.kind, 'SUBSCRIPTION_RENEWED')
  assert.equal(canSellNow(f, Date.parse('2026-10-02T00:00:00Z')), true)
})

test('verifying a farmer who has not paid starts nothing; verifying one already dated moves nothing', () => {
  const unpaid = farmer({ verifiedAt: undefined, packsApproved: 0, subscriptionEndsAt: undefined })
  assert.equal(startTermOnVerify(unpaid, '2026-10-01T06:30:00.000Z'), false)
  assert.equal(unpaid.subscriptionEndsAt, undefined)
  const dated = farmer()
  assert.equal(startTermOnVerify(dated, '2026-10-01T06:30:00.000Z'), false)
  assert.equal(dated.subscriptionEndsAt, '2027-03-15T06:30:00.000Z')
})

/** Two ₹50s approved before the visit are still ONE first term, not twelve months. */
test('a renewal approved before verification is a first term like a pack, not a second one', () => {
  const f = farmer({ status: 'PENDING_VERIFICATION', verifiedAt: undefined, packsApproved: 0, subscriptionEndsAt: undefined })
  applyApprovedPayment(f, payment('PACK'), '2026-09-15T06:30:00.000Z')
  applyApprovedPayment(f, payment('RENEWAL'), '2026-09-20T06:30:00.000Z')
  assert.equal(f.packsApproved, 1, 'a renewal is not slots')
  assert.equal(f.subscriptionEndsAt, undefined)
  f.verifiedAt = '2026-10-01T06:30:00.000Z'
  startTermOnVerify(f, f.verifiedAt)
  assert.equal(f.subscriptionEndsAt, '2027-04-01T06:30:00.000Z', 'six months, once')
})

/**
 * GOODWILL IS SLOTS, TIME IS PAID. A granted pack gives a verified farmer with
 * no term a term to use it in, and never a day more to one who has a term.
 * For an unverified farmer it is slots only - the term starts at verification
 * like any pack's.
 */
test('granted slots start a term only for a verified farmer with none, and never extend one', () => {
  const now = '2026-09-15T06:30:00.000Z'
  const verifiedNoTerm = farmer({ packsApproved: 0, subscriptionEndsAt: undefined })
  grantSlots(verifiedNoTerm, 2, now)
  assert.equal(verifiedNoTerm.packsApproved, 2)
  assert.equal(verifiedNoTerm.subscriptionEndsAt, '2027-03-15T06:30:00.000Z')
  assert.deepEqual(verifiedNoTerm.notices!.at(-1), { id: `SLOTS_GRANTED:${now}`, at: now, kind: 'SLOTS_GRANTED', n: 10 })

  const dated = farmer()
  grantSlots(dated, 1, now)
  assert.equal(dated.subscriptionEndsAt, '2027-03-15T06:30:00.000Z', 'the date did not move')

  const unverified = farmer({ status: 'PENDING_VERIFICATION', verifiedAt: undefined, packsApproved: 0, subscriptionEndsAt: undefined })
  grantSlots(unverified, 1, now)
  assert.equal(unverified.packsApproved, 1)
  assert.equal(unverified.subscriptionEndsAt, undefined)
  assert.equal(unverified.status, 'PENDING_VERIFICATION', 'a gift is not a verification')
})

/** Taking packs back must not silently un-publish listings the farmer has live. */
test('revoking never drops the allowance below the slots in use', () => {
  const f = farmer({ packsApproved: 2 })
  const inUse = Array.from({ length: 7 }, () => ({ status: 'LIVE' as const }))
  assert.deepEqual(revokeProblem(f, inUse, 1), { used: 7, wouldLeave: 5 })
  assert.equal(revokeProblem(f, inUse.slice(0, 5), 1), null)
  revokeSlots(f, 1, '2026-09-15T06:30:00.000Z')
  assert.equal(f.packsApproved, 1)
  assert.equal(f.notices!.at(-1)!.kind, 'SLOTS_REVOKED')
  assert.equal(f.notices!.at(-1)!.n, 5)
  assert.equal(f.subscriptionEndsAt, '2027-03-15T06:30:00.000Z', 'time is not taken back with slots')
  assert.equal(revokeProblem(farmer({ packsApproved: 0 }), [], 1), null, 'nothing to remove is refused by the console, not here')
})

test('what may be paid for: renewal from the reminder on, only renewal once paused', () => {
  const f = farmer()
  const end = new Date(f.subscriptionEndsAt!).getTime()
  assert.deepEqual(payableKinds(f, 3, end - 60 * DAY), [])
  assert.notEqual(paymentKindProblem('RENEWAL', f, 3, end - 60 * DAY), null)
  assert.deepEqual(payableKinds(f, 0, end - 60 * DAY), ['PACK'])
  assert.deepEqual(payableKinds(f, 0, end - 2 * DAY), ['RENEWAL', 'PACK'])
  assert.deepEqual(payableKinds(f, 0, end + DAY), ['RENEWAL'])
  assert.notEqual(paymentKindProblem('PACK', f, 0, end + DAY), null)
  assert.deepEqual(payableKinds(farmer({ subscriptionEndsAt: undefined, packsApproved: 0 }), 0), ['PACK'])
})

/**
 * FARMERS FROM THE FREE PERIOD. They were verified and sold with no term and
 * no packs. Deploying the rule must not take their listings off sale at once:
 * they get packs enough for what is on sale (at least one) and six months
 * from their last approval or their verification - never fewer than a week.
 */
test('verified farmers from before the rule get a term and enough packs, never less than a week', () => {
  const now = new Date('2026-09-15T06:30:00.000Z')
  const db = {
    farmers: [
      farmer({ id: 'recent', subscriptionEndsAt: undefined, packsApproved: 1 }),
      farmer({ id: 'old', subscriptionEndsAt: undefined, packsApproved: undefined, verifiedAt: '2026-01-01T06:30:00.000Z' }),
      farmer({ id: 'busy', subscriptionEndsAt: undefined, packsApproved: undefined, verifiedAt: '2026-08-01T06:30:00.000Z' }),
      farmer({ id: 'waiting', status: 'PENDING_VERIFICATION', verifiedAt: undefined, subscriptionEndsAt: undefined, packsApproved: 0 }),
      farmer({ id: 'closed', status: 'CLOSED', subscriptionEndsAt: undefined }),
      farmer({ id: 'dated' }),
    ],
    products: Array.from({ length: 7 }, (_, i) => ({ id: `p${i}`, farmerId: 'busy', status: 'LIVE' })) as Product[],
    payments: [
      { farmerId: 'recent', status: 'APPROVED', verifiedAt: '2026-09-01T06:30:00.000Z' },
    ] as SubscriptionPayment[],
  }

  assert.equal(backfillSubscriptionTerms(db, now), 3)
  const by = (id: string) => db.farmers.find((f) => f.id === id)!
  assert.equal(by('recent').subscriptionEndsAt, '2027-03-01T06:30:00.000Z')
  assert.equal(by('recent').packsApproved, 1, 'packs already counted are left alone')
  // Six months from a January verification is July - already past. A week's warning instead.
  assert.equal(by('old').subscriptionEndsAt, '2026-09-22T06:30:00.000Z')
  assert.equal(by('old').packsApproved, 1, 'nothing on sale still gets one pack')
  assert.equal(by('busy').subscriptionEndsAt, '2027-02-01T06:30:00.000Z')
  assert.equal(by('busy').packsApproved, 2, 'seven live listings need two packs')
  assert.equal(by('waiting').subscriptionEndsAt, undefined, 'an unverified farmer pays when they choose')
  assert.equal(by('closed').subscriptionEndsAt, undefined)
  assert.equal(by('dated').subscriptionEndsAt, '2027-03-15T06:30:00.000Z')
  assert.equal(backfillSubscriptionTerms(db, now), 0, 'idempotent')
})
```

Create `backend/tests/payment-proof.test.ts` from `git show 5a4fa96:backend/tests/payment-proof.test.ts` with two changes: the fixture `cloud` becomes `{ cloudName: 'f2c-demo', folder: 'f2c' }` and every URL uses `/f2c/payment/` and `/f2c/product/` (the old fixture names the old brand). Create `backend/tests/payment-account.test.ts` from `git show 5a4fa96:backend/tests/payment-account.test.ts` unchanged except the docblock's "woman" → "farmer" (the placeholder assertion `shantabazar@okaxis` stays: it is what must never come back).

Create `backend/tests/payment-reject.test.ts` (replaces the old status-juggling test, because the farmer carries no payment status any more):

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Farmer, SubscriptionPayment } from '@shared/types.js'
import { rejectPayment } from '../src/db/subscription.js'

/**
 * Rejecting a payment used to set the whole account to PAYMENT_REJECTED,
 * which once locked out a farmer whose duplicate submission was cleared off
 * the queue after the first copy had been approved. The account now carries
 * no payment status at all: a rejection changes the payment and tells the
 * farmer why, and that is all it does.
 */
function farmer(over: Partial<Farmer> = {}): Farmer {
  return { id: 'f1', status: 'ACTIVE', packsApproved: 1, subscriptionEndsAt: '2027-03-15T06:30:00.000Z', notices: [], ...over } as Farmer
}
function payment(over: Partial<SubscriptionPayment> = {}): SubscriptionPayment {
  return { id: 'p2', farmerId: 'f1', status: 'PENDING', utr: '512309887711', ...over } as SubscriptionPayment
}

test('a rejection marks the payment, keeps the reason, and tells the farmer', () => {
  const f = farmer()
  const p = payment()
  rejectPayment(f, p, 'UTR not on the statement', 'Asha <asha@example.com>', '2026-09-20T10:00:00.000Z')
  assert.equal(p.status, 'REJECTED')
  assert.equal(p.rejectReason, 'UTR not on the statement')
  assert.equal(p.verifiedBy, 'Asha <asha@example.com>')
  assert.deepEqual(f.notices!.map((n) => [n.kind, n.note]), [['PAYMENT_REJECTED', 'UTR not on the statement']])
})

test('rejecting a duplicate leaves the account exactly as the approved one left it', () => {
  const f = farmer()
  rejectPayment(f, payment(), 'duplicate', 'admin')
  assert.equal(f.status, 'ACTIVE')
  assert.equal(f.packsApproved, 1)
  assert.equal(f.subscriptionEndsAt, '2027-03-15T06:30:00.000Z')
})

test('a rejection is not the way a block is lifted', () => {
  const f = farmer({ status: 'BLOCKED' })
  rejectPayment(f, payment(), 'x', 'admin')
  assert.equal(f.status, 'BLOCKED')
})
```

Create `backend/tests/slots.test.ts` (the delete rule joins it in Task 2):

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { ProductStatus } from '@shared/types.js'
import { slotInfo } from '@shared/farmer.js'

/**
 * ONE LISTING, ONE SLOT - AND ONLY AN ADMIN GIVES ONE BACK.
 *
 * A submitted listing keeps its slot while it waits, while it is live and
 * while it is paused. The slot returns when an admin rejects it or takes it
 * down, which deletes the row: five slots, three sent in, the third refused,
 * leaves three free.
 */
const pack = { packsApproved: 1 }
const listings = (...statuses: ProductStatus[]) => statuses.map((status) => ({ status }))

test('waiting, live and paused listings each hold a slot', () => {
  const slots = slotInfo(pack, listings('PENDING', 'LIVE', 'PAUSED'))
  assert.equal(slots.used, 3)
  assert.equal(slots.left, 2)
})

test('a rejection gives the slot back the moment the row goes', () => {
  const before = slotInfo(pack, listings('LIVE', 'LIVE', 'PENDING'))
  const after = slotInfo(pack, listings('LIVE', 'LIVE'))
  assert.equal(before.left, 2)
  assert.equal(after.left, 3)
})

test('a full pack reads as full, and a take-down frees exactly one', () => {
  assert.equal(slotInfo(pack, listings('LIVE', 'LIVE', 'LIVE', 'LIVE', 'LIVE')).isFull, true)
  const takenDown = slotInfo(pack, listings('LIVE', 'LIVE', 'LIVE', 'LIVE'))
  assert.equal(takenDown.isFull, false)
  assert.equal(takenDown.left, 1)
  assert.equal(takenDown.almostFull, true)
})

test('a draft holds no slot', () => {
  assert.equal(slotInfo(pack, listings('DRAFT', 'DRAFT')).used, 0)
})

/**
 * Verification is the account gate now, not payment, so a verified farmer
 * with no packs reaches the slot gate. Zero packs has to read as no room -
 * the reference's `total > 0 &&` made it read as unlimited room.
 */
test('no packs means no room, not unlimited room', () => {
  const none = slotInfo({ packsApproved: 0 }, [])
  assert.equal(none.total, 0)
  assert.equal(none.isFull, true)
  assert.equal(slotInfo({ packsApproved: undefined }, []).isFull, true, 'a row from before the field existed')
})
```

- [ ] **Step 2: Rewrite the backend tests the rule changes.**
  - `backend/tests/verification.test.ts`: import `canSellNow` from `@shared/subscription.js`; the first test becomes "only a verified farmer with an open term can sell" (`{ status: 'ACTIVE' }` alone → false; with `subscriptionEndsAt` a year ahead → true; `PENDING_VERIFICATION`/`BLOCKED`/`CLOSED` with a term → false). Drop the `initialListingStatus` test here (Task 2's `listing-review.test.ts` owns it). The `publiclyVisible` test's farmers gain `subscriptionEndsAt: FUTURE` and one extra case: `{ status: 'ACTIVE', isOpen: true }` with no term → false.
  - `backend/tests/moderation.test.ts`: the `pending` row stays `PENDING` and the expected count drops to 6; the docblock says a waiting listing is a real queue entry again.
  - `backend/tests/catalog-visibility.test.ts`, `trace.test.ts`, `map.test.ts`, `price-hint.test.ts`: every `status: 'ACTIVE'` farmer fixture gains `subscriptionEndsAt: '2099-01-01T00:00:00.000Z'` (define `const FUTURE` once per file). `catalog-visibility` adds one test: `publiclyVisible(product('LIVE'), farmer({ subscriptionEndsAt: '2000-01-01T00:00:00.000Z' }))` is false — "an expired shop takes its live listings with it".
  - `backend/tests/account-close.test.ts`: the fixture gains `packsApproved: 1, subscriptionEndsAt: new Date(Date.now() + 100 * DAY).toISOString()`; `canSellNow` is imported from `@shared/subscription.js`; restore the two removed tests from `git show 5a4fa96:backend/tests/account-close.test.ts` ("the money trail stays, the payer does not", "a Cloudinary URL yields the id the delete needs") with `sellerId`→`farmerId`, `sellerName`→`farmerName`, `womenBizId: 'SMB-ANADUR-01'`→`farmerCode: 'F2C-ANADUR-001'`, the screenshot URL under `/f2c/payment/proof.jpg` (public id `f2c/payment/proof`), and the QR id `f2c/qr/farmer`.

- [ ] **Step 3: Run** `cd backend && node --import tsx --test tests/subscription.test.ts tests/payment-proof.test.ts tests/payment-reject.test.ts tests/payment-account.test.ts tests/slots.test.ts tests/verification.test.ts tests/moderation.test.ts tests/account-close.test.ts` → FAIL (modules missing, `canSellNow` shape).

- [ ] **Step 4: Shared types.** In `shared/src/types.ts`:
  - `ProductStatus = 'DRAFT' | 'PENDING' | 'LIVE' | 'PAUSED'`; `Product` gains `editCount?: number` (doc: how many of `MAX_EDITS` spent; absent reads 0).
  - `Farmer` gains `subscriptionEndsAt?: string` and `packsApproved?: number` (doc: absent reads 0; a row from before the rule).
  - `AdminNoticeKind = 'VERIFIED' | 'BLOCKED' | 'UNBLOCKED' | 'SLOTS_GRANTED' | 'SLOTS_REVOKED' | 'PAYMENT_APPROVED' | 'PAYMENT_REJECTED' | 'PRODUCT_APPROVED' | 'PRODUCT_REJECTED' | 'SUBSCRIPTION_RENEWED'` (ten); `AdminNotice.n` doc: "slots, where the sentence carries a number - slots, not packs; a pack is our word".
  - Add `PaymentApprovalStatus`, `SubscriptionPayment` and `AdminPaymentAccount` from `git show 5a4fa96:shared/src/types.ts` (the `/* Subscription */` block) with `sellerId`→`farmerId`, `sellerName`→`farmerName`, `womenBizId`→`farmerCode`.
  - `AdminStats` gains `subscriptionsExpiring`, `subscriptionsExpired`, `pendingPayments`, `pendingProducts`, `subscriptionRevenue`, `approvedPaymentCount` (docs from the old file).

- [ ] **Step 5: `shared/src/subscription.ts`.** Copy `git show 5a4fa96:shared/src/subscription.ts` verbatim, then: `Seller`→`Farmer`, "she/her" in comments → "the farmer/their", and replace the `canSellNow` block with:

```ts
/** An open term: active, or in the reminder week. `none` and `expired` are both closed. */
export function termOpen(f: Pick<Farmer, 'subscriptionEndsAt'>, now = Date.now()): boolean {
  const state = subscriptionState(f, now)
  return state === 'active' || state === 'expiring'
}

/**
 * May the public buy from this farmer right now? Two gates, both required.
 *
 * `status === 'ACTIVE'` is the one-time verification. `termOpen` is the paid
 * six months. A verified farmer who has never paid has no term, and "no date"
 * must not read as "not expired": status no longer keeps an unpaid farmer off
 * the shelf, so the date has to.
 */
export function canSellNow(
  f: Pick<Farmer, 'status' | 'subscriptionEndsAt'>,
  now = Date.now(),
): boolean {
  return f.status === 'ACTIVE' && termOpen(f, now)
}
```

- [ ] **Step 6: `shared/src/farmer.ts`.** Delete `canSellNow` here (every importer switches to `@shared/subscription.js`: `catalog.routes.ts`, `orders.routes.ts`, `farmers.routes.ts`, `products.routes.ts`, `admin.routes.ts`, `insights/price.ts`, `UploadProduct.tsx` — the last one stops using it, see Step 14). Add `import { SUBSCRIPTION_MONTHS } from './subscription.js'` and, above `initialListingStatus`:

```ts
/**
 * SUBSCRIPTION + LISTING SLOTS. ₹50 buys one PACK = 5 slots; the shop stays
 * open SUBSCRIPTION_MONTHS from approval (shared/src/subscription.ts). No
 * gateway: the farmer pays the programme's UPI and an admin approves by hand.
 */
export const PLAN = { price: 50, slotsPerPack: 5, months: SUBSCRIPTION_MONTHS }

/**
 * ONE LISTING, ONE SLOT, FOR GOOD. Spent when submitted, held while waiting,
 * live or paused; only an admin's rejection or take-down - which deletes the
 * row - gives it back. DRAFT holds none, so a farmer can experiment before paying.
 */
export const SLOT_CONSUMING: ProductStatus[] = ['PENDING', 'LIVE', 'PAUSED']

export function countUsedSlots(products: Pick<Product, 'status'>[]): number {
  return products.filter((p) => SLOT_CONSUMING.includes(p.status)).length
}

export interface SlotInfo { total: number; used: number; left: number; isFull: boolean; almostFull: boolean }

export function slotInfo(f: Pick<Farmer, 'packsApproved'>, products: Pick<Product, 'status'>[]): SlotInfo {
  const total = (f.packsApproved || 0) * PLAN.slotsPerPack
  const used = countUsedSlots(products)
  return {
    total, used,
    left: Math.max(0, total - used),
    // Zero packs is FULL. Verification is the account gate now, so a
    // verified farmer with no packs reaches this; `total > 0 &&` here read
    // as unlimited room.
    isFull: used >= total,
    almostFull: total > 0 && total - used === 1,
  }
}
```

  `PRODUCT_STATUS_STYLE` gains `PENDING: { tone: 'warn', icon: 'pending', labelKey: 'prod.pending' }` and `ProductStatusIconName` gains `'pending'` (frontend `icons.tsx`: `pending: FiClock`). `initialListingStatus` and `farmerMayDelete` are untouched until Task 2.

- [ ] **Step 7: `shared/src/payment.ts`.** Re-insert the removed block (`git show 78d261f -- shared/src/payment.ts`, the `-` lines between the UTR and UPI sections): `PAID_AT_FUTURE_SLACK_MS`, `PAID_AT_MAX_AGE_DAYS`, `paidAtProblem`, `PAYMENT_CHECKS`, `PaymentCheck`, `allChecksDone`. Comment "she" → "the farmer".

- [ ] **Step 8: Backend rules.**
  - `backend/src/config.ts`: re-insert `ADMIN_PAYMENT_ACCOUNT` from `git show 78d261f -- backend/src/config.ts` (import `AdminPaymentAccount` type), "woman" → "farmer"; add to `describeConfig()`: `` `  Fee payee      ${ADMIN_PAYMENT_ACCOUNT.upiId} (${ADMIN_PAYMENT_ACCOUNT.label})` ``. `backend/.env.example`: re-insert the `WHERE THE ₹50 GOES` block before the Backups section (`git show 5a4fa96:backend/.env.example`), "seller"/"her" → "farmer"/"their".
  - `backend/src/db/payments.ts`: `screenshotProblem` only, from `git show 5a4fa96:backend/src/db/payments.ts` (drop `sellerStatusAfterReject`).
  - `backend/src/db/subscription.ts`:

```ts
import type { Farmer, Product, SubscriptionPayment } from '@shared/types.js'
import { RENEW_REMINDER_DAYS, SUBSCRIPTION_MONTHS, addMonths, endsAtAfterApproval, isExpired } from '@shared/subscription.js'
import { PLAN, countUsedSlots } from '@shared/farmer.js'
import { appendNotice } from './notices.js'
import type { Db } from './seed.js'

/**
 * What approving a payment does to the account. The admin has already held
 * the UTR, time and screenshot against the statement (PAYMENT_CHECKS).
 *
 * A PACK adds five slots. THE TERM NEVER RUNS WHILE THE FARMER IS UNVERIFIED:
 * for a farmer with no `verifiedAt` nothing else happens, whatever the kind -
 * `startTermOnVerify` starts the six months when the field visit does, so a
 * farmer who paid first is not charged for the wait, and a renewal approved
 * before the visit does not buy a second term on top of the first. For a
 * verified farmer either kind may move the end date (`endsAtAfterApproval`).
 * STATUS IS NEVER TOUCHED: verification has its own button, and a blocked
 * farmer stays blocked - paying is not how a block is lifted.
 */
export function applyApprovedPayment(farmer: Farmer, payment: SubscriptionPayment, approvedAt: string): void {
  const kind = payment.kind ?? 'PACK'
  if (kind === 'PACK') {
    farmer.packsApproved = (farmer.packsApproved ?? 0) + 1
    appendNotice(farmer, 'PAYMENT_APPROVED', { n: PLAN.slotsPerPack }, approvedAt)
  }
  if (!farmer.verifiedAt) return

  const wasExpired = isExpired(farmer, new Date(approvedAt).getTime())
  const before = farmer.subscriptionEndsAt
  farmer.subscriptionEndsAt = endsAtAfterApproval(farmer, kind, approvedAt)
  payment.termEndsAt = farmer.subscriptionEndsAt
  // A renewal always says so; a pack only when it happened to reopen a paused shop.
  if (kind === 'RENEWAL' || (wasExpired && farmer.subscriptionEndsAt !== before)) {
    appendNotice(farmer, 'SUBSCRIPTION_RENEWED', { note: farmer.subscriptionEndsAt }, approvedAt)
  }
}

/**
 * The other half of paying first: the six months start at the visit. Called
 * by the verify route after it stamps `verifiedAt`. A farmer with no packs
 * is simply verified and pays when they choose; one already dated (a
 * re-verification can not happen, but a legacy row might carry a date) is
 * left alone. Returns whether a term started, so the route can say so.
 */
export function startTermOnVerify(farmer: Farmer, verifiedAt: string): boolean {
  if (!(farmer.packsApproved ?? 0) || farmer.subscriptionEndsAt) return false
  farmer.subscriptionEndsAt = addMonths(verifiedAt, SUBSCRIPTION_MONTHS)
  appendNotice(farmer, 'SUBSCRIPTION_RENEWED', { note: farmer.subscriptionEndsAt }, verifiedAt)
  return true
}

/**
 * Goodwill, a trainee batch, a demo account. Slots, in the farmer's own
 * unit (a pack is our word). A verified farmer with no term gets one to use
 * the slots in; a term is never extended - time is paid - and an unverified
 * farmer's term starts at verification like any pack's. Status is not touched.
 */
export function grantSlots(farmer: Farmer, packs: number, at = new Date().toISOString()): void {
  const granted = Math.max(1, Math.floor(packs))
  farmer.packsApproved = (farmer.packsApproved ?? 0) + granted
  if (farmer.verifiedAt && !farmer.subscriptionEndsAt) {
    farmer.subscriptionEndsAt = addMonths(at, SUBSCRIPTION_MONTHS)
  }
  appendNotice(farmer, 'SLOTS_GRANTED', { n: granted * PLAN.slotsPerPack }, at)
}

/**
 * Why packs cannot be taken back, or null. Counted by the same rule the
 * farmer's meter uses, so drafts hold nothing; refusing keeps an admin from
 * silently un-publishing live listings by mistyping a number.
 */
export function revokeProblem(
  farmer: Pick<Farmer, 'packsApproved'>,
  products: Pick<Product, 'status'>[],
  packs: number,
): { used: number; wouldLeave: number } | null {
  const used = countUsedSlots(products)
  const wouldLeave = Math.max(0, (farmer.packsApproved ?? 0) - Math.max(1, Math.floor(packs))) * PLAN.slotsPerPack
  return wouldLeave < used ? { used, wouldLeave } : null
}

/** After `revokeProblem` said null. The term is left alone: time was paid or granted, and with zero slots nothing is on sale anyway. */
export function revokeSlots(farmer: Farmer, packs: number, at = new Date().toISOString()): void {
  const taken = Math.max(1, Math.floor(packs))
  farmer.packsApproved = Math.max(0, (farmer.packsApproved ?? 0) - taken)
  appendNotice(farmer, 'SLOTS_REVOKED', { n: taken * PLAN.slotsPerPack }, at)
}

/** A rejection changes the payment and tells the farmer. Nothing on the account moves. */
export function rejectPayment(farmer: Farmer, payment: SubscriptionPayment, reason: string, by: string, at = new Date().toISOString()): void {
  payment.status = 'REJECTED'
  payment.rejectReason = reason
  payment.verifiedAt = at
  payment.verifiedBy = by
  appendNotice(farmer, 'PAYMENT_REJECTED', { note: reason }, at)
}

/**
 * Give every farmer who sold under the free rule a term, once, when this
 * ships. They were verified and had no packs and no date. Each gets packs
 * enough for what is already on sale (at least one) and six months from their
 * last approved payment or, failing that, their verification - never fewer
 * than RENEW_REMINDER_DAYS from today, so no shop closes the morning after a
 * deploy with no warning. Idempotent: a dated row is left alone, and so is an
 * unverified farmer, who pays when they choose.
 */
export function backfillSubscriptionTerms(db: Pick<Db, 'farmers' | 'products' | 'payments'>, now = new Date()): number {
  const floor = now.getTime() + RENEW_REMINDER_DAYS * 86_400_000
  let changed = 0
  for (const f of db.farmers) {
    if (f.subscriptionEndsAt || f.status === 'CLOSED' || !f.verifiedAt) continue
    if (!f.packsApproved) {
      const used = countUsedSlots(db.products.filter((p) => p.farmerId === f.id))
      f.packsApproved = Math.max(1, Math.ceil(used / PLAN.slotsPerPack))
    }
    const lastApproval = db.payments
      .filter((p) => p.farmerId === f.id && p.status === 'APPROVED' && p.verifiedAt)
      .map((p) => p.verifiedAt!)
      .sort()
      .pop()
    const ends = addMonths(lastApproval ?? f.verifiedAt, SUBSCRIPTION_MONTHS)
    f.subscriptionEndsAt = new Date(Math.max(Date.parse(ends), floor)).toISOString()
    changed++
  }
  return changed
}
```

  - `backend/src/db/seed.ts`: `Db` and `emptyDb`/`withDefaults` gain `payments: SubscriptionPayment[]` (doc: "The ₹50 ledger. Never seeded: an invented UTR is invented money."). The `shop` constant gains `packsApproved: 1, subscriptionEndsAt: addMonths(daysAgo(60), 6)` (import `addMonths` from `@shared/subscription.js`). `seed()` returns `payments: []`.
  - `backend/src/db/firestore.ts`: `'payments'` after `'orders'` in `COLLECTIONS` (backups follow automatically through `BACKED_UP`).
  - `backend/src/db/moderation.ts`: delete the `if (status === 'PENDING')` branch; docblock: "a waiting listing is a queue entry again and is left alone".
  - `backend/src/db/accountClose.ts`: restore `scrubPayment` and `publicIdFromUrl` from `git show 5a4fa96:backend/src/db/accountClose.ts` (rename fields; `CLOSED_SHOP_NAME` already exists) and the loop in `scrubFarmer` before `forgetSessions`.
  - `backend/src/index.ts`: after `normalizeLegacyRows`, `const terms = backfillSubscriptionTerms(getDb()); if (terms > 0) { console.log(\`[subscription] gave ${terms} farmer(s) a six-month term\`); save() }`.
  - `backend/src/routes/catalog.routes.ts`: `publiclyVisible(product, farmer: Pick<Farmer, 'status' | 'isOpen' | 'subscriptionEndsAt'>, now = Date.now())` → `product.status === 'LIVE' && canSellNow(farmer, now) && !!farmer.isOpen`; import from `@shared/subscription.js`. Same import swap in `orders.routes.ts`, `insights/price.ts`, `admin.routes.ts`.
  - `backend/src/routes/farmers.routes.ts`: register sets `packsApproved: 0`; `GET /me` answers `{ farmer, slots: slotInfo(farmer, products), subscription: subscriptionView(farmer) }`; port `GET /me/subscription` and `POST /me/subscription/payment` from `git show 5a4fa96:backend/src/routes/sellers.routes.ts` (the `/* Subscription */` block) with `sellerId`→`farmerId`, `womenBizId`→`farmerCode`, `newId('sp')`, and **delete** the `seller.status = 'PAYMENT_SUBMITTED'` line and its comment (the account carries no payment status). Imports: `ADMIN_PAYMENT_ACCOUNT, cloudinary, usingCloudinary` from `../config.js`, `screenshotProblem` from `../db/payments.js`, `normalizeUtr, paidAtProblem, utrProblem` from `@shared/payment.js`, `PLAN, slotInfo` from `@shared/farmer.js`, `type PaymentKind, payableKinds, paymentKindProblem, subscriptionView` from `@shared/subscription.js`. Place the block **above** `GET /:id` so `/me/subscription` is not swallowed by the param route.
  - `backend/src/routes/products.routes.ts`: imports `termOpen, subscriptionView` from `@shared/subscription.js` and `slotInfo` from `@shared/farmer.js` (no `canSellNow` here any more). `GET /mine` answers `{ products, slots, subscription }`; `DELETE /:id` answers `{ ok: true, slots }`. The verification refusal in `POST /` and in the `DRAFT → LIVE` branch of `PATCH` becomes `farmer.status !== 'ACTIVE'` (with `canSellNow` now including the term, keeping it would print "wait for verification" to a verified farmer whose term ran out). Then add, in both places (the `PATCH` branch counting `others = products of this farmer except current`):

```ts
const NO_TERM_MR = 'तुमची वर्गणी सुरू नाही. ₹50 भरून मंजुरी मिळाल्यावर उत्पादने पाठवता येतील.'
const SLOTS_FULL_MR = 'सर्व जागा भरल्या आहेत. आणखी 5 जागांसाठी ₹50 भरा.'
// ...
if (!asDraft && !termOpen(farmer)) { res.status(403).json({ error: 'No open subscription', messageMr: NO_TERM_MR }); return }
// THE SLOT GATE. The disabled button is a courtesy; this is the rule.
const slots = slotInfo(farmer, db.products.filter((p) => p.farmerId === farmerId))
if (!asDraft && slots.isFull) { res.status(402).json({ error: 'No slots left', messageMr: SLOTS_FULL_MR, slots }); return }
```

  - `backend/src/routes/admin.routes.ts`: stats gain the six counters (port the `approvedPayments` / `subscriptionsExpiring` / `subscriptionsExpired` / `pendingPayments` / `pendingProducts` / `subscriptionRevenue` / `approvedPaymentCount` lines from `git show 5a4fa96:backend/src/routes/admin.routes.ts`, keeping the current buyer-based `repurchaseRate`); port `GET /payments`, `POST /payments/:id/approve` (unchanged logic, `applyApprovedPayment`), `POST /payments/:id/reject` (calls `rejectPayment(farmer, payment, reason, verifierName(db, req))`); `GET /farmers` rows and `GET /farmers/:id` gain `slots`, `subscription` and (detail) `payments` sorted newest first. In `POST /farmers/:id/verify`, after `notifyFarmer(farmer, 'VERIFIED')`, add `startTermOnVerify(farmer, farmer.verifiedAt)` — the CLI's `verify` reaches the same route and needs nothing else. Port `POST /farmers/:id/grant-slots` and `POST /farmers/:id/revoke-slots` from the same `git show`, reduced to:

```ts
adminRouter.post('/farmers/:id/grant-slots', (req, res) => {
  const db = getDb()
  const farmer = db.farmers.find((s) => s.id === req.params.id)
  if (!farmer) { res.status(404).json({ error: 'Farmer not found', messageMr: 'हा शेतकरी सापडला नाही' }); return }
  grantSlots(farmer, Number(req.body?.packs ?? 1))   // status untouched: a gift is not a verification
  save()
  res.json({ farmer })
})

adminRouter.post('/farmers/:id/revoke-slots', (req, res) => {
  const db = getDb()
  const farmer = db.farmers.find((s) => s.id === req.params.id)
  if (!farmer) { res.status(404).json({ error: 'Farmer not found', messageMr: 'हा शेतकरी सापडला नाही' }); return }
  const packs = Number(req.body?.packs ?? 1)
  const problem = revokeProblem(farmer, db.products.filter((p) => p.farmerId === farmer.id), packs)
  if (problem) {
    res.status(409).json({
      error: `${problem.used} slots are in use; that would leave ${problem.wouldLeave}`,
      messageMr: `सध्या ${problem.used} जागा वापरात आहेत. इतक्या जागा काढता येणार नाहीत.`,
      ...problem,
    })
    return
  }
  revokeSlots(farmer, packs)
  save()
  res.json({ farmer })
})
```

  - `backend/scripts/admin.ts`: port `Payment` interface (renamed fields), `listPending`, `printPayments`, `stamp`, `approve` (with `--verified`), `reject`, `grant` (`/api/admin/farmers/:id/grant-slots`, matched by phone or farmer code), and the `pending`/`approve`/`reject`/`grant` cases from `git show 5a4fa96:backend/scripts/admin.ts`; keep `farmers`, `verify`, `set-password`. `verify` prints the term's end date when the answer carries `subscriptionEndsAt`. The `farmers` listing prints `slots.used/slots.total`. Header comment lists every command.
  - `backend/scripts/purge-demo-data.ts`: `doomedPayments = db.payments.filter((p) => seedFarmerIds.has(p.farmerId) || !db.farmers.some((f) => f.id === p.farmerId))`, shown, summed and filtered like the others.

- [ ] **Step 9: Run** the Step 3 command plus `tests/catalog-visibility.test.ts tests/trace.test.ts tests/map.test.ts tests/price-hint.test.ts` → PASS. Then `cd backend && npm test && npm run typecheck`.

- [ ] **Step 10: Frontend tests first.** In `frontend/tests/notifications.test.ts`: import `subscriptionFeed, visibleFeed`; change the `notif.verified` assertion to the new English (`'You are verified. With your subscription paid, your produce is on sale.'`); extend `kinds` to all ten; restore the reference's "a granted pack is a sentence with the number in it" test (`git show 5a4fa96:frontend/tests/notifications.test.ts`) asserting `labelKey === 'notif.adm.SLOTS_GRANTED'`, `vars` `{ n: 5 }` and the English `'You have been given 5 more product slots'`; add:

```ts
test('a renewal puts the new date in the sentence, not under it', () => {
  const [row] = adminFeed(farmer([
    { id: 'a2', at: '2026-09-08T10:00:00.000Z', kind: 'SUBSCRIPTION_RENEWED', note: '2027-03-15T06:30:00.000Z' },
  ]))
  assert.equal(row?.labelKey, 'notif.adm.SUBSCRIPTION_RENEWED')
  assert.deepEqual(row?.vars, { date: '15 Mar 2027' })
  assert.equal(row?.reason, undefined, 'the ISO date is not printed raw as a reason')
})

test('the reminder week is one row timed from its start; a paused shop stands until renewed', () => {
  const end = '2027-03-15T06:30:00.000Z'
  const remindFrom = '2027-03-08T06:30:00.000Z'
  const expiring = subscriptionFeed({ state: 'expiring', endsAt: end, daysLeft: 3, remindFrom })
  assert.equal(expiring.length, 1)
  assert.equal(expiring[0]!.at, remindFrom)
  assert.equal(expiring[0]!.to, '/farmer/subscription')

  const expired = subscriptionFeed({ state: 'expired', endsAt: end, daysLeft: 0, remindFrom })
  assert.equal(expired[0]!.standing, true)
  assert.equal(visibleFeed(expired, '', Date.parse(end) + 400 * 86_400_000).length, 1, 'a year later it is still true')
  assert.deepEqual(subscriptionFeed({ state: 'active', endsAt: end }), [])
  assert.deepEqual(subscriptionFeed(undefined), [])
})
```

  (Rename the fixture helper `seller` → `farmer` if it still carries the old name.) Run `cd frontend && node --import tsx --test tests/notifications.test.ts` → FAIL.

- [ ] **Step 11: `frontend/src/lib/notifications.ts`.** `ADMIN_NOTICE_PATH` adds `SLOTS_GRANTED: '/farmer/products'`, `SLOTS_REVOKED: '/farmer/subscription'`, `PAYMENT_APPROVED: '/farmer/products'`, `PAYMENT_REJECTED: '/farmer/subscription'`, `PRODUCT_APPROVED: '/farmer/products'`, `SUBSCRIPTION_RENEWED: '/farmer'`; `adminFeed` regains the `SUBSCRIPTION_RENEWED` branch (`vars: { date: shortDate(n.note) }`, `who: ''`); restore `subscriptionFeed` from `git show 5a4fa96:frontend/src/lib/notifications.ts` (`/seller/` → `/farmer/`, `SubscriptionView` type import). `NotificationBell.tsx` and `Notifications.tsx` merge `subscriptionFeed(me?.subscription)` beside `adminFeed(me?.farmer)`.

- [ ] **Step 12: `frontend/src/lib/api.ts`.** `me()` → `{ farmer: Farmer; slots: SlotInfo; subscription: SubscriptionView }`; `myProducts()` → `{ products; slots; subscription }`; `deleteProduct(id)` → `{ ok: true; slots: SlotInfo }` (doc: "drafts only - the server refuses a submitted listing" lands in Task 2); add `subscription()` and `submitPayment(kind, utr, paidAt, screenshotUrl?)` from `git show 5a4fa96:frontend/src/lib/api.ts` with `/sellers/` → `/farmers/` and `status: Farmer['status']` dropped from `submitPayment`'s answer (`{ payment }`). Type imports: `AdminPaymentAccount, SubscriptionPayment` from types, `SlotInfo` from `@shared/farmer.js`, `PaymentKind, SubscriptionView` from `@shared/subscription.js`.

- [ ] **Step 13: Farmer screens.**
  - `components/SubscriptionNotice.tsx`: port `git show 5a4fa96:frontend/src/components/SubscriptionNotice.tsx` (`/seller/` → `/farmer/`, "HER" → "THE FARMER'S").
  - `screens/farmer/Subscription.tsx`: port `git show 5a4fa96:frontend/src/screens/seller/Subscription.tsx`. Deltas: `/seller/…` → `/farmer/…`; `buildUpiLink` from `@shared/farmer.js`; UPI `note: renewing ? 'Shetkari Bazar renewal' : 'Shetkari Bazar subscription'` (never the old brand); `backTo="/farmer"`; in `PaymentWaiting` the "approved" branch's `(!latest && data.status === 'ACTIVE')` becomes `(!latest && data.subscription.state !== 'none')` — `ACTIVE` means verified now, not paid — and that branch shows `<Notice tone="info">{t('sub.startsOnVerify')}</Notice>` under `wait.approvedSub` when `data.status !== 'ACTIVE'`, because a farmer who paid first has slots and no running clock; comments gender-neutral. Everything it imports exists (`QrCode`, `PhotoPicker kind="payment"`, `PaySteps screenshot`, `CopyValue onCopied`, `useReturnFromApp`, `shortDate`, `Rupees`, `Field`, `TextInput`, `Notice`, icons `IconAllClear/IconCheck/IconTraining/IconWaiting/IconWarn/IconWhatsapp`).
  - `App.tsx`: `<Route path="/farmer/waiting" element={<Require role="farmer"><PaymentWaiting /></Require>} />` outside the layout, and `<Route path="subscription" element={<Subscription />} />` inside `/farmer`.
  - `components/ui.tsx`: restore `SlotMeter` (`git show 78d261f -- frontend/src/components/ui.tsx`); `styles/theme.css`: restore the `.slotmeter` block (uses `--gold`, `--bg-2`, `--line`, all present in both palettes — no new hex).
  - `MyBusiness.tsx`: `const slots = me.slots` (from `/farmers/me`; nothing is recomputed on the phone); `<SubscriptionNotice view={me.subscription} />` under the status notices; when `me.subscription.state === 'none'` and the farmer is not blocked/closed: with `slots.total === 0` a `Notice tone="warn" title={t('sub.noneTitle')}` with `sub.noneBody` and a `reg.payNow` button to `/farmer/subscription`; with `slots.total > 0` (paid before the visit) a `Notice tone="info">{t('sub.startsOnVerify')}</Notice>` instead — the six months start when the farmer is verified, and asking for another ₹50 would be wrong; the expired shop-card variant (`sub.shopPaused` / `sub.shopPausedHint`, no toggle); the `SlotMeter` card `data-wt="biz-slots"` with `SubscriptionLine`, `biz.oneSlotLeft`, and the `biz.addSlots` button when `!expired && (slots.isFull || slots.total === 0)` — all from `git show 5a4fa96:frontend/src/screens/seller/MyBusiness.tsx`.
  - `MyProducts.tsx`: `SubscriptionNotice`, `SlotMeter` card, the `expired && p.status === 'LIVE'` pill (`sub.pausedPill`), `doDelete` takes `slots` from the answer, Add button `disabled={slots.isFull}` with the `prod.slotsFullTitle/Body` notice.
  - `UploadProduct.tsx`: stop importing `canSellNow`. Gates, in order, after `me` loads: `farmer.status !== 'ACTIVE'` → existing blocked/pending notice; `me.subscription.state === 'none' || 'expired'` → `EmptyState icon={IconLock} title={t('sub.uploadBlocked')} body={t('sub.uploadBlockedSub')}` with a button `t(state === 'none' ? 'reg.payNow' : 'sub.renewButton')` → `/farmer/subscription`; `me.slots.isFull` → `prod.slotsFullTitle/Body` with `prof.buyMore` and `biz.myProducts` buttons. Review step: replace the `prod.liveNow` notice with `<Notice tone="ok" title={t('prod.publish')}>{t('prod.willUseSlot', { used: me.slots.used + 1, total: me.slots.total })}</Notice>` (the "an admin checks first" sentence and the button label change in Task 2).
  - `Misc.tsx` (`FarmerProfile`): the `SlotMeter` card `data-wt="prof-slots"` with `prof.slotsHave` and `prof.buyMore` when `slots.left === 0`, reading `me.slots` rather than the old client-side `slotInfo(...)` (`git show 5a4fa96:frontend/src/screens/seller/Misc.tsx`); `FarmerHelp` FAQ regains `help.faq1`.
  - `FarmerRegister.tsx` done screen: under the pending-verification notice, `<p className="small muted">{t('reg.doneNext')}</p>` and `<Button variant="ghost" onClick={() => nav('/farmer/subscription', { replace: true })}>{t('reg.payNow')}</Button>`.
  - `lib/tours.ts`: `farmer.business` regains `{ sel: '[data-wt="biz-slots"]', title: 'prof.subscription', body: 'wt.biz2' }` after the shop step; `farmer.profile` regains `{ sel: '[data-wt="prof-slots"]', title: 'prof.subscription', body: 'wt.pr1' }` first.

- [ ] **Step 14: Frontend strings** (`src/i18n/strings.ts`). Change: `ok.draftRemoved` → mr `'अपूर्ण उत्पादन काढून टाकले'` / en `'Draft removed'`; `prod.deleteDraftConfirm` → mr `'हे अपूर्ण उत्पादन अजून पाठवलेले नाही, त्यामुळे त्याला जागा लागत नाही. काढले तर भरलेली माहिती परत मिळणार नाही.'` / en `'This draft was never sent in, so it holds no slot. Removing it throws away what you filled in.'`; `close.sel.whatGoes` → mr `'तुमची {n} उत्पादने आणि तुमच्या दुकानाची माहिती काढली जाईल. भरलेले ₹50 परत मिळत नाहीत.'` / en `'Your {n} listing(s) and everything about your shop. The ₹50 you paid is not returned.'`; `notif.verified` → mr `'तुमची तपासणी झाली. वर्गणी भरलेली असल्यास तुमचा माल ग्राहकांना दिसेल.'` / en `'You are verified. With your subscription paid, your produce is on sale.'`. Remove `prod.liveNow` from both. Add (mr, then en):

```ts
  // ---- ₹50: वर्गणी (feminine: वर्गणी संपली) and जागा (feminine: जागा भरल्या) ----
  'pay.title': 'वर्गणी भरणा',
  'pay.what': 'या 50 रुपयांत तुम्ही 5 उत्पादने विक्रीसाठी टाकू शकता. दुकान सुरू ठेवण्यासाठी दर 6 महिन्यांनी ₹50 भरून नूतनीकरण करावे लागते.',
  'pay.payTo': 'या खात्यावर पैसे पाठवा', 'pay.scanQr': 'QR स्कॅन करा',
  'pay.afterPaying': 'पैसे पाठवल्यावर खालील माहिती भरा', 'pay.payeeName': 'कोणाला पैसे जातात',
  'pay.screenshot': 'पेमेंटचा स्क्रीनशॉट', 'pay.submit': 'माहिती पाठवा',
  'pay.screenshotHint': 'त्यात ₹50, 12 अंकी UTR, तारीख आणि वेळ दिसायला हवी. त्याशिवाय भरणा मंजूर होत नाही.',
  'pay.needScreenshot': 'माहिती पाठवण्याआधी पेमेंटचा स्क्रीनशॉट जोडा.',
  'pay.paidAt': 'पैसे कधी भरले?', 'pay.paidAtHint': 'UPI ॲपमधल्या स्क्रीनशॉटवर जी तारीख आणि वेळ आहे ती निवडा.',
  'pay.notNeeded': 'आत्ता पैसे भरण्याची गरज नाही',
  'pay.notNeededSub': 'तुमच्याकडे अजून {n} जागा शिल्लक आहेत. त्या भरल्यावर ₹50 भरून आणखी 5 जागा घ्या.',
  'pay.renewTitle': 'वर्गणीचे नूतनीकरण',
  'pay.renewWhat': 'हे ₹50 भरल्यावर तुमचे दुकान पुढचे {n} महिने सुरू राहील. तुमची उत्पादने आणि जागा बदलणार नाहीत.',
  'ok.paymentSubmitted': 'भरण्याची माहिती पाठवली',
  'wait.title': 'तुमचे पेमेंट मिळाले आहे', 'wait.sub': 'प्रशासकाच्या मंजुरीची वाट पहा',
  'wait.eta': 'साधारण 24 तासांत मंजूर होईल', 'wait.youSent': 'तुम्ही पाठवलेली माहिती',
  'wait.watchTraining': 'प्रशिक्षण पहा', 'wait.contactHelp': 'मदत',
  'wait.canDoMeanwhile': 'तोपर्यंत तुम्ही तुमचे दुकान तयार करू शकता आणि प्रशिक्षण पाहू शकता.',
  'wait.approved': 'अभिनंदन! तुमचा भरणा मंजूर झाला', 'wait.approvedSub': 'आता तुम्ही 5 उत्पादने टाकू शकता',
  'wait.addFirst': 'पहिले उत्पादन टाका', 'wait.rejected': 'पेमेंट मंजूर झाले नाही', 'wait.resubmit': 'पुन्हा माहिती पाठवा',
  'wait.renewed': 'नूतनीकरण मंजूर झाले!', 'wait.renewedSub': 'तुमचे दुकान पुन्हा सुरू झाले आहे आणि {date} पर्यंत सुरू राहील.',
  'sub.noneTitle': 'वर्गणी अजून भरलेली नाही',
  'sub.noneBody': '₹50 भरून 5 उत्पादनांची जागा घ्या. मंजुरी आणि तपासणी झाल्यावर तुमचा माल ग्राहकांना दिसेल.',
  'sub.startsOnVerify': 'तुमच्या जागा तयार आहेत. तुमचे 6 महिने तपासणी झाल्यावर सुरू होतील, म्हणजे वाट पाहण्याचे दिवस वाया जाणार नाहीत.',
  'sub.expiredTitle': 'तुमची वर्गणी संपली आहे — दुकान बंद आहे',
  'sub.expiredBody': '{date} रोजी 6 महिने पूर्ण झाले. सध्या ग्राहकांना तुमची उत्पादने दिसत नाहीत आणि नवीन ऑर्डर येणार नाहीत. ₹50 भरून नूतनीकरण करा. मंजुरी मिळताच तुमचे दुकान सर्व उत्पादनांसह आणि जागांसह पूर्वीसारखे सुरू होईल.',
  'sub.expiringTitle': '{n} दिवसांत तुमची वर्गणी संपेल', 'sub.expiringTitleOne': '1 दिवसात तुमची वर्गणी संपेल',
  'sub.expiringBody': '{date} रोजी तुमचे दुकान बंद होईल आणि उत्पादने ग्राहकांना दिसणार नाहीत. आत्ताच ₹50 भरून नूतनीकरण केल्यास उरलेले दिवस वाया जाणार नाहीत.',
  'sub.renewButton': '₹50 भरून नूतनीकरण करा', 'sub.validUntil': 'वर्गणी {date} पर्यंत सुरू आहे',
  'sub.pausedPill': 'वर्गणीमुळे थांबवले', 'sub.shopPaused': 'दुकान बंद आहे — वर्गणी संपली',
  'sub.shopPausedHint': 'नूतनीकरणाला मंजुरी मिळताच दुकान आपोआप सुरू होईल.',
  'sub.uploadBlocked': 'आत्ता नवीन उत्पादन पाठवता येणार नाही',
  'sub.uploadBlockedSub': 'तुमची वर्गणी सुरू नाही. ₹50 भरून मंजुरी मिळाल्यावर उत्पादने पाठवता येतील. तोपर्यंत तुमची आधीची उत्पादने जपून ठेवली आहेत.',
  'biz.slotsLeft': 'आणखी {n} उत्पादने टाकू शकता', 'biz.slotsFull': 'सर्व जागा भरल्या आहेत',
  'biz.addSlots': 'जागा वाढवा', 'biz.oneSlotLeft': 'फक्त एक जागा शिल्लक आहे',
  'prod.publish': 'तपासणीसाठी पाठवा',
  'prod.willUseSlot': 'हे पाठवल्यावर {used} / {total} जागा वापरल्या जातील.',
  'prod.pending': 'तपासणी सुरू',
  'prod.slotsFullTitle': 'सर्व जागा भरल्या आहेत', 'prod.slotsFullBody': 'आणखी उत्पादने टाकण्यासाठी ₹50 भरा आणि आणखी 5 जागा मिळवा.',
  'prof.subscription': 'माझी वर्गणी', 'prof.slotsHave': 'तुमच्याकडे {total} जागा आहेत, {used} वापरल्या',
  'prof.buyMore': 'आणखी 5 जागा - ₹50',
  'reg.doneNext': 'आता ₹50 भरून 5 उत्पादनांची जागा घ्या. तपासणी झाल्यावर तुमचा माल ग्राहकांना दिसेल.', 'reg.payNow': '₹50 भरा',
  'wt.biz2': 'एका जागेत एक उत्पादन. जागा संपल्या तर ₹50 भरून आणखी 5 जागा घ्या.',
  'wt.pr1': 'तुमच्याकडे किती जागा आहेत ते इथे दिसते. आणखी हव्या असतील तर इथून घ्या.',
  'help.faq1': 'मी ₹50 भरले पण मंजूर झाले नाही',
  /* What the office did to the account. Slots, not packs - a pack is our word. */
  'notif.adm.SLOTS_GRANTED': 'तुम्हाला {n} नवीन जागा मिळाल्या आहेत',
  'notif.adm.SLOTS_REVOKED': 'तुमच्या {n} जागा काढून घेतल्या आहेत',
  'notif.adm.PAYMENT_APPROVED': 'तुमचा ₹50 चा भरणा मंजूर झाला — {n} जागा मिळाल्या',
  'notif.adm.PAYMENT_REJECTED': 'तुमचा भरणा तपासणीत जुळला नाही',
  'notif.adm.PRODUCT_APPROVED': 'तुमचे उत्पादन मंजूर झाले आणि आता दिसत आहे',
  // Also the first term starting at verification, so it does not say "renewal".
  'notif.adm.SUBSCRIPTION_RENEWED': 'तुमची वर्गणी सुरू आहे — तुमचे दुकान {date} पर्यंत सुरू राहील',
  'notif.sub.expiring': '{date} रोजी तुमची वर्गणी संपेल — ₹50 भरून नूतनीकरण करा',
  'notif.sub.expired': 'तुमची वर्गणी संपली, दुकान बंद आहे — ₹50 भरून नूतनीकरण करा',
```

```ts
  'pay.title': 'Subscription payment',
  'pay.what': 'This 50 rupees lets you list 5 products. To keep your shop open, renew for ₹50 every 6 months.',
  'pay.payTo': 'Send the money to this account', 'pay.scanQr': 'Scan this QR',
  'pay.afterPaying': 'After paying, fill this in', 'pay.payeeName': 'Paying to',
  'pay.screenshot': 'Payment screenshot', 'pay.submit': 'Send details',
  'pay.screenshotHint': 'It must show ₹50, the 12-digit UTR, the date and the time. Without it the payment cannot be approved.',
  'pay.needScreenshot': 'Add the payment screenshot before sending.',
  'pay.paidAt': 'When did you pay?', 'pay.paidAtHint': 'Pick the date and time shown on your UPI app screenshot.',
  'pay.notNeeded': 'Nothing to pay right now',
  'pay.notNeededSub': 'You still have {n} free slots. Pay ₹50 for 5 more once they are full.',
  'pay.renewTitle': 'Renew subscription',
  'pay.renewWhat': 'This ₹50 keeps your shop open for the next {n} months. Your products and slots stay exactly as they are.',
  'ok.paymentSubmitted': 'Payment details sent',
  'wait.title': 'We have received your payment', 'wait.sub': 'Please wait for admin approval',
  'wait.eta': 'Usually approved within 24 hours', 'wait.youSent': 'What you sent us',
  'wait.watchTraining': 'Watch training', 'wait.contactHelp': 'Help',
  'wait.canDoMeanwhile': 'Meanwhile you can set up your shop and watch the training videos.',
  'wait.approved': 'Congratulations! Your payment is approved', 'wait.approvedSub': 'You can now add 5 products',
  'wait.addFirst': 'Add your first product', 'wait.rejected': 'Payment was not approved', 'wait.resubmit': 'Send details again',
  'wait.renewed': 'Renewal approved!', 'wait.renewedSub': 'Your shop is open again, until {date}.',
  'sub.noneTitle': 'No subscription yet',
  'sub.noneBody': 'Pay ₹50 for 5 product slots. Once the payment is approved and you are verified, your produce goes on sale.',
  'sub.startsOnVerify': 'Your slots are ready. Your 6 months start when you are verified, so the days you wait are not lost.',
  'sub.expiredTitle': 'Your subscription has ended - your shop is closed',
  'sub.expiredBody': "Your 6 months ended on {date}. Customers can't see your products and no new orders can come in. Renew for ₹50 - once it's approved, your shop reopens exactly as it was, with all your products and slots.",
  'sub.expiringTitle': 'Your subscription ends in {n} days', 'sub.expiringTitleOne': 'Your subscription ends within a day',
  'sub.expiringBody': "On {date} your shop will close and customers won't see your products. Renew now for ₹50 and you won't lose the days you have left.",
  'sub.renewButton': 'Renew for ₹50', 'sub.validUntil': 'Subscription active until {date}',
  'sub.pausedPill': 'Paused: subscription ended', 'sub.shopPaused': 'Shop closed - subscription ended',
  'sub.shopPausedHint': 'It reopens by itself once your renewal is approved.',
  'sub.uploadBlocked': "You can't send in a new product right now",
  'sub.uploadBlockedSub': 'Your subscription is not active. You can send products once your payment is approved. Your existing products are kept safe until then.',
  'biz.slotsLeft': 'You can add {n} more', 'biz.slotsFull': 'All slots are full',
  'biz.addSlots': 'Add more slots', 'biz.oneSlotLeft': 'Only one slot left',
  'prod.publish': 'Send for checking',
  'prod.willUseSlot': 'Sending this uses {used} of {total} slots.',
  'prod.pending': 'Being checked',
  'prod.slotsFullTitle': 'All slots are full', 'prod.slotsFullBody': 'Pay ₹50 for 5 more slots.',
  'prof.subscription': 'My subscription', 'prof.slotsHave': 'You have {total} slots, {used} used',
  'prof.buyMore': '5 more slots - ₹50',
  'reg.doneNext': 'Now pay ₹50 for 5 product slots. Once you are verified your produce goes on sale.', 'reg.payNow': 'Pay ₹50',
  'wt.biz2': 'One slot holds one product. Out of slots? Pay ₹50 for 5 more.',
  'wt.pr1': 'How many product slots you hold. Buy more from here.',
  'help.faq1': 'I paid the ₹50 but it is not approved yet',
  'notif.adm.SLOTS_GRANTED': 'You have been given {n} more product slots',
  'notif.adm.SLOTS_REVOKED': '{n} product slots were taken back',
  'notif.adm.PAYMENT_APPROVED': 'Your ₹50 payment was approved - {n} slots added',
  'notif.adm.PAYMENT_REJECTED': 'Your payment could not be matched',
  'notif.adm.PRODUCT_APPROVED': 'Your product was approved and is live',
  'notif.adm.SUBSCRIPTION_RENEWED': 'Your subscription is active - your shop is open until {date}',
  'notif.sub.expiring': 'Your subscription ends on {date} - renew for ₹50',
  'notif.sub.expired': 'Your subscription has ended and your shop is closed - renew for ₹50',
```

  Then `cd frontend && npm test && npm run typecheck` → PASS (i18n parity, Marathi rules, every `t()` key, notifications).

- [ ] **Step 15: Admin tests first.** `admin/tests/sort.test.ts`: restore the `PAYMENT_SORTS` import, its place in the "every list" loop and the "oldest first puts the longest wait at the top" test (`git show 5a4fa96:admin/tests/sort.test.ts`, fixture rows as `SubscriptionPayment[]`). `admin/tests/format.test.ts`: add `test('dateOnly keeps the year, in IST', () => assert.equal(dateOnly('2027-03-14T19:00:00.000Z'), '15 Mar 2027'))`. `admin/tests/i18n.test.ts`: the `nt.*` loop lists all ten kinds. Run `cd admin && npm test` → FAIL.

- [ ] **Step 16: Admin implementation.**
  - `lib/api.ts`: `PaymentRow = SubscriptionPayment`; `FarmerRow` gains `slots: SlotInfo; subscription?: SubscriptionView`; `FarmerDetail` gains `payments: SubscriptionPayment[]`; add `payments(status = 'PENDING')`, `approvePayment(id, checks)`, `rejectPayment(id, reason)`, `grantSlots(id, packs)`, `revokeSlots(id, packs)` (`git show 5a4fa96:admin/src/lib/api.ts`, `seller` → `farmer`); `stats()` doc lists the new counters.
  - `components/Confirm.tsx`: restore `PackPicker` (`git show 78d261f -- admin/src/components/Confirm.tsx`); `styles/admin.css`: restore `.packbtn*` with `color: #fff` → `var(--on-dark)`.
  - `components/FarmerActions.tsx`: port the grant and revoke buttons and their two `Confirm`s from `git show 5a4fa96:admin/src/components/SellerActions.tsx` (`Action = 'grant' | 'revoke' | 'block' | null`, `packs` state, `PackPicker`, `PLAN.slotsPerPack`, `used = farmer.slots?.used ?? 0`, the revoke title/description switching on `farmer.packsApproved`); `api.grantSlots` / `api.revokeSlots`; the Confirm stays open on the 409 so the server's "in use" sentence is read where it applies. Gender-neutral throughout.
  - `lib/format.ts`: restore `dateOnly` (`git show 5a4fa96:admin/src/lib/format.ts`). Keep the current `waited()`.
  - `lib/sort.ts`: restore `PAYMENT_SORTS` with `p.farmerName` and label keys `sort.farmerAZ` / `sort.farmerZA`. No `packsHigh`.
  - `components/Subscription.tsx`: port `git show 5a4fa96:admin/src/components/Subscription.tsx` (comment "HER" → "THE FARMER'S").
  - `screens/Payments.tsx`: port `git show 5a4fa96:admin/src/screens/Payments.tsx`. Deltas: `payment.farmerName`, `payment.farmerCode`; delete `WAIT_UNIT_KEY`; the wait pill reads `<Pill tone={w.unit === 'day' ? 'danger' : 'warn'}>{t(\`pwr.wait.${w.unit}\`, { n: w.n })}</Pill>` using the current `waited()` (`{ n, unit }`); docblock gender-neutral.
  - `styles/admin.css`: restore `.dlg--wide`, `.shotthumb*`, `.payfacts`, `.verify*`, `.shotview*` from `git show 78d261f -- admin/src/styles/admin.css` (no `.packbtn`). `frontend/tests/palette.test.ts` fails on any hex outside the two palette blocks, so the caption's `color: #fff` becomes `color: var(--on-dark)` and `.shotview__img img { background: #fff }` becomes `var(--surface)`; the `rgba(0, 0, 0, 0.6)` backdrop is not hex and stays. Run `cd frontend && node --import tsx --test tests/palette.test.ts` to confirm.
  - `App.tsx`: `<Route path="/payments" element={<Payments />} />`. `Shell.tsx`: `{ to: '/payments', icon: IconPayments, label: t('nav.payments'), badge: s?.pendingPayments }` after Today; Products badge `s?.pendingProducts`.
  - `Home.tsx`: queue = `pendingPayments + pendingProducts + pendingVerification + stuckOrders + openPasswordRequests`; tiles for payments (`today.pendingPayments` → `/payments`) and products (`today.pendingProducts` → `/products`) first; a Payments section card; health gains `subscriptionsExpiring` / `subscriptionsExpired` minis. `Today.tsx`: same two tiles; health gains `today.income` (`rupees(s.subscriptionRevenue)`) and `today.paymentsApproved`.
  - `Farmers.tsx`: the status `<select>` offers `''`, `waiting`, `expiring`, `expired`, `none`; filter: `waiting` → `PENDING_VERIFICATION`, otherwise `s.subscription?.state === value && s.status !== 'CLOSED'`. Row: `{farmer.verifiedAt && <SubscriptionPill view={farmer.subscription} />}` beside the status pill and `{t('se.slots')}: used/total` in the meta line.
  - `FarmerDetail.tsx`: `SubscriptionPill` in `Identity` when `farmer.verifiedAt`; a slots `Tile` first in `Numbers`; `Decisions` takes `payments` and regains the payments list and the `SUBSCRIPTION_RENEWED` → `pay.termUntil` rendering (`git show 5a4fa96:admin/src/screens/SellerDetail.tsx`).

- [ ] **Step 17: Admin strings** (`src/i18n/strings.ts`). Change `home.sectionProducts` → mr `'नवीन उत्पादने तपासून प्रकाशित करा; तक्रार आलेला माल काढा'` / en `'Review new listings, publish them, take down reported ones'`; `sel.verifyConsequence` → mr `'शेतकरी तपासलेले म्हणून नोंदले जातील. वर्गणी सुरू असेल तर त्यांचा प्रकाशित माल ग्राहकांना दिसेल.'` / en `'Marks the farmer as verified. Their published listings go on sale as long as the subscription is paid.'`. Add (mr, then en):

```ts
  'nav.payments': 'पैसे भरणा',
  'home.sectionPayments': 'शेतकऱ्यांचे ₹50 चे भरणे तपासा आणि मंजूर करा',
  'today.pendingPayments': 'पैसे भरणा प्रलंबित', 'today.pendingProducts': 'उत्पादने तपासायची',
  'today.income': 'वर्गणीतून मिळकत', 'today.paymentsApproved': 'मंजूर भरणे',
  'today.subsExpiring': 'या आठवड्यात वर्गणी संपणारे', 'today.subsExpired': 'वर्गणी संपलेले शेतकरी',
  'ok.paymentApproved': 'भरणा मंजूर झाला. शेतकऱ्याला 5 जागा मिळाल्या.',
  'ok.paymentRejected': 'भरणा नाकारला. शेतकऱ्याला कारण कळवले जाईल.',
  'pay.title': 'पैसे भरणा', 'pay.pending': 'प्रलंबित', 'pay.approved': 'मंजूर', 'pay.rejected': 'नाकारले', 'pay.all': 'सर्व',
  'pay.utr': 'UTR क्रमांक', 'pay.payerUpi': 'भरणा केलेला UPI', 'pay.screenshot': 'भरण्याचा स्क्रीनशॉट',
  'pay.submitted': 'पाठवल्याची वेळ', 'pay.amount': 'रक्कम', 'pay.paidAt': 'शेतकऱ्याने सांगितलेली भरण्याची वेळ',
  'pay.approve': 'मंजूर करा', 'pay.reject': 'नाकारा', 'pay.rejectConfirm': 'नाकारा',
  'pay.approveNote': 'मंजूर केल्यावर शेतकऱ्याला 5 जागा मिळतील आणि ते विक्री सुरू करू शकतील.',
  'pay.approveNoteRenewal': 'मंजूर केल्यावर त्यांचे दुकान पुढचे 6 महिने सुरू राहील. त्यांच्या जागा आणि उत्पादने बदलणार नाहीत.',
  'pay.rejectReason': 'नाकारण्याचे कारण', 'pay.rejectReasonHint': 'हे शेतकऱ्याला दिसेल. त्यांना समजेल असे लिहा.',
  'pay.empty': 'प्रलंबित भरणा नाही', 'pay.emptySub': 'नवीन भरणा आल्यावर इथे दिसेल.',
  'pay.verifiedBy': 'तपासले', 'pay.viewScreenshot': 'स्क्रीनशॉट मोठा पहा', 'pay.noScreenshot': 'स्क्रीनशॉट नाही',
  'pay.noPaidAt': 'भरण्याची वेळ दिलेली नाही', 'pay.paidLongBefore': 'पाठवण्याच्या 24 तासांपेक्षा आधी भरलेले',
  'pay.verifyTitle': 'मंजूर करण्याआधी स्क्रीनशॉटशी जुळवा:',
  'pay.checkUtr': 'स्क्रीनशॉटमधील UTR {utr} हाच आहे',
  'pay.checkTime': 'स्क्रीनशॉटमधील तारीख आणि वेळ {at} शी जुळते',
  'pay.checkReceived': '{amount} आपल्या खात्यात खरोखर जमा झाले आहेत (बँक स्टेटमेंट पाहिले)',
  'pay.verifyFirst': 'तिन्ही गोष्टी तपासल्यावरच मंजूर करता येईल',
  'pay.viewerHint': 'स्क्रीनशॉटमधील UTR, तारीख-वेळ आणि रक्कम डावीकडच्या आकड्यांशी जुळवा. जुळत नसेल तर कारण लिहून नाकारा.',
  'pay.duplicate': 'तोच UTR पुन्हा',
  'pay.duplicateNote': 'हाच क्रमांक आधीही वापरला गेला आहे. दुसऱ्यांदा मंजूर केल्यास त्यांना विनाकारण दुप्पट जागा मिळतील.',
  'pay.kind.PACK': 'नवीन पॅक', 'pay.kind.RENEWAL': 'नूतनीकरण', 'pay.termUntil': '{date} पर्यंत दुकान सुरू',
  'sd.payments': 'भरणा', 'sd.noPayments': 'अजून एकही भरणा आलेला नाही.', 'se.slots': 'जागा', 'se.packs': 'पॅक',
  'se.subExpiring': '7 दिवसांत वर्गणी संपणारे', 'se.subExpired': 'वर्गणी संपलेले', 'se.subNone': 'वर्गणी न भरलेले',
  'se.grantSlots': 'जागा द्या', 'se.grantSlotsHint': 'सद्भावना, प्रशिक्षण गट किंवा डेमो खात्यासाठी.',
  'se.grantTitle': 'जागा द्यायच्या?',
  'se.grantDesc': '{n} पॅक दिल्यास शेतकऱ्याला {slots} जागा मिळतील, म्हणजे ते आणखी {slots} उत्पादने पाठवू शकतील. पैसे न भरताच या जागा मिळतील. तपासणी झालेली असेल आणि वर्गणी सुरू नसेल तर आजपासून 6 महिन्यांची मुदत सुरू होईल; सुरू असलेली मुदत वाढणार नाही.',
  'se.grantConfirm': 'हो, जागा द्या',
  'se.revoke': 'जागा काढा', 'se.revokeTitle': 'जागा काढून घ्यायच्या?',
  'se.revokeDesc': '{n} पॅक काढल्यास {slots} जागा कमी होतील. सध्या {used} जागा वापरात आहेत. वापरात असलेल्या जागांपेक्षा कमी करता येणार नाही.',
  'se.revokeConfirm': 'हो, जागा काढा',
  'se.revokeNoneTitle': 'काढण्यासाठी जागा नाहीत', 'se.revokeNoneDesc': 'या शेतकऱ्याकडे एकही मंजूर पॅक नाही.',
  'sub.none': 'वर्गणी सुरू नाही', 'sub.activeUntil': 'वर्गणी {date} पर्यंत',
  'sub.expiring': '{n} दिवसांत संपते · {date}', 'sub.expiringOne': '1 दिवसात संपते · {date}', 'sub.expiredSince': 'वर्गणी संपली · {date}',
  'nt.SLOTS_GRANTED': 'जागा दिल्या', 'nt.SLOTS_REVOKED': 'जागा काढल्या',
  'nt.PAYMENT_APPROVED': 'भरणा मंजूर', 'nt.PAYMENT_REJECTED': 'भरणा नाकारला',
  'nt.PRODUCT_APPROVED': 'उत्पादन प्रकाशित', 'nt.SUBSCRIPTION_RENEWED': 'वर्गणीची मुदत',
  'sort.farmerAZ': 'शेतकऱ्याच्या नावानुसार (A → Z)', 'sort.farmerZA': 'शेतकऱ्याच्या नावानुसार (Z → A)',
```

```ts
  'nav.payments': 'Payments',
  'home.sectionPayments': 'Check and approve the ₹50 subscription payments',
  'today.pendingPayments': 'Payments waiting', 'today.pendingProducts': 'Products to review',
  'today.income': 'Subscription income', 'today.paymentsApproved': 'Payments approved',
  'today.subsExpiring': 'Subscriptions ending this week', 'today.subsExpired': 'Farmers with expired subscriptions',
  'ok.paymentApproved': 'Payment approved. The farmer now has 5 more slots.',
  'ok.paymentRejected': 'Payment rejected. The farmer will be told why.',
  'pay.title': 'Payments', 'pay.pending': 'Pending', 'pay.approved': 'Approved', 'pay.rejected': 'Rejected', 'pay.all': 'All',
  'pay.utr': 'UTR reference', 'pay.payerUpi': 'Paid from UPI', 'pay.screenshot': 'Payment screenshot',
  'pay.submitted': 'Submitted', 'pay.amount': 'Amount', 'pay.paidAt': 'Paid at (as stated by the farmer)',
  'pay.approve': 'Approve', 'pay.reject': 'Reject', 'pay.rejectConfirm': 'Reject',
  'pay.approveNote': 'Approving gives the farmer 5 slots and lets them start selling.',
  'pay.approveNoteRenewal': 'Approving keeps the shop open for another 6 months. Slots and products stay as they are.',
  'pay.rejectReason': 'Reason for rejection', 'pay.rejectReasonHint': 'The farmer reads this. Write it for them, not for the file.',
  'pay.empty': 'No payments waiting', 'pay.emptySub': 'New payments will appear here.',
  'pay.verifiedBy': 'Checked', 'pay.viewScreenshot': 'View screenshot', 'pay.noScreenshot': 'No screenshot',
  'pay.noPaidAt': 'No payment time given', 'pay.paidLongBefore': 'Paid over 24 h before sending',
  'pay.verifyTitle': 'Before approving, check against the screenshot:',
  'pay.checkUtr': 'The UTR in the screenshot is {utr}',
  'pay.checkTime': 'The date and time in the screenshot match {at}',
  'pay.checkReceived': '{amount} has actually reached our account (checked the bank statement)',
  'pay.verifyFirst': 'Tick all three checks to approve',
  'pay.viewerHint': 'Match the UTR, date and time, and amount in the screenshot to the figures here. If anything differs, reject with a reason.',
  'pay.duplicate': 'Same UTR again',
  'pay.duplicateNote': 'This reference was already used. Approving it a second time gives a second pack of slots for one payment.',
  'pay.kind.PACK': 'New pack', 'pay.kind.RENEWAL': 'Renewal', 'pay.termUntil': 'Shop open until {date}',
  'sd.payments': 'Payments', 'sd.noPayments': 'No payment has been submitted yet.', 'se.slots': 'Slots', 'se.packs': 'packs',
  'se.subExpiring': 'Subscription ending within 7 days', 'se.subExpired': 'Subscription expired', 'se.subNone': 'No subscription yet',
  'se.grantSlots': 'Grant slots', 'se.grantSlotsHint': 'Goodwill, a training batch, or a demo account.',
  'se.grantTitle': 'Grant slots?',
  'se.grantDesc': 'Granting {n} pack(s) gives the farmer {slots} slots, so they can send in {slots} more products. Nothing is paid. A verified farmer with no subscription gets 6 months from today; a running term is never extended.',
  'se.grantConfirm': 'Yes, grant slots',
  'se.revoke': 'Remove slots', 'se.revokeTitle': 'Remove slots?',
  'se.revokeDesc': 'Removing {n} pack(s) takes away {slots} slots. {used} are in use right now, and the allowance cannot drop below what is already in use.',
  'se.revokeConfirm': 'Yes, remove slots',
  'se.revokeNoneTitle': 'Nothing to remove', 'se.revokeNoneDesc': 'This farmer has no approved packs.',
  'sub.none': 'No subscription yet', 'sub.activeUntil': 'Subscribed until {date}',
  'sub.expiring': 'Ends in {n} days · {date}', 'sub.expiringOne': 'Ends within a day · {date}', 'sub.expiredSince': 'Expired · {date}',
  'nt.SLOTS_GRANTED': 'Slots granted', 'nt.SLOTS_REVOKED': 'Slots revoked',
  'nt.PAYMENT_APPROVED': 'Payment approved', 'nt.PAYMENT_REJECTED': 'Payment rejected',
  'nt.PRODUCT_APPROVED': 'Listing published', 'nt.SUBSCRIPTION_RENEWED': 'Subscription term',
  'sort.farmerAZ': 'Farmer name (A → Z)', 'sort.farmerZA': 'Farmer name (Z → A)',
```

  Then `cd admin && npm test && npm run typecheck` → PASS.

- [ ] **Step 18: `CLAUDE.md`.**
  - *What this is*: "…an admin verifies each one once, they pay ₹50 for a pack of five listing slots and six months of shop, each listing is published by an admin, buyers order…".
  - *Commands*: add `npm run admin -- pending`, `npm run admin -- approve <id|phone|farmer-code> --verified`, `npm run admin -- reject <id> [reason]`, `npm run admin -- grant <phone|farmer-code> [packs]`; update the three test counts from the gate.
  - *Verification, once*: append "Verification is one of **two** gates. `canSellNow()` in `shared/src/subscription.ts` is `status === 'ACTIVE'` **and** an open term; a verified farmer who has never paid is not on sale. Paying never changes status. **The term never runs while the farmer is unverified**: a payment approved before the visit grants slots only, and `startTermOnVerify` (called by the verify route) starts the six months at verification when the farmer holds packs and no term — so nobody pays for the wait, and two ₹50s approved before the visit are still one first term."
  - Replace *Listings go live without approval* with a placeholder line "See *Nothing goes live until an admin publishes it* (Task 2)" — Task 2 writes that section.
  - Add **Slots and subscription** after *Where an order may go*: port the reference section (`git show 5a4fa96:CLAUDE.md`, "### Slots and subscription" through the paragraph ending "…two sources for one figure is how an admin stops trusting either.") with these edits: seller→farmer and gender-neutral throughout; `shared/src/seller.ts`→`farmer.ts`; drop the paragraphs *A rejection is a removal* and *Deleting a draft deletes the document* (the current *Listings…*/Task 2 section covers them), drop *Inside the APK the ₹50 does not exist*, drop *There is no "Save QR to phone" button*, drop the "Submitting a payment no longer sets PAYMENT_SUBMITTED" bullet (replace with "The farmer's `status` carries no payment state; the queue's state is on the payment"); the *Admin* bullet keeps "granted slots start a term for a farmer who has none, but never extend one" and adds "only once verified — before that a grant is slots, and the term starts at verification like a pack's; neither grant nor revoke touches `status`, and revoke refuses (409) to drop below the slots in use"; the *Existing sellers* bullet becomes the §11.10 backfill rule (packs for what is on sale, six months from last approval or verification, floor 7 days); `canSellNow` described as verified **and** term open. Keep the *₹50 needs proof* and *waiting time* paragraphs, the `ADMIN_PAYMENT_ACCOUNT` paragraph, and the `PaySteps` paragraph (already present under *The two hand-typed numbers* — cross-reference rather than duplicate).
  - *Deleting an account*: the `FARMER_PII_FIELDS` bullet adds "and the farmer's ₹50 payments lose the payer (`scrubPayment`: name, phone, payer UPI, the screenshot destroyed by `publicIdFromUrl`) and keep the money".
  - *The updates list*: "…and from `subscriptionFeed()` — the reminder week, and a `standing` 'paused, renew' row that never ages out; `SUBSCRIPTION_RENEWED` carries the new date."
  - *Sorting the admin lists*: "Farmers, Products, Orders and Payments…".
  - *Config and graceful degradation*: bullet for `ADMIN_UPI_ID` / `ADMIN_UPI_NAME` / `ADMIN_BANK_NAME` and the boot banner's `Fee payee` line.
  - *Persistence*: the collections sentence names `payments`.

- [ ] **Step 19: Gate.** `npm test && npm run typecheck && npm run build`. Then `npm run dev:all`: register a farmer, open `/farmer/subscription`, pay (any 12 digits, a screenshot, now), land on `/farmer/waiting`; in the console approve with the three checks — the farmer's page shows 5 slots and "no subscription yet", My Business says the six months start at verification; verify the farmer — the pill now reads a date six months out and the shop appears in the buyer catalogue. Grant a pack from the farmer's page (slots 10, date unchanged); try to remove two packs with a listing live → the 409 sentence stays in the dialog. Set `subscriptionEndsAt` in `backend/data/db.json` to yesterday (API stopped) and confirm the catalogue hides the shop, My Business shows the paused card, the bell shows the standing row, and a renewal reopens it.

- [ ] **Step 20: Commit.**

```
git add -A
git commit -m "Bring back the ₹50 subscription, slots and payment proof

₹50 = one pack of five listing slots and six months of shop, counted in
IST from the admin's approval - or from the verification, when the farmer
paid first, so nobody pays for the wait. A farmer sells only when verified
AND the term is open; paying never changes status. The payment carries a
screenshot, the time paid and the UTR, and the admin approves only after
three checks. Admins can grant and take back slots; a grant never extends
a term. Farmers from the free period get a term and enough packs at boot,
never fewer than a week.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Listing approval and edit limits

**Files:**
- Create: `backend/tests/listing-review.test.ts`, `backend/tests/edit-limit.test.ts`
- Modify (shared): `shared/src/farmer.ts`
- Modify (backend): `backend/src/routes/products.routes.ts`, `backend/src/routes/admin.routes.ts`, `backend/scripts/admin.ts`, `backend/tests/slots.test.ts`, `backend/tests/product-patch.test.ts`
- Modify (frontend): `src/components/PhotoPicker.tsx`, `src/components/Produce.tsx`, `src/screens/farmer/EditProduct.tsx`, `src/screens/farmer/UploadProduct.tsx`, `src/screens/farmer/MyProducts.tsx`, `src/lib/api.ts`, `src/i18n/strings.ts`
- Modify (admin): `src/lib/api.ts`, `src/screens/Products.tsx`, `src/i18n/strings.ts`
- Modify (docs): `CLAUDE.md`

**Interfaces:**

```ts
// shared/src/farmer.ts
export function initialListingStatus(asDraft: boolean): ProductStatus   // 'DRAFT' | 'PENDING', never 'LIVE'
export function farmerMayDelete(status: ProductStatus): boolean         // status === 'DRAFT'
export const MAX_EDITS = 2
export const EDIT_COUNTED_FIELDS = ['cropId', 'name', 'imageUrl', 'categoryId', 'unit', 'cultivation'] as const
export function countsAsEdit(before: Partial<Product>, after: Partial<Product>): boolean
export function editsLeft(product: Pick<Product, 'editCount'>): number
export function editsAreLimited(status: ProductStatus): boolean         // LIVE | PAUSED

// routes
POST  /admin/products/:id/moderate { approve: true }            → 200 { product } (PENDING → LIVE), 409 if not PENDING
POST  /admin/products/:id/moderate { approve: false, reason }   → deletes; unchanged
GET   /admin/products?status=                                   → default PENDING
PATCH /products/:id                                             → 409 { editsLeft: 0 } when a counted change has none left
DELETE /products/:id                                            → 403 unless DRAFT

// frontend
PhotoPicker({ locked?: boolean })
CropPicker / CategoryPicker / UnitPicker / CultivationPicker({ disabled?: boolean })
// admin
api.approveProduct(id) → { product }
```

- [ ] **Step 1: Write the failing tests.** Create `backend/tests/listing-review.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { initialListingStatus } from '@shared/farmer.js'

/**
 * NOTHING GOES LIVE WITHOUT AN ADMIN SAYING SO.
 *
 * A listing carries a photograph, a price, a harvest date and a claim about
 * how the crop was grown, and it goes out under the programme's name. So a
 * person looks before a buyer does. The farmer still writes the listing and
 * still owns it; what changed is when a buyer can see it.
 */
test('submitting a listing asks for review, it does not publish', () => {
  assert.equal(initialListingStatus(false), 'PENDING')
})

test('saving a draft is not submitting anything', () => {
  assert.equal(initialListingStatus(true), 'DRAFT')
})

/** The regression this exists to catch: a listing that publishes itself. */
test('no path from the farmer ends at LIVE', () => {
  for (const asDraft of [true, false]) assert.notEqual(initialListingStatus(asDraft), 'LIVE')
})
```

Create `backend/tests/edit-limit.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Product } from '@shared/types.js'
import { MAX_EDITS, countsAsEdit, editsAreLimited, editsLeft } from '@shared/farmer.js'

/**
 * TWO EDITS, AND WHAT THEY ARE FOR.
 *
 * A slot is one listing live at a time, so editing never wins a second
 * listing - but it does let one paid slot become a different crop every
 * season: tomatoes in winter, onions in summer, out of one ₹50 for ever. Two
 * edits is the line between fixing a listing and replacing it. Everything
 * here keeps that line in the right place: the price and the stock a farmer
 * changes daily must never be what runs them out.
 */
function product(over: Partial<Product> = {}): Product {
  return {
    id: 'p1', farmerId: 'f1', cropId: 'tomato', name: 'टोमॅटो', categoryId: 'vegetables',
    price: 40, stock: 100, minOrder: 5, unit: 'kg', harvestDate: '2026-09-25',
    cultivation: 'organic', status: 'LIVE', ...over,
  } as Product
}

test('the numbers a farmer keeps current spend nothing, however often', () => {
  const before = product()
  assert.equal(countsAsEdit(before, { ...before, price: 45 }), false)
  assert.equal(countsAsEdit(before, { ...before, stock: 3 }), false)
  assert.equal(countsAsEdit(before, { ...before, minOrder: 2 }), false)
  assert.equal(countsAsEdit(before, { ...before, harvestDate: '2026-09-26' }), false)
  assert.equal(countsAsEdit(before, { ...before, description: 'ताजे' }), false)
})

test('changing what the produce IS spends one', () => {
  const before = product()
  assert.equal(countsAsEdit(before, { ...before, cropId: 'onion' }), true)
  assert.equal(countsAsEdit(before, { ...before, name: 'कांदा' }), true)
  assert.equal(countsAsEdit(before, { ...before, imageUrl: 'https://x/y.jpg' }), true)
  assert.equal(countsAsEdit(before, { ...before, categoryId: 'fruits' }), true)
  assert.equal(countsAsEdit(before, { ...before, unit: 'quintal' }), true)
  assert.equal(countsAsEdit(before, { ...before, cultivation: 'chemical' }), true)
})

/** The edit form posts the whole product on every save; a save that changed nothing must cost nothing. */
test('an edit is spent on saving a change, and on nothing else', () => {
  const before = product()
  assert.equal(countsAsEdit(before, { ...before }), false)
  assert.equal(countsAsEdit(before, { ...before, name: 'टोमॅटो' }), false, 'typed the old name back')
  assert.equal(countsAsEdit(before, { ...before, name: '  टोमॅटो  ' }), false, 'whitespace is not a change')
  assert.equal(countsAsEdit(before, { ...before, imageUrl: undefined }), false, 'absent stays absent')
})

test('the pause toggle is not an edit', () => {
  const before = product()
  assert.equal(countsAsEdit(before, { status: 'PAUSED' }), false)
})

test('price and stock stay free at the limit, not only before it', () => {
  const spent = product({ editCount: MAX_EDITS })
  assert.equal(editsLeft(spent), 0)
  assert.equal(countsAsEdit(spent, { ...spent, price: 60, stock: 4 }), false)
})

/** `editCount` is absent on rows from before the rule: nobody loses an edit to a change made when editing was free. */
test('a listing published before this rule starts with every edit', () => {
  assert.equal(editsLeft(product()), MAX_EDITS)
  assert.equal(editsLeft(product({ editCount: 1 })), MAX_EDITS - 1)
  assert.equal(editsLeft(product({ editCount: 99 })), 0)
})

/** Only a listing the public can see is rationed; a draft and a waiting listing are still being written. */
test('drafts and waiting listings are not rationed', () => {
  assert.equal(editsAreLimited('LIVE'), true)
  assert.equal(editsAreLimited('PAUSED'), true)
  assert.equal(editsAreLimited('DRAFT'), false)
  assert.equal(editsAreLimited('PENDING'), false)
})
```

Append to `backend/tests/slots.test.ts` (import `farmerMayDelete` from `@shared/farmer.js`):

```ts
test('a farmer may delete a draft and nothing they have sent in', () => {
  // A draft holds no slot and nobody else has seen it. Anything past that
  // would free a slot, and freeing slots is the admin's decision.
  assert.equal(farmerMayDelete('DRAFT'), true)
  for (const s of ['PENDING', 'LIVE', 'PAUSED'] as const) {
    assert.equal(farmerMayDelete(s), false, `${s} must not be deletable by the farmer`)
  }
})
```

Run `cd backend && node --import tsx --test tests/listing-review.test.ts tests/edit-limit.test.ts tests/slots.test.ts` → FAIL.

- [ ] **Step 2: `shared/src/farmer.ts`.**

```ts
/**
 * WHERE A LISTING LANDS WHEN THE FARMER PRESSES "SEND FOR CHECKING". Never
 * LIVE: a photograph, a price and a cultivation claim reach a person before
 * they reach a buyer. POST /admin/products/:id/moderate is the only path to
 * LIVE. A draft is not a submission, so it lands where it was left.
 */
export function initialListingStatus(asDraft: boolean): ProductStatus {
  return asDraft ? 'DRAFT' : 'PENDING'
}

/** The only listing a farmer may delete: a draft. It holds no slot and nobody else has seen it. */
export function farmerMayDelete(status: ProductStatus): boolean {
  return status === 'DRAFT'
}

/**
 * EDITING A PUBLISHED LISTING IS LIMITED. A slot is one listing live at a
 * time, so editing never wins a second listing - but without a limit one paid
 * slot becomes a different crop every season. Two edits is the line between
 * fixing a listing and replacing it. The numbers a farmer keeps current -
 * price, stock, minimum, harvest date - and the description are never counted:
 * a farmer who cannot correct a price stops keeping it honest.
 */
export const MAX_EDITS = 2

export const EDIT_COUNTED_FIELDS = ['cropId', 'name', 'imageUrl', 'categoryId', 'unit', 'cultivation'] as const

/** Compares VALUES, not keys: the edit form posts the whole product on every save. */
export function countsAsEdit(before: Partial<Product>, after: Partial<Product>): boolean {
  return EDIT_COUNTED_FIELDS.some((f) => (f in after) && !sameValue(before[f], after[f]))
}

/** Blank is blank however it is spelled, and whitespace round a name is not a change to the name. */
function sameValue(a: unknown, b: unknown): boolean {
  const blank = (v: unknown) => v === undefined || v === null || v === '' || v === 0 || v === false
  if (blank(a) || blank(b)) return blank(a) && blank(b)
  if (typeof a === 'string' && typeof b === 'string') return a.trim() === b.trim()
  if (typeof a === 'number' || typeof b === 'number') return Number(a) === Number(b)
  return a === b
}

/** Edits still available. Listings that predate this rule start with all of them. */
export function editsLeft(product: Pick<Product, 'editCount'>): number {
  return Math.max(0, MAX_EDITS - (product.editCount ?? 0))
}

/** Only a listing the public can see is rationed. A draft or a waiting listing is still being written. */
export function editsAreLimited(status: ProductStatus): boolean {
  return status === 'LIVE' || status === 'PAUSED'
}
```

- [ ] **Step 3: Backend routes.**
  - `products.routes.ts`: import `MAX_EDITS, countsAsEdit, editsAreLimited, editsLeft, farmerMayDelete` from `@shared/farmer.js`. `POST /`: the comment on `status: initialListingStatus(asDraft)` reads "PENDING, never LIVE - an admin publishes it." `PATCH /:id`: the `DRAFT → LIVE` branch keeps its gates (Task 1) and ends in `merged.status = initialListingStatus(false)`; after the `patchProblems` check add:

```ts
// THE EDIT LIMIT. Two changes to what the listing IS, then no more; the
// client disables the fields at zero, this is the rule.
const spends = editsAreLimited(current.status) && countsAsEdit(current, merged)
if (spends && editsLeft(current) <= 0) {
  res.status(409).json({
    error: 'No edits left',
    messageMr: `या उत्पादनात ${MAX_EDITS} वेळा बदल करून झाले आहेत. किंमत, साठा, किमान ऑर्डर आणि काढणीची तारीख मात्र कधीही बदलता येतात.`,
    editsLeft: 0,
  })
  return
}
if (spends) merged.editCount = (current.editCount ?? 0) + 1
```

  `DELETE /:id`: before the splice, `if (!farmerMayDelete(db.products[i]!.status)) { res.status(403).json({ error: 'Only a draft can be deleted by the farmer', messageMr: 'पाठवलेले उत्पादन काढता येत नाही. ते काढायचे असल्यास प्रशासकाशी संपर्क करा.' }); return }`.
  - `admin.routes.ts`: `GET /products` default `status` → `'PENDING'`. In `moderate`, replace the `approve` refusal with the reference's approve branch (`git show 5a4fa96:backend/src/routes/admin.routes.ts`, the tail of the handler): `if (approve) { if (product.status !== 'PENDING') { 409 'Not waiting' / 'हे उत्पादन तपासणीसाठी आलेले नाही' } product.status = 'LIVE'; notifyFarmer(owner, 'PRODUCT_APPROVED', { subject: product.name }); save(); res.json({ product }); return }`; the reason check stays `if (!approve && !reason)`; the delete branch is unchanged.
  - `scripts/admin.ts`: port `products` (lists `?status=PENDING`, printing name, crop, farmer code) and `approveProduct` (`{ approve: true }`) and their cases.
  - `backend/tests/product-patch.test.ts`: unchanged (it tests `patchProblems`), but confirm it still passes.

- [ ] **Step 4: Run** the Step 1 command → PASS; `cd backend && npm test && npm run typecheck`.

- [ ] **Step 5: Frontend.**
  - `components/Produce.tsx`: each picker takes `disabled?: boolean`; chips get `disabled={disabled}`, `CultivationPicker` passes it to `Choice`.
  - `components/PhotoPicker.tsx`: restore `locked` (`git show 78d261f -- frontend/src/components/PhotoPicker.tsx`): the clear button `hidden={locked}`, the gallery button wrapped in `{!locked && (...)}`.
  - `screens/farmer/EditProduct.tsx`: import `countsAsEdit, editsAreLimited, editsLeft` from `@shared/farmer.js`; after `const p = product`:

```ts
const limited = editsAreLimited(p.status)
const left = editsLeft(p)
const locked = limited && left <= 0
/** Does what is on screen right now spend one? Price-only saves do not. */
const spends = limited && countsAsEdit(p, {
  cropId: form.cropId, name: form.name.trim(), imageUrl: form.imageUrl || undefined,
  categoryId: listing.categoryId, unit: form.unit, cultivation: listing.cultivation,
})
```

  Notices above the form: `{limited && <Notice tone={locked ? 'danger' : left === 1 ? 'warn' : 'info'}>{locked ? t('prod.editsNone') : t('prod.editsLeft', { n: left })} {t('prod.editsPriceFree')}</Notice>}` and `{spends && left === 1 && <Notice tone="warn">{t('prod.editsLastWarn')}</Notice>}`. `PhotoPicker locked={locked}`; `CropPicker`, `CategoryPicker`, `UnitPicker`, `CultivationPicker` `disabled={locked}`; the name `VoiceInput disabled={locked}`. Price, stock, minOrder, harvestDate stay enabled. The draft's submit button reads `t('prod.publish')`. Docblock: "every field may change - twice, for what the produce is; the numbers are free".
  - `screens/farmer/UploadProduct.tsx`: the review step's notice keeps the Task 1 slot line and adds `<div className="small dim" style={{ textAlign: 'center' }}>{t('prod.reviewNote')}</div>` above the submit button, whose label becomes `t('prod.publish')`; the `prod.responsibility` notice stays.
  - `screens/farmer/MyProducts.tsx`: `farmerMayDelete(p.status)` now hides Remove on anything sent in (the import already exists); the pause toggle stays for `LIVE`/`PAUSED`; a `PENDING` row shows its pill from `PRODUCT_STATUS_STYLE` (Task 1 added it).
  - `lib/api.ts`: `deleteProduct` doc → "Drafts only - the server refuses a submitted listing."
  - Strings: `ok.productPublished` → mr `'उत्पादन तपासणीसाठी पाठवले'` / en `'Product sent for checking'`; add mr `'prod.reviewNote': 'प्रशासक तपासून मंजूर केल्यावर तुमचे उत्पादन ग्राहकांना दिसेल.'`, `'prod.editsLeft': 'या उत्पादनात आणखी {n} वेळा बदल करता येईल.'`, `'prod.editsNone': 'या उत्पादनाची माहिती आता बदलता येणार नाही.'`, `'prod.editsPriceFree': 'किंमत, साठा, किमान ऑर्डर आणि काढणीची तारीख मात्र कधीही बदलता येतात.'`, `'prod.editsLastWarn': 'हा तुमचा शेवटचा बदल आहे. जतन केल्यावर पीक, नाव, फोटो, एकक आणि शेती पद्धत बदलता येणार नाहीत.'`; en `'prod.reviewNote': 'An admin checks it first. Once approved, customers can see it.'`, `'prod.editsLeft': 'You can change this product {n} more times.'`, `'prod.editsNone': 'The details of this product can no longer be changed.'`, `'prod.editsPriceFree': 'Price, stock, minimum order and harvest date can always be changed.'`, `'prod.editsLastWarn': 'This is your last change. After saving, the crop, name, photo, unit and cultivation are settled.'`.
  - `cd frontend && npm test && npm run typecheck` → PASS.

- [ ] **Step 6: Admin.**
  - `lib/api.ts`: `approveProduct: (id) => post<{ product: Product }>(\`/admin/products/${id}/moderate\`, { approve: true })`; `products()` default `'PENDING'` with the doc `status: PENDING (default) | LIVE | PAUSED | DRAFT | REPORTED`.
  - `screens/Products.tsx`: `type Tab = 'PENDING' | 'LIVE' | 'REPORTED'`, default `'PENDING'`, a `pr.pendingTab` button first; in `ProductCard`: `const pending = product.status === 'PENDING'`; pills `{pending && <Pill tone="warn">{t('pr.pendingTab')}</Pill>}`; actions `{pending && <Button variant="ok" small disabled={busy} onClick={() => void run(() => api.approveProduct(product.id))}>{t('pr.publish')}</Button>}` and the danger button reading `pending ? t('pr.reject') : t('pr.takeDown')`; the docblock says a person looks before a buyer does and why (`git show 5a4fa96:admin/src/screens/Products.tsx`).
  - Strings: change `pr.rejectDeletes` → mr `'नाकारल्यावर हे उत्पादन लगेच काढून टाकले जाईल. शेतकऱ्याची जागा मोकळी होईल आणि कारण त्यांना कळवले जाईल.'` / en `'Rejecting removes this product straight away. The slot is freed and the farmer is told the reason.'`; add mr `'pr.pendingTab': 'तपासायची'`, `'pr.publish': 'प्रकाशित करा'`, `'pr.reject': 'नाकारा'`, `'ok.productApproved': 'उत्पादन प्रकाशित झाले'`; en `'pr.pendingTab': 'To review'`, `'pr.publish': 'Publish'`, `'pr.reject': 'Reject'`, `'ok.productApproved': 'Product published'`.
  - `cd admin && npm test && npm run typecheck` → PASS.

- [ ] **Step 7: Check the paths that only read `LIVE` + `canSellNow`.** `traceView`, `mapPins`, the catalogue list, `/serviceability`, `/insights/price` (platform median counts `LIVE` under `canSellNow`) and `/admin/demand` (`LIVE` stock) all ignore `PENDING` rows because they test `status === 'LIVE'`; `research.ts` never reads products. Confirm with `grep -rn "'LIVE'" backend/src` that every hit is a `LIVE`-equality read, then run `tests/trace.test.ts tests/map.test.ts tests/price-hint.test.ts tests/research.test.ts` once more.

- [ ] **Step 8: `CLAUDE.md`.** Replace the Task 1 placeholder with **Nothing goes live until an admin publishes it**: port the reference section (`git show 5a4fa96:CLAUDE.md`) plus: `initialListingStatus` is `DRAFT` or `PENDING`; approve only from `PENDING` (409); reject/take-down deletes the row, photo and reports and writes `PRODUCT_REJECTED`; `SLOT_CONSUMING`; `farmerMayDelete` is `DRAFT` only (403 otherwise); a `PENDING` listing is editable and unrationed; `LIVE ↔ PAUSED` free; the farmer's side says "send for checking"; the admin's Products opens on Pending; `normalizeLegacyRows` leaves `PENDING` alone. Then **Editing a published listing**: port the reference's *Editing a published product* with the produce field list (`cropId`, `name`, `imageUrl`, `categoryId`, `unit`, `cultivation`; free: `price`, `stock`, `minOrder`, `harvestDate`, `description`, pause), `countsAsEdit` compares values, `editsAreLimited` is `LIVE`/`PAUSED`, `editCount` absent reads 0, and the `EditProduct` behaviour (disables what has run out). Update *Produce rules* ("The upload wizard… `EditProduct` puts every field on one page…" gains "a live listing may change what it *is* twice"), *Commands* (`products`, `approve-product <id>`) and the test counts. Remove "Listings go live without approval" from *What this is* if any trace remains.

- [ ] **Step 9: Gate.** `npm test && npm run typecheck && npm run build`. `npm run dev:all`: a verified, subscribed farmer sends a listing → it reads "तपासणी सुरू", is absent from the buyer catalogue and from `/trace/:id`; the console's Products opens on it; Publish → live and traceable; Reject with a reason → gone, slot back, notice in the farmer's updates. Edit a live listing's price twice and its name twice → the third name change is refused by the server and the field is disabled on screen; the price box still saves.

- [ ] **Step 10: Commit.**

```
git add -A
git commit -m "Listings wait for an admin again, with two edits per live listing

A new listing is PENDING until an admin publishes it; rejecting or taking
one down deletes it and frees its slot. A farmer deletes drafts only. A
live or paused listing may change what it is twice - crop, name, photo,
category, unit, cultivation - while price, stock, minimum and harvest date
stay free for ever.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Self-review

- Every interface named in a task's **Interfaces** block appears in its steps with the same name and signature (`termOpen`, `canSellNow(f, now)`, `slotInfo`, `rejectPayment`, `startTermOnVerify`, `grantSlots`, `revokeProblem`, `revokeSlots`, `backfillSubscriptionTerms(db, now)`, `publiclyVisible(product, farmer, now)`, `approveProduct`).
- The term is written in exactly four places: `applyApprovedPayment` (verified farmer), `startTermOnVerify`, `grantSlots` (verified farmer with none) and `backfillSubscriptionTerms`; none of them runs for an unverified farmer, so a payment or a gift before the visit never starts the clock.
- Task 1 adds `PENDING` to `ProductStatus` and `PRODUCT_STATUS_STYLE` but nothing creates one until Task 2 flips `initialListingStatus`; `slots.test.ts` compiles in Task 1 because the type is there.
- The frontend never calls `canSellNow`: `UploadProduct` gates on `farmer.status` and `me.subscription.state`; `MyBusiness`/`MyProducts` read `subscription.state`.
- Every dictionary key used in the steps is listed in a strings step for both languages; `prod.liveNow` is removed in the same step that stops using it.
- No `PAYMENT_SUBMITTED`/`PAYMENT_REJECTED` farmer status anywhere; `normalizeLegacyRows` still maps the old ones to `PENDING_VERIFICATION`.
- Old brand words appear only inside `git show` paths and the `payment-account` test's "must never come back" assertion.
