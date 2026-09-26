import type { Order, SellerWeek, WeekDay } from '@shared/types.js'
import type { Db } from './seed.js'

/**
 * HER GROWTH, COMPUTED FROM HER ORDERS
 * ====================================
 * This replaces a hard-coded table. `/api/analytics/seller/:id/week` used to
 * answer out of `SELLER_WEEK_SEED`, which held one invented week for the demo
 * seller `s1` and nothing for anybody else - so every real woman who signed
 * up, sold something and was paid still saw "not enough information yet". Her
 * earnings were on the record the whole time; the screen simply never looked.
 *
 * TWO RULES THAT DECIDE THE NUMBERS
 *
 *  - Money is counted on DELIVERY, not on the order being placed. An order
 *    placed Monday and handed over Wednesday is Wednesday's earnings, because
 *    Wednesday is when she was paid. That is the same rule the "earned today"
 *    tile on My Business uses, and the two must agree or she will trust
 *    neither.
 *  - A cancelled or rejected order is not a sale and never appears.
 *
 * Pure functions over a `Db`, in the same shape as `db/customers.ts`: no
 * request objects, no module state, so the arithmetic is testable without a
 * server.
 */

/** Monday-first, matching how a week is spoken about in Marathi. */
const DAY_LABELS: { d: string; dEn: string }[] = [
  { d: 'सोम', dEn: 'Mon' },
  { d: 'मंगळ', dEn: 'Tue' },
  { d: 'बुध', dEn: 'Wed' },
  { d: 'गुरु', dEn: 'Thu' },
  { d: 'शुक्र', dEn: 'Fri' },
  { d: 'शनि', dEn: 'Sat' },
  { d: 'रवि', dEn: 'Sun' },
]

const EARNED = new Set(['DELIVERED'])

/** When she was actually paid: the delivery, falling back to the order date. */
function earnedAt(order: Order): number {
  const delivered = order.events.find((e) => e.to === 'DELIVERED')?.at
  return Date.parse(delivered ?? order.placedAt)
}

/** Midnight local time on the Monday of the week containing `now`. */
export function startOfWeek(now: number): number {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  // getDay() is Sunday-first; shift so Monday is 0.
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.getTime()
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Her week, or null if she has never earned anything.
 *
 * Null rather than a week of zeroes: a chart of seven empty bars reads as
 * failure to somebody who has not started yet, and the screen shows an
 * encouraging empty state instead.
 */
export function sellerWeek(db: Db, sellerId: string, now = Date.now()): SellerWeek | null {
  const mine = db.orders.filter((o) => o.sellerId === sellerId)
  const paid = mine.filter((o) => EARNED.has(o.status))
  if (paid.length === 0) return null

  const weekStart = startOfWeek(now)
  const lastWeekStart = weekStart - WEEK_MS

  const days: WeekDay[] = DAY_LABELS.map((l) => ({ ...l, v: 0 }))
  let lastWeekTotal = 0
  let ordersThisWeek = 0
  let ordersLastWeek = 0

  for (const o of paid) {
    const at = earnedAt(o)
    if (at >= weekStart) {
      const day = Math.floor((at - weekStart) / 86_400_000)
      if (day >= 0 && day < 7) {
        days[day]!.v += o.total
        ordersThisWeek++
      }
    } else if (at >= lastWeekStart) {
      lastWeekTotal += o.total
      ordersLastWeek++
    }
  }

  /**
   * Views are not tracked per week - `product.views` is a running total - so
   * this is her whole catalogue's views rather than a weekly figure. Stated
   * here because the label on the screen says "how many people looked", and
   * that is honest for a lifetime count in a way "this week" would not be.
   */
  const views = db.products
    .filter((p) => p.sellerId === sellerId)
    .reduce((n, p) => n + (p.views ?? 0), 0)

  // Buyers who came back. Counted over everything she has ever sold, because
  // a repeat customer is not a weekly event.
  const byCustomer = new Map<string, number>()
  for (const o of paid) byCustomer.set(o.customerId, (byCustomer.get(o.customerId) ?? 0) + 1)
  const repeatCustomers = [...byCustomer.values()].filter((n) => n > 1).length

  return {
    days,
    lastWeekTotal,
    ordersThisWeek,
    ordersLastWeek,
    views,
    ordered: paid.length,
    repeatCustomers,
  }
}
