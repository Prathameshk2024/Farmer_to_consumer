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
