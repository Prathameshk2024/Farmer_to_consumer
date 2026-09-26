import type { Seller } from './types.js'

/**
 * THE SIX-MONTH SUBSCRIPTION
 * ==========================
 * ₹50 keeps a seller's shop open for six months from the day an admin
 * approves the payment. When the six months run out, the whole shop pauses:
 * nothing of hers can be bought or found, and she is asked to renew. A flat
 * ₹50 renewal, once approved, puts back EXACTLY what she had - the same packs,
 * the same products, live again.
 *
 * ONE DATE, NOTHING ELSE STORED. `Seller.subscriptionEndsAt` is the whole
 * state. Expiry is not written anywhere: no product is flipped to PAUSED, her
 * shop switch is not touched, no slot is released. The public routes simply
 * ask `canSellNow()`, and the answer changes when the clock passes the date.
 *
 * That is what makes "exactly as before" true. Pausing forty products in one
 * write and un-pausing them on renewal would have to remember which ones she
 * had paused herself, which were waiting for review, which an admin approved
 * while she was expired - and a single missed case is a product she never
 * chose to hide, hidden. With nothing written, renewal is one date moving.
 *
 * ONE DATE FOR THE WHOLE SHOP. A seller may own several packs bought months
 * apart; they share this one date, and one flat ₹50 renews them all. Buying
 * another pack mid-term adds five slots and leaves the date alone.
 *
 * THE CLOCK IS THE SERVER'S. A phone's clock can be wrong by days, so every
 * screen is told the state by the API (`subscriptionView`) rather than working
 * it out from the date with the phone's own idea of now.
 */

export const SUBSCRIPTION_MONTHS = 6
/** She is warned this many days before the shop pauses. */
export const RENEW_REMINDER_DAYS = 7

const DAY = 86_400_000
/** India has one time zone and no daylight saving: a fixed +5:30. */
const IST_OFFSET = 330 * 60_000

/**
 * The same date `months` later, on the calendar she lives by.
 *
 * Calendar months, not 182 days - "approved on 15 March, open until 15
 * September" is a sentence she can check. Counted in IST so an approval at
 * 1 am on the 1st does not land on the last day of the month in UTC. A day
 * the target month does not have is clamped: 31 August plus six months is
 * 28 February, not 3 March.
 */
export function addMonths(iso: string, months: number): string {
  const local = new Date(new Date(iso).getTime() + IST_OFFSET)
  const day = local.getUTCDate()
  const target = new Date(local.getTime())
  target.setUTCDate(1)
  target.setUTCMonth(target.getUTCMonth() + months)
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(day, lastDay))
  return new Date(target.getTime() - IST_OFFSET).toISOString()
}

export type SubscriptionState =
  /** No term has started: she has never had a payment approved. */
  | 'none'
  | 'active'
  /** Still open, with RENEW_REMINDER_DAYS or fewer left. */
  | 'expiring'
  /** The date has passed. The shop is paused until she renews. */
  | 'expired'

export function subscriptionState(
  s: Pick<Seller, 'subscriptionEndsAt'>,
  now = Date.now(),
): SubscriptionState {
  if (!s.subscriptionEndsAt) return 'none'
  const left = new Date(s.subscriptionEndsAt).getTime() - now
  if (left <= 0) return 'expired'
  if (left <= RENEW_REMINDER_DAYS * DAY) return 'expiring'
  return 'active'
}

export function isExpired(s: Pick<Seller, 'subscriptionEndsAt'>, now = Date.now()): boolean {
  return subscriptionState(s, now) === 'expired'
}

/**
 * May the public buy from her right now?
 *
 * The one question every public route asks. An account decision (approved,
 * not blocked) AND a date. `none` does not close anything on its own: a
 * seller with no term has never been approved, so `status` already keeps her
 * off the shelf.
 */
export function canSellNow(
  s: Pick<Seller, 'status' | 'subscriptionEndsAt'>,
  now = Date.now(),
): boolean {
  return s.status === 'ACTIVE' && !isExpired(s, now)
}

/** What a screen needs to know, decided on the server's clock. */
export interface SubscriptionView {
  state: SubscriptionState
  endsAt?: string
  /** Whole days until the shop pauses, rounded up; 0 once it has. */
  daysLeft?: number
  /** When the reminder started showing - what the updates list timestamps it by. */
  remindFrom?: string
}

export function subscriptionView(
  s: Pick<Seller, 'subscriptionEndsAt'>,
  now = Date.now(),
): SubscriptionView {
  const state = subscriptionState(s, now)
  if (!s.subscriptionEndsAt) return { state }
  const end = new Date(s.subscriptionEndsAt).getTime()
  return {
    state,
    endsAt: s.subscriptionEndsAt,
    daysLeft: Math.max(0, Math.ceil((end - now) / DAY)),
    remindFrom: new Date(end - RENEW_REMINDER_DAYS * DAY).toISOString(),
  }
}

/* ------------------------------------------------------------------ */
/* Paying                                                              */
/* ------------------------------------------------------------------ */

/**
 * - `PACK`    - ₹50 for five more slots. The first one also starts her term.
 * - `RENEWAL` - ₹50 for six more months of everything she already has.
 */
export type PaymentKind = 'PACK' | 'RENEWAL'

/**
 * Renewal opens with the reminder, not before.
 *
 * Six months are counted from approval, so a renewal paid in month two would
 * either be wasted or bank time she has not asked for. From the reminder on,
 * paying is what she is being asked to do - and an early renewal adds its six
 * months to the END of the current term, so the days she had left are kept.
 */
export function renewalOpen(s: Pick<Seller, 'subscriptionEndsAt'>, now = Date.now()): boolean {
  const state = subscriptionState(s, now)
  return state === 'expiring' || state === 'expired'
}

/**
 * What she may pay for right now, most urgent first.
 *
 * An expired shop can only renew: five more slots in a shop nobody can see is
 * money for nothing. Once it is open again the pack is there as before.
 */
export function payableKinds(
  s: Pick<Seller, 'subscriptionEndsAt'>,
  slotsLeft: number,
  now = Date.now(),
): PaymentKind[] {
  if (isExpired(s, now)) return ['RENEWAL']
  const kinds: PaymentKind[] = []
  if (renewalOpen(s, now)) kinds.push('RENEWAL')
  if (slotsLeft <= 0) kinds.push('PACK')
  return kinds
}

/** Why she may not pay for this now, in Marathi, or null. */
export function paymentKindProblem(
  kind: PaymentKind,
  s: Pick<Seller, 'subscriptionEndsAt'>,
  slotsLeft: number,
  now = Date.now(),
): string | null {
  if (payableKinds(s, slotsLeft, now).includes(kind)) return null
  if (kind === 'RENEWAL') return 'वर्गणी संपण्याच्या 7 दिवस आधीपासून नूतनीकरण करता येते.'
  if (isExpired(s, now)) return 'आधी वर्गणीचे नूतनीकरण करा. त्यानंतर आणखी जागा घेता येतील.'
  return `तुमच्याकडे अजून ${slotsLeft} जागा शिल्लक आहेत. आत्ता पैसे भरण्याची गरज नाही.`
}

/**
 * The end date an approved payment leaves her with.
 *
 * - No term yet: this approval starts one, whatever was bought.
 * - Shop already paused: six months from today. She paid ₹50 to a closed
 *   shop, and it reopens - even if what she sent was a pack submitted before
 *   the date passed and approved after it.
 * - Renewal while still open: six months after the CURRENT end, so renewing
 *   on day 175 does not throw away the last week she paid for.
 * - A pack mid-term: the date does not move. A pack is slots, not time.
 */
export function endsAtAfterApproval(
  s: Pick<Seller, 'subscriptionEndsAt'>,
  kind: PaymentKind,
  approvedAt: string,
): string | undefined {
  const at = new Date(approvedAt).getTime()
  if (!s.subscriptionEndsAt) return addMonths(approvedAt, SUBSCRIPTION_MONTHS)
  if (isExpired(s, at)) return addMonths(approvedAt, SUBSCRIPTION_MONTHS)
  if (kind === 'RENEWAL') return addMonths(s.subscriptionEndsAt, SUBSCRIPTION_MONTHS)
  return s.subscriptionEndsAt
}
