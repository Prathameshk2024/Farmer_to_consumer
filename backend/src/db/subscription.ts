import type { Seller, SubscriptionPayment } from '@shared/types.js'
import {
  RENEW_REMINDER_DAYS, SUBSCRIPTION_MONTHS, addMonths, endsAtAfterApproval, isExpired,
} from '@shared/subscription.js'
import { PLAN } from '@shared/seller.js'
import { appendNotice } from './notices.js'
import type { Db } from './seed.js'

/**
 * What approving a payment does to her account.
 *
 * Out of the route so the rules can be tested without a server. The payment
 * has already been checked (UTR, time, receipt) by the admin.
 *
 * - A PACK adds five slots, as it always did.
 * - Either kind may move the end date - see `endsAtAfterApproval`.
 * - She is told what changed, in her own updates list: the slots, and the new
 *   date when there is one.
 * - A blocked seller stays blocked. Paying is not how a block is lifted.
 */
export function applyApprovedPayment(
  seller: Seller,
  payment: SubscriptionPayment,
  approvedAt: string,
): void {
  const kind = payment.kind ?? 'PACK'
  const wasExpired = isExpired(seller, new Date(approvedAt).getTime())
  const before = seller.subscriptionEndsAt

  if (kind === 'PACK') seller.packsApproved += 1
  if (seller.status !== 'BLOCKED') seller.status = 'ACTIVE'

  seller.subscriptionEndsAt = endsAtAfterApproval(seller, kind, approvedAt)
  payment.termEndsAt = seller.subscriptionEndsAt

  if (kind === 'PACK') appendNotice(seller, 'PAYMENT_APPROVED', { n: PLAN.slotsPerPack }, approvedAt)
  // A renewal always says so; a pack only when it happened to reopen a paused
  // shop, which she would otherwise discover by finding her products back.
  if (kind === 'RENEWAL' || (wasExpired && seller.subscriptionEndsAt !== before)) {
    appendNotice(seller, 'SUBSCRIPTION_RENEWED', { note: seller.subscriptionEndsAt }, approvedAt)
  }
}

/**
 * Give every seller who already sells a term, once, when this rule ships.
 *
 * Packs used to last for ever, so nobody has an end date. Each gets six months
 * from her most recent approved payment - the rule as if it had always been
 * there - but never fewer than RENEW_REMINDER_DAYS from today: a shop must not
 * close the morning after a deploy with no warning at all.
 *
 * Packs an admin granted with no payment behind them count from today.
 * Idempotent: a seller who already has a date is left alone.
 */
export function backfillSubscriptionTerms(db: Pick<Db, 'sellers' | 'payments'>, now = new Date()): number {
  const floor = now.getTime() + RENEW_REMINDER_DAYS * 86_400_000
  let changed = 0
  for (const seller of db.sellers) {
    if (seller.subscriptionEndsAt || !seller.packsApproved) continue
    const lastApproval = db.payments
      .filter((p) => p.sellerId === seller.id && p.status === 'APPROVED' && p.verifiedAt)
      .map((p) => p.verifiedAt!)
      .sort()
      .pop()
    const ends = addMonths(lastApproval ?? now.toISOString(), SUBSCRIPTION_MONTHS)
    seller.subscriptionEndsAt = new Date(Math.max(new Date(ends).getTime(), floor)).toISOString()
    changed += 1
  }
  return changed
}
