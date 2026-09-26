import type { Order } from '@shared/types.js'
import { canCancel, cancelProblem, type CancelBy } from '@shared/orderCancel.js'

export type CancelResult =
  | { ok: true }
  | { ok: false; status: number; error: string; messageMr: string }

/**
 * Cancel an order on behalf of one of its two parties.
 *
 * Kept out of the route so the rule can be tested without a server. The
 * caller has already checked that this person is on the order; this decides
 * whether they may end it NOW, and whether they said why.
 *
 * Status is checked against the order as it is at this instant, not as the
 * screen last showed it. A buyer pressing cancel while the seller presses
 * accept is the race this matters for, and one server process means whichever
 * lands first wins cleanly - the second gets a 409 in words.
 */
export function cancelOrder(
  order: Order,
  by: CancelBy,
  body: { reason?: unknown; note?: unknown },
  now = new Date().toISOString(),
): CancelResult {
  if (!canCancel(by, order.status)) {
    return {
      ok: false,
      status: 409,
      error: `A ${by} cannot cancel an order that is ${order.status}`,
      messageMr:
        by === 'customer'
          ? 'विक्रेतीने ऑर्डर स्वीकारले आहे. आता रद्द करायचे असल्यास विक्रेतीला फोन करा'
          : 'या टप्प्यावर हे ऑर्डर रद्द करता येणार नाही',
    }
  }

  const problem = cancelProblem(by, body.reason, body.note)
  if (problem) {
    return { ok: false, status: 400, error: 'Reason required', messageMr: problem }
  }

  const reason = body.reason as string
  order.status = 'CANCELLED'
  order.events.push({
    to: 'CANCELLED',
    at: now,
    by,
    reason,
    // Words only travel with "other"; every listed reason is its own sentence.
    note: reason === 'other' ? String(body.note).trim() : undefined,
  })
  return { ok: true }
}
