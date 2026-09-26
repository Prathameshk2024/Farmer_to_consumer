import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  forgetScroll, landed, makeRestorer, reachable, recallScroll, rememberScroll,
  type ScrollHost,
} from '../src/lib/scrollMemory.js'

/**
 * WHERE SHE WAS READING.
 *
 * Every route change used to run `window.scrollTo(0, 0)`, which is right going
 * forward - a product page opens at the top - and wrong coming back: she
 * scrolls a long way down the catalogue, opens the tenth product, presses
 * back, and the list has forgotten her. On a phone that is thirty swipes to
 * return to where she was, so she stops browsing deep at all.
 *
 * The position is kept per history entry, because the same path visited twice
 * is two different places she was reading.
 */

test('a position comes back for the entry that saved it', () => {
  rememberScroll('k1', 1200)
  assert.equal(recallScroll('k1'), 1200)
})

test('an entry nobody has scrolled starts at the top', () => {
  assert.equal(recallScroll('never-seen'), 0)
})

/** Two visits to the same screen are two places, not one. */
test('each history entry remembers its own position', () => {
  rememberScroll('k2', 400)
  rememberScroll('k3', 900)

  assert.equal(recallScroll('k2'), 400)
  assert.equal(recallScroll('k3'), 900)
})

test('scrolling again overwrites the old position', () => {
  rememberScroll('k4', 300)
  rememberScroll('k4', 800)

  assert.equal(recallScroll('k4'), 800)
})

/**
 * The map lives for the life of the tab and nothing prunes it, so an entry is
 * dropped when its screen is done with - otherwise a long session browsing a
 * catalogue accumulates a row per product opened.
 */
test('an entry can be forgotten', () => {
  rememberScroll('k5', 500)
  forgetScroll('k5')

  assert.equal(recallScroll('k5'), 0)
})

/* ------------------------------------------------------------------ */
/* Getting her back there                                              */
/* ------------------------------------------------------------------ */

/**
 * A FAKE PAGE THAT GROWS, BECAUSE THE REAL ONE DOES.
 *
 * She comes back to the catalogue and for a moment it is a spinner one screen
 * tall: the browser cannot scroll to the fortieth row of a page that short, so
 * it clamps her to the top. That clamp IS the bug people report as "back
 * always goes to the first product". The restore has to wait for the list -
 * and then for the photographs, which change the height a second time.
 */
function fakePage(height: number): ScrollHost & { grow: (to: number) => void } {
  let max = height
  let y = 0
  return {
    y: () => y,
    max: () => max,
    to: (next) => { y = Math.min(next, max) },   // the browser's own clamp
    grow: (to) => { max = to },
  }
}

test('a spinner-tall page is not failure, it is not ready yet', () => {
  const page = fakePage(0)
  const restorer = makeRestorer(1800, page)

  assert.equal(restorer.tick(), 'waiting')
  assert.equal(page.y(), 0, 'nowhere to go yet, and it did not pretend otherwise')
})

test('the restore lands once the list has rendered', () => {
  const page = fakePage(0)
  const restorer = makeRestorer(1800, page)

  assert.equal(restorer.tick(), 'waiting')   // still fetching
  page.grow(2400)                            // the products arrive
  assert.equal(restorer.tick(), 'done')
  assert.equal(page.y(), 1800, 'exactly where she was reading')
})

/**
 * The photographs land after the rows do. Until the page is tall enough the
 * restore keeps her as far down as it can and carries her the rest of the way
 * afterwards, rather than leaving her at the top.
 */
test('it keeps her as close as the page allows while it is still growing', () => {
  const page = fakePage(900)
  const restorer = makeRestorer(3000, page)

  assert.equal(restorer.tick(), 'waiting')
  assert.equal(page.y(), 900, 'as far as this page goes, for now')

  page.grow(3600)
  assert.equal(restorer.tick(), 'done')
  assert.equal(page.y(), 3000)
})

/**
 * A screen that is done growing and still refuses the position is a screen
 * where something else owns the scroll - a dialog, a focused input. Asking
 * again for six seconds would be a fight, and she would lose it either way.
 */
test('it stops once the page is tall enough, whatever came of it', () => {
  const page = fakePage(5000)
  const restorer = makeRestorer(1200, page)
  assert.equal(restorer.tick(), 'done')
})

test('a position already restored asks for nothing', () => {
  const page = fakePage(5000)
  page.to(1200)
  let moved = 0
  const watched: ScrollHost = { ...page, to: (y) => { moved++; page.to(y) } }

  assert.equal(makeRestorer(1200, watched).tick(), 'done')
  assert.equal(moved, 0, 'no scroll at all: she is already there')
})

/** Sub-pixel layout means an exact match never arrives on a real phone. */
test('near enough is where she was', () => {
  assert.equal(landed(1800, 1799), true)
  assert.equal(landed(1800, 1780), false)
  assert.equal(reachable(1800, 1799), true)
  assert.equal(reachable(1800, 400), false)
})
