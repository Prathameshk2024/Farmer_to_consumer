import type { Role } from '@shared/types.js'
import type { Db } from '../db/seed.js'
import { newId } from '../db/ids.js'
import type { AuthEvent, AuthEventType } from './types.js'

/**
 * THE AUTH AUDIT TRAIL
 * ====================
 * Who signed in, who failed, who was rate-limited, whose session was revoked.
 *
 * The reason to keep it is not compliance theatre. It is that the first
 * question after any incident is "when did this start and how many accounts?",
 * and without a record the honest answer is "we cannot tell" - which, for a
 * platform holding rural women's phone numbers and buyers' home addresses, is
 * not an acceptable answer to give anybody.
 *
 * WHAT IS DELIBERATELY NOT STORED
 * No plaintext phone numbers, no IP addresses, no user agents, no OTP codes.
 * `subject` arrives already masked and `ip` already hashed - see auth/crypto.ts
 * - because a log of who logged in from where is itself personal data, and a
 * breach of the audit trail should not be a second breach of the users.
 */

/**
 * How many rows to keep.
 *
 * Capped by count rather than by age alone, because the failure mode worth
 * defending against is a flood: someone hammering the login endpoint would
 * otherwise write unbounded documents into Firestore and the bill, not the
 * disk, would be the thing that noticed. Ninety days is the age policy; this
 * is the ceiling that holds under attack.
 */
export const MAX_EVENTS = 5000
export const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000

export interface AuthEventInput {
  type: AuthEventType
  /** A MASKED phone or an email address. Never a raw phone number. */
  subject?: string
  role?: Role
  /** A HASHED address, from hashIp(). Never a raw one. */
  ip?: string
  sessionId?: string
  detail?: string
}

export function recordAuthEvent(db: Db, input: AuthEventInput, now = Date.now()): AuthEvent {
  const event: AuthEvent = {
    id: newId('ae'),
    at: new Date(now).toISOString(),
    type: input.type,
    subject: input.subject,
    role: input.role,
    ip: input.ip,
    sessionId: input.sessionId,
    detail: input.detail,
  }

  db.authEvents.push(event)
  pruneAuthEvents(db, now)
  return event
}

export function pruneAuthEvents(db: Db, now = Date.now()): number {
  const before = db.authEvents.length
  const cutoff = now - MAX_AGE_MS

  let kept = db.authEvents.filter((e) => Date.parse(e.at) > cutoff)
  if (kept.length > MAX_EVENTS) kept = kept.slice(kept.length - MAX_EVENTS)

  db.authEvents = kept
  return before - kept.length
}

/** Newest first. What an admin screen would read. */
export function recentAuthEvents(db: Db, limit = 100): AuthEvent[] {
  return [...db.authEvents].sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit)
}
