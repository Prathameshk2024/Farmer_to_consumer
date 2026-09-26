import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CATEGORIES } from '../src/db/seed.js'

/**
 * THE ESCAPE HATCH.
 *
 * Twelve categories cannot name everything a village makes, and a woman whose
 * product is not on the list had two ways out: file it under something it is
 * not, or stop. The first poisons the category filter for every buyer looking
 * for pickle; the second loses the seller.
 *
 * `other` is the answer, and what makes it work is that it has **no** `food`
 * flag. Both wizard screens filter the list by the food question she has
 * already answered, and a category with no flag passes both filters. Give it
 * `food: true` and every woman selling cloth loses her escape hatch; give it
 * `food: false` and every woman selling food does.
 */

test('there is a category for everything the list forgot', () => {
  const other = CATEGORIES.find((c) => c.id === 'other')
  assert.ok(other, 'a seller whose product is not listed needs somewhere to put it')
  assert.equal(other.food, undefined, 'no food flag, so it shows in both halves of the wizard')
})

test('it is offered last, after every category that names something', () => {
  assert.equal(CATEGORIES[CATEGORIES.length - 1]?.id, 'other')
})

/**
 * Exactly one. A second unflagged category would appear under both questions
 * without anybody having decided that it should.
 */
test('only the escape hatch is unflagged', () => {
  const unflagged = CATEGORIES.filter((c) => c.food === undefined)
  assert.deepEqual(unflagged.map((c) => c.id), ['other'])
})

test('every category is named in both languages and has an icon', () => {
  for (const c of CATEGORIES) {
    assert.ok(c.mr.trim(), `${c.id} has no Marathi name`)
    assert.ok(c.en.trim(), `${c.id} has no English name`)
    assert.ok(c.icon.trim(), `${c.id} has no icon`)
  }
})

/** Ids reach the database on every product, so a duplicate is a silent merge. */
test('ids are unique', () => {
  const ids = CATEGORIES.map((c) => c.id)
  assert.equal(new Set(ids).size, ids.length)
})
