import type { SubscriptionPayment } from '@shared/types.js'
import type { OrderRow, ProductRow, SellerRow } from './api.js'

/**
 * HOW EACH LIST CAN BE ORDERED.
 *
 * Sorting happens here, in the console, rather than on the server: every list
 * already arrives whole (the API holds the dataset in memory and sends all of
 * it), so asking again just to reorder it would be a round trip over the
 * same rows.
 *
 * One table per list, because "highest" means a different number on each -
 * what she has earned, what a product costs, what an order came to, what a
 * payment was for - and a generic "sort by field" menu would make an admin
 * learn the data model to use it.
 */

export interface SortOption<T> {
  id: string
  /** Dictionary key for the menu. */
  labelKey: string
  compare: (a: T, b: T) => number
}

/**
 * Names are Marathi and English side by side - "सुनीता" next to "Asha" - so a
 * plain `<` puts every Latin name before every Devanagari one by code point.
 * A collator orders each script properly and treats "asha" and "Asha" as the
 * same name.
 */
const collator = new Intl.Collator(['mr', 'en'], { sensitivity: 'base', numeric: true })
const byText = (a = '', b = '') => collator.compare(a.trim(), b.trim())
/** ISO timestamps compare correctly as strings; missing ones sink to the end. */
const byTime = (a?: string, b?: string) => (b ?? '').localeCompare(a ?? '')

function newestFirst<T>(at: (row: T) => string | undefined): SortOption<T> {
  return { id: 'newest', labelKey: 'sort.newest', compare: (a, b) => byTime(at(a), at(b)) }
}
function oldestFirst<T>(at: (row: T) => string | undefined): SortOption<T> {
  return { id: 'oldest', labelKey: 'sort.oldest', compare: (a, b) => -byTime(at(a), at(b)) }
}
function nameAZ<T>(name: (row: T) => string | undefined, labelKey = 'sort.nameAZ'): SortOption<T> {
  return { id: 'nameAZ', labelKey, compare: (a, b) => byText(name(a), name(b)) }
}
function nameZA<T>(name: (row: T) => string | undefined, labelKey = 'sort.nameZA'): SortOption<T> {
  return { id: 'nameZA', labelKey, compare: (a, b) => byText(name(b), name(a)) }
}
function highest<T>(id: string, labelKey: string, n: (row: T) => number | undefined): SortOption<T> {
  return { id, labelKey, compare: (a, b) => (n(b) ?? 0) - (n(a) ?? 0) }
}
function lowest<T>(id: string, labelKey: string, n: (row: T) => number | undefined): SortOption<T> {
  return { id, labelKey, compare: (a, b) => (n(a) ?? 0) - (n(b) ?? 0) }
}

export const SELLER_SORTS: SortOption<SellerRow>[] = [
  newestFirst((s) => s.createdAt),
  oldestFirst((s) => s.createdAt),
  nameAZ((s) => s.name),
  nameZA((s) => s.name),
  // Delivered orders only - the same definition her own page and the impact
  // report use, computed on the server.
  highest('earnedHigh', 'sort.earnedHigh', (s) => s.earned),
  // The plan she is on: how many ₹50 packs have been approved for her.
  highest('packsHigh', 'sort.packsHigh', (s) => s.packsApproved),
]

export const PRODUCT_SORTS: SortOption<ProductRow>[] = [
  newestFirst((p) => p.createdAt),
  oldestFirst((p) => p.createdAt),
  nameAZ((p) => p.name),
  nameZA((p) => p.name),
  highest('priceHigh', 'sort.priceHigh', (p) => p.price),
  lowest('priceLow', 'sort.priceLow', (p) => p.price),
]

export const ORDER_SORTS: SortOption<OrderRow>[] = [
  newestFirst((o) => o.placedAt),
  oldestFirst((o) => o.placedAt),
  highest('amountHigh', 'sort.amountHigh', (o) => o.total),
  lowest('amountLow', 'sort.amountLow', (o) => o.total),
  // The buyer is masked in this list, so the name to sort by is the shop's.
  nameAZ((o) => o.seller, 'sort.shopAZ'),
  nameZA((o) => o.seller, 'sort.shopZA'),
]

export const PAYMENT_SORTS: SortOption<SubscriptionPayment>[] = [
  newestFirst((p) => p.submittedAt),
  // Oldest first is the queue read as a queue: whoever has waited longest.
  oldestFirst((p) => p.submittedAt),
  highest('amountHigh', 'sort.amountHigh', (p) => p.amount),
  lowest('amountLow', 'sort.amountLow', (p) => p.amount),
  nameAZ((p) => p.sellerName, 'sort.sellerAZ'),
  nameZA((p) => p.sellerName, 'sort.sellerZA'),
]

/**
 * A sorted copy - never the array itself, which is `useAsync`'s data and would
 * otherwise be reordered under every other reader of it. Ties keep the order
 * the server sent, because `Array.prototype.sort` is stable.
 */
export function sortRows<T>(rows: readonly T[], options: SortOption<T>[], id: string): T[] {
  const option = options.find((o) => o.id === id) ?? options[0]
  return option ? [...rows].sort(option.compare) : [...rows]
}
