import { useEffect, useRef, useState } from 'react'
import logo from '../assets/logo.png'
import { useT } from '../i18n/I18nProvider.js'
import { useOnline } from '../lib/useOnline.js'
import { IconCheck, IconOffline } from './icons.js'

/**
 * WHAT SHE SEES WHEN THE INTERNET GOES.
 *
 * Without this a dropped connection surfaced as whatever the current screen
 * did with a failed fetch - a spinner that never ends, or an error that
 * reads like the app is broken. That tells a woman nothing she can act on,
 * and the one thing she can do is turn data back on.
 *
 * Only a connection lost AFTER the site loaded reaches this. With no network
 * at launch the APK never loads the site at all, so that screen belongs to the
 * wrapper (`renderError` in its `app/index.tsx`), not to this file.
 *
 * It is drawn OVER the app, never instead of it. The routes underneath stay
 * mounted, so a half-filled form or the product wizard is exactly where she
 * left it when the connection returns, and the screen goes away by itself on
 * the `online` event - she does not have to find the retry button at all.
 */
export default function OfflineScreen() {
  const t = useT()
  const online = useOnline()
  const [checking, setChecking] = useState(false)
  const [stillOffline, setStillOffline] = useState(false)
  const timer = useRef<number>()

  useEffect(() => {
    if (online) setStillOffline(false)
  }, [online])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  if (online) return null

  // A retry that answers instantly looks like a button that did nothing, so
  // it holds "checking" for a moment before saying the answer is still no.
  const retry = () => {
    setChecking(true)
    setStillOffline(false)
    timer.current = window.setTimeout(() => {
      setChecking(false)
      setStillOffline(!navigator.onLine)
    }, 900)
  }

  return (
    <div className="offline" role="alertdialog" aria-modal="true" aria-labelledby="offline-title">
      <div className="offline__card">
        <div className="offline__brand">
          <img className="offline__logo" src={logo} alt="" aria-hidden="true" />
          <span>{t('app.name')}</span>
        </div>

        <span className="offline__icon" aria-hidden="true"><IconOffline /></span>
        <h1 id="offline-title" className="offline__title">{t('offline.title')}</h1>
        <p className="offline__body">{t('offline.body')}</p>

        <p className="offline__safe">
          <span aria-hidden="true"><IconCheck /></span> {t('offline.safe')}
        </p>

        <button type="button" className="btn" onClick={retry} disabled={checking}>
          {checking ? t('offline.checking') : t('common.retry')}
        </button>
        <p className="offline__still" role="status">
          {stillOffline ? t('offline.still') : ''}
        </p>
      </div>
    </div>
  )
}
