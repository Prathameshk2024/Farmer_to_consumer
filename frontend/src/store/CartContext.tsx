import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type ReactNode,
} from 'react'
import type { CartItem, Product, Seller, SellerGroup } from '@shared/types.js'
import { canAddFrom, cartSeller, cartSellerName } from './cartRules.js'

/**
 * The cart is GROUPED BY SELLER, and that is not a display detail - it is the
 * data model. Delivery is arranged directly with each seller and payment goes
 * into each seller's own UPI, so a cart holding items from two sellers would
 * have to become two orders.
 *
 * It never does any more: ONE SELLER OWNS THE CART until it is emptied or
 * ordered - see cartRules.ts for why. The grouping stays because checkout,
 * the order API and every delivery rule are built on it, and because one
 * group is the honest shape of "one seller" rather than a special case.
 */

interface CartValue {
  items: CartItem[]
  count: number
  /** The shop that owns the cart, or null when it is empty. */
  sellerId: string | null
  sellerName?: string
  /** False when the cart already belongs to a different shop. */
  canAdd: (sellerId: string) => boolean
  /** Refuses, and says so, when the cart belongs to another shop. */
  add: (p: Product, qty?: number, sellerName?: string) => boolean
  setQty: (productId: string, qty: number) => void
  remove: (productId: string) => void
  clear: () => void
  has: (productId: string) => boolean
  groupBySeller: (sellers: Partial<Seller>[]) => SellerGroup[]
}

const CartContext = createContext<CartValue | null>(null)
const KEY = 'wb.cart'

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      const raw = localStorage.getItem(KEY)
      return raw ? (JSON.parse(raw) as CartItem[]) : []
    } catch {
      return []
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(items))
    } catch {
      /* ignore */
    }
  }, [items])

  /**
   * Returns false when the cart belongs to another shop, so the screen can
   * explain rather than silently doing nothing. The check is repeated inside
   * the updater because `items` in this closure can be a render behind a
   * double tap.
   */
  const add = useCallback((product: Product, qty = 1, sellerName?: string) => {
    let ok = true
    setItems((cur) => {
      if (!canAddFrom(cur, product.sellerId)) {
        ok = false
        return cur
      }
      const found = cur.find((i) => i.productId === product.id)
      if (found) {
        return cur.map((i) => (i.productId === product.id ? { ...i, qty: i.qty + qty } : i))
      }
      return [
        ...cur,
        {
          productId: product.id,
          sellerId: product.sellerId,
          sellerName,
          name: product.name,
          emoji: product.emoji,
          price: product.price,
          unit: product.unit,
          qty,
        },
      ]
    })
    return ok
  }, [])

  const setQty = useCallback((productId: string, qty: number) => {
    setItems((cur) =>
      qty <= 0
        ? cur.filter((i) => i.productId !== productId)
        : cur.map((i) => (i.productId === productId ? { ...i, qty } : i)),
    )
  }, [])

  const remove = useCallback(
    (productId: string) => setItems((cur) => cur.filter((i) => i.productId !== productId)),
    [],
  )
  const clear = useCallback(() => setItems([]), [])
  const has = useCallback(
    (productId: string) => items.some((i) => i.productId === productId),
    [items],
  )
  const count = useMemo(() => items.reduce((n, i) => n + i.qty, 0), [items])

  /** Split into one group per seller, applying that seller's delivery rules. */
  const groupBySeller = useCallback(
    (sellers: Partial<Seller>[]): SellerGroup[] => {
      const bySeller = new Map<string, CartItem[]>()
      for (const item of items) {
        const list = bySeller.get(item.sellerId) ?? []
        list.push(item)
        bySeller.set(item.sellerId, list)
      }
      return [...bySeller.entries()].map(([sellerId, list]) => {
        const seller = sellers.find((s) => s.id === sellerId) as Seller | undefined
        const itemsTotal = list.reduce((n, i) => n + i.price * i.qty, 0)
        const freeAbove = seller?.freeDeliveryAbove ?? 0
        const freeByHerRule = freeAbove > 0 && itemsTotal >= freeAbove
        const deliveryFee = freeByHerRule ? 0 : (seller?.deliveryFee ?? 0)
        const minOrder = seller?.minOrder ?? 0
        return {
          sellerId,
          seller,
          items: list,
          itemsTotal,
          deliveryFee,
          // A charge of 0 is almost always one nobody set - no screen asks a
          // seller for it - so "free" was a promise no seller had made.
          deliveryToAsk: !freeByHerRule && deliveryFee === 0,
          total: itemsTotal + deliveryFee,
          minOrder,
          belowMinimum: minOrder > 0 && itemsTotal < minOrder,
        }
      })
    },
    [items],
  )

  const sellerId = cartSeller(items)
  const sellerName = cartSellerName(items)
  const canAdd = useCallback((id: string) => canAddFrom(items, id), [items])

  const value = useMemo(
    () => ({
      items, count, sellerId, sellerName, canAdd,
      add, setQty, remove, clear, has, groupBySeller,
    }),
    [items, count, sellerId, sellerName, canAdd, add, setQty, remove, clear, has, groupBySeller],
  )
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart(): CartValue {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>')
  return ctx
}
