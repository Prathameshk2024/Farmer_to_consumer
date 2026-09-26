/**
 * The numbers behind image compression, kept free of the browser so they can
 * be tested in node. `upload.ts` does the canvas work with them.
 */

export type UploadKind = 'product' | 'payment'

/**
 * How hard each kind of image is squeezed.
 *
 * A product photo is looked at, so 1200px and a ~350KB ceiling are plenty at
 * the sizes it is ever drawn. A payment screenshot is READ: the admin checks
 * twelve small digits, a date and a time on it, and a tall phone screenshot
 * shrunk to 1200px on its long edge is barely 540px wide - the UTR goes soft
 * exactly where it matters. So it keeps more pixels and starts at a higher
 * quality, and still lands at a few hundred KB instead of a 1-2MB PNG.
 *
 * The server's upload transformation (`uploads.routes.ts`) uses the same
 * edges, as a backstop for a phone that could not compress.
 */
export const COMPRESSION: Record<UploadKind, { maxEdge: number; quality: number; targetBytes: number }> = {
  product: { maxEdge: 1200, quality: 0.78, targetBytes: 350_000 },
  payment: { maxEdge: 1800, quality: 0.85, targetBytes: 600_000 },
}

/** Quality is stepped down to reach the target, but never below this. */
export const MIN_QUALITY = 0.55

/**
 * The largest file we will accept off the picker: 5MB.
 *
 * Everything is compressed before it leaves the phone, so this is not a
 * bandwidth limit - it is a guard against the wrong FILE. A gallery picker
 * will happily hand back a 40MP RAW or a panorama, and `createImageBitmap` on
 * one of those either takes half a minute or runs the tab out of memory, on
 * exactly the cheap phones this app is for. A normal phone photo (3-5MB at
 * 12MP) and any screenshot fit under it.
 */
export const MAX_UPLOAD_MB = 5
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024

/** The size an image is drawn at: long edge capped, aspect kept, never enlarged. */
export function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height, 1))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/**
 * The qualities tried, best first, until one fits the target. A handful of
 * steps, not a search: each is a full re-encode on a slow phone.
 */
export function qualitySteps(start: number): number[] {
  const steps: number[] = []
  for (let q = start; q >= MIN_QUALITY - 1e-9; q -= 0.1) steps.push(Math.round(q * 100) / 100)
  return steps.length ? steps : [MIN_QUALITY]
}
