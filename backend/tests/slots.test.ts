import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { ProductStatus } from '@shared/types.js'
import { sellerMayDelete, slotInfo } from '@shared/seller.js'

/**
 * ONE PRODUCT, ONE SLOT - AND ONLY AN ADMIN GIVES ONE BACK.
 *
 * A seller used to be able to delete a listing, which freed its slot, which
 * made a pack of five a pack of as many products as she cared to rotate
 * through. Now a submitted listing keeps its slot while it waits, while it is
 * live and while it is paused. The slot returns when an admin rejects it or
 * takes it down, at that moment - not when the rejected row is swept 48 hours
 * later.
 */

const pack = { packsApproved: 1 }
const listings = (...statuses: ProductStatus[]) => statuses.map((status) => ({ status }))

test('waiting, live and paused listings each hold a slot', () => {
  const slots = slotInfo(pack, listings('PENDING', 'LIVE', 'PAUSED'))
  assert.equal(slots.used, 3)
  assert.equal(slots.left, 2)
})

test('a rejection gives the slot back the moment it is made', () => {
  // Five slots, three listings sent in, the third refused by the admin: she
  // is using two and may send in three more.
  const before = slotInfo(pack, listings('LIVE', 'LIVE', 'PENDING'))
  const after = slotInfo(pack, listings('LIVE', 'LIVE', 'REJECTED'))
  assert.equal(before.left, 2)
  assert.equal(after.used, 2)
  assert.equal(after.left, 3)
})

test('a live listing the admin takes down frees its slot the same way', () => {
  // Taking down is a rejection of a listing that was already live.
  const full = slotInfo(pack, listings('LIVE', 'LIVE', 'LIVE', 'LIVE', 'LIVE'))
  const takenDown = slotInfo(pack, listings('LIVE', 'LIVE', 'LIVE', 'LIVE', 'REJECTED'))
  assert.equal(full.isFull, true)
  assert.equal(takenDown.isFull, false)
  assert.equal(takenDown.left, 1)
})

test('a draft holds no slot', () => {
  assert.equal(slotInfo(pack, listings('DRAFT', 'DRAFT')).used, 0)
})

test('a seller may delete a draft and nothing she has sent in', () => {
  // A draft holds no slot and nobody else has seen it. Anything past that
  // would free a slot, and freeing slots is the admin's decision.
  assert.equal(sellerMayDelete('DRAFT'), true)
  for (const s of ['PENDING', 'LIVE', 'PAUSED', 'REJECTED'] as const) {
    assert.equal(sellerMayDelete(s), false, `${s} must not be deletable by her`)
  }
})
