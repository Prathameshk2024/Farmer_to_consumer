import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CROPS } from '@shared/crops.js'
import { CATEGORIES, isCategoryId } from '../src/db/seed.js'

/**
 * THE ESCAPE HATCH. No list names every crop a farmer grows; `other` is where
 * the rest goes, and it is offered after every category that names something.
 */
test('there is a category for everything the list forgot, and it sorts last', () => {
  assert.equal(CATEGORIES[CATEGORIES.length - 1]?.id, 'other')
})

test('the eight produce categories', () => {
  assert.deepEqual(
    CATEGORIES.map((c) => c.id),
    ['vegetables', 'leafy', 'fruits', 'grains', 'pulses', 'spices', 'processed', 'other'],
  )
})

/** The server derives a listing's category from its crop, so every crop must land in one. */
test('every crop belongs to a known category', () => {
  for (const crop of CROPS) assert.ok(isCategoryId(crop.categoryId), `${crop.id} -> ${crop.categoryId}`)
  assert.equal(isCategoryId('pickle'), false)
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
