import { OTP, otpProvider } from '../config.js'
import { hmac, randomCode, timingEqual } from '../auth/crypto.js'

/**
 * ONE-TIME PASSCODES
 * ==================
 * The OTP is the only thing standing between a phone number and an account, so
 * everything below exists to make guessing, replaying or reading one hard.
 *
 * WHAT CHANGED, AND WHY IT HAD TO
 * The previous version ended `verifyOtp` with `return /^\d{4}$/.test(code)`
 * whenever no SMS provider was configured - which was every deployment,
 * because none was. Any four digits signed you in as any phone number on the
 * platform. That is the single most serious thing that was wrong with this
 * codebase, and it is why demo mode is now a real code that is really checked
 * rather than a bypass.
 *
 * THE FOUR PROPERTIES
 *  - UNGUESSABLE: six digits from the CSPRNG, not four from Math.random.
 *    Math.random's state is recoverable from its own output, so an attacker
 *    who could request codes for his own number could predict yours.
 *  - UNREADABLE AT REST: only an HMAC of the code is held, so a heap dump, a
 *    stray log line or a crash report does not hand over a live credential.
 *  - SINGLE USE: consumed on success, and destroyed after five wrong guesses.
 *    Without the attempt cap, a million-code space falls to a script.
 *  - SHORT LIVED: five minutes, with a sweeper so an abandoned code cannot sit
 *    in memory being guessable at leisure.
 *
 * The rate limits that sit in front of this live in auth/rateLimit.ts. They
 * are a separate concern - this file makes one code hard to break, that file
 * makes many attempts impossible.
 */

/** Six digits, not four: a million-wide space instead of ten thousand. */
export const OTP_DIGITS = 6
export const OTP_TTL_MS = 5 * 60 * 1000
export const OTP_MAX_ATTEMPTS = 5
/** One SMS per number per 30s. The user-visible resend cooldown. */
export const OTP_RESEND_MS = 30 * 1000

interface PendingOtp {
  /** HMAC of the code. The code itself is never retained. */
  hash: string
  expiresAt: number
  attempts: number
  lastSentAt: number
}

const pending = new Map<string, PendingOtp>()

/**
 * Expired codes must not linger.
 *
 * Two reasons, and the second is the one that bites: the map would otherwise
 * hold an entry per phone number ever seen, and that map is a list of everyone
 * who has tried to use the platform sitting in process memory.
 *
 * `unref` so an idle timer never keeps the process alive - without it, tests
 * and CLI scripts that import this module would simply hang.
 */
const sweeper = setInterval(() => sweepOtps(), 60_000)
sweeper.unref?.()

export function sweepOtps(now = Date.now()): number {
  let removed = 0
  for (const [phone, rec] of pending) {
    // Kept a little past expiry so the resend cooldown still applies to a code
    // that just timed out; otherwise letting one lapse would be a way to skip
    // the wait.
    if (rec.expiresAt + OTP_RESEND_MS <= now) {
      pending.delete(phone)
      removed++
    }
  }
  return removed
}

function hashCode(phone: string, code: string): string {
  // Bound to the phone number, so a code observed for one number cannot be
  // presented for another even if both happen to be issued the same digits.
  return hmac('otp', `${phone}:${code}`)
}

export interface SendOtpResult {
  sent: boolean
  /**
   * Present ONLY in demo mode, where it is shown on the OTP screen so the app
   * is walkable with no SMS account. It is a real code that is really checked;
   * this is not a bypass.
   */
  demoCode?: string
  cooldownMs?: number
}

export async function sendOtp(phone: string, now = Date.now()): Promise<SendOtpResult> {
  // A provider that owns verification owns sending too - with the MSG91 widget
  // the code has already gone out from the browser before this route is called
  // at all. Minting a local code here would leave a live credential nobody can
  // use, and start a resend cooldown against a send we did not make.
  if (otpProvider().verify) return { sent: true }

  const existing = pending.get(phone)

  // Resend cooldown. Without it the endpoint is an SMS-billing denial of
  // service against our own account.
  if (existing && now - existing.lastSentAt < OTP_RESEND_MS) {
    return { sent: false, cooldownMs: OTP_RESEND_MS - (now - existing.lastSentAt) }
  }

  const code = randomCode(OTP_DIGITS)

  // A resend REPLACES the previous code and resets the attempt counter. The
  // alternative - keeping both alive - doubles the guessable surface every
  // time somebody taps "send again".
  pending.set(phone, {
    hash: hashCode(phone, code),
    expiresAt: now + OTP_TTL_MS,
    attempts: 0,
    lastSentAt: now,
  })

  const provider = otpProvider()
  const sent = await provider.send(phone, code)
  if (!sent) {
    // Nothing was delivered, so leaving a live code behind would mean a
    // guessable credential nobody asked for.
    pending.delete(phone)
    return { sent: false }
  }

  return OTP.demo ? { sent: true, demoCode: code } : { sent: true }
}

export type VerifyFailure = 'no-code' | 'expired' | 'too-many-attempts' | 'wrong'

export type VerifyResult = { ok: true } | { ok: false; reason: VerifyFailure }

/**
 * Check a code and consume it.
 *
 * The caller maps every failure to one identical message. The distinction here
 * is for the audit log: telling a client "that code expired" versus "that code
 * is wrong" confirms that a code was issued for a number, which is information
 * about somebody else's account.
 */
export async function verifyOtp(
  phone: string,
  code: string,
  now = Date.now(),
): Promise<VerifyResult> {
  const provider = otpProvider()
  if (provider.verify) {
    // The provider holds the credential (MSG91 Verify, and the widget, whose
    // credential is a JWT rather than six digits). This branch has to come
    // BEFORE the digit check below or that check rejects every widget token.
    // Nothing to consume locally; their service owns expiry and attempt limits.
    const token = String(code ?? '')
    // Bounded so a junk body is refused here instead of being posted onward.
    if (!token || token.length > 4096) return { ok: false, reason: 'wrong' }
    return (await provider.verify(phone, token)) ? { ok: true } : { ok: false, reason: 'wrong' }
  }

  if (!new RegExp(`^\\d{${OTP_DIGITS}}$`).test(String(code ?? ''))) {
    return { ok: false, reason: 'wrong' }
  }

  const rec = pending.get(phone)
  if (!rec) return { ok: false, reason: 'no-code' }

  if (rec.expiresAt <= now) {
    pending.delete(phone)
    return { ok: false, reason: 'expired' }
  }

  if (rec.attempts >= OTP_MAX_ATTEMPTS) {
    pending.delete(phone)
    return { ok: false, reason: 'too-many-attempts' }
  }

  rec.attempts++

  if (!timingEqual(hashCode(phone, code), rec.hash)) {
    // Destroy the code on the last allowed miss rather than waiting for the
    // next request, so the cap cannot be walked past by simply stopping.
    if (rec.attempts >= OTP_MAX_ATTEMPTS) {
      pending.delete(phone)
      return { ok: false, reason: 'too-many-attempts' }
    }
    return { ok: false, reason: 'wrong' }
  }

  // Single use. A code that survived being used could be replayed from a log,
  // a screenshot or the browser history.
  pending.delete(phone)
  return { ok: true }
}

/** Test seam. Never called by the server. */
export function resetOtpState(): void {
  pending.clear()
}
