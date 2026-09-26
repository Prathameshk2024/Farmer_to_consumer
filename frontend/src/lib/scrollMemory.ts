/**
 * WHERE SHE WAS READING, PER HISTORY ENTRY.
 *
 * Forward navigation should start at the top and backward navigation should
 * not - a product page opens at its own beginning, and the catalogue she came
 * from opens where she left it. One `window.scrollTo(0, 0)` on every route
 * change gets the first half right and the second half exactly wrong: thirty
 * swipes back down to the product she was looking at, on a phone, which is how
 * a shopper learns not to browse past the first screenful.
 *
 * Keyed on the history entry rather than the path, because the same screen
 * reached twice is two different places she was reading.
 *
 * In memory only, and deliberately: a scroll position is worth nothing after
 * the tab closes, and writing one to storage on every scroll event would be
 * the most frequent write in the app.
 */
const positions = new Map<string, number>()

export function rememberScroll(key: string, y: number): void {
  positions.set(key, y)
}

/** Anywhere she has not been is the top. */
export function recallScroll(key: string): number {
  return positions.get(key) ?? 0
}

export function forgetScroll(key: string): void {
  positions.delete(key)
}

/* ------------------------------------------------------------------ */
/* Putting her back there                                              */
/* ------------------------------------------------------------------ */

/**
 * RESTORING IS WAITING, NOT AIMING.
 *
 * Every screen fetches its own data, so at the moment she comes back the list
 * is one spinner tall - and a browser cannot scroll to the fortieth row of a
 * page that is one screen high. It clamps to the top, which is exactly the
 * complaint: open the tenth product, press back, and the catalogue starts
 * again from the first.
 *
 * So the restore keeps asking while the page is still too short, rather than
 * trying a fixed number of times and giving up. It ends the moment it lands,
 * the moment the page is tall enough but the scroll went elsewhere (something
 * else owns the position - do not fight it), or when the deadline passes on a
 * screen whose content never arrived.
 *
 * The caller stops it as well as soon as SHE scrolls. Being dragged away from
 * what you are reading is worse than starting at the top.
 */
export const RESTORE_WINDOW_MS = 6000
export const RESTORE_TICK_MS = 100

/** Close enough: sub-pixel layout means an exact match never arrives. */
const NEAR = 2

export interface ScrollHost {
  /** Where the page is now. */
  y: () => number
  /** The furthest it can go: content height minus one screen. */
  max: () => number
  to: (y: number) => void
}

export const browserScroll: ScrollHost = {
  y: () => window.scrollY,
  max: () => Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
  to: (y) => window.scrollTo(0, y),
}

export function landed(target: number, y: number): boolean {
  return Math.abs(y - target) <= NEAR
}

/** Is there enough page under her for that position to exist yet? */
export function reachable(target: number, max: number): boolean {
  return max + NEAR >= target
}

/**
 * One attempt. `waiting` means the page is still too short - ask again when
 * more of it has arrived.
 */
export function makeRestorer(
  target: number,
  host: ScrollHost = browserScroll,
): { tick: () => 'done' | 'waiting' } {
  return {
    tick() {
      if (landed(target, host.y())) return 'done'
      // Clamped by the browser while the page is short, which is not a
      // failure: it keeps her as close as the content allows, and the next
      // tick carries her the rest of the way once the list renders.
      host.to(target)
      if (landed(target, host.y())) return 'done'
      return reachable(target, host.max()) ? 'done' : 'waiting'
    },
  }
}
