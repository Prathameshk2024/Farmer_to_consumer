import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Product, Farmer } from '@shared/types.js'
import { normalizeLegacyRows } from '../src/db/moderation.js'

/**
 * Rows stored under removed rules are brought into the current statuses at
 * boot: a refused or archived listing is removed with its photo, and an
 * unpaid farmer waits for verification. A waiting listing is a real queue
 * entry again - an admin publishes it - so it is left exactly as it is.
 */
test('legacy statuses are normalised in place', () => {
  const products = [
    { id: 'pending', status: 'PENDING' },
    { id: 'rejected', status: 'REJECTED', imagePublicId: 'img/r' },
    { id: 'archived', status: 'ARCHIVED' },
    { id: 'live', status: 'LIVE' },
  ] as unknown as Product[]
  const farmers = [
    { id: 'a', status: 'REGISTERED' },
    { id: 'b', status: 'PAYMENT_SUBMITTED' },
    { id: 'c', status: 'PAYMENT_REJECTED' },
    { id: 'd', status: 'BLOCKED' },
    { id: 'e', status: 'ACTIVE' },
    { id: 'f', status: 'ACTIVE', verifiedAt: '2026-01-01T00:00:00.000Z', verifiedBy: 'admin' },
  ] as unknown as Farmer[]
  const destroyed: (string | undefined)[] = []

  assert.equal(normalizeLegacyRows({ products, farmers }, (id) => destroyed.push(id)), 6)
  assert.deepEqual(products.map((p) => [p.id, p.status]), [['pending', 'PENDING'], ['live', 'LIVE']])
  assert.deepEqual(destroyed, [undefined, 'img/r'])
  assert.deepEqual(farmers.map((s) => s.status),
    ['PENDING_VERIFICATION', 'PENDING_VERIFICATION', 'PENDING_VERIFICATION', 'BLOCKED', 'ACTIVE', 'ACTIVE'])
  assert.equal(farmers[4]!.verifiedBy, 'legacy', 'an ACTIVE farmer from before verification counts as verified')
  assert.ok(farmers[4]!.verifiedAt)
  assert.equal(farmers[5]!.verifiedBy, 'admin', 'a real verification is left as it was')
  assert.equal(normalizeLegacyRows({ products, farmers }, () => {}), 0, 'and a clean db is left alone')
})
