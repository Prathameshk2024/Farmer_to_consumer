import type { Role } from '@shared/types.js'
import { hmac, timingEqual } from './crypto.js'

/**
 * THE BEARER TOKEN
 * ================
 * `base64url({sid, role, iat}).base64url(HMAC(payload))`
 *
 * Note what is NOT in there any more: the user id, the seller id, the customer
 * id. The token used to carry all three, which made it a self-contained claim
 * about who you are - and a claim is only as good as the checking around it.
 * Now it carries a POINTER to a session record, and identity is read from that
 * record on every request. Two things follow:
 *
 *  - a token cannot assert an identity the server did not issue, even in
 *    principle, because there is no identity in it to tamper with;
 *  - the session can be revoked. Deleting the record kills the token
 *    instantly, which is what makes "log out" and "her phone was stolen" mean
 *    something. Before this, both were client-side wishes.
 *
 * `iat` and `role` stay because they let an ancient token be thrown out before
 * it costs a lookup, and because the idle window differs by role. They are a
 * cheap first gate, never the last word: `sessions.ts` is the authority.
 */

export interface TokenClaims {
  /** Session id. Meaningless on its own; resolved against the registry. */
  sid: string
  role: Role
  /** Issued-at, epoch milliseconds. */
  iat: number
}

/**
 * How long a session survives with no activity.
 *
 * Different by role because the risk is different. An admin token approves
 * payments, blocks sellers and can read every buyer's home address, and it is
 * used at a desk where signing in again costs a few seconds - so it is short.
 * A seller's token is on a phone in a village, and re-issuing it costs an SMS
 * and a literacy hurdle, so fifteen days is the kinder trade: a woman who
 * sells at the weekly bazaar and opens the app every other week is not sent
 * back through OTP each time. Past fifteen days with no use at all, the
 * session ends - a phone put down and forgotten, or passed to someone else,
 * does not stay signed in to her shop indefinitely.
 *
 * This is an IDLE window, not an absolute one: every authenticated request
 * slides it forward, so somebody using the app regularly is never signed out
 * in the middle of something.
 */
export const SESSION_IDLE_MS: Record<Role, number> = {
  admin: 8 * 60 * 60 * 1000,
  seller: 15 * 24 * 60 * 60 * 1000,
  customer: 15 * 24 * 60 * 60 * 1000,
}

/** The hard ceiling, however active the session. A stolen token cannot live forever. */
export const SESSION_ABSOLUTE_MS: Record<Role, number> = {
  admin: 7 * 24 * 60 * 60 * 1000,
  seller: 90 * 24 * 60 * 60 * 1000,
  customer: 90 * 24 * 60 * 60 * 1000,
}

const PURPOSE = 'session-v2'

export function signToken(claims: Omit<TokenClaims, 'iat'>, now = Date.now()): string {
  // Stamped every time, so re-signing an existing session slides its window.
  const payload = Buffer.from(
    JSON.stringify({ ...claims, iat: now }),
    'utf8',
  ).toString('base64url')
  return `${payload}.${hmac(PURPOSE, payload)}`
}

export function verifyToken(token: string, now = Date.now()): TokenClaims | null {
  try {
    const dot = String(token ?? '').indexOf('.')
    // No separator means the old unsigned format, or a hand-crafted blob.
    if (dot < 1) return null

    const payload = token.slice(0, dot)
    if (!timingEqual(token.slice(dot + 1), hmac(PURPOSE, payload))) return null

    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as TokenClaims
    if (!parsed?.role || !parsed?.sid || typeof parsed.sid !== 'string') return null

    // No issue time means a token minted before sessions expired. Refusing it
    // is the point: accepting it would leave those sessions immortal.
    if (typeof parsed.iat !== 'number') return null

    const idle = SESSION_IDLE_MS[parsed.role]
    if (!idle || now - parsed.iat > idle) return null
    // A clock-skewed future timestamp must not extend the window either.
    if (parsed.iat > now + 60_000) return null

    return parsed
  } catch {
    return null
  }
}

/**
 * Whether a still-valid token is old enough to be worth re-issuing.
 *
 * Halfway through the window. Re-signing on every request would hand the
 * client a new token on every page load for no benefit, and a client that
 * drops one mid-flight would sign the user out for nothing.
 */
export function shouldRefresh(claims: TokenClaims, now = Date.now()): boolean {
  if (typeof claims.iat !== 'number') return false
  return now - claims.iat > SESSION_IDLE_MS[claims.role] / 2
}
