/**
 * THE LAST ANSWER A SCREEN GOT, SO COMING BACK SHOWS THE SCREEN SHE LEFT.
 *
 * Every screen fetches its own data, so pressing Back used to mean: spinner,
 * then the list, then a jump down to where she had been reading. Three frames
 * to arrive somewhere she never left. Keeping the previous answer means the
 * list is on screen in the first frame, at its full height, and the scroll
 * goes back before the browser paints - so Back looks like nothing happened,
 * which is what Back is.
 *
 * It is a cache for the NEXT paint, not a data store: every screen still
 * fetches on mount and replaces this the moment the server answers. Nothing
 * is written to disk - stale prices must not outlive the tab.
 *
 * Cleared on the way out of a session. On a field coordinator's phone, where
 * one handset signs in as seller after seller, a cached "my products" from
 * the previous woman is somebody else's shop.
 */
const answers = new Map<string, unknown>()

/** Enough for the screens one browsing session touches, and no more. */
const LIMIT = 40

export function readCache<T>(key: string): T | undefined {
  return answers.get(key) as T | undefined
}

export function writeCache<T>(key: string, data: T): void {
  // Oldest out first: a Map keeps insertion order, and re-writing a key moves
  // it to the end, so the entries she keeps returning to are the ones kept.
  answers.delete(key)
  answers.set(key, data)
  if (answers.size > LIMIT) answers.delete(answers.keys().next().value!)
}

/**
 * Forget one screen's last answer. Used when its refetch fails: what is on
 * screen stays (blanking a list she is reading helps nobody), but the next
 * visit starts from the server rather than from an answer we already know is
 * questionable - a product taken down, a session that has gone.
 */
export function dropCache(key: string): void {
  answers.delete(key)
}

export function clearScreenCache(): void {
  answers.clear()
}

/**
 * WHICH SCREEN AN ANSWER BELONGS TO.
 *
 * Product A and product B are the same component at two addresses: tapping a
 * card under "More from this shop" changes the id and React keeps the screen.
 * An answer is therefore only good for the id it was fetched for, and every
 * frame asks whether the answer it holds is still that one. Without the
 * question, A's page - photo, price and Add button - stood at B's address
 * until B arrived, and Add put A in the cart.
 */
export function screenIdentity(deps: unknown[], cacheKey?: string): string {
  return JSON.stringify([cacheKey ?? null, ...deps])
}

export interface Shown<T> {
  /** The `screenIdentity` this data was fetched for. */
  for: string
  data: T | null
  /** True only while there is nothing to show - never "a refetch is in flight". */
  loading: boolean
}

/** A screen arriving: its last answer if it has one, otherwise the spinner. */
export function openScreen<T>(identity: string, cacheKey?: string): Shown<T> {
  const kept = cacheKey ? readCache<T>(cacheKey) : undefined
  return kept === undefined
    ? { for: identity, data: null, loading: true }
    : { for: identity, data: kept, loading: false }
}

/**
 * What to draw this frame. The same screen keeps what it holds, so a refetch
 * never collapses a tall list into a spinner; a different screen never shows
 * the previous one's data, not even for the frame before an effect runs.
 */
export function shownFor<T>(state: Shown<T>, identity: string, cacheKey?: string): Shown<T> {
  return state.for === identity ? state : openScreen<T>(identity, cacheKey)
}
