import type { SubscriptionState } from '@shared/subscription.js'

/**
 * Why a listing can be written but not SENT right now, or null when it can.
 *
 * The wizard opens only once the ₹50 is approved (`addProductBlock`). From
 * there a listing goes to the admin whether or not the field visit has
 * happened - the admin who publishes it is the person check, and publishing
 * verifies the farmer. So sending waits only for a term that ran out
 * mid-wizard, or a free slot, in the server's order (products.routes.ts).
 * `none` is not a block: an approved farmer awaiting the visit has packs and
 * no term yet.
 */
export type SendBlock = 'expired' | 'slotsFull'

export function sendBlock(term: SubscriptionState, slotsFull: boolean): SendBlock | null {
  if (term === 'expired') return 'expired'
  if (slotsFull) return 'slotsFull'
  return null
}
