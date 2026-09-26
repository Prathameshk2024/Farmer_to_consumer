import type { DigitalProfile, ReadinessBand, Seller } from './types.js'

/**
 * DIGITAL READINESS INDEX
 * ================================
 * Ten factors, ten marks each, out of 100.
 *
 * Six of them are answered by her at registration (six yes/no taps - she does
 * not type anything). The remaining four - branding, packaging, online customer
 * contact, digital financial management - cannot honestly be self-reported by
 * someone who has never done them, so the platform MEASURES them from what she
 * actually does once she is on it:
 *
 *   branding        -> has a shop logo, an "about" story and product photos
 *   packaging       -> products carry weight/unit and ingredient detail
 *   onlineContact   -> has received and fulfilled orders through the app
 *   digitalFinance  -> UPI verified and payments confirmed in-app
 *
 * That split matters for the research: the six self-reported answers give the
 * BEFORE baseline at registration, and the four measured ones move on their own
 * as she uses the platform - so the before/after comparison is not just her
 * opinion of herself changing.
 */

export const FACTOR_MAX = 10
export const FACTOR_COUNT = 10
export const MAX_SCORE = FACTOR_MAX * FACTOR_COUNT

/** The six she answers at registration, in the order they are asked. */
export const SELF_REPORTED_FACTORS: {
  key: keyof DigitalProfile
  mr: string
  en: string
}[] = [
  { key: 'smartphone', mr: 'तुमच्याकडे स्मार्टफोन आहे का?', en: 'Do you have a smartphone?' },
  { key: 'internet', mr: 'तुम्ही इंटरनेट वापरता का?', en: 'Do you use the internet?' },
  { key: 'upi', mr: 'तुम्ही UPI वापरता का?', en: 'Do you use UPI?' },
  { key: 'whatsappBusiness', mr: 'WhatsApp वापरता का?', en: 'Do you use WhatsApp?' },
  { key: 'socialMedia', mr: 'Facebook / Instagram वापरता का?', en: 'Do you use social media?' },
  { key: 'digitalMarketing', mr: 'ऑनलाइन जाहिरात करता का?', en: 'Do you do any online marketing?' },
]

export interface MeasuredInputs {
  hasBranding: boolean
  hasPackagingDetail: boolean
  hasOnlineOrders: boolean
  hasDigitalFinance: boolean
}

export const EMPTY_MEASURED: MeasuredInputs = {
  hasBranding: false,
  hasPackagingDetail: false,
  hasOnlineOrders: false,
  hasDigitalFinance: false,
}

export function computeReadiness(
  digital: DigitalProfile,
  measured: MeasuredInputs = EMPTY_MEASURED,
): number {
  const flags = [
    digital.smartphone,
    digital.internet,
    digital.upi,
    digital.whatsappBusiness,
    digital.socialMedia,
    digital.digitalMarketing,
    measured.hasBranding,
    measured.hasPackagingDetail,
    measured.hasOnlineOrders,
    measured.hasDigitalFinance,
  ]
  return flags.reduce<number>((n, on) => n + (on ? FACTOR_MAX : 0), 0)
}

/** 0-25 starter · 26-50 basic · 51-75 advanced · 76-100 digital entrepreneur */
export function readinessBand(score: number): ReadinessBand {
  if (score <= 25) return 'starter'
  if (score <= 50) return 'basic'
  if (score <= 75) return 'advanced'
  return 'digital'
}

export const BAND_LABEL: Record<ReadinessBand, { mr: string; en: string }> = {
  starter: { mr: 'प्रारंभिक', en: 'Starter' },
  basic: { mr: 'मूलभूत', en: 'Basic' },
  advanced: { mr: 'प्रगत', en: 'Advanced' },
  digital: { mr: 'डिजिटल उद्योजिका', en: 'Digital entrepreneur' },
}

/**
 * Recompute a seller's score from her current state on the platform.
 * Call this after she publishes a product or completes an order, so the index
 * tracks what she does rather than what she once said.
 */
export function recomputeForSeller(
  seller: Pick<Seller, 'digital' | 'about' | 'upiVerified' | 'qrOrders'>,
  opts: { productCount: number; productsWithDetail: number; completedOrders: number },
): { score: number; band: ReadinessBand } {
  const measured: MeasuredInputs = {
    hasBranding: Boolean(seller.about && seller.about.length > 20) && opts.productCount > 0,
    hasPackagingDetail: opts.productsWithDetail > 0,
    hasOnlineOrders: opts.completedOrders > 0,
    hasDigitalFinance: seller.upiVerified && opts.completedOrders > 0,
  }
  const score = computeReadiness(seller.digital, measured)
  return { score, band: readinessBand(score) }
}
