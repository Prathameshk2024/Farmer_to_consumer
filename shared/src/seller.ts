import type { Product, ProductStatus, Seller, Unit } from './types.js'
import { upiProblem } from './payment.js'
import { SUBSCRIPTION_MONTHS } from './subscription.js'

/**
 * SUBSCRIPTION + PRODUCT SLOTS
 * 50 rupees buys one PACK = 5 product slots. A 6th product means a second pack.
 * No gateway: she pays the admin's account and admin approves by hand.
 *
 * The shop stays open for SUBSCRIPTION_MONTHS from approval, and a flat ₹50
 * renews every pack she has - see shared/src/subscription.ts.
 */

export const PLAN = {
  price: 50,
  slotsPerPack: 5,
  /** How long one approval keeps the shop open. Sent to her subscription screen. */
  months: SUBSCRIPTION_MONTHS,
}

/**
 * Which product states consume a slot. ONE PRODUCT, ONE SLOT, FOR GOOD.
 *
 * A slot is spent when she submits a listing and stays spent while it is
 * waiting, live or paused. She cannot give it back herself: a seller who could
 * delete a listing and put up another had a pack of five that was really a
 * pack of as many as she liked.
 *
 * Only an admin frees one, by rejecting a listing or taking a live one down.
 * REJECTED is therefore absent - the slot comes back the moment the decision
 * is made, not when the rejected row is swept 48 hours later. That is also
 * what stops a woman with a bad listing being stuck: she asks, and an admin
 * takes it down.
 *
 * DRAFT does not consume one either, so she can experiment before paying.
 */
export const SLOT_CONSUMING: ProductStatus[] = ['PENDING', 'LIVE', 'PAUSED']

/**
 * The only listing a seller may delete herself: a draft. It holds no slot and
 * nobody but her has seen it, so removing it frees nothing and hides nothing.
 */
export function sellerMayDelete(status: ProductStatus): boolean {
  return status === 'DRAFT'
}

export function countUsedSlots(products: Pick<Product, 'status'>[]): number {
  return products.filter((p) => SLOT_CONSUMING.includes(p.status)).length
}

export interface SlotInfo {
  total: number
  used: number
  left: number
  isFull: boolean
  almostFull: boolean
}

export function slotInfo(
  seller: Pick<Seller, 'packsApproved'>,
  products: Pick<Product, 'status'>[],
): SlotInfo {
  const total = (seller.packsApproved || 0) * PLAN.slotsPerPack
  const used = countUsedSlots(products)
  return {
    total,
    used,
    left: Math.max(0, total - used),
    isFull: total > 0 && used >= total,
    almostFull: total > 0 && total - used === 1,
  }
}

/**
 * EDITING A PUBLISHED LISTING IS LIMITED. WHY.
 *
 * A slot is one listing live at a time, so editing never wins a seller a
 * second listing - but it does let one paid slot become an endless stream of
 * different products: mango pickle in summer, lemon pickle in winter, out of
 * one ₹50 pack for ever. Two edits is the line between fixing a listing and
 * replacing it.
 *
 * PRICE AND STOCK ARE DELIBERATELY EXEMPT. They change with the market and
 * with what is left on the shelf, and a seller who has spent her two edits
 * cannot be left unable to correct a price - she would stop keeping either
 * number honest, which costs the buyer and the platform more than a rotated
 * listing ever could.
 */
export const MAX_EDITS = 2

/**
 * The fields that spend an edit. Everything absent from this list - price,
 * stock, pausing, unpausing - stays free for the life of the listing.
 */
export const EDIT_COUNTED_FIELDS = [
  'name', 'nameEn', 'categoryId', 'imageUrl', 'imagePublicId', 'emoji',
  'ingredients', 'vegType', 'material', 'unit', 'mrp', 'madeToOrder',
  // The size is what the price MEANS. Moving 500g to 250g at the same price
  // is a different product, not a correction, so it is counted like the unit
  // beside it - and like the unit, the price itself stays free to change.
  'packSize', 'piecesPerPack',
] as const

/**
 * Did this save change anything an edit is counted for?
 *
 * Compares VALUES, not keys: the edit form posts the whole product on every
 * save, so a seller who opens the screen, changes her mind and saves would
 * otherwise lose an edit to a save that changed nothing.
 */
export function countsAsEdit(
  before: Partial<Product>,
  after: Partial<Product>,
): boolean {
  return EDIT_COUNTED_FIELDS.some((f) => (f in after) && !sameValue(before[f], after[f]))
}

/**
 * Equal for the purpose of spending an edit.
 *
 * Blank is blank however it is spelled. A listing from before MRP was
 * optional carries `undefined` where the form now posts `0`, and whitespace
 * round a name is not a change to the name - counting either would take an
 * edit from a seller who changed nothing she can see.
 */
function sameValue(a: unknown, b: unknown): boolean {
  const blank = (v: unknown) =>
    v === undefined || v === null || v === '' || v === 0 || v === false
  if (blank(a) || blank(b)) return blank(a) && blank(b)
  if (typeof a === 'string' && typeof b === 'string') return a.trim() === b.trim()
  if (typeof a === 'number' || typeof b === 'number') return Number(a) === Number(b)
  return a === b
}

/** Edits still available. Listings that predate this rule start with all of them. */
export function editsLeft(product: Pick<Product, 'editCount'>): number {
  return Math.max(0, MAX_EDITS - (product.editCount ?? 0))
}

/**
 * Only a listing the public can see is rationed.
 *
 * A DRAFT is not published yet, and a REJECTED listing is being FIXED - an
 * admin took it down and told her why, so charging her an edit to answer that
 * could leave her unable to repair the very thing she was told to repair.
 */
export function editsAreLimited(status: ProductStatus): boolean {
  return status === 'LIVE' || status === 'PAUSED'
}

/**
 * WHERE A LISTING LANDS WHEN SHE PRESSES PUBLISH.
 *
 * Never `LIVE`. Listings published themselves for a while, on the grounds that
 * a moderation queue puts a desk between a seller and her first customer -
 * true, and outweighed by what is on a listing: a photograph, a price, and on
 * food an ingredients claim that carries this market's name. Somebody looks
 * before a shopper does.
 *
 * A draft is not a submission, so it lands where she left it.
 */
/**
 * WHAT SIZE IS IT? The one question a price cannot answer on its own.
 *
 * `packSize` counts in the listing's own unit - 500 with `g`, 1 with `set` -
 * and a SET needs one more number: a set of four ladoos and a set of twenty
 * are the same word, and only the seller knows which she is selling.
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

export function initialListingStatus(asDraft: boolean): ProductStatus {
  return asDraft ? 'DRAFT' : 'PENDING'
}

/** A listing's state, drawn as a line icon the app names - never an emoji. */
export type ProductStatusIconName = 'live' | 'draft' | 'pending' | 'rejected' | 'paused'

export const PRODUCT_STATUS_STYLE: Record<
  Exclude<ProductStatus, 'ARCHIVED'>,
  { tone: 'neutral' | 'info' | 'warn' | 'ok' | 'danger'; icon: ProductStatusIconName; labelKey: string }
> = {
  LIVE: { tone: 'ok', icon: 'live', labelKey: 'prod.live' },
  DRAFT: { tone: 'neutral', icon: 'draft', labelKey: 'prod.draft' },
  PENDING: { tone: 'warn', icon: 'pending', labelKey: 'prod.pending' },
  REJECTED: { tone: 'danger', icon: 'rejected', labelKey: 'prod.rejected' },
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
 * The phone IS the account here - it is what login looks a seller up by - so
 * "98765 43210", "+91 9876543210" and "9876543210" have to resolve to one
 * value. They did not, which is why sellers who had already registered were
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
 * A shop description composed from what she told us at registration.
 *
 * `about` is optional, and most women skip it - it is the one free-text field
 * in a long form, on a phone, in Marathi. Left empty her shop opens with a
 * name and nothing else, which reads to a customer like an abandoned listing.
 *
 * This only fills the gap; anything she writes herself replaces it.
 */
export function defaultAbout(s: {
  shopName: string
  village: string
  businessType?: 'individual' | 'shg' | 'udyam'
  shgName?: string
  sellsFood?: boolean
  yearsInBusiness?: number
}): string {
  const parts: string[] = []

  parts.push(
    s.sellsFood
      ? `${s.shopName} - ${s.village} येथून घरगुती पदार्थ.`
      : `${s.shopName} - ${s.village} येथून हस्तनिर्मित वस्तू.`,
  )

  if (s.businessType === 'shg' && s.shgName?.trim()) {
    parts.push(`${s.shgName.trim()} या बचत गटाच्या सदस्या.`)
  }

  if (s.yearsInBusiness && s.yearsInBusiness > 0) {
    parts.push(`${s.yearsInBusiness} वर्षांचा अनुभव.`)
  }

  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

export function isValidPincode(value: string | undefined): boolean {
  return /^[1-9]\d{5}$/.test(String(value ?? '').trim())
}

/**
 * IS THIS SOMEWHERE SHE COULD PLAUSIBLY DELIVER?
 *
 * Maharashtra pincodes start 40 through 44. Inside that, the decision is the
 * seller's: the order reaches them and they accept or rejects it, whatever
 * their listed delivery areas say - a woman in 413004 knows perfectly well
 * whether they can reach 413002, and the server guessing on their behalf
 * refused orders they wanted.
 *
 * Outside it, the order is refused before the seller ever sees it.
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

/** Education options - kept short, and phrased the way a survey would ask. */
export const EDUCATION_LEVELS: { value: string; mr: string; en: string }[] = [
  { value: 'none', mr: 'शिक्षण नाही', en: 'No formal schooling' },
  { value: 'primary', mr: '4 थीपर्यंत', en: 'Up to 4th' },
  { value: 'middle', mr: '7 वीपर्यंत', en: 'Up to 7th' },
  { value: 'secondary', mr: '10 वी', en: '10th' },
  { value: 'higher', mr: '12 वी', en: '12th' },
  { value: 'graduate', mr: 'पदवी', en: 'Graduate' },
]

/**
 * WHAT SHE MAY CHANGE ABOUT HERSELF, AND WHAT IT HAS TO LOOK LIKE.
 *
 * The allow-list on `PATCH /sellers/me` decides WHICH fields can move - her
 * status, her slots and her SMB ID are not on it and never will be. This
 * decides whether the values she sent make sense, and it runs on both sides
 * for the usual two reasons: the form can say "18 to 90" the instant she types
 * it, and the server can refuse a delivery fee of -500 typed by something that
 * is not the form.
 *
 * Returns Marathi messages keyed by field, which is the shape `{ fields }` in
 * an API error already has, so a server refusal drops straight into the same
 * red text under the same box.
 */
export function validateSellerProfile(
  p: Partial<Pick<Seller,
    | 'name' | 'shopName' | 'about' | 'whatsapp' | 'age' | 'yearsInBusiness'
    | 'monthlyCapacity' | 'deliveryFee' | 'freeDeliveryAbove' | 'minOrder'
    | 'upiId' | 'pincodes'
  >>,
): Record<string, string> {
  const f: Record<string, string> = {}
  const blank = (v: unknown) => typeof v === 'string' && !v.trim()

  // Present-but-empty is the failure. An absent key means "not editing this".
  if ('name' in p && blank(p.name)) f.name = 'नाव आवश्यक आहे'
  if ('shopName' in p && blank(p.shopName)) f.shopName = 'दुकानाचे नाव आवश्यक आहे'

  if (p.age != null && (p.age < 18 || p.age > 90)) f.age = 'वय 18 ते 90 दरम्यान असावे'
  if (p.whatsapp && !isValidPhone(p.whatsapp)) f.whatsapp = '10 अंकी मोबाईल नंबर टाका'
  // The reason, not "बरोबर नाही" - a second rejection of the same string with
  // the same words behind it is where she stops trying and puts in a wrong one.
  if ('upiId' in p) {
    const problem = upiProblem(p.upiId)
    if (problem) f.upiId = problem
  }

  // Money and counts: never negative, and never a number that is not one.
  const positive: [keyof typeof p, string][] = [
    ['yearsInBusiness', 'वर्षे बरोबर लिहा'],
    ['monthlyCapacity', 'संख्या बरोबर लिहा'],
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
