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
