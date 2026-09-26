import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Farmer } from '@shared/types.js'
import { NOTICE_LIMIT, appendNotice } from '../src/db/notices.js'

/**
 * An admin verifies a farmer and their produce goes on sale. Nothing tells them unless
 * the decision is written down as it is made, because afterwards there is
 * nothing to reconstruct it from - `status` is simply a different word.
 */

function farmer(over: Partial<Farmer> = {}): Farmer {
  return { id: 's1', ...over } as Farmer
}

test('a decision is recorded as it is made', () => {
  const s = farmer()
  appendNotice(s, 'VERIFIED', {}, '2026-09-08T10:00:00.000Z')

  assert.deepEqual(s.notices, [{
    id: 'VERIFIED:2026-09-08T10:00:00.000Z',
    at: '2026-09-08T10:00:00.000Z',
    kind: 'VERIFIED',
  }])
})

/** The farmer reads them newest-first, but they are appended, so order matters. */
test('decisions accumulate in the order they were made', () => {
  const s = farmer()
  appendNotice(s, 'VERIFIED', {}, '2026-09-01T00:00:00.000Z')
  appendNotice(s, 'BLOCKED', { note: 'Wrong photos' }, '2026-09-02T00:00:00.000Z')

  assert.deepEqual(s.notices?.map((n) => n.kind), ['VERIFIED', 'BLOCKED'])
  assert.equal(s.notices?.[1]?.note, 'Wrong photos')
})

/**
 * This list travels inside the farmer document on every read they make, so it
 * is not allowed to grow forever - the oldest go first.
 */
test('the trail is trimmed to the newest few', () => {
  const s = farmer()
  for (let i = 0; i < NOTICE_LIMIT + 5; i++) {
    appendNotice(s, 'PRODUCT_REJECTED', { n: i }, `2026-09-08T10:00:${String(i).padStart(2, '0')}.000Z`)
  }

  assert.equal(s.notices?.length, NOTICE_LIMIT)
  assert.equal(s.notices?.[0]?.n, 5, 'the first five were dropped')
  assert.equal(s.notices?.at(-1)?.n, NOTICE_LIMIT + 4)
})
