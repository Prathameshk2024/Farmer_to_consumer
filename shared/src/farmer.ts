import type { Product, ProductStatus, Farmer, Unit } from './types.js'
import { upiProblem } from './payment.js'
import { cropById } from './crops.js'

/**
 * Selling is free. There are no packs, slots or edit limits: a farmer who can
 * sell may list, change and remove his produce as often as the day needs.
 */
export function farmerMayDelete(_status: ProductStatus): boolean {
  return true
}

/**
 * WHAT SIZE IS IT? The one question a price cannot answer on its own.
 *
 * `packSize` counts in the listing's own unit - 500 with `g`, 1 with `set` -
 * and a SET needs one more number: a set of four ladoos and a set of twenty
 * are the same word, and only the farmer knows which she is selling.
 *
 * Both sides read these two functions, so the wizard, the edit screen and the
 * server cannot drift apart on what counts as a complete listing.
 */
export function needsPieceCount(unit: Unit): boolean {
  return unit === 'set'
}

export function sizeProblems(
  p: Pick<Partial<Product>, 'unit' | 'packSize' | 'piecesPerPack'>,
): Record<string, string> {
  const fields: Record<string, string> = {}
  const size = Number(p.packSize ?? 0)
  if (!Number.isFinite(size) || size <= 0) fields.packSize = 'किती ते लिहा'
  const pieces = Number(p.piecesPerPack ?? 0)
  if (p.unit && needsPieceCount(p.unit) && (!Number.isFinite(pieces) || pieces <= 0)) {
    fields.piecesPerPack = 'एका सेटमध्ये किती नग ते लिहा'
  }
  return fields
}

/**
 * A FOOD LICENCE NUMBER, IF SHE HAS ONE.
 *
 * Optional, and that is the whole design: a home kitchen under the FSSAI
 * turnover threshold does not need a licence, and demanding one would close
 * this market to most of the women it was built for. Blank is always fine.
 *
 * What is NOT fine is a wrong one. An FSSAI licence is exactly 14 digits, and
 * a buyer who reads a number off a listing and checks it against the FSSAI
 * register learns something only if the digits are real - so a number that
 * cannot be one is refused rather than quietly published. Spaces come out,
 * because that is how it is printed on a certificate.
 */
export const FSSAI_DIGITS = 14

export function normalizeFssai(raw: unknown): string {
  return String(raw ?? '').replace(/[\s-]/g, '')
}

export function fssaiProblem(raw: unknown): string | null {
  const value = normalizeFssai(raw)
  if (!value) return null
  return /^\d{14}$/.test(value) ? null : `FSSAI क्रमांक ${FSSAI_DIGITS} अंकांचा असतो`
}


/**
 * A verified farmer's listing is on sale the moment he sends it. The person
 * check happens once, on the farmer (POST /admin/farmers/:id/verify), and
 * a listing that turns out wrong is reported and taken down.
 */
export function initialListingStatus(asDraft: boolean): ProductStatus {
  return asDraft ? 'DRAFT' : 'LIVE'
}

/** May buyers see and order from this farmer right now? */
export function canSellNow(s: Pick<Farmer, 'status'>): boolean {
  return s.status === 'ACTIVE'
}

/** A listing's state, drawn as a line icon the app names - never an emoji. */
export type ProductStatusIconName = 'live' | 'draft' | 'paused'

export const PRODUCT_STATUS_STYLE: Record<
  ProductStatus,
  { tone: 'neutral' | 'info' | 'warn' | 'ok' | 'danger'; icon: ProductStatusIconName; labelKey: string }
> = {
  LIVE: { tone: 'ok', icon: 'live', labelKey: 'prod.live' },
  DRAFT: { tone: 'neutral', icon: 'draft', labelKey: 'prod.draft' },
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
  // same ten digits she types at login.
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
 * IS THIS SOMEWHERE SHE COULD PLAUSIBLY DELIVER?
 *
 * Maharashtra pincodes start 40 through 44. Inside that, the decision is the
 * farmer's: the order reaches them and they accept or rejects it, whatever
 * their listed delivery areas say - a woman in 413004 knows perfectly well
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
 * useful thing to put under an input she has already typed once.
 */
export function isValidUpi(value: string | undefined): boolean {
  return upiProblem(value) === null
}

/**
 * Build the UPI intent link for an order.
 *
 * Generated from her stored UPI ID rather than the QR image she uploaded,
 * because a generated link carries the exact amount. An uploaded screenshot has
 * no amount in it, so the customer types it by hand and can get it wrong.
 *
 * No `tr`. A transaction reference is a merchant field, and every payee here
 * is a personal UPI ID: a merchant field on a person's address is one more
 * thing a UPI app's risk check reads as a fake shop. The order id still
 * travels, in `tn`, which is what her bank statement shows anyway.
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

/**
 * WHAT SHE MAY CHANGE ABOUT HERSELF, AND WHAT IT HAS TO LOOK LIKE.
 *
 * The allow-list on `PATCH /farmers/me` decides WHICH fields can move - her
 * status and her farmer code are not on it and never will be. This
 * decides whether the values she sent make sense, and it runs on both sides
 * for the usual two reasons: the form can say "10 digits" the instant she types
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
    | 'upiId' | 'pincodes'
  >>,
): Record<string, string> {
  const f: Record<string, string> = {}
  const blank = (v: unknown) => typeof v === 'string' && !v.trim()

  // Present-but-empty is the failure. An absent key means "not editing this".
  if ('name' in p && blank(p.name)) f.name = 'नाव आवश्यक आहे'
  if ('shopName' in p && blank(p.shopName)) f.shopName = 'दुकानाचे नाव आवश्यक आहे'

  if (p.whatsapp && !isValidPhone(p.whatsapp)) f.whatsapp = '10 अंकी मोबाईल नंबर टाका'
  // The reason, not "बरोबर नाही" - a second rejection of the same string with
  // the same words behind it is where she stops trying and puts in a wrong one.
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

  // She delivers to pincodes, so a typo here is an order she never receives.
  if (p.pincodes && p.pincodes.some((code) => !isValidPincode(code))) {
    f.pincodes = '6 अंकी पिनकोड टाका'
  }

  return f
}
