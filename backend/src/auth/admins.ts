import type { Db } from '../db/seed.js'
import { newId } from '../db/ids.js'
import { ADMIN_BOOTSTRAP, IS_PROD } from '../config.js'
import { burnPasswordTime, hashPassword, verifyPassword } from './crypto.js'
import type { AdminUser } from './types.js'

/**
 * ADMINISTRATORS
 * ==============
 * Named accounts with scrypt-hashed passwords, replacing the single
 * ADMIN_EMAIL / ADMIN_PASSWORD pair that used to live in the environment.
 *
 * Three things were wrong with the old arrangement, and all three mattered:
 *
 *  - the password sat in an environment variable in plaintext, defaulted to
 *    `changeme`, and was compared with `!==`;
 *  - the EMAIL was never checked at all, so any string plus the right password
 *    logged in - and that string was written into `verifiedBy` on approved
 *    payments, making the audit trail attacker-controlled;
 *  - one identity for the whole team meant "who approved this ₹50?" had the
 *    same answer whoever clicked it.
 *
 * Emails are normalised to lower case for lookup but stored as typed, so a
 * coordinator sees her own capitalisation and still cannot create a second
 * account by shifting a letter.
 */

export function normalizeEmail(email: string): string {
  return String(email ?? '').trim().toLowerCase()
}

export function findAdminByEmail(db: Db, email: string): AdminUser | undefined {
  const wanted = normalizeEmail(email)
  return db.admins.find((a) => normalizeEmail(a.email) === wanted)
}

export interface CreateAdminInput {
  email: string
  name: string
  password: string
}

export function createAdmin(db: Db, input: CreateAdminInput, now = Date.now()): AdminUser {
  const at = new Date(now).toISOString()
  const admin: AdminUser = {
    id: newId('adm'),
    email: String(input.email).trim(),
    name: String(input.name).trim() || String(input.email).trim(),
    passwordHash: hashPassword(input.password),
    createdAt: at,
    updatedAt: at,
  }
  db.admins.push(admin)
  return admin
}

export function setAdminPassword(admin: AdminUser, password: string, now = Date.now()): void {
  admin.passwordHash = hashPassword(password)
  admin.updatedAt = new Date(now).toISOString()
}

/**
 * Minimum password rules.
 *
 * Length only, and nothing about symbols or mixed case. Composition rules are
 * well established to push people towards `Passw0rd!` and a sticky note; a
 * long passphrase is both stronger and likelier to be remembered. Twelve is
 * the floor because scrypt is doing the heavy lifting behind it.
 */
export const MIN_ADMIN_PASSWORD = 12

export function passwordProblem(password: string): string | null {
  const pw = String(password ?? '')
  if (pw.length < MIN_ADMIN_PASSWORD) {
    return `Password must be at least ${MIN_ADMIN_PASSWORD} characters`
  }
  if (/^\s|\s$/.test(pw)) return 'Password must not start or end with a space'
  return null
}

export type AdminAuthFailure = 'unknown' | 'disabled' | 'wrong-password'

export type AdminAuthResult =
  | { ok: true; admin: AdminUser }
  | { ok: false; reason: AdminAuthFailure }

/**
 * Check an email and password.
 *
 * An unknown address still pays for a scrypt hash. Without that, a missing
 * account answers in under a millisecond and a real one takes a hundred, which
 * turns this endpoint into a reliable oracle for "does this person administer
 * the platform?" - a question worth asking before a phishing attempt.
 *
 * The caller must map every failure to one identical response. The distinction
 * here is for the audit log, not for the client.
 */
export function authenticateAdmin(db: Db, email: string, password: string): AdminAuthResult {
  const admin = findAdminByEmail(db, email)

  if (!admin) {
    burnPasswordTime(password)
    return { ok: false, reason: 'unknown' }
  }
  if (admin.disabledAt) {
    burnPasswordTime(password)
    return { ok: false, reason: 'disabled' }
  }
  if (!verifyPassword(password, admin.passwordHash)) {
    return { ok: false, reason: 'wrong-password' }
  }

  return { ok: true, admin }
}

/**
 * FIRST ADMIN, ON A HOST WITH NO SHELL
 * ====================================
 * Cloud Run gives no shell, so `npm run admin` cannot be used to
 * create the first account on a fresh deployment - and an API with no way to
 * make an administrator is an API nobody can administer.
 *
 * So: while the `admins` collection is EMPTY, one identity from the
 * environment may sign in. Two rules keep that from becoming the old hole
 * wearing a new hat:
 *
 *  - the variable holds a scrypt HASH, not a password. Someone reading the
 *    environment gets something they must still crack;
 *  - the first successful bootstrap login WRITES a real admin record, after
 *    which the collection is no longer empty and this path is dead. It cannot
 *    be used twice, and it cannot be used to add a second account.
 *
 * Delete the variables once you have logged in. Nothing depends on them after
 * that, and this returning null is the normal state.
 */
export function bootstrapAdmin(db: Db, email: string, password: string, now = Date.now()):
  AdminUser | null {
  if (db.admins.length > 0) return null
  if (!ADMIN_BOOTSTRAP) return null

  if (normalizeEmail(email) !== normalizeEmail(ADMIN_BOOTSTRAP.email)) {
    burnPasswordTime(password)
    return null
  }
  if (!verifyPassword(password, ADMIN_BOOTSTRAP.passwordHash)) return null

  const at = new Date(now).toISOString()
  const admin: AdminUser = {
    id: newId('adm'),
    email: ADMIN_BOOTSTRAP.email,
    name: ADMIN_BOOTSTRAP.name,
    passwordHash: ADMIN_BOOTSTRAP.passwordHash,
    createdAt: at,
    updatedAt: at,
    lastLoginAt: at,
  }
  db.admins.push(admin)

  console.warn(
    `[auth] bootstrapped the first administrator (${admin.email}) from the environment. ` +
      'Remove ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_PASSWORD_HASH now - they are ignored from here on.',
  )
  return admin
}

/**
 * Whether the platform currently has nobody who can administer it.
 *
 * Worth saying loudly at boot, because the symptom otherwise appears much
 * later as "admin login does not work" and is easy to misread as a bug in the
 * password check.
 */
export function describeAdminState(db: Db): string | null {
  if (db.admins.length > 0) return null
  if (ADMIN_BOOTSTRAP) {
    return `  Admin          none yet - sign in once as ${ADMIN_BOOTSTRAP.email} to create it`
  }
  return IS_PROD
    ? '  Admin          NONE, and no bootstrap configured - nobody can sign in to /api/admin/*'
    : '  Admin          none - run `npm run admin:users create <email> "<name>"`'
}
