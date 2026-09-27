import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { ProductStatus } from '@shared/types.js'
import { farmerMayDelete, slotInfo } from '@shared/farmer.js'

/**
 * ONE LISTING, ONE SLOT - AND ONLY AN ADMIN GIVES ONE BACK.
 *
 * A submitted listing keeps its slot while it waits, while it is live and
 * while it is paused. The slot returns when an admin rejects it or takes it
 * down, which deletes the row: five slots, three sent in, the third refused,
 * leaves three free.
 */
const pack = { packsApproved: 1 }
const listings = (...statuses: ProductStatus[]) => statuses.map((status) => ({ status }))

test('waiting, live and paused listings each hold a slot', () => {
  const slots = slotInfo(pack, listings('PENDING', 'LIVE', 'PAUSED'))
  assert.equal(slots.used, 3)
  assert.equal(slots.left, 2)
})

test('a rejection gives the slot back the moment the row goes', () => {
  const before = slotInfo(pack, listings('LIVE', 'LIVE', 'PENDING'))
  const after = slotInfo(pack, listings('LIVE', 'LIVE'))
  assert.equal(before.left, 2)
  assert.equal(after.left, 3)
})

test('a full pack reads as full, and a take-down frees exactly one', () => {
  assert.equal(slotInfo(pack, listings('LIVE', 'LIVE', 'LIVE', 'LIVE', 'LIVE')).isFull, true)
  const takenDown = slotInfo(pack, listings('LIVE', 'LIVE', 'LIVE', 'LIVE'))
  assert.equal(takenDown.isFull, false)
  assert.equal(takenDown.left, 1)
  assert.equal(takenDown.almostFull, true)
})

test('a draft holds no slot', () => {
  assert.equal(slotInfo(pack, listings('DRAFT', 'DRAFT')).used, 0)
})

/**
 * Verification is the account gate now, not payment, so a verified farmer
 * with no packs reaches the slot gate. Zero packs has to read as no room -
 * the reference's `total > 0 &&` made it read as unlimited room.
 */
test('no packs means no room, not unlimited room', () => {
  const none = slotInfo({ packsApproved: 0 }, [])
  assert.equal(none.total, 0)
  assert.equal(none.isFull, true)
  assert.equal(slotInfo({ packsApproved: undefined }, []).isFull, true, 'a row from before the field existed')
})

test('a farmer may delete a draft and nothing they have sent in', () => {
  // A draft holds no slot and nobody else has seen it. Anything past that
  // would free a slot, and freeing slots is the admin's decision.
  assert.equal(farmerMayDelete('DRAFT'), true)
  for (const s of ['PENDING', 'LIVE', 'PAUSED'] as const) {
    assert.equal(farmerMayDelete(s), false, `${s} must not be deletable by the farmer`)
  }
})
