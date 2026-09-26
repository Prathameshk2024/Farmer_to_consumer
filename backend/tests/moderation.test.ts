import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Product, Seller } from '@shared/types.js'
import { normalizeLegacyRows } from '../src/db/moderation.js'

/**
 * Rows stored under the old queue-and-pay rules are brought into the new
 * statuses at boot: a waiting listing goes live, a refused or archived one is
 * removed with its photo, and an unpaid seller waits for verification.
 */
test('legacy statuses are normalised in place', () => {
  const products = [
    { id: 'pending', status: 'PENDING' },
    { id: 'rejected', status: 'REJECTED', imagePublicId: 'img/r' },
    { id: 'archived', status: 'ARCHIVED' },
    { id: 'live', status: 'LIVE' },
  ] as unknown as Product[]
  const sellers = [
    { id: 'a', status: 'REGISTERED' },
    { id: 'b', status: 'PAYMENT_SUBMITTED' },
    { id: 'c', status: 'PAYMENT_REJECTED' },
    { id: 'd', status: 'BLOCKED' },
    { id: 'e', status: 'ACTIVE' },
    { id: 'f', status: 'ACTIVE', verifiedAt: '2026-01-01T00:00:00.000Z', verifiedBy: 'admin' },
  ] as unknown as Seller[]
  const destroyed: (string | undefined)[] = []

  assert.equal(normalizeLegacyRows({ products, sellers }, (id) => destroyed.push(id)), 7)
  assert.deepEqual(products.map((p) => [p.id, p.status]), [['pending', 'LIVE'], ['live', 'LIVE']])
  assert.deepEqual(destroyed, [undefined, 'img/r'])
  assert.deepEqual(sellers.map((s) => s.status),
    ['PENDING_VERIFICATION', 'PENDING_VERIFICATION', 'PENDING_VERIFICATION', 'BLOCKED', 'ACTIVE', 'ACTIVE'])
  assert.equal(sellers[4]!.verifiedBy, 'legacy', 'an ACTIVE seller from before verification counts as verified')
  assert.ok(sellers[4]!.verifiedAt)
  assert.equal(sellers[5]!.verifiedBy, 'admin', 'a real verification is left as it was')
  assert.equal(normalizeLegacyRows({ products, sellers }, () => {}), 0, 'and a clean db is left alone')
})
