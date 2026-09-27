import type { FarmerStatus } from '@shared/types.js'
import type { SubscriptionState } from '@shared/subscription.js'

/**
 * Why a listing can be written but not SENT right now, or null when it can.
 *
 * Drafts are free: the server takes a draft from any farmer who is not
 * blocked, whatever their verification, term or slots. So the wizard never
 * shuts - it offers "save as draft" and says what sending waits for. The
 * order is the server's (products.routes.ts): verification, term, slot, so
 * the sentence names the first thing the farmer can do about it.
 */
export type SendBlock = 'notVerified' | 'noTerm' | 'expired' | 'slotsFull'

export function sendBlock(
  status: FarmerStatus,
  term: SubscriptionState,
  slotsFull: boolean,
): SendBlock | null {
  if (status !== 'ACTIVE') return 'notVerified'
  if (term === 'none') return 'noTerm'
  if (term === 'expired') return 'expired'
  if (slotsFull) return 'slotsFull'
  return null
}
