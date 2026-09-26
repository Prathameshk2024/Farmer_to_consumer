import type { SubscriptionPayment } from '@shared/types.js'
import type { SubscriptionView } from '@shared/subscription.js'
import { useT } from '../i18n/I18nProvider.js'
import { dateOnly } from '../lib/format.js'
import { Pill } from './ui.js'

/**
 * WHERE HER SIX MONTHS STAND, AT A GLANCE.
 *
 * Green while comfortably open, amber in the reminder week, red once her shop
 * has paused - always with the date as well as the colour, because the next
 * thing an admin does with a red pill is ring her and tell her when it ended.
 * `view` is computed by the API on the server's clock.
 */
export function SubscriptionPill({ view }: { view?: SubscriptionView }) {
  const t = useT()
  if (!view || view.state === 'none') return <Pill>{t('sub.none')}</Pill>
  const date = dateOnly(view.endsAt)
  if (view.state === 'expired') return <Pill tone="danger">{t('sub.expiredSince', { date })}</Pill>
  if (view.state === 'expiring') {
    const n = view.daysLeft ?? 0
    return (
      <Pill tone="warn">
        {n <= 1 ? t('sub.expiringOne', { date }) : t('sub.expiring', { n, date })}
      </Pill>
    )
  }
  return <Pill tone="ok">{t('sub.activeUntil', { date })}</Pill>
}

/** A pack is five slots; a renewal is six months. Different decisions, so labelled. */
export function PaymentKindPill({ kind }: { kind: SubscriptionPayment['kind'] }) {
  const t = useT()
  return <Pill tone="info">{kind === 'RENEWAL' ? t('pay.kind.RENEWAL') : t('pay.kind.PACK')}</Pill>
}
