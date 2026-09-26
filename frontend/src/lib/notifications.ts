import type { AdminNoticeKind, Order, OrderStatus, Role, Farmer } from '@shared/types.js'
import { statusLabelKey } from '@shared/orderFlow.js'

/** Where tapping an admin decision goes. */
const ADMIN_NOTICE_PATH: Record<AdminNoticeKind, string | undefined> = {
  VERIFIED: '/farmer/products',
  BLOCKED: undefined,
  UNBLOCKED: undefined,
  PRODUCT_REJECTED: '/farmer/products',
}

/** What the order is, in the words on the listing. "+2" counts the rest. */
function orderItemSummary(o: Pick<Order, 'id' | 'items'>): string {
  const [first, ...rest] = o.items ?? []
  if (!first) return o.id
  return rest.length ? `${first.name} +${rest.length}` : first.name
}

/** "15 Mar 2027" - Latin digits, the way every other date in the app is printed. */
export function shortDate(iso: string | undefined): string {
  const d = new Date(iso ?? '')
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })
}

/**
 * WHAT CHANGED SINCE SHE LAST LOOKED
 * ==================================
 * A customer places an order and then hears nothing. The farmer accepts it,
 * packs it, sets off with it - four real events, none of which reached the
 * person waiting at home. Her only option was to open the order and read the
 * timeline, which means knowing to look.
 *
 * DERIVED, NOT STORED. Every one of these events is already on the order as an
 * `OrderEvent { to, at, by }`, and both sides already fetch their own orders.
 * A `notifications` collection would be a second copy of facts we hold, kept
 * in step by hand, and wrong the first time somebody forgot to write a row.
 * Nothing here needs a new endpoint or a new table.
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
   * the other side caused. On the farmer's side those are rarely the same
   * thing: the only states a customer causes are PLACED and CANCELLED, so a
   * tag drawn from her buyer's last action said "new order" on every row
   * forever, including ones she had packed and delivered herself.
   */
  status?: OrderStatus
  /**
   * Who it concerns, when we know. A FARMER's order list carries
   * `customerName`; a customer's carries only `farmerId`, so on her side this
   * is empty and the line names the order instead. Fetching each farmer to
   * fill it would be one request per order for a subtitle.
   */
  who: string
  /** Numbers the line needs. */
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
 * home reads "Accepted" and has to work out who accepted what. The farmer's
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

const FARMER_LINE: Partial<Record<OrderStatus, string>> = {
  PLACED: 'notif.sel.PLACED',
  CANCELLED: 'notif.sel.CANCELLED',
}

export function noticeLabelKey(status: OrderStatus, role: Role): string {
  const line = role === 'farmer' ? FARMER_LINE[status] : CUSTOMER_LINE[status]
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
 * The other side's actions only. A farmer does not need telling that she
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
  const mine = role === 'farmer' ? 'farmer' : 'customer'

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
      who: mine === 'farmer' ? o.customerName : '',
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
 * farmer opened it and read about the 8th - orders she had packed, delivered
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
 * A farmer verified by hand deserves to be told rather than to check. These come off
 * her own farmer record (`farmer.notices`), written by the admin handler that
 * made the change, so this needs no new endpoint: `api.me()` already carries
 * them. The path each kind opens is `ADMIN_NOTICE_PATH` above.
 */
export function adminFeed(farmer: Farmer | null | undefined): Notice[] {
  return (farmer?.notices ?? []).map((n): Notice => {
    return {
      id: n.id,
      at: n.at,
      labelKey: n.kind === 'VERIFIED' ? 'notif.verified' : `notif.adm.${n.kind}`,
      vars: n.n == null ? undefined : { n: n.n },
      // What it was about. An older row has no `subject` and carries the name
      // and the reason joined in `note`; it prints as it always did.
      who: n.subject ?? n.note ?? '',
      reason: n.subject ? n.note : undefined,
      to: ADMIN_NOTICE_PATH[n.kind],
    }
  })
}

/** Both halves, newest first. The list she reads does not care where a line came from. */
export function mergeFeeds(...feeds: Notice[][]): Notice[] {
  return feeds.flat().sort((a, b) => b.at.localeCompare(a.at))
}
