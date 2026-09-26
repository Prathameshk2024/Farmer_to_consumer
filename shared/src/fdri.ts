/**
 * FARMER DIGITAL READINESS INDEX (FDRI)
 * =====================================
 * From the research paper, section 10. Ten indicators, one mark each, out
 * of ten. Asked as ten yes/no taps at registration and on the survey form,
 * and stored per indicator so any one of them can be tabulated alone.
 */
export const FDRI_INDICATORS = [
  'smartphone', 'internet', 'whatsapp', 'digitalPayment', 'onlineMarketInfo',
  'digitalPromotion', 'onlineSelling', 'directSelling', 'packagingBranding', 'trainingWillingness',
] as const

export type FdriIndicator = (typeof FDRI_INDICATORS)[number]
export type FdriAnswers = Record<FdriIndicator, boolean>
export type FdriBand = 'low' | 'moderate' | 'high'

export const FDRI_QUESTIONS: Record<FdriIndicator, { mr: string; en: string }> = {
  smartphone: { mr: 'तुमच्याकडे स्मार्टफोन आहे का?', en: 'Do you have a smartphone?' },
  internet: { mr: 'तुम्ही इंटरनेट वापरता का?', en: 'Do you use the internet?' },
  whatsapp: { mr: 'तुम्ही WhatsApp वापरता का?', en: 'Do you use WhatsApp?' },
  digitalPayment: { mr: 'तुम्ही UPI / ऑनलाइन पैसे पाठवता किंवा घेता का?', en: 'Do you send or receive money by UPI?' },
  onlineMarketInfo: { mr: 'बाजारभाव फोनवर पाहता का?', en: 'Do you check market prices on your phone?' },
  digitalPromotion: { mr: 'तुमच्या मालाची माहिती फोनवरून इतरांना पाठवता का?', en: 'Do you advertise your produce from your phone?' },
  onlineSelling: { mr: 'याआधी ऑनलाइन काही विकले आहे का?', en: 'Have you ever sold anything online?' },
  directSelling: { mr: 'ग्राहकाला थेट माल विकायला तयार आहात का?', en: 'Are you willing to sell directly to buyers?' },
  packagingBranding: { mr: 'माल पॅक करून, स्वतःच्या नावाने विकायला तयार आहात का?', en: 'Are you ready to pack and brand your produce?' },
  trainingWillingness: { mr: 'डिजिटल प्रशिक्षण घ्यायला आवडेल का?', en: 'Would you like digital training?' },
}

export function cleanFdri(raw: unknown): FdriAnswers {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return Object.fromEntries(FDRI_INDICATORS.map((k) => [k, src[k] === true])) as FdriAnswers
}

export function fdriScore(a: Partial<FdriAnswers>): number {
  return FDRI_INDICATORS.reduce((n, k) => n + (a[k] === true ? 1 : 0), 0)
}

/** 0–3 low · 4–7 moderate · 8–10 high (paper, section 10). */
export function fdriBand(score: number): FdriBand {
  if (score <= 3) return 'low'
  if (score <= 7) return 'moderate'
  return 'high'
}
