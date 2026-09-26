import type { Role } from '@shared/types.js'
import type { Db } from '../db/seed.js'
import { randomId } from './crypto.js'
import type { SessionRecord } from './types.js'
import { SESSION_ABSOLUTE_MS, SESSION_IDLE_MS } from './tokens.js'

/**
 * THE SESSION REGISTRY
 * ====================
 * Every signed-in device is a row. A token is a pointer to one; if the row is
 * gone, revoked or stale, the token is worthless no matter how well it is
 * signed.
 *
 * Pure functions over a `Db`, in the same shape as `db/customers.ts`: no
 * Firestore, no request objects, no module state. Persisting is the caller's
 * job, by calling `save()` afterwards. That is what makes all of this testable
 * without a server.
 *
 * TWO CLOCKS, ON PURPOSE
 * `lastSeenAt` drives the IDLE window - a seller using the app daily is never
 * signed out mid-task. `expiresAt` is an ABSOLUTE ceiling set at login and
 * never extended, so a token quietly copied off a phone cannot be kept alive
 * forever simply by being used. Idle alone would do exactly that.
 */

/**
 * How many devices one account may be signed in on.
 *
 * A limit is needed because logging in is unauthenticated up to the OTP, so
 * without one the collection is a place anybody can write to indefinitely.
 * Ten is generous for a woman with a phone and a shared family tablet, and the
 * oldest is evicted rather than the newest refused - being unable to sign in
 * on the device in your hand is a far worse failure than an old session
 * ending.
 */
export const MAX_SESSIONS_PER_USER = 10

/**
 * How far `lastSeenAt` must move before it is worth writing.
 *
 * Every authenticated request slides the window, and persisting each one would
 * turn a page load into a Firestore write per request. Five minutes of
 * resolution costs nothing - the windows are hours and days - and keeps the
 * write rate proportional to people, not to taps.
 */
export const TOUCH_RESOLUTION_MS = 5 * 60 * 1000

export interface NewSession {
  role: Role
  userId: string
  phone?: string
  sellerId?: string
  customerId?: string
  client?: string
}

export function createSession(db: Db, input: NewSession, now = Date.now()): SessionRecord {
  const at = new Date(now).toISOString()

  const session: SessionRecord = {
    id: randomId(),
    role: input.role,
    userId: input.userId,
    phone: input.phone,
    sellerId: input.sellerId,
    customerId: input.customerId,
    client: input.client,
    createdAt: at,
    lastSeenAt: at,
    expiresAt: new Date(now + SESSION_ABSOLUTE_MS[input.role]).toISOString(),
  }

  db.sessions.push(session)
  evictOldest(db, input.userId, now)
  return session
}

/**
 * The live session behind a token, or null.
 *
 * Null covers every reason at once - unknown id, revoked, idle out, past its
 * absolute ceiling - because the caller does not need to tell them apart and
 * an error message that did would be telling an attacker which guess was warm.
 */
export function findLiveSession(db: Db, id: string, now = Date.now()): SessionRecord | null {
  const session = db.sessions.find((s) => s.id === id)
  if (!session || session.revokedAt) return null
  if (Date.parse(session.expiresAt) <= now) return null
  if (now - Date.parse(session.lastSeenAt) > SESSION_IDLE_MS[session.role]) return null
  return session
}

/**
 * Slide the idle window. Returns whether the change is worth persisting, so
 * the caller can skip `save()` on the overwhelming majority of requests.
 */
export function touchSession(session: SessionRecord, now = Date.now()): boolean {
  if (now - Date.parse(session.lastSeenAt) < TOUCH_RESOLUTION_MS) return false
  session.lastSeenAt = new Date(now).toISOString()
  return true
}

/**
 * End one session.
 *
 * Marked rather than deleted, so the audit trail can still say a token was
 * used after logout. `pruneSessions` clears them out later.
 */
export function revokeSession(
  db: Db,
  id: string,
  reason: SessionRecord['revokedReason'],
  now = Date.now(),
): boolean {
  const session = db.sessions.find((s) => s.id === id)
  if (!session || session.revokedAt) return false
  session.revokedAt = new Date(now).toISOString()
  session.revokedReason = reason
  return true
}

/** Sign one account out everywhere. What "my phone was stolen" needs. */
export function revokeAllForUser(
  db: Db,
  userId: string,
  reason: SessionRecord['revokedReason'],
  now = Date.now(),
): number {
  let n = 0
  for (const s of db.sessions) {
    if (s.userId === userId && !s.revokedAt) {
      s.revokedAt = new Date(now).toISOString()
      s.revokedReason = reason
      n++
    }
  }
  return n
}

/** Her signed-in devices, newest first. Revoked ones are not shown. */
export function liveSessionsForUser(db: Db, userId: string, now = Date.now()): SessionRecord[] {
  return db.sessions
    .filter((s) => s.userId === userId && findLiveSession(db, s.id, now))
    .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))
}

function evictOldest(db: Db, userId: string, now: number): void {
  const mine = db.sessions
    .filter((s) => s.userId === userId && !s.revokedAt)
    .sort((a, b) => a.lastSeenAt.localeCompare(b.lastSeenAt))

  for (const s of mine.slice(0, Math.max(0, mine.length - MAX_SESSIONS_PER_USER))) {
    s.revokedAt = new Date(now).toISOString()
    s.revokedReason = 'evicted'
  }
}

/**
 * Drop rows nothing can use any more.
 *
 * Without this the collection only grows: every login of every customer, for
 * ever. Revoked rows are kept a week so "was this token used after she logged
 * out?" is still answerable, then go.
 */
export function pruneSessions(db: Db, now = Date.now()): number {
  const keepRevokedUntil = now - 7 * 24 * 60 * 60 * 1000
  const before = db.sessions.length

  db.sessions = db.sessions.filter((s) => {
    if (s.revokedAt) return Date.parse(s.revokedAt) > keepRevokedUntil
    if (Date.parse(s.expiresAt) <= now) return false
    return now - Date.parse(s.lastSeenAt) <= SESSION_IDLE_MS[s.role]
  })

  return before - db.sessions.length
}

/**
 * A coarse device label from the User-Agent, for the "signed in on" list.
 *
 * Deliberately lossy. The full string is a fingerprinting surface and is not
 * needed: she has to recognise which of her own devices a row is, and "Android
 * phone" does that.
 */
export function describeClient(userAgent: string | undefined): string {
  const ua = String(userAgent ?? '')
  if (/android/i.test(ua)) return 'Android'
  if (/iphone|ipad|ios/i.test(ua)) return 'iPhone / iPad'
  if (/windows/i.test(ua)) return 'Windows'
  if (/mac os|macintosh/i.test(ua)) return 'Mac'
  if (/linux/i.test(ua)) return 'Linux'
  return 'Unknown'
}
