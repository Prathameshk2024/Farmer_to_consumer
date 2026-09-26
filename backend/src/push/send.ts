import { getApps } from 'firebase-admin/app'
import { getMessaging } from 'firebase-admin/messaging'
import type { PushLang, PushText } from '@shared/pushText.js'
import type { Db } from '../db/seed.js'
import type { PushTarget } from './targets.js'

export interface PushMessage {
  token: string
  title: string
  body: string
  path: string
}

export interface SendOutcome {
  token: string
  ok: boolean
  /** The phone no longer has the app (or cleared its data): forget the token. */
  dead: boolean
  /** FCM's reason for a failure, e.g. `messaging/mismatched-credential`. Logged, never acted on beyond `dead`. */
  code?: string
}

export type PushTransport = (messages: PushMessage[]) => Promise<SendOutcome[]>

/** Null until index.ts installs FCM - so tests and local development send nothing. */
let transport: PushTransport | null = null

export function setPushTransport(t: PushTransport | null): void {
  transport = t
}

export function pushEnabled(): boolean {
  return transport !== null
}

/**
 * `sendEach` is the HTTP v1 API: an uninstalled app, or one whose data was
 * cleared, reports as `registration-token-not-registered`. A malformed token
 * reports as `invalid-argument` instead - deliberately NOT dead, because that
 * code also fires on an oversized payload, and the body carries the
 * buyer-typed `customerName`, so a long name could otherwise wipe a seller's
 * real token. `invalid-registration-token` is the older legacy-API code and
 * v1 should never send it; it costs nothing to keep recognising it anyway.
 */
const DEAD_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
])

/** Sends through the Firebase app store.ts already initialised for Firestore. */
export function fcmTransport(): PushTransport {
  return async (messages) => {
    const app = getApps()[0]
    if (!app) return messages.map((m) => ({ token: m.token, ok: false, dead: false }))
    const res = await getMessaging(app).sendEach(messages.map((m) => ({
      token: m.token,
      notification: m.body ? { title: m.title, body: m.body } : { title: m.title },
      data: { path: m.path },
      android: {
        priority: 'high' as const,
        notification: { channelId: 'orders', color: '#7b1e2e', sound: 'default' },
      },
    })))
    return res.responses.map((r, i) => ({
      token: messages[i]!.token,
      ok: r.success,
      dead: !r.success && DEAD_CODES.has(r.error?.code ?? ''),
      code: r.error?.code,
    }))
  }
}

/**
 * Build each target's message in her language, send, and forget any phone
 * that has uninstalled the app. Resolves to how many were accepted. Never
 * rejects: a notification is a courtesy, and the order it describes is
 * already saved.
 */
export async function sendPush(
  db: Db,
  targets: PushTarget[],
  build: (lang: PushLang) => PushText | null,
  persist: () => void,
): Promise<number> {
  if (!transport || targets.length === 0) return 0
  const messages: PushMessage[] = []
  for (const t of targets) {
    const text = build(t.lang)
    if (text) messages.push({ token: t.token, ...text })
  }
  if (messages.length === 0) return 0

  try {
    const outcomes = await transport(messages)
    const dead = new Set(outcomes.filter((o) => o.dead).map((o) => o.token))
    if (dead.size > 0) {
      for (const s of db.sessions) {
        if (s.pushToken && dead.has(s.pushToken)) {
          delete s.pushToken
          delete s.pushLang
        }
      }
      persist()
    }
    const failed = outcomes.filter((o) => !o.ok && !o.dead)
    if (failed.length > 0) {
      const codes = [...new Set(failed.map((o) => o.code ?? 'unknown'))].join(', ')
      console.warn(`[push] ${failed.length} of ${messages.length} not delivered: ${codes}`)
    }
    return outcomes.filter((o) => o.ok).length
  } catch (err) {
    console.warn('[push] send failed:', err instanceof Error ? err.message : err)
    return 0
  }
}
