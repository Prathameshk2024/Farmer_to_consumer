import type { Role } from '@shared/types.js'

/**
 * Server-side auth records.
 *
 * Deliberately NOT in `shared/`: nothing here crosses the wire. A password
 * hash, a revocation reason and a hashed IP have no business being importable
 * from a React bundle, and keeping the types out of `shared/` is what makes
 * sending one by accident a compile error rather than a leak.
 */

/**
 * One signed-in device.
 *
 * The token a client holds is a pointer to one of these plus a signature - it
 * carries no identity of its own. That indirection is the whole point: it is
 * what makes a session revocable. Before this existed, "log out" only cleared
 * the browser, and a token copied off a phone stayed valid for seven days no
 * matter what anyone did.
 */
export interface SessionRecord {
  id: string
  role: Role
  userId: string
  phone?: string
  sellerId?: string
  customerId?: string
  createdAt: string
  /** Slid forward on use; the idle window is measured from here. */
  lastSeenAt: string
  expiresAt: string
  revokedAt?: string
  revokedReason?: 'logout' | 'admin' | 'evicted' | 'password-change'
  /** A coarse device label, so "sign out my other phone" means something. */
  client?: string
}

/**
 * A named administrator.
 *
 * One shared login used to be the whole admin identity model, which meant
 * `verifiedBy` on an approved payment said the same thing whoever clicked it.
 * For a role that releases money and can read every buyer's home address, "who
 * did this?" needs a real answer.
 */
export interface AdminUser {
  id: string
  email: string
  name: string
  /** scrypt, from auth/crypto.ts. Never anything else, never plaintext. */
  passwordHash: string
  createdAt: string
  updatedAt: string
  lastLoginAt?: string
  /** Disabled rather than deleted, so past approvals keep pointing at a name. */
  disabledAt?: string
}

export type AuthEventType =
  | 'otp.send'
  | 'otp.send.blocked'
  | 'otp.verify.ok'
  | 'otp.verify.fail'
  | 'session.start'
  | 'session.end'
  | 'session.revoked'
  | 'admin.login.ok'
  | 'admin.login.fail'
  | 'register.seller'
  | 'register.customer'
  | 'ratelimit'

/**
 * One line of the audit trail.
 *
 * `subject` is a MASKED phone or an email and `ip` is a keyed hash, because a
 * log of who logged in from where is itself personal data. It has to be enough
 * to answer "is one address hammering us?" and not enough to be worth stealing.
 */
export interface AuthEvent {
  id: string
  at: string
  type: AuthEventType
  subject?: string
  role?: Role
  ip?: string
  sessionId?: string
  detail?: string
}
