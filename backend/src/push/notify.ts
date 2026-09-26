import type { AdminNotice, Order, OrderStatus } from '@shared/types.js'
import type { PushLang, PushText } from '@shared/pushText.js'
import {
  adminNoticePush, customerOrderPush, paymentClaimedPush, sellerOrderPush,
} from '@shared/pushText.js'
import type { Db } from '../db/seed.js'
import { save } from '../db/store.js'
import { sendPush } from './send.js'
import { pushTargets, type Recipient } from './targets.js'

/**
 * ONE FUNCTION PER TRIGGER: who hears about it, and what they are told.
 *
 * The routes call these with `void` after `save()`, so the response never
 * waits on Firebase. `persist` is `save` in the server and a no-op in tests,
 * which must never write backend/data/db.json.
 */

/**
 * `pushTargets(db, to)` and `build` both used to run as plain arguments to
 * `sendPush`, which means they ran BEFORE `sendPush`'s own try/catch - a
 * throw from either (a builder reading a field that isn't there, say) was not
 * a rejection `sendPush` could swallow, it was a synchronous throw out of a
 * `void notify…()` call nobody is watching. In `index.ts`'s admin-notice
 * listener that call sits inside a bare `setImmediate`, where an uncaught
 * throw takes down the one Cloud Run process with up to 400ms of unsaved
 * writes still pending. Wrapping the whole call in `Promise.resolve().then()`
 * means any of that becomes an ordinary rejection this catches instead.
 */
function tell(
  db: Db, to: Recipient, build: (lang: PushLang) => PushText | null, persist: () => void,
): Promise<number> {
  return Promise.resolve()
    .then(() => sendPush(db, pushTargets(db, to), build, persist))
    .catch((err) => {
      console.warn('[push] failed:', err instanceof Error ? err.message : err)
      return 0
    })
}

export function notifyOrderPlaced(db: Db, order: Order, persist: () => void = save): Promise<number> {
  return tell(db, { sellerId: order.sellerId }, (lang) => sellerOrderPush(order, 'PLACED', lang), persist)
}

export function notifyOrderAdvanced(db: Db, order: Order, to: OrderStatus, persist: () => void = save): Promise<number> {
  return tell(db, { customerId: order.customerId }, (lang) => customerOrderPush(order, to, lang), persist)
}

export function notifyOrderCancelled(
  db: Db, order: Order, by: 'seller' | 'customer', persist: () => void = save,
): Promise<number> {
  return by === 'customer'
    ? tell(db, { sellerId: order.sellerId }, (lang) => sellerOrderPush(order, 'CANCELLED', lang), persist)
    : tell(db, { customerId: order.customerId }, (lang) => customerOrderPush(order, 'CANCELLED', lang), persist)
}

export function notifyPaymentClaimed(db: Db, order: Order, persist: () => void = save): Promise<number> {
  return tell(db, { sellerId: order.sellerId }, (lang) => paymentClaimedPush(order, lang), persist)
}

export function notifyAdminNotice(db: Db, sellerId: string, notice: AdminNotice, persist: () => void = save): Promise<number> {
  return tell(db, { sellerId }, (lang) => adminNoticePush(notice, lang), persist)
}
