import type { Db } from '../db/seed.js'
import { isValidPhone, normalizePhone } from '@shared/farmer.js'
import { newId } from '../db/ids.js'
import { findCustomer } from '../db/customers.js'
import { findCredential, setCredential } from './credentials.js'
import { revokeAllForUser } from './sessions.js'
import { recordAuthEvent } from './events.js'
import { maskPhone, randomCode } from './crypto.js'
import type { PasswordRequest } from './types.js'

type Role = PasswordRequest['role']
type Reply =
  | { status: 200; body: { ok: true } }
  | { status: 400; body: { error: string; messageMr: string; fields: Record<string, string> } }

const OK: Reply = { status: 200, body: { ok: true } }

/**
 * Queue a forgot-password request. The answer is the same whether or not
 * the phone has an account: the page is public, and any difference would
 * let a stranger test which numbers are registered. The match is kept for
 * the admin only.
 */
export function submitPasswordRequest(db: Db, body: Record<string, unknown> | undefined, now = Date.now()): Reply {
  const role: Role = body?.role === 'farmer' ? 'farmer' : 'customer'
  const phone = normalizePhone(String(body?.phone ?? ''))
  const name = String(body?.name ?? '').trim().slice(0, 80)
  const village = role === 'farmer' ? String(body?.village ?? '').trim().slice(0, 80) : ''
  const fields: Record<string, string> = {}
  if (!isValidPhone(phone)) fields.phone = '10 अंकी मोबाईल नंबर टाका'
  if (!name) fields.name = 'नाव आवश्यक आहे'
  if (role === 'farmer' && !village) fields.village = 'गाव आवश्यक आहे'
  if (Object.keys(fields).length) {
    return { status: 400, body: { error: 'Validation failed', messageMr: 'माहिती तपासा', fields } }
  }

  const at = new Date(now).toISOString()
  // Tapping "send" again is impatience, not a second person.
  const open = db.passwordRequests.find((r) => r.status === 'OPEN' && r.role === role && r.phone === phone)
  if (open) { open.at = at; return OK }

  db.passwordRequests.push({
    id: newId('pwr'), role, phone, name, village: village || undefined,
    matchedUserId: findCredential(db, role, phone)?.userId,
    at, status: 'OPEN',
  })
  return OK
}

/** Close an open request. Undefined when it is unknown or already closed. */
export function closePasswordRequest(
  db: Db, id: string, status: 'DONE' | 'DISMISSED', by: string, reason?: string, now = Date.now(),
): PasswordRequest | undefined {
  const r = db.passwordRequests.find((x) => x.id === id)
  if (!r || r.status !== 'OPEN') return undefined
  r.status = status
  r.closedAt = new Date(now).toISOString()
  r.closedBy = by
  const why = String(reason ?? '').trim().slice(0, 200)
  if (why) r.closeReason = why
  return r
}

/**
 * Six digits the admin reads out over the phone. Shown once, never stored
 * in the clear, and useless after the first sign-in because it must be
 * changed. With a requestId, the queue row it answers is closed as DONE.
 */
export function resetUserPassword(
  db: Db, input: { role: Role; userId: string; requestId?: string; by: string }, now = Date.now(),
): { tempPassword: string } | null {
  const person = input.role === 'farmer'
    ? db.farmers.find((f) => f.id === input.userId)
    : findCustomer(db, input.userId)
  if (!person?.phone) return null

  const tempPassword = randomCode(6)
  setCredential(db, { role: input.role, userId: input.userId, phone: person.phone, password: tempPassword, mustChange: true }, now)
  revokeAllForUser(db, input.userId, 'admin')
  recordAuthEvent(db, { type: 'password.reset', subject: maskPhone(person.phone), role: input.role, detail: input.by })
  // Only the request this reset answers: a stale tab or a mis-click with
  // somebody else's id has not called that person back.
  const answered = input.requestId
    ? db.passwordRequests.find((r) => r.id === input.requestId && r.role === input.role && r.matchedUserId === input.userId)
    : undefined
  if (answered) closePasswordRequest(db, answered.id, 'DONE', input.by, undefined, now)
  return { tempPassword }
}

/** Account close: his requests carry his name and number, so they go too. */
export function removePasswordRequests(db: Db, userId: string, phone: string): void {
  const p = normalizePhone(phone)
  for (let i = db.passwordRequests.length - 1; i >= 0; i--) {
    const r = db.passwordRequests[i]
    if (r.matchedUserId === userId || r.phone === p) db.passwordRequests.splice(i, 1)
  }
}
