import { useState } from 'react'
import type { Order } from '@shared/types.js'
import { BUYER_STAGES, buyerStageIndex, isCancelled } from '@shared/orderFlow.js'
import { useT } from '../i18n/I18nProvider.js'
import { IconAllClear, IconChevron, StatusIcon } from './icons.js'

/**
 * WHERE THE BUYER'S ORDER IS - four stages, one line each.
 *
 * Order confirmed · Shipped · Out for delivery · Delivered: the bold title and
 * the day it happened, nothing else. A stage the order has reached gets a green
 * dot and a green line down to the next; the rest stay grey. A delivered order
 * is green top to bottom. An order that stopped early shows only the stages it
 * really passed, then a red line saying it was called off.
 *
 * The seller's screens keep all five states - see `Timeline` in
 * screens/seller/Orders.tsx. This is the buyer's view only.
 */

/** "Sat, 23rd May '26" - the way a delivery app prints a day. Latin digits. */
export function trackerDate(iso: string | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const day = d.getDate()
  const suffix =
    day % 10 === 1 && day !== 11 ? 'st'
      : day % 10 === 2 && day !== 12 ? 'nd'
        : day % 10 === 3 && day !== 13 ? 'rd'
          : 'th'
  const weekday = d.toLocaleDateString('en-IN', { weekday: 'short' })
  const month = d.toLocaleDateString('en-IN', { month: 'short' })
  return `${weekday}, ${day}${suffix} ${month} '${String(d.getFullYear()).slice(-2)}`
}

/** When the order first reached this status, from its own event trail. */
function reachedAt(order: Order, status: Order['status']): string | undefined {
  return order.events.find((e) => e.to === status)?.at
}

export function BuyerTracker({ order }: { order: Order }) {
  const t = useT()
  const reached = buyerStageIndex(order)
  const ended = isCancelled(order.status)
  // An order that ended shows only what it really got through.
  const stages = ended ? BUYER_STAGES.slice(0, reached + 1) : BUYER_STAGES

  return (
    <ol className="track">
      {stages.map((stage, i) => {
        const done = i <= reached
        // The line down to the next dot is green only when that dot is too.
        const lineDone = i + 1 <= reached
        return (
          <li
            key={stage.key}
            className={`track__step ${done ? 'track__step--done' : ''} ${lineDone ? 'track__step--line' : ''}`}
          >
            <span className="track__dot" aria-hidden="true" />
            <span className="track__title">{t(stage.key)}</span>
            {done && <span className="track__date">{trackerDate(reachedAt(order, stage.status))}</span>}
          </li>
        )
      })}
      {ended && (
        <li className="track__step track__step--ended">
          <span className="track__dot" aria-hidden="true" />
          <span className="track__title">
            {order.status === 'REJECTED' ? t('track.rejected') : t('track.cancelled')}
          </span>
          <span className="track__date">{trackerDate(reachedAt(order, order.status))}</span>
        </li>
      )}
    </ol>
  )
}

/**
 * The one-line answer at the top of her order - "Delivered, May 24" in green
 * with a tick - that opens into the tracker. Open while the order is on its
 * way, because then the steps are the news; closed once it has arrived or
 * stopped, because then the one line is.
 */
export function OrderStatusBox({ order }: { order: Order }) {
  const t = useT()
  const reached = buyerStageIndex(order)
  const ended = isCancelled(order.status)
  const delivered = order.status === 'DELIVERED'
  const [open, setOpen] = useState(!delivered && !ended)

  const stage = reached >= 0 ? BUYER_STAGES[reached]! : null
  const label = ended
    ? (order.status === 'REJECTED' ? t('track.rejected') : t('track.cancelled'))
    : stage ? t(stage.key) : t('track.waiting')
  const at = ended
    ? reachedAt(order, order.status)
    : stage ? reachedAt(order, stage.status) : order.placedAt
  const day = at ? new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''
  const tone = delivered ? 'ok' : ended ? 'danger' : 'now'

  return (
    <div className={`statusbox statusbox--${tone}`}>
      <button
        type="button"
        className="statusbox__head"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="statusbox__icon" aria-hidden="true">
          {delivered ? <IconAllClear /> : <StatusIcon name={ended ? 'ended' : stage ? 'onTheWay' : 'placed'} />}
        </span>
        <span className="statusbox__label">{day ? `${label}, ${day}` : label}</span>
        <span className={`statusbox__chev ${open ? 'statusbox__chev--open' : ''}`} aria-hidden="true">
          <IconChevron />
        </span>
      </button>
      {open && (
        <div className="statusbox__body">
          <BuyerTracker order={order} />
        </div>
      )}
    </div>
  )
}
