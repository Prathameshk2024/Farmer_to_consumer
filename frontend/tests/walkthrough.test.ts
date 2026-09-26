import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SEEN_KEY, TOURS, TOUR_MENU, markTourSeen, seenTours, shouldMarkSeen, wantsTour,
} from '../src/lib/tours.js'
import { dictionaries } from '../src/i18n/strings.js'

/**
 * A walkthrough shows itself the first time she opens a screen and then gets
 * out of the way. The flag is what makes that true, so these are about the
 * flag: it survives, it is written once, and a corrupt row teaches her the
 * app again rather than crashing every screen she opens.
 */

function fakeStore() {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    raw: () => m.get(SEEN_KEY),
  }
}

test('a finished tour is remembered, and never written twice', () => {
  const store = fakeStore()
  assert.deepEqual(seenTours(store), [])

  markTourSeen(store, 'seller.business')
  markTourSeen(store, 'seller.business')
  markTourSeen(store, 'shop.cart')

  assert.deepEqual(seenTours(store), ['seller.business', 'shop.cart'])
})

/** A hand-edited row must not lock her out of every screen in the app. */
test('an unreadable flag means nothing has been seen, not a crash', () => {
  const store = fakeStore()
  store.setItem(SEEN_KEY, '{oops')
  assert.deepEqual(seenTours(store), [])

  store.setItem(SEEN_KEY, '"seller.help"')
  assert.deepEqual(seenTours(store), [])
})

/**
 * The Help & Training list is the only way back into a walkthrough she has
 * already dismissed, so every tab it offers has to lead somewhere real.
 */
test('every tour offered in Help & Training exists', () => {
  for (const role of ['seller', 'customer'] as const) {
    assert.equal(TOUR_MENU[role].length, 4, `${role} has four bottom tabs`)
    for (const { id, label } of TOUR_MENU[role]) {
      assert.ok(TOURS[id]?.length, `${id} has no steps`)
      assert.ok(label in dictionaries.mr, `${label} is not in the dictionary`)
    }
  }
})

/** A missing key renders as its own name, in the middle of a lesson. */
test('every walkthrough step reads from both dictionaries', () => {
  const missing: string[] = []
  for (const [id, steps] of Object.entries(TOURS)) {
    for (const s of steps) {
      for (const key of [s.title, s.body]) {
        if (!(key in dictionaries.mr) || !(key in dictionaries.en)) missing.push(`${id}: ${key}`)
      }
    }
  }
  assert.deepEqual(missing, [])
})

/**
 * The point of the whole feature: the ring goes around a control that is
 * really on the screen. A selector that names nothing in the source is a step
 * pointing at a control we deleted.
 */
test('every step targets a control the app actually renders', async () => {
  const { readdirSync, readFileSync, statSync } = await import('node:fs')
  const { join } = await import('node:path')

  const files: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) walk(p)
      else if (p.endsWith('.tsx')) files.push(p)
    }
  }
  walk(join(import.meta.dirname, '..', 'src'))
  const src = files.map((f) => readFileSync(f, 'utf8')).join('\n')

  /* A selector is one or more parts - `[data-wt="cart-list"] .stepper` - and
     every part has to be something a component really renders. */
  const rendered = (part: string): boolean => {
    const attr = part.match(/^\[data-wt="([^"]+)"\]$/)
    if (attr) return src.includes(`data-wt="${attr[1]}"`)
    if (part.startsWith('.')) return src.includes(part.slice(1))
    // A bare tag name, e.g. the `button` inside a tagged grid.
    return /^[a-z]+$/.test(part)
  }

  const orphans: string[] = []
  for (const [id, steps] of Object.entries(TOURS)) {
    for (const { sel } of steps) {
      if (!sel) continue
      const missing = sel.split(/\s+/).filter((part) => !rendered(part))
      if (missing.length) orphans.push(`${id}: ${sel} (${missing.join(', ')})`)
    }
  }
  assert.deepEqual(orphans, [], 'these steps ring nothing')
})

/* ------------------------------------------------------------------ */
/* What each customer tour points at                                   */
/* ------------------------------------------------------------------ */

/**
 * The Categories screen holds one kind of thing - the type tiles - and the
 * walkthrough used to spend its second step ringing the bottom nav, so a woman
 * asking "what is this screen?" was shown the cart instead of an answer.
 */
test('the categories walkthrough stays on the categories', () => {
  const strays = TOURS['shop.categories']
    .filter((s) => !s.sel?.startsWith('[data-wt="cat-grid"]'))
    .map((s) => s.sel ?? '(no target)')

  assert.deepEqual(strays, [], 'these steps point somewhere else on the screen')
})

/**
 * An empty cart has no quantity buttons and no checkout bar, so the tour found
 * nothing and said nothing - which leaves a first-time shopper looking at an
 * empty basket with no idea that products come first. It now has a step for
 * exactly that screen.
 */
test('an empty cart is explained rather than skipped', () => {
  const empty = TOURS['shop.cart'].find((s) => s.sel?.includes('cart-empty'))

  assert.ok(empty, 'the empty cart has a step of its own')
  assert.equal(empty!.provisional, true, 'it is not the real cart walkthrough')
})

/**
 * And seeing it must NOT burn the real one: she reads "choose products first",
 * comes back with three jars of pickle, and still gets taught the + / − buttons
 * and the checkout bar.
 */
test('the empty-cart step alone does not count as having seen the tour', () => {
  const provisionalOnly = TOURS['shop.cart'].filter((s) => s.provisional)
  const withRealSteps = TOURS['shop.cart'].filter((s) => !s.provisional)

  assert.equal(shouldMarkSeen(provisionalOnly), false)
  assert.equal(shouldMarkSeen(withRealSteps), true)
})

/* ------------------------------------------------------------------ */
/* Deciding to open                                                    */
/* ------------------------------------------------------------------ */

/**
 * Replaying from Help & Training stopped working the moment the tour had to
 * wait for the screen to load.
 *
 * The replay arrives as route state, and that state is cleared immediately so
 * a Back press does not start the tour over. Clearing it re-ran the decision -
 * this time with no replay and a tour already marked seen - which cancelled
 * the open that was still looking for the controls. She tapped "Categories",
 * landed on the real page, and nothing happened.
 *
 * So the intent survives the state that carried it.
 */

test('a replay opens the tour even when it has been seen before', () => {
  assert.equal(wantsTour({ replay: true, seen: true, already: false }), true)
})

test('clearing the route state does not cancel a replay already asked for', () => {
  assert.equal(wantsTour({ replay: false, seen: true, already: true }), true)
})

test('a tour she has seen does not open itself again', () => {
  assert.equal(wantsTour({ replay: false, seen: true, already: false }), false)
})

test('a tour she has never seen opens on its own', () => {
  assert.equal(wantsTour({ replay: false, seen: false, already: false }), true)
})
