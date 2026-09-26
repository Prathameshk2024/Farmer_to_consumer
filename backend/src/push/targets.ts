import type { PushLang } from '@shared/pushText.js'
import { findLiveSession } from '../auth/sessions.js'
import type { SessionRecord } from '../auth/types.js'
import type { Db } from '../db/seed.js'

export interface PushTarget {
  sessionId: string
  token: string
  lang: PushLang
}

export type Recipient = { sellerId: string } | { customerId: string }

/**
 * The phones to buzz for one seller or one buyer: live sessions of the right
 * role that carry a token. One entry per token, the newest session winning.
 */
export function pushTargets(db: Db, to: Recipient, now = Date.now()): PushTarget[] {
  const byToken = new Map<string, SessionRecord>()
  for (const s of db.sessions) {
    if (!s.pushToken) continue
    const mine = 'sellerId' in to
      ? s.role === 'seller' && s.sellerId === to.sellerId
      : s.role === 'customer' && s.customerId === to.customerId
    if (!mine || !findLiveSession(db, s.id, now)) continue
    const seen = byToken.get(s.pushToken)
    if (!seen || s.lastSeenAt > seen.lastSeenAt) byToken.set(s.pushToken, s)
  }
  return [...byToken.values()].map((s) => ({ sessionId: s.id, token: s.pushToken!, lang: s.pushLang ?? 'mr' }))
}
