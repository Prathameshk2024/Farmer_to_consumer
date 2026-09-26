import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Seller } from '@shared/types.js'
import { NOTICE_LIMIT, appendNotice, onNotice } from '../src/db/notices.js'

/**
 * An admin approves her ₹50 and five slots appear. Nothing told her: she had
 * to notice the meter herself, having been promised a message. The decision
 * has to be written down as it is made, because afterwards there is nothing to
 * reconstruct it from - `packsApproved` is a number that is simply larger.
 */

function seller(over: Partial<Seller> = {}): Seller {
  return { id: 's1', packsApproved: 0, ...over } as Seller
}

test('a decision is recorded with its number, in slots', () => {
  const s = seller()
  appendNotice(s, 'SLOTS_GRANTED', { n: 5 }, '2026-09-08T10:00:00.000Z')

  assert.deepEqual(s.notices, [{
    id: 'SLOTS_GRANTED:2026-09-08T10:00:00.000Z',
    at: '2026-09-08T10:00:00.000Z',
    kind: 'SLOTS_GRANTED',
    n: 5,
  }])
})

/** She reads them newest-first, but they are appended, so order matters. */
test('decisions accumulate in the order they were made', () => {
  const s = seller()
  appendNotice(s, 'PAYMENT_APPROVED', { n: 5 }, '2026-09-01T00:00:00.000Z')
  appendNotice(s, 'BLOCKED', { note: 'Wrong photos' }, '2026-09-02T00:00:00.000Z')

  assert.deepEqual(s.notices?.map((n) => n.kind), ['PAYMENT_APPROVED', 'BLOCKED'])
  assert.equal(s.notices?.[1]?.note, 'Wrong photos')
})

/**
 * This list travels inside her seller document on every read she makes, so it
 * is not allowed to grow forever - the oldest go first.
 */
test('the trail is trimmed to the newest few', () => {
  const s = seller()
  for (let i = 0; i < NOTICE_LIMIT + 5; i++) {
    appendNotice(s, 'SLOTS_GRANTED', { n: i }, `2026-09-08T10:00:${String(i).padStart(2, '0')}.000Z`)
  }

  assert.equal(s.notices?.length, NOTICE_LIMIT)
  assert.equal(s.notices?.[0]?.n, 5, 'the first five were dropped')
  assert.equal(s.notices?.at(-1)?.n, NOTICE_LIMIT + 4)
})

/**
 * The phone notification rides on the same moment the notice is written, so
 * no admin handler can record a decision and forget to tell her.
 */
test('every appended notice is handed to the listener', () => {
  const heard: string[] = []
  onNotice((_seller, notice) => heard.push(notice.kind))
  appendNotice({ id: 's1', notices: [] } as unknown as Seller, 'SLOTS_GRANTED', { n: 5 })
  onNotice(null)
  assert.deepEqual(heard, ['SLOTS_GRANTED'])
})

test('a listener that throws does not stop the notice being written', () => {
  onNotice(() => { throw new Error('boom') })
  const seller = { id: 's1', notices: [] } as unknown as Seller
  appendNotice(seller, 'UNBLOCKED')
  onNotice(null)
  assert.equal(seller.notices?.length, 1)
})
