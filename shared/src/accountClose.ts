import type { Order, OrderStatus } from './types.js'

/**
 * CLOSING AN ACCOUNT
 * ==================
 * Google Play requires that an app which lets people make an account lets them
 * delete it, from inside the app and from a web page anyone can open. This
 * file is the rule both sides read; `backend/src/db/accountClose.ts` applies it.
 *
 * WHAT "DELETED" MEANS HERE. The row stays and the person is erased. Three
 * reasons, in order of weight:
 *
 * 1. A past order is the BUYER's record as much as the farmer's, so it
 *    outlives the farmer's account; the privacy policy says so.
 * 2. Removing rows can be REFUSED. A single persist may not delete more than
 *    half a collection (`isBulkDelete`), and a farmer with five listings in a
 *    small catalogue is more than half of it. A delete that sometimes does not
 *    delete is worse than none.
 * 3. Orders and the admin console look a farmer up by id. An id pointing at
 *    nothing is a blank shop name on somebody else's order screen.
 *
 * So `scrubFarmer` empties every field that is *the person* - phone, name, photo,
 * address, UPI, the questionnaire and FDRI answers, an admin's notes about them - and leaves
 * an id, a status of CLOSED and the money trail. The phone number goes back
 * into circulation: registration checks it against stored phones, and this one is
 * now blank, so the farmer can start again from scratch if they ever want to.
 *
 * THE SEVEN DAYS. The shop closes the moment the farmer asks - hidden from the
 * catalogue, signed out everywhere - but the erasing happens a week later, and
 * signing in during that week offers to stop it. Two confirmation screens and
 * four typed digits stop a stray tap; nothing but time helps a farmer who
 * tapped through all of them without understanding what the shop was worth to
 * them. A customer gets no window: an address list is not a livelihood.
 */

export const UNDO_DAYS = 7

/** What the farmer is asked before it happens. Codes, so each side reads its own language. */
export const CLOSE_REASONS = [
  'not_selling',
  'too_hard',
  'no_orders',
  'made_another',
  'personal',
  'other',
] as const

export type CloseReason = (typeof CLOSE_REASONS)[number]

export const CLOSE_NOTE_MIN = 5
export const CLOSE_NOTE_MAX = 200

/** Dictionary key for a reason code. */
export function closeReasonKey(reason: string): string {
  return `close.reason.${reason}`
}

/**
 * An order nobody has to do anything about any more.
 *
 * Deleting an account with an order in flight strands the other side: a buyer
 * waiting for a delivery, or a farmer who has harvested for one. The farmer finishes or
 * cancels it first - both are buttons they already have.
 */
export function orderIsFinished(status: OrderStatus): boolean {
  return status === 'DELIVERED' || status === 'REJECTED' || status === 'CANCELLED'
}

export function openOrders(orders: Order[]): Order[] {
  return orders.filter((o) => !orderIsFinished(o.status))
}

/**
 * THE LAST STEP: the final four digits of their own number.
 *
 * Every other candidate was worse for this reader. Typing a whole word is a
 * literacy test. Asking for the password again
 * is one more thing to remember, and it proves only possession of a phone they are already signed in on. Their own number they
 * know by heart, and four correct digits are not something a thumb produces
 * by accident in a kitchen.
 *
 * Checked on the server too, because the app can be bypassed.
 */
export function confirmDigits(phone: string): string {
  return phone.replace(/\D/g, '').slice(-4)
}

export function confirmProblem(phone: string, typed: unknown): string | null {
  const digits = typeof typed === 'string' ? typed.replace(/\D/g, '') : ''
  if (digits.length !== 4) return 'तुमच्या नंबरचे शेवटचे 4 अंक टाका'
  if (digits !== confirmDigits(phone)) return 'हे अंक तुमच्या नंबरशी जुळत नाहीत'
  return null
}

/** What is wrong with the reason they picked, in Marathi, or null. */
export function closeReasonProblem(reason: unknown, note: unknown): string | null {
  if (typeof reason !== 'string' || !(CLOSE_REASONS as readonly string[]).includes(reason)) {
    return 'खाते बंद करण्याचे कारण निवडा'
  }
  if (reason !== 'other') return null
  const text = typeof note === 'string' ? note.trim() : ''
  if (text.length < CLOSE_NOTE_MIN) return 'कारण थोडक्यात लिहा'
  if (text.length > CLOSE_NOTE_MAX) return `कारण ${CLOSE_NOTE_MAX} अक्षरांपेक्षा लहान लिहा`
  return null
}

/** When the erasing happens, given the moment they asked. */
export function scrubDueAt(requestedAt: number): string {
  return new Date(requestedAt + UNDO_DAYS * 24 * 60 * 60 * 1000).toISOString()
}

/** Days left of the window, rounded up, never below zero - what their screen says. */
export function daysUntilScrub(closingAt: string, now = Date.now()): number {
  const left = new Date(closingAt).getTime() - now
  return left <= 0 ? 0 : Math.ceil(left / (24 * 60 * 60 * 1000))
}

/**
 * Every field on a farmer that is the person rather than the shop's history.
 *
 * One list so that the scrub and the test that guards it cannot drift: a field
 * added to `Farmer` and forgotten here is a phone number surviving a deletion,
 * and `backend/tests/account-close.test.ts` fails the day that happens.
 *
 * `shopName` and `name` are not in it - they are replaced by a placeholder
 * rather than emptied, because a buyer's own order screen still has to say who
 * they bought from. `farmerCode` stays: it is the programme's serial, it is
 * printed on packaging that has already gone out, and it names a village, not
 * a person.
 */
export const FARMER_PII_FIELDS = [
  'phone',
  'whatsapp',
  'photo',
  'ageGroup',
  'education',
  'landholding',
  'farmerTypes',
  'sellingChannels',
  'problems',
  'crops',
  'village',
  'villageCode',
  'taluka',
  'district',
  'pincode',
  'lat',
  'lng',
  'locationConsent',
  'about',
  'upiId',
  'upiQrUrl',
  'upiQrPublicId',
  'fdri',
  'pincodes',
  'notices',
  'blockReason',
] as const

/** And for the buyer's copies carried on an order they placed. */
export const ORDER_BUYER_PII_FIELDS = ['customerPhone', 'address'] as const
