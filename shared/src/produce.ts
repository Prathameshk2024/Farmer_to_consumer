import { cropById } from './crops.js'
import type { Product } from './types.js'

export type Unit = 'kg' | 'quintal' | 'dozen' | 'piece' | 'litre'
export const UNITS: Unit[] = ['kg', 'quintal', 'dozen', 'piece', 'litre']

export type Cultivation = 'organic' | 'natural' | 'chemical'
export const CULTIVATIONS: Cultivation[] = ['organic', 'natural', 'chemical']

/** Fresh produce past this is not fresh, and saying so is the buyer's protection. */
export const FRESH_MAX_DAYS = 60
const FRESH_CATEGORIES = new Set(['vegetables', 'leafy', 'fruits'])

/** Whole days since the harvest, counted on the Indian calendar the farmer reads. */
export function harvestAgeDays(harvestDate: string, now = Date.now()): number {
  const day = Date.parse(`${harvestDate}T00:00:00+05:30`)
  const today = Date.parse(`${new Date(now + 5.5 * 3_600_000).toISOString().slice(0, 10)}T00:00:00+05:30`)
  return Math.round((today - day) / 86_400_000)
}

/**
 * What is wrong with a listing, as Marathi messages keyed by field. Both the
 * wizard, the edit screen and the server read this, so they cannot drift apart
 * on what a complete listing is.
 */
export function listingProblems(p: Partial<Product>, now = Date.now()): Record<string, string> {
  const f: Record<string, string> = {}
  if (!cropById(p.cropId)) f.cropId = 'पीक निवडा'
  if (!String(p.name ?? '').trim()) f.name = 'मालाचे नाव लिहा'
  if (!UNITS.includes(p.unit as Unit)) f.unit = 'एकक निवडा'
  if (!CULTIVATIONS.includes(p.cultivation as Cultivation)) f.cultivation = 'शेती पद्धत निवडा'
  if (!(Number(p.price) > 0)) f.price = 'किंमत 0 पेक्षा जास्त असावी'
  if (!(Number.isInteger(p.stock) && p.stock! >= 0)) f.stock = 'उपलब्ध माल 0 किंवा जास्त असावा'
  if (!(Number.isInteger(p.minOrder) && p.minOrder! >= 1)) f.minOrder = 'किमान ऑर्डर 1 किंवा जास्त असावे'
  // Stock 0 is "sold out for now", not a contradiction with the minimum.
  else if (Number.isInteger(p.stock) && p.stock! > 0 && p.minOrder! > p.stock!) f.minOrder = 'किमान ऑर्डर उपलब्ध मालापेक्षा जास्त आहे'

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(p.harvestDate ?? ''))) f.harvestDate = 'काढणीची तारीख टाका'
  else {
    const age = harvestAgeDays(p.harvestDate!, now)
    // '2026-13-45' has the right shape and no day behind it.
    if (!Number.isFinite(age)) f.harvestDate = 'काढणीची तारीख टाका'
    else if (age < 0) f.harvestDate = 'काढणीची तारीख उद्याची असू शकत नाही'
    else if (FRESH_CATEGORIES.has(String(p.categoryId)) && age > FRESH_MAX_DAYS) f.harvestDate = `ताजा माल ${FRESH_MAX_DAYS} दिवसांपेक्षा जुना नसावा`
  }
  const desc = descriptionProblem(p.description)
  if (desc) f.description = desc
  return f
}

/** Same cap as a review comment: a listing is a few lines, not a pamphlet. */
export const DESCRIPTION_MAX = 500

export function descriptionProblem(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > DESCRIPTION_MAX
    ? `माहिती ${DESCRIPTION_MAX} अक्षरांपेक्षा लहान लिहा`
    : null
}

/** Unit words for server messages, which are Marathi only. */
export const UNIT_MR: Record<Unit, string> = {
  kg: 'किलो', quintal: 'क्विंटल', dozen: 'डझन', piece: 'नग', litre: 'लिटर',
}

/**
 * Why an order line's quantity cannot be sent, or null.
 *
 * The cart already steps between the minimum and the stock, but the cart runs
 * on the buyer's phone - this is the same rule where it cannot be talked
 * round. Stock is NOT decremented by an order: the farmer keeps it current.
 */
export function orderQtyProblem(
  p: Pick<Product, 'name' | 'unit' | 'minOrder' | 'stock'>,
  qty: unknown,
): string | null {
  const unit = UNIT_MR[p.unit] ?? ''
  const min = Math.max(1, Number(p.minOrder) || 1)
  const n = Number(qty)
  if (typeof qty !== 'number' || !Number.isInteger(n)) return `${p.name}: पूर्ण ${unit}मध्ये ऑर्डर करा`
  if (n > p.stock) return `${p.name}: फक्त ${p.stock} ${unit} उपलब्ध आहे`
  if (n < min) return `${p.name}: किमान ${min} ${unit} ऑर्डर करा`
  return null
}

/** Next cart quantity: never between 0 and the minimum, never past the stock. */
export function cartStep(p: Pick<Product, 'minOrder' | 'stock'>, qty: number, dir: 1 | -1): number {
  const min = Math.max(1, p.minOrder || 1)
  // Less on the shelf than the farmer's minimum is nothing to sell: 0, never a line of
  // a quantity the server would refuse (orderQtyProblem).
  if (dir === 1) return qty < min ? (p.stock >= min ? min : 0) : Math.min(qty + 1, p.stock)
  return qty - 1 < min ? 0 : qty - 1
}

/**
 * A listing's category comes from its crop, so a farmer cannot file onions
 * under fruit. Only `other` has no category of its own; there the farmer picks one.
 */
export function categoryFor(cropId: string | undefined, sent: string | undefined): string | undefined {
  const crop = cropById(cropId)
  return crop && crop.id !== 'other' ? crop.categoryId : sent
}
