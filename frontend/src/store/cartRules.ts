import type { CartItem, Product } from '@shared/types.js'
import { cartStep } from '@shared/produce.js'

/**
 * ONE FARMER AT A TIME.
 *
 * A cart used to hold anybody's goods and split into one order per farmer at
 * checkout. It works, but it asks someone buying their first thing online to
 * understand that one basket became three orders, three deliveries arranged
 * with three strangers and three separate UPI payments - on the screen where
 * they are already deciding whether to trust any of this at all.
 *
 * So the first shop they add from owns the cart until it is emptied or
 * ordered. Nothing is ever removed on their behalf: a product from another shop
 * is refused with the name of the shop that holds the cart and a way to go
 * look at it, because a cart that quietly cleared itself is worse than one
 * that says no.
 */

/** The shop that owns the cart, or null when it is empty. */
export function cartFarmer(items: CartItem[]): string | null {
  return items[0]?.farmerId ?? null
}

/** The shop's name as it was when they added the first item, for the refusal. */
export function cartFarmerName(items: CartItem[]): string | undefined {
  return items[0]?.farmerName
}

/** May this product go in? True while the cart is empty or already theirs. */
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
 * minimum, never past their stock. 0 means the line goes - only because they
 * tapped − on it, never on their behalf.
 */
export function stepLine(item: Pick<CartItem, 'minOrder' | 'qty'>, stock: number, dir: 1 | -1): number {
  return cartStep({ minOrder: lineMinOrder(item), stock }, item.qty, dir)
}

/**
 * One tap on ADD, as data. `ok` is true only when something went in, so the
 * screen never says "added" about nothing.
 *
 * Refused (items unchanged) when another shop owns the cart, or when there is
 * nothing to add: stock below their minimum gives `cartStep` 0, and a line of 0
 * would sit in the cart as an order the server refuses.
 */
export function addLine(
  cur: CartItem[],
  product: Pick<Product, 'id' | 'farmerId' | 'name' | 'emoji' | 'price' | 'unit' | 'minOrder' | 'stock'>,
  qty = cartStep(product, 0, 1),
  farmerName?: string,
): { items: CartItem[]; ok: boolean } {
  if (!(qty > 0) || !canAddFrom(cur, product.farmerId)) return { items: cur, ok: false }
  if (cur.some((i) => i.productId === product.id)) {
    return {
      items: cur.map((i) => (i.productId === product.id ? { ...i, qty: Math.min(i.qty + qty, product.stock) } : i)),
      ok: true,
    }
  }
  return {
    items: [...cur, {
      productId: product.id, farmerId: product.farmerId, farmerName, name: product.name,
      emoji: product.emoji, price: product.price, unit: product.unit, minOrder: product.minOrder, qty,
    }],
    ok: true,
  }
}
