import catSpices from '../assets/categories/masala.jpg'

/**
 * The stand-in photo for a listing with no picture of its own.
 *
 * It is deliberately a photo of the CATEGORY, never of the product: a bowl of
 * spices above a farmer's turmeric is honest about being a category picture,
 * while a specific-looking photo of someone else's tomatoes is not. Their own
 * photo replaces it the moment they upload one.
 *
 * Only `spices` has an honest photograph today. Every other category keeps the
 * icon fallback on purpose - a wrong photo is worse than none, and there is no
 * honest picture of "other" at all.
 */
const BY_CATEGORY: Record<string, string> = {
  spices: catSpices,
}

export function categoryPhoto(categoryId?: string): string | undefined {
  return categoryId ? BY_CATEGORY[categoryId] : undefined
}
