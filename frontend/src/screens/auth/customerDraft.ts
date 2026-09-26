import { normalizePhone } from '@shared/seller.js'
import type { DraftStore } from './sellerDraft.js'

/**
 * THE HALF-FILLED CUSTOMER REGISTRATION
 * =====================================
 * One field - her name - but the same rule as the seller wizard, and for the
 * same two reasons.
 *
 * She reaches this screen already signed in, so leaving it costs no OTP; what
 * it costs is retyping a Devanagari name on a phone keyboard, which is exactly
 * the kind of small friction that ends with "ग्राहक" on every order she places.
 *
 * KEYED BY PHONE. On a shared handset the woman who registers next must not
 * find a stranger's name waiting in the box - the product wizard learned that
 * lesson first, and registration is worse because the value is a person's name
 * rather than a price.
 */
export function customerDraftKey(phone: string): string {
  return `wb.draft.customer.${normalizePhone(phone)}`
}

export function writeName(store: DraftStore, phone: string, name: string): void {
  if (!phone) return
  try {
    store.setItem(customerDraftKey(phone), name)
  } catch {
    /* private mode - she simply retypes it, as before */
  }
}

export function readName(store: DraftStore, phone: string): string {
  if (!phone) return ''
  try {
    return store.getItem(customerDraftKey(phone)) ?? ''
  } catch {
    return ''
  }
}

export function clearName(store: DraftStore, phone: string): void {
  try {
    store.removeItem(customerDraftKey(phone))
  } catch {
    /* it was never stored anyway */
  }
}
