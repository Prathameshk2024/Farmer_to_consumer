import type { Session } from '@shared/types.js'
import type { LangCode } from '../i18n/strings.js'

/**
 * THE HANDSHAKE WITH THE APK.
 *
 * The page cannot get a notification token itself - Android System WebView has
 * no push - so it asks the wrapper (`{ type: 'push:enable' }`), and the wrapper
 * answers by calling `window.__smbPushToken(token)`. This file is pure so it
 * can be tested in Node; components/PushBridge.tsx mounts it.
 */

export interface PushWindow {
  /** Present only inside the APK, and only because the wrapper sets onMessage. */
  ReactNativeWebView?: { postMessage(message: string): void }
  __smbPushToken?: (token: string) => void
  /**
   * The wrapper's answer to every `push:enable`, and again whenever she comes
   * back from Android's settings having changed it. An APK older than this
   * never calls it, which reads as "no news" - never as refused.
   */
  __smbPushStatus?: (granted: boolean) => void
}

export function wantsPush(session: Pick<Session, 'role'> | null): boolean {
  return session?.role === 'seller' || session?.role === 'customer'
}

/**
 * Ask the wrapper for the token, and register whatever it hands back in her
 * current language. Run again on sign-in and on a language change. Returns the
 * cleanup. Logout needs nothing: the server drops the token with the session.
 */
export function startPushBridge(opts: {
  w: PushWindow
  session: Session | null
  lang: LangCode
  register: (token: string, lang: LangCode) => Promise<unknown>
  /** Whether Android lets notifications reach her. See PushWindow.__smbPushStatus. */
  onStatus?: (granted: boolean) => void
}): () => void {
  const { w, session, lang, register, onStatus } = opts
  const bridge = w.ReactNativeWebView
  if (!bridge || !wantsPush(session)) return () => {}

  w.__smbPushToken = (token) => {
    register(token, lang).catch(() => {
      // A notification is a courtesy. The bell list still works without it.
    })
  }
  if (onStatus) w.__smbPushStatus = onStatus
  bridge.postMessage(JSON.stringify({ type: 'push:enable' }))
  return () => {
    delete w.__smbPushToken
    delete w.__smbPushStatus
  }
}

/**
 * After two refusals Android never shows its prompt again, so the only way
 * back is the app's page in Android's settings. The wrapper opens it.
 */
export function openPushSettings(w: PushWindow): void {
  w.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'push:settings' }))
}
