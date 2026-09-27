import type { Db } from './seed.js'
import { destroyImage } from '../routes/uploads.routes.js'

/**
 * ROWS STORED UNDER RULES THAT NO LONGER EXIST.
 *
 * Listings used to be refused (REJECTED) or be archived instead of deleted
 * (ARCHIVED); farmers used to carry their payment in their status
 * (REGISTERED, PAYMENT_SUBMITTED, PAYMENT_REJECTED). None of those are in the
 * types any more, so a row still carrying one would be read as something it
 * is not. Run once at boot, in place - `db.products` is the live array every
 * route holds - and a no-op once the data is clean.
 *
 * A waiting listing (PENDING) is a queue entry again and is left alone; a
 * refused or archived one is removed with its photo; an unpaid farmer waits
 * for verification; one already ACTIVE is stamped as verified.
 */
export function normalizeLegacyRows(
  db: Pick<Db, 'products' | 'farmers'>,
  // A parameter only so a test can see what would be destroyed.
  destroy: (publicId: string | undefined) => unknown = destroyImage,
): number {
  let changed = 0
  for (let i = db.products.length - 1; i >= 0; i--) {
    const p = db.products[i]!
    const status = p.status as string
    if (status === 'REJECTED' || status === 'ARCHIVED') {
      // The row is the only record of the photo's public id.
      void destroy(p.imagePublicId)
      db.products.splice(i, 1)
      changed++
    }
  }
  for (const s of db.farmers) {
    if (['REGISTERED', 'PAYMENT_SUBMITTED', 'PAYMENT_REJECTED'].includes(s.status as string)) {
      s.status = 'PENDING_VERIFICATION'
      changed++
    } else if (s.status === 'ACTIVE' && !s.verifiedAt) {
      // Selling before verification existed: already let in by an admin.
      // Stamped so that unblock and restore, which key on `verifiedAt`, do
      // not drop them back to waiting.
      s.verifiedAt = new Date().toISOString()
      s.verifiedBy = 'legacy'
      changed++
    }
  }
  return changed
}
