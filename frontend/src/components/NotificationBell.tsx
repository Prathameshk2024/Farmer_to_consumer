import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useT } from '../i18n/I18nProvider.js'
import { useAuth } from '../store/AuthContext.js'
import { api } from '../lib/api.js'
import {
  adminFeed, buildFeed, mergeFeeds, subscriptionFeed, unreadCount,
} from '../lib/notifications.js'
import { IconBell } from './icons.js'

/**
 * The bell in the app bar, carrying a count of what happened while she was away.
 *
 * It fetches its own orders rather than taking `useAsync` from `ui.tsx`: the
 * bar lives in `ui.tsx`, so importing back the other way would be a cycle
 * between the two files that every screen loads.
 *
 * The count is DERIVED from her own orders (see lib/notifications.ts) - no new
 * endpoint, no polling, no second copy of facts the app already holds. It is
 * read when the bar mounts, which is each time she opens a screen.
 */
export default function NotificationBell() {
  const t = useT()
  const nav = useNavigate()
  const { session } = useAuth()
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    if (!session || session.role === 'admin') return
    let alive = true

    // A seller's list also holds what an admin decided about her account, so
     // the badge has to count both or it disagrees with the screen it opens.
    Promise.all([
      api.myOrders(),
      session.role === 'seller' ? api.me().catch(() => null) : Promise.resolve(null),
    ])
      .then(([{ orders }, me]) => {
        if (!alive) return
        const feed = mergeFeeds(
          buildFeed(orders, session.role), adminFeed(me?.seller), subscriptionFeed(me?.subscription),
        )
        setUnread(unreadCount(feed, session.userId))
      })
      // A bell that cannot count is still a bell. Never let this break a screen.
      .catch(() => {})

    return () => {
      alive = false
    }
  }, [session])

  if (!session || session.role === 'admin') return null

  const to = session.role === 'seller' ? '/seller/notifications' : '/shop/notifications'

  return (
    <button
      className="appbar__btn appbar__btn--bell"
      onClick={() => nav(to)}
      aria-label={unread > 0 ? t('notif.unread', { n: unread }) : t('notif.title')}
    >
      <IconBell aria-hidden="true" />
      {unread > 0 && (
        // Capped at 9+. A seller back after a week does not need the exact
        // number, only to know there is a pile.
        <span className="appbar__dot">{unread > 9 ? '9+' : unread}</span>
      )}
    </button>
  )
}
