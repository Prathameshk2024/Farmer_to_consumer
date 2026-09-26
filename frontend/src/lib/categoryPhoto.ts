import catAgarbatti from '../assets/categories/agarbatti.jpg'
import catHandicrafts from '../assets/categories/handicrafts.jpg'
import catHomemade from '../assets/categories/homemade.jpg'
import catPapad from '../assets/categories/papad.jpg'
import catPickles from '../assets/categories/pickles.jpg'
import catSweets from '../assets/categories/sweets.jpg'
import catTextiles from '../assets/categories/textiles.jpg'

/**
 * The stand-in photo for a listing with no picture of its own.
 *
 * An emoji on a product card reads as a placeholder even when it is the only
 * thing there, and a grid of them looks like a page that failed to load. These
 * are the same photographs the landing page already ships, so this costs no
 * new bytes in the bundle - the files are imported twice and emitted once.
 *
 * It is deliberately a photo of the CATEGORY, never of the product: a generic
 * jar of pickle above the seller's name is honest about being a category
 * picture, while a specific-looking photo of someone else's pickle is not.
 * Their own photo replaces it the moment they upload one.
 *
 * Categories with no honest match - beauty, farm produce, jewellery - are
 * absent on purpose and keep the emoji. A wrong photo is worse than none.
 */
const BY_CATEGORY: Record<string, string> = {
  food: catHomemade,
  pickle: catPickles,
  sweets: catSweets,
  namkeen: catPapad,
  handicraft: catHandicrafts,
  embroidery: catTextiles,
  textile: catTextiles,
  tailoring: catTextiles,
  agarbatti: catAgarbatti,
  decor: catHandicrafts,
}

export function categoryPhoto(categoryId?: string): string | undefined {
  return categoryId ? BY_CATEGORY[categoryId] : undefined
}
