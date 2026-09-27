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
