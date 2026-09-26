import type { CartItem } from '@shared/types.js'

/**
 * ONE SELLER AT A TIME.
 *
 * A cart used to hold anybody's goods and split into one order per seller at
 * checkout. It works, but it asks a woman buying her first thing online to
 * understand that one basket became three orders, three deliveries arranged
 * with three strangers and three separate UPI payments - on the screen where
 * she is already deciding whether to trust any of this at all.
 *
 * So the first shop she adds from owns the cart until it is emptied or
 * ordered. Nothing is ever removed on her behalf: a product from another shop
 * is refused with the name of the shop that holds the cart and a way to go
 * look at it, because a cart that quietly cleared itself is worse than one
 * that says no.
 */

/** The shop that owns the cart, or null when it is empty. */
export function cartSeller(items: CartItem[]): string | null {
  return items[0]?.sellerId ?? null
}

/** The shop's name as it was when she added the first item, for the refusal. */
export function cartSellerName(items: CartItem[]): string | undefined {
  return items[0]?.sellerName
}

/** May this product go in? True while the cart is empty or already hers. */
export function canAddFrom(items: CartItem[], sellerId: string): boolean {
  const owner = cartSeller(items)
  return owner === null || owner === sellerId
}
