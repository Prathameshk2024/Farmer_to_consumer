import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.SESSION_SECRET = 'test-secret-for-unit-tests'
const { mapPins } = await import('../src/routes/catalog.routes.js')
const { emptyDb } = await import('../src/db/seed.js')

test('only verified farmers with produce on sale, and only with consent, rounded', () => {
  const db = emptyDb()
  const f = (id: string, status: string, consent: boolean) => ({
    id, status, isOpen: true, name: id, village: 'अणदूर', crops: ['onion'],
    lat: 17.99364, lng: 76.23361, locationConsent: consent }) as never
  db.farmers.push(f('a', 'ACTIVE', true), f('b', 'ACTIVE', false), f('c', 'PENDING_VERIFICATION', true), f('d', 'ACTIVE', true))
  const p = (id: string, farmerId: string) => ({ id, farmerId, status: 'LIVE', categoryId: 'vegetables' }) as never
  db.products.push(p('p1', 'a'), p('p2', 'b'), p('p3', 'c'))
  const pins = mapPins(db, undefined)
  assert.deepEqual(pins.map((x) => x.farmerId), ['a'], 'b refused, c unverified, d has nothing on sale')
  assert.equal(pins[0].lat, 17.99)
  assert.equal(pins[0].liveCount, 1)
})
