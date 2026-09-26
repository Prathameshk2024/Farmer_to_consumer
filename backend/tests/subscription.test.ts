import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Product, Seller, SubscriptionPayment } from '@shared/types.js'
import {
  addMonths, canSellNow, endsAtAfterApproval, payableKinds, paymentKindProblem,
  subscriptionState, subscriptionView,
} from '@shared/subscription.js'
import { slotInfo } from '@shared/seller.js'
import { applyApprovedPayment, backfillSubscriptionTerms } from '../src/db/subscription.js'
import { publiclyVisible } from '../src/routes/catalog.routes.js'

/**
 * SIX MONTHS PER ₹50.
 *
 * The shop is open for six months from approval. When they run out the whole
 * shop pauses; a flat ₹50 renewal puts back exactly what she had. Only the end
 * date is stored, so "exactly what she had" is true by construction: nothing
 * about her products, her slots or her open/closed switch is ever rewritten.
 */

const DAY = 86_400_000

function seller(over: Partial<Seller> = {}): Seller {
  return {
    id: 's1', status: 'ACTIVE', isOpen: true, packsApproved: 2, notices: [],
    subscriptionEndsAt: '2027-03-15T06:30:00.000Z',
    ...over,
  } as Seller
}

function payment(kind: 'PACK' | 'RENEWAL' | undefined): SubscriptionPayment {
  return { id: 'sp1', sellerId: 's1', kind, status: 'APPROVED', amount: 50 } as SubscriptionPayment
}

test('six calendar months, counted in IST, clamped to the end of a short month', () => {
  // 15 March 12:00 IST -> 15 September 12:00 IST.
  assert.equal(addMonths('2026-03-15T06:30:00.000Z', 6), '2026-09-15T06:30:00.000Z')
  // 31 August -> 28 February: a day the month does not have is not March 3rd.
  assert.equal(addMonths('2026-08-31T06:30:00.000Z', 6), '2027-02-28T06:30:00.000Z')
  // 1 am IST on 1 September is still 31 August in UTC. Counted in IST it is
  // 1 March, which is the date she was told - not 28 February.
  assert.equal(addMonths('2026-08-31T19:30:00.000Z', 6), '2027-02-28T19:30:00.000Z')
})

test('active, then the week of reminders, then paused', () => {
  const s = seller()
  const end = new Date(s.subscriptionEndsAt!).getTime()
  assert.equal(subscriptionState(s, end - 8 * DAY), 'active')
  assert.equal(subscriptionState(s, end - 7 * DAY), 'expiring')
  assert.equal(subscriptionState(s, end - 1), 'expiring')
  assert.equal(subscriptionState(s, end), 'expired')
  assert.equal(subscriptionState(seller({ subscriptionEndsAt: undefined })), 'none')
  assert.equal(subscriptionView(s, end - 2.5 * DAY).daysLeft, 3)
})

/**
 * The whole point: nothing is rewritten on expiry, so the same product that
 * vanishes the moment the date passes is back the moment it moves.
 */
test('a live product leaves the shelf when the six months end, and returns on renewal untouched', () => {
  const s = seller()
  const product = { status: 'LIVE' } as Pick<Product, 'status'>
  const end = new Date(s.subscriptionEndsAt!).getTime()

  assert.equal(publiclyVisible(product, s, end - 1), true)
  assert.equal(publiclyVisible(product, s, end + DAY), false)
  assert.equal(canSellNow(s, end + DAY), false)

  applyApprovedPayment(s, payment('RENEWAL'), new Date(end + DAY).toISOString())
  assert.equal(publiclyVisible(product, s, end + 2 * DAY), true)
  assert.equal(product.status, 'LIVE')
})

test('renewal keeps her packs exactly as they were - it is time, not slots', () => {
  const s = seller({ packsApproved: 2 })
  const end = new Date(s.subscriptionEndsAt!).getTime()
  applyApprovedPayment(s, payment('RENEWAL'), new Date(end + 3 * DAY).toISOString())
  assert.equal(s.packsApproved, 2)
  assert.equal(slotInfo(s, []).total, 10)
})

test('a renewal after the shop paused counts six months from the approval', () => {
  const s = seller()
  const approvedAt = '2027-04-01T06:30:00.000Z'
  applyApprovedPayment(s, payment('RENEWAL'), approvedAt)
  assert.equal(s.subscriptionEndsAt, '2027-10-01T06:30:00.000Z')
  assert.equal(s.notices!.at(-1)!.kind, 'SUBSCRIPTION_RENEWED')
  assert.equal(s.notices!.at(-1)!.note, s.subscriptionEndsAt)
})

/** Renewing in the reminder week must not throw away the days she paid for. */
test('an early renewal adds six months to the end of the current term', () => {
  const s = seller()
  const approvedAt = new Date(new Date(s.subscriptionEndsAt!).getTime() - 3 * DAY).toISOString()
  assert.equal(endsAtAfterApproval(s, 'RENEWAL', approvedAt), '2027-09-15T06:30:00.000Z')
})

test('the first pack starts the term; another pack mid-term adds slots and leaves the date', () => {
  const fresh = seller({ status: 'PAYMENT_SUBMITTED', packsApproved: 0, subscriptionEndsAt: undefined })
  applyApprovedPayment(fresh, payment('PACK'), '2026-09-15T06:30:00.000Z')
  assert.equal(fresh.status, 'ACTIVE')
  assert.equal(fresh.packsApproved, 1)
  assert.equal(fresh.subscriptionEndsAt, '2027-03-15T06:30:00.000Z')

  const midTerm = seller()
  applyApprovedPayment(midTerm, payment('PACK'), '2026-12-01T06:30:00.000Z')
  assert.equal(midTerm.packsApproved, 3)
  assert.equal(midTerm.subscriptionEndsAt, '2027-03-15T06:30:00.000Z')
  assert.equal(midTerm.notices!.some((n) => n.kind === 'SUBSCRIPTION_RENEWED'), false)
})

/**
 * She paid ₹50 to a closed shop. A pack sent in before the date and approved
 * after it still reopens the shop, and says so.
 */
test('a pack approved after the shop paused reopens it too', () => {
  const s = seller()
  applyApprovedPayment(s, payment(undefined), '2027-05-01T06:30:00.000Z')
  assert.equal(s.packsApproved, 3)
  assert.equal(s.subscriptionEndsAt, '2027-11-01T06:30:00.000Z')
  assert.deepEqual(s.notices!.map((n) => n.kind), ['PAYMENT_APPROVED', 'SUBSCRIPTION_RENEWED'])
})

test('paying does not lift a block', () => {
  const s = seller({ status: 'BLOCKED' })
  applyApprovedPayment(s, payment('RENEWAL'), '2027-04-01T06:30:00.000Z')
  assert.equal(s.status, 'BLOCKED')
  assert.equal(canSellNow(s, new Date('2027-04-02').getTime()), false)
})

test('what she may pay for: renewal from the reminder on, only renewal once paused', () => {
  const s = seller()
  const end = new Date(s.subscriptionEndsAt!).getTime()
  // Mid-term with free slots: nothing to buy.
  assert.deepEqual(payableKinds(s, 3, end - 60 * DAY), [])
  assert.notEqual(paymentKindProblem('RENEWAL', s, 3, end - 60 * DAY), null)
  // Mid-term and full: a pack.
  assert.deepEqual(payableKinds(s, 0, end - 60 * DAY), ['PACK'])
  // Reminder week and full: renewal first, then a pack.
  assert.deepEqual(payableKinds(s, 0, end - 2 * DAY), ['RENEWAL', 'PACK'])
  // Paused: five more slots in a shop nobody can see is money for nothing.
  assert.deepEqual(payableKinds(s, 0, end + DAY), ['RENEWAL'])
  assert.notEqual(paymentKindProblem('PACK', s, 0, end + DAY), null)
  // Never paid: the first pack.
  assert.deepEqual(payableKinds(seller({ subscriptionEndsAt: undefined, packsApproved: 0 }), 0), ['PACK'])
})

test('sellers from before the rule get six months from their last approval, never less than a week', () => {
  const now = new Date('2026-09-15T06:30:00.000Z')
  const db = {
    sellers: [
      seller({ id: 'recent', subscriptionEndsAt: undefined }),
      seller({ id: 'old', subscriptionEndsAt: undefined }),
      seller({ id: 'granted', subscriptionEndsAt: undefined }),
      seller({ id: 'never', subscriptionEndsAt: undefined, packsApproved: 0 }),
      seller({ id: 'dated' }),
    ],
    payments: [
      { sellerId: 'recent', status: 'APPROVED', verifiedAt: '2026-09-01T06:30:00.000Z' },
      { sellerId: 'old', status: 'APPROVED', verifiedAt: '2026-01-01T06:30:00.000Z' },
    ] as SubscriptionPayment[],
  }

  assert.equal(backfillSubscriptionTerms(db, now), 3)
  const by = (id: string) => db.sellers.find((s) => s.id === id)!.subscriptionEndsAt
  assert.equal(by('recent'), '2027-03-01T06:30:00.000Z')
  // Six months from January is July - already past. A week's warning instead.
  assert.equal(by('old'), '2026-09-22T06:30:00.000Z')
  assert.equal(by('granted'), '2027-03-15T06:30:00.000Z')
  assert.equal(by('never'), undefined)
  assert.equal(by('dated'), '2027-03-15T06:30:00.000Z')
  // Idempotent.
  assert.equal(backfillSubscriptionTerms(db, now), 0)
})
