import type { Db } from '../db/seed.js'
import { normalizePhone, samePhone } from '@shared/farmer.js'
import { passwordProblemMr } from '@shared/password.js'
import { newId } from '../db/ids.js'
import { burnPasswordTime, hashPassword, verifyPassword } from './crypto.js'
import { clear as clearLimit, hit, LIMITS } from './rateLimit.js'
import { revokeAllForUser } from './sessions.js'
import type { Credential } from './types.js'

export function findCredential(db: Db, role: Credential['role'], phone: string): Credential | undefined {
  const p = normalizePhone(phone)
  return db.credentials.find((c) => c.role === role && c.phone === p)
}

export function setCredential(
  db: Db,
  input: { role: Credential['role']; userId: string; phone: string; password: string; mustChange?: boolean },
  now = Date.now(),
): Credential {
  const phone = normalizePhone(input.phone)
  const existing = findCredential(db, input.role, phone)
  const row: Credential = existing ?? {
    id: newId('cred'), role: input.role, userId: input.userId, phone, passwordHash: '', updatedAt: '',
  }
  row.userId = input.userId
  row.passwordHash = hashPassword(input.password)
  row.mustChangePassword = input.mustChange || undefined
  row.updatedAt = new Date(now).toISOString()
  if (!existing) db.credentials.push(row)
  return row
}

/**
 * The credential if the password is right, else null. An unknown phone
 * still pays for a scrypt hash, so response time does not say which phones
 * have accounts.
 */
export function checkPassword(db: Db, role: Credential['role'], phone: string, password: string): Credential | null {
  const row = findCredential(db, role, phone)
  if (!row) { burnPasswordTime(password); return null }
  return verifyPassword(password, row.passwordHash) ? row : null
}

export function removeCredential(db: Db, userId: string): void {
  const i = db.credentials.findIndex((c) => c.userId === userId)
  if (i >= 0) db.credentials.splice(i, 1)
}

/**
 * A farmer number is taken by a farmer row OR by a farmer credential. The
 * second catches an orphan credential, which registration would otherwise
 * silently re-point at a new shop with the old password still working.
 */
export function farmerPhoneTaken(db: Db, phone: string): boolean {
  return db.farmers.some((f) => samePhone(f.phone, phone)) || !!findCredential(db, 'farmer', phone)
}

export type ChangeReply =
  | { status: 200; body: { ok: true } }
  | { status: 400 | 401; body: { error: string; messageMr: string; fields?: Record<string, string> } }
  | { status: 429; retryAfterSec: number }

/**
 * POST /auth/password, minus the HTTP. The current-password check is a login
 * in all but name, so it spends the same per-phone budget (`login:phone:`):
 * a live session on an unlocked phone must not be a way to guess the owner's
 * PIN without limit and then lock her out.
 */
export function changeOwnPassword(
  db: Db,
  auth: { role: Credential['role']; userId: string; phone?: string; sessionId: string },
  body: Record<string, unknown> | undefined,
  now = Date.now(),
): ChangeReply {
  const next = String(body?.next ?? '')
  const problem = passwordProblemMr(next)
  if (problem) return { status: 400, body: { error: 'Weak password', messageMr: problem, fields: { next: problem } } }

  const phone = normalizePhone(auth.phone ?? '')
  const key = `login:phone:${phone}`
  const budget = hit(key, LIMITS.loginPerPhone, now)
  if (!budget.ok) return { status: 429, retryAfterSec: budget.retryAfterSec }

  const cred = checkPassword(db, auth.role, phone, String(body?.current ?? ''))
  if (!cred || cred.userId !== auth.userId) {
    return { status: 401, body: { error: 'Bad credentials', messageMr: 'जुना पासवर्ड चुकीचा आहे' } }
  }
  clearLimit(key)

  setCredential(db, { role: auth.role, userId: cred.userId, phone: cred.phone, password: next }, now)
  // Every other phone signed in as this person is signed out: a password
  // is changed because someone else may know the old one.
  revokeAllForUser(db, cred.userId, 'password-change', now, auth.sessionId)
  return { status: 200, body: { ok: true } }
}
