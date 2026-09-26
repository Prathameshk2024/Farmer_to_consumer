/**
 * RATE LIMITING
 * =============
 * In process, with no new dependency, because this deployment is pinned to a
 * single instance anyway - the datastore has the same constraint and states it
 * in db/firestore.ts. A shared limiter (Redis) is the change to make at the
 * same time as making the store shared, not before: two limiters on two
 * instances would let through twice the traffic, which is a known and bounded
 * failure, whereas two datastores silently overwrite each other.
 *
 * A fixed window, not a token bucket. Fixed windows allow a burst across a
 * boundary - up to double the limit at the seam - and for these numbers that
 * does not matter: the point is to make ten thousand OTP guesses impossible,
 * not to smooth traffic. Simple enough to read in one sitting beats subtle.
 *
 * Every limit is keyed by BOTH a subject (a phone, an email) and an IP.
 * Subject alone lets an attacker walk through numbers; IP alone punishes a
 * whole village behind one carrier NAT, which in rural Maharashtra is a real
 * shape of traffic and not a hypothetical.
 */

interface Window {
  count: number
  resetAt: number
}

export interface Limit {
  /** How many are allowed in the window. */
  max: number
  windowMs: number
}

export interface LimitResult {
  ok: boolean
  /** Seconds until the caller may retry. Goes into the Retry-After header. */
  retryAfterSec: number
  remaining: number
}

const windows = new Map<string, Window>()

/**
 * The limits, gathered here so the whole policy can be read at once rather
 * than discovered one route at a time.
 */
export const LIMITS = {
  /** One SMS every 30s per number is the existing rule; these are the ceilings. */
  otpSendPerPhone: { max: 3, windowMs: 24 * 60 * 60 * 1000 },
  /** Stops somebody walking through numbers to burn the SMS budget. */
  otpSendPerIp: { max: 20, windowMs: 60 * 60 * 1000 },
  /** A 6-digit code is a million guesses; ten tries an hour makes that hopeless. */
  otpVerifyPerPhone: { max: 10, windowMs: 15 * 60 * 1000 },
  otpVerifyPerIp: { max: 50, windowMs: 60 * 60 * 1000 },
  /** The account that releases money. Deliberately tight. */
  adminLoginPerEmail: { max: 5, windowMs: 15 * 60 * 1000 },
  adminLoginPerIp: { max: 20, windowMs: 60 * 60 * 1000 },
  /** Registration is expensive and rare; nobody legitimately does it in bulk. */
  registerPerIp: { max: 10, windowMs: 60 * 60 * 1000 },
  /** A blunt backstop over everything, so no single client can flood the box. */
  globalPerIp: { max: 300, windowMs: 60 * 1000 },
} satisfies Record<string, Limit>

/**
 * Count one attempt against a limit.
 *
 * Call it when the attempt is MADE, not when it fails: a limiter that only
 * counts failures can be walked around by making the attempt look successful,
 * and for OTP verification the whole point is to cap tries.
 */
export function hit(key: string, limit: Limit, now = Date.now()): LimitResult {
  const existing = windows.get(key)

  if (!existing || existing.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + limit.windowMs })
    return { ok: true, retryAfterSec: 0, remaining: limit.max - 1 }
  }

  existing.count++
  if (existing.count > limit.max) {
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
      remaining: 0,
    }
  }

  return { ok: true, retryAfterSec: 0, remaining: limit.max - existing.count }
}

/** Look without counting. For deciding whether to bother doing the work. */
export function peek(key: string, limit: Limit, now = Date.now()): LimitResult {
  const existing = windows.get(key)
  if (!existing || existing.resetAt <= now) {
    return { ok: true, retryAfterSec: 0, remaining: limit.max }
  }
  const over = existing.count >= limit.max
  return {
    ok: !over,
    retryAfterSec: over ? Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) : 0,
    remaining: Math.max(0, limit.max - existing.count),
  }
}

/** Forget a subject's window. Used after a success, so one good login clears the slate. */
export function clear(key: string): void {
  windows.delete(key)
}

/**
 * Drop expired windows.
 *
 * Without it the map holds one entry per phone number and IP address ever
 * seen, which is a slow memory leak and, worse, a list of everyone who has
 * ever tried to log in sitting in process memory.
 */
export function sweep(now = Date.now()): number {
  let removed = 0
  for (const [key, w] of windows) {
    if (w.resetAt <= now) {
      windows.delete(key)
      removed++
    }
  }
  return removed
}

/** Test seam. Never called by the server. */
export function resetAllLimits(): void {
  windows.clear()
}
