import type { CartItem } from '@shared/types.js'
import { cartStep } from '@shared/produce.js'

/**
 * ONE FARMER AT A TIME.
 *
 * A cart used to hold anybody's goods and split into one order per farmer at
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
export function cartFarmer(items: CartItem[]): string | null {
  return items[0]?.farmerId ?? null
}

/** The shop's name as it was when she added the first item, for the refusal. */
export function cartFarmerName(items: CartItem[]): string | undefined {
  return items[0]?.farmerName
}

/** May this product go in? True while the cart is empty or already hers. */
export function canAddFrom(items: CartItem[], farmerId: string): boolean {
  const owner = cartFarmer(items)
  return owner === null || owner === farmerId
}

/**
 * A line's minimum. A cart saved in localStorage before the minimum existed
 * has none, and is read as 1 - the rule it was bought under.
 */
export function lineMinOrder(item: Pick<CartItem, 'minOrder'>): number {
  return Math.max(1, Number(item.minOrder) || 1)
}

/**
 * The quantity after a + or − on a line: never between 0 and the farmer's
 * minimum, never past his stock. 0 means the line goes - only because she
 * tapped − on it, never on her behalf.
 */
export function stepLine(item: Pick<CartItem, 'minOrder' | 'qty'>, stock: number, dir: 1 | -1): number {
  return cartStep({ minOrder: lineMinOrder(item), stock }, item.qty, dir)
}
