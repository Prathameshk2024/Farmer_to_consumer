/**
 * Page walkthroughs - one per bottom-nav section, not one for the whole app.
 *
 * A single tour after registration is over before she has anything to do with
 * it. Each screen explains ITSELF the first time she opens it, and never
 * again unless she asks for it from Help & Training.
 *
 * `sel` points at a control that is really on the screen. Nothing here draws
 * its own copy of a button: when a selector matches nothing - a gated wizard,
 * an empty cart - the step still shows, just without the ring.
 */

export interface TourStep {
  /** CSS selector for the real control, usually `[data-wt="..."]`. */
  sel?: string
  /** Existing dictionary key - the control's own words, so they match. */
  title: string
  /** What to do with it, written for this screen. */
  body: string
  /**
   * A stand-in for a screen that has nothing on it yet - an empty cart.
   * Worth showing, not worth counting: a woman told "choose some products
   * first" has not yet been taught the cart, so seeing this must not spend
   * her one automatic showing of the real thing.
   */
  provisional?: boolean
}

/**
 * Should this screen be trying to open its walkthrough?
 *
 * `already` is what makes a replay survive. The replay arrives as route state
 * and that state is wiped at once, so a Back press onto the same entry does
 * not start the tour over - but the tour may still be waiting for the screen
 * to finish loading before it has anything to ring. Without carrying the
 * intent forward, wiping the state cancels the open, and tapping a topic in
 * Help & Training lands on the right page and does nothing at all.
 */
export function wantsTour(
  { replay, seen, already }: { replay: boolean; seen: boolean; already: boolean },
): boolean {
  return replay || already || !seen
}

/**
 * Did she actually see the walkthrough, or only a stand-in?
 *
 * Only a real step closes the tour for good. A screen that had nothing to
 * point at offers itself again once it does.
 */
export function shouldMarkSeen(shown: TourStep[]): boolean {
  return shown.some((s) => !s.provisional)
}

export type TourId =
  | 'seller.business' | 'seller.upload' | 'seller.profile' | 'seller.help'
  | 'shop.explore' | 'shop.categories' | 'shop.cart' | 'shop.profile'

export const TOURS: Record<TourId, TourStep[]> = {
  'seller.business': [
    { sel: '[data-wt="biz-shop"]', title: 'biz.shopOpen', body: 'wt.biz1' },
    { sel: '[data-wt="biz-slots"]', title: 'prof.subscription', body: 'wt.biz2' },
    { sel: '[data-wt="biz-action"]', title: 'biz.needsAction', body: 'wt.biz3' },
    { sel: '[data-wt="biz-links"]', title: 'biz.myProducts', body: 'wt.biz4' },
  ],
  'seller.upload': [
    { sel: '[data-wt="up-dots"]', title: 'prod.add', body: 'wt.up1' },
    { sel: '[data-wt="up-body"] .field', title: 'prod.photos', body: 'wt.up2' },
    { sel: '[data-wt="up-next"]', title: 'common.next', body: 'wt.up3' },
  ],
  'seller.profile': [
    { sel: '[data-wt="prof-slots"]', title: 'prof.subscription', body: 'wt.pr1' },
    { sel: '[data-wt="prof-pay"]', title: 'prof.payment', body: 'wt.pr2' },
    { sel: '[data-wt="prof-lang"]', title: 'onb.chooseLang', body: 'wt.pr3' },
  ],
  'seller.help': [
    { sel: '[data-wt="help-tours"]', title: 'wt.title', body: 'wt.hp1' },
    { sel: '[data-wt="help-contact"]', title: 'help.contact', body: 'wt.hp2' },
  ],
  'shop.explore': [
    { sel: '[data-wt="ex-search"]', title: 'common.search', body: 'wt.ex1' },
    // The category step went with the strip it pointed at. Categories are a
    // bottom tab, and the Categories tour teaches them there.
    { sel: '[data-wt="ex-grid"] .pcard', title: 'cus.homemade', body: 'wt.ex3' },
  ],
  /* This screen holds one kind of thing, so the tour says one thing and
     rings one TILE. A ring around the whole grid is not a highlight, and the
     second step used to point at the cart - answering a question she had not
     asked, on a screen she was still reading. */
  'shop.categories': [
    { sel: '[data-wt="cat-grid"] button', title: 'nav.categories', body: 'wt.ca1' },
  ],
  /* An empty basket first - it is the only thing on that screen, and "choose
     products before you can order" is what she is missing. It disappears the
     moment there is something in the cart, which is when the other three
     controls exist. */
  'shop.cart': [
    { sel: '[data-wt="cart-empty"]', title: 'cus.cartEmpty', body: 'wt.ct0', provisional: true },
    { sel: '[data-wt="cart-list"] .stepper', title: 'nav.cart', body: 'wt.ct1' },
    { sel: '[data-wt="cart-total"]', title: 'cus.grandTotal', body: 'wt.ct2' },
    { sel: '[data-wt="cart-checkout"]', title: 'cus.checkout', body: 'wt.ct3' },
  ],
  'shop.profile': [
    { sel: '[data-wt="cprof-name"]', title: 'cus.yourName', body: 'wt.cp1' },
    { sel: '[data-wt="cprof-orders"]', title: 'cus.myOrders', body: 'wt.cp2' },
    { sel: '[data-wt="cprof-addr"]', title: 'cus.savedAddresses', body: 'wt.cp3' },
  ],
}

/** The four bottom tabs, in the order they sit in the nav bar. */
export const TOUR_MENU: Record<'seller' | 'customer', { id: TourId; to: string; label: string }[]> = {
  seller: [
    { id: 'seller.business', to: '/seller', label: 'nav.business' },
    { id: 'seller.upload', to: '/seller/upload', label: 'nav.upload' },
    { id: 'seller.profile', to: '/seller/profile', label: 'nav.profile' },
    { id: 'seller.help', to: '/seller/help', label: 'nav.help' },
  ],
  customer: [
    { id: 'shop.explore', to: '/shop', label: 'nav.explore' },
    { id: 'shop.categories', to: '/shop/categories', label: 'nav.categories' },
    { id: 'shop.cart', to: '/shop/cart', label: 'nav.cart' },
    { id: 'shop.profile', to: '/shop/profile', label: 'nav.myProfile' },
  ],
}

/**
 * Which tours she has finished, on this device.
 *
 * NOT keyed on the account and never cleared on sign-out: the point of the
 * flag is "this phone has been shown this screen", and re-teaching a woman
 * her own shop because she logged out once is the failure this prevents.
 */
export const SEEN_KEY = 'wb.tours'

/** Just the two methods, so the rules are testable without a browser. */
export type TourStore = Pick<Storage, 'getItem' | 'setItem'>

export function seenTours(store: TourStore): TourId[] {
  try {
    const raw = JSON.parse(store.getItem(SEEN_KEY) ?? '[]') as unknown
    // A hand-edited or half-written row means "shown nothing", never a crash
    // on every screen she opens.
    return Array.isArray(raw) ? (raw.filter((v) => typeof v === 'string') as TourId[]) : []
  } catch {
    return []
  }
}

export function markTourSeen(store: TourStore, id: TourId): void {
  try {
    const seen = seenTours(store)
    if (seen.includes(id)) return
    store.setItem(SEEN_KEY, JSON.stringify([...seen, id]))
  } catch {
    /* private mode - she will be offered the walkthrough again */
  }
}
