import type { Order, OrderEvent, OrderStatus } from './types.js'

/**
 * CALLING AN ORDER OFF
 * ====================
 * Two people can end an order early, at different moments and for different
 * reasons, and both land on the one CANCELLED state the machine already has.
 * The event's `by` says who; its `reason` says why.
 *
 * THE BUYER, ONLY BEFORE SHE ACCEPTS. Until then nothing has happened: no
 * money has moved (a UPI buyer pays after acceptance) and nothing has been
 * cooked or packed. After she says yes she may already be buying ingredients,
 * so a buyer who wants out from there has to ask her - "customer asked to
 * cancel" is on her list for exactly that.
 *
 * THE SELLER, AT ANY STEP AFTER ACCEPTING, UP TO THE DOORSTEP. Before
 * acceptance she already has Reject. DELIVERED is the end: goods in the
 * buyer's hand are not un-delivered by a button, and a dispute there is a
 * conversation, not a state.
 *
 * A reason is always required, and it is picked from a list rather than typed,
 * because typing is the step these users skip or cannot do. "Other" is the
 * escape hatch, and only there is a few words of text required.
 *
 * What is stored is the CODE, not the sentence. The buyer reads the seller's
 * reason in the buyer's language, and the admin in theirs; a translated string
 * frozen into the event would be in whichever language the canceller had on.
 */

export const CUSTOMER_CANCEL_REASONS = [
  'changed_mind',
  'wrong_items',
  'wrong_address',
  'found_elsewhere',
  'taking_long',
  'other',
] as const

export const SELLER_CANCEL_REASONS = [
  'out_of_stock',
  'cannot_deliver',
  'customer_unreachable',
  'customer_asked',
  'payment_not_received',
  'emergency',
  'other',
] as const

export type CustomerCancelReason = (typeof CUSTOMER_CANCEL_REASONS)[number]
export type SellerCancelReason = (typeof SELLER_CANCEL_REASONS)[number]
export type CancelBy = 'customer' | 'seller'

/** "Other" needs words; a single letter is not a reason anybody can act on. */
export const CANCEL_NOTE_MIN = 5
export const CANCEL_NOTE_MAX = 200

export function customerCanCancel(status: OrderStatus): boolean {
  return status === 'PLACED'
}

export function sellerCanCancel(status: OrderStatus): boolean {
  return status === 'ACCEPTED' || status === 'PACKED' || status === 'OUT_FOR_DELIVERY'
}

export function canCancel(by: CancelBy, status: OrderStatus): boolean {
  return by === 'customer' ? customerCanCancel(status) : sellerCanCancel(status)
}

export function cancelReasons(by: CancelBy): readonly string[] {
  return by === 'customer' ? CUSTOMER_CANCEL_REASONS : SELLER_CANCEL_REASONS
}

/** Dictionary key for a reason code, on either side. */
export function cancelReasonKey(by: CancelBy, reason: string): string {
  return `cancel.${by}.${reason}`
}

/**
 * The event that ended this order early - a cancel by either side, or the
 * seller's reject - so both order screens can say who called it off and why.
 */
export function endingEvent(order: Pick<Order, 'status' | 'events'>): OrderEvent | undefined {
  if (order.status !== 'CANCELLED' && order.status !== 'REJECTED') return undefined
  return [...(order.events ?? [])].reverse().find((e) => e.to === order.status)
}

/**
 * WHAT THE SELLER OWES BACK ON A CANCELLED ORDER.
 *
 * This app moves no money, so it cannot refund any: whatever the buyer paid
 * is in the seller's account and only she can send it back. The sheet says so
 * the moment she cancels, and her order screen keeps saying it afterwards.
 *
 * - `confirmed` - she has already said the money arrived.
 * - `claimed`   - the buyer typed a UTR; it may or may not have arrived.
 * - `none`      - nothing was reported. Not the same as nothing was paid: a
 *                 buyer can pay before typing the UTR, or hand over cash.
 */
export type RefundOwed = 'confirmed' | 'claimed' | 'none'

export function refundOwed(order: Pick<Order, 'paymentStatus'>): RefundOwed {
  if (order.paymentStatus === 'UPI_CONFIRMED') return 'confirmed'
  if (order.paymentStatus === 'UPI_SUBMITTED') return 'claimed'
  return 'none'
}

/**
 * What is wrong with this reason, in Marathi, or null.
 *
 * Runs on both sides like the other validators: in the app so the button can
 * stay disabled while the answer is incomplete, on the server because the app
 * can be bypassed.
 */
export function cancelProblem(by: CancelBy, reason: unknown, note: unknown): string | null {
  if (typeof reason !== 'string' || !cancelReasons(by).includes(reason)) {
    return 'रद्द करण्याचे कारण निवडा'
  }
  if (reason !== 'other') return null
  const text = typeof note === 'string' ? note.trim() : ''
  if (text.length < CANCEL_NOTE_MIN) return 'कारण थोडक्यात लिहा'
  if (text.length > CANCEL_NOTE_MAX) return `कारण ${CANCEL_NOTE_MAX} अक्षरांपेक्षा लहान लिहा`
  return null
}
