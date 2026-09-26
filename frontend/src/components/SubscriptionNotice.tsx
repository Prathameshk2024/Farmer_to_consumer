import { useNavigate } from 'react-router-dom'
import type { SubscriptionView } from '@shared/subscription.js'
import { useT } from '../i18n/I18nProvider.js'
import { shortDate } from '../lib/notifications.js'
import { Button, Notice } from './ui.js'

/**
 * HER SIX MONTHS, SAID WHERE SHE WILL SEE IT.
 *
 * Shown at the top of her home and products screens, only when there is
 * something to do: the reminder week, and a paused shop. Each says the date,
 * what happens (or has happened) to her shop, that renewing puts everything
 * back as it was - the question she will actually have - and carries the one
 * button that does it.
 *
 * `view` comes from the API, decided on the server's clock.
 */
export function SubscriptionNotice({ view }: { view?: SubscriptionView | null }) {
  const t = useT()
  const nav = useNavigate()
  if (!view?.endsAt) return null

  const date = shortDate(view.endsAt)
  const renew = (
    <div style={{ marginTop: 'var(--s3)' }}>
      <Button size="sm" onClick={() => nav('/seller/subscription')}>{t('sub.renewButton')}</Button>
    </div>
  )

  if (view.state === 'expired') {
    return (
      <Notice tone="danger" title={t('sub.expiredTitle')}>
        <div>{t('sub.expiredBody', { date })}</div>
        {renew}
      </Notice>
    )
  }

  if (view.state === 'expiring') {
    const n = view.daysLeft ?? 0
    return (
      <Notice tone="warn" title={n <= 1 ? t('sub.expiringTitleOne') : t('sub.expiringTitle', { n })}>
        <div>{t('sub.expiringBody', { date })}</div>
        {renew}
      </Notice>
    )
  }

  return null
}

/** "Subscription until 15 Mar 2027" - a quiet line while nothing is due. */
export function SubscriptionLine({ view }: { view?: SubscriptionView | null }) {
  const t = useT()
  if (!view?.endsAt || view.state !== 'active') return null
  return <div className="small dim">{t('sub.validUntil', { date: shortDate(view.endsAt) })}</div>
}
