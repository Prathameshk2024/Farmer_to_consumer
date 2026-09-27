import type { ProductStatus, Farmer, Product } from './types.js'
import { upiProblem } from './payment.js'
import { cropById } from './crops.js'
import { SUBSCRIPTION_MONTHS } from './subscription.js'

/**
 * Selling is free. There are no packs, slots or edit limits: a farmer who can
 * sell may list, change and remove their produce as often as the day needs.
 */
export function farmerMayDelete(_status: ProductStatus): boolean {
  return true
}


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

/**
 * A verified farmer's listing is on sale the moment they send it. The person
 * check happens once, on the farmer (POST /admin/farmers/:id/verify), and
 * a listing that turns out wrong is reported and taken down.
 */
export function initialListingStatus(asDraft: boolean): ProductStatus {
  return asDraft ? 'DRAFT' : 'LIVE'
}

/** A listing's state, drawn as a line icon the app names - never an emoji. */
export type ProductStatusIconName = 'live' | 'draft' | 'paused' | 'pending'

export const PRODUCT_STATUS_STYLE: Record<
  ProductStatus,
  { tone: 'neutral' | 'info' | 'warn' | 'ok' | 'danger'; icon: ProductStatusIconName; labelKey: string }
> = {
  LIVE: { tone: 'ok', icon: 'live', labelKey: 'prod.live' },
  DRAFT: { tone: 'neutral', icon: 'draft', labelKey: 'prod.draft' },
  PENDING: { tone: 'warn', icon: 'pending', labelKey: 'prod.pending' },
  PAUSED: { tone: 'neutral', icon: 'paused', labelKey: 'prod.paused' },
}


/* ------------------------------------------------------------------ */
/* Validation - used by BOTH sides. The client validates for a fast,   */
/* friendly message; the server validates because the client can lie.  */
/* ------------------------------------------------------------------ */


/** Indian mobile: 10 digits starting 6-9. */
export function isValidPhone(value: string | undefined): boolean {
  return /^[6-9]\d{9}$/.test(normalizePhone(value))
}

/**
 * The ten digits of an Indian mobile number, and nothing else.
 *
 * The phone IS the account here - it is what login looks a farmer up by - so
 * "98765 43210", "+91 9876543210" and "9876543210" have to resolve to one
 * value. They did not, which is why farmers who had already registered were
 * being sent back through registration: the stored string and the typed one
 * never matched.
 */
export function normalizePhone(value: string | undefined): string {
  const digits = String(value ?? '').replace(/\D/g, '')
  // Strip a country code or a trunk prefix, so the stored number is always the
  // same ten digits they type at login.
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2)
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1)
  return digits
}

/** Whether two spellings mean the same number. Empty never matches empty. */
export function samePhone(a: string | undefined, b: string | undefined): boolean {
  const left = normalizePhone(a)
  if (!left) return false
  return left === normalizePhone(b)
}

/**
 * A shop description composed from what the farmer told us at registration.
 *
 * `about` is optional and most people skip it. Left empty, the shop opens
 * with a name and nothing else, which reads to a buyer like an abandoned
 * listing. This only fills the gap; anything the farmer writes replaces it.
 */
export function defaultAbout(s: { shopName: string; village: string; crops?: string[] }): string {
  const crops = (s.crops ?? [])
    .map((id) => cropById(id))
    .filter((c) => c && c.id !== 'other')
    .map((c) => c!.mr)
  const parts = [`${s.shopName} - ${s.village} येथून थेट शेतमाल.`]
  if (crops.length) parts.push(`${crops.join(', ')}.`)
  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

export function isValidPincode(value: string | undefined): boolean {
  return /^[1-9]\d{5}$/.test(String(value ?? '').trim())
}

/**
 * IS THIS SOMEWHERE THE FARMER COULD PLAUSIBLY DELIVER?
 *
 * Maharashtra pincodes start 40 through 44. Inside that, the decision is the
 * farmer's: the order reaches them and they accept or reject it, whatever
 * their listed delivery areas say - a farmer in 413004 knows perfectly well
 * whether they can reach 413002, and the server guessing on their behalf
 * refused orders they wanted.
 *
 * Outside it, the order is refused before the farmer ever sees it.
 *
 * 403xxx is the exception: that band is Goa, not Maharashtra, and it sits
 * inside 40-44 by an accident of postal numbering.
 */
export function isMaharashtraPincode(value: string | undefined): boolean {
  const code = String(value ?? '').trim()
  return /^4[0-4]\d{4}$/.test(code) && !code.startsWith('403')
}

/**
 * UPI virtual payment address, e.g. sunita@ybl
 *
 * Every caller that only needs yes/no stays on this; `upiProblem` in
 * payment.js is the same check and says WHICH part is wrong, which is the only
 * useful thing to put under an input they have already typed once.
 */
export function isValidUpi(value: string | undefined): boolean {
  return upiProblem(value) === null
}

/**
 * Build the UPI intent link for an order.
 *
 * Generated from the farmer's stored UPI ID rather than the QR image they uploaded,
 * because a generated link carries the exact amount. An uploaded screenshot has
 * no amount in it, so the customer types it by hand and can get it wrong.
 *
 * No `tr`. A transaction reference is a merchant field, and every payee here
 * is a personal UPI ID: a merchant field on a person's address is one more
 * thing a UPI app's risk check reads as a fake shop. The order id still
 * travels, in `tn`, which is what their bank statement shows anyway.
 */
export function buildUpiLink(opts: {
  upiId: string
  name?: string
  amount: number
  note?: string
}): string {
  const p = new URLSearchParams({
    pa: opts.upiId,
    pn: opts.name ?? '',
    am: Number(opts.amount).toFixed(2),
    cu: 'INR',
  })
  if (opts.note) p.set('tn', opts.note)
  return `upi://pay?${p.toString()}`
}

/** The pickup place is a phrase: "अणदूर बस स्थानकाजवळ". */
export const PICKUP_PLACE_MIN = 3
export const PICKUP_PLACE_MAX = 120

/**
 * WHAT A FARMER MAY CHANGE ABOUT THEMSELVES, AND WHAT IT HAS TO LOOK LIKE.
 *
 * The allow-list on `PATCH /farmers/me` decides WHICH fields can move - their
 * status and farmer code are not on it and never will be. This
 * decides whether the values they sent make sense, and it runs on both sides
 * for the usual two reasons: the form can say "10 digits" the instant they type
 * it, and the server can refuse a delivery fee of -500 typed by something that
 * is not the form.
 *
 * Returns Marathi messages keyed by field, which is the shape `{ fields }` in
 * an API error already has, so a server refusal drops straight into the same
 * red text under the same box.
 */
export function validateFarmerProfile(
  p: Partial<Pick<Farmer,
    | 'name' | 'shopName' | 'about' | 'whatsapp'
    | 'deliveryFee' | 'freeDeliveryAbove' | 'minOrder'
    | 'upiId' | 'pincodes' | 'offersDelivery' | 'pickup'
  >>,
): Record<string, string> {
  const f: Record<string, string> = {}
  const blank = (v: unknown) => typeof v === 'string' && !v.trim()

  // Present-but-empty is the failure. An absent key means "not editing this".
  if ('name' in p && blank(p.name)) f.name = 'नाव आवश्यक आहे'
  if ('shopName' in p && blank(p.shopName)) f.shopName = 'दुकानाचे नाव आवश्यक आहे'

  if (p.whatsapp && !isValidPhone(p.whatsapp)) f.whatsapp = '10 अंकी मोबाईल नंबर टाका'
  // The reason, not "बरोबर नाही" - a second rejection of the same string with
  // the same words behind it is where the farmer stops trying and puts in a wrong one.
  if ('upiId' in p) {
    const problem = upiProblem(p.upiId)
    if (problem) f.upiId = problem
  }

  // Money and counts: never negative, and never a number that is not one.
  const positive: [keyof typeof p, string][] = [
    ['deliveryFee', 'रक्कम बरोबर लिहा'],
    ['freeDeliveryAbove', 'रक्कम बरोबर लिहा'],
    ['minOrder', 'रक्कम बरोबर लिहा'],
  ]
  for (const [key, message] of positive) {
    const v = p[key]
    if (v == null) continue
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) f[key as string] = message
  }

  // The farmer delivers to pincodes, so a typo here is an order they never receive.
  if (p.pincodes && p.pincodes.some((code) => !isValidPincode(code))) {
    f.pincodes = '6 अंकी पिनकोड टाका'
  }

  if (p.pickup) {
    const n = p.pickup.place.trim().length
    if (n < PICKUP_PLACE_MIN || n > PICKUP_PLACE_MAX) f.pickupPlace = 'माल कुठून न्यायचा ते थोडक्यात लिहा'
  }
  // A shop that neither delivers nor lets anyone collect takes no orders.
  // Judged only when both are in hand, so a partial edit is not refused.
  if ('offersDelivery' in p && 'pickup' in p && p.offersDelivery === false && !p.pickup) {
    f.fulfilment = 'घरपोच किंवा शेतावरून नेणे - किमान एक निवडा'
  }

  return f
}
