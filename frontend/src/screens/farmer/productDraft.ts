import type { Cultivation, Unit } from '@shared/types.js'
import { UNITS } from '@shared/produce.js'

/**
 * The half-filled product the upload wizard keeps on the device.
 *
 * A farmer leaves this screen for ordinary reasons - most often to change the
 * language from their profile - and unmounting it used to throw away everything
 * they had typed and send them back to the first question again. So it is written
 * down.
 *
 * It is written down PER FARMER. The first version used one shared key, and on
 * a field coordinator's phone, where farmer after farmer registers on the same
 * handset, the next farmer opened "New product" and found a stranger's photo
 * waiting on step 1. The farmer id is in the key and in the payload, and a
 * disagreement between the two means no draft.
 */

export const BLANK = {
  cropId: '',
  /** Only asked when the crop is `other`; every other crop brings its own. */
  categoryId: '',
  imageUrl: '',
  imagePublicId: '',
  name: '',
  unit: 'kg' as Unit,
  price: '',
  stock: '',
  minOrder: '1',
  /** YYYY-MM-DD from `<input type="date">`. */
  harvestDate: '',
  cultivation: '' as '' | Cultivation,
}

export type Draft = typeof BLANK

/** Mirrors STEPS in UploadProduct - a stored step outside it is not trusted. */
const LAST_STEP = 8

/** The single shared key of the first version. Deleted on sight. */
export const LEGACY_DRAFT_KEY = 'wb.draft.product'

export const draftKey = (farmerId: string) => `wb.draft.product.${farmerId}`

/** Just the three localStorage methods, so this is testable without a browser. */
export type DraftStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/**
 * Have they actually begun?
 *
 * Opening the wizard and walking away must leave nothing behind - otherwise
 * every farmer who so much as glanced at the screen gets a draft restored at
 * their next visit, which is its own kind of confusing.
 */
export function hasStarted(d: Draft): boolean {
  return (Object.keys(BLANK) as (keyof Draft)[]).some((k) => d[k] !== BLANK[k])
}

export function readDraft(
  store: DraftStore,
  farmerId: string | undefined,
): { step: number; d: Draft } | null {
  // Existing installs still hold the shared key. Left in place it would keep
  // handing one farmer's product to the next, so reading is what clears it.
  try {
    store.removeItem(LEGACY_DRAFT_KEY)
  } catch {
    /* ignore */
  }

  if (!farmerId) return null

  try {
    const raw = store.getItem(draftKey(farmerId))
    if (!raw) return null

    const saved = JSON.parse(raw) as { farmerId?: string; step?: number; d?: Partial<Draft> }
    if (!saved.d) return null
    // The owner is stored as well as keyed. A mismatch means the row was moved
    // or hand-edited, and the safe reading of an ambiguous draft is no draft.
    if (saved.farmerId !== farmerId) return null

    const d = { ...BLANK, ...saved.d }
    // A draft from the packaged-goods build may hold a unit that no longer
    // exists (g, ml, set); it starts again from the default rather than
    // publishing something the server will refuse.
    if (!UNITS.includes(d.unit)) d.unit = BLANK.unit

    return {
      step: Math.max(0, Math.min(LAST_STEP, saved.step ?? 0)),
      // Spread over BLANK: a draft written by an older build is missing
      // whatever field has been added since.
      d,
    }
  } catch {
    return null
  }
}

export function writeDraft(
  store: DraftStore,
  farmerId: string | undefined,
  step: number,
  d: Draft,
): void {
  if (!farmerId || !hasStarted(d)) return
  try {
    store.setItem(draftKey(farmerId), JSON.stringify({ farmerId, step, d }))
  } catch {
    /* private mode - they lose the draft on leaving, as before */
  }
}

export function clearDraft(store: DraftStore, farmerId: string | undefined): void {
  if (!farmerId) return
  try {
    store.removeItem(draftKey(farmerId))
  } catch {
    /* ignore */
  }
}
