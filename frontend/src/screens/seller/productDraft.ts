import type { Unit } from '@shared/types.js'

/**
 * The half-filled product the upload wizard keeps on the device.
 *
 * She leaves this screen for ordinary reasons - most often to change the
 * language from her profile - and unmounting it used to throw away everything
 * she had typed and send her back to picking the photo again. So it is written
 * down.
 *
 * It is written down PER SELLER. The first version used one shared key, and on
 * a field coordinator's phone, where seller after seller registers on the same
 * handset, the next woman opened "New product" and found a stranger's photo
 * waiting on step 1. The seller id is in the key and in the payload, and a
 * disagreement between the two means no draft.
 */

export const BLANK = {
  imageUrl: '',
  imagePublicId: '',
  name: '',
  categoryId: '',
  isFood: null as boolean | null,
  ingredients: '',
  vegType: '' as '' | 'veg' | 'nonveg',
  material: '',
  price: '',
  mrp: '',
  unit: 'piece' as Unit,
  packSize: '',
  piecesPerPack: '',
  stock: '',
  madeToOrder: false,
}

export type Draft = typeof BLANK

/** Mirrors STEPS in UploadProduct - a stored step outside it is not trusted. */
const LAST_STEP = 6

/** The single shared key of the first version. Deleted on sight. */
export const LEGACY_DRAFT_KEY = 'wb.draft.product'

export const draftKey = (sellerId: string) => `wb.draft.product.${sellerId}`

/** Just the three localStorage methods, so this is testable without a browser. */
export type DraftStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/**
 * Has she actually begun?
 *
 * Opening the wizard and walking away must leave nothing behind - otherwise
 * every seller who so much as glanced at the screen gets a draft restored at
 * her next visit, which is its own kind of confusing.
 */
export function hasStarted(d: Draft): boolean {
  return (Object.keys(BLANK) as (keyof Draft)[]).some((k) => d[k] !== BLANK[k])
}

export function readDraft(
  store: DraftStore,
  sellerId: string | undefined,
): { step: number; d: Draft } | null {
  // Existing installs still hold the shared key. Left in place it would keep
  // handing one woman's product to the next, so reading is what clears it.
  try {
    store.removeItem(LEGACY_DRAFT_KEY)
  } catch {
    /* ignore */
  }

  if (!sellerId) return null

  try {
    const raw = store.getItem(draftKey(sellerId))
    if (!raw) return null

    const saved = JSON.parse(raw) as { sellerId?: string; step?: number; d?: Partial<Draft> }
    if (!saved.d) return null
    // The owner is stored as well as keyed. A mismatch means the row was moved
    // or hand-edited, and the safe reading of an ambiguous draft is no draft.
    if (saved.sellerId !== sellerId) return null

    return {
      step: Math.max(0, Math.min(LAST_STEP, saved.step ?? 0)),
      // Spread over BLANK: a draft written by an older build is missing
      // whatever field has been added since.
      d: { ...BLANK, ...saved.d },
    }
  } catch {
    return null
  }
}

export function writeDraft(
  store: DraftStore,
  sellerId: string | undefined,
  step: number,
  d: Draft,
): void {
  if (!sellerId || !hasStarted(d)) return
  try {
    store.setItem(draftKey(sellerId), JSON.stringify({ sellerId, step, d }))
  } catch {
    /* private mode - she loses the draft on leaving, as before */
  }
}

export function clearDraft(store: DraftStore, sellerId: string | undefined): void {
  if (!sellerId) return
  try {
    store.removeItem(draftKey(sellerId))
  } catch {
    /* ignore */
  }
}
