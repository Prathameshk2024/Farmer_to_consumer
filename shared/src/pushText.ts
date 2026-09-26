import type { AdminNotice, AdminNoticeKind, Order, OrderStatus } from './types.js'

/**
 * WHAT HER PHONE SAYS WHEN THE APP IS CLOSED.
 *
 * The same sentences her updates list prints (frontend/src/lib/notifications.ts),
 * because a notification and a row are two views of one event. They are copied
 * here rather than imported because the API cannot import the frontend's
 * dictionary; frontend/tests/pushText.test.ts holds every `notif.*` line equal
 * to its dictionary twin, so the two cannot drift.
 */
export type PushLang = 'mr' | 'en'

export interface PushText {
  title: string
  body: string
  /** Where a tap opens the app. Always a path on our own site, never a URL. */
  path: string
}

export const PUSH_LINES: Record<PushLang, Record<string, string>> = {
  mr: {
    'notif.sel.PLACED': 'नवीन ऑर्डर आले आहे',
    'notif.sel.CANCELLED': 'ग्राहकाने ऑर्डर रद्द केले',
    'notif.cus.ACCEPTED': 'तुमचे ऑर्डर स्वीकारले आहे',
    'notif.cus.PACKED': 'तुमचे ऑर्डर तयार झाले आहे',
    'notif.cus.OUT_FOR_DELIVERY': 'तुमचे ऑर्डर पोहोचवायला निघाले आहे',
    'notif.cus.DELIVERED': 'तुमचे ऑर्डर पोहोचले',
    'notif.cus.REJECTED': 'विक्रेतीला हे ऑर्डर घेता आले नाही',
    'notif.cus.CANCELLED': 'तुमचे ऑर्डर रद्द झाले',
    'notif.adm.SLOTS_GRANTED': 'तुम्हाला {n} नवीन जागा मिळाल्या आहेत',
    'notif.adm.SLOTS_REVOKED': 'तुमच्या {n} जागा काढून घेतल्या आहेत',
    'notif.adm.PAYMENT_APPROVED': 'तुमचा ₹50 चा भरणा मंजूर झाला — {n} जागा मिळाल्या',
    'notif.adm.PAYMENT_REJECTED': 'तुमचा भरणा तपासणीत जुळला नाही',
    'notif.adm.BLOCKED': 'तुमचे दुकान सध्या बंद केले आहे',
    'notif.adm.UNBLOCKED': 'तुमचे दुकान पुन्हा सुरू झाले आहे',
    'notif.adm.PRODUCT_APPROVED': 'तुमचे उत्पादन मंजूर झाले आणि आता दिसत आहे',
    'notif.adm.PRODUCT_REJECTED': 'तुमचे उत्पादन मंजूर झाले नाही आणि काढून टाकले आहे',
    'notif.reasonLabel': 'कारण',
    'notif.adm.SUBSCRIPTION_RENEWED': 'नूतनीकरण मंजूर झाले — तुमचे दुकान {date} पर्यंत सुरू राहील',
    // Lifted from 'cancel.sel.q3Paid' and 'refund.claimedBody' - see the test.
    'push.paid.title': 'ग्राहकाने या ऑर्डरसाठी ₹{total} भरल्याचे कळवले आहे',
    'push.paid.body': 'हे पैसे तुमच्या खात्यात आले आहेत का, ते तुमच्या UPI ॲपमध्ये पहा.',
  },
  en: {
    'notif.sel.PLACED': 'You have a new order',
    'notif.sel.CANCELLED': 'The customer cancelled the order',
    'notif.cus.ACCEPTED': 'Your order has been accepted',
    'notif.cus.PACKED': 'Your order is packed and ready',
    'notif.cus.OUT_FOR_DELIVERY': 'Your order is on the way',
    'notif.cus.DELIVERED': 'Your order has been delivered',
    'notif.cus.REJECTED': 'The seller could not take this order',
    'notif.cus.CANCELLED': 'Your order was cancelled',
    'notif.adm.SLOTS_GRANTED': 'You have been given {n} more product slots',
    'notif.adm.SLOTS_REVOKED': '{n} product slots were taken back',
    'notif.adm.PAYMENT_APPROVED': 'Your ₹50 payment was approved - {n} slots added',
    'notif.adm.PAYMENT_REJECTED': 'Your payment could not be matched',
    'notif.adm.BLOCKED': 'Your shop has been closed for now',
    'notif.adm.UNBLOCKED': 'Your shop is open again',
    'notif.adm.PRODUCT_APPROVED': 'Your product was approved and is live',
    'notif.adm.PRODUCT_REJECTED': 'Your product was not approved and has been removed',
    'notif.reasonLabel': 'Reason',
    'notif.adm.SUBSCRIPTION_RENEWED': 'Renewal approved - your shop is open until {date}',
    'push.paid.title': 'The customer says they have paid ₹{total} for this order',
    'push.paid.body': 'Check your UPI app to see whether it arrived.',
  },
}

/** Where tapping an admin decision goes - the same page its updates row opens. */
export const ADMIN_NOTICE_PATH: Record<AdminNoticeKind, string | undefined> = {
  SLOTS_GRANTED: '/seller/products',
  SLOTS_REVOKED: '/seller/subscription',
  PAYMENT_APPROVED: '/seller/products',
  PAYMENT_REJECTED: '/seller/subscription',
  BLOCKED: undefined,
  UNBLOCKED: undefined,
  PRODUCT_APPROVED: '/seller/products',
  PRODUCT_REJECTED: '/seller/products',
  SUBSCRIPTION_RENEWED: '/seller',
}

/** What the order is, in the words on the listing. "+2" counts the rest. */
export function orderItemSummary(o: Pick<Order, 'id' | 'items'>): string {
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

function line(lang: PushLang, key: string, vars: Record<string, string | number> = {}): string {
  const raw = PUSH_LINES[lang][key] ?? PUSH_LINES.mr[key] ?? key
  return raw.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole))
}

/** The only states the buyer hears about: the ones her updates list has a line for. */
const CUSTOMER_LINE: Partial<Record<OrderStatus, string>> = {
  ACCEPTED: 'notif.cus.ACCEPTED',
  PACKED: 'notif.cus.PACKED',
  OUT_FOR_DELIVERY: 'notif.cus.OUT_FOR_DELIVERY',
  DELIVERED: 'notif.cus.DELIVERED',
  REJECTED: 'notif.cus.REJECTED',
  CANCELLED: 'notif.cus.CANCELLED',
}

export function sellerOrderPush(order: Order, event: 'PLACED' | 'CANCELLED', lang: PushLang): PushText {
  const items = orderItemSummary(order)
  return {
    title: line(lang, `notif.sel.${event}`),
    body: event === 'PLACED'
      ? [items, `₹${order.total}`, order.customerName].filter(Boolean).join(' · ')
      : `${items} · ${order.id}`,
    path: `/seller/orders/${order.id}`,
  }
}

export function customerOrderPush(order: Order, to: OrderStatus, lang: PushLang): PushText | null {
  const key = CUSTOMER_LINE[to]
  if (!key) return null
  return {
    title: line(lang, key),
    body: `${orderItemSummary(order)} · ₹${order.total}`,
    path: `/shop/orders/${order.id}`,
  }
}

export function paymentClaimedPush(order: Order, lang: PushLang): PushText {
  return {
    title: line(lang, 'push.paid.title', { total: order.total }),
    body: `${line(lang, 'push.paid.body')} · ${order.id}`,
    path: `/seller/orders/${order.id}`,
  }
}

export function adminNoticePush(notice: AdminNotice, lang: PushLang): PushText {
  const path = ADMIN_NOTICE_PATH[notice.kind] ?? '/seller'
  // A renewal's note is the new end date, which belongs IN the sentence.
  if (notice.kind === 'SUBSCRIPTION_RENEWED') {
    return { title: line(lang, 'notif.adm.SUBSCRIPTION_RENEWED', { date: shortDate(notice.note) }), body: '', path }
  }
  // "dustbin" and "कारण: Invalid" are two facts; joined by a hyphen they read
  // as one strange product name. An older notice has no subject and carries
  // both in `note`, which is printed as it stands.
  const body = notice.subject && notice.note
    ? `${notice.subject} · ${line(lang, 'notif.reasonLabel')}: ${notice.note}`
    : notice.subject ?? notice.note ?? ''
  return {
    title: line(lang, `notif.adm.${notice.kind}`, notice.n == null ? {} : { n: notice.n }),
    body,
    path,
  }
}
