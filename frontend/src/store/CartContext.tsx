import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type ReactNode,
} from 'react'
import type { CartItem, Product, Farmer, FarmerGroup } from '@shared/types.js'
import { cartStep } from '@shared/produce.js'
import { canAddFrom, cartFarmer, cartFarmerName, stepLine } from './cartRules.js'

/**
 * The cart is GROUPED BY FARMER, and that is not a display detail - it is the
 * data model. Delivery is arranged directly with each farmer and payment goes
 * into each farmer's own UPI, so a cart holding items from two farmers would
 * have to become two orders.
 *
 * It never does any more: ONE FARMER OWNS THE CART until it is emptied or
 * ordered - see cartRules.ts for why. The grouping stays because checkout,
 * the order API and every delivery rule are built on it, and because one
 * group is the honest shape of "one farmer" rather than a special case.
 */

interface CartValue {
  items: CartItem[]
  count: number
  /** The shop that owns the cart, or null when it is empty. */
  farmerId: string | null
  farmerName?: string
  /** False when the cart already belongs to a different shop. */
  canAdd: (farmerId: string) => boolean
  /** Refuses, and says so, when the cart belongs to another shop. The first add is his minimum. */
  add: (p: Product, qty?: number, farmerName?: string) => boolean
  setQty: (productId: string, qty: number) => void
  /** One + or − on a line, bounded by the farmer's minimum and `stock` (see cartRules). */
  step: (productId: string, stock: number, dir: 1 | -1) => void
  remove: (productId: string) => void
  clear: () => void
  has: (productId: string) => boolean
  groupByFarmer: (farmers: Partial<Farmer>[]) => FarmerGroup[]
}

const CartContext = createContext<CartValue | null>(null)
const KEY = 'wb.cart'

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      // Lines saved before `minOrder` existed are read as minimum 1 (cartRules).
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
  const add = useCallback((product: Product, qty = cartStep(product, 0, 1), farmerName?: string) => {
    // Nothing to add - stock below his minimum (cartStep gives 0). A line of
    // 0 would sit in the cart as an order the server refuses.
    if (!(qty > 0)) return true
    let ok = true
    setItems((cur) => {
      if (!canAddFrom(cur, product.farmerId)) {
        ok = false
        return cur
      }
      const found = cur.find((i) => i.productId === product.id)
      if (found) {
        return cur.map((i) => (i.productId === product.id ? { ...i, qty: Math.min(i.qty + qty, product.stock) } : i))
      }
      return [
        ...cur,
        {
          productId: product.id,
          farmerId: product.farmerId,
          farmerName,
          name: product.name,
          emoji: product.emoji,
          price: product.price,
          unit: product.unit,
          minOrder: product.minOrder,
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

  const step = useCallback((productId: string, stock: number, dir: 1 | -1) => {
    setItems((cur) => {
      const line = cur.find((i) => i.productId === productId)
      if (!line) return cur
      const qty = stepLine(line, stock, dir)
      return qty <= 0
        ? cur.filter((i) => i.productId !== productId)
        : cur.map((i) => (i.productId === productId ? { ...i, qty } : i))
    })
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

  /** Split into one group per farmer, applying that farmer's delivery rules. */
  const groupByFarmer = useCallback(
    (farmers: Partial<Farmer>[]): FarmerGroup[] => {
      const byFarmer = new Map<string, CartItem[]>()
      for (const item of items) {
        const list = byFarmer.get(item.farmerId) ?? []
        list.push(item)
        byFarmer.set(item.farmerId, list)
      }
      return [...byFarmer.entries()].map(([farmerId, list]) => {
        const farmer = farmers.find((s) => s.id === farmerId) as Farmer | undefined
        const itemsTotal = list.reduce((n, i) => n + i.price * i.qty, 0)
        const freeAbove = farmer?.freeDeliveryAbove ?? 0
        const freeByHerRule = freeAbove > 0 && itemsTotal >= freeAbove
        const deliveryFee = freeByHerRule ? 0 : (farmer?.deliveryFee ?? 0)
        const minOrder = farmer?.minOrder ?? 0
        return {
          farmerId,
          farmer,
          items: list,
          itemsTotal,
          deliveryFee,
          // A charge of 0 is almost always one nobody set - no screen asks a
          // farmer for it - so "free" was a promise no farmer had made.
          deliveryToAsk: !freeByHerRule && deliveryFee === 0,
          total: itemsTotal + deliveryFee,
          minOrder,
          belowMinimum: minOrder > 0 && itemsTotal < minOrder,
        }
      })
    },
    [items],
  )

  const farmerId = cartFarmer(items)
  const farmerName = cartFarmerName(items)
  const canAdd = useCallback((id: string) => canAddFrom(items, id), [items])

  const value = useMemo(
    () => ({
      items, count, farmerId, farmerName, canAdd,
      add, setQty, step, remove, clear, has, groupByFarmer,
    }),
    [items, count, farmerId, farmerName, canAdd, add, setQty, step, remove, clear, has, groupByFarmer],
  )
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart(): CartValue {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>')
  return ctx
}
