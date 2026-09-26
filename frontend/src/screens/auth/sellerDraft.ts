import type { BusinessType, DigitalProfile, DispatchTime } from '@shared/types.js'
import { normalizePhone } from '@shared/seller.js'

/**
 * THE HALF-FILLED REGISTRATION
 * ============================
 * Six screens of answers, kept on the device so that leaving the wizard does
 * not throw them away. Before this, everything lived in `useState`: a back
 * press on step 1, a reload, or the browser reclaiming the tab wiped the lot -
 * and back sent her to the phone screen, so she also spent a second OTP
 * proving a number she had proved two minutes earlier.
 *
 * KEYED BY PHONE, and that is the whole point of this file existing separately.
 * The product wizard learned this the hard way (see productDraft.ts): one
 * shared key meant a field coordinator's phone showed the NEXT woman whatever
 * the last one had typed. Registration is worse - the draft holds her name,
 * her village and her UPI id. The phone number from her verification ticket is
 * the identity being registered, so it is the right key.
 *
 * sessionStorage, not localStorage: her ticket lives fifteen minutes, so a
 * draft that outlived the tab would be a form she could fill in but never
 * submit - and a half-registered woman's details would sit on a shared handset
 * for whoever picked it up next.
 */

export interface Draft {
  name: string
  age: string
  education: string
  whatsapp: string
  villagePreset: string
  villageOther: string
  taluka: string
  district: string
  pincode: string
  shopName: string
  businessType: BusinessType
  shgName: string
  yearsInBusiness: string
  monthlyCapacity: string
  about: string
  sellsFood: boolean | null
  fssai: string
  upiId: string
  upiQrUrl: string
  upiQrPublicId: string
  dispatch: DispatchTime
  digital: Partial<DigitalProfile>
}

export const EMPTY: Draft = {
  name: '', age: '', education: '', whatsapp: '',
  villagePreset: '', villageOther: '', taluka: '', district: '', pincode: '',
  shopName: '', businessType: 'individual', shgName: '',
  yearsInBusiness: '', monthlyCapacity: '', about: '',
  sellsFood: null, fssai: '',
  upiId: '', upiQrUrl: '', upiQrPublicId: '', dispatch: 'same',
  digital: {},
}

export const TOTAL_STEPS = 6

/** Only what a store must do, so tests need no browser. */
export interface DraftStore {
  getItem: (k: string) => string | null
  setItem: (k: string, v: string) => void
  removeItem: (k: string) => void
}

/**
 * `normalizePhone`, not a digit-strip of my own: the number reaches this file
 * from a ticket and from a query string, and "+91 98220 11223" has to open the
 * same drawer as "9822011223". That rule already exists once, in shared/, and
 * having a second copy here is how the two drift apart.
 */
export function draftKey(phone: string): string {
  return `wb.draft.seller.${normalizePhone(phone)}`
}

export function writeDraft(store: DraftStore, phone: string, step: number, d: Draft): void {
  if (!phone) return
  try {
    store.setItem(draftKey(phone), JSON.stringify({ step, d }))
  } catch {
    /* private mode - she simply loses the draft on leaving, as before */
  }
}

export function readDraft(store: DraftStore, phone: string): { step: number; d: Draft } | null {
  if (!phone) return null
  try {
    const raw = store.getItem(draftKey(phone))
    if (!raw) return null
    const saved = JSON.parse(raw) as { step?: number; d?: Partial<Draft> }
    if (!saved.d) return null
    return {
      step: Math.max(0, Math.min(TOTAL_STEPS - 1, saved.step ?? 0)),
      // Spread over EMPTY, never trust the stored shape: a draft written by an
      // older build is missing whatever field was added since.
      d: { ...EMPTY, ...saved.d },
    }
  } catch {
    return null
  }
}

export function clearDraft(store: DraftStore, phone: string): void {
  try {
    store.removeItem(draftKey(phone))
  } catch {
    /* it was never stored anyway */
  }
}

/** Browser storage, or a no-op where it is blocked. */
export function sessionStore(): DraftStore {
  try {
    // Touch it: a private window throws on access rather than on use.
    window.sessionStorage.getItem('probe')
    return window.sessionStorage
  } catch {
    return { getItem: () => null, setItem: () => {}, removeItem: () => {} }
  }
}
