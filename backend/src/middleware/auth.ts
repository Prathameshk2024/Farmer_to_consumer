import type { NextFunction, Request, Response } from 'express'
import type { Role } from '@shared/types.js'
import { getDb, save } from '../db/store.js'
import { findLiveSession, touchSession } from '../auth/sessions.js'
import { shouldRefresh, signToken, verifyToken } from '../auth/tokens.js'

/**
 * WHO IS CALLING
 * ==============
 * Two gates, in this order, and both must pass:
 *
 *   1. the token's signature and its issue time - cheap, no lookup, throws out
 *      forgeries and ancient tokens before they cost anything;
 *   2. the session record it points at - the authority on whether that session
 *      still exists, has been revoked, or has idled out.
 *
 * The second gate is the one that is new, and it is the whole point. Identity
 * is read from the RECORD, never from the token: `req.auth.sellerId` comes out
 * of the row in the database, so a token cannot assert an identity the server
 * did not issue even if the signing key were somehow forged. It also means
 * "log out" and "revoke her stolen phone" are real, because deleting the row
 * kills every token pointing at it.
 *
 * To go live on Firebase Auth instead: mint a Firebase custom token after the
 * OTP check and have the client sign in with it; this middleware then becomes
 * `getAuth().verifyIdToken(bearer)` plus the same session lookup. Admin is
 * gated by a custom claim, and the same rule is repeated in Firestore security
 * rules - never in the UI alone.
 */

export interface AuthContext {
  role: Role
  userId: string
  phone?: string
  sellerId?: string
  customerId?: string
  /** The session this request is authenticated by. */
  sessionId: string
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext
    }
  }
}

// Re-exported so callers have one import for "sessions", and so the existing
// tests that reach for these keep working against the same definitions.
export { SESSION_IDLE_MS, shouldRefresh, signToken, verifyToken } from '../auth/tokens.js'

/**
 * Attaches req.auth when a valid bearer token is present. Never rejects -
 * `requireRole` does that, so public routes stay public.
 *
 * Slides the idle window on both halves: the record's `lastSeenAt` moves, and
 * once a session is past halfway a freshly stamped token goes back on
 * `X-Session-Token` for the client to swap in. That is what makes the expiry
 * an INACTIVITY timeout rather than a hard cutoff that would sign a seller out
 * while she is packing an order.
 *
 * `lastSeenAt` is only PERSISTED every few minutes - see TOUCH_RESOLUTION_MS -
 * so an active session does not turn every request into a database write.
 */
export function attachAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    next()
    return
  }

  const claims = verifyToken(header.slice(7))
  if (!claims) {
    next()
    return
  }

  const db = getDb()
  const session = findLiveSession(db, claims.sid)
  if (!session) {
    // Signed correctly, but the session behind it is gone, revoked or idle.
    // Falling through unauthenticated makes requireRole answer 401, which is
    // what tells the client to clear its stored session.
    next()
    return
  }

  req.auth = {
    role: session.role,
    userId: session.userId,
    phone: session.phone,
    sellerId: session.sellerId,
    customerId: session.customerId,
    sessionId: session.id,
  }

  if (touchSession(session)) save()
  if (shouldRefresh(claims)) {
    res.setHeader('X-Session-Token', signToken({ sid: session.id, role: session.role }))
  }

  next()
}

/** Rejects unless the caller holds one of the given roles. */
export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({ error: 'Not signed in', messageMr: 'कृपया पुन्हा लॉगिन करा' })
      return
    }
    if (!roles.includes(req.auth.role)) {
      // 403, not 401, and the difference matters to the client: 401 means the
      // session is dead and should be cleared, 403 means it is fine but this
      // door is not hers. Conflating them signs people out for touching the
      // wrong URL.
      res.status(403).json({ error: 'Not allowed', messageMr: 'तुम्हाला परवानगी नाही' })
      return
    }
    next()
  }
}

/** The seller id the caller is allowed to act as. */
export function callerSellerId(req: Request): string | undefined {
  return req.auth?.sellerId
}

/**
 * The client's address, for rate limiting.
 *
 * Requires `app.set('trust proxy', ...)` to be correct, or Cloud Run's front
 * end makes every request appear to come from one address - at which
 * point per-IP limits either do nothing or lock out the entire internet at
 * once. See index.ts.
 */
export function callerIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown'
}
