import type { PushLang } from '@shared/pushText.js'
import type { Db } from '../db/seed.js'

/** An FCM token is one unbroken string; anything else did not come from the wrapper. */
const TOKEN_RE = /^\S{20,4096}$/

export type RegisterResult =
  | { ok: true; changed: boolean }
  | { ok: false; status: 400 | 404; error: string; messageMr: string }

/**
 * Keep a phone's token on the session that sent it - and take it off every
 * other session. One phone buzzes for one person: whoever signed in on it last.
 */
export function registerPushToken(db: Db, sessionId: string, body: unknown): RegisterResult {
  const b = (body ?? {}) as { token?: unknown; lang?: unknown }
  if (typeof b.token !== 'string' || !TOKEN_RE.test(b.token)) {
    return { ok: false, status: 400, error: 'Invalid push token', messageMr: 'सूचना चालू करता आल्या नाहीत. ॲप बंद करून पुन्हा उघडा.' }
  }
  if (b.lang !== undefined && b.lang !== 'mr' && b.lang !== 'en') {
    return { ok: false, status: 400, error: 'Invalid lang', messageMr: 'सूचना चालू करता आल्या नाहीत. ॲप बंद करून पुन्हा उघडा.' }
  }
  const lang: PushLang = b.lang === 'en' ? 'en' : 'mr'

  const session = db.sessions.find((s) => s.id === sessionId)
  if (!session) return { ok: false, status: 404, error: 'Session not found', messageMr: 'पुन्हा लॉगिन करा.' }

  let changed = false
  for (const s of db.sessions) {
    if (s.id !== sessionId && s.pushToken === b.token) {
      delete s.pushToken
      delete s.pushLang
      changed = true
    }
  }
  if (session.pushToken !== b.token || session.pushLang !== lang) {
    session.pushToken = b.token
    session.pushLang = lang
    changed = true
  }
  return { ok: true, changed }
}
