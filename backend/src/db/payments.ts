import type { SubscriptionPayment } from '@shared/types.js'
import { upiProblem } from '@shared/payment.js'

/**
 * Is this the screenshot we signed an upload for, or just any link?
 *
 * The screenshot is the proof an admin approves on, so a URL pasted into the
 * request - somebody else's receipt on an image host, or a product photo from
 * this same account - must not stand in for it. Only an image in THIS
 * Cloudinary account's `payment` folder counts, which is the folder
 * `/uploads/signature` signs for `kind: 'payment'`.
 *
 * With uploads switched off there is no way to send one, so nothing is
 * required rather than every farmer being locked out of paying.
 */
export function screenshotProblem(
  url: unknown,
  cloudinary: { cloudName: string; folder: string } | null,
): string | null {
  if (!cloudinary) return null
  if (typeof url !== 'string' || !url) {
    return 'पैसे भरल्याचा स्क्रीनशॉट जोडा. त्यात UTR, तारीख आणि वेळ दिसायला हवी'
  }
  const ours = `https://res.cloudinary.com/${cloudinary.cloudName}/image/upload/`
  if (!url.startsWith(ours) || !url.includes(`/${cloudinary.folder}/payment/`)) {
    return 'स्क्रीनशॉट पुन्हा जोडा'
  }
  return null
}

/**
 * Has this UTR already been used for a payment that still stands?
 *
 * Any farmer's, the sender's own included: resending one's own approved UTR
 * is how one payment would become a second pack. A REJECTED row does not
 * count, because correcting a mistyped submission means sending a new one
 * and the same UTR may be the right number this time. The row is still
 * queued; the console flags it.
 */
export function isDuplicateUtr(
  payments: Pick<SubscriptionPayment, 'utr' | 'status'>[],
  utr: string,
): boolean {
  return payments.some((p) => p.utr === utr && p.status !== 'REJECTED')
}

export const PAYER_UPI_MAX = 100

/**
 * The payer's UPI ID, when the client sends one. It is copied into the admin
 * queue and reconciled against a bank statement, so it must look like an
 * address and cannot be an essay. Absent is fine: the farmer's own ID is used.
 */
export function payerUpiProblem(value: unknown): string | null {
  if (value == null || value === '') return null
  if (typeof value !== 'string' || value.length > PAYER_UPI_MAX) return 'UPI आयडी बरोबर लिहा'
  return upiProblem(value)
}

/**
 * The screenshot URL to store. With uploads off there is no signed folder the
 * URL could have come from, so whatever the client sent is not kept - an
 * admin must never be shown an arbitrary link as proof.
 */
export function storedScreenshot(url: unknown, cloudinary: { cloudName: string; folder: string } | null): string | undefined {
  if (!cloudinary || typeof url !== 'string' || !url) return undefined
  return url
}
