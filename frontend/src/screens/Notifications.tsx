import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useT } from '../i18n/I18nProvider.js'
import { useAuth } from '../store/AuthContext.js'
import { api } from '../lib/api.js'
import {
  adminFeed, buildFeed, lastSeen, markSeen, mergeFeeds, splitFeed,
  subscriptionFeed, visibleFeed, whenKey, type Notice,
} from '../lib/notifications.js'
import { STATUS_STYLE, statusLabelKey } from '@shared/orderFlow.js'
import {
  AppBar, Card, EmptyState, Loading, Pill, Rupees, SectionTitle, useAsync,
} from '../components/ui.js'
import {
  IconBell, StatusIcon,
} from '../components/icons.js'

/**
 * Everything that happened to her orders while she was not looking.
 *
 * ONE SCREEN FOR BOTH SIDES. A seller sees what her buyers did; a customer
 * sees what her seller did. The list is the same shape either way - an order,
 * a new state, a time - and writing it twice would be two places for the
 * wording to drift.
 *
 * Opening this screen marks everything read. Not each row: she has just been
 * shown the lot, and leaving a badge up after she has looked is the fastest
 * way to teach somebody to ignore a badge.
 */
export default function Notifications() {
  const t = useT()
  const nav = useNavigate()
  const { session } = useAuth()
  const [data, loading] = useAsync(() => api.myOrders(), [])
  /* Admin decisions live on her own seller record, so this is the same call
     every seller screen already makes - not a notifications endpoint. */
  const [meData] = useAsync(
    () => (session?.role === 'seller' ? api.me() : Promise.resolve(null)),
    [session?.role],
  )

  /**
   * The mark as it stood when she ARRIVED, held for the life of the screen.
   *
   * Opening the list marks everything read a moment later, so reading the
   * mark again would put every row under "earlier" and the split would say
   * nothing. This is the answer to "what is new since last time", and it has
   * to be taken before we answer it.
   */
  const [seenOnArrival] = useState(() => (session ? lastSeen(session.userId) : ''))

  // Everything is marked read on arrival, not row by row: she has just been
  // shown the lot, and leaving a badge up after she has looked is the fastest
  // way to teach somebody to ignore a badge.
  useEffect(() => {
    if (session && !loading) markSeen(session.userId)
  }, [session, loading])

  const feed = session
    ? visibleFeed(
        mergeFeeds(
          buildFeed(data?.orders ?? [], session.role),
          adminFeed(meData?.seller),
          subscriptionFeed(meData?.subscription),
        ),
        seenOnArrival,
      )
    : []
  const { fresh, earlier } = splitFeed(feed, seenOnArrival)
  const orderPath = session?.role === 'seller' ? '/seller/orders' : '/shop/orders'

  /**
   * A row is read top to bottom, in the order the answer arrives: what it is
   * and when, then what happened to it, then whose it is and what it came to.
   *
   * The old row put the state pill inside the title and ran the rest together
   * as "name · SMB5013 · 8/9/2026 11:01 pm", which is four facts printed as
   * one string. An order also says its sentence now ("तुम्हाला नवीन ऑर्डर आले
   * आहे") rather than making her read the tag and work out who did it - the
   * wording was already written for both sides, it was just not being shown
   * on the rows that had a product name to print.
   */
  const row = (n: Notice, isNew: boolean) => {
    const style = n.status ? STATUS_STYLE[n.status] : null
    return (
      <button
        key={n.id}
        className={`notif ${isNew ? 'notif--new' : ''}`}
        onClick={() => {
          const to = n.orderId ? `${orderPath}/${n.orderId}` : n.to
          if (to) nav(to)
        }}
      >
        <span className={`notif__mark notif__mark--${style?.tone ?? 'neutral'}`} aria-hidden="true">
          {style ? <StatusIcon name={style.icon} /> : <IconBell />}
        </span>

        <span className="notif__body">
          <span className="notif__head">
            {/* An order is named after what is in it - she recognises her
                pickle order, not SMB5013 - and an admin decision has no
                product, so it prints its sentence here instead. */}
            <span className="notif__title">{n.title ?? t(n.labelKey, n.vars)}</span>
            <span className="notif__when">{when(n.at, t)}</span>
          </span>

          {n.title && <span className="notif__say">{t(n.labelKey, n.vars)}</span>}
          {(n.who || n.orderId) && (
            <span className="notif__meta">{[n.who, n.orderId].filter(Boolean).join(' · ')}</span>
          )}
          {/* The admin's own words, under the label that says what they are. */}
          {n.reason && (
            <span className="notif__meta">{t('notif.reasonLabel')}: {n.reason}</span>
          )}

          {(n.status || n.total != null) && (
            <span className="notif__foot">
              {style && n.status && (
                <Pill tone={style.tone} icon={<StatusIcon name={style.icon} />}>
                  {t(statusLabelKey(n.status))}
                </Pill>
              )}
              {n.total != null && (
                <span className="notif__amount"><Rupees value={n.total} /></span>
              )}
            </span>
          )}
        </span>
      </button>
    )
  }

  return (
    <>
      <AppBar title={t('notif.title')} backTo={session?.role === 'seller' ? '/seller' : '/shop'} />
      <div className="screen stack-sm">
        {loading ? (
          <Loading />
        ) : feed.length === 0 ? (
          <Card>
            <EmptyState icon={IconBell} title={t('notif.none')} body={t('notif.noneSub')} />
          </Card>
        ) : (
          <>
            {/* Headed only when there is something on both sides of the line:
                one heading over the whole list names nothing. */}
            {fresh.length > 0 && earlier.length > 0 && (
              <SectionTitle>{t('notif.new')}</SectionTitle>
            )}
            {fresh.map((n) => row(n, true))}
            {fresh.length > 0 && earlier.length > 0 && (
              <SectionTitle>{t('notif.earlier')}</SectionTitle>
            )}
            {earlier.map((n) => row(n, false))}
          </>
        )}
      </div>
    </>
  )
}

/** "आज", "काल", "3 दिवसांपूर्वी" - and a date once counting stops helping. */
function when(iso: string, t: (k: string, v?: Record<string, string | number>) => string): string {
  const { key, vars, text } = whenKey(iso)
  return text ?? t(key!, vars)
}
