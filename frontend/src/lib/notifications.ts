import type { Order, OrderStatus, Role, Seller } from '@shared/types.js'
import type { SubscriptionView } from '@shared/subscription.js'
import { statusLabelKey } from '@shared/orderFlow.js'
import { ADMIN_NOTICE_PATH, orderItemSummary, shortDate } from '@shared/pushText.js'

export { shortDate }

/**
 * WHAT CHANGED SINCE SHE LAST LOOKED
 * ==================================
 * A customer places an order and then hears nothing. The seller accepts it,
 * packs it, sets off with it - four real events, none of which reached the
 * person waiting at home. Her only option was to open the order and read the
 * timeline, which means knowing to look.
 *
 * DERIVED, NOT STORED. Every one of these events is already on the order as an
 * `OrderEvent { to, at, by }`, and both sides already fetch their own orders.
 * A `notifications` collection would be a second copy of facts we hold, kept
 * in step by hand, and wrong the first time somebody forgot to write a row.
 * Nothing here needs a new endpoint or a new table.
 *
 * Phone notifications exist now too (see CLAUDE.md "Push notifications") -
 * the tray, sound and vibration for a phone that is closed or asleep. This
 * list is still the in-app view: what she sees once she opens it, kept for as
 * long as `visibleFeed` below says a row stays relevant, not just the instant
 * a tray notification arrives and is dismissed.
 */

export interface Notice {
  /** Stable across reloads, so "seen" survives a refresh. */
  id: string
  /** Absent on an admin decision: there is no order behind it. */
  orderId?: string
  at: string
  /** Key into the dictionary, so the line is written once, in both languages. */
  labelKey: string
  /**
   * What the row is called. An order names what is IN it - a woman recognises
   * her pickle order, not SMB5013 - and an admin decision has no product, so
   * it has none of this and prints its sentence instead.
   */
  title?: string
  /**
   * Where the order stands NOW - the order's own status, not the last event
   * the other side caused. On the seller's side those are rarely the same
   * thing: the only states a customer causes are PLACED and CANCELLED, so a
   * tag drawn from her buyer's last action said "new order" on every row
   * forever, including ones she had packed and delivered herself.
   */
  status?: OrderStatus
  /**
   * Who it concerns, when we know. A SELLER's order list carries
   * `customerName`; a customer's carries only `sellerId`, so on her side this
   * is empty and the line names the order instead. Fetching each seller to
   * fill it would be one request per order for a subtitle.
   */
  who: string
  /** Numbers the line needs, e.g. how many slots. */
  vars?: Record<string, string | number>
  /** Only order lines carry money. */
  total?: number
  /** Where tapping the row goes, when it is not an order. */
  to?: string
  /**
   * WHY an admin decided what they decided, in their own words. Printed under
   * its own label, because "dustbin - Invalid" reads as a product with a
   * strange name, while "कारण: Invalid" reads as the answer to her question.
   */
  reason?: string
  /**
   * A state of her shop rather than something that happened at a moment: it
   * stays on the list however old it is, because it is still true. Only the
   * paused shop qualifies today - see `visibleFeed`.
   */
  standing?: boolean
}

/**
 * A whole sentence, addressed to whoever is reading it.
 *
 * The list used to print the state machine's own label - "Packed", "Accepted"
 * - which is what the ORDER is, not what happened to HER. A woman waiting at
 * home reads "Accepted" and has to work out who accepted what. The seller's
 * side gets its own wording for the same reason: "Order placed" is a fact
 * about a row, "You have a new order" is a thing to go and do.
 *
 * Only the OTHER side's actions ever reach a feed, so each map holds only the
 * states that side can actually cause. Anything else falls back to the plain
 * status label rather than printing a missing key.
 */
const CUSTOMER_LINE: Partial<Record<OrderStatus, string>> = {
  ACCEPTED: 'notif.cus.ACCEPTED',
  PACKED: 'notif.cus.PACKED',
  OUT_FOR_DELIVERY: 'notif.cus.OUT_FOR_DELIVERY',
  DELIVERED: 'notif.cus.DELIVERED',
  REJECTED: 'notif.cus.REJECTED',
  CANCELLED: 'notif.cus.CANCELLED',
}

const SELLER_LINE: Partial<Record<OrderStatus, string>> = {
  PLACED: 'notif.sel.PLACED',
  CANCELLED: 'notif.sel.CANCELLED',
}

export function noticeLabelKey(status: OrderStatus, role: Role): string {
  const line = role === 'seller' ? SELLER_LINE[status] : CUSTOMER_LINE[status]
  return line ?? statusLabelKey(status)
}

/**
 * ONE ROW PER ORDER, NOT ONE PER EVENT.
 *
 * An order that is accepted, packed, sent out and delivered produced four
 * rows, identical apart from the verb, stacked on top of each other with the
 * same total repeated four times. A woman opening this wants to know where
 * her pickle order is - one answer - not to read its history as four separate
 * announcements. So the row is the ORDER, it is named after what is in it,
 * and the state moves into a tag that changes as the order walks.
 *
 * The other side's actions only. A seller does not need telling that she
 * accepted an order two seconds ago, and a customer does not need telling she
 * placed one. Filtering by `by` is what keeps the list to things that happened
 * WHILE SHE WAS NOT LOOKING.
 *
 * Timestamped by the LATEST such event, which is what the bell's count reads:
 * an order that moves again after she looked counts once, not once per step.
 *
 * The TAG, though, is the order's own status rather than that event - see
 * `Notice.status`. What the row is for is "where is this order now".
 */
export function buildFeed(orders: Order[], role: Role): Notice[] {
  const mine = role === 'seller' ? 'seller' : 'customer'

  const out: Notice[] = []

  for (const o of orders) {
    const theirs = (o.events ?? [])
      .filter((e) => e.by !== mine)
      .sort((a, b) => a.at.localeCompare(b.at))

    const last = theirs[theirs.length - 1]
    if (!last) continue

    out.push({
      // The ORDER is the row, so the order id is the key. A second event on
      // the same order updates this row rather than adding one.
      id: o.id,
      orderId: o.id,
      at: last.at,
      labelKey: noticeLabelKey(last.to, role),
      title: orderItemSummary(o),
      status: o.status,
      who: mine === 'seller' ? o.customerName : '',
      total: o.total,
    })
  }

  return out.sort((a, b) => b.at.localeCompare(a.at))
}

/* ------------------------------------------------------------------ */
/* A list that forgets                                                 */
/* ------------------------------------------------------------------ */

/**
 * THIS IS THE NEWS, NOT THE ARCHIVE.
 *
 * The feed kept everything for ever, so in the third week of September a
 * seller opened it and read about the 8th - orders she had packed, delivered
 * and been paid for. Old rows pushed today's news off the screen, and a list
 * where nothing ever leaves teaches you that nothing in it is urgent.
 *
 * So a row she has already seen lives a week, and one she has NOT lives a
 * month - a woman who was away at a wedding still finds what she missed, and
 * what she has read stops repeating her orders screen.
 *
 * A STANDING row is exempt from both. "Your shop is paused" is not an event
 * that happened on a Tuesday; it is what is true about her shop right now,
 * and it belongs on the list until she renews.
 */
export const FEED_DAYS = 7
export const UNREAD_DAYS = 30

export function visibleFeed(feed: Notice[], seen: string, now = Date.now()): Notice[] {
  return feed.filter((n) => {
    if (n.standing) return true
    const days = (now - new Date(n.at).getTime()) / 86_400_000
    return n.at > seen ? days <= UNREAD_DAYS : days <= FEED_DAYS
  })
}

/**
 * Two groups, because after she opens the list every row looks equally old.
 * `seen` is the mark from BEFORE this visit - taking it after the screen has
 * marked everything read would put every row in "earlier".
 */
export function splitFeed(
  feed: Notice[],
  seen: string,
): { fresh: Notice[]; earlier: Notice[] } {
  return {
    fresh: feed.filter((n) => n.at > seen),
    earlier: feed.filter((n) => n.at <= seen),
  }
}

/**
 * Whole days between two moments, counted in calendar days on the phone's
 * own clock - "yesterday" means the day before today, not 24 hours.
 */
export function daysAgo(iso: string, now = Date.now()): number {
  const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return 0
  return Math.round((midnight(new Date(now)) - midnight(then)) / 86_400_000)
}

/**
 * When it happened, in the words she would use.
 *
 * "8/9/2026 11:01 pm" is a thing to decode; "काल" is a thing to know. Past a
 * week the count stops being readable in its turn - "23 दिवसांपूर्वी" is
 * arithmetic again - so an older row prints its date.
 */
export function whenKey(iso: string, now = Date.now()): {
  key?: string
  vars?: Record<string, string | number>
  /** Printed as it stands: a date is the same in both languages. */
  text?: string
} {
  const n = daysAgo(iso, now)
  if (n <= 0) return { key: 'when.today' }
  if (n === 1) return { key: 'when.yesterday' }
  if (n <= FEED_DAYS) return { key: 'when.daysAgo', vars: { n } }
  return { text: shortDate(iso) }
}

/* ------------------------------------------------------------------ */
/* What she has already seen                                           */
/* ------------------------------------------------------------------ */

/**
 * A timestamp in localStorage, per account.
 *
 * Per account because a shared family phone is normal here: her daughter
 * signing in must not clear the badge her mother has not looked at yet.
 *
 * A timestamp rather than a set of ids because it cannot grow, and because
 * "everything before this moment is read" is exactly what pressing the bell
 * means.
 */
function key(userId: string): string {
  return `wb.seenUntil.${userId}`
}

export function lastSeen(userId: string): string {
  try {
    return localStorage.getItem(key(userId)) ?? ''
  } catch {
    return ''
  }
}

export function markSeen(userId: string, at = new Date().toISOString()): void {
  try {
    localStorage.setItem(key(userId), at)
  } catch {
    /* private mode - the badge simply comes back next time */
  }
}

export function unreadCount(feed: Notice[], userId: string, now = Date.now()): number {
  const seen = lastSeen(userId)
  // Counted over the same rows the list will show her, or the badge promises
  // news the screen has already forgotten. No stored mark means she has never
  // opened the list, and everything inside the window is new.
  return visibleFeed(feed, seen, now).filter((n) => n.at > seen).length
}

/* ------------------------------------------------------------------ */
/* What an admin did to her account                                    */
/* ------------------------------------------------------------------ */

/**
 * The other half of "what happened while she was not looking".
 *
 * Her slots grew by five and nothing on any screen said so - she had to
 * notice the meter herself, and a woman who has just paid ₹50 and been
 * approved by hand deserves to be told rather than to check. These come off
 * her own seller record (`seller.notices`), written by the admin handler that
 * made the change, so this needs no new endpoint: `api.me()` already carries
 * them. The path each kind opens (`ADMIN_NOTICE_PATH`) lives in
 * `shared/src/pushText.ts`, alongside the FCM notification the same decision
 * sends, so a tap on the tray and a tap on this row land in the same place.
 */
export function adminFeed(seller: Seller | null | undefined): Notice[] {
  return (seller?.notices ?? []).map((n): Notice => {
    // A renewal's note is the new end date, which belongs IN the sentence
    // ("open until 15 Mar 2027") rather than printed raw beneath it.
    if (n.kind === 'SUBSCRIPTION_RENEWED') {
      return {
        id: n.id, at: n.at, labelKey: 'notif.adm.SUBSCRIPTION_RENEWED',
        vars: { date: shortDate(n.note) }, who: '', to: ADMIN_NOTICE_PATH[n.kind],
      }
    }
    return {
      id: n.id,
      at: n.at,
      labelKey: `notif.adm.${n.kind}`,
      vars: n.n == null ? undefined : { n: n.n },
      // What it was about. An older row has no `subject` and carries the name
      // and the reason joined in `note`; it prints as it always did.
      who: n.subject ?? n.note ?? '',
      reason: n.subject ? n.note : undefined,
      to: ADMIN_NOTICE_PATH[n.kind],
    }
  })
}

/* ------------------------------------------------------------------ */
/* Her six months                                                      */
/* ------------------------------------------------------------------ */

/**
 * The renewal reminder, derived from her end date like everything else here.
 *
 * Nothing is written when the reminder week starts or when the shop pauses -
 * no job runs at that moment to write it. The server says where she stands
 * (on its clock, not the phone's) and this turns that into one row:
 *
 * - the reminder week: "your shop pauses on 15 Mar", timed from the day the
 *   week began, so it counts once on the bell when it appears;
 * - once paused: "your shop is paused - renew", timed at the end date.
 *
 * The row id carries the end date, so after a renewal the next term's
 * reminder is a new row rather than one she already marked as read.
 */
export function subscriptionFeed(view: SubscriptionView | null | undefined): Notice[] {
  if (!view?.endsAt) return []
  const vars = { date: shortDate(view.endsAt), n: view.daysLeft ?? 0 }
  if (view.state === 'expiring' && view.remindFrom) {
    return [{
      id: `sub-expiring:${view.endsAt}`, at: view.remindFrom, labelKey: 'notif.sub.expiring',
      vars, who: '', to: '/seller/subscription',
    }]
  }
  if (view.state === 'expired') {
    return [{
      id: `sub-expired:${view.endsAt}`, at: view.endsAt, labelKey: 'notif.sub.expired',
      // Her shop is shut to buyers until she renews. That does not get old.
      vars, who: '', to: '/seller/subscription', standing: true,
    }]
  }
  return []
}

/** Both halves, newest first. The list she reads does not care where a line came from. */
export function mergeFeeds(...feeds: Notice[][]): Notice[] {
  return feeds.flat().sort((a, b) => b.at.localeCompare(a.at))
}
