import type { Product } from '@shared/types.js'
import { destroyImage } from '../routes/uploads.routes.js'

/**
 * A REJECTED ROW SHOULD NOT EXIST, SO SWEEP THE ONES THAT DO.
 *
 * A rejection used to leave the listing in place for 48 hours so she could
 * read the reason on the row. It now deletes the product on the spot (see
 * `POST /admin/products/:id/moderate`), because the slot frees at the same
 * moment: the grace period meant a refused listing sitting next to the new
 * one she had already put in its place.
 *
 * This clears the rows rejected under the old rule - at boot and on the
 * housekeeping timer - and is a no-op once they are gone.
 */
export function purgeRejected(
  products: Product[],
  // A parameter only so a test can see what would be destroyed.
  destroy: (publicId: string | undefined) => unknown = destroyImage,
): number {
  let removed = 0
  for (let i = products.length - 1; i >= 0; i--) {
    if (products[i]!.status !== 'REJECTED') continue
    // Its photo goes with it. The row was the only record of the image's
    // public id, so one left behind here is a photo nobody can ever find to
    // delete - Cloudinary storage paid for ever. Safe because nothing else
    // points at it: an order copies name and price, never the picture.
    void destroy(products[i]!.imagePublicId)
    products.splice(i, 1)
    removed++
  }
  return removed
}

/**
 * Clear out rows left behind by the old "archive" delete.
 *
 * Deleting a product used to stamp it `ARCHIVED` and keep it. Nothing has
 * ever read one since - every list, count and slot calculation filtered them
 * straight back out - so they are tombstones, and a database that only grows
 * is what made the Firebase console unreadable. Swept on read, like an expired
 * rejection, because there is no other moment that reliably arrives.
 *
 * In place, for the same reason `purgeRejected` is: `db.products` is
 * the live array every route holds a reference to.
 */
export function purgeArchived(products: Product[]): number {
  let removed = 0
  for (let i = products.length - 1; i >= 0; i--) {
    if (products[i]!.status === 'ARCHIVED') {
      products.splice(i, 1)
      removed++
    }
  }
  return removed
}
