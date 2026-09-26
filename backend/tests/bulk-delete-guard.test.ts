import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.SESSION_SECRET = 'test-secret-for-unit-tests'

const { isBulkDelete } = await import('../src/db/firestore.js')

/**
 * THE DAY EVERY SELLER DISAPPEARED
 * ================================
 * 10 September 2026: six registered women and thirteen product listings were
 * deleted from Firestore in a single batch. Something handed `persistDiff` an
 * in-memory database whose `sellers` and `products` arrays were empty, and the
 * diff did precisely what it is written to do - anything present at boot and
 * absent from memory is a deletion.
 *
 * They came back only because Firestore keeps one hour of version history even
 * when point-in-time recovery is off. One hour later there would have been
 * nothing left to recover, and six women would have been told to register
 * again from scratch.
 *
 * The guard does not try to work out WHY a collection emptied. It refuses on
 * the shape of the write alone: no single persist may remove more than half of
 * a collection. That is a rule the application never legitimately breaks, and
 * it does not need to understand the bug to stop it.
 */

test('the exact write that wiped the sellers is refused', () => {
  // 6 of 6 sellers, and 13 of 13 products. What actually happened.
  assert.equal(isBulkDelete(6, 6), true)
  assert.equal(isBulkDelete(13, 13), true)
})

test('an emptied collection is refused however large', () => {
  assert.equal(isBulkDelete(56, 56), true, 'every session')
  assert.equal(isBulkDelete(185, 185), true, 'the whole audit trail')
})

test('ordinary editing is untouched', () => {
  // A seller archives one product of twenty-four.
  assert.equal(isBulkDelete(1, 24), false)
  // A pruning job clears a third of the expired sessions.
  assert.equal(isBulkDelete(18, 56), false)
  // Nothing is being deleted at all, which is most writes.
  assert.equal(isBulkDelete(0, 40), false)
})

test('exactly half is allowed; more than half is not', () => {
  // The boundary is deliberate. Half of a collection going in one write is
  // survivable and plausible; the tipping point is where it stops being an edit
  // and starts being a wipe.
  assert.equal(isBulkDelete(5, 10), false)
  assert.equal(isBulkDelete(6, 10), true)
})

test('small collections stay clearable', () => {
  // Below six documents "half" is one or two, and clearing a handful of demo
  // rows is routine. Guarding there would only teach people to keep the
  // override switched on, which would cost more than it saved.
  assert.equal(isBulkDelete(3, 3), false, 'three seeded sellers')
  assert.equal(isBulkDelete(5, 5), false)
  assert.equal(isBulkDelete(6, 6), true, 'six is where it starts biting')
})
