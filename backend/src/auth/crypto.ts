import crypto from 'node:crypto'
import { SESSION_SECRET } from '../config.js'

/**
 * THE CRYPTOGRAPHIC PRIMITIVES, IN ONE PLACE
 * ==========================================
 * Every signature, hash and random value in the auth stack comes from here, so
 * there is exactly one answer to "how is this signed?" and one place to change
 * it. Route files and services never reach for node:crypto themselves.
 *
 * Two rules run through all of it:
 *
 *  - Nothing secret is compared with `===`. String comparison exits at the
 *    first differing byte, and the time that takes is measurable over a
 *    network. Everything below goes through `timingEqual`.
 *  - Every signature is DOMAIN-SEPARATED by a purpose string. A session token
 *    and a phone-verification ticket are both HMACs under the same secret, and
 *    without the purpose baked in, one could be presented where the other was
 *    expected. That is not a theoretical attack; it is the usual way home-grown
 *    token schemes fall over.
 */

/** Keyed hash, bound to a purpose so a signature cannot be replayed elsewhere. */
export function hmac(purpose: string, input: string): string {
  return crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(`${purpose} ${input}`)
    .digest('base64url')
}

/** Constant-time compare. Never throws, and a length mismatch is just false. */
export function timingEqual(a: string, b: string): boolean {
  const left = Buffer.from(String(a ?? ''), 'utf8')
  const right = Buffer.from(String(b ?? ''), 'utf8')
  // timingSafeEqual throws on differing lengths, so that is checked first. It
  // leaks only the length, which for a fixed-width digest is nothing.
  if (left.length !== right.length || left.length === 0) return false
  return crypto.timingSafeEqual(left, right)
}

/**
 * An OTP, from the CSPRNG.
 *
 * `Math.random()` is a fast non-cryptographic PRNG whose internal state can be
 * recovered from a handful of outputs, which for a login code means somebody
 * who requests a few OTPs on his own number can predict the next one issued to
 * anybody. `randomInt` draws from the same pool as key generation.
 */
export function randomCode(digits: number): string {
  const max = 10 ** digits
  return String(crypto.randomInt(0, max)).padStart(digits, '0')
}

/** An unguessable id for a session or a ticket. 144 bits, URL-safe. */
export function randomId(bytes = 18): string {
  return crypto.randomBytes(bytes).toString('base64url')
}

/* ------------------------------------------------------------------ */
/* Passwords - admin sign-in only                                      */
/* ------------------------------------------------------------------ */

/**
 * scrypt, because an admin password is the one secret here that a human
 * chooses, and humans choose badly. A fast hash lets a leaked `admins`
 * collection be cracked at millions of guesses a second; scrypt is
 * deliberately expensive in BOTH time and memory, so rented GPUs buy far less
 * than they would against SHA-256.
 *
 * N = 32768 costs roughly 100ms and 32MB per attempt: unnoticeable on a form
 * limited to five tries per fifteen minutes, and ruinous at scale. Node's
 * default maxmem sits just under what that needs, hence the explicit ceiling.
 *
 * The parameters are stored WITH the hash, so they can be raised later without
 * invalidating existing passwords: an old hash still verifies under its own
 * numbers.
 */
const SCRYPT = { N: 32768, r: 8, p: 1, keylen: 64, maxmem: 96 * 1024 * 1024 }

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16)
  const key = crypto.scryptSync(password.normalize('NFKC'), salt, SCRYPT.keylen, SCRYPT)
  return [
    'scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p,
    salt.toString('base64url'), key.toString('base64url'),
  ].join('$')
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [scheme, n, r, p, salt, expected] = String(stored ?? '').split('$')
    if (scheme !== 'scrypt' || !salt || !expected) return false

    const key = crypto.scryptSync(
      password.normalize('NFKC'),
      Buffer.from(salt, 'base64url'),
      Buffer.from(expected, 'base64url').length,
      { N: Number(n), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem },
    )
    return timingEqual(key.toString('base64url'), expected)
  } catch {
    return false
  }
}

/**
 * Burn the same work as a real check, for an email that does not exist.
 *
 * Without this, an unknown address answers in under a millisecond while a
 * known one takes a hundred, which turns the login form into an oracle for
 * "is this person an administrator here?". The answer has to cost the same
 * either way.
 */
const DUMMY_HASH = hashPassword(randomId())

export function burnPasswordTime(password: string): void {
  verifyPassword(password, DUMMY_HASH)
}

/* ------------------------------------------------------------------ */
/* Things that go into logs                                            */
/* ------------------------------------------------------------------ */

/** 9822011223 becomes 98******23. Enough to recognise, not enough to dial. */
export function maskPhone(phone: string): string {
  const d = String(phone ?? '').replace(/\D/g, '')
  if (d.length < 4) return '****'
  return `${d.slice(0, 2)}${'*'.repeat(Math.max(0, d.length - 4))}${d.slice(-2)}`
}

/**
 * An address is personal data. The audit log needs to tell two clients apart,
 * not to identify one, so it stores a keyed hash: comparable, not reversible.
 */
export function hashIp(ip: string): string {
  return hmac('ip', String(ip ?? '')).slice(0, 16)
}
