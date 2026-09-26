import type { Db } from '../db/seed.js'
import { normalizePhone } from '@shared/farmer.js'
import { newId } from '../db/ids.js'
import { burnPasswordTime, hashPassword, verifyPassword } from './crypto.js'
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
