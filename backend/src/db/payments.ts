import type { Seller, SellerStatus, SubscriptionPayment } from '@shared/types.js'

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
 * required rather than every seller being locked out of paying.
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
 * What a seller's status should become when one of her payments is rejected.
 *
 * Not simply PAYMENT_REJECTED. A seller can have more than one payment on
 * file - a duplicate submission is the ordinary case, someone tapping submit
 * twice on a slow connection - and rejecting the leftover must not revoke an
 * account she has already paid for and had approved.
 *
 * BLOCKED is likewise left alone: a rejection is not the way to un-block
 * somebody, and quietly doing so would undo a deliberate admin decision.
 */
export function sellerStatusAfterReject(
  seller: Seller,
  payments: SubscriptionPayment[],
  rejectedPaymentId: string,
): SellerStatus {
  if (seller.status === 'BLOCKED') return 'BLOCKED'

  // The payment being rejected cannot be the one vouching for her.
  const stillApproved = payments.some(
    (p) =>
      p.id !== rejectedPaymentId &&
      p.sellerId === seller.id &&
      p.status === 'APPROVED',
  )

  return stillApproved ? seller.status : 'PAYMENT_REJECTED'
}
