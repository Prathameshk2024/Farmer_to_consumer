import { useEffect, useState } from 'react'
import { useI18n, useT } from '../i18n/I18nProvider.js'
import { api } from '../lib/api.js'
import { openPushSettings, startPushBridge, wantsPush, type PushWindow } from '../lib/pushBridge.js'
import { useAuth } from '../store/AuthContext.js'

/** Per app launch: the WebView keeps sessionStorage until the app is closed. */
const LATER_KEY = 'wb.pushOffLater'

function saidLater(): boolean {
  try {
    return sessionStorage.getItem(LATER_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Mounted once in App.tsx; see lib/pushBridge.ts.
 *
 * Renders only when she refused Android's notification prompt. After two
 * refusals Android never asks again, and without this nothing would tell her
 * that orders will now arrive silently - or how to undo it.
 */
export default function PushBridge() {
  const { session } = useAuth()
  const { lang } = useI18n()
  const t = useT()
  const w = window as unknown as PushWindow
  const [granted, setGranted] = useState<boolean | null>(null)
  const [later, setLater] = useState(saidLater)

  useEffect(
    () => startPushBridge({ w, session, lang, register: api.registerPush, onStatus: setGranted }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session, lang],
  )

  if (granted !== false || later || !wantsPush(session)) return null

  const notNow = () => {
    setLater(true)
    try {
      sessionStorage.setItem(LATER_KEY, '1')
    } catch {
      // Hidden for this screen's life, then.
    }
  }

  return (
    <div className="pushoff notice notice--warn" role="status">
      <strong className="notice__title">{t('push.offTitle')}</strong>
      {t('push.offBody')}
      <div className="pushoff__actions">
        <button type="button" className="btn btn--sm" onClick={() => openPushSettings(w)}>
          {t('push.openSettings')}
        </button>
        <button type="button" className="btn btn--sm btn--quiet" onClick={notNow}>
          {t('common.skip')}
        </button>
      </div>
    </div>
  )
}
